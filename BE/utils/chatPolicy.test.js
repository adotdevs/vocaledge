const assert = require("assert");
const { canEditOwnMessage, canDeleteForEveryone, EDIT_WINDOW_MS } = require("./chatPolicy");

const user = { _id: "user-1", role: "admin" };
const other = { _id: "user-2", role: "admin" };
const admin = { _id: "admin-1", role: "superadmin" };
const now = Date.now();

const fresh = { senderId: "user-1", createdAt: new Date(now - 5 * 60 * 1000) };
const old = { senderId: "user-1", createdAt: new Date(now - EDIT_WINDOW_MS - 1000) };
const deleted = { ...fresh, deletedForEveryoneAt: new Date() };

assert.strictEqual(canEditOwnMessage(fresh, user, now), true);
assert.strictEqual(canEditOwnMessage(old, user, now), false);
assert.strictEqual(canEditOwnMessage(fresh, other, now), false);
assert.strictEqual(canEditOwnMessage(old, admin, now), true);
assert.strictEqual(canEditOwnMessage(deleted, user, now), false);
assert.strictEqual(canDeleteForEveryone(old, user, now), false);
assert.strictEqual(canDeleteForEveryone(fresh, user, now), true);

console.log("chatPolicy tests passed");
