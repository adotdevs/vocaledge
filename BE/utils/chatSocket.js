const jwt = require("jsonwebtoken");
const User = require("../models/userModel");
const chat = require("./chatService");

const tokenFromHandshake = (socket) => {
  const header = socket.handshake.auth?.token || socket.handshake.headers?.authorization || "";
  if (header.startsWith("Bearer ")) return header.slice(7);
  const cookie = socket.handshake.headers?.cookie || "";
  const match = cookie.match(/(?:^|;\s*)jwttoken=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : header;
};

const initChatSocket = (io) => {
  const nsp = io.of("/chat");
  global.chatNamespace = nsp;

  nsp.use(async (socket, next) => {
    try {
      const token = tokenFromHandshake(socket);
      if (!token) return next(new Error("Unauthorized"));
      const decoded = jwt.verify(token, process.env.SECRET_JWT);
      const user = await User.findById(decoded._id).select("+adminPermissions +permissions firstName lastName email role");
      if (!user || !chat.hasChatAccess(user)) return next(new Error("Chat access denied"));
      socket.user = user;
      next();
    } catch (error) {
      next(new Error("Unauthorized"));
    }
  });

  nsp.on("connection", async (socket) => {
    const userId = String(socket.user._id);
    socket.join(`user:${userId}`);
    const online = chat.setPresence(userId, socket.id, true);
    await User.findByIdAndUpdate(userId, { online: true, lastActivity: new Date() });
    if (online) nsp.emit("chat.presence.updated", { userId, online: true, lastOnline: null });

    socket.on("chat.conversation.join", (conversationId) => {
      if (conversationId) socket.join(`conversation:${conversationId}`);
    });

    socket.on("chat.typing.started", (payload) => {
      if (!payload?.conversationId) return;
      socket.to(`conversation:${payload.conversationId}`).emit("chat.typing.started", {
        conversationId: payload.conversationId,
        userId,
        name: `${socket.user.firstName || ""} ${socket.user.lastName || ""}`.trim(),
      });
    });

    socket.on("chat.typing.stopped", (payload) => {
      if (!payload?.conversationId) return;
      socket.to(`conversation:${payload.conversationId}`).emit("chat.typing.stopped", {
        conversationId: payload.conversationId,
        userId,
      });
    });

    socket.on("disconnect", async () => {
      const stillOnline = chat.setPresence(userId, socket.id, false);
      if (!stillOnline) {
        const lastOnline = new Date();
        await User.findByIdAndUpdate(userId, { lastOnline, online: false });
        nsp.emit("chat.presence.updated", { userId, online: false, lastOnline: lastOnline.toISOString() });
      }
    });
  });
};

module.exports = { initChatSocket };
