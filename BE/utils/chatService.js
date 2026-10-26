const mongoose = require("mongoose");
const User = require("../models/userModel");
const { hasCrmPermission } = require("./crmPermissions");
const { canEditOwnMessage, canDeleteForEveryone, isSuperAdmin } = require("./chatPolicy");
const getChatConversationModel = require("../crmDB/models/chatConversationModel");
const getChatMessageModel = require("../crmDB/models/chatMessageModel");

const UNAVAILABLE = "This contact is currently unavailable for messaging.";
const PRESENCE = new Map();

const displayName = (user) =>
  `${user?.firstName || ""} ${user?.lastName || ""}`.trim() || user?.email || "User";

const firstNameOf = (user) => (user?.firstName || "").trim() || displayName(user).split(/\s+/)[0] || "";

const hasChatAccess = (user) => Boolean(user) && (isSuperAdmin(user) || hasCrmPermission(user, "canAccessChat"));

const pairKeyFor = (a, b) => [String(a), String(b)].sort().join(":");

const publicUser = (user, onlineIds) => {
  const id = String(user._id);
  const socketOnline = onlineIds ? onlineIds.has(id) : PRESENCE.has(id);
  return {
    _id: user._id,
    firstName: user.firstName || "",
    lastName: user.lastName || "",
    email: user.email || "",
    role: user.role,
    online: socketOnline || user.online === true,
    lastOnline: user.lastOnline
      ? new Date(user.lastOnline).toISOString()
      : user.lastActivity
        ? new Date(user.lastActivity).toISOString()
        : null,
  };
};

const loadUsers = async (ids) => {
  const unique = [...new Set(ids.map(String))];
  if (!unique.length) return new Map();
  const users = await User.find({ _id: { $in: unique } })
    .select("firstName lastName email role adminPermissions permissions lastOnline lastActivity online status")
    .lean();
  return new Map(users.map((user) => [String(user._id), user]));
};

const eligibleQuery = (search) => {
  const access = {
    $or: [
      { role: "superadmin" },
      { role: "admin", "adminPermissions.canAccessChat": true },
      { role: "subadmin", "permissions.canAccessChat": true },
      { role: "manager", "adminPermissions.canAccessChat": true },
    ],
  };
  if (!search) return access;
  const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  return {
    $and: [
      access,
      { $or: [{ firstName: regex }, { lastName: regex }, { email: regex }] },
    ],
  };
};

const listEligibleAgents = async (actor, search = "") => {
  if (!hasChatAccess(actor)) {
    const error = new Error("Chat access is turned off for your account");
    error.status = 403;
    throw error;
  }
  const users = await User.find(eligibleQuery(String(search || "").trim()))
    .select("firstName lastName email role lastOnline lastActivity online")
    .limit(40)
    .lean();
  return users
    .filter((user) => String(user._id) !== String(actor._id))
    .map((user) => publicUser(user));
};

const assertChatPair = async (actor, otherId) => {
  if (!hasChatAccess(actor)) {
    const error = new Error("Chat access is turned off for your account");
    error.status = 403;
    throw error;
  }
  if (!mongoose.Types.ObjectId.isValid(otherId)) {
    const error = new Error("Contact not found");
    error.status = 404;
    throw error;
  }
  const other = await User.findById(otherId)
    .select("firstName lastName email role adminPermissions permissions lastOnline lastActivity")
    .lean();
  if (!other || !hasChatAccess(other)) {
    const error = new Error(UNAVAILABLE);
    error.status = 403;
    throw error;
  }
  if (String(other._id) === String(actor._id)) {
    const error = new Error("You cannot message yourself");
    error.status = 400;
    throw error;
  }
  return other;
};

const findOrCreateConversation = async (actor, otherId) => {
  const other = await assertChatPair(actor, otherId);
  const ChatConversation = await getChatConversationModel();
  const pairKey = pairKeyFor(actor._id, other._id);
  let conversation = await ChatConversation.findOne({ pairKey });
  if (!conversation) {
    conversation = await ChatConversation.create({
      pairKey,
      participantIds: [actor._id, other._id],
    });
  }
  conversation.reopenedBy = (conversation.reopenedBy || []).filter((item) => String(item.userId) !== String(actor._id));
  conversation.reopenedBy.push({ userId: actor._id, reopenedAt: new Date() });
  await conversation.save();
  return { conversation, other };
};

