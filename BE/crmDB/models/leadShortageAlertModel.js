const mongoose = require("mongoose");
const connectCRMDatabase = require("../../config/crmDatabase");

const leadShortageAlertSchema = new mongoose.Schema({
  agentId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  agentName: { type: String, default: "" },
  agentRole: { type: String, default: "" },
  status: { type: String, enum: ["open", "ignored", "resolved"], default: "open", index: true },
  openedAt: { type: Date, default: Date.now },
  ignoredAt: { type: Date, default: null },
  resolvedAt: { type: Date, default: null },
}, { collection: "leadshortagealerts" });

leadShortageAlertSchema.index({ agentId: 1, status: 1 });

const getLeadShortageAlertModel = async () => {
  const crmDB = await connectCRMDatabase();
  return crmDB.models.LeadShortageAlert || crmDB.model("LeadShortageAlert", leadShortageAlertSchema);
};

module.exports = getLeadShortageAlertModel;
