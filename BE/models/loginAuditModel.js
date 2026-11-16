const mongoose = require("mongoose");

const loginAuditSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "user", default: null, index: true },
  email: { type: String, default: "", index: true },
  name: { type: String, default: "" },
  role: { type: String, default: "", index: true },
  success: { type: Boolean, default: false, index: true },
  kind: { type: String, default: "login", index: true },
  reason: { type: String, default: "" },
  source: { type: String, default: "app" },
  ip: { type: String, default: "" },
  place: {
    label: { type: String, default: "" },
    city: { type: String, default: "" },
    region: { type: String, default: "" },
    country: { type: String, default: "" },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    timezone: { type: String, default: "" },
    isp: { type: String, default: "" },
  },
  device: {
    type: { type: String, default: "" },
    os: { type: String, default: "" },
    browser: { type: String, default: "" },
    userAgent: { type: String, default: "" },
  },
  createdAt: { type: Date, default: Date.now, index: true },
});

module.exports = mongoose.model("loginAudit", loginAuditSchema);