const isParticipant = (conversation, userId) =>
  (conversation.participantIds || []).some((id) => String(id) === String(userId));

const requireConversation = async (actor, conversationId, { allowAdmin = false } = {}) => {
  const ChatConversation = await getChatConversationModel();
  const conversation = await ChatConversation.findById(conversationId);
  if (!conversation) {
    const error = new Error("Conversation not found");
    error.status = 404;
    throw error;
  }
  if (!isParticipant(conversation, actor._id)) {
    if (!(allowAdmin && isSuperAdmin(actor))) {
      const error = new Error("You are not part of this conversation");
      error.status = 403;
      throw error;
    }
  } else if (!hasChatAccess(actor) && !isSuperAdmin(actor)) {
    const error = new Error("Chat access is turned off for your account");
    error.status = 403;
    throw error;
  }
  return conversation;
};

const otherParticipantId = (conversation, userId) =>
  (conversation.participantIds || []).find((id) => String(id) !== String(userId));

const serializeMessage = (message, viewerId) => {
  const hidden = (message.hiddenFor || []).some((id) => String(id) === String(viewerId));
  const deleted = Boolean(message.deletedForEveryoneAt) || Boolean(message.purgedAt);
  const mine = String(message.senderId) === String(viewerId);
  const receipts = message.receipts || [];
  const others = receipts.filter((item) => String(item.userId) !== String(message.senderId));
  const viewerReceipt = receipts.find((item) => String(item.userId) === String(viewerId));
  const deliveredAt = others.map((item) => item.deliveredAt).filter(Boolean).sort()[0] || null;
  const seenAt = others.map((item) => item.seenAt).filter(Boolean).sort()[0] || null;
  let state = "sent";
  if (seenAt) state = "seen";
  else if (deliveredAt) state = "delivered";
  return {
    _id: message._id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    senderName: message.senderName,
    clientKey: message.clientKey || null,
    body: hidden || deleted ? "" : message.body,
    attachments: hidden || deleted ? [] : message.attachments || [],
    replyTo: message.replyTo || null,
    reactions: hidden || deleted ? [] : (message.reactions || []).map((item) => {
      const firstName = item.firstName || (item.userName || "").trim().split(/\s+/)[0] || "";
      return {
        userId: item.userId ? String(item.userId) : "",
        emoji: item.emoji,
        firstName,
        userName: firstName,
      };
    }),
    createdAt: message.createdAt,
    sentAt: message.createdAt,
    deliveredAt,
    seenAt,
    edited: (message.revisions || []).length > 0,
    administrativeEdit: (message.revisions || []).some((item) => item.administrative),
    deleted: deleted || hidden,
    deletedForEveryone: deleted,
    hiddenForMe: hidden,
    mine,
    seenByMe: mine || Boolean(viewerReceipt?.seenAt),
    state: mine ? state : undefined,
    administrativeDelete: Boolean(message.administrativeDelete),
  };
};

