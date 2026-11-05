// Reverse assignment: send leads back to the agent who had them before.
//
// The planning functions only work on the data they are given (no database calls), so they can be tested on their own.
// The only function that writes is applyPlan, and it writes only to the collection it is handed.
//
// "With the admin" means: nobody has the lead, the super admin has it, or the person who had it no longer exists.
// "The agent before" is the most recent agent saved in lead.pastAgentIds (oldest first), never a super admin.

const mongoose = require("mongoose");

// Same people the assign screen can give leads to (super admins are the pool, not agents).
const RECEIVING_ROLES = ["admin", "subadmin"];

const idText = (value) => (value ? String(value) : "");
const personName = (user) => `${user?.firstName || ""} ${user?.lastName || ""}`.trim() || "Unknown user";
// A lead with no status counts as "New", like everywhere else in the CRM.
const statusLabel = (value) => String(value ?? "").trim() || "New";

// users: staff accounts (superadmin, admin, subadmin, manager).
// orphanIds: lead holders that point at an account which no longer exists.
// canReceive(user): true when the user can open the CRM (same rule as the CRM login check).
function buildContext({ users, orphanIds = [], canReceive }) {
    const known = new Map();
    const superIds = new Set();
    const receivers = new Map();
    (users || []).forEach((user) => {
        const id = String(user._id);
        known.set(id, user);
        if (user.role === "superadmin") superIds.add(id);
        if (RECEIVING_ROLES.includes(user.role) && canReceive(user)) {
            receivers.set(id, { id, objectId: user._id, name: personName(user), role: user.role });
        }
    });
    return { known, superIds, orphanIds: new Set((orphanIds || []).map(String)), receivers };
}

function isInAdminPool(lead, ctx) {
    if (lead.isDeleted === true) return false; // leads in the trash are never touched
    const holder = idText(lead.agent);
    return !holder || ctx.superIds.has(holder) || ctx.orphanIds.has(holder);
}

// Which agent should this lead go back to?
//   { ok: true, toId, agent }
//   { ok: false, reason: "no_history" }                       it never had an agent
//   { ok: false, reason: "agent_unavailable", agentId }       its last agent was removed or cannot open the CRM
function resolveGoBack(lead, ctx) {
    const holder = idText(lead.agent);
    const saved = (Array.isArray(lead.pastAgentIds) ? lead.pastAgentIds : []).map(idText).filter(Boolean);
    const agentsBefore = saved.filter((id) => id !== holder && !ctx.superIds.has(id));
    if (!agentsBefore.length) return { ok: false, reason: "no_history" };
    // Only the most recent agent counts. If that one is gone, do not fall back to an older agent.
    const toId = agentsBefore[agentsBefore.length - 1];
    const agent = ctx.receivers.get(toId);
    if (!agent) return { ok: false, reason: "agent_unavailable", agentId: toId };
    return { ok: true, toId, agent };
}

const byCountThenName = (a, b) => b.count - a.count || a.name.localeCompare(b.name);

// One row per status: how many leads are with the admin and how many of them can go back.
function summarizeStatuses(leads, ctx) {
    const rows = new Map();
    (leads || []).forEach((lead) => {
        if (!isInAdminPool(lead, ctx)) return;
        const label = statusLabel(lead.status);
        const row = rows.get(label) || { status: label, inPool: 0, canGoBack: 0, cannotGoBack: 0 };
        row.inPool += 1;
        if (resolveGoBack(lead, ctx).ok) row.canGoBack += 1;
        else row.cannotGoBack += 1;
        rows.set(label, row);
    });
    return [...rows.values()].sort(
        (a, b) => b.canGoBack - a.canGoBack || b.inPool - a.inPool || a.status.localeCompare(b.status)
    );
}

