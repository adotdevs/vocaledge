const DEFAULT_ON = new Set(["canCommentOnLeads", "canChangeLeadStatus"]);

const isOn = (value) => value === true || value === "true";
const isOff = (value) => value === false || value === "false";

const permissionBag = (user) => {
  if (!user) return null;
  if (user.role === "subadmin") return user.permissions || {};
  return user.adminPermissions || {};
};

const hasCrmPermission = (user, key) => {
  if (!user) return false;
  if (user.role === "superadmin") return true;
  if (user.role !== "admin" && user.role !== "subadmin") return false;

  const value = permissionBag(user)[key];
  if (isOn(value)) return true;
  if (isOff(value)) return false;
  return DEFAULT_ON.has(key);
};

const denyCrmPermission = (res, message) =>
  res.status(403).json({
    success: false,
    msg: message || "You do not have permission for this action",
  });

const canViewLeadSource = (user) => hasCrmPermission(user, "canViewLeadSource");

const withoutLeadSource = (lead, user) => {
  if (!lead || canViewLeadSource(user)) return lead;
  const copy = { ...lead };
  delete copy.source;
  return copy;
};

const redactSourceMention = (text, user) => {
  if (canViewLeadSource(user)) return text;
  return String(text || "")
    .replace(/;?\s*source:\s*'[^']*'/gi, "")
    .replace(/^;\s*/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
};

module.exports = {
  DEFAULT_ON,
  hasCrmPermission,
  denyCrmPermission,
  canViewLeadSource,
  withoutLeadSource,
  redactSourceMention,
};