const listConversations = async (actor) => {
  if (!hasChatAccess(actor) && !isSuperAdmin(actor)) return [];
  const ChatConversation = await getChatConversationModel();
  const ChatMessage = await getChatMessageModel();
  const conversations = await ChatConversation.find({ participantIds: actor._id }).sort({ lastMessageAt: -1 }).lean();
  const users = await loadUsers(conversations.flatMap((item) => item.participantIds));
  const lastIds = conversations.map((item) => item.lastMessageId).filter(Boolean);
  const lastMessages = lastIds.length
    ? await ChatMessage.find({ _id: { $in: lastIds } }).select("senderId senderName createdAt").lean()
    : [];
  const lastById = new Map(lastMessages.map((message) => [String(message._id), message]));
  const items = [];
  for (const conversation of conversations) {
    const removed = (conversation.removedBy || []).find((item) => String(item.userId) === String(actor._id));
    const reopened = (conversation.reopenedBy || []).find((item) => String(item.userId) === String(actor._id));
    const resumed = Boolean(removed && reopened && new Date(reopened.reopenedAt) > new Date(removed.removedAt));
    if (removed && !resumed && (!conversation.lastMessageAt || new Date(conversation.lastMessageAt) <= new Date(removed.removedAt))) {
      continue;
    }
    const otherId = otherParticipantId(conversation, actor._id);
    const other = users.get(String(otherId));
    const last = lastById.get(String(conversation.lastMessageId));
    const sender = last ? users.get(String(last.senderId)) : null;
    const senderFirst = sender ? firstNameOf(sender) : (last?.senderName || "").trim().split(/\s+/)[0];
    const lastVisible = Boolean(last && (!removed || new Date(last.createdAt) > new Date(removed.removedAt)));
    const activityAt = Math.max(
      lastVisible ? new Date(last.createdAt || conversation.lastMessageAt || 0).getTime() : 0,
      reopened ? new Date(reopened.reopenedAt).getTime() : 0,
      conversation.lastMessageAt && !removed ? new Date(conversation.lastMessageAt).getTime() : 0
    );
    items.push({
      _id: conversation._id,
      other: other ? publicUser(other) : { _id: otherId, firstName: "Unavailable", lastName: "", role: "" },
      messagingUnavailable: other ? !hasChatAccess(other) : true,
      lastMessageAt: lastVisible ? (last.createdAt || conversation.lastMessageAt) : null,
      lastMessagePreview: lastVisible ? (conversation.lastMessagePreview || "") : "",
      activityAt,
      lastMessageSenderId: last?.senderId ? String(last.senderId) : "",
      lastMessageSenderName: senderFirst || "",
      unread: 0,
      _countAfter: removed ? new Date(removed.removedAt) : null,
      pinned: (conversation.pinnedBy || []).some((id) => String(id) === String(actor._id)),
      archived: (conversation.archivedBy || []).some((id) => String(id) === String(actor._id)),
      muted: (conversation.mutedBy || []).some((id) => String(id) === String(actor._id)),
    });
  }
  if (items.length) {
    const rows = await ChatMessage.aggregate([
      {
        $match: {
          conversationId: { $in: items.map((item) => item._id) },
          purgedAt: null,
          senderId: { $ne: actor._id },
          hiddenFor: { $ne: actor._id },
          receipts: { $not: { $elemMatch: { userId: actor._id, seenAt: { $ne: null } } } },
        },
      },
      { $group: { _id: "$conversationId", count: { $sum: 1 } } },
    ]);
    const unreadMap = new Map(rows.map((row) => [String(row._id), row.count]));
    for (const item of items) {
      if (item._countAfter) {
        item.unread = await ChatMessage.countDocuments({
          conversationId: item._id,
          purgedAt: null,
          senderId: { $ne: actor._id },
          hiddenFor: { $ne: actor._id },
          createdAt: { $gt: item._countAfter },
          receipts: { $not: { $elemMatch: { userId: actor._id, seenAt: { $ne: null } } } },
        });
      } else {
        item.unread = unreadMap.get(String(item._id)) || 0;
      }
      delete item._countAfter;
    }
  }
  const sorted = items.sort((a, b) => Number(b.pinned) - Number(a.pinned) || (b.activityAt || 0) - (a.activityAt || 0));
  const calls = await latestVisibleCalls(sorted.map((item) => item._id), actor._id);
  return applyLatestCallActivity(sorted, calls);
};

const callActivityLabel = (status) => {
  if (status === "completed") return "Answered";
  if (status === "declined") return "Declined";
  if (status === "cancelled") return "Cancelled";
  if (status === "offline") return "Offline";
  if (status === "busy") return "Busy";
  return "Missed";
};

const latestVisibleCalls = async (conversationIds, hiddenForUserId) => {
  const ids = [...new Set((conversationIds || []).map(String).filter(Boolean))];
  if (!ids.length) return new Map();
  const getChatCallModel = require("../crmDB/models/chatCallModel");
  const ChatCall = await getChatCallModel();
  const match = { conversationId: { $in: ids } };
  if (hiddenForUserId) match.hiddenFor = { $ne: String(hiddenForUserId) };
  const rows = await ChatCall.aggregate([
    { $match: match },
    { $sort: { createdAt: -1 } },
    { $group: { _id: "$conversationId", createdAt: { $first: "$createdAt" }, status: { $first: "$status" } } },
  ]);
  return new Map(rows.map((row) => [String(row._id), row]));
};

