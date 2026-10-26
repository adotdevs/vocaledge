const mongoose = require("mongoose");
const connectCRMDatabase = require("../config/crmDatabase");
const User = require("../models/userModel");
const getLeadModel = require("../crmDB/models/leadsModel");
const getActivityModel = require("../crmDB/models/activityModel");
const { hasCrmPermission } = require("./crmPermissions");
const UserRestriction = require("../models/usersRestrictions");
const { publishToUser } = require("./chatSse");

const REFILL_SIZE = 100;
const LOCK_MS = 20000;
const inflight = new Map();

const emptyResult = () => ({ batchId: "", leads: [], owner: null });

const autoAssignEnabled = async () => {
    const settings = await UserRestriction.findOne().select("autoAssignNewLeads").lean();
    return !settings || settings.autoAssignNewLeads !== false;
};

const userCanOpenCrm = (user) => {
    if (!user) return false;
    if (user.role === "admin") return user.adminPermissions?.accessCrm === true;
    if (user.role === "subadmin") return user.permissions?.accessCrm === true;
    return false;
};

const isNewStatus = (status) => {
    const label = String(status ?? "").trim().toLowerCase();
    return !label || label === "new";
};

const ownerIdOf = (agent) => {
    if (!agent) return "";
    if (typeof agent === "object" && agent.firstName !== undefined && agent._id) return String(agent._id);
    return String(agent);
};

