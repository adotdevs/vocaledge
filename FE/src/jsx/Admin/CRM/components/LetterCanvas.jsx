import { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Button,
  Chip,
  IconButton,
  MenuItem,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import DeleteOutline from "@mui/icons-material/DeleteOutline";
import Save from "@mui/icons-material/Save";
import Undo from "@mui/icons-material/Undo";
import Title from "@mui/icons-material/Title";
import Notes from "@mui/icons-material/Notes";

const TOKEN_LABELS = {
  client_name: "Client name",
  client_email: "Email",
  client_phone: "Phone",
  client_address: "Address",
  client_id: "CRM ID",
  document_date: "Date",
  currency_amount: "Amount",
};

const escapeText = (value) => String(value || "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;");

const editorStyle = `
<style data-ve-editor>
  [data-ve-token]{display:inline-block;background:#eef2ff;color:#3730a3;border-radius:6px;padding:0 6px;font-weight:700;font-size:12px;}
  [data-ve-selected]{outline:2px solid #5b4dff;outline-offset:3px;}
  body{cursor:text;}
</style>`;

export const toDesignHtml = (html, fields = []) => {
  const labelOf = (key) => TOKEN_LABELS[key] || fields.find((field) => field.key === key)?.label || key.replace(/_/g, " ");
  const marked = String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_, key) => (
      `<span data-ve-token="${key}" contenteditable="false">${escapeText(labelOf(key))}</span>`
    ));
  if (marked.includes("</head>")) return marked.replace("</head>", `${editorStyle}</head>`);
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">${editorStyle}</head><body>${marked}</body></html>`;
};

export const fromDesignDocument = (doc) => {
  const clone = doc.documentElement.cloneNode(true);
  clone.querySelectorAll("[data-ve-token]").forEach((node) => {
    const key = node.getAttribute("data-ve-token");
    node.replaceWith(doc.createTextNode(`{{${key}}}`));
  });
  clone.querySelectorAll("[data-ve-editor]").forEach((node) => node.remove());
  clone.querySelectorAll("[contenteditable]").forEach((node) => node.removeAttribute("contenteditable"));
  clone.querySelectorAll("[data-ve-selected]").forEach((node) => node.removeAttribute("data-ve-selected"));
  return `<!DOCTYPE html>\n${clone.outerHTML}`;
};

