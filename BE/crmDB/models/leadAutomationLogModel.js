const mongoose = require("mongoose");
const connectCRMDatabase = require("../../config/crmDatabase");

const leadAutomationLogSchema = new mongoose.Schema(
  {
    ruleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LeadAutomationRule",
      index: true,
    },
    ruleName: {
      type: String,
      default: "",
    },
    leadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lead",
      index: true,
    },
    leadNumber: {
      type: Number,
      default: null,
    },
    leadName: {
      type: String,
      default: "",
    },
    leadEmail: {
      type: String,
      default: "",
    },
    leadPhone: {
      type: String,
      default: "",
    },
    fileName: {
      type: String,
      default: "",
    },
    country: {
      type: String,
      default: "",
    },
    brand: {
      type: String,
      default: "",
    },
    outcome: {
      type: String,
      enum: ["rotated", "exhausted"],
      default: "rotated",
      index: true,
    },
    triggerType: {
      type: String,
      enum: ["status_change", "bulk_status", "manual_run"],
      default: "status_change",
    },
    fromStatus: {
      type: String,
      default: "",
    },
    toStatus: {
      type: String,
      default: "",
    },
    fromAgent: {
      userId: { type: mongoose.Schema.Types.ObjectId, default: null },
      userName: { type: String, default: "Unassigned" },
    },
    toAgent: {
      userId: { type: mongoose.Schema.Types.ObjectId, default: null },
      userName: { type: String, default: "Unassigned" },
    },
    rotationCount: {
      type: Number,
      default: 1,
    },
    maxAgentsPerLead: {
      type: Number,
      default: 0,
    },
    rotationMode: {
      type: String,
      default: "sequential",
    },
    triggeredBy: {
      userId: { type: mongoose.Schema.Types.ObjectId, default: null },
      userName: { type: String, default: "System" },
      userRole: { type: String, default: "system" },
    },
    reason: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

leadAutomationLogSchema.index({ createdAt: -1 });
leadAutomationLogSchema.index({ ruleId: 1, createdAt: -1 });
leadAutomationLogSchema.index({ leadId: 1, createdAt: -1 });

const getLeadAutomationLogModel = async () => {
  const crmDB = await connectCRMDatabase();
  return crmDB.models.LeadAutomationLog || crmDB.model("LeadAutomationLog", leadAutomationLogSchema);
};

module.exports = getLeadAutomationLogModel;
module.exports.getLeadAutomationLogModel = getLeadAutomationLogModel;

