export const CRM_PERMISSIONS = [
  { key: "accessCrm", label: "Open CRM", detail: "Open the leads page.", group: "Leads", roles: ["admin", "subadmin"] },
  { key: "canCommentOnLeads", label: "Comment on streams", detail: "Add text on a lead stream. Allowed until you turn it off.", group: "Leads", roles: ["admin", "subadmin"], defaultOn: true },
  { key: "canChangeLeadStatus", label: "Change lead status", detail: "Move a lead to another status. Allowed until you turn it off.", group: "Leads", roles: ["admin", "subadmin"], defaultOn: true },
  { key: "canEditLeads", label: "Edit lead details", detail: "Change a lead's name, phone, email, brand, and address.", group: "Leads", roles: ["admin", "subadmin"] },
  { key: "canViewLeadSource", label: "See lead source", detail: "Show the source field on leads. Hidden until you turn it on.", group: "Leads", roles: ["admin", "subadmin"] },
  { key: "canViewLeadBrand", label: "See lead brand", detail: "Show the brand field on leads. Hidden until you turn it on.", group: "Leads", roles: ["admin", "subadmin"] },
  { key: "canViewLeadFileName", label: "See file name", detail: "Show the file name field on leads. Hidden until you turn it on.", group: "Leads", roles: ["admin", "subadmin"] },
  { key: "canViewStreamLogs", label: "See stream logs", detail: "See status, agent, field, email, and call changes on a lead stream. Hidden until you turn it on. Comments stay visible.", group: "Leads", roles: ["admin", "subadmin"] },
  { key: "canAccessChat", label: "Chat access", detail: "Send and receive messages with other agents. Hidden until you turn it on.", group: "Chat", roles: ["admin", "subadmin"] },
  { key: "canCreateLeads", label: "Create leads", detail: "Add one lead by hand.", group: "Leads", roles: ["admin", "subadmin"] },
  { key: "canUploadLeads", label: "Upload CSV", detail: "Import leads from a CSV file.", group: "Leads", roles: ["admin", "subadmin"] },
  { key: "canAssignLeads", label: "Assign leads", detail: "Assign selected leads to someone else.", group: "Leads", roles: ["admin", "subadmin"] },
  { key: "canExportLeads", label: "Export leads", detail: "Download the lead list.", group: "Leads", roles: ["admin", "subadmin"] },
  { key: "canManageLeadStatuses", label: "Manage status list", detail: "Add, rename, recolor, or delete the status names.", group: "Leads", roles: ["admin", "subadmin"] },
  { key: "canSendLeadEmail", label: "Email a lead", detail: "Send an email from a lead.", group: "Leads", roles: ["admin", "subadmin"] },
  { key: "canMakeCalls", label: "Make calls", detail: "Start a call from a lead.", group: "Calls", roles: ["admin", "subadmin"] },
  { key: "canAccessCallDashboard", label: "Call pages", detail: "Open the active, pending, failed, and cancelled call pages.", group: "Calls", roles: ["admin", "subadmin"] },
  { key: "canViewCallLogs", label: "Call logs", detail: "See the call history on a lead.", group: "Calls", roles: ["admin", "subadmin"] },
  { key: "canViewCallRecordings", label: "Call recordings", detail: "Play call recordings.", group: "Calls", roles: ["admin", "subadmin"] },
  { key: "canManageReminders", label: "Reminders", detail: "Open reminders and create them.", group: "Other", roles: ["admin", "subadmin"] },
  { key: "canManageDocuments", label: "Documents", detail: "Open the document library and change files.", group: "Other", roles: ["admin", "subadmin"] },
  { key: "canAccessAiInstructions", label: "AI instructions", detail: "Edit the script the AI uses on calls.", group: "Other", roles: ["admin"] },
  { key: "isProfileUpdate", label: "Edit own profile", detail: "Change their own profile and call settings.", group: "Other", roles: ["admin"] },
  { key: "accessWallet", label: "Wallet", detail: "Open the wallet area.", group: "Other", roles: ["admin", "subadmin"] },
  { key: "editWalletAddress", label: "Wallet addresses", detail: "View and edit deposit addresses.", group: "Other", roles: ["admin", "subadmin"] },
  { key: "viewClientDetails", label: "View client details", detail: "See personal details of assigned clients.", group: "Clients", roles: ["subadmin"] },
  { key: "editUserProfile", label: "Edit client profiles", detail: "Edit personal details of assigned clients.", group: "Clients", roles: ["subadmin"] },
  { key: "editUserWallet", label: "Edit client wallets", detail: "Change a client's wallet balance.", group: "Clients", roles: ["subadmin"] },
];

const DEFAULT_ON = new Set(
  CRM_PERMISSIONS.filter((item) => item.defaultOn).map((item) => item.key)
);

export const isPermissionOn = (user, key) => {
  if (!user) return false;
  if (user.role === "superadmin") return true;
  const bag = user.role === "subadmin" ? user.permissions : user.adminPermissions;
  const value = bag?.[key];
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return DEFAULT_ON.has(key);
};

export const permissionsForRole = (role) =>
  CRM_PERMISSIONS.filter((item) => item.roles.includes(role));
