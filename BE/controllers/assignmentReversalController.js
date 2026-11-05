// Reverse assignment (super admin only): send leads that are now with the admin back to the agent who had them before.
// Flow: statuses (what can go back) -> preview (who gets what) -> apply (confirmed by the super admin).
const mongoose = require("mongoose");
const User = require("../models/userModel");
const getLeadModel = require("../crmDB/models/leadsModel");
const getActivityModel = require("../crmDB/models/activityModel");
const getAssignmentReversalModel = require("../crmDB/models/assignmentReversalModel");
const { userCanOpenCrm, isNewStatus } = require("../utils/leadRefill");
const { resolveShortageAlert } = require("../utils/leadShortageAlert");
const {
    personName,
    buildContext,
    summarizeStatuses,
    buildPlan,
    applyPlan,
    buildHistoryDocs,
    toStoredActivities,
    historyTree,
    resolveGoBack,
} = require("../utils/assignmentReversal");

const STAFF_ROLES = ["superadmin", "admin", "subadmin", "manager"];
// Enough to count and to sort. Names, emails and phones for the visible page are loaded separately.
const PLAN_FIELDS = { firstName: 1, lastName: 1, status: 1, agent: 1, pastAgentIds: 1 };
const ROW_FIELDS = { firstName: 1, lastName: 1, email: 1, phone: 1, country: 1, agent: 1 };
const READ_CACHE_MS = 20000;

const countText = (count) => `${count.toLocaleString("en-US")} lead${count === 1 ? "" : "s"}`;

const onlySuperAdmin = (req, res) => {
    if (req.user?.role !== "superadmin") {
        res.status(403).json({ success: false, msg: "Only a super admin can reverse assignments" });
        return false;
    }
    return true;
};

// Not sent: every agent. Sent: only these (an empty list means none).
const parseAgentIds = (value) => {
    if (value === undefined || value === null) return undefined;
    const list = Array.isArray(value) ? value : String(value).split(",");
    return list.map((item) => String(item).trim()).filter((item) => mongoose.isValidObjectId(item));
};

let readCache = null;

function clearReadCache() {
    readCache = null;
}

// Staff + who counts as "with the admin", remembered for a few seconds so the status list and the
// preview do not each scan every lead holder.
async function loadContext(Lead) {
    const now = Date.now();
    if (readCache?.context && now - readCache.context.at < READ_CACHE_MS) return readCache.context.value;

    const [users, rawHolders] = await Promise.all([
        User.find({ role: { $in: STAFF_ROLES } }).select("firstName lastName role adminPermissions permissions").lean(),
        Lead.collection.distinct("agent", { isDeleted: false }),
    ]);
    const holderIds = rawHolders
        .filter((id) => id && mongoose.isValidObjectId(id))
        .map((id) => new mongoose.Types.ObjectId(String(id)));
    const knownIds = new Set(users.map((user) => String(user._id)));
    const missing = holderIds.filter((id) => !knownIds.has(String(id)));
    const existing = missing.length ? await User.find({ _id: { $in: missing } }).select("_id").lean() : [];
    const existingIds = new Set(existing.map((user) => String(user._id)));
    const orphanIds = missing.filter((id) => !existingIds.has(String(id))).map(String);

    const ctx = buildContext({ users, orphanIds, canReceive: userCanOpenCrm });
    const poolHolders = [null, "", ...[...ctx.superIds, ...ctx.orphanIds].map((id) => new mongoose.Types.ObjectId(id))];
    const value = { ctx, poolFilter: { isDeleted: { $ne: true }, agent: { $in: poolHolders } } };
    readCache = { ...(readCache || {}), context: { at: now, value } };
    return value;
}

// The leads that are with the admin, without emails and phones. Reused for a few seconds so
// choosing a status, turning an agent off, or changing page does not read them all again.
async function loadPoolLeads(Lead, poolFilter) {
    const now = Date.now();
    const key = JSON.stringify(poolFilter.agent.$in.map((id) => (id ? String(id) : "")));
    if (readCache?.pool && readCache.pool.key === key && now - readCache.pool.at < READ_CACHE_MS) {
        return readCache.pool.leads;
    }
    const leads = await Lead.collection.find(poolFilter, { projection: PLAN_FIELDS }).toArray();
    readCache = { ...(readCache || {}), pool: { at: now, key, leads } };
    return leads;
}