// includeAgentIds: leave undefined for every agent, or pass the agents to send leads back to.
function buildPlan(leads, ctx, { status, includeAgentIds } = {}) {
    const wanted = statusLabel(status);
    const include = Array.isArray(includeAgentIds) ? new Set(includeAgentIds.map(String)) : null;
    const perAgent = new Map();
    const unavailable = new Map();
    const items = [];
    let inPool = 0;
    let reversible = 0;
    let noHistory = 0;
    let agentUnavailable = 0;

    (leads || []).forEach((lead) => {
        if (statusLabel(lead.status) !== wanted) return;
        if (!isInAdminPool(lead, ctx)) return;
        inPool += 1;

        const found = resolveGoBack(lead, ctx);
        if (!found.ok) {
            if (found.reason === "no_history") {
                noHistory += 1;
                return;
            }
            agentUnavailable += 1;
            const user = ctx.known.get(found.agentId);
            const entry = unavailable.get(found.agentId) || {
                agentId: found.agentId,
                name: user ? personName(user) : "Removed user",
                why: user ? "cannot_receive" : "removed", // removed account, or cannot open the CRM / not an admin or subadmin
                count: 0,
            };
            entry.count += 1;
            unavailable.set(found.agentId, entry);
            return;
        }

        reversible += 1;
        const agentRow = perAgent.get(found.toId) || {
            agentId: found.toId,
            name: found.agent.name,
            role: found.agent.role,
            count: 0,
        };
        agentRow.count += 1;
        perAgent.set(found.toId, agentRow);
        if (include && !include.has(found.toId)) return;

        items.push({
            lead,
            leadId: lead._id,
            rawStatus: lead.status ?? null, // exactly what is stored now, so the write can check it has not changed
            fromRaw: lead.agent ?? null,
            fromId: idText(lead.agent),
            toId: found.toId,
            toObjectId: found.agent.objectId,
            toName: found.agent.name,
            toRole: found.agent.role,
        });
    });

    return {
        status: wanted,
        inPool,
        reversible,
        cannot: {
            noHistory,
            agentUnavailable,
            unavailable: [...unavailable.values()].sort(byCountThenName),
        },
        agents: [...perAgent.values()].sort(byCountThenName),
        items,
    };
}

// Moves the leads. Each lead is only changed if it is still exactly as the preview saw it
// (same status, still with the same holder, not deleted), so nobody's newer change is overwritten.
// Leads that go from the same holder to the same agent are updated together (one call per up to 1,000 leads),
// which is much faster than one call per lead.
// Returns the items that really moved.
async function applyPlan(collection, items, { now = new Date(), chunkSize = 1000 } = {}) {
    const groups = new Map();
    (items || []).forEach((item) => {
        const key = JSON.stringify([item.fromId, typeof item.fromRaw, item.toId, item.rawStatus]);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(item);
    });

    const changed = [];
    let stoppedBecause = "";

    for (const group of groups.values()) {
        for (let start = 0; start < group.length; start += chunkSize) {
            const part = group.slice(start, start + chunkSize);
            const sample = part[0];
            const ids = part.map((item) => item.leadId);
            const addToHistory = [sample.toObjectId];
            if (sample.fromId && mongoose.isValidObjectId(sample.fromId)) {
                addToHistory.push(new mongoose.Types.ObjectId(sample.fromId));
            }
            try {
                await collection.updateMany(
                    {
                        _id: { $in: ids },
                        isDeleted: { $ne: true },
                        status: sample.rawStatus,
                        agent: sample.fromId ? sample.fromRaw : { $in: [null, ""] },
                    },
                    {
                        $set: { agent: sample.toObjectId, updatedAt: now },
                        $addToSet: { pastAgentIds: { $each: addToHistory } },
                    }
                );
                // updateMany only says how many changed, so ask which ones
                const moved = await collection
                    .find({ _id: { $in: ids }, updatedAt: now }, { projection: { _id: 1 } })
                    .toArray();
                const movedIds = new Set(moved.map((doc) => String(doc._id)));
                part.forEach((item) => {
                    if (movedIds.has(String(item.leadId))) changed.push(item);
                });
            } catch (error) {
                stoppedBecause = error && error.message ? error.message : "Unknown error";
                return { changed, stoppedBecause };
            }
        }
    }
    return { changed, stoppedBecause };
}

