const mongoose = require("mongoose");
const User = require("../models/userModel");
const getLeadModel = require("../crmDB/models/leadsModel");
const getLeadStatusModel = require("../crmDB/models/leadStatusModel");
const getActivityModel = require("../crmDB/models/activityModel");
const getLeadAutomationRuleModel = require("../crmDB/models/leadAutomationRuleModel");
const getLeadAutomationLogModel = require("../crmDB/models/leadAutomationLogModel");
const { ensureDefaultLeadStatuses } = require("./leadStatusHelpers");
const { publishToUser } = require("./chatSse");

const STATUS_FALLBACK_COLORS = {
  "new": "#1976d2",
  "no answer": "#f59e0b",
  "call back": "#ef6c00",
  "callback": "#ef6c00",
  "not interested": "#757575",
  "not active": "#d32f2f",
  "active": "#2e7d32",
  "exhausted": "#64748b",
  "expired": "#dc2626",
  "cold": "#0284c7",
};

const formatUserName = (user) => {
  if (!user) return "Unassigned";
  const full = `${user.firstName || ""} ${user.lastName || ""}`.trim();
  return full || user.email || "Agent";
};

const normText = (val) => String(val ?? "").trim().toLowerCase();

/**
 * Ensures that a given status label exists in the LeadStatus collection
 * so it is recognized by normalizeLeadStatus and styled across the CRM.
 */
