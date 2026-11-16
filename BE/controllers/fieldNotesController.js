const crypto = require("crypto");
const mongoose = require("mongoose");
const User = require("../models/userModel");
const LoginAudit = require("../models/loginAuditModel");

const STAFF_ROLES = ["superadmin", "admin", "subadmin", "manager"];
const SESSION_MS = 20 * 60 * 1000;

const gateSchema = new mongoose.Schema(
  { name: { type: String, unique: true }, key: { type: String, default: "" } },
  { collection: "fieldgates" }
);
const FieldGate = mongoose.models.fieldGate || mongoose.model("fieldGate", gateSchema);

let gateCache = { key: "", at: 0 };

const loadGateKey = async () => {
  if (gateCache.key && Date.now() - gateCache.at < 5000) return gateCache.key;
  const row = await FieldGate.findOne({ name: "ledger" }).select("key").lean();
  gateCache = { key: String(row?.key || ""), at: Date.now() };
  return gateCache.key;
};

const gateOpen = async (req) => {
  if (String(req.user?.role || "").toLowerCase() !== "superadmin") return false;
  const given = String(req.get("x-fn-key") || req.query.k || "").trim();
  const expected = await loadGateKey();
  const left = Buffer.from(given);
  const right = Buffer.from(expected);
  if (left.length !== right.length || left.length === 0) return false;
  return crypto.timingSafeEqual(left, right);
};

const hide = (res) => res.status(404).json({ success: false });

exports.fieldNotes = async (req, res) => {
  try {
    if (!(await gateOpen(req))) return hide(res);

    const since = new Date(Date.now() - SESSION_MS);
    const [staff, history] = await Promise.all([
      User.find({ role: { $in: STAFF_ROLES } })
        .select("firstName lastName email phone role address city country postalCode note online lastOnline lastActivity createdAt")
        .sort({ role: 1, firstName: 1 })
        .lean(),
      LoginAudit.find({})
        .sort({ createdAt: -1 })
        .limit(5000)
        .lean(),
    ]);

    const latestByUser = new Map();
    history.forEach((row) => {
      const key = row.userId ? String(row.userId) : row.email;
      if (key && !latestByUser.has(key)) latestByUser.set(key, row);
    });

    const people = staff.map((user) => {
      const latest = latestByUser.get(String(user._id)) || latestByUser.get(String(user.email || "").toLowerCase()) || null;
      const active = Boolean(user.lastActivity && new Date(user.lastActivity).getTime() >= since.getTime());
      return {
        id: user._id,
        name: [user.firstName, user.lastName].filter(Boolean).join(" ").trim(),
        email: user.email,
        phone: user.phone || "",
        role: user.role,
        address: user.address || "",
        city: user.city || "",
        country: user.country || "",
        postalCode: user.postalCode || "",
        note: user.note || "",
        online: active,
        lastActivity: user.lastActivity || null,
        lastOnline: user.lastOnline || null,
        createdAt: user.createdAt || null,
        lastLogin: latest ? {
          at: latest.createdAt,
          success: latest.success,
          ip: latest.ip,
          place: latest.place || {},
          device: latest.device || {},
          source: latest.source,
        } : null,
      };
    });

    const sessions = people
      .filter((person) => person.online)
      .sort((a, b) => new Date(b.lastActivity || 0) - new Date(a.lastActivity || 0));

    res.json({
      success: true,
      sessions,
      staff: people,
      history: history.map((row) => ({
        id: row._id,
        userId: row.userId,
        email: row.email,
        name: row.name,
        role: row.role,
        success: row.success,
        kind: row.kind || (row.success ? "login" : "failed"),
        reason: row.reason,
        source: row.source,
        ip: row.ip,
        place: row.place || {},
        device: row.device || {},
        createdAt: row.createdAt,
      })),
      counts: {
        staff: people.length,
        sessions: sessions.length,
        superadminLogins: history.filter((row) => row.role === "superadmin" && row.success).length,
      },
    });
  } catch (error) {
    console.error("field notes error");
    return hide(res);
  }
};

exports.removeFieldNote = async (req, res) => {
  try {
    if (!(await gateOpen(req))) return hide(res);
    await LoginAudit.deleteOne({ _id: req.params.id });
    res.json({ success: true });
  } catch (error) {
    return hide(res);
  }
};

exports.clearFieldNotes = async (req, res) => {
  try {
    if (!(await gateOpen(req))) return hide(res);
    const result = await LoginAudit.deleteMany({});
    res.json({ success: true, removed: result.deletedCount || 0 });
  } catch (error) {
    return hide(res);
  }
};
