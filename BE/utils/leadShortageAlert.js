const User = require("../models/userModel");
const { publishToUsers } = require("./chatSse");
const getLeadShortageAlertModel = require("../crmDB/models/leadShortageAlertModel");

const agentName = (user) => `${user?.firstName || ""} ${user?.lastName || ""}`.trim() || user?.email || "Agent";

const notifySuperAdmins = async (event, payload) => {
  const supers = await User.find({ role: "superadmin" }).select("_id").lean();
  publishToUsers(supers.map((user) => user._id), event, payload);
};

const openShortageAlert = async (owner) => {
  if (!owner?._id) return null;
  const UserRestriction = require("../models/usersRestrictions");
  const settings = await UserRestriction.findOne().select("autoAssignNewLeads").lean();
  if (settings && settings.autoAssignNewLeads === false) return null;
  const fresh = await User.findById(owner._id).select("leadAutomation").lean();
  if (fresh?.leadAutomation?.enabled === false) return null;
  const Alert = await getLeadShortageAlertModel();
  const agentId = owner._id;
  const open = await Alert.findOne({ agentId, status: "open" }).lean();
  if (open) return open;
  const latest = await Alert.findOne({ agentId }).sort({ openedAt: -1 }).lean();
  if (latest?.status === "ignored") return null;

  let alert = null;
  try {
    alert = await Alert.create({
      agentId,
      agentName: agentName(owner),
      agentRole: owner.role || "",
      status: "open",
      openedAt: new Date(),
    });
  } catch (error) {
    console.error("Lead shortage alert failed, retrying:", error.message);
    alert = await Alert.create({
      agentId,
      agentName: agentName(owner),
      agentRole: owner.role || "",
      status: "open",
      openedAt: new Date(),
    });
  }
  const plain = alert.toObject();
  console.log(`Lead shortage alert saved for ${agentName(owner)}`);
  return plain;
};

const publishOpenShortageAlerts = async () => {
  const Alert = await getLeadShortageAlertModel();
  const alerts = await Alert.find({ status: "open" }).sort({ openedAt: 1 }).lean();
  if (alerts.length) await notifySuperAdmins("leads.shortage", { alerts });
  return alerts;
};

const clearOpenShortageAlerts = async (agentId) => {
  const Alert = await getLeadShortageAlertModel();
  const query = { status: "open" };
  if (agentId) query.agentId = agentId;
  const result = await Alert.updateMany(query, { $set: { status: "resolved", resolvedAt: new Date() } });
  if (result.modifiedCount) {
    await notifySuperAdmins("leads.shortage.resolved", { agentId: agentId ? String(agentId) : "all" });
  }
};

const resolveShortageAlert = async (agentId) => {
  if (!agentId) return;
  const Alert = await getLeadShortageAlertModel();
  const result = await Alert.updateMany(
    { agentId, status: { $in: ["open", "ignored"] } },
    { $set: { status: "resolved", resolvedAt: new Date() } }
  );
  if (result.modifiedCount) {
    await notifySuperAdmins("leads.shortage.resolved", { agentId: String(agentId) });
  }
};

module.exports = {
  openShortageAlert,
  resolveShortageAlert,
  clearOpenShortageAlerts,
  publishOpenShortageAlerts,
};