async function loadWorld({ fresh = false } = {}) {
    if (fresh) clearReadCache();
    const Lead = await getLeadModel();
    const { ctx, poolFilter } = await loadContext(Lead);
    const leads = await loadPoolLeads(Lead, poolFilter);
    return { Lead, ctx, leads };
}

const holderInfo = (lead, ctx) => {
    const holder = lead.agent ? String(lead.agent) : "";
    if (!holder) return null;
    const user = ctx.known.get(holder);
    return user ? { name: personName(user), role: user.role } : { name: "Removed user", role: "" };
};

// Step 1: which statuses have leads with the admin, and how many of them can go back.
exports.getReversalStatuses = async (req, res) => {
    try {
        if (!onlySuperAdmin(req, res)) return;
        const { ctx, leads } = await loadWorld();
        const statuses = summarizeStatuses(leads, ctx);
        return res.status(200).json({
            success: true,
            data: {
                statuses,
                totals: {
                    inPool: statuses.reduce((sum, row) => sum + row.inPool, 0),
                    canGoBack: statuses.reduce((sum, row) => sum + row.canGoBack, 0),
                },
            },
        });
    } catch (err) {
        console.error("Reverse assignment statuses failed:", err);
        return res.status(500).json({ success: false, msg: "Server Error", error: err.message });
    }
};

// Step 2: for one status, who the leads go back to, plus a page of the leads themselves. Nothing is changed.
exports.previewReversal = async (req, res) => {
    try {
        if (!onlySuperAdmin(req, res)) return;
        const status = String(req.query.status ?? "").trim();
        if (!status) return res.status(400).json({ success: false, msg: "Choose a status first" });

        const includeAgentIds = parseAgentIds(req.query.agentIds);
        const viewAgentId = String(req.query.viewAgentId || "").trim();
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);

        const { ctx, leads } = await loadWorld();
        const plan = buildPlan(leads, ctx, { status, includeAgentIds });

        const shown = (viewAgentId ? plan.items.filter((item) => item.toId === viewAgentId) : plan.items)
            .slice()
            .sort(
                (a, b) =>
                    a.toName.localeCompare(b.toName) ||
                    String(a.lead.lastName || "").localeCompare(String(b.lead.lastName || "")) ||
                    String(a.lead.firstName || "").localeCompare(String(b.lead.firstName || ""))
            );
        const pageItems = shown.slice((page - 1) * limit, page * limit);
        const details = pageItems.length
            ? await (await getLeadModel()).collection
                .find({ _id: { $in: pageItems.map((item) => item.leadId) } }, { projection: ROW_FIELDS })
                .toArray()
            : [];
        const detailById = new Map(details.map((lead) => [String(lead._id), lead]));
        const rows = pageItems.map((item) => {
            const lead = detailById.get(String(item.leadId)) || item.lead;
            return {
                id: String(item.leadId),
                name: `${lead.firstName || ""} ${lead.lastName || ""}`.trim() || "No name",
                email: lead.email || "",
                phone: lead.phone || "",
                country: lead.country || "",
                nowWith: holderInfo(lead, ctx),
                goesBackTo: { id: item.toId, name: item.toName, role: item.toRole },
            };
        });

        return res.status(200).json({
            success: true,
            data: {
                status: plan.status,
                inPool: plan.inPool,
                canGoBack: plan.reversible,
                cannot: plan.cannot,
                agents: plan.agents,
                willGoBack: plan.items.length,
                table: { page, limit, total: shown.length, rows },
            },
        });
    } catch (err) {
        console.error("Reverse assignment preview failed:", err);
        return res.status(500).json({ success: false, msg: "Server Error", error: err.message });
    }
};

let reversalRunning = false;

