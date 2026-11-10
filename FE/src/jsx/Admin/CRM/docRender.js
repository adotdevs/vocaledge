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
  const printStyle = "<style>@page{size:A4;margin:12mm}@media print{body{background:#fff!important;padding:0!important}.document{box-shadow:none!important;border:none!important;max-width:none!important}}</style>";
  if (filled.includes("</head>")) return filled.replace("</head>", `${printStyle}</head>`);
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">${printStyle}</head><body>${filled}</body></html>`;
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
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const popup = window.open(url, "_blank");
  if (!popup) return false;
  const print = () => {
    popup.focus();
    popup.print();
  };
  popup.addEventListener("load", print, { once: true });
  setTimeout(print, 700);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return true;
};
