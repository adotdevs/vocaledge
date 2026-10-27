const getChatCallModel = require("../crmDB/models/chatCallModel");

const calls = new Map();
const byUser = new Map();

const otherUser = (call, userId) => (call.from === userId ? call.to : call.from);

const userOnline = (io, userId) => {
  const room = io.sockets.adapter.rooms.get(`user:${userId}`);
  return Boolean(room && room.size);
};

const saveLog = (call, status, durationSec = 0) => {
  getChatCallModel().then((ChatCall) => ChatCall.create({
    callId: call.id,
    conversationId: call.conversationId || "",
    fromId: call.from,
    fromName: call.fromName || "",
    toId: call.to,
    toName: call.toName || "",
    participantIds: [call.from, call.to],
    status,
    durationSec,
  })).catch((error) => {
    console.error("Voice call log failed:", error.message);
  });
};

const attachVoice = (io, socket) => {
  const me = () => socket.data.userId;

  const send = (userId, payload) => {
    if (!userId) return;
    io.to(`user:${userId}`).emit("voice:signal", payload);
  };

  const snapshot = (call, userId) => {
    const outgoing = call.from === userId;
    return {
      type: "resume",
      callId: call.id,
      peerName: outgoing ? call.toName : call.fromName,
      conversationId: call.conversationId,
      status: call.status,
      connectedAt: call.connectedAt || 0,
      direction: outgoing ? "out" : "in",
    };
  };

  const finish = (callId, reason) => {
    const call = calls.get(String(callId || ""));
    if (!call) return null;
    clearTimeout(call.timer);
    clearTimeout(call.dropTimer);
    calls.delete(call.id);
    if (byUser.get(call.from) === call.id) byUser.delete(call.from);
    if (byUser.get(call.to) === call.id) byUser.delete(call.to);
    const durationSec = call.connectedAt ? Math.max(0, Math.round((Date.now() - call.connectedAt) / 1000)) : 0;
    let status = reason;
    if (reason === "ended") status = durationSec > 0 ? "completed" : "missed";
    if (reason === "rejected") status = "declined";
    send(call.from, { type: "ended", callId: call.id, reason, status, durationSec });
    send(call.to, { type: "ended", callId: call.id, reason, status, durationSec });
    saveLog(call, status, durationSec);
    return call;
  };

  socket.on("voice:signal", (message) => {
    const userId = me();
    const type = String(message?.type || "");
    const callId = String(message?.callId || "");
    if (!userId || !type) return;

    if (type === "invite") {
      const to = String(message.to || "");
      if (!to || to === userId || !callId) return;
      const User = require("../models/userModel");
      const { hasChatAccess } = require("./chatService");
      User.find({ _id: { $in: [userId, to] } }).select("role adminPermissions permissions").lean().then((rows) => {
        const people = new Map(rows.map((item) => [String(item._id), item]));
        if (!hasChatAccess(people.get(String(userId))) || !hasChatAccess(people.get(to))) {
          send(userId, { type: "ended", callId, reason: "unavailable", status: "cancelled" });
          return;
        }
        if (byUser.has(userId)) {
          const existing = calls.get(byUser.get(userId));
          if (existing) send(userId, snapshot(existing, userId));
          else byUser.delete(userId);
          if (existing) return;
        }
        const peerOnline = userOnline(io, to);
        const call = {
          id: callId,
          from: userId,
          to,
          conversationId: String(message.conversationId || ""),
          fromName: String(message.fromName || "Agent").slice(0, 80),
          toName: String(message.toName || "Agent").slice(0, 80),
          status: peerOnline ? "ringing" : "offline",
        };
        if (!peerOnline) {
          send(userId, { type: "offline", callId });
          saveLog(call, "offline", 0);
          return;
        }
        if (byUser.has(to)) {
          send(userId, { type: "busy", callId, reason: "busy" });
          saveLog(call, "busy", 0);
          return;
        }
        call.timer = setTimeout(() => finish(callId, "missed"), 45000);
        calls.set(callId, call);
        byUser.set(userId, callId);
        byUser.set(to, callId);
        send(userId, { type: "ringing", callId });
        send(to, {
          type: "invite",
          callId,
          conversationId: call.conversationId,
          from: userId,
          fromName: call.fromName,
        });
      }).catch((error) => {
        console.error("Voice invite check failed:", error.message);
        send(userId, { type: "ended", callId, reason: "unavailable", status: "cancelled" });
      });
      return;
    }

    if (type === "sync") {
      const existing = calls.get(byUser.get(userId) || "");
      if (existing) send(userId, snapshot(existing, userId));
      return;
    }

    const call = calls.get(callId);
    if (!call || (call.from !== userId && call.to !== userId)) return;
    const peer = otherUser(call, userId);

    if (type === "accept") {
      if (call.to !== userId || call.status !== "ringing") return;
      call.status = "active";
      call.connectedAt = Date.now();
      clearTimeout(call.timer);
      send(peer, { type: "accept", callId });
      return;
    }

    if (type === "reject") {
      if (call.to !== userId) return;
      finish(callId, "rejected");
      return;
    }

    if (type === "busy") {
      if (call.to !== userId || call.status !== "ringing") return;
      finish(callId, "busy");
      return;
    }

    if (type === "cancel") {
      if (call.from !== userId || call.status !== "ringing") return;
      finish(callId, "cancelled");
      return;
    }

    if (type === "hangup") {
      finish(callId, "ended");
      return;
    }

    if (type === "mute") {
      send(peer, { type: "mute", callId, muted: Boolean(message.muted) });
      return;
    }

    if (type === "camera") {
      send(peer, { type: "camera", callId, on: Boolean(message.on) });
      return;
    }

    if (type === "offer" || type === "answer" || type === "ice") {
      if (call.status !== "active" && type !== "ice") return;
      send(peer, {
        type,
        callId,
        sdp: message.sdp || null,
        candidate: message.candidate || null,
      });
    }
  });

  const current = calls.get(byUser.get(String(me() || "")) || "");
  if (current) {
    clearTimeout(current.dropTimer);
    send(me(), snapshot(current, me()));
  }

  socket.on("disconnect", () => {
    const userId = me();
    const call = calls.get(byUser.get(String(userId || "")) || "");
    if (!call) return;
    clearTimeout(call.dropTimer);
    call.dropTimer = setTimeout(() => {
      if (userOnline(io, userId)) return;
      if (!calls.has(call.id)) return;
      finish(call.id, "ended");
    }, 30000);
  });
};

module.exports = { attachVoice, dropUser };

function dropUser(userId) {
  const id = String(userId || "");
  const callId = byUser.get(id);
  if (!callId || !global.io) return;
  const call = calls.get(callId);
  if (!call) return;
  clearTimeout(call.timer);
  clearTimeout(call.dropTimer);
  calls.delete(call.id);
  if (byUser.get(call.from) === call.id) byUser.delete(call.from);
  if (byUser.get(call.to) === call.id) byUser.delete(call.to);
  const payload = { type: "ended", callId: call.id, reason: "ended", status: "ended", durationSec: 0 };
  global.io.to(`user:${call.from}`).emit("voice:signal", payload);
  global.io.to(`user:${call.to}`).emit("voice:signal", payload);
}
