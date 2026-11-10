const mongoose = require("mongoose");
const connectCRMDatabase = require("../../config/crmDatabase");

const docGenerationSchema = new mongoose.Schema({
  templateKey: { type: String, required: true },
  templateTitle: { type: String, default: "" },
  leadId: { type: mongoose.Schema.Types.ObjectId, default: null },
  leadNumber: { type: Number, default: null },
  clientName: { type: String, default: "" },
  action: { type: String, enum: ["copy", "download", "pdf"], default: "pdf" },
  values: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdBy: { type: mongoose.Schema.Types.Mixed, default: null },
  createdAt: { type: Date, default: Date.now },
});

docGenerationSchema.index({ leadId: 1, createdAt: -1 });
docGenerationSchema.index({ createdAt: -1 });

const getDocGenerationModel = async () => {
  const crmDB = await connectCRMDatabase();
  return crmDB.model("DocGeneration", docGenerationSchema);
};

module.exports = getDocGenerationModel;
