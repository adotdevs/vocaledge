const cloudinary = require("cloudinary").v2;
const multer = require("multer");
const catchAsyncErrors = require("../middlewares/catchAsyncErrors");
const chat = require("../utils/chatService");

const ALLOWED = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
}).array("files", 5);

const runUpload = (req, res) =>
  new Promise((resolve, reject) => {
    upload(req, res, (error) => (error ? reject(error) : resolve()));
  });

const fail = (res, error) => {
  const status = error.status || (error.code === "LIMIT_FILE_SIZE" ? 413 : 500);
  return res.status(status).json({ success: false, msg: error.message || "Chat request failed" });
};

const storeFile = (file) =>
  new Promise((resolve, reject) => {
    const resourceType = file.mimetype.startsWith("image/") ? "image" : "raw";
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "crm-chat",
        resource_type: resourceType,
        public_id: `${Date.now()}_${(file.originalname || "file").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80)}`,
      },
      (error, result) => (error ? reject(error) : resolve(result))
    );
    stream.end(file.buffer);
  });

const chatSse = require("../utils/chatSse");

const emitChat = (event, payload, rooms = []) => {
  chatSse.emitToRooms(event, payload, rooms).catch((error) => {
    console.error("Chat SSE emit failed:", error.message);
  });
};

exports.emitChat = emitChat;

exports.chatAgents = catchAsyncErrors(async (req, res) => {
  try {
    const agents = await chat.listEligibleAgents(req.user, req.query.search || "");
    res.json({ success: true, agents });
  } catch (error) {
    fail(res, error);
  }
});

exports.chatConversations = catchAsyncErrors(async (req, res) => {
  try {
    const conversations = await chat.listConversations(req.user);
    res.json({ success: true, conversations });
  } catch (error) {
    fail(res, error);
  }
});

exports.chatUnreadPopups = catchAsyncErrors(async (req, res) => {
  try {
    const messages = await chat.listUnreadPopups(req.user);
    res.json({ success: true, messages });
  } catch (error) {
    fail(res, error);
  }
});

exports.openChat = catchAsyncErrors(async (req, res) => {
  try {
    const opened = await chat.findOrCreateConversation(req.user, req.body.userId);
    const messages = await chat.listMessages(req.user, opened.conversation._id);
    emitChat("chat.conversation.created", { conversationId: opened.conversation._id }, [
      `user:${req.user._id}`,
      `user:${opened.other._id}`,
    ]);
    res.json({ success: true, conversationId: opened.conversation._id, other: chat.publicUser(opened.other), ...messages });
  } catch (error) {
    fail(res, error);
  }
});

exports.chatMessages = catchAsyncErrors(async (req, res) => {
  try {
    const result = await chat.listMessages(req.user, req.params.id, {
      before: req.query.before,
      search: req.query.search,
      admin: req.user.role === "superadmin" && req.query.admin === "1",
    });
    if (result.deliveredIds?.length) {
      emitChat("chat.message.delivered", {
        conversationId: result.conversationId,
        messageIds: result.deliveredIds,
        deliveredAt: new Date(),
        userId: req.user._id,
      }, [`conversation:${result.conversationId}`]);
    }
    res.json({ success: true, ...result });
  } catch (error) {
    fail(res, error);
  }
});

exports.sendChatMessage = catchAsyncErrors(async (req, res) => {
  try {
    await runUpload(req, res);
    const files = [];
    for (const file of req.files || []) {
      if (!ALLOWED.has(file.mimetype)) {
        return res.status(400).json({ success: false, msg: "This file type is not allowed" });
      }
      const stored = await storeFile(file);
      files.push({
        publicId: stored.public_id,
        url: stored.secure_url,
        resourceType: stored.resource_type,
        format: stored.format,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
      });
    }
    const result = await chat.sendMessage(req.user, {
      conversationId: req.body.conversationId,
      recipientId: req.body.userId,
      body: req.body.body,
      clientKey: req.body.clientKey,
      replyTo: req.body.replyTo || null,
      attachments: files,
    });
    const otherId = chat.otherParticipantId(result.conversation, req.user._id);
    emitChat("chat.message.created", { message: result.message }, [
      `conversation:${result.conversation._id}`,
      `user:${req.user._id}`,
      `user:${otherId}`,
    ]);
    if (!result.duplicate && otherId) {
      emitChat("chat.notification.created", {
        conversationId: String(result.conversation._id),
        message: result.message,
      }, [`user:${String(otherId)}`]);
    }
    res.json({ success: true, ...result });
  } catch (error) {
    fail(res, error);
  }
});

exports.editChatMessage = catchAsyncErrors(async (req, res) => {
  try {
    const result = await chat.editMessage(req.user, req.params.id, req.body.body, req.body.reason);
    emitChat("chat.message.edited", result, [`conversation:${result.conversationId}`]);
    res.json({ success: true, ...result });
  } catch (error) {
    fail(res, error);
  }
});

exports.hideChatMessage = catchAsyncErrors(async (req, res) => {
  try {
    const result = await chat.deleteForMe(req.user, req.params.id);
    res.json({ success: true, ...result });
  } catch (error) {
    fail(res, error);
  }
});

exports.deleteChatMessage = catchAsyncErrors(async (req, res) => {
  try {
    const result = await chat.deleteForEveryone(req.user, req.params.id, req.body.reason);
    emitChat("chat.message.deleted", result, [`conversation:${result.conversationId}`]);
    res.json({ success: true, ...result });
  } catch (error) {
    fail(res, error);
  }
});