let lockModelPromise = null;
const getLockModel = () => {
    if (!lockModelPromise) {
        lockModelPromise = connectCRMDatabase().then((crmDB) => {
            if (crmDB.models.LeadRefillLock) return crmDB.models.LeadRefillLock;
            const schema = new mongoose.Schema({
                _id: String,
                until: Date,
            }, { collection: "leadrefilllocks", versionKey: false });
            return crmDB.model("LeadRefillLock", schema);
        });
    }
    return lockModelPromise;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const acquireLock = async (id) => {
    const Lock = await getLockModel();
    const until = new Date(Date.now() + LOCK_MS);
    for (let attempt = 0; attempt < 40; attempt += 1) {
        const taken = await Lock.findOneAndUpdate(
            { _id: id, until: { $lte: new Date() } },
            { $set: { until } },
            { new: true }
        );
        if (taken) return true;
        try {
            await Lock.create({ _id: id, until });
            return true;
        } catch (error) {
            if (error?.code !== 11000) throw error;
        }
        await sleep(25);
    }
    return false;
};

const releaseLock = async (id) => {
    const Lock = await getLockModel();
    await Lock.updateOne({ _id: id }, { $set: { until: new Date(0) } });
};

const hasOwnNewLead = async (Lead, userId) => {
    const count = await Lead.countDocuments({
        isDeleted: false,
        agent: userId,
        status: "New",
    });
    return count;
};

const poolFilter = async (Lead) => {
    const supers = await User.find({ role: "superadmin" }).select("_id").lean();
    const superIds = supers.map((item) => item._id);
    const rawAgents = await Lead.collection.distinct("agent", {
        status: "New",
        isDeleted: { $ne: true },
    });
    const objectIds = [];
    let hasBlank = false;
    rawAgents.forEach((agent) => {
        if (agent === "") {
            hasBlank = true;
            return;
        }
        if (agent === null || agent === undefined) return;
        if (mongoose.Types.ObjectId.isValid(agent)) objectIds.push(agent);
    });
    const existing = objectIds.length
        ? await User.find({ _id: { $in: objectIds } }).select("_id").lean()
        : [];
    const existingIds = new Set(existing.map((item) => String(item._id)));
    const orphanIds = objectIds.filter((id) => !existingIds.has(String(id)));
    const heldBy = [...superIds, ...orphanIds];
    return {
        isDeleted: false,
        status: "New",
        $or: [
            { agent: null },
            { agent: { $exists: false } },
            ...(hasBlank ? [{ agent: "" }] : []),
            ...(heldBy.length ? [{ agent: { $in: heldBy } }] : []),
        ],
    };
};

const readPool = async (Lead, pool, limit) => {
    const collection = Lead.collection;
    const available = await collection.countDocuments(pool);
    const picked = await collection.find(pool).project({ _id: 1 }).limit(limit).toArray();
    return { available, ids: picked.map((item) => item._id) };
};

const presentLead = (lead, viewer, owner) => {
    const copy = { ...lead };
    delete copy.refillBatch;
    delete copy.__v;
    if (!hasCrmPermission(viewer, "canViewLeadSource")) delete copy.source;
    if (!hasCrmPermission(viewer, "canViewLeadBrand")) delete copy.Brand;
    if (!hasCrmPermission(viewer, "canViewLeadFileName")) delete copy.fileName;
    copy.agent = {
        _id: owner._id,
        firstName: owner.firstName,
        lastName: owner.lastName,
        email: owner.email,
        role: owner.role,
    };
    copy.callSummary = null;
    return copy;
};

const recordAssignments = async (leads, owner) => {
    if (!leads.length) return;
    const Activity = await getActivityModel();
    const name = `${owner.firstName || ""} ${owner.lastName || ""}`.trim() || "Agent";
    await Activity.insertMany(leads.map((lead) => ({
        leadId: lead._id,
        type: "assignment_change",
        isSystemGenerated: true,
        createdBy: {
            userId: owner._id,
            userName: name,
            userRole: owner.role,
        },
        changes: {
            field: "agent",
            oldValue: "Unassigned",
            newValue: name,
            description: "Assigned automatically because New leads reached zero",
        },
    })), { ordered: false });
};

const claimNewLeads = async (owner) => {
    const userKey = `user:${owner._id}`;
    const lockedUser = await acquireLock(userKey);
    if (!lockedUser) return emptyResult();

    try {
        const Lead = await getLeadModel();
        const owned = await hasOwnNewLead(Lead, owner._id);
        if (owned > 0) {
            console.log(`Lead refill skipped: ${owner._id} still has ${owned} New leads`);
            return emptyResult();
        }

        const lockedPool = await acquireLock("pool");
        if (!lockedPool) return emptyResult();

        try {
            if (await hasOwnNewLead(Lead, owner._id)) return emptyResult();
            const pool = await poolFilter(Lead);
            const take = REFILL_SIZE;
            const { available, ids } = await readPool(Lead, pool, take);
            if (!available || !ids.length) {
                console.log(`Lead refill skipped: no New leads in the super admin pool for ${owner._id}`);
                return emptyResult();
            }
            const batchId = new mongoose.Types.ObjectId();
            const now = new Date();
            await Lead.updateMany(
                { _id: { $in: ids }, isDeleted: false },
                { $set: { agent: owner._id, updatedAt: now, createdAt: now } }
            );
            const leads = await Lead.find({ _id: { $in: ids }, agent: owner._id, isDeleted: false }).lean();
            if (!leads.length) return emptyResult();
            console.log(`Lead refill: assigned ${leads.length} New leads to ${owner._id}`);
            recordAssignments(leads, owner).catch((error) => {
                console.error("Lead refill activity log failed:", error);
            });

            const presented = leads.map((lead) => presentLead(lead, owner, owner));
            const payload = {
                batchId: String(batchId),
                leads: presented,
            };
            publishToUser(owner._id, "leads.refilled", payload);
            return { batchId: payload.batchId, leads, owner };
        } finally {
            await releaseLock("pool");
        }
    } finally {
        await releaseLock(userKey);
    }
};

const refillIfEmpty = (userId) => {
    const key = String(userId || "");
    if (!key) return Promise.resolve(emptyResult());
    if (inflight.has(key)) return inflight.get(key);

    const job = (async () => {
        if (!(await autoAssignEnabled())) {
            console.log("Lead refill skipped: automatic assignment is turned off");
            return emptyResult();
        }
        const owner = await User.findById(key).select("firstName lastName email role adminPermissions permissions").lean();
        if (!owner || (owner.role !== "admin" && owner.role !== "subadmin")) return emptyResult();
        if (!userCanOpenCrm(owner)) {
            console.log(`Lead refill skipped: ${key} does not have Open CRM`);
            return emptyResult();
        }
        const Lead = await getLeadModel();
        const owned = await hasOwnNewLead(Lead, key);
        if (owned > 0) {
            console.log(`Lead refill skipped: ${key} still has ${owned} New leads`);
            return emptyResult();
        }
        return claimNewLeads(owner);
    })().catch((error) => {
        console.error("Lead refill failed:", error);
        return emptyResult();
    }).finally(() => {
        inflight.delete(key);
    });

    inflight.set(key, job);
    return job;
};

const viewerCanSeeOwner = (viewer, owner) => {
    if (!viewer || !owner) return false;
    if (viewer.role === "superadmin") return true;
    if (String(viewer._id) === String(owner._id)) return true;
    return viewer.role === "admin"
        && owner.role === "subadmin"
        && hasCrmPermission(viewer, "canManageCrmLeads");
};

const refillOwners = async (userIds, viewer) => {
    const ids = [...new Set((userIds || []).map((id) => String(id || "")).filter(Boolean))];
    const visible = [];
    let batchId = "";

    for (const id of ids) {
        const result = await refillIfEmpty(id);
        if (!result.leads.length || !result.owner) continue;
        if (!batchId) batchId = result.batchId;
        if (!viewerCanSeeOwner(viewer, result.owner)) continue;
        result.leads.forEach((lead) => {
            visible.push(presentLead(lead, viewer, result.owner));
        });
        if (viewer && String(viewer._id) !== String(result.owner._id)) {
            publishToUser(viewer._id, "leads.refilled", {
                batchId: result.batchId,
                leads: result.leads.map((lead) => presentLead(lead, viewer, result.owner)),
            });
        }
    }

    return { batchId, leads: visible };
};

const listRequestCanRefill = (query) => {
    const page = parseInt(query.page, 10) || 1;
    if (page !== 1) return false;
    const keys = [
        "search", "status", "country", "countrySearch", "brandSearch", "agent", "callStatus",
        "customerAge", "amountLost", "amountLostWhen", "registeredToPlatform", "activeTradingPlatform",
        "customerBank", "additionalPhone", "screenSharing", "screenSharingId", "customerPotential",
    ];
    return keys.every((key) => String(query[key] || "").trim() === "");
};

module.exports = {
    REFILL_SIZE,
    isNewStatus,
    ownerIdOf,
    refillIfEmpty,
    refillOwners,
    listRequestCanRefill,
};