// One history entry per moved lead, in the same shape the assign screen writes.
function buildHistoryDocs(changed, ctx, { actor, batchId }) {
    const actorInfo = {
        userId: actor._id,
        userName: personName(actor),
        userRole: actor.role,
    };
    return changed.map((item) => {
        let fromName = "Unassigned";
        if (item.fromId) fromName = ctx.known.has(item.fromId) ? personName(ctx.known.get(item.fromId)) : "Removed user";
        return {
            leadId: item.leadId,
            type: "assignment_change",
            isSystemGenerated: false,
            createdBy: actorInfo,
            changes: {
                field: "agent",
                oldValue: fromName,
                newValue: item.toName,
                description: "Assignment reversed: lead sent back to the agent who had it before",
            },
            metadata: {
                newAgentId: item.toId,
                previousAgentId: item.fromId,
                reversal: true,
                batchId: String(batchId),
            },
        };
    });
}

// The history entries exactly as Mongoose would store them, without Mongoose's per-entry cost
// (thousands of entries would otherwise take many seconds). `blank` is new Activity({}).toObject().
function toStoredActivities(blank, docs, at = new Date()) {
    const base = { ...blank };
    delete base._id;
    return (docs || []).map((doc) => ({
        ...base,
        ...doc,
        _id: new mongoose.Types.ObjectId(),
        __v: 0,
        createdAt: at,
        updatedAt: at,
    }));
}

// Previous agents of these leads, grouped under whoever has them now.
// A branch is the last agent before the current one. "earlier" is the agent before that.
// canSendBack is true only when that previous agent can still take leads.
function historyTree(leads, ctx) {
    const describe = (id) => {
        const user = id ? ctx.known.get(id) : null;
        return {
            agentId: id || null,
            agentName: id ? (user ? personName(user) : "Removed user") : "",
            agentRole: user?.role || "",
        };
    };
    const groups = new Map();
    (leads || []).forEach((lead) => {
        const holder = idText(lead.agent);
        if (!groups.has(holder)) groups.set(holder, { ...describe(holder), count: 0, noPrevious: 0, branches: new Map() });
        const group = groups.get(holder);
        group.count += 1;
        const saved = (Array.isArray(lead.pastAgentIds) ? lead.pastAgentIds : []).map(idText).filter(Boolean);
        const before = saved.filter((id) => id !== holder && !ctx.superIds.has(id));
        if (!before.length) {
            group.noPrevious += 1;
            return;
        }
        const prevId = before[before.length - 1];
        const earlierId = before.length > 1 ? before[before.length - 2] : "";
        if (!group.branches.has(prevId)) {
            group.branches.set(prevId, { ...describe(prevId), count: 0, canSendBack: ctx.receivers.has(prevId), earlier: new Map() });
        }
        const branch = group.branches.get(prevId);
        branch.count += 1;
        if (earlierId) {
            const earlier = branch.earlier.get(earlierId) || { ...describe(earlierId), count: 0 };
            earlier.count += 1;
            branch.earlier.set(earlierId, earlier);
        }
    });
    const byCount = (a, b) => b.count - a.count || String(a.agentName).localeCompare(String(b.agentName));
    return [...groups.values()]
        .map((group) => ({
            ...group,
            branches: [...group.branches.values()]
                .map((branch) => ({ ...branch, earlier: [...branch.earlier.values()].sort(byCount) }))
                .sort(byCount),
        }))
        .sort(byCount);
}

module.exports = {
    RECEIVING_ROLES,
    personName,
    statusLabel,
    buildContext,
    isInAdminPool,
    resolveGoBack,
    summarizeStatuses,
    buildPlan,
    applyPlan,
    buildHistoryDocs,
    toStoredActivities,
    historyTree,
};
