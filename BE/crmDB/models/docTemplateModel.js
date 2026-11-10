const mongoose = require("mongoose");
const connectCRMDatabase = require("../../config/crmDatabase");

const fieldSchema = new mongoose.Schema({
  key: { type: String, required: true },
  label: { type: String, required: true },
  type: { type: String, enum: ["text", "number", "date", "textarea", "select"], default: "text" },
  required: { type: Boolean, default: false },
  options: { type: [String], default: [] },
  placeholder: { type: String, default: "" },
}, { _id: false });

const docTemplateSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  description: { type: String, default: "" },
  category: { type: String, default: "Correspondence" },
  html: { type: String, default: "" },
  fields: { type: [fieldSchema], default: [] },
  sortOrder: { type: Number, default: 0 },
  starter: { type: Boolean, default: false },
  customized: { type: Boolean, default: false },
  seedVersion: { type: Number, default: 0 },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

docTemplateSchema.index({ active: 1, sortOrder: 1 });
docTemplateSchema.index({ category: 1, title: 1 });

const getDocTemplateModel = async () => {
  const crmDB = await connectCRMDatabase();
  return crmDB.model("DocTemplate", docTemplateSchema);
};

module.exports = getDocTemplateModel;
