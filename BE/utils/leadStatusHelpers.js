const getLeadStatusModel = require("../crmDB/models/leadStatusModel");

const DEFAULT_LEAD_STATUSES = [
  { label: "New", color: "#1976d2" },
  { label: "Call Back", color: "#ef6c00" },
  { label: "Not Active", color: "#d32f2f" },
  { label: "Active", color: "#2e7d32" },
  { label: "Not Interested", color: "#757575" },
];

const ensureDefaultLeadStatuses = async () => {
  const LeadStatus = await getLeadStatusModel();
  const count = await LeadStatus.countDocuments();
  if (count > 0) return;

  await LeadStatus.insertMany(
    DEFAULT_LEAD_STATUSES.map((status, index) => ({
      label: status.label,
      color: status.color,
      sortOrder: index,
      isDefault: status.label === "New",
    }))
  );
};

const getLeadStatusLabels = async () => {
  await ensureDefaultLeadStatuses();
  const LeadStatus = await getLeadStatusModel();
  const statuses = await LeadStatus.find().sort({ sortOrder: 1, label: 1 }).lean();
  return statuses.map((s) => s.label);
};

const getDefaultLeadStatusLabel = async () => {
  await ensureDefaultLeadStatuses();
  const LeadStatus = await getLeadStatusModel();
  const defaultStatus = await LeadStatus.findOne({ isDefault: true }).lean();
  if (defaultStatus?.label) return defaultStatus.label;
  const first = await LeadStatus.findOne().sort({ sortOrder: 1, label: 1 }).lean();
  return first?.label || "New";
};

const normalizeLeadStatus = async (value) => {
  const labels = await getLeadStatusLabels();
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (trimmed && labels.includes(trimmed)) {
    return trimmed;
  }
  return getDefaultLeadStatusLabel();
};

module.exports = {
  DEFAULT_LEAD_STATUSES,
  ensureDefaultLeadStatuses,
  getLeadStatusLabels,
  getDefaultLeadStatusLabel,
  normalizeLeadStatus,
};
