import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Alert,
  AppBar,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Menu,
  MenuItem,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
} from "@mui/material";
import Add from "@mui/icons-material/Add";
import ArrowForward from "@mui/icons-material/ArrowForward";
import GridView from "@mui/icons-material/GridView";
import MoreVert from "@mui/icons-material/MoreVert";
import ViewList from "@mui/icons-material/ViewList";
import CheckCircle from "@mui/icons-material/CheckCircle";
import ContentCopy from "@mui/icons-material/ContentCopy";
import DeleteOutline from "@mui/icons-material/DeleteOutline";
import Description from "@mui/icons-material/Description";
import Download from "@mui/icons-material/Download";
import EditOutlined from "@mui/icons-material/EditOutlined";
import History from "@mui/icons-material/History";
import MenuIcon from "@mui/icons-material/Menu";
import PersonOutline from "@mui/icons-material/PersonOutline";
import PictureAsPdf from "@mui/icons-material/PictureAsPdf";
import Refresh from "@mui/icons-material/Refresh";
import Search from "@mui/icons-material/Search";
import Tune from "@mui/icons-material/Tune";
import VisibilityOutlined from "@mui/icons-material/VisibilityOutlined";
import { toast } from "react-toastify";
import Sidebar from "./Sidebar.js";
import CrmAppBarActions from "./components/CrmAppBarActions";
import useLiveCrmUser from "./useLiveCrmUser";
import {
  formatDocDate,
  printHtmlDocument,
  renderDocHtml,
  todayIso,
  downloadHtmlFile,
} from "./docRender";
import {
  getDocTemplateApi,
  getDocTemplatesApi,
  recordDocGenerationApi,
  removeDocTemplateApi,
  saveDocTemplateApi,
  searchDocClientsApi,
  getDocHistoryApi,
} from "../../../Api/Service";

const emptyClient = { name: "", email: "", phone: "", address: "" };

const clientLabel = (client) => {
  if (!client) return "";
  const id = client.leadNumber ? `#${client.leadNumber}` : "";
  return [id, client.fullName || "Unnamed client", client.email, client.phone].filter(Boolean).join(" · ");
};

const fileSlug = (value) => String(value || "document").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "document";

const AUTO_KEYS = [
  { key: "client_name", label: "Client name" },
  { key: "client_email", label: "Email" },
  { key: "client_phone", label: "Phone" },
  { key: "client_address", label: "Address" },
  { key: "client_id", label: "CRM ID" },
  { key: "document_date", label: "Document date" },
];

const SUGGESTED_FIELDS = [
  { key: "reference_number", label: "Reference number", type: "text" },
  { key: "case_reference", label: "Case reference", type: "text" },
  { key: "amount", label: "Amount", type: "number" },
  { key: "currency", label: "Currency", type: "select", optionsText: "EUR, USD, GBP, CHF" },
  { key: "transaction_reference", label: "Transaction reference", type: "text" },
  { key: "payment_date", label: "Payment date", type: "date" },
  { key: "wallet_address", label: "Wallet address", type: "text" },
  { key: "notes", label: "Additional notes", type: "textarea" },
  { key: "letter_subject", label: "Subject", type: "text", required: true },
  { key: "letter_body", label: "Letter body", type: "textarea", required: true },
  { key: "authorised_representative", label: "Authorised representative", type: "text" },
  { key: "company_signatory", label: "Company signatory", type: "text" },
];

const CATEGORY_CHOICES = ["Receipt", "Correspondence", "Agreement", "Onboarding", "Company", "Blank"];
const RESERVED_FIELD_KEYS = new Set([...AUTO_KEYS.map((item) => item.key), "currency_amount"]);