const applyLatestCallActivity = (items, calls) => items.map((item) => {
  const call = calls.get(String(item._id));
  if (!call?.createdAt) return { ...item, lastActivityKind: item.lastMessagePreview ? "message" : "" };
  const callAt = new Date(call.createdAt).getTime();
  const messageAt = new Date(item.lastMessageAt || 0).getTime();
  if (callAt <= messageAt) return { ...item, lastActivityKind: item.lastMessagePreview ? "message" : "" };
  return {
    ...item,
    lastActivityKind: "call",
    lastMessageAt: call.createdAt,
    lastMessagePreview: `Call · ${callActivityLabel(call.status)}`,
    lastMessageSenderId: "",
    lastMessageSenderName: "",
    activityAt: Math.max(item.activityAt || 0, callAt),
  };
});

const listUnreadPopups = async (actor) => {
  if (!hasChatAccess(actor) && !isSuperAdmin(actor)) return [];
  const ChatConversation = await getChatConversationModel();
  const ChatMessage = await getChatMessageModel();
  const conversations = await ChatConversation.find({ participantIds: actor._id }).select("_id removedBy").lean();
  if (!conversations.length) return [];
  const cutoff = new Map();
  conversations.forEach((conversation) => {
    const removed = (conversation.removedBy || []).find((item) => String(item.userId) === String(actor._id));
    if (removed?.removedAt) cutoff.set(String(conversation._id), new Date(removed.removedAt));
  });
  const messages = await ChatMessage.find({
    conversationId: { $in: conversations.map((item) => item._id) },
    senderId: { $ne: actor._id },
    purgedAt: null,
    deletedForEveryoneAt: null,
    hiddenFor: { $ne: actor._id },
    receipts: { $not: { $elemMatch: { userId: actor._id, seenAt: { $ne: null } } } },
  }).sort({ createdAt: -1 }).limit(40).select("senderId senderName body conversationId createdAt attachments replyTo").lean();
  const users = await loadUsers(messages.map((message) => message.senderId));
  const seenConversation = new Set();
  const popups = [];
  for (const message of messages) {
    const hiddenBefore = cutoff.get(String(message.conversationId));
    if (hiddenBefore && new Date(message.createdAt) <= hiddenBefore) continue;
    const key = String(message.conversationId);
    if (seenConversation.has(key)) continue;
    seenConversation.add(key);
    const sender = users.get(String(message.senderId));
    popups.push({
      _id: message._id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      senderName: message.senderName || "",
      senderRole: sender?.role || "",
      body: message.body || "",
      createdAt: message.createdAt,
      replyTo: message.replyTo || null,
      attachments: (message.attachments || []).map((file) => ({
        originalName: file.originalName || "",
        resourceType: file.resourceType || "",
      })),
    });
    if (popups.length === 6) break;
  }
  return popups;
};

const listMessages = async (actor, conversationId, { before, search, admin = false } = {}) => {
  const conversation = await requireConversation(actor, conversationId, { allowAdmin: admin });
  const ChatMessage = await getChatMessageModel();
  const removed = !admin && (conversation.removedBy || []).find((item) => String(item.userId) === String(actor._id));
  const query = { conversationId: conversation._id, purgedAt: null };
  if (!admin) query.hiddenFor = { $ne: actor._id };
  if (removed) query.createdAt = { ...(before ? { $lt: new Date(before) } : {}), $gt: new Date(removed.removedAt) };
  if (before && !removed) query.createdAt = { $lt: new Date(before) };
  if (search) query.body = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
  const messages = await ChatMessage.find(query).sort({ createdAt: -1 }).limit(admin ? 200 : 40).lean();
  const spectator = admin && !isParticipant(conversation, actor._id);
  const undelivered = spectator ? [] : messages
    .filter((message) => String(message.senderId) !== String(actor._id))
    .filter((message) => !(message.receipts || []).some((item) => String(item.userId) === String(actor._id) && item.deliveredAt))
    .map((message) => message._id);
  if (undelivered.length) await markDelivered(actor, undelivered);
  const fresh = undelivered.length
    ? await ChatMessage.find({ _id: { $in: messages.map((message) => message._id) } }).sort({ createdAt: 1 }).lean()
    : messages.slice().reverse();
  return {
    conversationId: conversation._id,
    messagingUnavailable: await pairUnavailable(conversation, actor),
    messages: await enrichReactions(fresh.map((message) => serializeMessage(message, actor._id))),
    deliveredIds: undelivered,
  };
};

