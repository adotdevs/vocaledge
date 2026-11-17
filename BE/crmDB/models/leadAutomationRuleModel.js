const mongoose = require("mongoose");
const connectCRMDatabase = require("../../config/crmDatabase");

const leadAutomationRuleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 140,
    },
    description: {
      type: String,
      default: "",
      trim: true,
      maxlength: 500,
    },
    active: {
      type: Boolean,
      default: true,
      index: true,
    },
    priority: {
      type: Number,
      default: 0,
    },
    // Lead list scope: "all" = All Leads, "selected" = specific fileNames
    listMode: {
      type: String,
      enum: ["all", "selected"],
      default: "all",
    },
    fileNames: {
      type: [String],
      default: [],
    },
    countries: {
      type: [String],
      default: [],
    },
    brands: {
      type: [String],
      default: [],
    },
    sources: {
      type: [String],
      default: [],
    },
    // Trigger & Status transition
    fromStatus: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    toStatus: {
      type: String,
      required: true,
      trim: true,
      default: "New",
    },
    // Reassign timing: 0 = immediately on status change, > 0 = wait X minutes before reassigning
    delayMinutes: {
      type: Number,
      default: 0,
      min: 0,
      max: 43200,
    },
    // Ordered list of agents participating in rotation
    agentIds: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "User",
      default: [],
    },
    // Rotation strategy
    rotationMode: {
      type: String,
      enum: ["sequential", "least_assigned"],
      default: "sequential",
    },
    skipPreviousAgents: {
      type: Boolean,
      default: true,
    },
    // Recycling limits
    maxAgentsPerLead: {
      type: Number,
      default: 10,
      min: 0,
      max: 500,
    },
    finalStatus: {
      type: String,
      default: "Exhausted",
      trim: true,
    },
    unassignOnExhausted: {
      type: Boolean,
      default: false,
    },
    lastAssignedAgentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    stats: {
      totalRotated: { type: Number, default: 0 },
      totalExhausted: { type: Number, default: 0 },
      lastTriggeredAt: { type: Date, default: null },
    },
    createdBy: {
      userId: { type: mongoose.Schema.Types.ObjectId, default: null },
      userName: { type: String, default: "" },
    },
    updatedBy: {
      userId: { type: mongoose.Schema.Types.ObjectId, default: null },
      userName: { type: String, default: "" },
    },
  },
  { timestamps: true }
);

leadAutomationRuleSchema.index({ active: 1, fromStatus: 1, priority: 1, createdAt: 1 });

const getLeadAutomationRuleModel = async () => {
  const crmDB = await connectCRMDatabase();
  return crmDB.models.LeadAutomationRule || crmDB.model("LeadAutomationRule", leadAutomationRuleSchema);
};

module.exports = getLeadAutomationRuleModel;
module.exports.getLeadAutomationRuleModel = getLeadAutomationRuleModel;

