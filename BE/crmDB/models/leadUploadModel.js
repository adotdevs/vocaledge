const mongoose = require("mongoose");
const connectCRMDatabase = require("../../config/crmDatabase");

const leadUploadSchema = new mongoose.Schema({
  fileName: { type: String, default: "upload.csv" },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  uploadedByName: { type: String, default: "" },
  uploadedByRole: { type: String, default: "" },
  leadCount: { type: Number, default: 0 },
  skippedCount: { type: Number, default: 0 },
  deletedAt: { type: Date, default: null },
  deletedCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

leadUploadSchema.index({ createdAt: -1 });

const getLeadUploadModel = async () => {
  const crmDB = await connectCRMDatabase();
  return crmDB.model("LeadUpload", leadUploadSchema);
};

module.exports = getLeadUploadModel;