const pairUnavailable = async (conversation, actor) => {
  const otherId = otherParticipantId(conversation, actor._id);
  if (!otherId) return true;
  const other = await User.findById(otherId).select("role adminPermissions permissions").lean();
  return !other || !hasChatAccess(other);
};

const sendMessage = async (actor, { conversationId, recipientId, body, clientKey, replyTo, attachments }) => {
  let conversation;
  if (conversationId) {
    conversation = await requireConversation(actor, conversationId);
    if (await pairUnavailable(conversation, actor)) {
      const error = new Error(UNAVAILABLE);
      error.status = 403;
      throw error;
    }
  } else {
    const opened = await findOrCreateConversation(actor, recipientId);
    conversation = opened.conversation;
  }
  const text = String(body || "").trim();
  const files = attachments || [];
  if (!text && !files.length) {
    const error = new Error("Message is empty");
    error.status = 400;
    throw error;
  }
  const ChatMessage = await getChatMessageModel();
  if (clientKey) {
    const existing = await ChatMessage.findOne({ conversationId: conversation._id, clientKey }).lean();
    if (existing) return { conversation, message: serializeMessage(existing, actor._id), duplicate: true };
  }
  const message = await ChatMessage.create({
    conversationId: conversation._id,
    senderId: actor._id,
    senderName: displayName(actor),
    body: text,
    clientKey: clientKey || undefined,
    replyTo: replyTo || null,
    attachments: files,
    receipts: [],
  });
  conversation.lastMessageAt = message.createdAt;
  conversation.lastMessagePreview = text || (files[0]?.originalName ? `Attachment: ${files[0].originalName}` : "Attachment");
  conversation.lastMessageId = message._id;
  conversation.removedBy = (conversation.removedBy || []).filter(
    (item) => new Date(conversation.lastMessageAt) <= new Date(item.removedAt)
  );
  await conversation.save();
  return { conversation, message: { ...serializeMessage(message.toObject(), actor._id), senderRole: actor.role || "" }, duplicate: false };
};

const editMessage = async (actor, messageId, body, reason) => {
  const ChatMessage = await getChatMessageModel();
  const message = await ChatMessage.findById(messageId);
  if (!message || message.purgedAt) {
    const error = new Error("Message not found");
    error.status = 404;
    throw error;
  }
  await requireConversation(actor, message.conversationId, { allowAdmin: true });
  if (!canEditOwnMessage(message, actor)) {
    const error = new Error("This message can no longer be edited");
    error.status = 403;
    throw error;
  }
  const next = String(body || "").trim();
  if (!next) {
    const error = new Error("Message is empty");
    error.status = 400;
    throw error;
  }
  message.revisions.push({
    body: message.body,
    editedAt: new Date(),
    editedBy: actor._id,
    editorName: displayName(actor),
    reason: reason || "",
    administrative: isSuperAdmin(actor) && String(message.senderId) !== String(actor._id),
  });
  message.body = next;
  await message.save();
  return { message: serializeMessage(message.toObject(), actor._id), conversationId: message.conversationId };
};

const deleteForMe = async (actor, messageId) => {
  const ChatMessage = await getChatMessageModel();
  const message = await ChatMessage.findById(messageId);
  if (!message) {
    const error = new Error("Message not found");
    error.status = 404;
    throw error;
  }
  await requireConversation(actor, message.conversationId);
  if (!(message.hiddenFor || []).some((id) => String(id) === String(actor._id))) {
    message.hiddenFor.push(actor._id);
    await message.save();
  }
  return { messageId: message._id, conversationId: message.conversationId };
};

