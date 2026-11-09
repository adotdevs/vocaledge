const getLeadUploadModel = require("../crmDB/models/leadUploadModel");

const numberInRange = (value, fallback, min, max) => {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};

const RETENTION_DAYS = numberInRange(process.env.LEAD_UPLOAD_DETAIL_RETENTION_DAYS, 30, 1, 3650);
const BATCH_SIZE = numberInRange(process.env.LEAD_UPLOAD_DETAIL_CLEANUP_BATCH_SIZE, 50, 1, 250);
const MAX_BATCHES = numberInRange(process.env.LEAD_UPLOAD_DETAIL_CLEANUP_MAX_BATCHES, 20, 1, 100);

const rowsOf = (upload) => (upload?.duplicates || []).map((row) => (
  row && typeof row.toObject === "function" ? row.toObject() : row
));

const duplicateSummary = (upload) => {
  const rows = rowsOf(upload);
  const merged = rows.filter((row) => row?.mergedAt).length;
  const accepted = rows.filter((row) => row?.acceptedLeadId && !row?.mergedAt).length;
  const declined = rows.filter((row) => row?.declinedAt && !row?.acceptedLeadId && !row?.mergedAt).length;
  const duplicateTotal = Math.max(Number(upload?.duplicateCount) || 0, rows.length);
  return {
    rows,
    merged,
    accepted,
    declined,
    duplicateTotal,
    pending: Math.max(0, duplicateTotal - merged - accepted - declined),
  };
};

async function clearLeadUploadDetailsDocument(LeadUpload, upload, {
  at = new Date(),
  actor = { userName: "System retention", userRole: "system" },
} = {}) {
  if (!upload) return { cleared: false, reason: "not_found" };
  if (upload.detailsClearedAt) return { cleared: false, reason: "already_cleared" };

  const summary = duplicateSummary(upload);
  if (summary.rows.some((row) => row?.mergeLock)) {
    return { cleared: false, reason: "merge_running" };
  }

  const result = await LeadUpload.collection.updateOne(
    {
      _id: upload._id,
      __v: upload.__v || 0,
      detailsClearedAt: null,
    },
    {
      $set: {
        duplicates: [],
        detailsClearedAt: at,
        detailsClearedBy: {
          ...(actor.userId ? { userId: actor.userId } : {}),
          userName: actor.userName || "System retention",
          userRole: actor.userRole || "system",
        },
        clearedDuplicateCount: summary.duplicateTotal,
        clearedPendingCount: summary.pending,
        acceptedCount: Math.max(Number(upload.acceptedCount) || 0, summary.accepted),
        declinedCount: Math.max(Number(upload.declinedCount) || 0, summary.declined),
        mergedCount: Math.max(Number(upload.mergedCount) || 0, summary.merged),
      },
      $inc: { __v: 1 },
    }
  );

  return {
    cleared: result.modifiedCount === 1,
    reason: result.modifiedCount === 1 ? "cleared" : "changed",
    detailsClearedAt: at,
    clearedDuplicateCount: summary.duplicateTotal,
    clearedPendingCount: summary.pending,
  };
}

async function clearExpiredLeadUploadDetails({ now = new Date() } = {}) {
  const LeadUpload = await getLeadUploadModel();
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  let scanned = 0;
  let cleared = 0;
  let skipped = 0;

  for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
    const uploads = await LeadUpload.find({
      createdAt: { $lt: cutoff },
      detailsClearedAt: null,
      "duplicates.0": { $exists: true },
      duplicates: { $not: { $elemMatch: { mergeLock: { $exists: true } } } },
    })
      .sort({ createdAt: 1 })
      .limit(BATCH_SIZE)
      .lean();
    if (!uploads.length) break;

    let clearedThisBatch = 0;
    for (const upload of uploads) {
      scanned += 1;
      const result = await clearLeadUploadDetailsDocument(LeadUpload, upload, { at: now });
      if (result.cleared) {
        cleared += 1;
        clearedThisBatch += 1;
      } else {
        skipped += 1;
      }
    }
    // Avoid repeatedly reading a batch that another server changed first.
    if (!clearedThisBatch) break;
  }

  return {
    retentionDays: RETENTION_DAYS,
    cutoff,
    scanned,
    cleared,
    skipped,
  };
}

module.exports = {
  RETENTION_DAYS,
  BATCH_SIZE,
  MAX_BATCHES,
  duplicateSummary,
  clearLeadUploadDetailsDocument,
  clearExpiredLeadUploadDetails,
};
