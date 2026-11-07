const MERGE_FIELDS = Object.freeze([
  { key: "firstName", label: "First name" },
  { key: "lastName", label: "Last name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "country", label: "Country" },
  { key: "Brand", label: "Brand" },
  { key: "source", label: "Source" },
  { key: "fileName", label: "File name" },
  { key: "Address", label: "Address" },
  { key: "status", label: "Status" },
]);

const definitionByKey = new Map(MERGE_FIELDS.map((field) => [field.key, field]));

const cleanText = (value) => String(value ?? "").trim();

const normalizeValue = (key, value) => {
  const cleaned = cleanText(value);
  if (key === "email") return cleaned.toLowerCase();
  return cleaned;
};

const comparableValue = (key, value) => normalizeValue(key, value);

const valuesMatch = (key, left, right) => comparableValue(key, left) === comparableValue(key, right);

const selectedMergeFields = (value) => {
  const requested = Array.isArray(value) ? value.map(String) : [];
  return [...new Set(requested)].filter((key) => definitionByKey.has(key));
};

function buildLeadMergePlan({ lead, duplicate, fields, statusLabels = [] }) {
  const selected = selectedMergeFields(fields);
  const updates = {};
  const changes = [];
  const rejected = [];

  selected.forEach((key) => {
    const definition = definitionByKey.get(key);
    const incoming = normalizeValue(key, duplicate?.[key]);
    const before = normalizeValue(key, lead?.[key]);

    // A CSV blank never erases a saved value. This is the core safety rule.
    if (!incoming) {
      rejected.push({ field: key, reason: "blank_incoming" });
      return;
    }
    if (key === "status" && !statusLabels.includes(incoming)) {
      rejected.push({ field: key, reason: "invalid_status" });
      return;
    }
    if (valuesMatch(key, before, incoming)) return;

    updates[key] = incoming;
    changes.push({
      field: key,
      label: definition.label,
      before,
      after: incoming,
    });
  });

  return { selected, updates, changes, rejected };
}

function findMergeConflicts({ lead, expected = {}, fields = [] }) {
  const selected = selectedMergeFields(fields);
  return selected
    .filter((key) => Object.prototype.hasOwnProperty.call(expected || {}, key))
    .filter((key) => !valuesMatch(key, lead?.[key], expected[key]))
    .map((key) => ({
      field: key,
      label: definitionByKey.get(key).label,
      expected: normalizeValue(key, expected[key]),
      actual: normalizeValue(key, lead?.[key]),
    }));
}

module.exports = {
  MERGE_FIELDS,
  buildLeadMergePlan,
  findMergeConflicts,
  normalizeValue,
  selectedMergeFields,
  valuesMatch,
};