const deleteForEveryone = async (actor, messageId, reason) => {
  const ChatMessage = await getChatMessageModel();
  const message = await ChatMessage.findById(messageId);
  if (!message || message.purgedAt) {
    const error = new Error("Message not found");
    error.status = 404;
    throw error;
  }
  await requireConversation(actor, message.conversationId, { allowAdmin: true });
  if (!canDeleteForEveryone(message, actor)) {
    const error = new Error("This message can no longer be deleted for everyone");
    error.status = 403;
    throw error;
  }
  message.deletedForEveryoneAt = new Date();
  message.deletedBy = actor._id;
  message.deleteReason = reason || "";
  message.administrativeDelete = isSuperAdmin(actor) && String(message.senderId) !== String(actor._id);
  await message.save();
  return { message: serializeMessage(message.toObject(), actor._id), conversationId: message.conversationId };
};

const markDelivered = async (actor, messageIds) => {
  const ChatMessage = await getChatMessageModel();
  const now = new Date();
  const ids = (messageIds || []).filter(Boolean);
  if (!ids.length) return { deliveredAt: now, conversationIds: [] };
  await ChatMessage.updateMany(
    { _id: { $in: ids }, senderId: { $ne: actor._id }, "receipts.userId": { $ne: actor._id } },
    { $push: { receipts: { userId: actor._id, deliveredAt: now } } }
  );
  const messages = await ChatMessage.find({ _id: { $in: ids }, senderId: { $ne: actor._id } });
  const conversationIds = new Set();
  for (const message of messages) {
    conversationIds.add(String(message.conversationId));
    const receipt = (message.receipts || []).find((item) => String(item.userId) === String(actor._id));
    if (!receipt) {
      message.receipts.push({ userId: actor._id, deliveredAt: now });
      await message.save();
    } else if (!receipt.deliveredAt) {
      receipt.deliveredAt = now;
      await message.save();
    }
  }
  return {
    deliveredAt: now,
    conversationIds: [...conversationIds],
    messageIds: ids,
    senderIds: [...new Set(messages.map((message) => String(message.senderId)))],
  };
};

const markSeen = async (actor, conversationId) => {
  const conversation = await requireConversation(actor, conversationId);
  const ChatMessage = await getChatMessageModel();
  const now = new Date();
  const pending = await ChatMessage.find({
    conversationId: conversation._id,
    senderId: { $ne: actor._id },
    purgedAt: null,
    deletedForEveryoneAt: null,
  }).select("_id receipts");
  const seenIds = [];
  for (const message of pending) {
    const receipt = (message.receipts || []).find((item) => String(item.userId) === String(actor._id));
    if (receipt?.seenAt) continue;
    if (receipt) {
      receipt.seenAt = now;
      if (!receipt.deliveredAt) receipt.deliveredAt = now;
    } else {
      message.receipts.push({ userId: actor._id, deliveredAt: now, seenAt: now });
    }
    await message.save();
    seenIds.push(message._id);
  }
  return { conversationId: conversation._id, messageIds: seenIds };
};

const reactToMessage = async (actor, messageId, emoji) => {
  const ChatMessage = await getChatMessageModel();
  const message = await ChatMessage.findById(messageId);
  if (!message || message.deletedForEveryoneAt) {
    const error = new Error("Message not found");
    error.status = 404;
    throw error;
  }
  await requireConversation(actor, message.conversationId);
  const actorId = String(actor._id);
  const existing = (message.reactions || []).find((item) => String(item.userId) === actorId);
  const nextEmoji = String(emoji || "").slice(0, 8);
  const next = (message.reactions || [])
    .filter((item) => String(item.userId) !== actorId)
    .map((item) => ({
      userId: item.userId,
      emoji: item.emoji,
      firstName: item.firstName || "",
      userName: item.userName || "",
    }));
  if (nextEmoji && existing?.emoji !== nextEmoji) {
    const firstName = firstNameOf(actor);
    next.push({ userId: actor._id, emoji: nextEmoji, firstName, userName: firstName });
  }
  message.reactions = next;
  message.markModified("reactions");
  await message.save();
  const [named] = await enrichReactions([serializeMessage(message.toObject(), actor._id)]);
  return { message: named, conversationId: message.conversationId };
};

