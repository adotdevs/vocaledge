import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuthUser } from "react-auth-kit";
import {
  AppBar,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  InputAdornment,
  Menu,
  MenuItem,
  Pagination,
  Radio,
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
import { useTheme } from "@mui/material/styles";
import MenuIcon from "@mui/icons-material/Menu";
import Bolt from "@mui/icons-material/Bolt";
import Add from "@mui/icons-material/Add";
import Autorenew from "@mui/icons-material/Autorenew";
import MoreVert from "@mui/icons-material/MoreVert";
import Search from "@mui/icons-material/Search";
import ArrowForward from "@mui/icons-material/ArrowForward";
import AutoAwesome from "@mui/icons-material/AutoAwesome";
import Block from "@mui/icons-material/Block";
import Flag from "@mui/icons-material/Flag";
import PeopleOutline from "@mui/icons-material/PeopleOutline";
import DragIndicator from "@mui/icons-material/DragIndicator";
import ArrowUpward from "@mui/icons-material/ArrowUpward";
import ArrowDownward from "@mui/icons-material/ArrowDownward";
import Check from "@mui/icons-material/Check";
import ContentCopy from "@mui/icons-material/ContentCopy";
import DeleteOutline from "@mui/icons-material/DeleteOutline";
import PlayArrow from "@mui/icons-material/PlayArrow";
import History from "@mui/icons-material/History";
import Tune from "@mui/icons-material/Tune";
import Layers from "@mui/icons-material/Layers";
import InfoOutlined from "@mui/icons-material/InfoOutlined";
import Refresh from "@mui/icons-material/Refresh";
import Select from "react-select";
import { toast } from "react-toastify";
import Sidebar from "./Sidebar.js";
import CrmAppBarActions from "./components/CrmAppBarActions";
import {
  getLeadAutomationApi,
  saveLeadAutomationApi,
  saveLeadAutomationAdminApi,
  createLeadAutomationRuleApi,
  updateLeadAutomationRuleApi,
  toggleLeadAutomationRuleApi,
  duplicateLeadAutomationRuleApi,
  deleteLeadAutomationRuleApi,
  runLeadAutomationRuleNowApi,
  getLeadAutomationLogsApi,
  clearLeadAutomationLogsApi,
} from "../../../Api/Service";

const emptyAllow = { fileNames: [], countries: [], brands: [], sources: [] };

const PRESET_TEMPLATES = [
  {
    name: "No Answer – Lead Rotation",
    fromStatus: "No Answer",
    toStatus: "New",
    rotationMode: "sequential",
    maxAgentsPerLead: 10,
    finalStatus: "Exhausted",
    description: "When a lead becomes No Answer, move to the next agent in order and reset status to New.",
  },
  {
    name: "Not Interested – Recycle",
    fromStatus: "Not Interested",
    toStatus: "New",
    rotationMode: "sequential",
    maxAgentsPerLead: 6,
    finalStatus: "Exhausted",
    description: "Recycle Not Interested leads to the next agent as New for a second opinion.",
  },
  {
    name: "Callback – Follow Up Rotation",
    fromStatus: "Call Back",
    toStatus: "New",
    rotationMode: "least_assigned",
    maxAgentsPerLead: 5,
    finalStatus: "Exhausted",
    description: "Distribute Call Back leads to the agent with the fewest active leads.",
  },
];

const MAX_AGENTS_OPTIONS = [
  { value: 1, label: "1 agent (Single pass)" },
  { value: 2, label: "2 agents" },
  { value: 3, label: "3 agents" },
  { value: 5, label: "5 agents" },
  { value: 7, label: "7 agents" },
  { value: 10, label: "10 agents" },
  { value: 15, label: "15 agents" },
  { value: 20, label: "20 agents" },
  { value: 0, label: "Unlimited (Until all selected agents tried)" },
];

const FINAL_STATUS_CHOICES = ["Exhausted", "Not Active", "Not Interested", "Cold", "Expired", "keep"];

const DELAY_PRESET_OPTIONS = [
  { value: 0, label: "Immediately (No wait)" },
  { value: 5, label: "Every 5 minutes" },
  { value: 15, label: "Every 15 minutes" },
  { value: 30, label: "Every 30 minutes" },
  { value: 60, label: "Every 1 hour" },
  { value: 120, label: "Every 2 hours" },
  { value: 240, label: "Every 4 hours" },
  { value: 720, label: "Every 12 hours" },
  { value: 1440, label: "Every 24 hours (1 day)" },
  { value: 2880, label: "Every 48 hours (2 days)" },
  { value: -1, label: "Custom interval..." },
];

const formatDelayLabel = (mins = 0) => {
  const m = Number(mins) || 0;
  if (m <= 0) return "Immediately";
  if (m % 1440 === 0) {
    const d = m / 1440;
    return `${d} ${d === 1 ? "day" : "days"}`;
  }
  if (m % 60 === 0) {
    const h = m / 60;
    return `${h} ${h === 1 ? "hour" : "hours"}`;
  }
  return `${m} ${m === 1 ? "minute" : "minutes"}`;
};

const createBlankRuleDraft = (defaultAgentIds = []) => ({
  _id: "",
  name: "",
  description: "",
  active: true,
  listMode: "all",
  fileNames: [],
  countries: [],
  brands: [],
  sources: [],
  fromStatus: "No Answer",
  toStatus: "New",
  delayMinutes: 0,
  agentIds: defaultAgentIds,
  rotationMode: "sequential",
  skipPreviousAgents: true,
  maxAgentsPerLead: 10,
  finalStatus: "Exhausted",
  unassignOnExhausted: false,
});

const ruleToDraft = (rule) => ({
  _id: rule?._id || "",
  name: rule?.name || "",
  description: rule?.description || "",
  active: rule?.active !== false,
  listMode: rule?.listMode === "selected" && (rule?.fileNames || []).length > 0 ? "selected" : "all",
  fileNames: rule?.fileNames || [],
  countries: rule?.countries || [],
  brands: rule?.brands || [],
  sources: rule?.sources || [],
  fromStatus: rule?.fromStatus || "No Answer",
  toStatus: rule?.toStatus || "New",
  delayMinutes: Number.isFinite(Number(rule?.delayMinutes)) ? Number(rule.delayMinutes) : 0,
  agentIds: (rule?.agentIds || []).map((id) => String(id)),
  rotationMode: rule?.rotationMode === "least_assigned" ? "least_assigned" : "sequential",
  skipPreviousAgents: rule?.skipPreviousAgents !== false,
  maxAgentsPerLead: Number.isFinite(Number(rule?.maxAgentsPerLead)) ? Number(rule.maxAgentsPerLead) : 10,
  finalStatus: rule?.finalStatus || "Exhausted",
  unassignOnExhausted: Boolean(rule?.unassignOnExhausted),
});

const avatarPalette = ["#7c3aed", "#6366f1", "#2563eb", "#0891b2", "#059669", "#d97706", "#e11d48", "#9333ea"];
const colorForName = (name = "") => {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return avatarPalette[Math.abs(hash) % avatarPalette.length];
};

const PersonAvatar = ({ name, src, size = 34, active = false }) => {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [src]);
  const initial = (name || "?").trim().charAt(0).toUpperCase();
  const showImage = Boolean(src) && !failed;
  const bg = showImage ? "action.selected" : active ? colorForName(name) : "rgba(124, 58, 237, 0.14)";
  const fg = active && !showImage ? "#ffffff" : "#6d28d9";
  return (
    <Box
      sx={{
        width: size,
        height: size,
        borderRadius: "50%",
        overflow: "hidden",
        flexShrink: 0,
        bgcolor: bg,
        color: fg,
        display: "grid",
        placeItems: "center",
        fontWeight: 800,
        fontSize: Math.max(12, Math.floor(size * 0.42)),
      }}
    >
      {showImage ? (
        <Box
          component="img"
          src={src}
          alt=""
          onError={() => setFailed(true)}
          sx={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        initial
      )}
    </Box>
  );
};

const Toggle = ({ checked, disabled, onChange, label, size = "md" }) => {
  const isSmall = size === "sm";
  const w = isSmall ? 40 : 46;
  const h = isSmall ? 22 : 26;
  const knob = isSmall ? 16 : 20;
  return (
    <Box
      component="button"
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        if (!disabled) onChange(!checked);
      }}
      sx={{
        width: w,
        height: h,
        p: "3px",
        border: 0,
        borderRadius: 999,
        display: "flex",
        alignItems: "center",
        justifyContent: checked ? "flex-end" : "flex-start",
        flexShrink: 0,
        cursor: disabled ? "wait" : "pointer",
        bgcolor: checked ? "#6d28d9" : "#d0d5dd",
        boxShadow: checked
          ? "0 2px 6px rgba(109, 40, 217, 0.32)"
          : "inset 0 0 0 1px rgba(15, 23, 42, 0.08)",
        transition: "all 0.2s ease",
      }}
    >
      <Box
        sx={{
          width: knob,
          height: knob,
          borderRadius: "50%",
          bgcolor: "#fff",
          boxShadow: "0 1px 3px rgba(15, 23, 42, 0.25)",
        }}
      />
    </Box>
  );
};

const StepBadge = ({ number }) => (
  <Box
    sx={{
      width: 24,
      height: 24,
      borderRadius: "50%",
      bgcolor: "rgba(109, 40, 217, 0.14)",
      color: "#6d28d9",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      fontWeight: 800,
      fontSize: 12,
      flexShrink: 0,
    }}
  >
    {number}
  </Box>
);

const cardShell = {
  border: "1px solid",
  borderColor: "divider",
  borderRadius: "16px",
  bgcolor: "background.paper",
  boxShadow: "0 1px 3px rgba(16, 24, 40, 0.04), 0 8px 24px rgba(16, 24, 40, 0.04)",
};

const subPanelShell = {
  border: "1px solid",
  borderColor: "divider",
  borderRadius: "14px",
  bgcolor: "background.paper",
  p: 2.25,
};

const MultiSelect = ({ label, options, value, onChange, placeholder }) => {
  const theme = useTheme();
  const primary = "#6d28d9";
  const known = new Set(options || []);
  const extra = (value || []).filter((item) => item && !known.has(item));
  const selectOptions = [...extra, ...(options || [])].map((option) => ({ value: option, label: option }));
  const selected = (value || []).filter(Boolean).map((option) => ({ value: option, label: option }));
  return (
    <Box>
      {label && (
        <Typography variant="caption" sx={{ display: "block", mb: 0.5, fontWeight: 700, color: "text.secondary" }}>
          {label}
        </Typography>
      )}
      <Select
        isMulti
        closeMenuOnSelect={false}
        hideSelectedOptions={false}
        options={selectOptions}
        value={selected}
        onChange={(next) => onChange((next || []).map((item) => item.value))}
        placeholder={placeholder}
        menuPortalTarget={typeof document !== "undefined" ? document.body : null}
        menuPosition="fixed"
        styles={{
          control: (base, state) => ({
            ...base,
            minHeight: 40,
            borderRadius: 10,
            cursor: "pointer",
            borderColor: state.isFocused ? primary : theme.palette.divider,
            boxShadow: state.isFocused ? "0 0 0 3px rgba(109, 40, 217, 0.14)" : "none",
            backgroundColor: theme.palette.background.paper,
            "&:hover": { borderColor: primary },
          }),
          valueContainer: (base) => ({ ...base, padding: "2px 10px" }),
          menu: (base) => ({
            ...base,
            borderRadius: 12,
            overflow: "hidden",
            backgroundColor: theme.palette.background.paper,
            boxShadow: "0 16px 40px rgba(15, 23, 42, 0.16)",
          }),
          menuPortal: (base) => ({ ...base, zIndex: 1600 }),
          menuList: (base) => ({ ...base, maxHeight: 240, padding: 6 }),
          option: (base, state) => ({
            ...base,
            borderRadius: 8,
            cursor: "pointer",
            backgroundColor: state.isSelected
              ? "rgba(109, 40, 217, 0.12)"
              : state.isFocused
              ? theme.palette.action.hover
              : "transparent",
            color: theme.palette.text.primary,
            fontWeight: state.isSelected ? 700 : 500,
          }),
          multiValue: (base) => ({
            ...base,
            borderRadius: 999,
            backgroundColor: "rgba(109, 40, 217, 0.12)",
          }),
          multiValueLabel: (base) => ({ ...base, color: primary, fontWeight: 700, paddingLeft: 8 }),
          multiValueRemove: (base) => ({
            ...base,
            cursor: "pointer",
            borderRadius: 999,
            color: primary,
            ":hover": { backgroundColor: primary, color: "#fff" },
          }),
          placeholder: (base) => ({ ...base, color: theme.palette.text.secondary, fontSize: 13 }),
          input: (base) => ({ ...base, color: theme.palette.text.primary, cursor: "pointer" }),
          indicatorSeparator: () => ({ display: "none" }),
        }}
      />
    </Box>
  );
};

