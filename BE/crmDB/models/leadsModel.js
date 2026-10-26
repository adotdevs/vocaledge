// models/Lead.js
const mongoose = require("mongoose");
const connectCRMDatabase = require("../../config/crmDatabase");

const noteSchema = new mongoose.Schema({
  text: String,
  author: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  createdAt: { type: Date, default: Date.now },
});

const leadSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  email: String,
  phone: String,
  country: String,
  Brand: String,
  fileName: { type: String, default: "" },
  Address: String,
  agent: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  status: {
    type: String,
    default: "New",
  },
  // Optional fields for public form submissions (e.g. takebackanalytics.com)
  remarks: { type: String, default: null }, // Where the lead came from, e.g. "Takeback Analytics website form"
  source: { type: String, default: null }, // e.g. "takebackanalytics"
  caseNotes: { type: String, default: null }, // "What happened to you (Case ID)"
  lossRange: { type: String, default: null }, // "0-10K", "10K-30K", etc.
  notes: [noteSchema],
  callHistory: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Call' }],
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null },
  uploadBatchId: { type: mongoose.Schema.Types.ObjectId, default: null },
  customerAge: { type: Number, default: null },
  amountLost: { type: Number, default: null },
  amountLostWhen: { type: String, default: "" },
  registeredToPlatform: { type: String, enum: ["", "yes", "no"], default: "" },
  activeTradingPlatform: { type: String, enum: ["", "yes", "no"], default: "" },
  customerBanks: { type: [String], default: [] },
  additionalPhone: { type: String, default: "" },
  screenSharing: { type: String, enum: ["", "yes", "no"], default: "" },
  screenSharingId: { type: String, default: "" },
  customerPotential: { type: Number, default: null },
  refillBatch: { type: mongoose.Schema.Types.ObjectId, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date },
});

leadSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

// Create indexes for better performance
leadSchema.index({ email: 1, isDeleted: 1 }); // Compound index for duplicate checks
leadSchema.index({ agent: 1, isDeleted: 1 }); // For filtering by agent
leadSchema.index({ status: 1 }); // For filtering by status
leadSchema.index({ createdAt: -1 }); // For sorting by date
leadSchema.index({ isDeleted: 1, createdAt: -1 });
leadSchema.index({ isDeleted: 1, agent: 1, createdAt: -1 });
leadSchema.index({ isDeleted: 1, status: 1, createdAt: -1 });
leadSchema.index({ isDeleted: 1, status: 1, agent: 1 });
leadSchema.index({ source: 1 }); // For filtering public form leads (e.g. takebackanalytics)
leadSchema.index({ uploadBatchId: 1, isDeleted: 1 });

const getLeadModel = async () => {
  const crmDB = await connectCRMDatabase();
  return crmDB.model("Lead", leadSchema);
};

module.exports = getLeadModel;
module.exports.getLeadModel = getLeadModel;
