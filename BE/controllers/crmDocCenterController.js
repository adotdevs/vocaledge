const mongoose = require("mongoose");
const getDocTemplateModel = require("../crmDB/models/docTemplateModel");
const getDocGenerationModel = require("../crmDB/models/docGenerationModel");
const getLeadModel = require("../crmDB/models/leadsModel");
const { applyLeadVisibilityToQuery } = require("./crmController");
const { ensureDocTemplates } = require("../utils/docCenter");

const RESERVED_KEYS = new Set([
  "client_name",
  "client_email",
  "client_phone",
  "client_address",
  "client_id",
  "document_date",
  "currency_amount",
]);

const FIELD_TYPES = new Set(["text", "number", "date", "textarea", "select"]);
const LEAD_FIELDS = "leadNumber firstName lastName email phone Address";

const escapeRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const cleanHtml = (html) => String(html || "")
  .replace(/<script[\s\S]*?<\/script>/gi, "")
  .replace(/\son\w+\s*=\s*(['"]).*?\1/gi, "")
  .replace(/javascript:/gi, "");

const publicTemplate = (template, { includeHtml = false } = {}) => ({
  _id: template._id,
  key: template.key,
  title: template.title,
  description: template.description || "",
  category: template.category || "Correspondence",
  fields: template.fields || [],
  sortOrder: template.sortOrder || 0,
  starter: Boolean(template.starter),
  active: template.active !== false,
  createdAt: template.createdAt || null,
  updatedAt: template.updatedAt || template.createdAt || null,
  ...(includeHtml ? { html: template.html || "" } : {}),
});

const leadName = (lead) => `${lead?.firstName || ""} ${lead?.lastName || ""}`.replace(/\s+/g, " ").trim();

const presentLead = (lead) => ({
  _id: lead._id,
  leadNumber: lead.leadNumber || null,
  firstName: lead.firstName || "",
  lastName: lead.lastName || "",
  fullName: leadName(lead),
  email: lead.email || "",
  phone: lead.phone || "",
  address: lead.Address || "",
});

const normalizeFields = (fields) => {
  if (!Array.isArray(fields)) return [];
  const seen = new Set();
  return fields.slice(0, 40).map((item) => {
    const key = String(item?.key || "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/^_+/, "");
    return {
      key,
      label: String(item?.label || key).trim().slice(0, 80),
      type: FIELD_TYPES.has(item?.type) ? item.type : "text",
      required: Boolean(item?.required),
      options: Array.isArray(item?.options) ? item.options.map((option) => String(option).trim()).filter(Boolean).slice(0, 20) : [],
      placeholder: String(item?.placeholder || "").slice(0, 120),
    };
  }).filter((item) => {
    if (!item.key || RESERVED_KEYS.has(item.key) || seen.has(item.key)) return false;
    seen.add(item.key);
    return true;
  });
};

const actorOf = (user) => ({
  userId: user?._id || null,
  userName: `${user?.firstName || ""} ${user?.lastName || ""}`.trim() || "CRM user",
  userRole: user?.role || "",
});

exports.listDocTemplates = async (req, res) => {
  try {
    await ensureDocTemplates();
    const DocTemplate = await getDocTemplateModel();
    const search = String(req.query.search || "").trim();
    const category = String(req.query.category || "").trim();
    const includeHidden = req.user?.role === "superadmin" && req.query.includeHidden === "true";
    const query = includeHidden ? {} : { active: { $ne: false } };
    if (category && category !== "All") query.category = category;
    if (search) {
      const pattern = new RegExp(escapeRegex(search), "i");
      query.$or = [{ title: pattern }, { description: pattern }, { category: pattern }, { key: pattern }];
    }
    const templates = await DocTemplate.find(query).select("-html").sort({ sortOrder: 1, title: 1 }).lean();
    const categories = await DocTemplate.distinct("category", includeHidden ? {} : { active: { $ne: false } });
    res.json({
      success: true,
      templates: templates.map((item) => publicTemplate(item)),
      categories: categories.filter(Boolean).sort(),
    });
  } catch (error) {
    console.error("listDocTemplates:", error);
    res.status(500).json({ success: false, msg: "Could not load documents" });
  }
};

exports.getDocTemplate = async (req, res) => {
  try {
    await ensureDocTemplates();
    const DocTemplate = await getDocTemplateModel();
    const template = await DocTemplate.findOne({ key: req.params.key }).lean();
    if (!template || (template.active === false && req.user?.role !== "superadmin")) {
      return res.status(404).json({ success: false, msg: "Document not found" });
    }
    res.json({ success: true, template: publicTemplate(template, { includeHtml: true }) });
  } catch (error) {
    console.error("getDocTemplate:", error);
    res.status(500).json({ success: false, msg: "Could not open this document" });
  }
};

exports.searchDocClients = async (req, res) => {
  try {
    const Lead = await getLeadModel();
    const leadId = String(req.query.leadId || "").trim();
    if (leadId) {
      if (!mongoose.Types.ObjectId.isValid(leadId)) {
        return res.status(400).json({ success: false, msg: "Client not found" });
      }
      const query = { _id: leadId, isDeleted: { $ne: true } };
      await applyLeadVisibilityToQuery(query, req.user);
      const lead = await Lead.findOne(query).select(LEAD_FIELDS).lean();
      if (!lead) return res.status(404).json({ success: false, msg: "Client not found" });
      return res.json({ success: true, clients: [presentLead(lead)] });
    }

    const search = String(req.query.q || "").trim().replace(/^#/, "");
    if (search.length < 1) return res.json({ success: true, clients: [] });
    const pattern = new RegExp(escapeRegex(search), "i");
    const query = {
      isDeleted: { $ne: true },
      $or: [
        { firstName: pattern },
        { lastName: pattern },
        { email: pattern },
        { phone: pattern },
        { Address: pattern },
        ...(/^\d+$/.test(search) ? [{ leadNumber: Number(search) }] : []),
      ],
    };
    if (search.includes(" ")) {
      const [first, ...rest] = search.split(/\s+/);
      query.$or.push({
        $and: [
          { firstName: new RegExp(escapeRegex(first), "i") },
          { lastName: new RegExp(escapeRegex(rest.join(" ")), "i") },
        ],
      });
    }
    await applyLeadVisibilityToQuery(query, req.user);
    const leads = await Lead.find(query).select(LEAD_FIELDS).sort({ updatedAt: -1, createdAt: -1 }).limit(15).lean();
    res.json({ success: true, clients: leads.map(presentLead) });
  } catch (error) {
    console.error("searchDocClients:", error);
    res.status(500).json({ success: false, msg: "Could not search clients" });
  }
};

exports.listDocHistory = async (req, res) => {
  try {
    const DocGeneration = await getDocGenerationModel();
    const query = {};
    const leadId = String(req.query.leadId || "").trim();
    if (leadId && mongoose.Types.ObjectId.isValid(leadId)) {
      const Lead = await getLeadModel();
      const visible = { _id: leadId, isDeleted: { $ne: true } };
      await applyLeadVisibilityToQuery(visible, req.user);
      const lead = await Lead.findOne(visible).select("_id").lean();
      if (!lead) return res.json({ success: true, history: [] });
      query.leadId = leadId;
    } else if (req.user?.role !== "superadmin") {
      query["createdBy.userId"] = req.user._id;
    }
    const rows = await DocGeneration.find(query).sort({ createdAt: -1 }).limit(12).lean();
    res.json({
      success: true,
      history: rows.map((row) => ({
        _id: row._id,
        templateKey: row.templateKey,
        templateTitle: row.templateTitle,
        leadId: row.leadId,
        leadNumber: row.leadNumber,
        clientName: row.clientName,
        action: row.action,
        values: row.values || {},
        createdBy: row.createdBy || null,
        createdAt: row.createdAt,
      })),
    });
  } catch (error) {
    console.error("listDocHistory:", error);
    res.status(500).json({ success: false, msg: "Could not load document history" });
  }
};

exports.recordDocGeneration = async (req, res) => {
  try {
    const DocTemplate = await getDocTemplateModel();
    const template = await DocTemplate.findOne({ key: req.body?.templateKey, active: { $ne: false } }).lean();
    if (!template) return res.status(404).json({ success: false, msg: "Document not found" });

    const values = req.body?.values && typeof req.body.values === "object" ? req.body.values : {};
    const missing = (template.fields || [])
      .filter((item) => item.required && !String(values.fields?.[item.key] ?? "").trim())
      .map((item) => item.label);
    if (!String(values.clientName || "").trim()) missing.unshift("Client name");
    if (missing.length) {
      return res.status(400).json({ success: false, msg: `Fill ${missing.join(", ")} before exporting` });
    }

    const action = ["copy", "download", "pdf"].includes(req.body?.action) ? req.body.action : "pdf";
    const DocGeneration = await getDocGenerationModel();
    const saved = await DocGeneration.create({
      templateKey: template.key,
      templateTitle: template.title,
      leadId: mongoose.Types.ObjectId.isValid(values.leadId) ? values.leadId : null,
      leadNumber: Number(values.leadNumber) || null,
      clientName: String(values.clientName || "").slice(0, 160),
      action,
      values: {
        clientName: String(values.clientName || "").slice(0, 160),
        clientEmail: String(values.clientEmail || "").slice(0, 160),
        clientPhone: String(values.clientPhone || "").slice(0, 80),
        clientAddress: String(values.clientAddress || "").slice(0, 300),
        documentDate: String(values.documentDate || "").slice(0, 20),
        fields: values.fields && typeof values.fields === "object" ? values.fields : {},
      },
      createdBy: actorOf(req.user),
    });
    res.json({ success: true, id: saved._id });
  } catch (error) {
    console.error("recordDocGeneration:", error);
    res.status(500).json({ success: false, msg: "Could not save this document" });
  }
};

exports.saveDocTemplate = async (req, res) => {
  try {
    const DocTemplate = await getDocTemplateModel();
    const title = String(req.body?.title || "").trim().slice(0, 120);
    const html = cleanHtml(req.body?.html);
    if (!title || !html.trim()) {
      return res.status(400).json({ success: false, msg: "Title and HTML are required" });
    }
    const fields = normalizeFields(req.body?.fields);
    const category = String(req.body?.category || "Correspondence").trim().slice(0, 40) || "Correspondence";
    const description = String(req.body?.description || "").trim().slice(0, 300);
    const key = String(req.params.key || req.body?.key || "").trim().toLowerCase();

    if (key) {
      const current = await DocTemplate.findOne({ key });
      if (!current) return res.status(404).json({ success: false, msg: "Document not found" });
      current.title = title;
      current.description = description;
      current.category = category;
      current.html = html;
      current.fields = fields;
      current.customized = true;
      current.active = req.body?.active === false ? false : true;
      current.updatedAt = new Date();
      await current.save();
      return res.json({ success: true, template: publicTemplate(current.toObject(), { includeHtml: true }) });
    }

    const createdKey = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || `doc-${Date.now()}`;
    const uniqueKey = await DocTemplate.exists({ key: createdKey }) ? `${createdKey}-${Date.now()}` : createdKey;
    const created = await DocTemplate.create({
      key: uniqueKey,
      title,
      description,
      category,
      html,
      fields,
      sortOrder: 1000,
      starter: false,
      customized: true,
      seedVersion: 0,
      active: true,
      updatedAt: new Date(),
    });
    res.json({ success: true, template: publicTemplate(created.toObject()) });
  } catch (error) {
    console.error("saveDocTemplate:", error);
    res.status(500).json({ success: false, msg: "Could not save this template" });
  }
};

exports.removeDocTemplate = async (req, res) => {
  try {
    const DocTemplate = await getDocTemplateModel();
    const current = await DocTemplate.findOne({ key: req.params.key });
    if (!current) return res.status(404).json({ success: false, msg: "Document not found" });
    if (current.starter) {
      current.active = false;
      current.customized = true;
      current.updatedAt = new Date();
      await current.save();
      return res.json({ success: true, hidden: true });
    }
    await current.deleteOne();
    res.json({ success: true, deleted: true });
  } catch (error) {
    console.error("removeDocTemplate:", error);
    res.status(500).json({ success: false, msg: "Could not remove this document" });
  }
};