const LetterCanvas = ({
  html,
  fields,
  filledHtml,
  canEdit,
  saving,
  onSave,
}) => {
  const frameRef = useRef(null);
  const previewRef = useRef(null);
  const historyRef = useRef([]);
  const [canUndo, setCanUndo] = useState(false);
  const [designing, setDesigning] = useState(false);
  const [fieldName, setFieldName] = useState("");
  const [fieldType, setFieldType] = useState("text");
  const [fieldOptions, setFieldOptions] = useState("EUR, USD, GBP");
  const [addedFields, setAddedFields] = useState([]);
  const selectedRef = useRef(null);
  const designHtml = useMemo(() => toDesignHtml(html, fields), [html, fields]);
  const [sessionHtml, setSessionHtml] = useState(null);

  useEffect(() => {
    setSessionHtml(null);
    historyRef.current = [];
    setCanUndo(false);
  }, [designHtml]);

  const docOf = () => frameRef.current?.contentDocument;

  const fitFrame = (frame) => {
    const doc = frame?.contentDocument;
    if (!frame || !doc) return;
    const height = Math.max(doc.body?.scrollHeight || 0, doc.documentElement?.scrollHeight || 0, 900);
    frame.style.height = `${height + 48}px`;
  };

  const remember = () => {
    const doc = docOf();
    if (!doc?.documentElement) return;
    historyRef.current.push(doc.documentElement.outerHTML);
    if (historyRef.current.length > 40) historyRef.current.shift();
    setCanUndo(true);
  };

  const undo = () => {
    const previous = historyRef.current.pop();
    if (!previous) return;
    setSessionHtml(`<!DOCTYPE html>\n${previous}`);
    setCanUndo(historyRef.current.length > 0);
  };

  const arm = () => {
    const doc = docOf();
    if (!doc?.body || !designing) return;
    doc.body.setAttribute("contenteditable", "true");
    doc.querySelectorAll("[data-ve-token]").forEach((node) => node.setAttribute("contenteditable", "false"));
    fitFrame(frameRef.current);
    let typing = false;
    doc.addEventListener("beforeinput", () => {
      if (typing) return;
      typing = true;
      remember();
      setTimeout(() => { typing = false; }, 700);
    });
    doc.addEventListener("click", (event) => {
      const target = event.target?.closest?.("[data-ve-token], p, h1, h2, h3, li, td, .ve-field") || event.target;
      if (!target || target === doc.body || target === doc.documentElement) return;
      doc.querySelectorAll("[data-ve-selected]").forEach((node) => node.removeAttribute("data-ve-selected"));
      target.setAttribute("data-ve-selected", "true");
      selectedRef.current = target;
    });
  };

  const deleteSelected = () => {
    const doc = docOf();
    const node = selectedRef.current || doc?.querySelector("[data-ve-selected]");
    if (!node || node === doc?.body || node === doc?.documentElement) return;
    remember();
    node.remove();
    selectedRef.current = null;
    fitFrame(frameRef.current);
  };

  const insertHtml = (snippet) => {
    const doc = docOf();
    if (!doc) return;
    remember();
    const holder = doc.createElement("div");
    holder.innerHTML = snippet.trim();
    const node = holder.firstElementChild;
    if (!node) return;
    const selected = doc.querySelector("[data-ve-selected]");
    const main = doc.querySelector("main") || doc.body;
    if (selected?.parentNode) selected.parentNode.insertBefore(node, selected.nextSibling);
    else main.appendChild(node);
    fitFrame(frameRef.current);
  };

  const addField = () => {
    const label = fieldName.trim();
    if (!label) return;
    const key = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || `field_${Date.now()}`;
    insertHtml(`<div class="ve-field" data-key="${key}" style="margin:14px 0;"><div style="font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#718096;">${escapeText(label)}</div><div style="font-weight:700;border-bottom:1px solid #DCE2E9;padding:6px 0;"><span data-ve-token="${key}" contenteditable="false">${escapeText(label)}</span></div></div>`);
    setAddedFields((current) => [...current, {
      key,
      label,
      type: fieldType,
      required: false,
      options: fieldType === "select"
        ? fieldOptions.split(",").map((part) => part.trim()).filter(Boolean)
        : [],
    }]);
    setFieldName("");
  };

  const save = () => {
    const doc = docOf();
    if (!doc) return;
    onSave(fromDesignDocument(doc), addedFields);
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column" }}>
      <Box sx={{ position: "sticky", top: 0, zIndex: 8, px: 1.5, py: 1, display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap", borderBottom: 1, borderColor: "divider", bgcolor: "background.paper" }}>
        <Button size="small" variant={designing ? "outlined" : "contained"} onClick={() => setDesigning(false)} sx={{ textTransform: "none" }}>Preview</Button>
        {canEdit && (
          <Button size="small" variant={designing ? "contained" : "outlined"} onClick={() => setDesigning(true)} sx={{ textTransform: "none" }}>Edit letter</Button>
        )}
        {designing && (
          <>
            <Tooltip title="Add a heading"><IconButton size="small" onClick={() => insertHtml("<h2 style=\"margin:16px 0 8px;color:#091B33;\">Heading</h2>")}><Title fontSize="small" /></IconButton></Tooltip>
            <Tooltip title="Add a paragraph"><IconButton size="small" onClick={() => insertHtml("<p style=\"font-size:13px;line-height:1.8;color:#526174;\">Type here</p>")}><Notes fontSize="small" /></IconButton></Tooltip>
            {["client_name", "client_email", "client_phone", "client_address", "document_date"].map((key) => (
              <Chip key={key} size="small" label={TOKEN_LABELS[key]} onClick={() => insertHtml(`<span data-ve-token="${key}" contenteditable="false">${TOKEN_LABELS[key]}</span>`)} />
            ))}
            <TextField size="small" placeholder="New field name" value={fieldName} onChange={(event) => setFieldName(event.target.value)} sx={{ width: 160 }} />
            <TextField size="small" select value={fieldType} onChange={(event) => setFieldType(event.target.value)} sx={{ width: 120 }}>
              <MenuItem value="text">Text</MenuItem>
              <MenuItem value="number">Number</MenuItem>
              <MenuItem value="date">Date</MenuItem>
              <MenuItem value="textarea">Long text</MenuItem>
              <MenuItem value="select">Dropdown</MenuItem>
            </TextField>
            {fieldType === "select" && (
              <TextField size="small" placeholder="EUR, USD, GBP" value={fieldOptions} onChange={(event) => setFieldOptions(event.target.value)} sx={{ width: 180 }} />
            )}
            <Button size="small" onClick={addField} disabled={!fieldName.trim()}>Add field</Button>
            <Button size="small" variant="outlined" startIcon={<Undo />} onClick={undo} disabled={!canUndo}>Undo</Button>
            <Button size="small" color="error" variant="outlined" startIcon={<DeleteOutline />} onClick={deleteSelected}>Delete selected</Button>
            <Button size="small" variant="contained" startIcon={<Save />} onClick={save} disabled={saving} sx={{ ml: "auto", textTransform: "none" }}>
              {saving ? "Saving..." : "Save template"}
            </Button>
          </>
        )}
      </Box>
      <Box sx={{ bgcolor: "grey.100" }}>
        {designing ? (
          <Box
            key={designHtml}
            component="iframe"
            ref={frameRef}
            title="Letter editor"
            sandbox="allow-same-origin"
            srcDoc={sessionHtml || designHtml}
            onLoad={arm}
            sx={{ width: "100%", height: 1200, border: 0, bgcolor: "white", display: "block" }}
          />
        ) : (
          <Box
            component="iframe"
            ref={previewRef}
            title="Document preview"
            sandbox=""
            srcDoc={filledHtml}
            onLoad={() => fitFrame(previewRef.current)}
            sx={{ width: "100%", height: 1200, border: 0, bgcolor: "white", display: "block" }}
          />
        )}
      </Box>
      {designing && (
        <Typography variant="caption" color="text.secondary" sx={{ px: 1.5, py: 0.75 }}>
          Click any text to change it. Purple labels are filled from the client or from the fields on the left. Save template keeps this layout for everyone.
        </Typography>
      )}
    </Box>
  );
};

export default LetterCanvas;
