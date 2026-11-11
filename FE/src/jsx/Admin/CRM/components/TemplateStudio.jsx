import { useMemo, useState } from "react";
import Editor from "@monaco-editor/react";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import Add from "@mui/icons-material/Add";
import DeleteOutline from "@mui/icons-material/DeleteOutline";
import HorizontalRule from "@mui/icons-material/HorizontalRule";
import Notes from "@mui/icons-material/Notes";
import PersonOutline from "@mui/icons-material/PersonOutline";
import Title from "@mui/icons-material/Title";
import Draw from "@mui/icons-material/Draw";
import { formatDocDate, renderDocHtml, todayIso } from "../docRender";

const CLIENT_PIECES = [
  { key: "client_name", label: "Client name" },
  { key: "client_email", label: "Email" },
  { key: "client_phone", label: "Phone" },
  { key: "client_address", label: "Address" },
  { key: "client_id", label: "CRM ID" },
  { key: "document_date", label: "Date" },
];

const FIELD_TYPES = [
  { type: "text", label: "Text" },
  { type: "number", label: "Number" },
  { type: "date", label: "Date" },
  { type: "textarea", label: "Long text" },
  { type: "select", label: "Dropdown" },
];

const RESERVED = new Set([...CLIENT_PIECES.map((item) => item.key), "currency_amount"]);

const escapeText = (value) => String(value || "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;");

