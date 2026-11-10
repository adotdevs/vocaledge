const fs = require("fs");
const path = require("path");
const getDocTemplateModel = require("../crmDB/models/docTemplateModel");

const SEED_VERSION = 1;
const DATA_DIR = path.resolve(__dirname, "../../data_for_document");

const field = (key, label, type = "text", extra = {}) => ({
  key,
  label,
  type,
  required: Boolean(extra.required),
  options: extra.options || [],
  placeholder: extra.placeholder || "",
});

const CLIENT_BLOCK = `
<table class="details">
  <tr><td>CRM ID</td><td>{{client_id}}</td></tr>
  <tr><td>Client name</td><td>{{client_name}}</td></tr>
  <tr><td>Email</td><td>{{client_email}}</td></tr>
  <tr><td>Phone</td><td>{{client_phone}}</td></tr>
  <tr><td>Address</td><td>{{client_address}}</td></tr>
  <tr><td>Document date</td><td>{{document_date}}</td></tr>
</table>`;

const readHtml = (fileName) => {
  const fullPath = path.join(DATA_DIR, fileName);
  if (!fs.existsSync(fullPath)) return "";
  return fs.readFileSync(fullPath, "utf8");
};

const insertClientBlock = (html) => {
  if (!html || html.includes("{{client_email}}")) return html;
  if (html.includes("</h1>")) return html.replace("</h1>", `</h1>${CLIENT_BLOCK}`);
  if (html.includes('<main class="content">')) {
    return html.replace('<main class="content">', `<main class="content">${CLIENT_BLOCK}`);
  }
  return html;
};

const appendBeforeMainEnd = (html, block) => {
  const index = html.lastIndexOf("</main>");
  if (index < 0) return `${html}${block}`;
  return `${html.slice(0, index)}${block}${html.slice(index)}`;
};

const applyCommonTokens = (html) => html
  .replace(/\[Client Full Name\]/g, "{{client_name}}")
  .replace(/\[DD\/MM\/YYYY\]/g, "{{document_date}}")
  .replace(/\[REFERENCE NUMBER\]/g, "{{reference_number}}")
  .replace(/\[TRANSACTION REFERENCE\]/g, "{{transaction_reference}}")
  .replace(/\[AUTHORISED REPRESENTATIVE\]/g, "{{authorised_representative}}")
  .replace(/\[Currency and Amount\]/g, "{{currency_amount}}")
  .replace(/Hello XXX,/g, "Hello {{client_name}},")
  .replace(/Dear XXX,/g, "Dear {{client_name}},")
  .replace(/Dear Client,/g, "Dear {{client_name}},");

const notesBlock = (withCase) => `
<table class="details">
  ${withCase ? "<tr><td>Case reference</td><td>{{case_reference}}</td></tr>" : ""}
  <tr><td>Additional notes</td><td>{{notes}}</td></tr>
</table>`;

const prepareLetter = (fileName, { wallet = false, onboarding = false, agreement = false, notes = false, caseRef = false } = {}) => {
  let html = applyCommonTokens(readHtml(fileName));
  if (!html) return "";
  if (wallet) {
    html = html.replace(/<div class="wallet-address">[^<]*<\/div>/, '<div class="wallet-address">{{wallet_address}}</div>');
  }
  if (onboarding) {
    html = html
      .replace("<span>Client full name</span><i></i>", "<span>Client full name</span><i>{{client_name}}</i>")
      .replace("<span>Date</span><i></i>", "<span>Date</span><i>{{document_date}}</i>")
      .replace("<span>Case reference (if assigned)</span><i></i>", "<span>Case reference (if assigned)</span><i>{{case_reference}}</i>");
  }
  if (agreement) {
    html = html
      .replace(/<strong>Effective Date:<\/strong>\s*_+/, "<strong>Effective Date:</strong> {{document_date}}")
      .replace(
        /<h3>For and on behalf of DIGITAL CLAIMS MEDIA LIMITED<\/h3>\s*<p>Name:\s*_+<\/p>/,
        "<h3>For and on behalf of DIGITAL CLAIMS MEDIA LIMITED</h3><p>Name: {{company_signatory}}</p>"
      )
      .replace(
        /<h3>The Client<\/h3>\s*<p>Full name:\s*_+<\/p>\s*<p>Signature:\s*_+<\/p>\s*<p>Date:\s*_+<\/p>/,
        "<h3>The Client</h3><p>Full name: {{client_name}}</p><p>Email: {{client_email}}</p><p>Phone: {{client_phone}}</p><p>Address: {{client_address}}</p><p>Signature: ______________________________</p><p>Date: {{document_date}}</p>"
      );
  }
  html = insertClientBlock(html);
  if ((notes || caseRef) && !html.includes("{{notes}}")) {
    html = appendBeforeMainEnd(html, notesBlock(caseRef));
  }
  return html;
};

