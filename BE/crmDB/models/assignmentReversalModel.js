// One row per "reverse assignment" run, so the super admin can see what was sent back, when, and by whom.
// The leads themselves keep a history entry each (Activity, type assignment_change, metadata.batchId).
const mongoose = require("mongoose");
const connectCRMDatabase = require("../../config/crmDatabase");

const agentSchema = new mongoose.Schema(
  {
    agentId: { type: mongoose.Schema.Types.ObjectId },
    name: { type: String, default: "" },
    role: { type: String, default: "" },
    count: { type: Number, default: 0 },
  },
  { _id: false }
);

const reversalSchema = new mongoose.Schema({
  status: { type: String, required: true },
  createdBy: {
    userId: { type: mongoose.Schema.Types.ObjectId },
    userName: { type: String, default: "" },
    userRole: { type: String, default: "" },
  },
  selectedCount: { type: Number, default: 0 }, // leads in the plan when the button was pressed
  movedCount: { type: Number, default: 0 }, // leads that really went back
  notMovedCount: { type: Number, default: 0 }, // leads that changed in the meantime, or could not be written
  stoppedBecause: { type: String, default: "" },
  agents: { type: [agentSchema], default: [] },
  createdAt: { type: Date, default: Date.now },
});

reversalSchema.index({ createdAt: -1 });

const getAssignmentReversalModel = async () => {
  const crmDB = await connectCRMDatabase();
  return crmDB.model("LeadAssignmentReversal", reversalSchema);
};

module.exports = getAssignmentReversalModel;
module.exports.getAssignmentReversalModel = getAssignmentReversalModel;
