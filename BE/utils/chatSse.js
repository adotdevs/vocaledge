const User = require("../models/userModel");
const chat = require("./chatService");
const getChatConversationModel = require("../crmDB/models/chatConversationModel");

const clients = new Map();

const writeEvent = (res, event, payload) => {
  const body = `data: ${JSON.stringify({ event, payload: payload || {} })}\n\n`;
  if (res.socket && !res.socket.destroyed) res.socket.setNoDelay(true);
  res.write(body);
  if (typeof res.flush === "function") res.flush();
};

const publishToUser = (userId, event, payload) => {
  const key = String(userId);
  if (global.io) {
    global.io.to(`user:${key}`).emit("chat.event", { event, payload: payload || {} });
  }
  const sockets = clients.get(key);
  if (!sockets || !sockets.size) return;
  sockets.forEach((res) => {
    if (res.writableEnded || res.destroyed) {
      sockets.delete(res);
      return;
    }
    try {
      writeEvent(res, event, payload);
    } catch (error) {
      sockets.delete(res);
    }
  });
  if (!sockets.size) clients.delete(String(userId));
};

const publishToUsers = (userIds, event, payload) => {
  const list = Array.isArray(userIds) ? userIds : Array.from(userIds || []);
  new Set(list.map((id) => String(id)).filter(Boolean)).forEach((userId) => {
    publishToUser(userId, event, payload);
  });
};

const emitToRooms = async (event, payload, rooms = []) => {
  const userIds = new Set();
  const conversationIds = [];
  (rooms || []).forEach((room) => {
    const name = String(room || "");
    if (name.startsWith("user:")) userIds.add(name.slice(5));
    else if (name.startsWith("conversation:")) conversationIds.push(name.slice("conversation:".length));
  });
  if (!userIds.size && !conversationIds.length) {
    clients.forEach((_sockets, userId) => userIds.add(userId));
  }
  if (conversationIds.length) {
    const ChatConversation = await getChatConversationModel();
    const conversations = await ChatConversation.find({ _id: { $in: conversationIds } })
      .select("participantIds")
      .lean();
    conversations.forEach((conversation) => {
      (conversation.participantIds || []).forEach((id) => userIds.add(String(id)));
    });
  }
  publishToUsers(userIds, event, payload);
};

const addClient = (user, res) => {
  const userId = String(user._id);
  const clientId = `sse:${Date.now()}:${Math.random().toString(16).slice(2)}`;
  const sockets = clients.get(userId) || new Set();
  const wasOffline = sockets.size === 0;
  res.chatSseId = clientId;
  sockets.add(res);
  clients.set(userId, sockets);
  chat.setPresence(userId, clientId, true);
  if (wasOffline) {
    User.findByIdAndUpdate(userId, { online: true, lastActivity: new Date() }).catch(() => {});
    publishToUsers([...clients.keys()], "chat.presence.updated", { userId, online: true, lastOnline: null });
  }
  return () => removeClient(userId, res);
};

const removeClient = (userId, res) => {
  const key = String(userId);
  const sockets = clients.get(key);
  if (sockets) {
    sockets.delete(res);
    if (!sockets.size) clients.delete(key);
  }
  if (res.chatSseId) chat.setPresence(key, res.chatSseId, false);
  if (!clients.has(key)) {
    const lastOnline = new Date();
    User.findByIdAndUpdate(key, { lastOnline, online: false }).catch(() => {});
    publishToUsers([...clients.keys()], "chat.presence.updated", {
      userId: key,
      online: false,
      lastOnline: lastOnline.toISOString(),
    });
  }
};

const disconnectUser = (userId) => {
  const sockets = clients.get(String(userId));
  if (!sockets) return;
  sockets.forEach((res) => {
    try {
      res.end();
    } catch (error) {
      // The browser already closed this stream.
    }
  });
  clients.delete(String(userId));
};

module.exports = {
  publishToUser,
  publishToUsers,
  emitToRooms,
  addClient,
  disconnectUser,
};
