import { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  MenuItem,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import ContentCopy from "@mui/icons-material/ContentCopy";
import DeleteOutline from "@mui/icons-material/DeleteOutline";
import FormatAlignCenter from "@mui/icons-material/FormatAlignCenter";
import FormatAlignLeft from "@mui/icons-material/FormatAlignLeft";
import FormatAlignRight from "@mui/icons-material/FormatAlignRight";
import FormatBold from "@mui/icons-material/FormatBold";
import FormatItalic from "@mui/icons-material/FormatItalic";
import FormatListBulleted from "@mui/icons-material/FormatListBulleted";
import FormatUnderlined from "@mui/icons-material/FormatUnderlined";
import HorizontalRule from "@mui/icons-material/HorizontalRule";
import KeyboardArrowDown from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowUp from "@mui/icons-material/KeyboardArrowUp";
import Notes from "@mui/icons-material/Notes";
import OpenWith from "@mui/icons-material/OpenWith";
import Redo from "@mui/icons-material/Redo";
import Save from "@mui/icons-material/Save";
import Title from "@mui/icons-material/Title";
import Undo from "@mui/icons-material/Undo";
import ZoomOutMap from "@mui/icons-material/ZoomOutMap";

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
  [data-ve-selected]{outline:2px solid #5b4dff;outline-offset:2px;}
  [data-ve-selected]{position:relative;}
  .ve-drag-handle,.ve-resize-handle{position:absolute;z-index:30;box-sizing:border-box;user-select:none;}
  .ve-drag-handle{top:-11px;left:-11px;width:18px;height:18px;border-radius:4px;background:#5b4dff;color:#fff;font-size:11px;line-height:18px;text-align:center;cursor:grab;box-shadow:0 1px 3px rgba(15,23,42,.25);}
  .ve-drag-handle:active{cursor:grabbing;}
  .ve-resize-handle{width:10px;height:10px;background:#5b4dff;border:2px solid #fff;border-radius:2px;box-shadow:0 0 0 1px rgba(91,77,255,.35);}
  .ve-resize-handle.br{right:-5px;bottom:-5px;cursor:nwse-resize;}
  .ve-resize-handle.mr{right:-5px;top:50%;margin-top:-5px;cursor:ew-resize;}
  .ve-resize-handle.bm{left:50%;bottom:-5px;margin-left:-5px;cursor:ns-resize;}
  .ve-drop-target{outline:2px dashed #5b4dff !important;outline-offset:3px;background:rgba(91,77,255,.06);}
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
  clone.querySelectorAll(".ve-drag-handle, .ve-resize-handle").forEach((node) => node.remove());
  clone.querySelectorAll("[contenteditable]").forEach((node) => node.removeAttribute("contenteditable"));
  clone.querySelectorAll("[data-ve-selected]").forEach((node) => node.removeAttribute("data-ve-selected"));
  clone.querySelectorAll(".ve-drop-target").forEach((node) => node.classList.remove("ve-drop-target"));
  return `<!DOCTYPE html>\n${clone.outerHTML}`;
};

const toolBtnSx = {
  border: "1px solid",
  borderColor: "divider",
  borderRadius: 1.5,
  width: 32,
  height: 32,
  color: "text.primary",
  bgcolor: "background.paper",
  "&:hover": { bgcolor: "action.hover", borderColor: "primary.light" },
  "&.Mui-disabled": { opacity: 0.4 },
};

const ToolbarGroup = ({ children }) => (
  <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, flexWrap: "wrap" }}>{children}</Box>
);

const INLINE_TAGS = /^(SPAN|A|STRONG|EM|B|I|U|LABEL)$/i;
const BLOCK_SELECTOR = "p, h1, h2, h3, h4, li, .ve-field, .meta-item, section, article, header, footer, table, ul, ol, hr";

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
  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);
  const selectedRef = useRef(null);
  const caretRef = useRef(null);
  const actionsRef = useRef({});
  const dragStateRef = useRef(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);
  const [designing, setDesigning] = useState(false);
  const [fieldName, setFieldName] = useState("");
  const [fieldType, setFieldType] = useState("text");
  const [fieldOptions, setFieldOptions] = useState("EUR, USD, GBP");
  const [sizeDraft, setSizeDraft] = useState({ width: "", height: "" });
  const [addedFields, setAddedFields] = useState([]);
  const designHtml = useMemo(() => toDesignHtml(html, fields), [html, fields]);
  const [sessionHtml, setSessionHtml] = useState(null);
  const [frameEpoch, setFrameEpoch] = useState(0);

  const syncHistoryFlags = () => {
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(redoStackRef.current.length > 0);
  };

  useEffect(() => {
    setSessionHtml(null);
    setFrameEpoch(0);
    undoStackRef.current = [];
    redoStackRef.current = [];
    selectedRef.current = null;
    setHasSelection(false);
    setSizeDraft({ width: "", height: "" });
    syncHistoryFlags();
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
    undoStackRef.current.push(doc.documentElement.outerHTML);
    if (undoStackRef.current.length > 40) undoStackRef.current.shift();
    redoStackRef.current = [];
    syncHistoryFlags();
  };

  const restoreSnapshot = (snapshot) => {
    if (!snapshot) return;
    selectedRef.current = null;
    setHasSelection(false);
    setSizeDraft({ width: "", height: "" });
    setSessionHtml(`<!DOCTYPE html>\n${snapshot}`);
    setFrameEpoch((value) => value + 1);
  };

  const undo = () => {
    const previous = undoStackRef.current.pop();
    if (!previous) return;
    const doc = docOf();
    if (doc?.documentElement) {
      redoStackRef.current.push(doc.documentElement.outerHTML);
      if (redoStackRef.current.length > 40) redoStackRef.current.shift();
    }
    restoreSnapshot(previous);
    syncHistoryFlags();
  };

  const redo = () => {
    const next = redoStackRef.current.pop();
    if (!next) return;
    const doc = docOf();
    if (doc?.documentElement) {
      undoStackRef.current.push(doc.documentElement.outerHTML);
      if (undoStackRef.current.length > 40) undoStackRef.current.shift();
    }
    restoreSnapshot(next);
    syncHistoryFlags();
  };

  const clearChrome = (doc) => {
    doc?.querySelectorAll(".ve-drag-handle, .ve-resize-handle").forEach((node) => node.remove());
    doc?.querySelectorAll(".ve-drop-target").forEach((node) => node.classList.remove("ve-drop-target"));
  };

  const clearSelectionMarks = (doc) => {
    clearChrome(doc);
    doc?.querySelectorAll("[data-ve-selected]").forEach((node) => node.removeAttribute("data-ve-selected"));
  };

  const readSizeDraft = (node) => {
    if (!node || !node.style) {
      setSizeDraft({ width: "", height: "" });
      return;
    }
    setSizeDraft({
      width: node.style.width ? String(node.style.width).replace("px", "") : "",
      height: node.style.height ? String(node.style.height).replace("px", "") : "",
    });
  };

  const attachChrome = (doc, target) => {
    clearChrome(doc);
    if (!target || target === doc.body) return;
    const computed = doc.defaultView?.getComputedStyle(target);
    if (computed && computed.position === "static") {
      target.style.position = "relative";
    }

    const drag = doc.createElement("div");
    drag.className = "ve-drag-handle";
    drag.setAttribute("contenteditable", "false");
    drag.title = "Drag to move";
    drag.textContent = "↕";
    target.appendChild(drag);

    ["br", "mr", "bm"].forEach((kind) => {
      const handle = doc.createElement("div");
      handle.className = `ve-resize-handle ${kind}`;
      handle.setAttribute("contenteditable", "false");
      handle.dataset.veResize = kind;
      handle.title = kind === "mr" ? "Resize width" : kind === "bm" ? "Resize height" : "Resize";
      target.appendChild(handle);
    });
  };

  const pickEditableTarget = (raw) => {
    if (!raw || raw.nodeType !== 1) return null;
    if (raw.closest?.(".ve-drag-handle, .ve-resize-handle")) return null;
    const token = raw.closest?.("[data-ve-token]");
    if (token) return token;
    const preferred = raw.closest?.(
      ".meta-item, .ve-field, td, th, tr, p, h1, h2, h3, h4, li, hr, table, [data-ve-token]"
    );
    if (preferred) return preferred;
    // Avoid selecting huge layout wrappers (full page / main / meta grid)
    if (raw.matches?.("main, body, html, header, footer, .content, .meta, .page")) return null;
    if (raw.tagName === "DIV" && raw.children.length > 3) return null;
    return raw;
  };

  const selectNode = (doc, target) => {
    const picked = pickEditableTarget(target);
    if (!doc || !picked || picked === doc.body || picked === doc.documentElement) {
      clearSelectionMarks(doc);
      selectedRef.current = null;
      setHasSelection(false);
      setSizeDraft({ width: "", height: "" });
      return;
    }
    clearSelectionMarks(doc);
    picked.setAttribute("data-ve-selected", "true");
    selectedRef.current = picked;
    setHasSelection(true);
    readSizeDraft(picked);
    attachChrome(doc, picked);
  };

  const getSelected = () => {
    const doc = docOf();
    return selectedRef.current || doc?.querySelector("[data-ve-selected]") || null;
  };

  const saveCaret = () => {
    const doc = docOf();
    if (!doc) return;
    const selection = doc.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (!doc.body?.contains(range.commonAncestorContainer)) return;
    caretRef.current = range.cloneRange();
  };

  const resolveAnchor = (doc) => {
    const range = caretRef.current && doc.body?.contains(caretRef.current.commonAncestorContainer)
      ? caretRef.current
      : null;
    let anchor = null;
    if (range) {
      anchor = range.startContainer;
      if (anchor.nodeType === Node.TEXT_NODE) anchor = anchor.parentElement;
    }
    if (!anchor) anchor = getSelected();
    return { anchor, range };
  };

  const setCaretAfter = (doc, node) => {
    try {
      const range = doc.createRange();
      range.setStartAfter(node);
      range.collapse(true);
      const selection = doc.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      caretRef.current = range.cloneRange();
    } catch (_) {
      caretRef.current = null;
    }
  };

  const insertInlineAt = (doc, host, node, range) => {
    if (range && host.contains(range.commonAncestorContainer)) {
      const insertRange = range.cloneRange();
      insertRange.deleteContents();
      insertRange.insertNode(node);
      setCaretAfter(doc, node);
      return;
    }
    const selected = getSelected();
    if (selected && host.contains(selected) && selected !== host) {
      selected.parentNode.insertBefore(node, selected.nextSibling);
    } else {
      host.appendChild(node);
    }
    setCaretAfter(doc, node);
  };

  const insertRowAfter = (doc, row, node) => {
    const sampleCells = Array.from(row.children).filter((child) => /^(TD|TH)$/i.test(child.tagName));
    const newRow = doc.createElement("tr");
    const labelText = node.getAttribute?.("data-label")
      || node.querySelector?.("label, [data-ve-label]")?.textContent
      || node.querySelector?.("div")?.textContent
      || node.getAttribute?.("data-key")
      || "";
    const token = node.querySelector?.("[data-ve-token]");

    if (sampleCells.length >= 2) {
      const labelCell = doc.createElement(sampleCells[0].tagName.toLowerCase());
      const valueCell = doc.createElement(sampleCells[1].tagName.toLowerCase());
      if (sampleCells[0].getAttribute("style")) labelCell.setAttribute("style", sampleCells[0].getAttribute("style"));
      if (sampleCells[1].getAttribute("style")) valueCell.setAttribute("style", sampleCells[1].getAttribute("style"));
      labelCell.textContent = labelText || " ";
      if (token) valueCell.appendChild(token.cloneNode(true));
      else if (INLINE_TAGS.test(node.tagName)) valueCell.appendChild(node);
      else valueCell.appendChild(node);
      newRow.appendChild(labelCell);
      newRow.appendChild(valueCell);
      sampleCells.slice(2).forEach((cell) => {
        const extra = doc.createElement(cell.tagName.toLowerCase());
        if (cell.getAttribute("style")) extra.setAttribute("style", cell.getAttribute("style"));
        newRow.appendChild(extra);
      });
    } else {
      const cell = doc.createElement("td");
      if (token) {
        cell.appendChild(doc.createTextNode(`${labelText} `));
        cell.appendChild(token.cloneNode(true));
      } else {
        cell.appendChild(node);
      }
      newRow.appendChild(cell);
    }

    row.parentNode.insertBefore(newRow, row.nextSibling);
    selectNode(doc, newRow);
    caretRef.current = null;
    return newRow;
  };

  const toMetaItem = (doc, node) => {
    if (node.classList?.contains("meta-item")) return node;
    const labelText = node.getAttribute?.("data-label")
      || node.querySelector?.("[data-ve-label], label, div")?.textContent
      || node.getAttribute?.("data-key")
      || "Field";
    const token = node.querySelector?.("[data-ve-token]");
    const item = doc.createElement("div");
    item.className = "meta-item ve-field";
    if (node.getAttribute?.("data-key")) item.setAttribute("data-key", node.getAttribute("data-key"));
    const label = doc.createElement("label");
    label.textContent = labelText;
    const strong = doc.createElement("strong");
    if (token) strong.appendChild(token.cloneNode(true));
    else if (INLINE_TAGS.test(node.tagName)) strong.appendChild(node.cloneNode(true));
    else strong.textContent = labelText;
    item.appendChild(label);
    item.appendChild(strong);
    return item;
  };

  const placeNodeAtFocus = (doc, node) => {
    const main = doc.querySelector("main") || doc.body;
    const isInline = INLINE_TAGS.test(node.tagName);
    const { anchor, range } = resolveAnchor(doc);

    const cell = anchor && anchor.closest ? anchor.closest("td, th") : null;
    const row = (anchor && anchor.closest ? anchor.closest("tr") : null) || (cell ? cell.parentElement : null);
    const metaItem = anchor && anchor.closest ? anchor.closest(".meta-item") : null;
    const meta = (anchor && anchor.closest ? anchor.closest(".meta") : null) || (metaItem ? metaItem.parentElement : null);

    if (meta || metaItem) {
      if (isInline) {
        const host = metaItem?.querySelector("strong") || metaItem || meta;
        insertInlineAt(doc, host, node, range);
        return node;
      }
      const item = toMetaItem(doc, node);
      if (metaItem?.parentNode) metaItem.parentNode.insertBefore(item, metaItem.nextSibling);
      else (meta || main).appendChild(item);
      caretRef.current = null;
      return item;
    }

    if (cell || row) {
      if (isInline && cell) {
        insertInlineAt(doc, cell, node, range);
        return node;
      }
      if (row?.parentNode) return insertRowAfter(doc, row, node);
    }

    if (range) {
      try {
        if (isInline) {
          const insertRange = range.cloneRange();
          insertRange.deleteContents();
          insertRange.insertNode(node);
          setCaretAfter(doc, node);
          return node;
        }
        const block = (anchor && anchor.closest && (anchor.closest(BLOCK_SELECTOR) || anchor.closest("div"))) || null;
        if (block && block !== doc.body && block.parentNode && block !== main && !/^(TD|TH|TR)$/i.test(block.tagName)) {
          block.parentNode.insertBefore(node, block.nextSibling);
          caretRef.current = null;
          return node;
        }
        range.collapse(false);
        range.insertNode(node);
        caretRef.current = null;
        return node;
      } catch (_) {
        // fall through
      }
    }

    const selected = getSelected();
    if (selected?.parentNode && selected !== doc.body && selected !== doc.documentElement) {
      if (/^(TD|TH)$/i.test(selected.tagName)) {
        if (isInline) {
          selected.appendChild(node);
          return node;
        }
        if (selected.parentElement?.tagName === "TR") return insertRowAfter(doc, selected.parentElement, node);
        selected.appendChild(node);
        return node;
      }
      if (/^TR$/i.test(selected.tagName)) return insertRowAfter(doc, selected, node);
      if (selected.closest?.(".meta, .meta-item")) {
        const item = isInline ? node : toMetaItem(doc, node);
        const hostItem = selected.closest(".meta-item");
        if (hostItem?.parentNode && !isInline) hostItem.parentNode.insertBefore(item, hostItem.nextSibling);
        else if (isInline) insertInlineAt(doc, hostItem?.querySelector("strong") || hostItem || selected, node, null);
        else (selected.closest(".meta") || selected.parentNode).appendChild(item);
        return item;
      }
      selected.parentNode.insertBefore(node, selected.nextSibling);
      return node;
    }
    main.appendChild(node);
    return node;
  };

  const deleteSelected = () => {
    const doc = docOf();
    const node = getSelected();
    if (!node || node === doc?.body || node === doc?.documentElement) return;
    remember();
    clearChrome(doc);
    node.remove();
    selectedRef.current = null;
    setHasSelection(false);
    setSizeDraft({ width: "", height: "" });
    fitFrame(frameRef.current);
  };

  const duplicateSelected = () => {
    const doc = docOf();
    const node = getSelected();
    if (!doc || !node || node === doc.body || node === doc.documentElement) return;
    remember();
    clearChrome(doc);
    const clone = node.cloneNode(true);
    clone.removeAttribute("data-ve-selected");
    clone.querySelectorAll?.(".ve-drag-handle, .ve-resize-handle").forEach((handle) => handle.remove());
    node.parentNode?.insertBefore(clone, node.nextSibling);
    selectNode(doc, clone);
    fitFrame(frameRef.current);
  };

  const moveSelected = (direction) => {
    const doc = docOf();
    const node = getSelected();
    if (!doc || !node?.parentNode) return;
    const sibling = direction < 0 ? node.previousElementSibling : node.nextElementSibling;
    if (!sibling) return;
    remember();
    clearChrome(doc);
    if (direction < 0) node.parentNode.insertBefore(node, sibling);
    else node.parentNode.insertBefore(sibling, node);
    selectNode(doc, node);
    fitFrame(frameRef.current);
  };

  const applySize = (width, height) => {
    const doc = docOf();
    const node = getSelected();
    if (!doc || !node) return;
    remember();
    if (width !== "" && width != null) {
      const value = String(width).trim();
      node.style.width = value ? (/^\d+$/.test(value) ? `${value}px` : value) : "";
      if (value) node.style.maxWidth = "100%";
    }
    if (height !== "" && height != null) {
      const value = String(height).trim();
      node.style.height = value ? (/^\d+$/.test(value) ? `${value}px` : value) : "";
    }
    readSizeDraft(node);
    attachChrome(doc, node);
    fitFrame(frameRef.current);
  };

  const applyCommand = (command, value = null) => {
    const doc = docOf();
    if (!doc) return;
    remember();
    doc.execCommand(command, false, value);
    fitFrame(frameRef.current);
  };

  const findDropTarget = (doc, target, clientX, clientY) => {
    if (!doc) return null;
    const prev = target.style.pointerEvents;
    target.style.pointerEvents = "none";
    const el = doc.elementFromPoint(clientX, clientY);
    target.style.pointerEvents = prev || "";
    if (!el || el === target || target.contains(el)) return null;
    const drop = el.closest?.(
      "[data-ve-token], .meta-item, .ve-field, p, h1, h2, h3, h4, li, td, th, tr, strong, label, .meta"
    ) || null;
    if (!drop || drop === target || drop === doc.body || drop === doc.documentElement) return null;
    if (target.contains(drop)) return null;
    if (drop.matches?.("main, header, footer, .content, .page")) return null;
    return drop;
  };

  const dropPlacement = (drop, moving, clientX, clientY) => {
    const rect = drop.getBoundingClientRect();
    const beforeX = clientX < rect.left + rect.width / 2;
    const beforeY = clientY < rect.top + rect.height / 2;
    const movingInline = INLINE_TAGS.test(moving.tagName) || moving.hasAttribute?.("data-ve-token");
    const dropInline = INLINE_TAGS.test(drop.tagName) || drop.hasAttribute?.("data-ve-token");

    // Drop onto a token / inline → insert before/after that token inside same parent
    if (dropInline || drop.hasAttribute?.("data-ve-token")) {
      return { mode: beforeX ? "before" : "after", host: drop };
    }

    // Drop into table cell → put inside the cell
    if (/^(TD|TH)$/i.test(drop.tagName)) {
      return { mode: "into", host: drop };
    }

    // Drop onto meta item
    if (drop.classList?.contains("meta-item")) {
      if (movingInline) {
        return { mode: "into", host: drop.querySelector("strong") || drop };
      }
      // Horizontal meta row: left half = before, right half = after this item
      return { mode: beforeX ? "before" : "after", host: drop };
    }

    // Drop onto meta container → append inside
    if (drop.classList?.contains("meta")) {
      return { mode: "into", host: drop };
    }

    // Drop onto paragraph / heading with an inline token → insert inside text flow
    if (movingInline && /^(P|H1|H2|H3|H4|LI|STRONG|LABEL)$/i.test(drop.tagName)) {
      return { mode: "into", host: drop };
    }

    // Same-type block reorder: use vertical half
    if (drop.tagName === "TR" || drop.classList?.contains("ve-field") || /^(P|H1|H2|H3|H4|DIV|LI)$/i.test(drop.tagName)) {
      return { mode: beforeY ? "before" : "after", host: drop };
    }

    return { mode: beforeY ? "before" : "after", host: drop };
  };

  const applyDrop = (moving, drop, clientX, clientY) => {
    if (!drop || !moving) return;
    if (!drop.parentNode && !/^(TD|TH)$/i.test(drop.tagName) && !drop.classList?.contains("meta")) return;
    const place = dropPlacement(drop, moving, clientX, clientY);
    const host = place.host;
    if (!host || host === moving || moving.contains(host)) return;

    moving.style.left = "";
    moving.style.top = "";
    moving.style.position = "";
    moving.style.opacity = "";

    if (place.mode === "into") {
      // Replace empty placeholder feel: put inside the existing block, not after it
      host.appendChild(moving);
      return;
    }
    if (!host.parentNode) return;
    if (place.mode === "before") host.parentNode.insertBefore(moving, host);
    else host.parentNode.insertBefore(moving, host.nextSibling);
  };

  const startDrag = (doc, target, clientX, clientY) => {
    remember();
    clearChrome(doc);
    const startLeft = Number.parseFloat(target.style.left || "0") || 0;
    const startTop = Number.parseFloat(target.style.top || "0") || 0;
    if (doc.defaultView?.getComputedStyle(target).position === "static") {
      target.style.position = "relative";
    }
    dragStateRef.current = {
      mode: "drag",
      target,
      startX: clientX,
      startY: clientY,
      startLeft,
      startTop,
      lastX: clientX,
      lastY: clientY,
    };
    target.style.opacity = "0.85";
    target.style.pointerEvents = "none";
    target.style.zIndex = "40";
  };

  const startResize = (doc, target, kind, clientX, clientY) => {
    remember();
    const rect = target.getBoundingClientRect();
    dragStateRef.current = {
      mode: "resize",
      kind,
      target,
      startX: clientX,
      startY: clientY,
      startWidth: rect.width,
      startHeight: rect.height,
    };
  };

  const onPointerMove = (event) => {
    const state = dragStateRef.current;
    if (!state?.target) return;
    const doc = docOf();
    if (state.mode === "drag") {
      const dx = event.clientX - state.startX;
      const dy = event.clientY - state.startY;
      state.target.style.left = `${state.startLeft + dx}px`;
      state.target.style.top = `${state.startTop + dy}px`;
      state.lastX = event.clientX;
      state.lastY = event.clientY;
      doc?.querySelectorAll(".ve-drop-target").forEach((node) => node.classList.remove("ve-drop-target"));
      const drop = findDropTarget(doc, state.target, event.clientX, event.clientY);
      if (drop) drop.classList.add("ve-drop-target");
    } else if (state.mode === "resize") {
      const dx = event.clientX - state.startX;
      const dy = event.clientY - state.startY;
      if (state.kind === "br" || state.kind === "mr") {
        state.target.style.width = `${Math.max(40, Math.round(state.startWidth + dx))}px`;
        state.target.style.maxWidth = "100%";
      }
      if (state.kind === "br" || state.kind === "bm") {
        state.target.style.height = `${Math.max(24, Math.round(state.startHeight + dy))}px`;
      }
      readSizeDraft(state.target);
    }
  };

  const onPointerUp = (event) => {
    const state = dragStateRef.current;
    const doc = docOf();
    if (!state?.target || !doc) {
      dragStateRef.current = null;
      return;
    }
    if (state.mode === "drag") {
      const x = event.clientX || state.lastX;
      const y = event.clientY || state.lastY;
      const drop = findDropTarget(doc, state.target, x, y) || doc.querySelector(".ve-drop-target");
      doc.querySelectorAll(".ve-drop-target").forEach((node) => node.classList.remove("ve-drop-target"));
      state.target.style.pointerEvents = "";
      state.target.style.zIndex = "";
      state.target.style.opacity = "";
      if (drop && drop !== state.target) {
        applyDrop(state.target, drop, x, y);
      } else {
        // Cancel free-float if nothing was targeted — avoids elements “stuck” offset
        state.target.style.left = "";
        state.target.style.top = "";
        state.target.style.position = "";
      }
      selectNode(doc, state.target);
    } else if (state.mode === "resize") {
      selectNode(doc, state.target);
    }
    dragStateRef.current = null;
    fitFrame(frameRef.current);
    event.preventDefault();
  };

  actionsRef.current = {
    remember,
    undo,
    redo,
    selectNode,
    getSelected,
    saveCaret,
    deleteSelected,
    duplicateSelected,
    applyCommand,
    startDrag,
    startResize,
    onPointerMove,
    onPointerUp,
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
      actionsRef.current.remember();
      setTimeout(() => { typing = false; }, 700);
    });
    doc.addEventListener("mousedown", (event) => {
      const handle = event.target?.closest?.(".ve-drag-handle, .ve-resize-handle");
      if (!handle) return;
      event.preventDefault();
      event.stopPropagation();
      const target = handle.parentElement;
      if (!target) return;
      actionsRef.current.selectNode(doc, target);
      if (handle.classList.contains("ve-drag-handle")) {
        actionsRef.current.startDrag(doc, target, event.clientX, event.clientY);
      } else {
        actionsRef.current.startResize(doc, target, handle.dataset.veResize || "br", event.clientX, event.clientY);
      }
    });
    doc.addEventListener("mousemove", (event) => actionsRef.current.onPointerMove(event));
    doc.addEventListener("mouseup", (event) => actionsRef.current.onPointerUp(event));
    doc.addEventListener("click", (event) => {
      if (event.target?.closest?.(".ve-drag-handle, .ve-resize-handle")) return;
      actionsRef.current.selectNode(doc, event.target);
      actionsRef.current.saveCaret();
    });
    doc.addEventListener("keyup", () => actionsRef.current.saveCaret());
    doc.addEventListener("mouseup", () => actionsRef.current.saveCaret());
    doc.addEventListener("blur", () => actionsRef.current.saveCaret(), true);
    doc.addEventListener("selectionchange", () => actionsRef.current.saveCaret());
    doc.addEventListener("keydown", (event) => {
      const meta = event.ctrlKey || event.metaKey;
      const actions = actionsRef.current;
      if (meta && event.key.toLowerCase() === "z" && !event.shiftKey) {
        event.preventDefault();
        actions.undo();
      } else if ((meta && event.key.toLowerCase() === "y") || (meta && event.shiftKey && event.key.toLowerCase() === "z")) {
        event.preventDefault();
        actions.redo();
      } else if (meta && event.key.toLowerCase() === "d") {
        event.preventDefault();
        actions.duplicateSelected();
      } else if ((event.key === "Delete" || event.key === "Backspace") && actions.getSelected() && !doc.getSelection()?.toString()) {
        const active = doc.activeElement;
        if (active && active !== doc.body && active.isContentEditable && active !== actions.getSelected()) return;
        event.preventDefault();
        actions.deleteSelected();
      } else if (meta && event.key.toLowerCase() === "b") {
        event.preventDefault();
        actions.applyCommand("bold");
      } else if (meta && event.key.toLowerCase() === "i") {
        event.preventDefault();
        actions.applyCommand("italic");
      } else if (meta && event.key.toLowerCase() === "u") {
        event.preventDefault();
        actions.applyCommand("underline");
      }
    });
  };

  const insertHtml = (snippet) => {
    const doc = docOf();
    if (!doc) return;
    saveCaret();
    remember();
    const holder = doc.createElement("div");
    holder.innerHTML = snippet.trim();
    const node = holder.firstElementChild;
    if (!node) return;
    const placed = placeNodeAtFocus(doc, node) || node;
    selectNode(doc, placed);
    fitFrame(frameRef.current);
  };

  const addField = () => {
    const label = fieldName.trim();
    if (!label) return;
    const doc = docOf();
    const key = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || `field_${Date.now()}`;
    const { anchor } = resolveAnchor(doc || { body: null });
    const inMeta = Boolean(anchor && anchor.closest && anchor.closest(".meta, .meta-item"));
    const inTable = Boolean(anchor && anchor.closest && anchor.closest("td, th, tr, table"));
    let snippet;
    if (inMeta) {
      snippet = `<div class="meta-item ve-field" data-key="${key}" data-label="${escapeText(label)}"><label>${escapeText(label)}</label><strong><span data-ve-token="${key}" contenteditable="false">${escapeText(label)}</span></strong></div>`;
    } else if (inTable) {
      snippet = `<div class="ve-field" data-key="${key}" data-label="${escapeText(label)}"><span data-ve-token="${key}" contenteditable="false">${escapeText(label)}</span></div>`;
    } else {
      snippet = `<div class="ve-field" data-key="${key}" data-label="${escapeText(label)}" style="margin:14px 0;"><div data-ve-label="1" style="font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#718096;">${escapeText(label)}</div><div style="font-weight:700;border-bottom:1px solid #DCE2E9;padding:6px 0;"><span data-ve-token="${key}" contenteditable="false">${escapeText(label)}</span></div></div>`;
    }
    insertHtml(snippet);
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

  const keepLetterFocus = (event) => {
    event.preventDefault();
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, height: "100%" }}>
      <Box
        sx={{
          flexShrink: 0,
          zIndex: 8,
          px: 1.25,
          py: 1,
          display: "flex",
          gap: 1,
          alignItems: "center",
          flexWrap: "wrap",
          borderBottom: "1px solid",
          borderColor: "divider",
          bgcolor: "rgba(248,249,252,0.98)",
          boxShadow: "0 1px 0 rgba(15,23,42,0.04)",
        }}
      >
        <ToolbarGroup>
          <Button
            size="small"
            variant={designing ? "outlined" : "contained"}
            onClick={() => setDesigning(false)}
            sx={{ textTransform: "none", borderRadius: 2, fontWeight: 700, minHeight: 32 }}
          >
            Preview
          </Button>
          {canEdit && (
            <Button
              size="small"
              variant={designing ? "contained" : "outlined"}
              onClick={() => setDesigning(true)}
              sx={{ textTransform: "none", borderRadius: 2, fontWeight: 700, minHeight: 32 }}
            >
              Edit letter
            </Button>
          )}
        </ToolbarGroup>

        {designing && (
          <>
            <Divider orientation="vertical" flexItem sx={{ mx: 0.25, display: { xs: "none", md: "block" } }} />

            <ToolbarGroup>
              <Tooltip title="Heading"><IconButton size="small" sx={toolBtnSx} onMouseDown={keepLetterFocus} onClick={() => insertHtml("<h2 style=\"margin:16px 0 8px;color:#091B33;\">Heading</h2>")}><Title fontSize="small" /></IconButton></Tooltip>
              <Tooltip title="Paragraph"><IconButton size="small" sx={toolBtnSx} onMouseDown={keepLetterFocus} onClick={() => insertHtml("<p style=\"font-size:13px;line-height:1.8;color:#526174;\">Type here</p>")}><Notes fontSize="small" /></IconButton></Tooltip>
              <Tooltip title="Bullet list"><IconButton size="small" sx={toolBtnSx} onMouseDown={keepLetterFocus} onClick={() => insertHtml("<ul style=\"margin:12px 0;padding-left:20px;color:#526174;\"><li>List item</li></ul>")}><FormatListBulleted fontSize="small" /></IconButton></Tooltip>
              <Tooltip title="Divider line"><IconButton size="small" sx={toolBtnSx} onMouseDown={keepLetterFocus} onClick={() => insertHtml("<hr style=\"border:none;border-top:1px solid #DCE2E9;margin:18px 0;\" />")}><HorizontalRule fontSize="small" /></IconButton></Tooltip>
            </ToolbarGroup>

            <Divider orientation="vertical" flexItem sx={{ mx: 0.25, display: { xs: "none", md: "block" } }} />

            <ToolbarGroup>
              <Tooltip title="Bold (Ctrl+B)"><IconButton size="small" sx={toolBtnSx} onClick={() => applyCommand("bold")}><FormatBold fontSize="small" /></IconButton></Tooltip>
              <Tooltip title="Italic (Ctrl+I)"><IconButton size="small" sx={toolBtnSx} onClick={() => applyCommand("italic")}><FormatItalic fontSize="small" /></IconButton></Tooltip>
              <Tooltip title="Underline (Ctrl+U)"><IconButton size="small" sx={toolBtnSx} onClick={() => applyCommand("underline")}><FormatUnderlined fontSize="small" /></IconButton></Tooltip>
              <Tooltip title="Align left"><IconButton size="small" sx={toolBtnSx} onClick={() => applyCommand("justifyLeft")}><FormatAlignLeft fontSize="small" /></IconButton></Tooltip>
              <Tooltip title="Align center"><IconButton size="small" sx={toolBtnSx} onClick={() => applyCommand("justifyCenter")}><FormatAlignCenter fontSize="small" /></IconButton></Tooltip>
              <Tooltip title="Align right"><IconButton size="small" sx={toolBtnSx} onClick={() => applyCommand("justifyRight")}><FormatAlignRight fontSize="small" /></IconButton></Tooltip>
            </ToolbarGroup>

            <Divider orientation="vertical" flexItem sx={{ mx: 0.25, display: { xs: "none", lg: "block" } }} />

            <ToolbarGroup>
              {["client_name", "client_email", "client_phone", "client_address", "document_date"].map((key) => (
                <Chip
                  key={key}
                  size="small"
                  label={TOKEN_LABELS[key]}
                  onMouseDown={keepLetterFocus}
                  onClick={() => insertHtml(`<span data-ve-token="${key}" contenteditable="false">${TOKEN_LABELS[key]}</span>`)}
                  sx={{ height: 28, fontWeight: 600, bgcolor: "#eef2ff", color: "#3730a3", "&:hover": { bgcolor: "#e0e7ff" } }}
                />
              ))}
            </ToolbarGroup>

            <ToolbarGroup>
              <TextField size="small" placeholder="New field name" value={fieldName} onChange={(event) => setFieldName(event.target.value)} sx={{ width: 150, "& .MuiInputBase-root": { height: 32, bgcolor: "background.paper" } }} />
              <TextField size="small" select value={fieldType} onChange={(event) => setFieldType(event.target.value)} sx={{ width: 118, "& .MuiInputBase-root": { height: 32, bgcolor: "background.paper" } }}>
                <MenuItem value="text">Text</MenuItem>
                <MenuItem value="number">Number</MenuItem>
                <MenuItem value="date">Date</MenuItem>
                <MenuItem value="textarea">Long text</MenuItem>
                <MenuItem value="select">Dropdown</MenuItem>
              </TextField>
              {fieldType === "select" && (
                <TextField size="small" placeholder="EUR, USD, GBP" value={fieldOptions} onChange={(event) => setFieldOptions(event.target.value)} sx={{ width: 160, "& .MuiInputBase-root": { height: 32, bgcolor: "background.paper" } }} />
              )}
              <Button
                size="small"
                variant="outlined"
                onMouseDown={keepLetterFocus}
                onClick={addField}
                disabled={!fieldName.trim()}
                sx={{ textTransform: "none", borderRadius: 2, minHeight: 32, fontWeight: 700 }}
              >
                Add field
              </Button>
            </ToolbarGroup>

            <Divider orientation="vertical" flexItem sx={{ mx: 0.25, display: { xs: "none", md: "block" } }} />

            <ToolbarGroup>
              <Tooltip title="Width (px)">
                <TextField
                  size="small"
                  placeholder="W"
                  value={sizeDraft.width}
                  disabled={!hasSelection}
                  onChange={(event) => setSizeDraft((current) => ({ ...current, width: event.target.value }))}
                  onBlur={() => applySize(sizeDraft.width, null)}
                  onKeyDown={(event) => { if (event.key === "Enter") applySize(sizeDraft.width, null); }}
                  sx={{ width: 64, "& .MuiInputBase-root": { height: 32, bgcolor: "background.paper" } }}
                  InputProps={{ startAdornment: <ZoomOutMap sx={{ fontSize: 14, mr: 0.5, color: "text.secondary" }} /> }}
                />
              </Tooltip>
              <Tooltip title="Height (px)">
                <TextField
                  size="small"
                  placeholder="H"
                  value={sizeDraft.height}
                  disabled={!hasSelection}
                  onChange={(event) => setSizeDraft((current) => ({ ...current, height: event.target.value }))}
                  onBlur={() => applySize(null, sizeDraft.height)}
                  onKeyDown={(event) => { if (event.key === "Enter") applySize(null, sizeDraft.height); }}
                  sx={{ width: 64, "& .MuiInputBase-root": { height: 32, bgcolor: "background.paper" } }}
                />
              </Tooltip>
              <Tooltip title="Drag handle appears on the selected block">
                <span>
                  <IconButton size="small" sx={toolBtnSx} disabled={!hasSelection}><OpenWith fontSize="small" /></IconButton>
                </span>
              </Tooltip>
              <Tooltip title="Undo (Ctrl+Z)">
                <span>
                  <IconButton size="small" sx={toolBtnSx} onClick={undo} disabled={!canUndo}><Undo fontSize="small" /></IconButton>
                </span>
              </Tooltip>
              <Tooltip title="Redo (Ctrl+Y)">
                <span>
                  <IconButton size="small" sx={toolBtnSx} onClick={redo} disabled={!canRedo}><Redo fontSize="small" /></IconButton>
                </span>
              </Tooltip>
              <Tooltip title="Duplicate selected (Ctrl+D)">
                <span>
                  <IconButton size="small" sx={toolBtnSx} onClick={duplicateSelected} disabled={!hasSelection}><ContentCopy fontSize="small" /></IconButton>
                </span>
              </Tooltip>
              <Tooltip title="Move up">
                <span>
                  <IconButton size="small" sx={toolBtnSx} onClick={() => moveSelected(-1)} disabled={!hasSelection}><KeyboardArrowUp fontSize="small" /></IconButton>
                </span>
              </Tooltip>
              <Tooltip title="Move down">
                <span>
                  <IconButton size="small" sx={toolBtnSx} onClick={() => moveSelected(1)} disabled={!hasSelection}><KeyboardArrowDown fontSize="small" /></IconButton>
                </span>
              </Tooltip>
              <Tooltip title="Delete selected">
                <span>
                  <IconButton size="small" sx={{ ...toolBtnSx, color: "error.main", borderColor: "error.light" }} onClick={deleteSelected} disabled={!hasSelection}><DeleteOutline fontSize="small" /></IconButton>
                </span>
              </Tooltip>
            </ToolbarGroup>

            <Button
              size="small"
              variant="contained"
              startIcon={<Save />}
              onClick={save}
              disabled={saving}
              sx={{ ml: { xs: 0, md: "auto" }, textTransform: "none", borderRadius: 2, fontWeight: 700, minHeight: 32 }}
            >
              {saving ? "Saving..." : "Save template"}
            </Button>
          </>
        )}
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", bgcolor: "grey.100" }}>
        {designing ? (
          <Box
            key={`${designHtml.slice(0, 40)}-${frameEpoch}`}
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
        <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0, px: 1.5, py: 0.75, borderTop: 1, borderColor: "divider", bgcolor: "background.paper" }}>
          Click a block to select it. Use the purple drag handle to move, corner handles to resize, or set W/H in the toolbar. New fields follow the clicked area (meta row, table row, or body).
        </Typography>
      )}
    </Box>
  );
};

export default LetterCanvas;
