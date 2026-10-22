const mongoose = require("mongoose");
const connectCRMDatabase = require("../../config/crmDatabase");

const chatConversationSchema = new mongoose.Schema(
  {
    pairKey: { type: String, required: true, unique: true, index: true },
    participantIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "user", required: true }],
    lastMessageAt: { type: Date, default: null },
    lastMessagePreview: { type: String, default: "" },
    lastMessageId: { type: mongoose.Schema.Types.ObjectId, default: null },
    recycleClearedAt: { type: Date, default: null },
    removedBy: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "user" },
        removedAt: { type: Date, default: Date.now },
      },
    ],
    reopenedBy: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "user" },
        reopenedAt: { type: Date, default: Date.now },
      },
    ],
    pinnedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "user" }],
    archivedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "user" }],
    mutedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "user" }],
  },
  { timestamps: true }
);

const getChatConversationModel = async () => {
  const crmDB = await connectCRMDatabase();
  return crmDB.models.ChatConversation || crmDB.model("ChatConversation", chatConversationSchema);
};

module.exports = getChatConversationModel;
