const mongoose = require("mongoose");
const connectCRMDatabase = require("../config/crmDatabase");
const User = require("../models/userModel");
const getLeadModel = require("../crmDB/models/leadsModel");
const getActivityModel = require("../crmDB/models/activityModel");
const { hasCrmPermission } = require("./crmPermissions");
const UserRestriction = require("../models/usersRestrictions");
const { publishToUser } = require("./chatSse");
const { openShortageAlert, resolveShortageAlert, publishOpenShortageAlerts } = require("./leadShortageAlert");

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
    if (user.role === "manager") return user.adminPermissions?.accessCrm === true || user.permissions?.accessCrm === true;
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
    const agentMatch = mongoose.Types.ObjectId.isValid(userId)
        ? { $in: [new mongoose.Types.ObjectId(userId), String(userId)] }
        : userId;
    const count = await Lead.countDocuments({
        isDeleted: false,
        agent: agentMatch,
        $or: [
            { status: { $in: ["New", "new", "", null] } },
            { status: { $exists: false } }
        ]
    });
    return count;
};

const newLeadStatus = {
    $or: [
        { status: { $in: ["New", "new", "", null] } },
        { status: { $exists: false } }
    ],
};

const cleanRuleList = (values) => (Array.isArray(values) ? values.map((value) => String(value || "").trim()).filter(Boolean) : []);

const poolFilter = async (Lead, rules = {}) => {
    const supers = await User.find({ role: "superadmin" }).select("_id").lean();
    const superIds = supers.map((item) => item._id);
    const rawAgents = await Lead.collection.distinct("agent", {
        ...newLeadStatus,
        isDeleted: { $ne: true },
    });
    const objectIds = [];
    let hasBlank = false;
    rawAgents.forEach((agent) => {
        if (agent === "" || agent === null || agent === undefined) {
            hasBlank = true;
            return;
        }
        if (mongoose.Types.ObjectId.isValid(agent)) {
            objectIds.push(new mongoose.Types.ObjectId(agent));
        }
    });
    const existing = objectIds.length
        ? await User.find({ _id: { $in: objectIds } }).select("_id").lean()
        : [];
    const existingIds = new Set(existing.map((item) => String(item._id)));
    const orphanIds = objectIds.filter((id) => !existingIds.has(String(id)));
    const heldBy = [...superIds, ...orphanIds];
    const heldByValues = [
        ...heldBy,
        ...heldBy.map((id) => String(id)),
    ];
    const agentMatch = [
        { agent: null },
        { agent: { $exists: false } },
        ...(hasBlank ? [{ agent: "" }] : []),
        ...(heldByValues.length ? [{ agent: { $in: heldByValues } }] : []),
    ];
    const settings = await UserRestriction.findOne().select("automationAllow").lean();
    const allow = settings?.automationAllow || {};
    const globalLists = cleanRuleList(allow.fileNames);
    const globalCountries = cleanRuleList(allow.countries);
    const globalBrands = cleanRuleList(allow.brands);
    const globalSources = cleanRuleList(allow.sources);
    const ownLists = cleanRuleList(rules.listNames);
    const ownCountries = cleanRuleList(rules.countries);
    const ownBrands = cleanRuleList(rules.brands);
    const ownSources = cleanRuleList(rules.sources);
    const narrow = (globalValues, ownValues) => {
        if (globalValues.length && ownValues.length) return globalValues.filter((value) => ownValues.includes(value));
        if (ownValues.length) return ownValues;
        return globalValues;
    };
    const lists = narrow(globalLists, ownLists);
    const countries = narrow(globalCountries, ownCountries);
    const brands = narrow(globalBrands, ownBrands);
    const sources = narrow(globalSources, ownSources);
    const blocked = (globalValues, ownValues) => globalValues.length && ownValues.length && !globalValues.some((value) => ownValues.includes(value));
    if ([ 
        [globalLists, ownLists],
        [globalCountries, ownCountries],
        [globalBrands, ownBrands],
        [globalSources, ownSources],
    ].some(([globalValues, ownValues]) => blocked(globalValues, ownValues))) {
        return { _id: { $in: [] } };
    }
    return {
        isDeleted: false,
        ...newLeadStatus,
        $and: [
            { $or: agentMatch },
            ...(lists.length ? [{ fileName: { $in: lists } }] : []),
            ...(countries.length ? [{ country: { $in: countries } }] : []),
            ...(brands.length ? [{ Brand: { $in: brands } }] : []),
            ...(sources.length ? [{ source: { $in: sources } }] : []),
        ],
    };
};

const refillSizeFor = (owner) => {
    const requested = Number(owner?.leadAutomation?.maxLeads);
    if (!Number.isFinite(requested) || requested <= 0) return REFILL_SIZE;
    return Math.min(500, Math.max(1, Math.floor(requested)));
};

const readPool = async (Lead, pool, limit) => {
    const collection = Lead.collection;
    const available = await collection.countDocuments(pool);
    const picked = await collection.find(pool).sort({ createdAt: 1 }).project({ _id: 1 }).limit(limit).toArray();
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
            userName: "System",
            userRole: "system",
        },
        changes: {
            field: "agent",
            oldValue: "Unassigned",
            newValue: name,
            description: "Lead assigned by system automatically",
        },
        comment: "Lead assigned by system automatically",
        metadata: {
            isAutomated: true,
            reason: "Lead assigned by system automatically",
            assignedTo: {
                userId: owner._id,
                userName: name,
                userRole: owner.role,
            }
        }
    })), { ordered: false });
};