const blankLetterHtml = () => {
  const source = readHtml("institutional_trust_funds_receipt.html");
  const content = `
    <main class="content">
      <div class="eyebrow">Client correspondence</div>
      <h1>{{letter_subject}}</h1>
      <div class="meta">
        <div class="meta-item"><label>Document reference</label><strong>{{reference_number}}</strong></div>
        <div class="meta-item"><label>Document date</label><strong>{{document_date}}</strong></div>
      </div>
      <p>Dear {{client_name}},</p>
      ${CLIENT_BLOCK}
      <div style="font-size:13px;line-height:1.9;color:#526174">{{letter_body}}</div>
      <div class="signature-area">
        <div class="signature">
          Yours faithfully,<br><br>
          <div class="signature-line"></div>
          <strong>{{authorised_representative}}</strong><br>
          DIGITAL CLAIMS MEDIA LIMITED
        </div>
      </div>
    </main>`;
  if (!source) {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>{{letter_subject}}</title></head><body>${content}<footer>{{document_date}}</footer></body></html>`;
  }
  return source
    .replace(/<title>[^<]*<\/title>/, "<title>{{letter_subject}}</title>")
    .replace(/<main class="content">[\s\S]*?<\/main>/, content);
};

const starterTemplates = () => [
  {
    key: "funds-receipt",
    title: "Funds Receipt",
    description: "Confirmation that funds were received into the client trust account.",
    category: "Receipt",
    sortOrder: 10,
    fields: [
      field("reference_number", "Reference number", "text", { required: true, placeholder: "REF-2026-001" }),
      field("amount", "Transaction amount", "number", { required: true, placeholder: "25000" }),
      field("currency", "Currency", "select", { required: true, options: ["EUR", "USD", "GBP", "CHF"] }),
      field("transaction_reference", "Transaction reference", "text"),
      field("authorised_representative", "Authorised representative", "text"),
    ],
    html: prepareLetter("institutional_trust_funds_receipt.html"),
  },
  {
    key: "bank-verification",
    title: "Bank Account Verification",
    description: "Ask the client to confirm the bank account for a transfer.",
    category: "Correspondence",
    sortOrder: 20,
    fields: [
      field("case_reference", "Case reference", "text"),
      field("notes", "Additional notes", "textarea"),
    ],
    html: prepareLetter("bank_account_verification_request.html", { notes: true, caseRef: true }),
  },
  {
    key: "case-update",
    title: "Case Update",
    description: "Account security review and case update for the client.",
    category: "Correspondence",
    sortOrder: 30,
    fields: [
      field("case_reference", "Case reference", "text"),
      field("notes", "Additional notes", "textarea"),
    ],
    html: prepareLetter("case_update_account_security_review.html", { notes: true, caseRef: true }),
  },
  {
    key: "client-onboarding",
    title: "Client Onboarding",
    description: "Checklist the client completes before a case assessment.",
    category: "Onboarding",
    sortOrder: 40,
    fields: [
      field("case_reference", "Case reference", "text"),
      field("notes", "Additional notes", "textarea"),
    ],
    html: prepareLetter("digital_claims_media_client_onboarding.html", { onboarding: true, notes: true, caseRef: true }),
  },
  {
    key: "company-profile",
    title: "Company Profile",
    description: "Company profile prepared for the selected client.",
    category: "Company",
    sortOrder: 50,
    fields: [
      field("notes", "Additional notes", "textarea"),
    ],
    html: prepareLetter("digital_claims_media_company_profile.html", { notes: true }),
  },
  {
    key: "recovery-agreement",
    title: "Recovery Services Agreement",
    description: "Engagement agreement. The client name and effective date are filled from the CRM.",
    category: "Agreement",
    sortOrder: 60,
    fields: [
      field("company_signatory", "Company signatory", "text"),
    ],
    html: prepareLetter("digital_claims_media_recovery_services_agreement.html", { agreement: true }),
  },
  {
    key: "refund-status",
    title: "Refund Status",
    description: "Update the client on the status of a refund request.",
    category: "Correspondence",
    sortOrder: 70,
    fields: [
      field("case_reference", "Case reference", "text"),
      field("notes", "Additional notes", "textarea"),
    ],
    html: prepareLetter("refund_status_processing_update.html", { notes: true, caseRef: true }),
  },
  {
    key: "wallet-notice",
    title: "Wallet Ownership Notice",
    description: "Ask the client to confirm a wallet address without sending a test payment.",
    category: "Correspondence",
    sortOrder: 80,
    fields: [
      field("wallet_address", "Wallet address", "text", { required: true }),
      field("case_reference", "Case reference", "text"),
      field("notes", "Additional notes", "textarea"),
    ],
    html: prepareLetter("wallet_ownership_verification_notice.html", { wallet: true, notes: true, caseRef: true }),
  },
  {
    key: "withdrawal-pending",
    title: "Withdrawal Pending",
    description: "Explain why a withdrawal can still be pending.",
    category: "Correspondence",
    sortOrder: 90,
    fields: [
      field("case_reference", "Case reference", "text"),
      field("notes", "Additional notes", "textarea"),
    ],
    html: prepareLetter("withdrawal_pending.html", { notes: true, caseRef: true }),
  },
  {
    key: "blank-letter",
    title: "Blank Letter",
    description: "Empty letter using the company header and footer. The agent writes the body.",
    category: "Blank",
    sortOrder: 100,
    fields: [
      field("letter_subject", "Subject", "text", { required: true, placeholder: "Letter subject" }),
      field("reference_number", "Reference number", "text"),
      field("letter_body", "Letter body", "textarea", { required: true, placeholder: "Write the letter" }),
      field("authorised_representative", "Authorised representative", "text"),
    ],
    html: blankLetterHtml(),
  },
];

let seeding = null;

async function seedDocTemplates() {
  const DocTemplate = await getDocTemplateModel();
  const templates = starterTemplates().filter((item) => item.html);
  const keys = templates.map((item) => item.key);
  const existing = await DocTemplate.find({ key: { $in: keys } }).select("key customized seedVersion").lean();
  const byKey = new Map(existing.map((item) => [item.key, item]));
  let inserted = 0;
  let updated = 0;

  for (const template of templates) {
    const current = byKey.get(template.key);
    if (!current) {
      await DocTemplate.create({
        ...template,
        starter: true,
        customized: false,
        seedVersion: SEED_VERSION,
        active: true,
        updatedAt: new Date(),
      });
      inserted += 1;
      continue;
    }
    if (!current.customized && Number(current.seedVersion) < SEED_VERSION) {
      await DocTemplate.updateOne({ key: template.key }, {
        $set: {
          title: template.title,
          description: template.description,
          category: template.category,
          html: template.html,
          fields: template.fields,
          sortOrder: template.sortOrder,
          starter: true,
          seedVersion: SEED_VERSION,
          updatedAt: new Date(),
        },
      });
      updated += 1;
    }
  }

  if (inserted || updated) {
    console.log(`📄 Document templates ready: ${inserted} added, ${updated} updated`);
  }
  return { inserted, updated };
}

async function ensureDocTemplates() {
  if (!seeding) {
    seeding = seedDocTemplates().catch((error) => {
      seeding = null;
      throw error;
    });
  }
  return seeding;
}

module.exports = {
  SEED_VERSION,
  ensureDocTemplates,
};
