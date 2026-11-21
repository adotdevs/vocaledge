const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}[char]));

export const todayIso = () => {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

export const formatDocDate = (iso) => {
  const match = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return String(iso || "");
  return `${match[3]}/${match[2]}/${match[1]}`;
};

export const renderDocHtml = (html, values) => {
  const source = String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+\s*=\s*(['"]).*?\1/gi, "")
    .replace(/javascript:/gi, "");
  const filled = source.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_, key) => {
    const value = values?.[key];
    if (value == null || value === "") return "";
    return escapeHtml(value).replace(/\r\n|\n|\r/g, "<br>");
  });
  const printStyle =
    "<style>@page{size:A4;margin:0}@media print{html,body{background:#fff!important;margin:0!important;padding:0!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}.document{box-shadow:none!important;border:none!important;max-width:none!important;margin:0!important}tr,td,th,.card,.section,.box,.notice,.signature,.footer{break-inside:avoid!important;page-break-inside:avoid!important}.print-shell{width:100%;border-collapse:collapse}.print-shell-gap{height:12mm;padding:0;border:0}.print-shell-body{padding:0 12mm;border:0}}</style>";
  if (filled.includes("</head>")) return filled.replace("</head>", `${printStyle}</head>`);
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">${printStyle}</head><body>${filled}</body></html>`;
};

const wrapHtmlForPrint = (html) => {
  const bodyMatch = String(html || "").match(/<body([^>]*)>([\s\S]*)<\/body>/i);
  if (!bodyMatch) return html;
  const attrs = bodyMatch[1] || "";
  const inner = bodyMatch[2] || "";
  const wrapped = `<body${attrs}><table class="print-shell"><thead><tr><td class="print-shell-gap"></td></tr></thead><tbody><tr><td class="print-shell-body">${inner}</td></tr></tbody><tfoot><tr><td class="print-shell-gap"></td></tr></tfoot></table></body>`;
  return html.replace(/<body[^>]*>[\s\S]*<\/body>/i, wrapped);
};

export const downloadHtmlFile = (html, fileName) => {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

export const printHtmlDocument = (html) => {
  if (typeof document === "undefined") return false;
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.visibility = "hidden";
  document.body.appendChild(iframe);

  let printed = false;
  const cleanup = () => {
    setTimeout(() => {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    }, 1000);
  };

  const triggerPrint = () => {
    if (printed) return;
    printed = true;
    try {
      const win = iframe.contentWindow;
      if (!win) {
        cleanup();
        return;
      }
      win.addEventListener("afterprint", cleanup, { once: true });
      win.focus();
      win.print();
      setTimeout(cleanup, 60000);
    } catch {
      cleanup();
    }
  };

  iframe.addEventListener("load", triggerPrint, { once: true });
  iframe.srcdoc = wrapHtmlForPrint(html);
  setTimeout(triggerPrint, 600);
  return true;
};