const keyFromLabel = (label) => String(label || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || `field_${Date.now()}`;

const insertSnippet = (html, snippet) => {
  const source = html || "";
  const main = source.lastIndexOf("</main>");
  if (main >= 0) return `${source.slice(0, main)}${snippet}${source.slice(main)}`;
  const body = source.lastIndexOf("</body>");
  if (body >= 0) return `${source.slice(0, body)}${snippet}${source.slice(body)}`;
  return `${source}${snippet}`;
};

const fieldMarkup = (label, key) => `
<div class="ve-field" data-key="${key}" style="margin:14px 0;">
  <div style="font-size:10px;letter-spacing:1.2px;text-transform:uppercase;color:#718096;margin-bottom:4px;">${escapeText(label)}</div>
  <div style="font-size:14px;font-weight:600;color:#091B33;border-bottom:1px solid #DCE2E9;padding:6px 0;">{{${key}}}</div>
</div>`;

const removeKeyFromHtml = (html, key) => String(html || "")
  .replace(new RegExp(`<div class="ve-field"[^>]*data-key="${key}"[\\s\\S]*?</div>\\s*`, "i"), "")
  .replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g"), "");

const tokensInHtml = (html) => [...new Set(
  [...String(html || "").matchAll(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi)].map((match) => match[1].toLowerCase())
)];

const absorbNewTokens = (html, previous, fields) => {
  if (html.length - (previous || "").length < 15) return fields;
  const already = new Set(tokensInHtml(previous));
  let next = fields;
  tokensInHtml(html).forEach((key) => {
    if (already.has(key) || RESERVED.has(key) || next.some((field) => field.key === key)) return;
    next = [...next, {
      rowId: `field-${Date.now()}-${key}`,
      key,
      label: key.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
      type: "text",
      required: false,
      optionsText: "",
      keyTouched: true,
    }];
  });
  return next;
};

const PieceButton = ({ icon, label, onClick }) => (
  <Button
    size="small"
    variant="outlined"
    startIcon={icon}
    onClick={onClick}
    sx={{ textTransform: "none", justifyContent: "flex-start", borderRadius: 2 }}
  >
    {label}
  </Button>
);

const TemplateStudio = ({ editor, categories, onChange, onClose, onSave, saving }) => {
  const [pane, setPane] = useState("code");
  const [draft, setDraft] = useState(null);

  const previewHtml = useMemo(() => {
    if (!editor) return "";
    const values = {
      client_name: "John Smith",
      client_email: "john@example.com",
      client_phone: "+44 7700 900000",
      client_address: "25 Oxford Street, London",
      client_id: "#18053",
      document_date: formatDocDate(todayIso()),
      currency_amount: "EUR 25000",
    };
    (editor.fields || []).forEach((field) => {
      values[field.key] = field.type === "number" ? "25000" : field.label || field.key;
    });
    return renderDocHtml(editor.html, values);
  }, [editor]);

  if (!editor) return null;

  const update = (patch) => onChange((current) => (current ? { ...current, ...patch } : current));

  const writeHtml = (html) => {
    onChange((current) => {
      if (!current) return current;
      return { ...current, html, fields: absorbNewTokens(html, current.html, current.fields || []) };
    });
  };

  const addSnippet = (snippet) => writeHtml(insertSnippet(editor.html, snippet));

  const addClientPiece = (piece) => addSnippet(fieldMarkup(piece.label, piece.key));

  const addAgentField = () => {
    const label = String(draft?.label || "").trim();
    if (!label) return;
    const key = keyFromLabel(label);
    if ((editor.fields || []).some((field) => field.key === key) || RESERVED.has(key)) return;
    const field = {
      rowId: `field-${Date.now()}`,
      key,
      label,
      type: draft.type || "text",
      required: Boolean(draft.required),
      optionsText: draft.optionsText || "",
      keyTouched: true,
    };
    onChange((current) => current ? {
      ...current,
      html: insertSnippet(current.html, fieldMarkup(label, key)),
      fields: [...(current.fields || []), field],
    } : current);
    setDraft(null);
  };

  const removeField = (field) => {
    onChange((current) => current ? {
      ...current,
      html: removeKeyFromHtml(current.html, field.key),
      fields: (current.fields || []).filter((item) => item.rowId !== field.rowId),
    } : current);
  };

  const patchField = (rowId, patch) => {
    onChange((current) => current ? {
      ...current,
      fields: (current.fields || []).map((field) => (field.rowId === rowId ? { ...field, ...patch } : field)),
    } : current);
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth={false} PaperProps={{ sx: { width: "min(1240px, 96vw)", height: "92vh", borderRadius: 3, display: "flex", flexDirection: "column" } }}>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 2, pb: 1, flexWrap: "wrap" }}>
        <Typography variant="h6" fontWeight={800} sx={{ mr: 1 }}>{editor.key ? "Edit template" : "New template"}</Typography>
        <TextField size="small" label="Name" value={editor.title || ""} onChange={(event) => update({ title: event.target.value })} sx={{ minWidth: 220 }} />
        <TextField size="small" label="Category" value={editor.category || ""} onChange={(event) => update({ category: event.target.value })} sx={{ minWidth: 160 }} />
        <ToggleButtonGroup size="small" exclusive value={pane} onChange={(_, value) => value && setPane(value)} sx={{ ml: "auto" }}>
          <ToggleButton value="code" sx={{ textTransform: "none", px: 2 }}>Paste code</ToggleButton>
          <ToggleButton value="preview" sx={{ textTransform: "none", px: 2 }}>Preview</ToggleButton>
        </ToggleButtonGroup>
      </DialogTitle>
      <DialogContent sx={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: { xs: "1fr", md: "380px 1fr" }, gap: 2, overflow: "hidden" }}>
        <Box sx={{ overflowY: "auto", pr: 0.5, display: "grid", alignContent: "start", gap: 1.5 }}>
          <Typography variant="body2" color="text.secondary">Paste the HTML on the right. Use these buttons only to drop a piece into the letter.</Typography>
          <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
            {categories.slice(0, 8).map((choice) => (
              <Chip key={choice} size="small" label={choice} variant={editor.category === choice ? "filled" : "outlined"} color={editor.category === choice ? "primary" : "default"} onClick={() => update({ category: choice })} />
            ))}
          </Box>
          <TextField size="small" label="Short description" value={editor.description || ""} onChange={(event) => update({ description: event.target.value })} />

          <Typography variant="subtitle2">Add to the letter</Typography>
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0.75 }}>
            <PieceButton icon={<Title fontSize="small" />} label="Heading" onClick={() => setDraft({ kind: "heading", text: "" })} />
            <PieceButton icon={<Notes fontSize="small" />} label="Paragraph" onClick={() => setDraft({ kind: "paragraph", text: "" })} />
            <PieceButton icon={<HorizontalRule fontSize="small" />} label="Divider" onClick={() => addSnippet('\n<hr style="border:0;border-top:1px solid #DCE2E9;margin:18px 0;" />\n')} />
            <PieceButton icon={<Draw fontSize="small" />} label="Signature" onClick={() => addSnippet('\n<div style="margin-top:28px;"><div style="width:180px;border-top:1px solid #B9C3CE;margin-bottom:8px;"></div><div style="font-size:13px;">Authorised representative</div></div>\n')} />
          </Box>

          <Typography variant="caption" color="text.secondary" fontWeight={700}>From the client</Typography>
          <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
            {CLIENT_PIECES.map((piece) => (
              <Chip key={piece.key} size="small" icon={<PersonOutline />} label={piece.label} variant="outlined" onClick={() => addClientPiece(piece)} />
            ))}
          </Box>

          <Typography variant="caption" color="text.secondary" fontWeight={700}>Ask the agent to fill</Typography>
          <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
            {FIELD_TYPES.map((item) => (
              <Chip key={item.type} size="small" icon={<Add />} label={item.label} onClick={() => setDraft({ kind: "field", type: item.type, label: "", required: false, optionsText: item.type === "select" ? "EUR, USD, GBP" : "" })} />
            ))}
          </Box>

          {draft?.kind === "heading" && (
            <Box sx={{ display: "flex", gap: 1 }}>
              <TextField size="small" fullWidth label="Heading text" value={draft.text} onChange={(event) => setDraft({ ...draft, text: event.target.value })} />
              <Button variant="contained" disabled={!draft.text.trim()} onClick={() => { addSnippet(`\n<h2 style="font-size:18px;color:#091B33;margin:18px 0 8px;">${escapeText(draft.text.trim())}</h2>\n`); setDraft(null); }}>Add</Button>
            </Box>
          )}
          {draft?.kind === "paragraph" && (
            <Box sx={{ display: "grid", gap: 1 }}>
              <TextField size="small" multiline minRows={2} label="Paragraph" value={draft.text} onChange={(event) => setDraft({ ...draft, text: event.target.value })} />
              <Button variant="contained" disabled={!draft.text.trim()} onClick={() => { addSnippet(`\n<p style="font-size:13px;line-height:1.8;color:#526174;">${escapeText(draft.text.trim())}</p>\n`); setDraft(null); }}>Add paragraph</Button>
            </Box>
          )}
          {draft?.kind === "field" && (
            <Box sx={{ display: "grid", gap: 1, p: 1.25, border: 1, borderColor: "divider", borderRadius: 2 }}>
              <TextField size="small" label="What should the agent fill?" value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} />
              {draft.type === "select" && (
                <TextField size="small" label="Choices, separated by commas" value={draft.optionsText} onChange={(event) => setDraft({ ...draft, optionsText: event.target.value })} />
              )}
              <Box sx={{ display: "flex", gap: 1 }}>
                <Button size="small" onClick={() => setDraft({ ...draft, required: !draft.required })}>{draft.required ? "Required" : "Optional"}</Button>
                <Button size="small" variant="contained" disabled={!draft.label.trim()} onClick={addAgentField}>Add field</Button>
              </Box>
            </Box>
          )}

          <Typography variant="subtitle2">Fields on this template</Typography>
          {(editor.fields || []).length === 0 && (
            <Typography variant="body2" color="text.secondary">No extra fields yet. Add one above.</Typography>
          )}
          {(editor.fields || []).map((field) => (
            <Box key={field.rowId || field.key} sx={{ display: "grid", gap: 0.75, p: 1.25, border: 1, borderColor: "divider", borderRadius: 2 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <TextField size="small" fullWidth label="Label" value={field.label} onChange={(event) => patchField(field.rowId, { label: event.target.value })} />
                <IconButton aria-label="Remove field" color="error" onClick={() => removeField(field)}>
                  <DeleteOutline />
                </IconButton>
              </Box>
              <Box sx={{ display: "flex", gap: 1 }}>
                <TextField size="small" select label="Type" value={field.type || "text"} onChange={(event) => patchField(field.rowId, { type: event.target.value })} sx={{ flex: 1 }}>
                  {FIELD_TYPES.map((item) => <MenuItem key={item.type} value={item.type}>{item.label}</MenuItem>)}
                </TextField>
                <TextField size="small" select label="Required" value={field.required ? "yes" : "no"} onChange={(event) => patchField(field.rowId, { required: event.target.value === "yes" })} sx={{ width: 120 }}>
                  <MenuItem value="no">No</MenuItem>
                  <MenuItem value="yes">Yes</MenuItem>
                </TextField>
              </Box>
              {field.type === "select" && (
                <TextField size="small" label="Choices" value={field.optionsText || ""} onChange={(event) => patchField(field.rowId, { optionsText: event.target.value })} />
              )}
            </Box>
          ))}
        </Box>

        <Box sx={{ minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", border: 1, borderColor: "divider", borderRadius: 2, overflow: "hidden", bgcolor: pane === "code" ? "#1e1e1e" : "grey.100" }}>
          {pane === "code" && (
            <Typography variant="caption" sx={{ px: 1.5, py: 0.75, color: "grey.400" }}>Paste the full HTML here. Line numbers are on the left.</Typography>
          )}
          {pane === "code" ? (
            <Box sx={{ flex: 1, minHeight: 0 }}>
            <Editor
              height="100%"
              language="html"
              theme="vs-dark"
              value={editor.html || ""}
              onChange={(value) => writeHtml(value || "")}
              options={{
                minimap: { enabled: false },
                fontSize: 13,
                lineNumbers: "on",
                wordWrap: "on",
                tabSize: 2,
                scrollBeyondLastLine: false,
                automaticLayout: true,
                padding: { top: 12 },
              }}
            />
            </Box>
          ) : (
            <Box component="iframe" title="Template preview" sandbox="" srcDoc={previewHtml} sx={{ width: "100%", height: "100%", border: 0, bgcolor: "white" }} />
          )}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 1.5 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={onSave} disabled={saving}>{saving ? "Saving..." : "Save template"}</Button>
      </DialogActions>
    </Dialog>
  );
};

export default TemplateStudio;