let fieldRowSeq = 1;
const nextFieldRowId = () => `field-${fieldRowSeq += 1}`;
const keyFromLabel = (label) => String(label || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const labelFromKey = (key) => String(key || "").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const tokensInHtml = (html) => [...new Set(
  [...String(html || "").matchAll(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi)].map((match) => match[1].toLowerCase())
)];
const fieldFromSuggestion = (suggestion) => ({
  rowId: nextFieldRowId(),
  key: suggestion.key,
  label: suggestion.label,
  type: suggestion.type || "text",
  required: Boolean(suggestion.required),
  optionsText: suggestion.optionsText || "",
  keyTouched: true,
});

const HtmlFileIcon = ({ small = false }) => (
  <Box
    component="svg"
    viewBox="0 0 48 60"
    aria-hidden
    sx={{ width: small ? 26 : 46, height: small ? 32 : 58, display: "block", flex: "0 0 auto" }}
  >
    <path d="M8 1.5h20.5L42 15v40.5a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V5.5a4 4 0 0 1 4-4z" fill="#E4572E" />
    <path d="M28.5 1.5V13a2 2 0 0 0 2 2H42" fill="#F6C7B0" />
    <text x="22" y="44" textAnchor="middle" fill="#fff" fontSize="9" fontWeight="700" fontFamily="Arial, sans-serif">HTML</text>
  </Box>
);

const DocumentRepository = () => {
  const { can, ready } = useLiveCrmUser();
  const canUse = can("canUseDocuments");
  const canEdit = can("canEditDocuments");
  const canDelete = can("canDeleteDocuments");
  const [params] = useSearchParams();
  const requestedLeadId = params.get("leadId") || "";

  const [isMobileMenu, setisMobileMenu] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [category, setCategory] = useState("All");
  const [categories, setCategories] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [listLoading, setListLoading] = useState(false);
  const [selectedKey, setSelectedKey] = useState("");
  const [template, setTemplate] = useState(null);
  const [templateLoading, setTemplateLoading] = useState(false);

  const [clientOptions, setClientOptions] = useState([]);
  const [clientQuery, setClientQuery] = useState("");
  const [client, setClient] = useState(null);
  const [clientFields, setClientFields] = useState(emptyClient);
  const [documentDate, setDocumentDate] = useState(todayIso());
  const [extras, setExtras] = useState({});
  const [history, setHistory] = useState([]);
  const [exporting, setExporting] = useState("");
  const [editor, setEditor] = useState(null);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [removing, setRemoving] = useState(false);
  const [sortBy, setSortBy] = useState("default");
  const [viewMode, setViewMode] = useState("grid");
  const [cardMenu, setCardMenu] = useState(null);
  const htmlRef = useRef(null);
  const workflowRef = useRef(null);

  const loadTemplates = useCallback(async () => {
    setListLoading(true);
    const response = await getDocTemplatesApi({});
    setListLoading(false);
    if (!response?.success) {
      toast.error(response?.msg || "Could not load documents");
      return;
    }
    setTemplates(response.templates || []);
    setCategories(response.categories || []);
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const loadTemplate = async (key) => {
    setSelectedKey(key);
    setTemplateLoading(true);
    const response = await getDocTemplateApi(key);
    setTemplateLoading(false);
    if (!response?.success) {
      toast.error(response?.msg || "Could not open this document");
      return;
    }
    setTemplate(response.template);
    setDocumentDate(todayIso());
    requestAnimationFrame(() => workflowRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    const next = {};
    (response.template.fields || []).forEach((item) => {
      next[item.key] = item.type === "select" ? (item.options?.[0] || "") : "";
    });
    setExtras(next);
  };

  const applyClient = (next) => {
    setClient(next);
    setClientFields(next ? {
      name: next.fullName || "",
      email: next.email || "",
      phone: next.phone || "",
      address: next.address || "",
    } : emptyClient);
  };

  const refreshClient = async () => {
    if (!client?._id) return;
    const response = await searchDocClientsApi({ leadId: client._id });
    const fresh = response?.clients?.[0];
    if (!response?.success || !fresh) {
      toast.error(response?.msg || "Could not refresh this client");
      return;
    }
    applyClient(fresh);
    toast.success("Client details refreshed");
  };

  useEffect(() => {
    if (!requestedLeadId) return undefined;
    let ignore = false;
    searchDocClientsApi({ leadId: requestedLeadId }).then((response) => {
      if (ignore) return;
      const found = response?.clients?.[0];
      if (found) applyClient(found);
    });
    return () => { ignore = true; };
  }, [requestedLeadId]);

  useEffect(() => {
    if (clientQuery.trim().length < 1) return undefined;
    let ignore = false;
    const timer = setTimeout(async () => {
      const response = await searchDocClientsApi({ q: clientQuery.trim() });
      if (!ignore && response?.success) setClientOptions(response.clients || []);
    }, 250);
    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [clientQuery]);

  const loadHistory = useCallback(async (leadId) => {
    const response = await getDocHistoryApi(leadId ? { leadId } : {});
    if (response?.success) setHistory(response.history || []);
  }, []);

  useEffect(() => {
    loadHistory(client?._id || "");
  }, [client?._id, loadHistory]);

  const rendered = useMemo(() => {
    if (!template?.html) return "";
    const values = {
      client_id: client?.leadNumber ? `#${client.leadNumber}` : "",
      client_name: clientFields.name,
      client_email: clientFields.email,
      client_phone: clientFields.phone,
      client_address: clientFields.address,
      document_date: formatDocDate(documentDate),
      currency_amount: extras.amount ? [extras.currency, extras.amount].filter(Boolean).join(" ") : "",
    };
    (template.fields || []).forEach((item) => {
      const raw = extras[item.key] ?? "";
      values[item.key] = item.type === "date" ? formatDocDate(raw) : raw;
    });
    return renderDocHtml(template.html, values);
  }, [template, client, clientFields, documentDate, extras]);

  const missingLabels = () => {
    const missing = [];
    if (!clientFields.name.trim()) missing.push("Client name");
    (template?.fields || []).forEach((item) => {
      if (item.required && !String(extras[item.key] || "").trim()) missing.push(item.label);
    });
    return missing;
  };

  const exportDocument = async (action) => {
    const missing = missingLabels();
    if (missing.length) {
      toast.error(`Fill ${missing.join(", ")} first`);
      return;
    }
    if (!rendered) return;
    setExporting(action);
    const record = await recordDocGenerationApi({
      templateKey: template.key,
      action,
      values: {
        leadId: client?._id || "",
        leadNumber: client?.leadNumber || "",
        clientName: clientFields.name,
        clientEmail: clientFields.email,
        clientPhone: clientFields.phone,
        clientAddress: clientFields.address,
        documentDate,
        fields: extras,
      },
    });
    setExporting("");
    if (!record?.success) {
      toast.error(record?.msg || "Could not prepare this document");
      return;
    }
    const fileName = `${fileSlug(template.title)}-${fileSlug(clientFields.name)}.html`;
    if (action === "copy") {
      await navigator.clipboard.writeText(rendered);
      toast.success("HTML copied");
    } else if (action === "download") {
      downloadHtmlFile(rendered, fileName);
      toast.success("HTML downloaded");
    } else {
      const opened = printHtmlDocument(rendered);
      if (!opened) toast.error("Allow pop-ups, then choose Save as PDF in the print window");
      else toast.success("Choose Save as PDF in the print window");
    }
    loadHistory(client?._id || "");
  };

  const reopenHistory = async (row) => {
    if (row.templateKey && row.templateKey !== selectedKey) await loadTemplate(row.templateKey);
    setClientFields({
      name: row.values?.clientName || row.clientName || "",
      email: row.values?.clientEmail || "",
      phone: row.values?.clientPhone || "",
      address: row.values?.clientAddress || "",
    });
    if (row.values?.documentDate) setDocumentDate(row.values.documentDate);
    setExtras(row.values?.fields || {});
  };

  const editTemplate = async (item) => {
    let current = template?.key === item.key ? template : null;
    if (!current?.html) {
      const response = await getDocTemplateApi(item.key);
      if (!response?.success) {
        toast.error(response?.msg || "Could not open this document");
        return;
      }
      current = response.template;
      setSelectedKey(item.key);
      setTemplate(current);
    }
    openEditor(current);
  };

  const insertPlaceholder = (key) => {
    const token = `{{${key}}}`;
    setEditor((current) => {
      if (!current) return current;
      const html = current.html || "";
      const field = htmlRef.current;
      const start = field && document.activeElement === field ? field.selectionStart : html.length;
      const end = field && document.activeElement === field ? field.selectionEnd : html.length;
      const nextHtml = `${html.slice(0, start)}${token}${html.slice(end)}`;
      const cursor = start + token.length;
      requestAnimationFrame(() => {
        if (!htmlRef.current) return;
        htmlRef.current.focus();
        htmlRef.current.setSelectionRange(cursor, cursor);
      });
      return { ...current, html: nextHtml };
    });
  };

  const toggleSuggestedField = (suggestion) => {
    const token = `{{${suggestion.key}}}`;
    setEditor((current) => {
      if (!current) return current;
      const exists = current.fields.some((field) => field.key === suggestion.key);
      if (exists) {
        return { ...current, fields: current.fields.filter((field) => field.key !== suggestion.key) };
      }
      const html = current.html || "";
      let nextHtml = html;
      if (!html.includes(token)) {
        const field = htmlRef.current;
        const start = field && document.activeElement === field ? field.selectionStart : html.length;
        const end = field && document.activeElement === field ? field.selectionEnd : html.length;
        nextHtml = `${html.slice(0, start)}${token}${html.slice(end)}`;
      }
      return {
        ...current,
        html: nextHtml,
        fields: [...current.fields, fieldFromSuggestion(suggestion)],
      };
    });
  };

  const openEditor = (current = null) => {
    setEditor({
      key: current?.key || "",
      title: current?.title || "",
      description: current?.description || "",
      category: current?.category || "Correspondence",
      html: current?.html || template?.html || "",
      fields: (current?.fields || []).map((item) => ({
        ...item,
        rowId: item.rowId || nextFieldRowId(),
        optionsText: Array.isArray(item.options) ? item.options.join(", ") : (item.optionsText || ""),
        keyTouched: true,
      })),
    });
  };

  const saveEditor = async () => {
    if (!editor.title.trim() || !editor.html.trim()) {
      toast.error("Title and HTML are required");
      return;
    }
    setSavingTemplate(true);
    const payload = {
      title: editor.title.trim(),
      description: editor.description.trim(),
      category: editor.category.trim() || "Correspondence",
      html: editor.html,
      fields: editor.fields.map((item) => ({
        key: item.key,
        label: item.label,
        type: item.type || "text",
        required: Boolean(item.required),
        options: String(item.optionsText || "").split(",").map((part) => part.trim()).filter(Boolean),
        placeholder: item.placeholder || "",
      })),
    };
    const response = editor.key
      ? await saveDocTemplateApi(editor.key, payload)
      : await saveDocTemplateApi("", payload);
    setSavingTemplate(false);
    if (!response?.success) {
      toast.error(response?.msg || "Could not save the template");
      return;
    }
    setEditor(null);
    toast.success("Template saved");
    loadTemplates();
    if (response.template?.key) loadTemplate(response.template.key);
  };

  const duplicateTemplate = async (item) => {
    setCardMenu(null);
    const response = await getDocTemplateApi(item.key);
    if (!response?.success) {
      toast.error(response?.msg || "Could not duplicate this document");
      return;
    }
    const source = response.template;
    const saved = await saveDocTemplateApi("", {
      title: `${source.title} copy`,
      description: source.description,
      category: source.category,
      html: source.html,
      fields: source.fields || [],
    });
    if (!saved?.success) {
      toast.error(saved?.msg || "Could not duplicate this document");
      return;
    }
    toast.success("Template duplicated");
    loadTemplates();
  };

  const removeTemplate = async () => {
    const target = confirmRemove;
    if (!target?.key) return;
    setRemoving(true);
    const response = await removeDocTemplateApi(target.key);
    setRemoving(false);
    if (!response?.success) {
      toast.error(response?.msg || "Could not remove this document");
      return;
    }
    setConfirmRemove(null);
    toast.success(response.hidden ? "Document hidden" : "Document removed");
    if (selectedKey === target.key) {
      setSelectedKey("");
      setTemplate(null);
    }
    loadTemplates();
  };

  const searchedTemplates = useMemo(() => {
    const query = searchInput.trim().toLowerCase();
    return templates.filter((item) => {
      if (!query) return true;
      return `${item.title} ${item.category} ${item.description || ""}`.toLowerCase().includes(query);
    });
  }, [templates, searchInput]);

  const categoryCounts = useMemo(() => {
    const counts = { All: searchedTemplates.length };
    searchedTemplates.forEach((item) => {
      const name = item.category || "Correspondence";
      counts[name] = (counts[name] || 0) + 1;
    });
    return counts;
  }, [searchedTemplates]);

  const categoryTabs = useMemo(() => {
    const extras = Object.keys(categoryCounts).filter((name) => name !== "All" && !CATEGORY_CHOICES.includes(name));
    return ["All", ...CATEGORY_CHOICES, ...extras].filter((name) => name === "All" || name === category || categoryCounts[name]);
  }, [categoryCounts, category]);

  const visibleTemplates = useMemo(() => {
    const rows = category === "All"
      ? searchedTemplates
      : searchedTemplates.filter((item) => (item.category || "Correspondence") === category);
    const stamp = (item) => new Date(item.updatedAt || item.createdAt || 0).getTime();
    return [...rows].sort((a, b) => {
      if (sortBy === "name-asc") return a.title.localeCompare(b.title);
      if (sortBy === "name-desc") return b.title.localeCompare(a.title);
      if (sortBy === "newest") return stamp(b) - stamp(a);
      if (sortBy === "oldest") return stamp(a) - stamp(b);
      return (a.sortOrder || 0) - (b.sortOrder || 0) || a.title.localeCompare(b.title);
    });
  }, [searchedTemplates, category, sortBy]);

  const templateActions = (item, compact = false) => (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, width: compact ? "auto" : "100%" }} onClick={(event) => event.stopPropagation()}>
      <Button
        fullWidth={!compact}
        size="small"
        endIcon={<ArrowForward sx={{ fontSize: 16 }} />}
        onClick={() => loadTemplate(item.key)}
        sx={{
          justifyContent: "center",
          color: "primary.main",
          bgcolor: selectedKey === item.key ? "primary.main" : "rgba(103, 58, 183, 0.08)",
          ...(selectedKey === item.key ? { color: "primary.contrastText" } : {}),
          "&:hover": { bgcolor: selectedKey === item.key ? "primary.dark" : "rgba(103, 58, 183, 0.16)" },
          textTransform: "none",
          fontWeight: 700,
          borderRadius: 2,
          px: 1.5,
        }}
      >
        Use template
      </Button>
      {(canEdit || canDelete) && (
        <>
          {canEdit && (
          <Tooltip title="Edit template">
            <IconButton aria-label="Edit template" onClick={() => editTemplate(item)} sx={{ border: 1, borderColor: "divider", borderRadius: 2, width: 36, height: 36 }}>
              <EditOutlined sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          )}
          {canDelete && (
          <Tooltip title="Delete template">
            <IconButton aria-label="Delete template" onClick={() => setConfirmRemove(item)} sx={{ border: 1, borderColor: "rgba(211, 47, 47, 0.35)", borderRadius: 2, width: 36, height: 36, color: "error.main" }}>
              <DeleteOutline sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
          )}
        </>
      )}
    </Box>
  );

  return (
    <Box sx={{ display: "block", minHeight: "100vh", bgcolor: "background.default" }}>
      <Sidebar
        setisMobileMenu={setisMobileMenu}
        isMobileMenu={isMobileMenu}
        isCollapsed={isSidebarCollapsed}
        setIsSidebarCollapsed={setIsSidebarCollapsed}
      />
      <Box
        component="main"
        sx={{
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          ml: { xs: 0, md: isSidebarCollapsed ? "80px" : "280px" },
          transition: "margin-left 0.3s ease",
        }}
      >
        <AppBar position="static" elevation={0} sx={{ bgcolor: "background.paper", borderBottom: 1, borderColor: "divider" }}>
          <Toolbar sx={{ justifyContent: "space-between", gap: 2 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, minWidth: 0 }}>
              <IconButton onClick={() => setisMobileMenu(!isMobileMenu)} size="small" sx={{ display: { xs: "inline-flex", md: "none" } }}>
                <MenuIcon />
              </IconButton>
              <Description color="primary" />
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="h5" fontWeight={800} noWrap>Document Repository</Typography>
                <Typography variant="body2" color="text.secondary" noWrap>
                  Pick a document, pick a client, then copy, download, or create a PDF.
                </Typography>
              </Box>
            </Box>
            <CrmAppBarActions />
          </Toolbar>
        </AppBar>

        <Box sx={{ px: { xs: 2, sm: 3 }, py: 2.5, flex: 1, minHeight: 0, overflowY: "auto" }}>
          {ready && !canUse && (
            <Alert severity="warning">You do not have permission to use documents. Ask a super admin to turn on Use documents.</Alert>
          )}
          {(!ready || canUse) && (
          <>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 2, flexWrap: "wrap", mb: 2 }}>
            <Box>
              <Typography variant="caption" color="text.secondary" fontWeight={700} letterSpacing={0.6}>WORKSPACE / DOCUMENTS</Typography>
              <Typography variant="h4" fontWeight={800} sx={{ mt: 0.5 }}>Document templates</Typography>
              <Typography variant="body2" color="text.secondary">Find the right template, choose a client, and get started.</Typography>
            </Box>
            {canEdit && (
              <Button variant="contained" startIcon={<Add />} onClick={() => openEditor(null)} sx={{ borderRadius: 2, textTransform: "none", fontWeight: 700 }}>
                Add template
              </Button>
            )}
          </Box>

          <Card elevation={0} sx={{ mb: 2, borderRadius: 3, border: 1, borderColor: "divider" }}>
            <CardContent sx={{ display: "grid", gap: 1.5 }}>
              <Box sx={{ display: "flex", gap: 1.5, alignItems: "center", flexWrap: "wrap" }}>
                <TextField
                  size="small"
                  placeholder="Search document templates..."
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  InputProps={{ startAdornment: <Search sx={{ mr: 1, color: "text.secondary" }} /> }}
                  sx={{ flex: "1 1 240px", maxWidth: 420 }}
                />
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, ml: { md: "auto" } }}>
                  <Typography variant="body2" color="text.secondary">Sort by</Typography>
                  <TextField
                    select
                    size="small"
                    value={sortBy}
                    onChange={(event) => setSortBy(event.target.value)}
                    sx={{ minWidth: 150 }}
                  >
                    <MenuItem value="default">Default order</MenuItem>
                    <MenuItem value="name-asc">Name (A–Z)</MenuItem>
                    <MenuItem value="name-desc">Name (Z–A)</MenuItem>
                    <MenuItem value="newest">Newest</MenuItem>
                    <MenuItem value="oldest">Oldest</MenuItem>
                  </TextField>
                  <Box sx={{ display: "flex", border: 1, borderColor: "divider", borderRadius: 2, overflow: "hidden" }}>
                    <IconButton aria-label="Grid view" color={viewMode === "grid" ? "primary" : "default"} onClick={() => setViewMode("grid")} sx={{ borderRadius: 0 }}>
                      <GridView fontSize="small" />
                    </IconButton>
                    <IconButton aria-label="List view" color={viewMode === "list" ? "primary" : "default"} onClick={() => setViewMode("list")} sx={{ borderRadius: 0 }}>
                      <ViewList fontSize="small" />
                    </IconButton>
                  </Box>
                </Box>
              </Box>
              <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap" }}>
                {categoryTabs.map((item) => (
                  <Chip
                    key={item}
                    label={`${item} ${categoryCounts[item] || 0}`}
                    size="small"
                    color={category === item ? "primary" : "default"}
                    variant={category === item ? "filled" : "outlined"}
                    onClick={() => setCategory(item)}
                    sx={{ borderRadius: 999 }}
                  />
                ))}
              </Box>
            </CardContent>
          </Card>

          <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, flexWrap: "wrap", mb: 1.25 }}>
            <Typography fontWeight={800}>
              {category === "All" ? "All templates" : category}
              <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                {visibleTemplates.length} document{visibleTemplates.length === 1 ? "" : "s"}
              </Typography>
            </Typography>
            <Typography variant="body2" color="text.secondary">Select a template to create a client document</Typography>
          </Box>

          {listLoading && (
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(3, 1fr)", xl: "repeat(4, 1fr)" }, gap: 1.5, mb: 2 }}>
              {Array.from({ length: 8 }).map((_, index) => (
                <Card key={index} elevation={0} sx={{ borderRadius: 3, border: 1, borderColor: "divider", p: 2 }}>
                  <Skeleton variant="rounded" width={36} height={44} />
                  <Skeleton width="70%" height={28} sx={{ mt: 1.5 }} />
                  <Skeleton width="40%" height={24} />
                  <Skeleton variant="rounded" height={36} sx={{ mt: 2 }} />
                </Card>
              ))}
            </Box>
          )}
          {!listLoading && visibleTemplates.length === 0 && (
            <Typography color="text.secondary" sx={{ mb: 2 }}>No documents match that search.</Typography>
          )}
          {!listLoading && viewMode === "grid" && (
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", lg: "repeat(3, 1fr)", xl: "repeat(4, 1fr)" }, gap: 1.5, mb: 2 }}>
              {visibleTemplates.map((item) => (
                <Card
                  key={item.key}
                  elevation={0}
                  sx={{
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    borderRadius: 3,
                    border: "1px solid",
                    borderColor: selectedKey === item.key ? "primary.main" : "divider",
                    boxShadow: selectedKey === item.key ? "0 0 0 3px rgba(103, 58, 183, 0.12)" : "none",
                    bgcolor: "background.paper",
                  }}
                >
                  <CardContent sx={{ flex: 1, px: 2, pt: 1.75, pb: 1, "&:last-child": { pb: 1 } }}>
                    <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 1 }}>
                      <Box sx={{ width: 40, height: 40, borderRadius: 1.5, bgcolor: "rgba(228, 87, 46, 0.1)", display: "grid", placeItems: "center" }}>
                        <HtmlFileIcon small />
                      </Box>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                        <Chip size="small" label="HTML" variant="outlined" sx={{ height: 22, fontSize: 11 }} />
                        {canEdit && (
                          <IconButton size="small" aria-label="More template actions" onClick={(event) => setCardMenu({ el: event.currentTarget, item })}>
                            <MoreVert fontSize="small" />
                          </IconButton>
                        )}
                      </Box>
                    </Box>
                    <Typography fontWeight={800} sx={{ mt: 1.5 }}>{item.title}</Typography>
                    <Chip size="small" label={item.category || "Document"} sx={{ mt: 1, bgcolor: "action.hover" }} />
                  </CardContent>
                  <Box sx={{ px: 1.5, pb: 1.5 }}>{templateActions(item)}</Box>
                </Card>
              ))}
            </Box>
          )}
          {!listLoading && viewMode === "list" && visibleTemplates.length > 0 && (
            <TableContainer component={Card} elevation={0} sx={{ mb: 2, borderRadius: 3, border: 1, borderColor: "divider" }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Document</TableCell>
                    <TableCell>Category</TableCell>
                    <TableCell>Updated</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {visibleTemplates.map((item) => (
                    <TableRow key={item.key} hover selected={selectedKey === item.key}>
                      <TableCell>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
                          <HtmlFileIcon small />
                          <Typography fontWeight={700}>{item.title}</Typography>
                        </Box>
                      </TableCell>
                      <TableCell>{item.category || "Document"}</TableCell>
                      <TableCell>{item.updatedAt ? new Date(item.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—"}</TableCell>
                      <TableCell align="right">{templateActions(item, true)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          {template && (
            <Box ref={workflowRef} sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "minmax(320px, 420px) 1fr" }, gap: 2, alignItems: "start" }}>
              <Card variant="outlined">
                <CardContent sx={{ display: "grid", gap: 2 }}>
                  <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
                    <PersonOutline color="primary" />
                    <Box>
                      <Typography fontWeight={800}>1. Select CRM client</Typography>
                      <Typography variant="body2" color="text.secondary">Name, email, phone, and address come from the lead.</Typography>
                    </Box>
                  </Box>
                  <Autocomplete
                    options={clientOptions}
                    value={client}
                    inputValue={clientQuery}
                    onInputChange={(_, value) => setClientQuery(value)}
                    onChange={(_, value) => applyClient(value)}
                    getOptionLabel={clientLabel}
                    isOptionEqualToValue={(option, value) => option._id === value._id}
                    renderInput={(inputParams) => (
                      <TextField {...inputParams} label="Search / select client" placeholder="Name, email, phone, or #ID" size="small" />
                    )}
                  />
                  {client && <Chip size="small" color="success" variant="outlined" label="Client selected" />}
                  <TextField size="small" label="Full name" value={clientFields.name} onChange={(event) => setClientFields((current) => ({ ...current, name: event.target.value }))} />
                  <TextField size="small" label="Email address" value={clientFields.email} onChange={(event) => setClientFields((current) => ({ ...current, email: event.target.value }))} />
                  <TextField size="small" label="Address" value={clientFields.address} onChange={(event) => setClientFields((current) => ({ ...current, address: event.target.value }))} />
                  <TextField size="small" label="Phone number" value={clientFields.phone} onChange={(event) => setClientFields((current) => ({ ...current, phone: event.target.value }))} />
                  <Button startIcon={<Refresh />} onClick={refreshClient} disabled={!client?._id}>Refresh from CRM</Button>

                  <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
                    <Tune color="primary" />
                    <Box>
                      <Typography fontWeight={800}>2. Additional information</Typography>
                      <Typography variant="body2" color="text.secondary">These fields change for each document. The date starts as today and can be set earlier.</Typography>
                    </Box>
                  </Box>
                  <TextField
                    size="small"
                    type="date"
                    label="Document date"
                    value={documentDate}
                    onChange={(event) => setDocumentDate(event.target.value)}
                    InputLabelProps={{ shrink: true }}
                    helperText="Filled automatically. Change it if the letter should use an earlier date."
                  />
                  {(template.fields || []).map((item) => (
                    <TextField
                      key={item.key}
                      size="small"
                      select={item.type === "select"}
                      multiline={item.type === "textarea"}
                      minRows={item.type === "textarea" ? 3 : undefined}
                      type={item.type === "number" || item.type === "date" ? item.type : "text"}
                      label={item.label}
                      required={item.required}
                      placeholder={item.placeholder || ""}
                      value={extras[item.key] ?? ""}
                      onChange={(event) => setExtras((current) => ({ ...current, [item.key]: event.target.value }))}
                      InputLabelProps={item.type === "date" ? { shrink: true } : undefined}
                    >
                      {item.type === "select" && (item.options || []).map((option) => (
                        <MenuItem key={option} value={option}>{option}</MenuItem>
                      ))}
                    </TextField>
                  ))}

                  {history.length > 0 && (
                    <Box>
                      <Typography variant="subtitle2" sx={{ mb: 0.5, display: "flex", alignItems: "center", gap: 0.75 }}>
                        <History fontSize="small" color="primary" /> Recent documents
                      </Typography>
                      {history.slice(0, 5).map((row) => (
                        <Button key={row._id} size="small" sx={{ display: "flex", justifyContent: "flex-start" }} onClick={() => reopenHistory(row)}>
                          {row.templateTitle} · {row.clientName || "No name"} · {row.createdAt ? new Date(row.createdAt).toLocaleString() : ""}
                        </Button>
                      ))}
                    </Box>
                  )}
                </CardContent>
              </Card>

              <Card variant="outlined" sx={{ minHeight: 640, display: "flex", flexDirection: "column" }}>
                <Box sx={{ px: 2, py: 1.25, display: "flex", justifyContent: "space-between", gap: 1, alignItems: "center", borderBottom: 1, borderColor: "divider" }}>
                  <Typography fontWeight={800} sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                    <VisibilityOutlined fontSize="small" color="primary" /> 3. Live document preview
                  </Typography>
                  <Chip size="small" color="success" variant="outlined" label="Live" />
                </Box>
                <Box sx={{ flex: 1, minHeight: 480, bgcolor: "grey.100" }}>
                  {templateLoading ? (
                    <Box sx={{ p: 6, textAlign: "center" }}><CircularProgress /></Box>
                  ) : (
                    <Box
                      component="iframe"
                      title="Document preview"
                      sandbox=""
                      srcDoc={rendered}
                      sx={{ width: "100%", height: "100%", minHeight: 640, border: 0, bgcolor: "white" }}
                    />
                  )}
                </Box>
                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", p: 1.5, borderTop: 1, borderColor: "divider" }}>
                  <Button variant="contained" startIcon={exporting === "download" ? <CircularProgress size={16} color="inherit" /> : <Download />} onClick={() => exportDocument("download")} disabled={Boolean(exporting)}>
                    Download HTML
                  </Button>
                  <Button variant="outlined" startIcon={<ContentCopy />} onClick={() => exportDocument("copy")} disabled={Boolean(exporting)}>
                    Copy HTML
                  </Button>
                  <Button variant="outlined" startIcon={<PictureAsPdf />} onClick={() => exportDocument("pdf")} disabled={Boolean(exporting)}>
                    Create PDF
                  </Button>
                </Box>
              </Card>
            </Box>
          )}
          </>
          )}
        </Box>
      </Box>

      <Menu
        anchorEl={cardMenu?.el}
        open={Boolean(cardMenu)}
        onClose={() => setCardMenu(null)}
      >
        <MenuItem onClick={() => cardMenu?.item && duplicateTemplate(cardMenu.item)}>
          <ContentCopy fontSize="small" sx={{ mr: 1 }} />
          Duplicate
        </MenuItem>
      </Menu>

      <Dialog open={Boolean(confirmRemove)} onClose={() => !removing && setConfirmRemove(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <DeleteOutline color="error" />
          Remove this document?
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            {confirmRemove?.title || "This document"} will leave the library. Leads and letters already created are not deleted.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmRemove(null)} disabled={removing}>Cancel</Button>
          <Button color="error" variant="contained" startIcon={removing ? <CircularProgress size={16} color="inherit" /> : <DeleteOutline />} onClick={removeTemplate} disabled={removing}>
            {removing ? "Removing..." : "Remove document"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(editor)} onClose={() => setEditor(null)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Add color="primary" />
          {editor?.key ? "Edit template" : "Add template"}
        </DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 1.5, pt: 1 }}>
          <Alert severity="info" icon={<HtmlFileIcon small />}>
            <Typography fontWeight={800} sx={{ mb: 0.5 }}>Click a key to drop it into the letter</Typography>
            <Typography variant="body2">
              Click where the value should go in the HTML, then click a key. Client keys fill themselves. Suggested keys also add the matching input for the agent.
            </Typography>
          </Alert>
          <TextField label="Title" value={editor?.title || ""} onChange={(event) => setEditor((current) => ({ ...current, title: event.target.value }))} />
          <TextField
            label="Category"
            placeholder="Type a category or pick one"
            value={editor?.category || ""}
            onChange={(event) => setEditor((current) => current ? { ...current, category: event.target.value } : current)}
          />
          <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap" }}>
            {[...new Set([...CATEGORY_CHOICES, ...categories])]
              .filter((choice) => !editor?.category || choice.toLowerCase().includes(editor.category.toLowerCase()))
              .slice(0, 8)
              .map((choice) => (
                <Chip
                  key={choice}
                  size="small"
                  label={choice}
                  color={editor?.category === choice ? "primary" : "default"}
                  variant={editor?.category === choice ? "filled" : "outlined"}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => setEditor((current) => current ? { ...current, category: choice } : current)}
                />
              ))}
          </Box>
          <TextField label="Description" value={editor?.description || ""} onChange={(event) => setEditor((current) => ({ ...current, description: event.target.value }))} />
          <Box>
            <Typography variant="caption" color="text.secondary" fontWeight={700}>Filled from the client</Typography>
            <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap", mt: 0.75 }}>
              {AUTO_KEYS.map((item) => {
                const used = (editor?.html || "").includes(`{{${item.key}}}`);
                return (
                  <Chip
                    key={item.key}
                    icon={used ? <CheckCircle sx={{ fontSize: "16px !important" }} /> : undefined}
                    label={`${item.label}  {{${item.key}}}`}
                    size="small"
                    color={used ? "success" : "default"}
                    variant={used ? "filled" : "outlined"}
                    onClick={() => insertPlaceholder(item.key)}
                  />
                );
              })}
            </Box>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary" fontWeight={700}>Suggested fields for the agent</Typography>
            <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap", mt: 0.75 }}>
              {SUGGESTED_FIELDS.map((item) => {
                const used = (editor?.fields || []).some((field) => field.key === item.key);
                return (
                  <Chip
                    key={item.key}
                    icon={used ? <CheckCircle sx={{ fontSize: "16px !important" }} /> : <Add sx={{ fontSize: "16px !important" }} />}
                    label={item.label}
                    size="small"
                    color={used ? "primary" : "default"}
                    variant={used ? "filled" : "outlined"}
                    onClick={() => toggleSuggestedField(item)}
                  />
                );
              })}
            </Box>
          </Box>
          <TextField
            label="HTML"
            multiline
            minRows={8}
            value={editor?.html || ""}
            inputRef={htmlRef}
            onChange={(event) => {
              const html = event.target.value;
              setEditor((current) => {
                if (!current) return current;
                const grew = html.length - (current.html || "").length > 15;
                if (!grew) return { ...current, html };
                const already = new Set(tokensInHtml(current.html));
                let fields = current.fields;
                tokensInHtml(html).forEach((key) => {
                  if (already.has(key) || RESERVED_FIELD_KEYS.has(key) || fields.some((field) => field.key === key)) return;
                  const suggestion = SUGGESTED_FIELDS.find((item) => item.key === key);
                  fields = [...fields, suggestion ? fieldFromSuggestion(suggestion) : {
                    rowId: nextFieldRowId(),
                    key,
                    label: labelFromKey(key),
                    type: "text",
                    required: false,
                    optionsText: "",
                    keyTouched: true,
                  }];
                });
                return { ...current, html, fields };
              });
            }}
            helperText="Click in the letter first, then click a key above. It is inserted at the cursor."
          />
          {(() => {
            const found = tokensInHtml(editor?.html).filter((key) => !RESERVED_FIELD_KEYS.has(key) && !(editor?.fields || []).some((field) => field.key === key));
            if (!found.length) return null;
            return (
              <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap", alignItems: "center" }}>
                <Typography variant="caption" color="text.secondary">Found in the HTML</Typography>
                {found.slice(0, 6).map((key) => (
                  <Chip
                    key={key}
                    size="small"
                    variant="outlined"
                    label={labelFromKey(key)}
                    onClick={() => {
                      const suggestion = SUGGESTED_FIELDS.find((item) => item.key === key);
                      setEditor((current) => current ? {
                        ...current,
                        fields: [...current.fields, suggestion ? fieldFromSuggestion(suggestion) : {
                          rowId: nextFieldRowId(),
                          key,
                          label: labelFromKey(key),
                          type: "text",
                          required: false,
                          optionsText: "",
                          keyTouched: true,
                        }],
                      } : current);
                    }}
                  />
                ))}
              </Box>
            );
          })()}
          <Typography fontWeight={700}>Extra fields</Typography>
          {(editor?.fields || []).map((item) => {
            const typed = `${item.label || ""} ${item.key || ""}`.trim().toLowerCase();
            const matches = typed.length < 2 ? [] : SUGGESTED_FIELDS.filter((suggestion) => (
              suggestion.key !== item.key
              && !(editor?.fields || []).some((field) => field.key === suggestion.key)
              && (suggestion.label.toLowerCase().includes(typed) || suggestion.key.includes(typed.replace(/\s+/g, "_")))
            )).slice(0, 3);
            return (
            <Box key={item.rowId} sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr 120px 120px" }, gap: 1 }}>
              <TextField size="small" label="Label" value={item.label} onChange={(event) => {
                const label = event.target.value;
                setEditor((current) => ({
                  ...current,
                  fields: current.fields.map((field) => field.rowId === item.rowId ? {
                    ...field,
                    label,
                    key: field.keyTouched ? field.key : keyFromLabel(label),
                  } : field),
                }));
              }} />
              <TextField size="small" label="Key" value={item.key} onChange={(event) => setEditor((current) => ({
                ...current,
                fields: current.fields.map((field) => field.rowId === item.rowId ? { ...field, key: event.target.value, keyTouched: true } : field),
              }))} />
              {matches.length > 0 && (
                <Box sx={{ gridColumn: "1 / -1", display: "flex", gap: 0.75, flexWrap: "wrap" }}>
                  {matches.map((suggestion) => (
                    <Chip
                      key={suggestion.key}
                      size="small"
                      variant="outlined"
                      label={suggestion.label}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => setEditor((current) => ({
                        ...current,
                        fields: current.fields.map((field) => field.rowId === item.rowId ? {
                          ...field,
                          ...fieldFromSuggestion(suggestion),
                          rowId: field.rowId,
                        } : field),
                      }))}
                    />
                  ))}
                </Box>
              )}
              <TextField size="small" select label="Type" value={item.type || "text"} onChange={(event) => setEditor((current) => ({
                ...current,
                fields: current.fields.map((field) => field.rowId === item.rowId ? { ...field, type: event.target.value } : field),
              }))}>
                {["text", "number", "date", "textarea", "select"].map((type) => <MenuItem key={type} value={type}>{type}</MenuItem>)}
              </TextField>
              <TextField size="small" select label="Required" value={item.required ? "yes" : "no"} onChange={(event) => setEditor((current) => ({
                ...current,
                fields: current.fields.map((field) => field.rowId === item.rowId ? { ...field, required: event.target.value === "yes" } : field),
              }))}>
                <MenuItem value="no">No</MenuItem>
                <MenuItem value="yes">Yes</MenuItem>
              </TextField>
              <Button size="small" startIcon={<Add />} onClick={() => item.key && insertPlaceholder(item.key)} disabled={!item.key} sx={{ gridColumn: "1 / -1", justifyContent: "flex-start" }}>
                {item.key ? `Insert {{${item.key}}} into the HTML` : "Add a key first"}
              </Button>
              {item.type === "select" && (
                <TextField
                  size="small"
                  label="Options, separated by commas"
                  value={item.optionsText || ""}
                  onChange={(event) => setEditor((current) => ({
                    ...current,
                    fields: current.fields.map((field) => field.rowId === item.rowId ? { ...field, optionsText: event.target.value } : field),
                  }))}
                  sx={{ gridColumn: "1 / -1" }}
                />
              )}
            </Box>
            );
          })}
          <Button startIcon={<Add />} onClick={() => setEditor((current) => ({ ...current, fields: [...current.fields, { rowId: nextFieldRowId(), key: "", label: "", type: "text", required: false, optionsText: "", keyTouched: false }] }))}>
            Add field
          </Button>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditor(null)}>Cancel</Button>
          <Button variant="contained" onClick={saveEditor} disabled={savingTemplate}>{savingTemplate ? "Saving..." : "Save template"}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default DocumentRepository;