const emptyAdminRules = (admin) => ({
  enabled: admin.enabled === true,
  maxLeads: admin.maxLeads || 100,
  listNames: admin.listNames || [],
  countries: admin.countries || [],
  brands: admin.brands || [],
  sources: admin.sources || [],
});

const LeadAutomation = () => {
  const authUser = useAuthUser();
  const navigate = useNavigate();
  const role = authUser?.()?.user?.role;

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenu, setisMobileMenu] = useState(false);
  const [activeTab, setActiveTab] = useState("pool"); // "pool" | "automations" | "logs"
  const [loading, setLoading] = useState(true);

  // Rule-Based Lead Rotation state
  const [rules, setRules] = useState([]);
  const [selectedRuleId, setSelectedRuleId] = useState(""); // "" = creating new rule
  const [ruleDraft, setRuleDraft] = useState(() => createBlankRuleDraft());
  const [ruleSearch, setRuleSearch] = useState("");
  const [agentSearch, setAgentSearch] = useState("");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [savingRule, setSavingRule] = useState(false);
  const [togglingRuleId, setTogglingRuleId] = useState("");
  const [runningRuleId, setRunningRuleId] = useState("");
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [menuRule, setMenuRule] = useState(null);
  const [deleteDialogRule, setDeleteDialogRule] = useState(null);
  const [deletingRule, setDeletingRule] = useState(false);

  // Shared metadata
  const [statuses, setStatuses] = useState([]);
  const [listNames, setListNames] = useState([]);
  const [countries, setCountries] = useState([]);
  const [brands, setBrands] = useState([]);
  const [sources, setSources] = useState([]);
  const [rotationAgents, setRotationAgents] = useState([]);

  // Automation Logs state
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsPage, setLogsPage] = useState(1);
  const [logsPagination, setLogsPagination] = useState({ page: 1, limit: 25, total: 0, pages: 1 });
  const [logsSummary, setLogsSummary] = useState({ total: 0, rotatedTotal: 0, exhaustedTotal: 0 });
  const [logSearch, setLogSearch] = useState("");
  const [logRuleFilter, setLogRuleFilter] = useState("");
  const [logOutcomeFilter, setLogOutcomeFilter] = useState("");
  const [clearingLogs, setClearingLogs] = useState(false);

  // Auto-Refill Pool state (existing unassigned pool auto-assignment)
  const [enabled, setEnabled] = useState(true);
  const [allow, setAllow] = useState(emptyAllow);
  const [savingAllow, setSavingAllow] = useState(false);
  const [savingGlobal, setSavingGlobal] = useState(false);
  const [admins, setAdmins] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [savingId, setSavingId] = useState("");
  const [poolSearch, setPoolSearch] = useState("");
  const [searchParams] = useSearchParams();
  const focusAdminId = searchParams.get("admin") || "";
  const [highlightId, setHighlightId] = useState("");
  const cardRefs = useRef({});

  useEffect(() => {
    if (role && role !== "superadmin") navigate("/admin/dashboard/crm");
  }, [navigate, role]);

  const loadAutomationData = useCallback(async (preserveSelection = true) => {
    setLoading(true);
    const response = await getLeadAutomationApi();
    setLoading(false);
    if (!response?.success) {
      toast.error(response?.msg || "Could not load automation settings");
      return;
    }

    const loadedRules = response.rules || [];
    const loadedAgents = response.rotationAgents || response.admins || [];
    setRules(loadedRules);
    setStatuses(response.statuses || []);
    setListNames(response.listNames || []);
    setCountries(response.countries || []);
    setBrands(response.brands || []);
    setSources(response.sources || []);
    setRotationAgents(loadedAgents);

    // Pool settings
    setEnabled(response.enabled !== false);
    setAllow({ ...emptyAllow, ...(response.allow || {}) });
    setAdmins(response.admins || []);
    const nextAdminDrafts = {};
    (response.admins || []).forEach((admin) => {
      nextAdminDrafts[admin._id] = emptyAdminRules(admin);
    });
    setDrafts(nextAdminDrafts);

    // Select first rule if none selected
    if (loadedRules.length > 0) {
      setSelectedRuleId((prevId) => {
        if (preserveSelection && prevId && loadedRules.some((r) => String(r._id) === String(prevId))) {
          const match = loadedRules.find((r) => String(r._id) === String(prevId));
          setRuleDraft(ruleToDraft(match));
          return String(match._id);
        }
        const first = loadedRules[0];
        setRuleDraft(ruleToDraft(first));
        return String(first._id);
      });
    } else {
      const defaultAgentIds = loadedAgents
        .filter((a) => a.role !== "superadmin" && a.openCrm)
        .map((a) => String(a._id));
      setSelectedRuleId("");
      setRuleDraft(createBlankRuleDraft(defaultAgentIds));
    }
  }, []);

  useEffect(() => {
    loadAutomationData(false);
  }, [loadAutomationData]);

  // If URL has ?admin=..., switch to Auto-Refill Pool tab and scroll to admin
  useEffect(() => {
    if (!focusAdminId || loading) return undefined;
    setActiveTab("pool");
    setPoolSearch("");
    setHighlightId(focusAdminId);
    const timer = setTimeout(() => {
      cardRefs.current[focusAdminId]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
    const clear = setTimeout(() => setHighlightId(""), 5000);
    return () => {
      clearTimeout(timer);
      clearTimeout(clear);
    };
  }, [focusAdminId, loading, admins]);

  const loadLogs = useCallback(
    async (pageToLoad = logsPage) => {
      setLogsLoading(true);
      const response = await getLeadAutomationLogsApi({
        page: pageToLoad,
        limit: 25,
        ruleId: logRuleFilter || undefined,
        outcome: logOutcomeFilter || undefined,
        search: logSearch.trim() || undefined,
      });
      setLogsLoading(false);
      if (!response?.success) {
        toast.error(response?.msg || "Could not load automation logs");
        return;
      }
      setLogs(response.logs || []);
      setLogsPagination(response.pagination || { page: 1, limit: 25, total: 0, pages: 1 });
      setLogsSummary(response.summary || { total: 0, rotatedTotal: 0, exhaustedTotal: 0 });
    },
    [logsPage, logRuleFilter, logOutcomeFilter, logSearch]
  );

  useEffect(() => {
    if (activeTab === "logs") {
      loadLogs(logsPage);
    }
  }, [activeTab, logsPage, logRuleFilter, logOutcomeFilter, loadLogs]);

  // Status choices combining DB statuses + standard rotation statuses
  const allStatusLabels = useMemo(() => {
    const base = statuses.map((s) => s.label).filter(Boolean);
    const extras = ["New", "No Answer", "Call Back", "Not Interested", "Active", "Not Active", "Exhausted", "Expired", "Cold"];
    const seen = new Set(base.map((s) => s.toLowerCase()));
    extras.forEach((item) => {
      if (!seen.has(item.toLowerCase())) {
        seen.add(item.toLowerCase());
        base.push(item);
      }
    });
    return base;
  }, [statuses]);

  const filteredRules = useMemo(() => {
    const q = ruleSearch.trim().toLowerCase();
    if (!q) return rules;
    return rules.filter((r) =>
      `${r.name} ${r.fromStatus} ${r.toStatus} ${(r.fileNames || []).join(" ")}`.toLowerCase().includes(q)
    );
  }, [rules, ruleSearch]);

  // Ordered agents for Section 3: Selected agents first in exact rotation order, then unselected agents
  const orderedAgentList = useMemo(() => {
    const agentById = new Map(rotationAgents.map((a) => [String(a._id), a]));
    const selectedIds = (ruleDraft.agentIds || []).map((id) => String(id)).filter((id) => agentById.has(id));
    const selectedSet = new Set(selectedIds);
    const selectedAgents = selectedIds.map((id) => agentById.get(id));
    const unselectedAgents = rotationAgents.filter((a) => !selectedSet.has(String(a._id)));
    const combined = [...selectedAgents, ...unselectedAgents];
    const q = agentSearch.trim().toLowerCase();
    if (!q) return combined;
    return combined.filter((a) => `${a.name} ${a.email} ${a.role}`.toLowerCase().includes(q));
  }, [rotationAgents, ruleDraft.agentIds, agentSearch]);

  const handleSelectRule = (rule) => {
    setSelectedRuleId(String(rule._id));
    setRuleDraft(ruleToDraft(rule));
    setShowAdvancedFilters(
      Boolean((rule.countries || []).length || (rule.brands || []).length || (rule.sources || []).length)
    );
  };

  const handleStartNewRule = (preset = null) => {
    const defaultAgentIds = rotationAgents
      .filter((a) => a.role !== "superadmin" && a.openCrm)
      .map((a) => String(a._id));
    setSelectedRuleId("");
    if (preset) {
      setRuleDraft({
        ...createBlankRuleDraft(defaultAgentIds),
        name: preset.name,
        description: preset.description || "",
        fromStatus: preset.fromStatus,
        toStatus: preset.toStatus,
        rotationMode: preset.rotationMode || "sequential",
        maxAgentsPerLead: preset.maxAgentsPerLead ?? 10,
        finalStatus: preset.finalStatus || "Exhausted",
      });
    } else {
      setRuleDraft(createBlankRuleDraft(defaultAgentIds));
    }
    setActiveTab("automations");
  };

  const handleDiscardDraft = () => {
    if (selectedRuleId) {
      const existing = rules.find((r) => String(r._id) === String(selectedRuleId));
      if (existing) {
        setRuleDraft(ruleToDraft(existing));
        toast.info("Changes discarded");
        return;
      }
    }
    handleStartNewRule();
    toast.info("Draft reset");
  };

  const handleToggleAgentInDraft = (agentIdStr) => {
    setRuleDraft((prev) => {
      const exists = prev.agentIds.includes(agentIdStr);
      const nextIds = exists
        ? prev.agentIds.filter((id) => id !== agentIdStr)
        : [...prev.agentIds, agentIdStr];
      return { ...prev, agentIds: nextIds };
    });
  };

  const handleMoveAgentOrder = (agentIdStr, direction) => {
    setRuleDraft((prev) => {
      const idx = prev.agentIds.indexOf(agentIdStr);
      if (idx === -1) return prev;
      const targetIdx = direction === "up" ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= prev.agentIds.length) return prev;
      const copy = [...prev.agentIds];
      const [moved] = copy.splice(idx, 1);
      copy.splice(targetIdx, 0, moved);
      return { ...prev, agentIds: copy };
    });
  };

  const handleSaveRule = async () => {
    const cleanName = String(ruleDraft.name || "").trim();
    if (!cleanName) {
      toast.error("Please enter an Automation Name");
      return;
    }
    if (!ruleDraft.fromStatus || !ruleDraft.toStatus) {
      toast.error("Please select both From and To statuses");
      return;
    }
    if (ruleDraft.fromStatus.trim().toLowerCase() === ruleDraft.toStatus.trim().toLowerCase()) {
      toast.error("Trigger status (From) and target status (To) must be different");
      return;
    }
    if (!ruleDraft.agentIds || ruleDraft.agentIds.length === 0) {
      toast.error("Please select at least one agent in rotation");
      return;
    }

    setSavingRule(true);
    const payload = {
      ...ruleDraft,
      name: cleanName,
      listMode: ruleDraft.listMode === "selected" && ruleDraft.fileNames.length > 0 ? "selected" : "all",
      fileNames: ruleDraft.listMode === "selected" ? ruleDraft.fileNames : [],
    };

    const response = selectedRuleId
      ? await updateLeadAutomationRuleApi(selectedRuleId, payload)
      : await createLeadAutomationRuleApi(payload);
    setSavingRule(false);

    if (!response?.success) {
      toast.error(response?.msg || "Could not save automation rule");
      return;
    }

    const saved = response.rule;
    toast.success(response.msg || "Automation rule saved");
    setRules((prev) => {
      const exists = prev.some((r) => String(r._id) === String(saved._id));
      if (exists) {
        return prev.map((r) => (String(r._id) === String(saved._id) ? saved : r));
      }
      return [saved, ...prev];
    });
    setSelectedRuleId(String(saved._id));
    setRuleDraft(ruleToDraft(saved));
  };

  const handleToggleRuleCard = async (rule, nextActive) => {
    const id = String(rule._id);
    setTogglingRuleId(id);
    setRules((prev) => prev.map((r) => (String(r._id) === id ? { ...r, active: nextActive } : r)));
    if (String(selectedRuleId) === id) {
      setRuleDraft((prev) => ({ ...prev, active: nextActive }));
    }

    const response = await toggleLeadAutomationRuleApi(id, nextActive);
    setTogglingRuleId("");
    if (!response?.success) {
      setRules((prev) => prev.map((r) => (String(r._id) === id ? { ...r, active: !nextActive } : r)));
      if (String(selectedRuleId) === id) {
        setRuleDraft((prev) => ({ ...prev, active: !nextActive }));
      }
      toast.error(response?.msg || "Could not toggle rule");
      return;
    }
    toast.success(response.msg || (nextActive ? "Rule enabled" : "Rule paused"));
  };

  const handleDuplicateRule = async (rule) => {
    setMenuAnchor(null);
    setMenuRule(null);
    const response = await duplicateLeadAutomationRuleApi(rule._id);
    if (!response?.success) {
      toast.error(response?.msg || "Could not duplicate rule");
      return;
    }
    const created = response.rule;
    setRules((prev) => [created, ...prev]);
    setSelectedRuleId(String(created._id));
    setRuleDraft(ruleToDraft(created));
    toast.success("Rule duplicated");
  };

  const handleConfirmDeleteRule = async () => {
    if (!deleteDialogRule) return;
    setDeletingRule(true);
    const targetId = String(deleteDialogRule._id);
    const response = await deleteLeadAutomationRuleApi(targetId);
    setDeletingRule(false);
    setDeleteDialogRule(null);
    if (!response?.success) {
      toast.error(response?.msg || "Could not delete rule");
      return;
    }
    toast.success(response.msg || "Rule deleted");
    const remaining = rules.filter((r) => String(r._id) !== targetId);
    setRules(remaining);
    if (String(selectedRuleId) === targetId) {
      if (remaining.length > 0) {
        setSelectedRuleId(String(remaining[0]._id));
        setRuleDraft(ruleToDraft(remaining[0]));
      } else {
        handleStartNewRule();
      }
    }
  };

  const handleRunRuleNow = async (ruleToRun) => {
    setMenuAnchor(null);
    setMenuRule(null);
    const id = String(ruleToRun?._id || selectedRuleId);
    if (!id) {
      toast.info("Save this automation rule first before running it on existing leads");
      return;
    }
    setRunningRuleId(id);
    const response = await runLeadAutomationRuleNowApi(id, 500);
    setRunningRuleId("");
    if (!response?.success) {
      toast.error(response?.msg || "Could not run automation rule");
      return;
    }
    if (response.rule) {
      setRules((prev) => prev.map((r) => (String(r._id) === id ? response.rule : r)));
    }
    if (response.rotatedCount > 0 || response.exhaustedCount > 0) {
      toast.success(response.msg);
      loadAutomationData(true);
    } else {
      toast.info(response.msg || "No matching leads needed rotation right now");
    }
  };

  const handleClearLogs = async () => {
    setClearingLogs(true);
    const response = await clearLeadAutomationLogsApi(logRuleFilter);
    setClearingLogs(false);
    if (!response?.success) {
      toast.error(response?.msg || "Could not clear logs");
      return;
    }
    toast.success(response.msg || "Automation logs cleared");
    loadLogs(1);
  };

  // Auto-Refill Pool handlers
  const shownPoolAdmins = useMemo(() => {
    const term = poolSearch.trim().toLowerCase();
    if (!term) return admins;
    return admins.filter((admin) => `${admin.name} ${admin.email} ${admin.role}`.toLowerCase().includes(term));
  }, [admins, poolSearch]);

  const updateAdminDraft = (id, patch) => {
    setDrafts((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  };

  const toggleGlobalPool = async (next) => {
    setSavingGlobal(true);
    const response = await saveLeadAutomationApi({ enabled: next });
    setSavingGlobal(false);
    if (!response?.success) {
      toast.error(response?.msg || "Could not update auto-refill");
      return;
    }
    setEnabled(response.enabled !== false);
    toast.success(next ? "Auto-refill pool is on" : "Auto-refill pool is off");
  };

  const saveGlobalAllow = async () => {
    setSavingAllow(true);
    const response = await saveLeadAutomationApi({ allow });
    setSavingAllow(false);
    if (!response?.success) {
      toast.error(response?.msg || "Could not save allowed leads");
      return;
    }
    setAllow({ ...emptyAllow, ...(response.allow || allow) });
    toast.success("Allowed leads saved");
  };

  const setAgentPoolEnabled = async (admin, nextEnabled) => {
    const draft = { ...(drafts[admin._id] || emptyAdminRules(admin)), enabled: nextEnabled };
    updateAdminDraft(admin._id, { enabled: nextEnabled });
    setSavingId(admin._id);
    const response = await saveLeadAutomationAdminApi(admin._id, draft);
    setSavingId("");
    if (!response?.success) {
      updateAdminDraft(admin._id, { enabled: !nextEnabled });
      toast.error(response?.msg || "Could not update this agent");
      return;
    }
    setAdmins((current) =>
      current.map((item) => (item._id === admin._id ? { ...item, ...response.admin, enabled: nextEnabled } : item))
    );
  };

  const savePoolAdmin = async (admin) => {
    const draft = drafts[admin._id];
    if (!draft) return;
    setSavingId(admin._id);
    const response = await saveLeadAutomationAdminApi(admin._id, draft);
    setSavingId("");
    if (!response?.success) {
      toast.error(response?.msg || "Could not save this admin");
      return;
    }
    setAdmins((current) => current.map((item) => (item._id === admin._id ? { ...item, ...response.admin } : item)));
    toast.success(`Saved auto-refill rules for ${admin.name}`);
  };

  return (
    <Box sx={{ display: "block", minHeight: "100vh", bgcolor: "#f8f9fc" }}>
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
        }}
      >
        {/* Top AppBar Header */}
        <AppBar
          position="static"
          elevation={0}
          sx={{ bgcolor: "background.paper", borderBottom: "1px solid", borderColor: "divider" }}
        >
          <Toolbar sx={{ justifyContent: "space-between", py: 1, gap: 2, flexWrap: "wrap" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.75 }}>
              <IconButton onClick={() => setisMobileMenu(!isMobileMenu)} sx={{ display: { md: "none" } }}>
                <MenuIcon />
              </IconButton>
              <Box
                sx={{
                  width: 44,
                  height: 44,
                  borderRadius: "12px",
                  bgcolor: "rgba(109, 40, 217, 0.12)",
                  color: "#6d28d9",
                  display: "grid",
                  placeItems: "center",
                  flexShrink: 0,
                }}
              >
                <Bolt sx={{ fontSize: 26 }} />
              </Box>
              <Box>
                <Typography variant="h5" fontWeight={800} color="text.primary" sx={{ lineHeight: 1.2 }}>
                  Lead Automation
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Create and manage automation rules for lead rotation and recycling.
                </Typography>
              </Box>
            </Box>

            <CrmAppBarActions />
          </Toolbar>
        </AppBar>

        {/* Main Scrollable Content Area */}
        <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", p: { xs: 2, sm: 3 } }}>
          {/* Page-Level Navigation Bar */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 2,
              flexWrap: "wrap",
              mb: 2.5,
            }}
          >
            <Box
              sx={{
                display: "inline-flex",
                alignItems: "center",
                gap: 0.75,
                p: 0.65,
                borderRadius: "14px",
                bgcolor: "background.paper",
                border: "1px solid",
                borderColor: "divider",
                boxShadow: "0 1px 3px rgba(16, 24, 40, 0.04), 0 4px 12px rgba(16, 24, 40, 0.03)",
              }}
            >
              {[
                {
                  id: "pool",
                  label: "Auto-Refill",
                  sub: "Unassigned pool",
                  icon: <Tune sx={{ fontSize: 18 }} />,
                },
                {
                  id: "automations",
                  label: "Lead Rotation",
                  sub: "Status reshuffle",
                  icon: <Autorenew sx={{ fontSize: 18 }} />,
                  badge: rules.length,
                },
                {
                  id: "logs",
                  label: "Logs",
                  sub: "Rotation history",
                  icon: <History sx={{ fontSize: 18 }} />,
                },
              ].map((tabItem) => {
                const isActive = activeTab === tabItem.id;
                return (
                  <Box
                    key={tabItem.id}
                    component="button"
                    type="button"
                    onClick={() => setActiveTab(tabItem.id)}
                    sx={{
                      border: 0,
                      outline: 0,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 1.1,
                      px: 2,
                      py: 1,
                      borderRadius: "10px",
                      fontFamily: "inherit",
                      textAlign: "left",
                      transition: "all 0.18s ease",
                      bgcolor: isActive ? "#6d28d9" : "transparent",
                      color: isActive ? "#ffffff" : "text.primary",
                      boxShadow: isActive ? "0 4px 12px rgba(109, 40, 217, 0.26)" : "none",
                      "&:hover": {
                        bgcolor: isActive ? "#5b21b6" : "action.hover",
                      },
                    }}
                  >
                    <Box
                      sx={{
                        width: 30,
                        height: 30,
                        borderRadius: "8px",
                        display: "grid",
                        placeItems: "center",
                        bgcolor: isActive ? "rgba(255, 255, 255, 0.18)" : "rgba(109, 40, 217, 0.08)",
                        color: isActive ? "#ffffff" : "#6d28d9",
                        flexShrink: 0,
                      }}
                    >
                      {tabItem.icon}
                    </Box>
                    <Box>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                        <Typography
                          component="span"
                          sx={{
                            fontSize: 13.5,
                            fontWeight: 800,
                            lineHeight: 1.2,
                            color: "inherit",
                          }}
                        >
                          {tabItem.label}
                        </Typography>
                        {typeof tabItem.badge === "number" && (
                          <Box
                            component="span"
                            sx={{
                              px: 0.75,
                              py: 0.05,
                              borderRadius: 999,
                              fontSize: 11,
                              fontWeight: 800,
                              lineHeight: 1.4,
                              bgcolor: isActive ? "rgba(255, 255, 255, 0.22)" : "rgba(109, 40, 217, 0.12)",
                              color: isActive ? "#ffffff" : "#6d28d9",
                            }}
                          >
                            {tabItem.badge}
                          </Box>
                        )}
                      </Box>
                      <Typography
                        variant="caption"
                        sx={{
                          display: { xs: "none", sm: "block" },
                          fontSize: 11,
                          lineHeight: 1.2,
                          color: isActive ? "rgba(255, 255, 255, 0.78)" : "text.secondary",
                        }}
                      >
                        {tabItem.sub}
                      </Typography>
                    </Box>
                  </Box>
                );
              })}
            </Box>

            {activeTab === "automations" && (
              <Button
                variant="contained"
                startIcon={<Add />}
                onClick={() => handleStartNewRule()}
                sx={{
                  bgcolor: "#6d28d9",
                  "&:hover": { bgcolor: "#5b21b6" },
                  borderRadius: "12px",
                  textTransform: "none",
                  fontWeight: 800,
                  px: 2.5,
                  py: 1.1,
                  boxShadow: "0 4px 12px rgba(109, 40, 217, 0.25)",
                }}
              >
                New Rule
              </Button>
            )}
          </Box>
          {/* ========================================================= */}
          {/* TAB 1: RULE-BASED LEAD ROTATION & RESHUFFLE AUTOMATIONS   */}
          {/* ========================================================= */}
          {activeTab === "automations" && (
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", lg: "360px 1fr" },
                gap: 2.5,
                alignItems: "start",
              }}
            >
              {/* LEFT SIDEBAR: Automations Rules List */}
              <Card
                elevation={0}
                sx={{
                  ...cardShell,
                  position: { lg: "sticky" },
                  top: { lg: 0 },
                  maxHeight: { lg: "calc(100vh - 156px)" },
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <CardContent sx={{ p: 2.25, display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
                  <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 0.5 }}>
                    <Typography variant="subtitle1" fontWeight={800}>
                      Automations
                    </Typography>
                    <Chip
                      size="small"
                      label={`${rules.length} ${rules.length === 1 ? "rule" : "rules"}`}
                      sx={{
                        fontWeight: 700,
                        fontSize: 12,
                        bgcolor: "rgba(109, 40, 217, 0.12)",
                        color: "#6d28d9",
                      }}
                    />
                  </Box>
                  <Typography variant="caption" color="text.secondary" sx={{ mb: 1.75, display: "block" }}>
                    Manage your lead automation rules.
                  </Typography>

                  <TextField
                    size="small"
                    fullWidth
                    placeholder="Search automation..."
                    value={ruleSearch}
                    onChange={(e) => setRuleSearch(e.target.value)}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <Search sx={{ fontSize: 18, color: "text.secondary" }} />
                        </InputAdornment>
                      ),
                    }}
                    sx={{
                      mb: 1.75,
                      "& .MuiOutlinedInput-root": {
                        borderRadius: "10px",
                        bgcolor: "action.hover",
                        "& fieldset": { borderColor: "transparent" },
                        "&:hover fieldset": { borderColor: "divider" },
                        "&.Mui-focused fieldset": { borderColor: "#6d28d9" },
                      },
                    }}
                  />

                  {/* Quick Presets Bar */}
                  <Box sx={{ mb: 1.75 }}>
                    <Typography
                      variant="caption"
                      fontWeight={700}
                      color="text.secondary"
                      sx={{ display: "block", mb: 0.75 }}
                    >
                      Quick templates:
                    </Typography>
                    <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap" }}>
                      {PRESET_TEMPLATES.map((preset) => (
                        <Chip
                          key={preset.name}
                          size="small"
                          icon={<Add sx={{ fontSize: "14px !important" }} />}
                          label={preset.fromStatus + " → " + preset.toStatus}
                          onClick={() => handleStartNewRule(preset)}
                          variant="outlined"
                          sx={{
                            fontSize: 11,
                            fontWeight: 700,
                            borderRadius: "8px",
                            cursor: "pointer",
                            "&:hover": {
                              borderColor: "#6d28d9",
                              bgcolor: "rgba(109, 40, 217, 0.06)",
                            },
                          }}
                        />
                      ))}
                    </Box>
                  </Box>

                  {/* Rules List */}
                  <Box sx={{ flex: 1, overflowY: "auto", display: "grid", gap: 1.25, pr: 0.5, alignContent: "start" }}>
                    {loading && (
                      <Box sx={{ py: 4, textAlign: "center" }}>
                        <CircularProgress size={28} />
                      </Box>
                    )}

                    {!loading && filteredRules.length === 0 && (
                      <Box
                        sx={{
                          p: 2.5,
                          borderRadius: "12px",
                          border: "1px dashed",
                          borderColor: "divider",
                          textAlign: "center",
                        }}
                      >
                        <Typography variant="body2" fontWeight={700} sx={{ mb: 0.5 }}>
                          {rules.length === 0 ? "No automation rules yet" : "No matching rules"}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>
                          {rules.length === 0
                            ? "Create your first rule on the right or pick a quick template above."
                            : "Try a different search keyword."}
                        </Typography>
                        {rules.length === 0 && (
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={<AutoAwesome fontSize="small" />}
                            onClick={() => handleStartNewRule(PRESET_TEMPLATES[0])}
                            sx={{ textTransform: "none", fontWeight: 700, borderRadius: "8px" }}
                          >
                            Load "No Answer → New"
                          </Button>
                        )}
                      </Box>
                    )}

                    {filteredRules.map((rule) => {
                      const isSelected = String(rule._id) === String(selectedRuleId);
                      const isActive = rule.active !== false;
                      const agentCount = (rule.agentIds || []).length;
                      const listLabel =
                        rule.listMode === "selected" && (rule.fileNames || []).length > 0
                          ? `${rule.fileNames.length} list${rule.fileNames.length === 1 ? "" : "s"}`
                          : "All Leads";
                      return (
                        <Box
                          key={rule._id}
                          onClick={() => handleSelectRule(rule)}
                          sx={{
                            p: 1.5,
                            borderRadius: "12px",
                            border: "1.5px solid",
                            borderColor: isSelected ? "#6d28d9" : "divider",
                            bgcolor: isSelected ? "rgba(109, 40, 217, 0.05)" : "background.paper",
                            boxShadow: isSelected ? "0 4px 14px rgba(109, 40, 217, 0.12)" : "none",
                            cursor: "pointer",
                            transition: "all 0.18s ease",
                            display: "flex",
                            alignItems: "center",
                            gap: 1.25,
                            "&:hover": {
                              borderColor: "#6d28d9",
                            },
                          }}
                        >
                          <Box
                            sx={{
                              width: 36,
                              height: 36,
                              borderRadius: "10px",
                              bgcolor: isActive ? "rgba(109, 40, 217, 0.12)" : "action.hover",
                              color: isActive ? "#6d28d9" : "text.disabled",
                              display: "grid",
                              placeItems: "center",
                              flexShrink: 0,
                            }}
                          >
                            <Autorenew sx={{ fontSize: 20 }} />
                          </Box>

                          <Box sx={{ minWidth: 0, flex: 1 }}>
                            <Typography variant="body2" fontWeight={800} noWrap color="text.primary">
                              {rule.name}
                            </Typography>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              noWrap
                              sx={{ display: "block", fontWeight: 600, fontSize: 11, mt: 0.25 }}
                            >
                              {String(rule.fromStatus || "").toUpperCase()} →{" "}
                              {String(rule.toStatus || "").toUpperCase()} • {agentCount}{" "}
                              {agentCount === 1 ? "agent" : "agents"}
                            </Typography>
                            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mt: 0.4, flexWrap: "wrap" }}>
                              <Chip
                                size="small"
                                label={listLabel}
                                sx={{ height: 18, fontSize: 10, fontWeight: 700 }}
                              />
                              <Chip
                                size="small"
                                variant="outlined"
                                color={(Number(rule.delayMinutes) || 0) > 0 ? "primary" : "default"}
                                label={
                                  (Number(rule.delayMinutes) || 0) > 0
                                    ? `Every ${formatDelayLabel(rule.delayMinutes)}`
                                    : "Instant"
                                }
                                sx={{ height: 18, fontSize: 10, fontWeight: 700 }}
                              />
                              {(rule.stats?.totalRotated || 0) > 0 && (
                                <Chip
                                  size="small"
                                  color="success"
                                  variant="outlined"
                                  label={`${rule.stats.totalRotated} rotated`}
                                  sx={{ height: 18, fontSize: 10, fontWeight: 700 }}
                                />
                              )}
                            </Box>
                          </Box>

                          <Toggle
                            size="sm"
                            checked={isActive}
                            disabled={togglingRuleId === String(rule._id)}
                            onChange={(next) => handleToggleRuleCard(rule, next)}
                            label={`Toggle ${rule.name}`}
                          />

                          <IconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuAnchor(e.currentTarget);
                              setMenuRule(rule);
                            }}
                            sx={{ ml: -0.5 }}
                          >
                            <MoreVert fontSize="small" />
                          </IconButton>
                        </Box>
                      );
                    })}
                  </Box>
                </CardContent>
              </Card>

              {/* RIGHT PANEL: Create / Edit Automation Rule */}
              <Card elevation={0} sx={cardShell}>
                <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
                  {/* Top Header of Form */}
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      gap: 2,
                      flexWrap: "wrap",
                      pb: 2,
                      mb: 2.5,
                      borderBottom: "1px solid",
                      borderColor: "divider",
                    }}
                  >
                    <Box>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <Typography variant="h6" fontWeight={800}>
                          {selectedRuleId ? "Edit Automation" : "Create Automation"}
                        </Typography>
                        {!selectedRuleId && (
                          <Chip
                            size="small"
                            label="New Rule"
                            sx={{
                              bgcolor: "rgba(109, 40, 217, 0.12)",
                              color: "#6d28d9",
                              fontWeight: 700,
                              height: 22,
                            }}
                          />
                        )}
                      </Box>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                        Define when a lead should move to the next agent and what status to set.
                      </Typography>
                    </Box>

                    <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                      {selectedRuleId && (
                        <Tooltip title="Scan existing leads matching this rule's From Status and rotate them immediately">
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={
                              runningRuleId === String(selectedRuleId) ? (
                                <CircularProgress size={14} />
                              ) : (
                                <PlayArrow />
                              )
                            }
                            disabled={Boolean(runningRuleId)}
                            onClick={() => handleRunRuleNow({ _id: selectedRuleId })}
                            sx={{
                              borderRadius: "10px",
                              textTransform: "none",
                              fontWeight: 700,
                              borderColor: "#6d28d9",
                              color: "#6d28d9",
                            }}
                          >
                            {runningRuleId === String(selectedRuleId) ? "Running..." : "Run on Existing Leads"}
                          </Button>
                        </Tooltip>
                      )}
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <Typography variant="body2" fontWeight={700}>
                          Active
                        </Typography>
                        <Toggle
                          checked={ruleDraft.active !== false}
                          disabled={Boolean(selectedRuleId && togglingRuleId === String(selectedRuleId))}
                          onChange={(next) => {
                            if (selectedRuleId) {
                              const targetRule =
                                rules.find((r) => String(r._id) === String(selectedRuleId)) || {
                                  _id: selectedRuleId,
                                };
                              handleToggleRuleCard(targetRule, next);
                            } else {
                              setRuleDraft((prev) => ({ ...prev, active: next }));
                            }
                          }}
                          label="Rule Active"
                        />
                      </Box>
                    </Box>
                  </Box>

                  {/* SECTION 1: Automation Details */}
                  <Box sx={{ ...subPanelShell, mb: 2.5 }}>
                    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
                        <StepBadge number={1} />
                        <Typography variant="subtitle1" fontWeight={800}>
                          Automation Details
                        </Typography>
                      </Box>
                      <Button
                        size="small"
                        onClick={() => setShowAdvancedFilters((v) => !v)}
                        sx={{ textTransform: "none", fontWeight: 700, fontSize: 12, color: "#6d28d9" }}
                      >
                        {showAdvancedFilters ? "Hide Country / Brand Filters" : "+ Optional Country / Brand Filters"}
                      </Button>
                    </Box>

                    <Box
                      sx={{
                        display: "grid",
                        gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
                        gap: 2,
                        alignItems: "start",
                      }}
                    >
                      <Box>
                        <Typography
                          variant="caption"
                          sx={{ display: "block", mb: 0.5, fontWeight: 700, color: "text.secondary" }}
                        >
                          Automation Name <span style={{ color: "#ef4444" }}>*</span>
                        </Typography>
                        <TextField
                          size="small"
                          fullWidth
                          placeholder="e.g. No Answer – Lead Rotation"
                          value={ruleDraft.name}
                          onChange={(e) => setRuleDraft((prev) => ({ ...prev, name: e.target.value }))}
                          sx={{ "& .MuiOutlinedInput-root": { borderRadius: "10px" } }}
                        />
                      </Box>

                      <Box>
                        <Typography
                          variant="caption"
                          sx={{ display: "block", mb: 0.5, fontWeight: 700, color: "text.secondary" }}
                        >
                          Lead List <span style={{ color: "#ef4444" }}>*</span>
                        </Typography>
                        <Box sx={{ display: "flex", gap: 1 }}>
                          <TextField
                            select
                            size="small"
                            value={ruleDraft.listMode}
                            onChange={(e) => {
                              const mode = e.target.value;
                              setRuleDraft((prev) => ({
                                ...prev,
                                listMode: mode,
                                fileNames: mode === "all" ? [] : prev.fileNames,
                              }));
                            }}
                            sx={{
                              minWidth: ruleDraft.listMode === "all" ? "100%" : 155,
                              "& .MuiOutlinedInput-root": { borderRadius: "10px" },
                            }}
                          >
                            <MenuItem value="all">
                              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                <Layers sx={{ fontSize: 18, color: "#6d28d9" }} />
                                <Typography variant="body2" fontWeight={600}>
                                  All Leads
                                </Typography>
                              </Box>
                            </MenuItem>
                            <MenuItem value="selected">Specific Lead List(s)</MenuItem>
                          </TextField>

                          {ruleDraft.listMode === "selected" && (
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <MultiSelect
                                options={listNames}
                                value={ruleDraft.fileNames}
                                onChange={(fileNames) => setRuleDraft((prev) => ({ ...prev, fileNames }))}
                                placeholder="Select one or more lists..."
                              />
                            </Box>
                          )}
                        </Box>
                      </Box>
                    </Box>

                    <Collapse in={showAdvancedFilters}>
                      <Box
                        sx={{
                          mt: 2,
                          pt: 2,
                          borderTop: "1px dashed",
                          borderColor: "divider",
                          display: "grid",
                          gridTemplateColumns: { xs: "1fr", md: "1fr 1fr 1fr" },
                          gap: 1.5,
                        }}
                      >
                        <MultiSelect
                          label="Filter by Countries (optional)"
                          options={countries}
                          value={ruleDraft.countries}
                          onChange={(next) => setRuleDraft((prev) => ({ ...prev, countries: next }))}
                          placeholder="All countries"
                        />
                        <MultiSelect
                          label="Filter by Brands (optional)"
                          options={brands}
                          value={ruleDraft.brands}
                          onChange={(next) => setRuleDraft((prev) => ({ ...prev, brands: next }))}
                          placeholder="All brands"
                        />
                        <MultiSelect
                          label="Filter by Sources (optional)"
                          options={sources}
                          value={ruleDraft.sources}
                          onChange={(next) => setRuleDraft((prev) => ({ ...prev, sources: next }))}
                          placeholder="All sources"
                        />
                      </Box>
                    </Collapse>
                  </Box>

                  {/* SECTION 2: Trigger & Status Rules */}
                  <Box sx={{ ...subPanelShell, mb: 2.5 }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, mb: 2 }}>
                      <StepBadge number={2} />
                      <Typography variant="subtitle1" fontWeight={800}>
                        Trigger & Status Rules
                      </Typography>
                    </Box>

                    <Box
                      sx={{
                        display: "grid",
                        gridTemplateColumns: { xs: "1fr", md: "1fr auto 1fr" },
                        gap: 2,
                        alignItems: "end",
                      }}
                    >
                      <Box>
                        <Typography
                          variant="caption"
                          sx={{ display: "block", mb: 0.5, fontWeight: 700, color: "text.secondary" }}
                        >
                          When a lead enters this status (From) <span style={{ color: "#ef4444" }}>*</span>
                        </Typography>
                        <TextField
                          select
                          size="small"
                          fullWidth
                          value={ruleDraft.fromStatus}
                          onChange={(e) => setRuleDraft((prev) => ({ ...prev, fromStatus: e.target.value }))}
                          sx={{ "& .MuiOutlinedInput-root": { borderRadius: "10px" } }}
                        >
                          {allStatusLabels.map((statusLabel) => (
                            <MenuItem key={statusLabel} value={statusLabel}>
                              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                <Block sx={{ fontSize: 16, color: "#6d28d9" }} />
                                <Typography variant="body2" fontWeight={600}>
                                  {statusLabel}
                                </Typography>
                              </Box>
                            </MenuItem>
                          ))}
                        </TextField>
                      </Box>

                      <Box
                        sx={{
                          display: { xs: "none", md: "flex" },
                          alignItems: "center",
                          justifyContent: "center",
                          pb: 1,
                          color: "text.secondary",
                        }}
                      >
                        <ArrowForward />
                      </Box>

                      <Box>
                        <Typography
                          variant="caption"
                          sx={{ display: "block", mb: 0.5, fontWeight: 700, color: "text.secondary" }}
                        >
                          Move to next agent and change status to (To) <span style={{ color: "#ef4444" }}>*</span>
                        </Typography>
                        <TextField
                          select
                          size="small"
                          fullWidth
                          value={ruleDraft.toStatus}
                          onChange={(e) => setRuleDraft((prev) => ({ ...prev, toStatus: e.target.value }))}
                          sx={{ "& .MuiOutlinedInput-root": { borderRadius: "10px" } }}
                        >
                          {allStatusLabels.map((statusLabel) => (
                            <MenuItem key={statusLabel} value={statusLabel}>
                              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                <AutoAwesome sx={{ fontSize: 16, color: "#6d28d9" }} />
                                <Typography variant="body2" fontWeight={600}>
                                  {statusLabel}
                                </Typography>
                              </Box>
                            </MenuItem>
                          ))}
                        </TextField>
                      </Box>
                    </Box>

                    {/* Reassign Timing / Interval */}
                    {(() => {
                      const mins = Number(ruleDraft.delayMinutes) || 0;
                      const isPreset = DELAY_PRESET_OPTIONS.some((o) => o.value >= 0 && o.value === mins);
                      const selectVal = isPreset ? mins : -1;
                      const customUnit =
                        mins > 0 && mins % 1440 === 0 ? 1440 : mins > 0 && mins % 60 === 0 ? 60 : 1;
                      const customAmount = mins > 0 ? Math.max(1, Math.round(mins / customUnit)) : 30;

                      return (
                        <Box
                          sx={{
                            mt: 2,
                            display: "grid",
                            gridTemplateColumns: {
                              xs: "1fr",
                              md: selectVal === -1 ? "1.1fr 0.9fr" : "1fr",
                            },
                            gap: 1.5,
                            alignItems: "end",
                          }}
                        >
                          <Box>
                            <Typography
                              variant="caption"
                              sx={{ display: "block", mb: 0.5, fontWeight: 700, color: "text.secondary" }}
                            >
                              New Assign Every / Reassign Timing
                            </Typography>
                            <TextField
                              select
                              size="small"
                              fullWidth
                              value={selectVal}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                if (val === -1) {
                                  if (isPreset) {
                                    setRuleDraft((prev) => ({ ...prev, delayMinutes: mins > 0 ? mins : 45 }));
                                  }
                                } else {
                                  setRuleDraft((prev) => ({ ...prev, delayMinutes: val }));
                                }
                              }}
                              sx={{ "& .MuiOutlinedInput-root": { borderRadius: "10px" } }}
                            >
                              {DELAY_PRESET_OPTIONS.map((opt) => (
                                <MenuItem key={opt.value} value={opt.value}>
                                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                    {opt.value === 0 ? (
                                      <Bolt sx={{ fontSize: 16, color: "#6d28d9" }} />
                                    ) : (
                                      <History sx={{ fontSize: 16, color: "#6d28d9" }} />
                                    )}
                                    <Typography variant="body2" fontWeight={600}>
                                      {opt.label}
                                    </Typography>
                                  </Box>
                                </MenuItem>
                              ))}
                            </TextField>
                          </Box>

                          {selectVal === -1 && (
                            <Box sx={{ display: "flex", gap: 1 }}>
                              <TextField
                                type="number"
                                size="small"
                                label="Every"
                                inputProps={{ min: 1, max: 43200 }}
                                value={customAmount}
                                onChange={(e) => {
                                  const amt = Math.max(1, Math.floor(Number(e.target.value) || 1));
                                  setRuleDraft((prev) => ({
                                    ...prev,
                                    delayMinutes: Math.min(43200, amt * customUnit),
                                  }));
                                }}
                                sx={{ width: 110, "& .MuiOutlinedInput-root": { borderRadius: "10px" } }}
                              />
                              <TextField
                                select
                                size="small"
                                label="Unit"
                                fullWidth
                                value={customUnit}
                                onChange={(e) => {
                                  const nextUnit = Number(e.target.value) || 1;
                                  setRuleDraft((prev) => ({
                                    ...prev,
                                    delayMinutes: Math.min(43200, customAmount * nextUnit),
                                  }));
                                }}
                                sx={{ "& .MuiOutlinedInput-root": { borderRadius: "10px" } }}
                              >
                                <MenuItem value={1}>Minutes</MenuItem>
                                <MenuItem value={60}>Hours</MenuItem>
                                <MenuItem value={1440}>Days</MenuItem>
                              </TextField>
                            </Box>
                          )}
                        </Box>
                      );
                    })()}

                    <Box
                      sx={{
                        mt: 2,
                        px: 1.75,
                        py: 1.1,
                        borderRadius: "10px",
                        bgcolor: "rgba(109, 40, 217, 0.06)",
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                      }}
                    >
                      <InfoOutlined sx={{ fontSize: 18, color: "#6d28d9", flexShrink: 0 }} />
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: 12.5 }}>
                        Example: When a lead enters{" "}
                        <Box component="span" fontWeight={800} color="text.primary">
                          "{ruleDraft.fromStatus || "No Answer"}"
                        </Box>
                        ,{" "}
                        {(Number(ruleDraft.delayMinutes) || 0) > 0 ? (
                          <>
                            after waiting{" "}
                            <Box component="span" fontWeight={800} color="text.primary">
                              {formatDelayLabel(ruleDraft.delayMinutes)}
                            </Box>
                            ,{" "}
                          </>
                        ) : (
                          <Box component="span" fontWeight={700} color="text.primary">
                            immediately{" "}
                          </Box>
                        )}
                        it will be assigned to the next agent in the list and its status will change to{" "}
                        <Box component="span" fontWeight={800} color="text.primary">
                          "{ruleDraft.toStatus || "New"}"
                        </Box>
                        .
                      </Typography>
                    </Box>
                  </Box>

                  {/* SECTION 3 & SECTION 4: Side-by-side Grid */}
                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: { xs: "1fr", xl: "1.15fr 0.85fr" },
                      gap: 2.5,
                      mb: 2.5,
                      alignItems: "stretch",
                    }}
                  >
                    {/* SECTION 3: Agents in Rotation */}
                    <Box sx={{ ...subPanelShell, display: "flex", flexDirection: "column" }}>
                      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 0.5 }}>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
                          <StepBadge number={3} />
                          <Typography variant="subtitle1" fontWeight={800}>
                            Agents in Rotation
                          </Typography>
                        </Box>
                        <Chip
                          size="small"
                          label={`${ruleDraft.agentIds.length} selected`}
                          sx={{
                            fontWeight: 700,
                            bgcolor: "rgba(109, 40, 217, 0.12)",
                            color: "#6d28d9",
                          }}
                        />
                      </Box>
                      <Typography variant="caption" color="text.secondary" sx={{ mb: 1.5, display: "block" }}>
                        Select the active agents for this automation and define the rotation order.
                      </Typography>

                      <Box sx={{ display: "flex", gap: 1, mb: 1.5, alignItems: "center" }}>
                        <TextField
                          size="small"
                          fullWidth
                          placeholder="Search agent..."
                          value={agentSearch}
                          onChange={(e) => setAgentSearch(e.target.value)}
                          InputProps={{
                            startAdornment: (
                              <InputAdornment position="start">
                                <Search sx={{ fontSize: 18, color: "text.secondary" }} />
                              </InputAdornment>
                            ),
                          }}
                          sx={{ "& .MuiOutlinedInput-root": { borderRadius: "10px" } }}
                        />
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() =>
                            setRuleDraft((prev) => ({
                              ...prev,
                              agentIds: rotationAgents.map((a) => String(a._id)),
                            }))
                          }
                          sx={{ textTransform: "none", fontWeight: 700, borderRadius: "8px", whiteSpace: "nowrap" }}
                        >
                          Select All
                        </Button>
                        <Button
                          size="small"
                          color="inherit"
                          onClick={() => setRuleDraft((prev) => ({ ...prev, agentIds: [] }))}
                          sx={{ textTransform: "none", fontWeight: 600, borderRadius: "8px" }}
                        >
                          Clear
                        </Button>
                      </Box>

                      <Box
                        sx={{
                          maxHeight: 330,
                          overflowY: "auto",
                          display: "grid",
                          gap: 0.75,
                          pr: 0.5,
                        }}
                      >
                        {orderedAgentList.map((agent) => {
                          const idStr = String(agent._id);
                          const selectedIndex = ruleDraft.agentIds.indexOf(idStr);
                          const isSelected = selectedIndex !== -1;
                          return (
                            <Box
                              key={idStr}
                              onClick={() => handleToggleAgentInDraft(idStr)}
                              sx={{
                                px: 1.25,
                                py: 0.85,
                                borderRadius: "10px",
                                border: "1px solid",
                                borderColor: isSelected ? "rgba(109, 40, 217, 0.35)" : "divider",
                                bgcolor: isSelected ? "rgba(109, 40, 217, 0.06)" : "background.paper",
                                display: "flex",
                                alignItems: "center",
                                gap: 1,
                                cursor: "pointer",
                                transition: "all 0.15s ease",
                                "&:hover": {
                                  borderColor: "#6d28d9",
                                },
                              }}
                            >
                              <DragIndicator sx={{ fontSize: 18, color: "text.disabled", flexShrink: 0 }} />
                              <Checkbox
                                size="small"
                                checked={isSelected}
                                onChange={() => handleToggleAgentInDraft(idStr)}
                                onClick={(e) => e.stopPropagation()}
                                sx={{
                                  p: 0.25,
                                  color: "text.disabled",
                                  "&.Mui-checked": { color: "#6d28d9" },
                                }}
                              />
                              <PersonAvatar name={agent.name} src={agent.avatar} size={30} active={isSelected} />
                              <Box sx={{ minWidth: 0, flex: 1 }}>
                                <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                                  <Typography variant="body2" fontWeight={700} noWrap>
                                    {agent.name}
                                  </Typography>
                                  {isSelected && (
                                    <Chip
                                      size="small"
                                      label={`#${selectedIndex + 1}`}
                                      sx={{
                                        height: 18,
                                        fontSize: 10,
                                        fontWeight: 800,
                                        bgcolor: "#6d28d9",
                                        color: "#fff",
                                      }}
                                    />
                                  )}
                                </Box>
                                <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
                                  {agent.role}
                                  {!agent.openCrm ? " · CRM off" : ""}
                                </Typography>
                              </Box>

                              <Typography
                                variant="caption"
                                color="text.secondary"
                                fontWeight={600}
                                sx={{ whiteSpace: "nowrap" }}
                              >
                                {agent.totalLeads || 0} active leads
                              </Typography>

                              {isSelected && (
                                <Box
                                  sx={{ display: "flex", alignItems: "center" }}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Tooltip title="Move up in rotation order">
                                    <span>
                                      <IconButton
                                        size="small"
                                        disabled={selectedIndex === 0}
                                        onClick={() => handleMoveAgentOrder(idStr, "up")}
                                        sx={{ p: 0.35 }}
                                      >
                                        <ArrowUpward sx={{ fontSize: 15 }} />
                                      </IconButton>
                                    </span>
                                  </Tooltip>
                                  <Tooltip title="Move down in rotation order">
                                    <span>
                                      <IconButton
                                        size="small"
                                        disabled={selectedIndex === ruleDraft.agentIds.length - 1}
                                        onClick={() => handleMoveAgentOrder(idStr, "down")}
                                        sx={{ p: 0.35 }}
                                      >
                                        <ArrowDownward sx={{ fontSize: 15 }} />
                                      </IconButton>
                                    </span>
                                  </Tooltip>
                                </Box>
                              )}
                            </Box>
                          );
                        })}
                      </Box>
                    </Box>

                    {/* SECTION 4: Rotation Settings */}
                    <Box sx={{ ...subPanelShell, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                      <Box>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, mb: 1.75 }}>
                          <StepBadge number={4} />
                          <Typography variant="subtitle1" fontWeight={800}>
                            Rotation Settings
                          </Typography>
                        </Box>

                        <Typography
                          variant="caption"
                          sx={{ display: "block", mb: 1, fontWeight: 700, color: "text.secondary" }}
                        >
                          Rotation Mode <span style={{ color: "#ef4444" }}>*</span>
                        </Typography>

                        <Box
                          sx={{
                            display: "grid",
                            gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                            gap: 1.25,
                            mb: 2.5,
                          }}
                        >
                          <Box
                            onClick={() => setRuleDraft((prev) => ({ ...prev, rotationMode: "sequential" }))}
                            sx={{
                              p: 1.5,
                              borderRadius: "12px",
                              border: "1.5px solid",
                              borderColor:
                                ruleDraft.rotationMode === "sequential" ? "#6d28d9" : "divider",
                              bgcolor:
                                ruleDraft.rotationMode === "sequential"
                                  ? "rgba(109, 40, 217, 0.05)"
                                  : "background.paper",
                              cursor: "pointer",
                              transition: "all 0.15s ease",
                            }}
                          >
                            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 0.5 }}>
                              <Radio
                                size="small"
                                checked={ruleDraft.rotationMode === "sequential"}
                                sx={{ p: 0, color: "#6d28d9", "&.Mui-checked": { color: "#6d28d9" } }}
                              />
                              <Typography variant="body2" fontWeight={800}>
                                Sequential (Next in List)
                              </Typography>
                            </Box>
                            <Typography variant="caption" color="text.secondary" sx={{ display: "block", pl: 3 }}>
                              Pass the lead to the next agent in the selected order.
                            </Typography>
                          </Box>

                          <Box
                            onClick={() => setRuleDraft((prev) => ({ ...prev, rotationMode: "least_assigned" }))}
                            sx={{
                              p: 1.5,
                              borderRadius: "12px",
                              border: "1.5px solid",
                              borderColor:
                                ruleDraft.rotationMode === "least_assigned" ? "#6d28d9" : "divider",
                              bgcolor:
                                ruleDraft.rotationMode === "least_assigned"
                                  ? "rgba(109, 40, 217, 0.05)"
                                  : "background.paper",
                              cursor: "pointer",
                              transition: "all 0.15s ease",
                            }}
                          >
                            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 0.5 }}>
                              <Radio
                                size="small"
                                checked={ruleDraft.rotationMode === "least_assigned"}
                                sx={{ p: 0, color: "#6d28d9", "&.Mui-checked": { color: "#6d28d9" } }}
                              />
                              <Typography variant="body2" fontWeight={800}>
                                Least Assigned
                              </Typography>
                            </Box>
                            <Typography variant="caption" color="text.secondary" sx={{ display: "block", pl: 3 }}>
                              Pass the lead to the selected agent with the fewest active leads.
                            </Typography>
                          </Box>
                        </Box>

                        {/* Recycling Limits */}
                        <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 1.25 }}>
                          Recycling Limits
                        </Typography>

                        <Box
                          sx={{
                            display: "grid",
                            gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                            gap: 1.5,
                            mb: 1.5,
                          }}
                        >
                          <Box>
                            <Tooltip title="Maximum number of times a single lead can be rotated before stopping">
                              <Typography
                                variant="caption"
                                sx={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 0.5,
                                  mb: 0.5,
                                  fontWeight: 700,
                                  color: "text.secondary",
                                }}
                              >
                                Max Agents per Lead <InfoOutlined sx={{ fontSize: 14 }} />
                              </Typography>
                            </Tooltip>
                            <TextField
                              select
                              size="small"
                              fullWidth
                              value={ruleDraft.maxAgentsPerLead}
                              onChange={(e) =>
                                setRuleDraft((prev) => ({ ...prev, maxAgentsPerLead: Number(e.target.value) }))
                              }
                              sx={{ "& .MuiOutlinedInput-root": { borderRadius: "10px" } }}
                            >
                              {MAX_AGENTS_OPTIONS.map((opt) => (
                                <MenuItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </MenuItem>
                              ))}
                            </TextField>
                          </Box>

                          <Box>
                            <Tooltip title="Status to assign once a lead has been rotated through all agents or reaches the max limit">
                              <Typography
                                variant="caption"
                                sx={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 0.5,
                                  mb: 0.5,
                                  fontWeight: 700,
                                  color: "text.secondary",
                                }}
                              >
                                After All Agents (Final Status) <InfoOutlined sx={{ fontSize: 14 }} />
                              </Typography>
                            </Tooltip>
                            <TextField
                              select
                              size="small"
                              fullWidth
                              value={ruleDraft.finalStatus}
                              onChange={(e) => setRuleDraft((prev) => ({ ...prev, finalStatus: e.target.value }))}
                              sx={{ "& .MuiOutlinedInput-root": { borderRadius: "10px" } }}
                            >
                              {[
                                ...new Set([
                                  ...FINAL_STATUS_CHOICES,
                                  ...allStatusLabels.filter((s) => s !== ruleDraft.toStatus),
                                ]),
                              ].map((statusChoice) => (
                                <MenuItem key={statusChoice} value={statusChoice}>
                                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                    <Flag sx={{ fontSize: 15, color: "text.secondary" }} />
                                    <span>
                                      {statusChoice === "keep"
                                        ? `Keep as "${ruleDraft.fromStatus}"`
                                        : statusChoice}
                                    </span>
                                  </Box>
                                </MenuItem>
                              ))}
                            </TextField>
                          </Box>
                        </Box>

                        <Box
                          onClick={() =>
                            setRuleDraft((prev) => ({ ...prev, skipPreviousAgents: !prev.skipPreviousAgents }))
                          }
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 1,
                            p: 1,
                            borderRadius: "10px",
                            bgcolor: "action.hover",
                            cursor: "pointer",
                          }}
                        >
                          <Checkbox
                            size="small"
                            checked={ruleDraft.skipPreviousAgents !== false}
                            onChange={(e) =>
                              setRuleDraft((prev) => ({ ...prev, skipPreviousAgents: e.target.checked }))
                            }
                            onClick={(e) => e.stopPropagation()}
                            sx={{ p: 0.25, "&.Mui-checked": { color: "#6d28d9" } }}
                          />
                          <Typography variant="caption" fontWeight={600} color="text.secondary">
                            Never assign a lead back to an agent who already handled it previously
                          </Typography>
                        </Box>
                      </Box>
                    </Box>
                  </Box>

                  {/* Automation Preview Bar */}
                  <Box
                    sx={{
                      p: 2,
                      borderRadius: "14px",
                      bgcolor: "rgba(109, 40, 217, 0.04)",
                      border: "1px solid",
                      borderColor: "rgba(109, 40, 217, 0.18)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: 2,
                      mb: 2.5,
                    }}
                  >
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                      <Box
                        sx={{
                          width: 36,
                          height: 36,
                          borderRadius: "10px",
                          bgcolor: "rgba(109, 40, 217, 0.12)",
                          color: "#6d28d9",
                          display: "grid",
                          placeItems: "center",
                        }}
                      >
                        <Flag sx={{ fontSize: 20 }} />
                      </Box>
                      <Box>
                        <Typography variant="subtitle2" fontWeight={800}>
                          Automation Preview
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          A quick view of how this automation will work.
                        </Typography>
                      </Box>
                    </Box>

                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, flexWrap: "wrap" }}>
                      <Chip
                        icon={<Block sx={{ fontSize: "16px !important", color: "#6d28d9 !important" }} />}
                        label={ruleDraft.fromStatus || "No Answer"}
                        sx={{
                          bgcolor: "rgba(109, 40, 217, 0.12)",
                          color: "#6d28d9",
                          fontWeight: 800,
                          px: 1,
                          height: 34,
                          borderRadius: "10px",
                        }}
                      />
                      <ArrowForward sx={{ fontSize: 18, color: "text.secondary" }} />
                      <Box
                        sx={{
                          px: 1.75,
                          py: 0.6,
                          borderRadius: "10px",
                          bgcolor: "background.paper",
                          border: "1px solid",
                          borderColor: "divider",
                          display: "flex",
                          alignItems: "center",
                          gap: 1,
                        }}
                      >
                        <PeopleOutline sx={{ fontSize: 18, color: "text.secondary" }} />
                        <Box>
                          <Typography variant="caption" fontWeight={800} sx={{ display: "block", lineHeight: 1.15 }}>
                            Next Agent
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
                            ({ruleDraft.rotationMode === "least_assigned" ? "least assigned" : "in rotation order"})
                          </Typography>
                        </Box>
                      </Box>
                      <ArrowForward sx={{ fontSize: 18, color: "text.secondary" }} />
                      <Chip
                        icon={<AutoAwesome sx={{ fontSize: "16px !important", color: "#6d28d9 !important" }} />}
                        label={ruleDraft.toStatus || "New"}
                        sx={{
                          bgcolor: "rgba(109, 40, 217, 0.12)",
                          color: "#6d28d9",
                          fontWeight: 800,
                          px: 1,
                          height: 34,
                          borderRadius: "10px",
                        }}
                      />
                    </Box>
                  </Box>

                  {/* Footer Actions */}
                  <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1.5 }}>
                    <Button
                      variant="outlined"
                      color="inherit"
                      onClick={handleDiscardDraft}
                      sx={{
                        borderRadius: "10px",
                        textTransform: "none",
                        fontWeight: 700,
                        px: 2.5,
                      }}
                    >
                      Discard
                    </Button>
                    <Button
                      variant="contained"
                      disabled={savingRule}
                      startIcon={savingRule ? <CircularProgress size={16} color="inherit" /> : <Check />}
                      onClick={handleSaveRule}
                      sx={{
                        bgcolor: "#6d28d9",
                        "&:hover": { bgcolor: "#5b21b6" },
                        borderRadius: "10px",
                        textTransform: "none",
                        fontWeight: 800,
                        px: 3,
                        boxShadow: "0 4px 12px rgba(109, 40, 217, 0.25)",
                      }}
                    >
                      {savingRule ? "Saving..." : "Save Automation"}
                    </Button>
                  </Box>
                </CardContent>
              </Card>
            </Box>
          )}

          {/* ========================================================= */}
          {/* TAB 2: AUTOMATION LOGS                                    */}
          {/* ========================================================= */}
          {activeTab === "logs" && (
            <Card elevation={0} sx={cardShell}>
              <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: 2,
                    mb: 2.5,
                  }}
                >
                  <Box>
                    <Typography variant="h6" fontWeight={800}>
                      Automation Execution Logs
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Real-time audit history of every lead rotated or marked exhausted by your rules.
                    </Typography>
                  </Box>
                  <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                    <Chip
                      label={`Total: ${logsSummary.total || 0}`}
                      sx={{ fontWeight: 700 }}
                    />
                    <Chip
                      color="success"
                      variant="outlined"
                      label={`Rotated: ${logsSummary.rotatedTotal || 0}`}
                      sx={{ fontWeight: 700 }}
                    />
                    <Chip
                      color="warning"
                      variant="outlined"
                      label={`Exhausted: ${logsSummary.exhaustedTotal || 0}`}
                      sx={{ fontWeight: 700 }}
                    />
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<Refresh />}
                      onClick={() => loadLogs(logsPage)}
                      sx={{ textTransform: "none", fontWeight: 700, borderRadius: "8px" }}
                    >
                      Refresh
                    </Button>
                    {logs.length > 0 && (
                      <Button
                        size="small"
                        color="error"
                        variant="outlined"
                        disabled={clearingLogs}
                        onClick={handleClearLogs}
                        sx={{ textTransform: "none", fontWeight: 700, borderRadius: "8px" }}
                      >
                        {clearingLogs ? "Clearing..." : "Clear Logs"}
                      </Button>
                    )}
                  </Box>
                </Box>

                {/* Log Filters */}
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: { xs: "1fr", md: "1fr 240px 180px" },
                    gap: 1.5,
                    mb: 2,
                  }}
                >
                  <TextField
                    size="small"
                    placeholder="Search by lead name, email, #leadNumber, agent, or file name..."
                    value={logSearch}
                    onChange={(e) => {
                      setLogSearch(e.target.value);
                      setLogsPage(1);
                    }}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <Search sx={{ fontSize: 18, color: "text.secondary" }} />
                        </InputAdornment>
                      ),
                    }}
                    sx={{ "& .MuiOutlinedInput-root": { borderRadius: "10px" } }}
                  />
                  <TextField
                    select
                    size="small"
                    label="Filter by Rule"
                    value={logRuleFilter}
                    onChange={(e) => {
                      setLogRuleFilter(e.target.value);
                      setLogsPage(1);
                    }}
                    sx={{ "& .MuiOutlinedInput-root": { borderRadius: "10px" } }}
                  >
                    <MenuItem value="">All Automation Rules</MenuItem>
                    {rules.map((r) => (
                      <MenuItem key={r._id} value={String(r._id)}>
                        {r.name}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    select
                    size="small"
                    label="Outcome"
                    value={logOutcomeFilter}
                    onChange={(e) => {
                      setLogOutcomeFilter(e.target.value);
                      setLogsPage(1);
                    }}
                    sx={{ "& .MuiOutlinedInput-root": { borderRadius: "10px" } }}
                  >
                    <MenuItem value="">All Outcomes</MenuItem>
                    <MenuItem value="rotated">Rotated to Next Agent</MenuItem>
                    <MenuItem value="exhausted">Exhausted (Reached Limit)</MenuItem>
                  </TextField>
                </Box>

                {logsLoading ? (
                  <Box sx={{ py: 6, textAlign: "center" }}>
                    <CircularProgress />
                  </Box>
                ) : logs.length === 0 ? (
                  <Box sx={{ py: 6, textAlign: "center" }}>
                    <Typography variant="body1" fontWeight={700} color="text.secondary">
                      No automation logs recorded yet.
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      When leads enter a trigger status (or when you click "Run on Existing Leads"), each rotation will appear here.
                    </Typography>
                  </Box>
                ) : (
                  <>
                    <TableContainer sx={{ border: "1px solid", borderColor: "divider", borderRadius: "12px" }}>
                      <Table size="small">
                        <TableHead>
                          <TableRow sx={{ bgcolor: "action.hover" }}>
                            <TableCell sx={{ fontWeight: 800 }}>Time</TableCell>
                            <TableCell sx={{ fontWeight: 800 }}>Automation Rule</TableCell>
                            <TableCell sx={{ fontWeight: 800 }}>Lead</TableCell>
                            <TableCell sx={{ fontWeight: 800 }}>Lead List</TableCell>
                            <TableCell sx={{ fontWeight: 800 }}>Agent Transition</TableCell>
                            <TableCell sx={{ fontWeight: 800 }}>Status Transition</TableCell>
                            <TableCell sx={{ fontWeight: 800 }}>Round</TableCell>
                            <TableCell sx={{ fontWeight: 800 }}>Outcome</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {logs.map((row) => (
                            <TableRow key={row._id} hover>
                              <TableCell sx={{ whiteSpace: "nowrap", fontSize: 12 }}>
                                {row.createdAt ? new Date(row.createdAt).toLocaleString() : "—"}
                              </TableCell>
                              <TableCell sx={{ fontWeight: 700 }}>{row.ruleName || "Rule"}</TableCell>
                              <TableCell>
                                <Box
                                  onClick={() => row.leadId && navigate(`/admin/dashboard/crm/leads/${row.leadId}/stream`)}
                                  sx={{
                                    cursor: row.leadId ? "pointer" : "default",
                                    "&:hover": { textDecoration: row.leadId ? "underline" : "none" },
                                  }}
                                >
                                  <Typography variant="body2" fontWeight={700} color="primary.main">
                                    {row.leadNumber ? `#${row.leadNumber} · ` : ""}
                                    {row.leadName || "Lead"}
                                  </Typography>
                                  {row.leadEmail && (
                                    <Typography variant="caption" color="text.secondary">
                                      {row.leadEmail}
                                    </Typography>
                                  )}
                                </Box>
                              </TableCell>
                              <TableCell>
                                <Typography variant="caption" fontWeight={600}>
                                  {row.fileName || "—"}
                                </Typography>
                              </TableCell>
                              <TableCell>
                                <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap" }}>
                                  <Chip size="small" label={row.fromAgent?.userName || "Unassigned"} variant="outlined" />
                                  <ArrowForward sx={{ fontSize: 14, color: "text.secondary" }} />
                                  <Chip
                                    size="small"
                                    color="primary"
                                    label={row.toAgent?.userName || "Unassigned"}
                                    sx={{ fontWeight: 700 }}
                                  />
                                </Box>
                              </TableCell>
                              <TableCell>
                                <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap" }}>
                                  <Chip size="small" label={row.fromStatus} />
                                  <ArrowForward sx={{ fontSize: 14, color: "text.secondary" }} />
                                  <Chip size="small" color="success" label={row.toStatus} sx={{ fontWeight: 700 }} />
                                </Box>
                              </TableCell>
                              <TableCell>
                                <Typography variant="caption" fontWeight={700}>
                                  {row.maxAgentsPerLead > 0
                                    ? `${row.rotationCount}/${row.maxAgentsPerLead}`
                                    : `#${row.rotationCount}`}
                                </Typography>
                              </TableCell>
                              <TableCell>
                                <Chip
                                  size="small"
                                  color={row.outcome === "rotated" ? "success" : "warning"}
                                  label={row.outcome === "rotated" ? "Rotated" : "Exhausted"}
                                  sx={{ fontWeight: 700 }}
                                />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>

                    {logsPagination.pages > 1 && (
                      <Box sx={{ display: "flex", justifyContent: "center", mt: 2.5 }}>
                        <Pagination
                          count={logsPagination.pages}
                          page={logsPage}
                          onChange={(_, p) => setLogsPage(p)}
                          color="primary"
                        />
                      </Box>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* ========================================================= */}
          {/* TAB 3: AUTO-REFILL POOL (UNASSIGNED LEADS)                */}
          {/* ========================================================= */}
          {activeTab === "pool" && (
            <Box>
              <Card elevation={0} sx={{ ...cardShell, mb: 3 }}>
                <CardContent
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 2,
                    flexWrap: "wrap",
                    py: 2.25,
                  }}
                >
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                    <Box
                      sx={{
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        bgcolor: enabled ? "success.main" : "text.disabled",
                        boxShadow: enabled ? "0 0 0 4px rgba(46, 125, 50, 0.15)" : "none",
                      }}
                    />
                    <Box>
                      <Typography fontWeight={800}>Unassigned Pool Auto-Refill</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {enabled
                          ? "On. Allowed admins automatically receive unassigned leads when they have none marked New."
                          : "Off. No unassigned pool leads are auto-refilled."}
                      </Typography>
                    </Box>
                  </Box>
                  <Toggle checked={enabled} disabled={savingGlobal} onChange={toggleGlobalPool} label="Auto-Refill" />
                </CardContent>
              </Card>

              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" },
                  gap: 2,
                  mb: 3,
                  alignItems: "start",
                }}
              >
                <Card
                  elevation={0}
                  sx={{ ...cardShell, opacity: enabled ? 1 : 0.45, pointerEvents: enabled ? "auto" : "none" }}
                >
                  <CardContent>
                    <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, alignItems: "flex-start", mb: 0.5 }}>
                      <Typography fontWeight={800}>Allow agents</Typography>
                      <Chip
                        size="small"
                        label={`${
                          admins.filter((admin) => (drafts[admin._id] || emptyAdminRules(admin)).enabled).length
                        } on`}
                        sx={{ fontWeight: 700, bgcolor: "rgba(109, 40, 217, 0.1)", color: "#6d28d9" }}
                      />
                    </Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      Turn an admin on here to automatically claim New leads from the unassigned pool.
                    </Typography>
                    <TextField
                      size="small"
                      fullWidth
                      placeholder="Search admin"
                      value={poolSearch}
                      onChange={(event) => setPoolSearch(event.target.value)}
                      sx={{ mb: 1.5, "& .MuiOutlinedInput-root": { borderRadius: "12px" } }}
                    />
                    <Box sx={{ display: "grid", gap: 1, maxHeight: 360, overflowY: "auto" }}>
                      {shownPoolAdmins.map((admin) => {
                        const on = (drafts[admin._id] || emptyAdminRules(admin)).enabled === true;
                        return (
                          <Box
                            key={admin._id}
                            onClick={() => {
                              if (savingId !== admin._id) setAgentPoolEnabled(admin, !on);
                            }}
                            sx={{
                              border: "1px solid",
                              borderColor: on ? "#6d28d9" : "divider",
                              bgcolor: on ? "rgba(109, 40, 217, 0.06)" : "background.paper",
                              borderRadius: "14px",
                              px: 1.25,
                              py: 1,
                              display: "flex",
                              alignItems: "center",
                              gap: 1.25,
                              cursor: savingId === admin._id ? "wait" : "pointer",
                            }}
                          >
                            <PersonAvatar name={admin.name} src={admin.avatar} active={on} />
                            <Box sx={{ minWidth: 0, flex: 1 }}>
                              <Typography fontWeight={700} noWrap>
                                {admin.name}
                              </Typography>
                              <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
                                {admin.role}
                                {admin.openCrm ? "" : " · CRM off"} · {admin.newLeads || 0} New
                              </Typography>
                            </Box>
                            <Toggle
                              checked={on}
                              disabled={savingId === admin._id}
                              onChange={(next) => setAgentPoolEnabled(admin, next)}
                              label={`Allow ${admin.name}`}
                            />
                          </Box>
                        );
                      })}
                    </Box>
                  </CardContent>
                </Card>

                <Card elevation={0} sx={cardShell}>
                  <CardContent>
                    <Typography fontWeight={800}>Allow these leads</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
                      Applies to every allowed admin. Leave a field empty to allow every value.
                    </Typography>
                    <Box sx={{ display: "grid", gap: 1.5 }}>
                      <MultiSelect
                        label="File names"
                        options={listNames}
                        value={allow.fileNames}
                        onChange={(fileNames) => setAllow((current) => ({ ...current, fileNames }))}
                        placeholder="Every file"
                      />
                      <MultiSelect
                        label="Countries"
                        options={countries}
                        value={allow.countries}
                        onChange={(next) => setAllow((current) => ({ ...current, countries: next }))}
                        placeholder="Every country"
                      />
                      <MultiSelect
                        label="Brands"
                        options={brands}
                        value={allow.brands}
                        onChange={(next) => setAllow((current) => ({ ...current, brands: next }))}
                        placeholder="Every brand"
                      />
                      <MultiSelect
                        label="Sources"
                        options={sources}
                        value={allow.sources}
                        onChange={(next) => setAllow((current) => ({ ...current, sources: next }))}
                        placeholder="Every source"
                      />
                    </Box>
                    <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 2 }}>
                      <Button
                        variant="contained"
                        disabled={savingAllow}
                        onClick={saveGlobalAllow}
                        sx={{
                          bgcolor: "#6d28d9",
                          borderRadius: "10px",
                          textTransform: "none",
                          fontWeight: 800,
                          px: 2.5,
                        }}
                      >
                        {savingAllow ? "Saving..." : "Save Global Leads"}
                      </Button>
                    </Box>
                  </CardContent>
                </Card>
              </Box>

              <Box sx={{ opacity: enabled ? 1 : 0.45, pointerEvents: enabled ? "auto" : "none" }}>
                {admins
                  .filter(
                    (admin) =>
                      (drafts[admin._id] || emptyAdminRules(admin)).enabled === true ||
                      String(admin._id) === focusAdminId
                  )
                  .map((admin) => {
                    const draft = drafts[admin._id] || emptyAdminRules(admin);
                    return (
                      <Card
                        key={admin._id}
                        ref={(node) => {
                          cardRefs.current[String(admin._id)] = node;
                        }}
                        elevation={0}
                        sx={{
                          ...cardShell,
                          mb: 2,
                          borderColor: highlightId === String(admin._id) ? "warning.main" : "divider",
                        }}
                      >
                        <CardContent>
                          <Box
                            sx={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: 2,
                              flexWrap: "wrap",
                              alignItems: "center",
                            }}
                          >
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, minWidth: 0 }}>
                              <PersonAvatar name={admin.name} src={admin.avatar} size={40} active />
                              <Box sx={{ minWidth: 0 }}>
                                <Typography fontWeight={800} noWrap>
                                  {admin.name}
                                </Typography>
                                <Typography variant="body2" color="text.secondary" noWrap>
                                  {admin.role}
                                  {admin.email ? ` · ${admin.email}` : ""}
                                </Typography>
                              </Box>
                            </Box>
                            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                              <Chip
                                size="small"
                                label={`${admin.newLeads || 0} New`}
                                color={admin.newLeads ? "success" : "default"}
                              />
                              <Chip size="small" variant="outlined" label={`${admin.totalLeads || 0} total`} />
                            </Box>
                          </Box>
                          <Divider sx={{ my: 2 }} />
                          <Box
                            sx={{
                              display: "grid",
                              gridTemplateColumns: { xs: "1fr", md: "200px 1fr" },
                              gap: 2,
                              alignItems: "start",
                            }}
                          >
                            <TextField
                              size="small"
                              type="number"
                              label="Maximum leads"
                              value={draft.maxLeads}
                              onChange={(event) => updateAdminDraft(admin._id, { maxLeads: event.target.value })}
                              inputProps={{ min: 1, max: 500 }}
                              helperText="When they have no New leads"
                            />
                            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.5 }}>
                              <MultiSelect
                                label="File names"
                                options={listNames}
                                value={draft.listNames}
                                onChange={(next) => updateAdminDraft(admin._id, { listNames: next })}
                                placeholder="Use global list"
                              />
                              <MultiSelect
                                label="Countries"
                                options={countries}
                                value={draft.countries}
                                onChange={(next) => updateAdminDraft(admin._id, { countries: next })}
                                placeholder="Use global list"
                              />
                              <MultiSelect
                                label="Brands"
                                options={brands}
                                value={draft.brands}
                                onChange={(next) => updateAdminDraft(admin._id, { brands: next })}
                                placeholder="Use global list"
                              />
                              <MultiSelect
                                label="Sources"
                                options={sources}
                                value={draft.sources}
                                onChange={(next) => updateAdminDraft(admin._id, { sources: next })}
                                placeholder="Use global list"
                              />
                            </Box>
                          </Box>
                          <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 2 }}>
                            <Button
                              variant="contained"
                              disabled={savingId === admin._id}
                              onClick={() => savePoolAdmin(admin)}
                              sx={{
                                bgcolor: "#6d28d9",
                                borderRadius: "10px",
                                textTransform: "none",
                                fontWeight: 800,
                                px: 2.5,
                              }}
                            >
                              {savingId === admin._id ? "Saving..." : "Save"}
                            </Button>
                          </Box>
                        </CardContent>
                      </Card>
                    );
                  })}
              </Box>
            </Box>
          )}
        </Box>
      </Box>

      {/* Rule Card Context Menu */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => {
          setMenuAnchor(null);
          setMenuRule(null);
        }}
      >
        <MenuItem onClick={() => menuRule && handleRunRuleNow(menuRule)}>
          <PlayArrow fontSize="small" sx={{ mr: 1, color: "#6d28d9" }} />
          Run Now on Existing Leads
        </MenuItem>
        <MenuItem onClick={() => menuRule && handleDuplicateRule(menuRule)}>
          <ContentCopy fontSize="small" sx={{ mr: 1 }} />
          Duplicate Rule
        </MenuItem>
        <Divider />
        <MenuItem
          onClick={() => {
            setDeleteDialogRule(menuRule);
            setMenuAnchor(null);
            setMenuRule(null);
          }}
          sx={{ color: "error.main" }}
        >
          <DeleteOutline fontSize="small" sx={{ mr: 1 }} />
          Delete Rule
        </MenuItem>
      </Menu>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={Boolean(deleteDialogRule)}
        onClose={() => !deletingRule && setDeleteDialogRule(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 800 }}>Delete Automation Rule?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            Are you sure you want to delete{" "}
            <Box component="span" fontWeight={800} color="text.primary">
              "{deleteDialogRule?.name}"
            </Box>
            ? Leads that have already been rotated will keep their current agent and status.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteDialogRule(null)} disabled={deletingRule} sx={{ textTransform: "none" }}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            disabled={deletingRule}
            onClick={handleConfirmDeleteRule}
            sx={{ textTransform: "none", fontWeight: 700, borderRadius: "8px" }}
          >
            {deletingRule ? "Deleting..." : "Delete Rule"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default LeadAutomation;