const ensureStatusExists = async (label, customColor = "") => {
  const clean = String(label || "").trim();
  if (!clean || clean.toLowerCase() === "keep") return clean;
  await ensureDefaultLeadStatuses();
  const LeadStatus = await getLeadStatusModel();
  const existing = await LeadStatus.findOne({
    label: { $regex: new RegExp(`^${clean.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
  }).lean();
  if (existing) return existing.label;

  const maxOrder = await LeadStatus.findOne().sort({ sortOrder: -1 }).lean();
  const fallbackColor = customColor || STATUS_FALLBACK_COLORS[clean.toLowerCase()] || "#6366f1";
  try {
    const created = await LeadStatus.create({
      label: clean,
      color: fallbackColor,
      sortOrder: (maxOrder?.sortOrder ?? 0) + 1,
      isDefault: false,
    });
    return created.label;
  } catch (err) {
    // Handle race condition on unique index
    const retry = await LeadStatus.findOne({ label: clean }).lean();
    return retry?.label || clean;
  }
};

/**
 * Ensures common rotation statuses ("No Answer", "Exhausted") exist by default
 * so the Super Admin immediately sees them in status dropdowns.
 */
const ensureRotationStatuses = async () => {
  await ensureDefaultLeadStatuses();
  await ensureStatusExists("No Answer", "#f59e0b");
  await ensureStatusExists("Exhausted", "#64748b");
};

const matchesFilterArray = (ruleValues, leadValue) => {
  if (!Array.isArray(ruleValues) || ruleValues.length === 0) return true;
  const target = normText(leadValue);
  if (!target) return false;
  return ruleValues.some((item) => normText(item) === target);
};

const doesRuleMatchLead = (rule, lead, targetFromStatus) => {
  if (!rule || !rule.active) return false;
  if (normText(rule.fromStatus) !== normText(targetFromStatus)) return false;

  // Check Lead List (fileName)
  if (rule.listMode === "selected" && Array.isArray(rule.fileNames) && rule.fileNames.length > 0) {
    if (!matchesFilterArray(rule.fileNames, lead.fileName)) return false;
  }

  // Optional extra filters
  if (!matchesFilterArray(rule.countries, lead.country)) return false;
  if (!matchesFilterArray(rule.brands, lead.Brand)) return false;
  if (!matchesFilterArray(rule.sources, lead.source)) return false;

  return true;
};

/**
 * Core engine: Evaluates and executes matching Lead Automation Rules
 * when one or more leads enter `enteredStatus`.
 *
 * @param {Array} leadsInput - Array of lead documents or objects (must have _id)
 * @param {String} enteredStatus - The status the leads just entered (e.g. "No Answer")
 * @param {Object} actor - req.user who triggered the status change
 * @param {String} triggerType - "status_change" | "bulk_status" | "manual_run"
 * @param {String|null} specificRuleId - Optional rule ID when running a single rule manually
 */
const processLeadsForRotation = async (
  leadsInput,
  enteredStatus,
  actor = null,
  triggerType = "status_change",
  specificRuleId = null
) => {
  const summary = {
    matchedCount: 0,
    rotatedCount: 0,
    exhaustedCount: 0,
    skippedCapacityCount: 0,
    resultsByLeadId: new Map(),
  };

  try {
    if (!Array.isArray(leadsInput) || leadsInput.length === 0 || !enteredStatus) {
      return summary;
    }

    const Rule = await getLeadAutomationRuleModel();
    const ruleQuery = { active: true };
    if (specificRuleId && mongoose.Types.ObjectId.isValid(specificRuleId)) {
      ruleQuery._id = new mongoose.Types.ObjectId(specificRuleId);
    }

    const activeRules = await Rule.find(ruleQuery).sort({ priority: 1, createdAt: 1 }).lean();
    if (!activeRules.length) return summary;

    // Filter rules that match enteredStatus (and timing: immediate rules run live, delayed rules run via scheduler/manual)
    const isImmediateTrigger = triggerType !== "manual_run" && triggerType !== "scheduled";
    const statusRules = activeRules.filter(
      (r) =>
        normText(r.fromStatus) === normText(enteredStatus) &&
        Array.isArray(r.agentIds) &&
        r.agentIds.length > 0 &&
        (!isImmediateTrigger || (Number(r.delayMinutes) || 0) === 0)
    );
    if (!statusRules.length) return summary;

    const Lead = await getLeadModel();
    const leadIds = leadsInput
      .map((item) => (item && item._id ? item._id : item))
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));

    if (!leadIds.length) return summary;

    // Load fresh full lead fields needed for rule evaluation
    const leads = await Lead.find({ _id: { $in: leadIds }, isDeleted: false })
      .select(
        "_id leadNumber firstName lastName email phone fileName country Brand source agent pastAgentIds status rotationCount"
      )
      .lean();

    if (!leads.length) return summary;

    // Collect all agentIds across matching rules + current lead agents
    const allAgentIdStrings = new Set();
    statusRules.forEach((rule) => {
      (rule.agentIds || []).forEach((id) => {
        if (id) allAgentIdStrings.add(String(id));
      });
    });
    leads.forEach((lead) => {
      if (lead.agent) allAgentIdStrings.add(String(lead.agent));
    });

    const validUserObjectIds = [...allAgentIdStrings]
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));

    const [users, activeCounts] = await Promise.all([
      validUserObjectIds.length
        ? User.find({ _id: { $in: validUserObjectIds } })
            .select("_id firstName lastName email role avatar")
            .lean()
        : [],
      validUserObjectIds.length
        ? Lead.aggregate([
            { $match: { isDeleted: false, agent: { $in: validUserObjectIds } } },
            { $group: { _id: "$agent", count: { $sum: 1 } } },
          ])
        : [],
    ]);

    const userMap = new Map(users.map((u) => [String(u._id), u]));
    const agentLeadCounts = new Map();
    validUserObjectIds.forEach((id) => agentLeadCounts.set(String(id), 0));
    activeCounts.forEach((row) => {
      agentLeadCounts.set(String(row._id), row.count || 0);
    });

    // Track round-robin pointer per rule in memory during batch processing
    const rulePointers = new Map(
      statusRules.map((r) => [String(r._id), r.lastAssignedAgentId ? String(r.lastAssignedAgentId) : ""])
    );
    const ruleStatsDelta = new Map(
      statusRules.map((r) => [String(r._id), { rotated: 0, exhausted: 0, lastAgentId: null }])
    );

    const leadBulkOps = [];
    const activityDocs = [];
    const logDocs = [];
    const sseByNewOwner = new Map();
    const now = new Date();

    const actorInfo = {
      userId: actor?._id || null,
      userName: actor ? formatUserName(actor) : "Automation System",
      userRole: actor?.role || "system",
    };

    for (const lead of leads) {
      const rule = statusRules.find((r) => doesRuleMatchLead(r, lead, enteredStatus));
      if (!rule) continue;

      summary.matchedCount += 1;
      const ruleIdStr = String(rule._id);
      const delta = ruleStatsDelta.get(ruleIdStr);

      // Valid ordered agents in this rule that actually exist in User collection
      const orderedAgentIds = (rule.agentIds || [])
        .map((id) => String(id))
        .filter((id) => userMap.has(id));

      if (!orderedAgentIds.length) continue;

      const currentAgentId = lead.agent ? String(lead.agent) : "";
      const currentAgentUser = currentAgentId ? userMap.get(currentAgentId) : null;
      const currentAgentName = currentAgentUser ? formatUserName(currentAgentUser) : "Unassigned";

      const pastSet = new Set((lead.pastAgentIds || []).map((id) => String(id)));
      if (currentAgentId) pastSet.add(currentAgentId);

      const currentRotationCount = Number(lead.rotationCount) || 0;
      const nextRotationCount = currentRotationCount + 1;
      const maxLimit = Number(rule.maxAgentsPerLead) || 0;

      // Determine eligible agents in rotation
      let eligibleAgentIds = orderedAgentIds.filter((id) => id !== currentAgentId);
      if (rule.skipPreviousAgents !== false) {
        eligibleAgentIds = eligibleAgentIds.filter((id) => !pastSet.has(id));
      }
      // Special case: if rule only has 1 agent and lead is currently unassigned, that 1 agent is eligible
      if (eligibleAgentIds.length === 0 && orderedAgentIds.length === 1 && !currentAgentId) {
        if (rule.skipPreviousAgents === false || !pastSet.has(orderedAgentIds[0])) {
          eligibleAgentIds = [orderedAgentIds[0]];
        }
      }

      const hitMaxLimit = maxLimit > 0 && nextRotationCount > maxLimit;
      const hadEligibleBeforeCap = eligibleAgentIds.length > 0;
      const maxLeadsPerAgent = Number(rule.maxLeadsPerAgent) || 0;
      if (maxLeadsPerAgent > 0 && eligibleAgentIds.length > 0) {
        eligibleAgentIds = eligibleAgentIds.filter(
          (id) => (agentLeadCounts.get(id) ?? 0) < maxLeadsPerAgent
        );
      }
      const blockedByAgentCap = !hitMaxLimit && hadEligibleBeforeCap && eligibleAgentIds.length === 0;
      if (blockedByAgentCap) {
        summary.skippedCapacityCount += 1;
        summary.resultsByLeadId.set(String(lead._id), {
          outcome: "skipped_capacity",
          ruleId: String(rule._id),
          ruleName: rule.name,
          status: enteredStatus,
          agent: currentAgentUser || null,
          rotationCount: currentRotationCount,
          reason: `All eligible agents have reached the max leads limit (${maxLeadsPerAgent})`,
        });
        continue;
      }

      const noEligibleAgents = eligibleAgentIds.length === 0;

      if (hitMaxLimit || noEligibleAgents) {
        // Lead is exhausted!
        const finalStatusLabel =
          rule.finalStatus && normText(rule.finalStatus) !== "keep"
            ? await ensureStatusExists(rule.finalStatus)
            : enteredStatus;

        const updateFields = {
          status: finalStatusLabel,
          lastRotatedAt: now,
          lastRotationRuleId: rule._id,
          updatedAt: now,
        };
        if (rule.unassignOnExhausted) {
          updateFields.agent = null;
        }

        const addToPast = [];
        if (currentAgentId && mongoose.Types.ObjectId.isValid(currentAgentId)) {
          addToPast.push(new mongoose.Types.ObjectId(currentAgentId));
        }

        leadBulkOps.push({
          updateOne: {
            filter: { _id: lead._id },
            update: {
              $set: updateFields,
              ...(addToPast.length ? { $addToSet: { pastAgentIds: { $each: addToPast } } } : {}),
            },
          },
        });

        const exhaustReason = hitMaxLimit
          ? `Reached max rotation limit (${maxLimit} agents per lead)`
          : `All ${orderedAgentIds.length} agent(s) in rotation have already handled this lead`;

        activityDocs.push({
          leadId: lead._id,
          type: "status_change",
          isSystemGenerated: true,
          createdBy: {
            userName: `Automation (${rule.name})`,
            userRole: "system",
          },
          comment: `Automation "${rule.name}": ${exhaustReason}. Status set to "${finalStatusLabel}".`,
          changes: {
            field: "status",
            oldValue: enteredStatus,
            newValue: finalStatusLabel,
            description: `Automation "${rule.name}": ${exhaustReason}`,
          },
          metadata: {
            isAutomated: true,
            ruleId: String(rule._id),
            ruleName: rule.name,
            outcome: "exhausted",
          },
        });

        logDocs.push({
          ruleId: rule._id,
          ruleName: rule.name,
          leadId: lead._id,
          leadNumber: lead.leadNumber || null,
          leadName: `${lead.firstName || ""} ${lead.lastName || ""}`.trim() || lead.email || "Lead",
          leadEmail: lead.email || "",
          leadPhone: lead.phone || "",
          fileName: lead.fileName || "",
          country: lead.country || "",
          brand: lead.Brand || "",
          outcome: "exhausted",
          triggerType,
          fromStatus: enteredStatus,
          toStatus: finalStatusLabel,
          fromAgent: {
            userId: currentAgentUser?._id || null,
            userName: currentAgentName,
          },
          toAgent: {
            userId: rule.unassignOnExhausted ? null : currentAgentUser?._id || null,
            userName: rule.unassignOnExhausted ? "Unassigned" : currentAgentName,
          },
          rotationCount: currentRotationCount,
          maxAgentsPerLead: maxLimit,
          rotationMode: rule.rotationMode || "sequential",
          triggeredBy: actorInfo,
          reason: exhaustReason,
          createdAt: now,
        });

        delta.exhausted += 1;
        summary.exhaustedCount += 1;
        summary.resultsByLeadId.set(String(lead._id), {
          outcome: "exhausted",
          ruleId: String(rule._id),
          ruleName: rule.name,
          status: finalStatusLabel,
          agent: rule.unassignOnExhausted ? null : currentAgentUser || null,
          rotationCount: currentRotationCount,
          reason: exhaustReason,
        });
        continue;
      }

      // Select the next agent according to rotationMode
      let selectedAgentId = eligibleAgentIds[0];

      if (rule.rotationMode === "least_assigned") {
        // Pick eligible agent with lowest active lead count (tie-breaker: rotation order)
        let bestId = eligibleAgentIds[0];
        let bestCount = agentLeadCounts.get(bestId) ?? 0;
        for (let i = 1; i < eligibleAgentIds.length; i += 1) {
          const candidateId = eligibleAgentIds[i];
          const count = agentLeadCounts.get(candidateId) ?? 0;
          if (count < bestCount) {
            bestCount = count;
            bestId = candidateId;
          }
        }
        selectedAgentId = bestId;
      } else {
        // Sequential (Next in List)
        const eligibleSet = new Set(eligibleAgentIds);
        const anchorAgentId =
          currentAgentId && orderedAgentIds.includes(currentAgentId)
            ? currentAgentId
            : rulePointers.get(ruleIdStr) || "";

        const anchorIndex = anchorAgentId ? orderedAgentIds.indexOf(anchorAgentId) : -1;
        const totalInOrder = orderedAgentIds.length;

        for (let offset = 1; offset <= totalInOrder; offset += 1) {
          const idx = (anchorIndex + offset + totalInOrder) % totalInOrder;
          const candidateId = orderedAgentIds[idx];
          if (eligibleSet.has(candidateId)) {
            selectedAgentId = candidateId;
            break;
          }
        }
      }

      const nextAgentUser = userMap.get(selectedAgentId);
      const nextAgentName = formatUserName(nextAgentUser);
      const nextAgentObjectId = new mongoose.Types.ObjectId(selectedAgentId);
      const toStatusLabel = await ensureStatusExists(rule.toStatus || "New");

      // Update pointers & in-memory counts for fair distribution across batches
      rulePointers.set(ruleIdStr, selectedAgentId);
      delta.lastAgentId = nextAgentObjectId;
      delta.rotated += 1;
      agentLeadCounts.set(selectedAgentId, (agentLeadCounts.get(selectedAgentId) || 0) + 1);
      if (currentAgentId && agentLeadCounts.has(currentAgentId)) {
        agentLeadCounts.set(currentAgentId, Math.max(0, (agentLeadCounts.get(currentAgentId) || 1) - 1));
      }

      const pastIdsToAdd = [nextAgentObjectId];
      if (currentAgentId && mongoose.Types.ObjectId.isValid(currentAgentId)) {
        pastIdsToAdd.push(new mongoose.Types.ObjectId(currentAgentId));
      }

      leadBulkOps.push({
        updateOne: {
          filter: { _id: lead._id },
          update: {
            $set: {
              agent: nextAgentObjectId,
              status: toStatusLabel,
              rotationCount: nextRotationCount,
              lastRotatedAt: now,
              lastRotationRuleId: rule._id,
              updatedAt: now,
            },
            $addToSet: {
              pastAgentIds: { $each: pastIdsToAdd },
            },
          },
        },
      });

      const stepNote = maxLimit > 0 ? `Rotation #${nextRotationCount}/${maxLimit}` : `Rotation #${nextRotationCount}`;
      const description = `Automation "${rule.name}": Lead moved from ${currentAgentName} (${enteredStatus}) → ${nextAgentName} with status "${toStatusLabel}" (${stepNote})`;

      activityDocs.push({
        leadId: lead._id,
        type: "assignment_change",
        isSystemGenerated: true,
        createdBy: {
          userName: `Automation (${rule.name})`,
          userRole: "system",
        },
        comment: description,
        changes: {
          field: "agent",
          oldValue: currentAgentName,
          newValue: nextAgentName,
          description,
        },
        metadata: {
          isAutomated: true,
          ruleId: String(rule._id),
          ruleName: rule.name,
          fromStatus: enteredStatus,
          toStatus: toStatusLabel,
          previousAgentId: currentAgentId,
          newAgentId: selectedAgentId,
          rotationCount: nextRotationCount,
        },
      });

      logDocs.push({
        ruleId: rule._id,
        ruleName: rule.name,
        leadId: lead._id,
        leadNumber: lead.leadNumber || null,
        leadName: `${lead.firstName || ""} ${lead.lastName || ""}`.trim() || lead.email || "Lead",
        leadEmail: lead.email || "",
        leadPhone: lead.phone || "",
        fileName: lead.fileName || "",
        country: lead.country || "",
        brand: lead.Brand || "",
        outcome: "rotated",
        triggerType,
        fromStatus: enteredStatus,
        toStatus: toStatusLabel,
        fromAgent: {
          userId: currentAgentUser?._id || null,
          userName: currentAgentName,
        },
        toAgent: {
          userId: nextAgentUser._id,
          userName: nextAgentName,
        },
        rotationCount: nextRotationCount,
        maxAgentsPerLead: maxLimit,
        rotationMode: rule.rotationMode || "sequential",
        triggeredBy: actorInfo,
        reason: description,
        createdAt: now,
      });

      if (!sseByNewOwner.has(selectedAgentId)) {
        sseByNewOwner.set(selectedAgentId, []);
      }
      sseByNewOwner.get(selectedAgentId).push({
        ...lead,
        status: toStatusLabel,
        rotationCount: nextRotationCount,
        agent: {
          _id: nextAgentUser._id,
          firstName: nextAgentUser.firstName,
          lastName: nextAgentUser.lastName,
          email: nextAgentUser.email,
          role: nextAgentUser.role,
        },
      });

      summary.rotatedCount += 1;
      summary.resultsByLeadId.set(String(lead._id), {
        outcome: "rotated",
        ruleId: String(rule._id),
        ruleName: rule.name,
        fromStatus: enteredStatus,
        status: toStatusLabel,
        fromAgentName: currentAgentName,
        toAgentName: nextAgentName,
        agent: {
          _id: nextAgentUser._id,
          firstName: nextAgentUser.firstName,
          lastName: nextAgentUser.lastName,
          email: nextAgentUser.email,
          role: nextAgentUser.role,
        },
        rotationCount: nextRotationCount,
      });
    }

    // Execute database writes in parallel batches
    if (leadBulkOps.length > 0) {
      await Lead.bulkWrite(leadBulkOps, { ordered: false });
    }

    const writePromises = [];

    if (activityDocs.length > 0) {
      writePromises.push(
        (async () => {
          const Activity = await getActivityModel();
          for (let i = 0; i < activityDocs.length; i += 1000) {
            await Activity.insertMany(activityDocs.slice(i, i + 1000), { ordered: false });
          }
        })().catch((err) => console.error("Automation activity insert error:", err))
      );
    }

    if (logDocs.length > 0) {
      writePromises.push(
        (async () => {
          const Log = await getLeadAutomationLogModel();
          for (let i = 0; i < logDocs.length; i += 1000) {
            await Log.insertMany(logDocs.slice(i, i + 1000), { ordered: false });
          }
        })().catch((err) => console.error("Automation log insert error:", err))
      );
    }

    // Update rule telemetry stats & round-robin pointer
    for (const [ruleIdStr, delta] of ruleStatsDelta.entries()) {
      if (delta.rotated > 0 || delta.exhausted > 0) {
        const updateDoc = {
          $inc: {
            "stats.totalRotated": delta.rotated,
            "stats.totalExhausted": delta.exhausted,
          },
          $set: {
            "stats.lastTriggeredAt": now,
            ...(delta.lastAgentId ? { lastAssignedAgentId: delta.lastAgentId } : {}),
          },
        };
        writePromises.push(Rule.updateOne({ _id: ruleIdStr }, updateDoc).catch(() => {}));
      }
    }

    await Promise.all(writePromises);

    // Notify receiving agents via SSE
    for (const [ownerId, assignedLeads] of sseByNewOwner.entries()) {
      try {
        publishToUser(ownerId, "leads.refilled", {
          batchId: String(new mongoose.Types.ObjectId()),
          leads: assignedLeads,
        });
      } catch (e) {
        // Ignore SSE errors
      }
    }

    return summary;
  } catch (err) {
    console.error("Error in processLeadsForRotation:", err);
    return summary;
  }
};

/**
 * Manually runs a specific rule immediately across all existing leads
 * that match the rule's `fromStatus` and list filters.
 */
const runRuleOnExistingLeads = async (ruleId, actor = null, maxBatch = 500) => {
  const Rule = await getLeadAutomationRuleModel();
  const rule = await Rule.findById(ruleId).lean();
  if (!rule) {
    return { success: false, msg: "Automation rule not found" };
  }
  if (!Array.isArray(rule.agentIds) || rule.agentIds.length === 0) {
    return { success: false, msg: "Select at least one agent in rotation before running this rule" };
  }

  const Lead = await getLeadModel();
  const escapedFrom = String(rule.fromStatus || "").trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const query = {
    isDeleted: false,
    status: { $regex: new RegExp(`^${escapedFrom}$`, "i") },
  };

  if (rule.listMode === "selected" && Array.isArray(rule.fileNames) && rule.fileNames.length > 0) {
    query.fileName = { $in: rule.fileNames };
  }
  if (Array.isArray(rule.countries) && rule.countries.length > 0) {
    query.country = { $in: rule.countries };
  }
  if (Array.isArray(rule.brands) && rule.brands.length > 0) {
    query.Brand = { $in: rule.brands };
  }
  if (Array.isArray(rule.sources) && rule.sources.length > 0) {
    query.source = { $in: rule.sources };
  }

  const matchingLeads = await Lead.find(query)
    .sort({ updatedAt: 1, createdAt: 1 })
    .limit(Math.min(1000, Math.max(1, Number(maxBatch) || 500)))
    .select("_id")
    .lean();

  if (!matchingLeads.length) {
    return {
      success: true,
      matchedCount: 0,
      rotatedCount: 0,
      exhaustedCount: 0,
      msg: `No existing leads currently have status "${rule.fromStatus}" matching this rule's filters.`,
    };
  }

  // Temporarily ensure rule is treated as active for manual run even if toggled off
  const wasInactive = !rule.active;
  if (wasInactive) {
    await Rule.updateOne({ _id: rule._id }, { $set: { active: true } });
  }

  try {
    const summary = await processLeadsForRotation(
      matchingLeads,
      rule.fromStatus,
      actor,
      "manual_run",
      String(rule._id)
    );
    return {
      success: true,
      matchedCount: summary.matchedCount,
      rotatedCount: summary.rotatedCount,
      exhaustedCount: summary.exhaustedCount,
      skippedCapacityCount: summary.skippedCapacityCount,
      msg: `Processed ${summary.matchedCount} lead(s): ${summary.rotatedCount} rotated to next agent ("${rule.toStatus}")${
        summary.exhaustedCount ? `, ${summary.exhaustedCount} marked "${rule.finalStatus || "Exhausted"}"` : ""
      }${
        summary.skippedCapacityCount
          ? `, ${summary.skippedCapacityCount} skipped (eligible agents reached max leads)`
          : ""
      }.`,
    };
  } finally {
    if (wasInactive) {
      await Rule.updateOne({ _id: rule._id }, { $set: { active: false } });
    }
  }
};

let scheduledRotationRunning = false;

/**
 * Background scheduler: Finds active rules with delayMinutes > 0 and rotates
 * leads that have been waiting in `fromStatus` for at least `delayMinutes`.
 */
const runDueScheduledRotations = async () => {
  if (scheduledRotationRunning) return;
  scheduledRotationRunning = true;
  try {
    const Rule = await getLeadAutomationRuleModel();
    const dueRules = await Rule.find({
      active: true,
      delayMinutes: { $gt: 0 },
      "agentIds.0": { $exists: true },
    })
      .sort({ priority: 1, createdAt: 1 })
      .lean();

    if (!dueRules.length) return;

    const Lead = await getLeadModel();
    const nowMs = Date.now();

    for (const rule of dueRules) {
      const delayMs = Math.max(1, Number(rule.delayMinutes) || 0) * 60 * 1000;
      const cutoffDate = new Date(nowMs - delayMs);
      const escapedFrom = String(rule.fromStatus || "").trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (!escapedFrom) continue;

      const query = {
        isDeleted: false,
        status: { $regex: new RegExp(`^${escapedFrom}$`, "i") },
        updatedAt: { $lte: cutoffDate },
      };

      if (rule.listMode === "selected" && Array.isArray(rule.fileNames) && rule.fileNames.length > 0) {
        query.fileName = { $in: rule.fileNames };
      }
      if (Array.isArray(rule.countries) && rule.countries.length > 0) {
        query.country = { $in: rule.countries };
      }
      if (Array.isArray(rule.brands) && rule.brands.length > 0) {
        query.Brand = { $in: rule.brands };
      }
      if (Array.isArray(rule.sources) && rule.sources.length > 0) {
        query.source = { $in: rule.sources };
      }

      const dueLeads = await Lead.find(query)
        .sort({ updatedAt: 1 })
        .limit(300)
        .select("_id")
        .lean();

      if (dueLeads.length > 0) {
        await processLeadsForRotation(
          dueLeads,
          rule.fromStatus,
          null,
          "scheduled",
          String(rule._id)
        );
      }
    }
  } catch (err) {
    console.error("Error in runDueScheduledRotations:", err);
  } finally {
    scheduledRotationRunning = false;
  }
};

module.exports = {
  ensureStatusExists,
  ensureRotationStatuses,
  processLeadsForRotation,
  runRuleOnExistingLeads,
  runDueScheduledRotations,
};

