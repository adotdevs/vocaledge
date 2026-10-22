const mongoose = require("mongoose");
const connectCRMDatabase = require("../../config/crmDatabase");

const attachmentSchema = new mongoose.Schema(
  {
    publicId: String,
    url: String,
    resourceType: { type: String, default: "raw" },
    format: String,
    originalName: String,
    mimeType: String,
    size: Number,
  },
  { _id: true }
);

const chatMessageSchema = new mongoose.Schema(
  {
    conversationId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    senderName: { type: String, default: "" },
    body: { type: String, default: "", maxlength: 5000 },
    clientKey: { type: String, default: null },
    replyTo: { type: mongoose.Schema.Types.ObjectId, default: null },
    attachments: [attachmentSchema],
    reactions: [
      {
        userId: mongoose.Schema.Types.ObjectId,
        emoji: String,
        firstName: { type: String, default: "" },
        userName: { type: String, default: "" },
      },
    ],
    revisions: [
      {
        body: String,
        editedAt: Date,
        editedBy: mongoose.Schema.Types.ObjectId,
        editorName: String,
        reason: String,
        administrative: { type: Boolean, default: false },
      },
    ],
    receipts: [
      {
        userId: mongoose.Schema.Types.ObjectId,
        deliveredAt: Date,
        seenAt: Date,
      },
    ],
    hiddenFor: [{ type: mongoose.Schema.Types.ObjectId }],
    deletedForEveryoneAt: { type: Date, default: null },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
    deleteReason: { type: String, default: "" },
    administrativeDelete: { type: Boolean, default: false },
    purgedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

chatMessageSchema.index({ conversationId: 1, clientKey: 1 }, { unique: true, sparse: true });
chatMessageSchema.index({ conversationId: 1, createdAt: -1 });
chatMessageSchema.index({ conversationId: 1, purgedAt: 1, senderId: 1 });

const getChatMessageModel = async () => {
  const crmDB = await connectCRMDatabase();
  return crmDB.models.ChatMessage || crmDB.model("ChatMessage", chatMessageSchema);
};

module.exports = getChatMessageModel;
