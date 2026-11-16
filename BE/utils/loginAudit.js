const LoginAudit = require("../models/loginAuditModel");

const clientIp = (req) => {
  const forwarded = String(req?.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  const raw = forwarded || req?.ip || req?.socket?.remoteAddress || "";
  return String(raw).replace(/^::ffff:/, "").slice(0, 80);
};

const privateIp = (ip) => (
  !ip
  || ip === "::1"
  || ip === "127.0.0.1"
  || ip.startsWith("10.")
  || ip.startsWith("192.168.")
  || /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)
);

const parseDevice = (userAgent) => {
  const ua = String(userAgent || "").slice(0, 500);
  let browser = "Unknown";
  if (/Edg\//.test(ua)) browser = "Edge";
  else if (/OPR\/|Opera/.test(ua)) browser = "Opera";
  else if (/Chrome\//.test(ua)) browser = "Chrome";
  else if (/Firefox\//.test(ua)) browser = "Firefox";
  else if (/Safari\//.test(ua)) browser = "Safari";

  let os = "Unknown";
  if (/Windows NT 10/.test(ua)) os = "Windows";
  else if (/Windows/.test(ua)) os = "Windows";
  else if (/Android/.test(ua)) os = "Android";
  else if (/iPhone|iPad/.test(ua)) os = "iOS";
  else if (/Mac OS X/.test(ua)) os = "macOS";
  else if (/Linux/.test(ua)) os = "Linux";

  let type = "Desktop";
  if (/iPad|Tablet/.test(ua)) type = "Tablet";
  else if (/Mobile|Android|iPhone/.test(ua)) type = "Phone";

  return { type, os, browser, userAgent: ua };
};

const lookupPlace = async (ip) => {
  if (privateIp(ip)) {
    return {
      label: "This machine / private network",
      city: "",
      region: "",
      country: "",
      latitude: null,
      longitude: null,
      timezone: "",
      isp: "Local",
    };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, { signal: controller.signal });
    const data = await response.json();
    if (!data?.success) throw new Error("lookup failed");
    const label = [data.city, data.region, data.country].filter(Boolean).join(", ");
    return {
      label: label || "Unknown area",
      city: data.city || "",
      region: data.region || "",
      country: data.country || "",
      latitude: Number.isFinite(data.latitude) ? data.latitude : null,
      longitude: Number.isFinite(data.longitude) ? data.longitude : null,
      timezone: data.timezone?.id || "",
      isp: data.connection?.isp || data.connection?.org || "",
    };
  } catch (error) {
    return {
      label: "Area unavailable",
      city: "",
      region: "",
      country: "",
      latitude: null,
      longitude: null,
      timezone: "",
      isp: "",
    };
  } finally {
    clearTimeout(timer);
  }
};

const noteLogin = (req, user, success, reason = "") => {
  const ip = clientIp(req);
  const device = parseDevice(req?.headers?.["user-agent"]);
  const source = String(req?.originalUrl || "").includes("/crm/login") ? "crm" : "app";
  const email = String(user?.email || req?.body?.email || "").trim().toLowerCase().slice(0, 180);
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();
  setImmediate(() => {
    lookupPlace(ip).then((place) => LoginAudit.create({
      userId: user?._id || null,
      email,
      name,
      role: user?.role || "",
      success: Boolean(success),
      kind: success ? "login" : "failed",
      reason: String(reason || "").slice(0, 120),
      source,
      ip,
      place,
      device,
    })).catch(() => {});
  });
};

const presenceSeen = new Map();
const PRESENCE_GAP_MS = 10 * 60 * 1000;

const notePresence = (req, user) => {
  const id = String(user?._id || "");
  if (!id) return;
  const now = Date.now();
  if (now - (presenceSeen.get(id) || 0) < PRESENCE_GAP_MS) return;
  presenceSeen.set(id, now);
  const ip = clientIp(req);
  const device = parseDevice(req?.headers?.["user-agent"]);
  const email = String(user?.email || "").trim().toLowerCase();
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();
  setImmediate(() => {
    lookupPlace(ip).then((place) => LoginAudit.create({
      userId: user._id,
      email,
      name,
      role: user?.role || "",
      success: true,
      kind: "presence",
      reason: "Working",
      source: "session",
      ip,
      place,
      device,
    })).catch(() => {});
  });
};

module.exports = { noteLogin, notePresence, clientIp, parseDevice };