exports.deliveredChat = catchAsyncErrors(async (req, res) => {
  try {
    const result = await chat.markDelivered(req.user, req.body.messageIds || []);
    const rooms = [
      ...(result.conversationIds || []).map((conversationId) => `conversation:${conversationId}`),
      ...(result.senderIds || []).map((senderId) => `user:${senderId}`),
      `user:${req.user._id}`,
    ];
    emitChat("chat.message.delivered", {
      messageIds: result.messageIds,
      deliveredAt: result.deliveredAt,
      userId: req.user._id,
    }, rooms);
    res.json({ success: true, ...result });
  } catch (error) {
    fail(res, error);
  }
});

exports.seenChat = catchAsyncErrors(async (req, res) => {
  try {
    const result = await chat.markSeen(req.user, req.params.id);
    emitChat("chat.message.seen", { ...result, seenAt: new Date(), userId: req.user._id }, [`conversation:${result.conversationId}`]);
    res.json({ success: true, ...result });
  } catch (error) {
    fail(res, error);
  }
});

exports.reactChatMessage = catchAsyncErrors(async (req, res) => {
  try {
    const result = await chat.reactToMessage(req.user, req.params.id, req.body.emoji);
    emitChat("chat.message.edited", result, [`conversation:${result.conversationId}`]);
    res.json({ success: true, ...result });
  } catch (error) {
    fail(res, error);
  }
});

exports.removeChatConversation = catchAsyncErrors(async (req, res) => {
  try {
    await chat.removeConversationForUser(req.user, req.params.id);
    res.json({ success: true });
  } catch (error) {
    fail(res, error);
  }
});

exports.flagChatConversation = catchAsyncErrors(async (req, res) => {
  try {
    const field = ["pinnedBy", "archivedBy", "mutedBy"].includes(req.body.field) ? req.body.field : "pinnedBy";
    const result = await chat.toggleFlag(req.user, req.params.id, field);
    res.json({ success: true, ...result });
  } catch (error) {
    fail(res, error);
  }
});

exports.adminConversations = catchAsyncErrors(async (req, res) => {
  if (req.user.role !== "superadmin") return res.status(403).json({ success: false, msg: "Super admin only" });
  const conversations = await chat.listAllConversations();
  res.json({ success: true, conversations });
});

exports.adminRecycle = catchAsyncErrors(async (req, res) => {
  if (req.user.role !== "superadmin") return res.status(403).json({ success: false, msg: "Super admin only" });
  const bin = await chat.listRecycleBin();
  res.json({ success: true, ...bin });
});

exports.adminClearRecycleConversation = catchAsyncErrors(async (req, res) => {
  if (req.user.role !== "superadmin") return res.status(403).json({ success: false, msg: "Super admin only" });
  try {
    const result = await chat.clearRecycleConversation(req.params.id);
    res.json({ success: true, ...result });
  } catch (error) {
    fail(res, error);
  }
});

exports.adminPurgeRecycleMessage = catchAsyncErrors(async (req, res) => {
  if (req.user.role !== "superadmin") return res.status(403).json({ success: false, msg: "Super admin only" });
  try {
    const result = await chat.purgeRecycleMessage(req.params.id);
    res.json({ success: true, ...result });
  } catch (error) {
    fail(res, error);
  }
});

exports.adminRestore = catchAsyncErrors(async (req, res) => {
  if (req.user.role !== "superadmin") return res.status(403).json({ success: false, msg: "Super admin only" });
  const message = await chat.restoreMessage(req.params.id);
  emitChat("chat.message.edited", { conversationId: message.conversationId, messageId: message._id }, [`conversation:${message.conversationId}`]);
  res.json({ success: true });
});

exports.chatStream = (req, res) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof res.flushHeaders === "function") res.flushHeaders();
  // A padded comment forces proxies to release the first chunk.
  res.write(`:${" ".repeat(2048)}\n\n`);
  res.write(`event: chat.connected\ndata: ${JSON.stringify({ ok: true })}\n\n`);

  const remove = chatSse.addClient(req.user, res);
  const heartbeat = setInterval(() => {
    if (res.writableEnded || res.destroyed) return;
    try {
      res.write(`event: chat.ping\ndata: ${JSON.stringify({ t: Date.now() })}\n\n`);
    } catch (error) {
      clearInterval(heartbeat);
    }
  }, 20000);

  const close = () => {
    clearInterval(heartbeat);
    remove();
  };
  req.on("close", close);
};

exports.chatTyping = catchAsyncErrors(async (req, res) => {
  try {
    const getChatConversationModel = require("../crmDB/models/chatConversationModel");
    const ChatConversation = await getChatConversationModel();
    const record = await ChatConversation.findById(req.params.id).select("participantIds").lean();
    if (!record) return res.status(404).json({ success: false, msg: "Conversation not found" });
    const mine = String(req.user._id);
    if (!(record.participantIds || []).some((id) => String(id) === mine)) {
      return res.status(403).json({ success: false, msg: "You are not part of this conversation" });
    }
    const others = (record.participantIds || []).map((id) => String(id)).filter((id) => id !== mine);
    const active = req.body.active !== false;
    emitChat(active ? "chat.typing.started" : "chat.typing.stopped", {
      conversationId: String(req.params.id),
      userId: mine,
      name: `${req.user.firstName || ""} ${req.user.lastName || ""}`.trim(),
    }, others.map((id) => `user:${id}`));
    res.json({ success: true });
  } catch (error) {
    fail(res, error);
  }
});

exports.syncChatAccess = (userId, enabled) => {
  emitChat(enabled ? "chat.permission.granted" : "chat.permission.revoked", { userId: String(userId) }, [`user:${userId}`]);
  emitChat("chat.contact.availability_changed", { userId: String(userId), available: Boolean(enabled) });
  if (!enabled) chatSse.disconnectUser(userId);
};