// Step 3: send the leads back. The plan is rebuilt here from the database, never trusted from the browser.
exports.applyReversal = async (req, res) => {
    try {
        if (!onlySuperAdmin(req, res)) return;
        const status = String(req.body?.status ?? "").trim();
        if (!status) return res.status(400).json({ success: false, msg: "Choose a status first" });
        if (reversalRunning) {
            return res.status(409).json({ success: false, code: "RUNNING", msg: "Another reversal is still running. Wait a moment and try again." });
        }
        reversalRunning = true;
        try {
            const { Lead, ctx, leads } = await loadWorld({ fresh: true });
            const plan = buildPlan(leads, ctx, { status, includeAgentIds: parseAgentIds(req.body?.agentIds) });
            const items = plan.items;
            if (!items.length) {
                return res.status(400).json({ success: false, msg: "There are no leads to send back for this status." });
            }

            // The screen showed a number. If the data moved since then, stop and let the super admin look again.
            const expected = Number(req.body?.expectedCount);
            if (Number.isFinite(expected) && expected !== items.length) {
                return res.status(409).json({
                    success: false,
                    code: "PLAN_CHANGED",
                    msg: `The leads changed since you opened this screen: ${countText(items.length)} can go back now, not ${countText(expected)}. Please review and try again.`,
                    data: { willGoBack: items.length },
                });
            }

            const now = new Date();
            const batchId = new mongoose.Types.ObjectId();
            clearReadCache();
            const { changed, stoppedBecause } = await applyPlan(Lead.collection, items, { now });

            // one history entry per lead that moved
            if (changed.length) {
                try {
                    const Activity = await getActivityModel();
                    const docs = toStoredActivities(
                        new Activity({}).toObject(),
                        buildHistoryDocs(changed, ctx, { actor: req.user, batchId }),
                        now
                    );
                    for (let start = 0; start < docs.length; start += 2000) {
                        await Activity.collection.insertMany(docs.slice(start, start + 2000), { ordered: false });
                    }
                } catch (historyError) {
                    console.error("Reverse assignment: lead history entries failed:", historyError);
                }
            }

            const perAgent = new Map();
            changed.forEach((item) => {
                const row = perAgent.get(item.toId) || { agentId: item.toObjectId, name: item.toName, role: item.toRole, count: 0 };
                row.count += 1;
                perAgent.set(item.toId, row);
            });
            const agents = [...perAgent.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

            try {
                const Batch = await getAssignmentReversalModel();
                await Batch.create({
                    _id: batchId,
                    status: plan.status,
                    createdBy: { userId: req.user._id, userName: personName(req.user), userRole: req.user.role },
                    selectedCount: items.length,
                    movedCount: changed.length,
                    notMovedCount: items.length - changed.length,
                    stoppedBecause,
                    agents,
                    createdAt: now,
                });
            } catch (batchError) {
                console.error("Reverse assignment: history record failed:", batchError);
            }

            // Agents who got "New" leads again no longer need a shortage warning.
            if (changed.length && isNewStatus(plan.status)) {
                for (const agent of agents) {
                    try {
                        await resolveShortageAlert(agent.agentId);
                    } catch (alertError) {
                        console.error("Reverse assignment: shortage alert update failed:", alertError);
                    }
                }
            }

            const notMoved = items.length - changed.length;
            return res.status(stoppedBecause ? 500 : 200).json({
                success: !stoppedBecause,
                msg: stoppedBecause
                    ? `Stopped early after ${countText(changed.length)}: ${stoppedBecause}`
                    : `${countText(changed.length)} sent back to ${agents.length} agent${agents.length === 1 ? "" : "s"}`,
                data: {
                    batchId: String(batchId),
                    status: plan.status,
                    selectedCount: items.length,
                    movedCount: changed.length,
                    notMovedCount: notMoved,
                    agents: agents.map((agent) => ({ agentId: String(agent.agentId), name: agent.name, role: agent.role, count: agent.count })),
                },
            });
        } finally {
            reversalRunning = false;
        }
    } catch (err) {
        console.error("Reverse assignment apply failed:", err);
        return res.status(500).json({ success: false, msg: "Server Error", error: err.message });
    }
};

// Send the selected leads back to one previous agent. Used from the assign window.
// Only leads whose last saved agent is `agentId` are moved. The others stay.
exports.sendBackSelected = async (req, res) => {
    try {
        if (!onlySuperAdmin(req, res)) return;
        const agentId = String(req.body?.agentId || "").trim();
        const leadIds = Array.isArray(req.body?.leadIds) ? req.body.leadIds.filter((id) => mongoose.isValidObjectId(id)) : [];
        if (!agentId || !mongoose.isValidObjectId(agentId)) {
            return res.status(400).json({ success: false, msg: "Choose the agent to send the leads back to" });
        }
        if (!leadIds.length) return res.status(400).json({ success: false, msg: "No leads selected" });
        if (reversalRunning) {
            return res.status(409).json({ success: false, msg: "Another reversal is still running. Wait a moment and try again." });
        }
        reversalRunning = true;
        try {
            const Lead = await getLeadModel();
            const leads = await Lead.collection
                .find({ _id: { $in: leadIds.map((id) => new mongoose.Types.ObjectId(id)) }, isDeleted: { $ne: true } }, { projection: { status: 1, agent: 1, pastAgentIds: 1 } })
                .toArray();
            const users = await User.find({ role: { $in: STAFF_ROLES } }).select("firstName lastName role adminPermissions permissions").lean();
            const ctx = buildContext({ users, orphanIds: [], canReceive: userCanOpenCrm });
            const target = ctx.receivers.get(agentId);
            if (!target) return res.status(400).json({ success: false, msg: "That agent cannot take leads back" });

            const items = [];
            leads.forEach((lead) => {
                const found = resolveGoBack(lead, ctx);
                if (!found.ok || found.toId !== agentId) return;
                items.push({
                    lead,
                    leadId: lead._id,
                    rawStatus: lead.status ?? null,
                    fromRaw: lead.agent ?? null,
                    fromId: lead.agent ? String(lead.agent) : "",
                    toId: found.toId,
                    toObjectId: found.agent.objectId,
                    toName: found.agent.name,
                    toRole: found.agent.role,
                });
            });
            if (!items.length) return res.status(400).json({ success: false, msg: "None of the selected leads go back to that agent" });

            const now = new Date();
            const batchId = new mongoose.Types.ObjectId();
            clearReadCache();
            const { changed, stoppedBecause } = await applyPlan(Lead.collection, items, { now });
            if (changed.length) {
                try {
                    const Activity = await getActivityModel();
                    const docs = toStoredActivities(new Activity({}).toObject(), buildHistoryDocs(changed, ctx, { actor: req.user, batchId }), now);
                    await Activity.collection.insertMany(docs, { ordered: false });
                } catch (historyError) {
                    console.error("Send back: history entries failed:", historyError);
                }
            }
            return res.status(stoppedBecause ? 500 : 200).json({
                success: !stoppedBecause,
                msg: stoppedBecause
                    ? `Stopped early after ${countText(changed.length)}: ${stoppedBecause}`
                    : `${countText(changed.length)} sent back to ${target.name}`,
                data: { movedCount: changed.length, agentName: target.name, agentRole: target.role },
            });
        } finally {
            reversalRunning = false;
        }
    } catch (err) {
        console.error("Send back selected failed:", err);
        return res.status(500).json({ success: false, msg: "Server Error", error: err.message });
    }
};

// Recent runs, newest first.
exports.listReversals = async (req, res) => {
    try {
        if (!onlySuperAdmin(req, res)) return;
        const Batch = await getAssignmentReversalModel();
        const rows = await Batch.find({}).sort({ createdAt: -1 }).limit(50).lean();
        return res.status(200).json({
            success: true,
            data: {
                reversals: rows.map((row) => ({
                    id: String(row._id),
                    status: row.status,
                    createdAt: row.createdAt,
                    by: row.createdBy?.userName || "",
                    selectedCount: row.selectedCount || 0,
                    movedCount: row.movedCount || 0,
                    notMovedCount: row.notMovedCount || 0,
                    agents: (row.agents || []).map((agent) => ({
                        agentId: String(agent.agentId || ""),
                        name: agent.name,
                        role: agent.role,
                        count: agent.count,
                    })),
                })),
            },
        });
    } catch (err) {
        console.error("Reverse assignment history failed:", err);
        return res.status(500).json({ success: false, msg: "Server Error", error: err.message });
    }
};