const enrichReactions = async (items) => {
  const ids = [];
  items.forEach((message) => {
    (message.reactions || []).forEach((item) => {
      if (item.userId) ids.push(item.userId);
    });
  });
  const users = ids.length ? await loadUsers(ids) : new Map();
  return items.map((message) => ({
    ...message,
    reactions: (message.reactions || []).map((item) => {
      const person = users.get(String(item.userId));
      const firstName = (person ? firstNameOf(person) : "") || item.firstName || (item.userName || "").trim().split(/\s+/)[0] || "";
      return {
        userId: item.userId ? String(item.userId) : "",
        emoji: item.emoji,
        firstName,
        userName: firstName,
      };
    }),
  }));
};

const removeConversationForUser = async (actor, conversationId) => {
  const conversation = await requireConversation(actor, conversationId);
  const ChatMessage = await getChatMessageModel();
  const getChatCallModel = require("../crmDB/models/chatCallModel");
  const ChatCall = await getChatCallModel();
  const removedAt = new Date();
  conversation.removedBy = (conversation.removedBy || []).filter((item) => String(item.userId) !== String(actor._id));
  conversation.removedBy.push({ userId: actor._id, removedAt });
  conversation.markModified("removedBy");
  await conversation.save();
  await ChatMessage.updateMany(
    { conversationId: conversation._id, purgedAt: null },
    { $addToSet: { hiddenFor: actor._id } }
  );
  await ChatCall.updateMany(
    { conversationId: String(conversation._id) },
    { $addToSet: { hiddenFor: String(actor._id) } }
  );
  return conversation;
};

const toggleFlag = async (actor, conversationId, field) => {
  const conversation = await requireConversation(actor, conversationId);
  const list = conversation[field] || [];
  const exists = list.some((id) => String(id) === String(actor._id));
  conversation[field] = exists ? list.filter((id) => String(id) !== String(actor._id)) : [...list, actor._id];
  await conversation.save();
  return { [field]: !exists };
};

const listAllConversations = async () => {
  const ChatConversation = await getChatConversationModel();
  const conversations = await ChatConversation.find().sort({ lastMessageAt: -1 }).limit(300).lean();
  const users = await loadUsers(conversations.flatMap((item) => item.participantIds || []));
  const items = conversations.map((conversation) => ({
    _id: conversation._id,
    participants: (conversation.participantIds || []).map((id) => publicUser(users.get(String(id)) || { _id: id })),
    lastMessageAt: conversation.lastMessageAt || null,
    lastMessagePreview: conversation.lastMessagePreview || "",
    readOnly: true,
  }));
  const calls = await latestVisibleCalls(items.map((item) => item._id));
  return applyLatestCallActivity(items, calls).sort(
    (a, b) => new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0)
  );
};