const claimNewLeads = async (owner) => {
    const userKey = `user:${owner._id}`;
    const lockedUser = await acquireLock(userKey);
    if (!lockedUser) return emptyResult();

    try {
        if (owner?.leadAutomation?.enabled !== true) {
            console.log(`Lead refill skipped: automation is off for ${owner._id}`);
            return emptyResult();
        }
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
            const pool = await poolFilter(Lead, owner.leadAutomation || {});
            const take = refillSizeFor(owner);
            const { available, ids } = await readPool(Lead, pool, take);
            if (!available || !ids.length) {
                console.log(`Lead refill skipped: no New leads in the super admin pool for ${owner._id}`);
                await openShortageAlert(owner);
                publishOpenShortageAlerts().catch((error) => console.error("Lead shortage publish failed:", error));
                return emptyResult();
            }
            const batchId = new mongoose.Types.ObjectId();
            const now = new Date();
            const ownerObjectId = mongoose.Types.ObjectId.isValid(owner._id)
                ? new mongoose.Types.ObjectId(owner._id)
                : owner._id;
            await Lead.updateMany(
                { _id: { $in: ids }, isDeleted: false },
                { $set: { agent: ownerObjectId, status: "New", updatedAt: now, createdAt: now } }
            );
            const leads = await Lead.find({ _id: { $in: ids }, agent: ownerObjectId, isDeleted: false }).lean();
            if (!leads.length) return emptyResult();
            await resolveShortageAlert(owner._id);
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
        const owner = await User.findById(key).select("firstName lastName email role adminPermissions permissions leadAutomation").lean();
        if (!owner || (owner.role !== "admin" && owner.role !== "subadmin" && owner.role !== "manager")) return emptyResult();
        if (owner.leadAutomation?.enabled !== true) {
            console.log(`Lead refill skipped: automation is off for ${key}`);
            return emptyResult();
        }
        if (!userCanOpenCrm(owner)) {
            console.log(`Lead refill skipped: ${key} does not have Open CRM`);
            return emptyResult();
        }
        const Lead = await getLeadModel();
        const owned = await hasOwnNewLead(Lead, key);
        if (owned > 0) {
            await resolveShortageAlert(key);
            console.log(`Lead refill skipped: ${key} still has ${owned} New leads`);
            return emptyResult();
        }
        const result = await claimNewLeads(owner);
        reportLeadShortages().catch((error) => console.error("Lead shortage scan failed:", error));
        return result;
    })().catch((error) => {
        console.error("Lead refill failed:", error);
        return emptyResult();
    }).finally(() => {
        inflight.delete(key);
    });

    inflight.set(key, job);
    return job;
};

const reportLeadShortages = async () => {
    if (!(await autoAssignEnabled())) return;
    const candidates = await User.find({
        role: { $in: ["admin", "subadmin", "manager"] },
        $or: [
            { "adminPermissions.accessCrm": true },
            { "permissions.accessCrm": true },
        ]
    }).select("_id role permissions adminPermissions firstName lastName email leadAutomation").lean();
    const Lead = await getLeadModel();
    let opened = false;
    for (const user of candidates) {
        if (!userCanOpenCrm(user) || user.leadAutomation?.enabled !== true) continue;
        const owned = await hasOwnNewLead(Lead, user._id);
        if (owned > 0) {
            await resolveShortageAlert(user._id);
            continue;
        }
        const pool = await poolFilter(Lead, user.leadAutomation || {});
        const available = await Lead.collection.countDocuments(pool);
        if (!available) {
            const alert = await openShortageAlert(user);
            if (alert) opened = true;
        }
    }
    if (opened) await publishOpenShortageAlerts();
};

const refillAllEligibleAgents = async () => {
    try {
        if (!(await autoAssignEnabled())) return;
        const candidates = await User.find({
            role: { $in: ["admin", "subadmin", "manager"] },
            $or: [
                { "adminPermissions.accessCrm": true },
                { "permissions.accessCrm": true },
            ]
        }).select("_id role permissions adminPermissions firstName lastName email").lean();

        for (const user of candidates) {
            if (userCanOpenCrm(user)) {
                await refillIfEmpty(user._id);
            }
        }
        await reportLeadShortages();
    } catch (err) {
        console.error("refillAllEligibleAgents failed:", err);
    }
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

const listRequestCanRefill = (query, user) => {
    if (!query) return true;
    if (query.idsOnly === "true") return false;

    // If filtering by status, allow if status is New or not specified
    const status = query.status;
    if (status && !isNewStatus(status)) {
        return false;
    }

    // If filtering by agent, allow if agent is themselves or not specified
    const agent = query.agent;
    if (agent && user && String(agent) !== String(user._id)) {
        return false;
    }

    // Allow page 1
    const page = parseInt(query.page, 10) || 1;
    if (page !== 1) return false;

    const searchKeys = [
        "search", "countrySearch", "brandSearch",
        "customerAge", "amountLost", "amountLostWhen", "registeredToPlatform", "activeTradingPlatform",
        "customerBank", "additionalPhone", "screenSharing", "screenSharingId", "customerPotential",
    ];
    return searchKeys.every((key) => String(query[key] || "").trim() === "");
};

module.exports = {
    REFILL_SIZE,
    isNewStatus,
    ownerIdOf,
    userCanOpenCrm,
    hasOwnNewLead,
    refillIfEmpty,
    refillOwners,
    refillAllEligibleAgents,
    listRequestCanRefill,
};
