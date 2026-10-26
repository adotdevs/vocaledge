const mongoose = require("mongoose");
const connectCRMDatabase = require("../../config/crmDatabase");

const chatCallSchema = new mongoose.Schema({
  callId: { type: String, default: "" },
  conversationId: { type: String, default: "" },
  fromId: { type: String, default: "" },
  fromName: { type: String, default: "" },
  toId: { type: String, default: "" },
  toName: { type: String, default: "" },
  participantIds: [{ type: String }],
  status: { type: String, default: "missed" },
  durationSec: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

chatCallSchema.index({ participantIds: 1, createdAt: -1 });
chatCallSchema.index({ conversationId: 1, createdAt: -1 });

const getChatCallModel = async () => {
  const crmDB = await connectCRMDatabase();
  return crmDB.models.ChatCall || crmDB.model("ChatCall", chatCallSchema);
};

module.exports = getChatCallModel;