const listRecycleBin = async () => {
  const ChatMessage = await getChatMessageModel();
  const ChatConversation = await getChatConversationModel();
  const messages = await ChatMessage.find({
    $or: [{ deletedForEveryoneAt: { $ne: null } }, { purgedAt: { $ne: null } }],
  }).sort({ updatedAt: -1 }).limit(200).lean();
  const trashed = await ChatConversation.find({
    "removedBy.0": { $exists: true },
    $or: [{ recycleClearedAt: null }, { recycleClearedAt: { $exists: false } }],
  }).sort({ updatedAt: -1 }).limit(100).lean();
  const conversations = await ChatConversation.find({
    _id: { $in: [...messages.map((item) => item.conversationId), ...trashed.map((item) => item._id)] },
  }).lean();
  const conversationMap = new Map(conversations.map((item) => [String(item._id), item]));
  const threadMessages = trashed.length
    ? await ChatMessage.find({ conversationId: { $in: trashed.map((item) => item._id) }, purgedAt: null })
      .sort({ createdAt: 1 })
      .select("conversationId senderId senderName body createdAt")
      .lean()
    : [];
  const users = await loadUsers([
    ...messages.flatMap((item) => [item.senderId, item.deletedBy]),
    ...conversations.flatMap((item) => [...(item.participantIds || []), ...(item.removedBy || []).map((entry) => entry.userId)]),
    ...threadMessages.map((item) => item.senderId),
  ]);
  const deletedMessages = messages.map((item) => {
    const conversation = conversationMap.get(String(item.conversationId));
    const sender = users.get(String(item.senderId));
    const deletedBy = users.get(String(item.deletedBy));
    return {
      _id: item._id,
      type: "message",
      body: item.body || "",
      senderName: item.senderName || displayName(sender),
      createdAt: item.createdAt,
      deletedForEveryoneAt: item.deletedForEveryoneAt,
      deleteReason: item.deleteReason || "",
      deletedByName: deletedBy ? displayName(deletedBy) : "",
      administrativeDelete: Boolean(item.administrativeDelete),
      participants: (conversation?.participantIds || []).map((id) => displayName(users.get(String(id)))).filter(Boolean),
      thread: [],
    };
  });
  const deletedConversations = trashed.map((conversation) => {
    const removed = [...(conversation.removedBy || [])].sort((a, b) => new Date(b.removedAt) - new Date(a.removedAt));
    const thread = threadMessages
      .filter((item) => String(item.conversationId) === String(conversation._id))
      .map((item) => ({
        senderName: item.senderName || displayName(users.get(String(item.senderId))),
        body: item.body || "Attachment",
        createdAt: item.createdAt,
      }));
    return {
      _id: `conversation-${conversation._id}`,
      conversationId: conversation._id,
      type: "conversation",
      body: conversation.lastMessagePreview || "",
      senderName: "",
      createdAt: conversation.lastMessageAt,
      deletedForEveryoneAt: removed[0]?.removedAt || conversation.updatedAt,
      deleteReason: "Conversation deleted",
      deletedByName: removed.map((entry) => displayName(users.get(String(entry.userId)))).filter(Boolean).join(", "),
      administrativeDelete: false,
      participants: (conversation.participantIds || []).map((id) => displayName(users.get(String(id)))).filter(Boolean),
      thread,
    };
  });
  return {
    messages: [...deletedConversations, ...deletedMessages].sort((a, b) => new Date(b.deletedForEveryoneAt || 0) - new Date(a.deletedForEveryoneAt || 0)),
    conversations,
  };
};

const clearRecycleConversation = async (conversationId) => {
  const ChatConversation = await getChatConversationModel();
  const conversation = await ChatConversation.findById(conversationId);
  if (!conversation) {
    const error = new Error("Conversation not found");
    error.status = 404;
    throw error;
  }
  conversation.recycleClearedAt = new Date();
  await conversation.save();
  return { conversationId: conversation._id };
};

const purgeRecycleMessage = async (messageId) => {
  const ChatMessage = await getChatMessageModel();
  const message = await ChatMessage.findById(messageId);
  if (!message) {
    const error = new Error("Message not found");
    error.status = 404;
    throw error;
  }
  await message.deleteOne();
  return { messageId: message._id };
};

const restoreMessage = async (messageId) => {
  const ChatMessage = await getChatMessageModel();
  const message = await ChatMessage.findById(messageId);
  if (!message) {
    const error = new Error("Message not found");
    error.status = 404;
    throw error;
  }
  message.deletedForEveryoneAt = null;
  message.administrativeDelete = false;
  message.purgedAt = null;
  await message.save();
  return message;
};

const setPresence = (userId, socketId, online) => {
  const key = String(userId);
  const sockets = PRESENCE.get(key) || new Set();
  if (online) sockets.add(socketId);
  else sockets.delete(socketId);
  if (sockets.size) PRESENCE.set(key, sockets);
  else PRESENCE.delete(key);
  return PRESENCE.has(key);
};

const presenceSnapshot = () => [...PRESENCE.keys()];

module.exports = {
  UNAVAILABLE,
  hasChatAccess,
  listEligibleAgents,
  findOrCreateConversation,
  listConversations,
  listUnreadPopups,
  listMessages,
  sendMessage,
  editMessage,
  deleteForMe,
  deleteForEveryone,
  markDelivered,
  markSeen,
  reactToMessage,
  removeConversationForUser,
  toggleFlag,
  listAllConversations,
  listRecycleBin,
  clearRecycleConversation,
  purgeRecycleMessage,
  restoreMessage,
  otherParticipantId,
  setPresence,
  presenceSnapshot,
  publicUser,
  serializeMessage,
};
