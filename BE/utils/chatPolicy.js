const EDIT_WINDOW_MS = 15 * 60 * 1000;

const isSuperAdmin = (user) => user?.role === "superadmin";

const withinWindow = (createdAt, now = Date.now()) => {
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return false;
  return now - created <= EDIT_WINDOW_MS;
};

const canEditOwnMessage = (message, user, now = Date.now()) => {
  if (!message || !user) return false;
  if (message.deletedForEveryoneAt) return false;
  if (isSuperAdmin(user)) return true;
  if (String(message.senderId) !== String(user._id)) return false;
  return withinWindow(message.createdAt, now);
};

const canDeleteForEveryone = (message, user, now = Date.now()) => canEditOwnMessage(message, user, now);

module.exports = {
  EDIT_WINDOW_MS,
  isSuperAdmin,
  withinWindow,
  canEditOwnMessage,
  canDeleteForEveryone,
};
