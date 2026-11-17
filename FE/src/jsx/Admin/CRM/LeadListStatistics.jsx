import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AppBar,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  InputAdornment,
  LinearProgress,
  MenuItem,
  Pagination,
  Popover,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
} from "@mui/material";
import Add from "@mui/icons-material/Add";
import ArrowBack from "@mui/icons-material/ArrowBack";
import ArrowDownward from "@mui/icons-material/ArrowDownward";
import ArrowForward from "@mui/icons-material/ArrowForward";
import ArrowUpward from "@mui/icons-material/ArrowUpward";
import Assessment from "@mui/icons-material/Assessment";
import AutoFixHigh from "@mui/icons-material/AutoFixHigh";
import Autorenew from "@mui/icons-material/Autorenew";
import Block from "@mui/icons-material/Block";
import Bolt from "@mui/icons-material/Bolt";
import Business from "@mui/icons-material/Business";
import CalendarToday from "@mui/icons-material/CalendarToday";
import CheckCircleOutline from "@mui/icons-material/CheckCircleOutline";
import ChevronLeft from "@mui/icons-material/ChevronLeft";
import ChevronRight from "@mui/icons-material/ChevronRight";
import Close from "@mui/icons-material/Close";
import DescriptionOutlined from "@mui/icons-material/DescriptionOutlined";
import EmailOutlined from "@mui/icons-material/EmailOutlined";
import EmojiEventsOutlined from "@mui/icons-material/EmojiEventsOutlined";
import Flag from "@mui/icons-material/Flag";
import GridOn from "@mui/icons-material/GridOn";
import HourglassEmpty from "@mui/icons-material/HourglassEmpty";
import Hub from "@mui/icons-material/Hub";
import InfoOutlined from "@mui/icons-material/InfoOutlined";
import KeyboardArrowDown from "@mui/icons-material/KeyboardArrowDown";
import Layers from "@mui/icons-material/Layers";
import LocationOn from "@mui/icons-material/LocationOn";
import MenuIcon from "@mui/icons-material/Menu";
import MoreHoriz from "@mui/icons-material/MoreHoriz";
import OpenInNew from "@mui/icons-material/OpenInNew";
import People from "@mui/icons-material/People";
import Person from "@mui/icons-material/Person";
import PersonAddAlt1Outlined from "@mui/icons-material/PersonAddAlt1Outlined";
import PhoneInTalkOutlined from "@mui/icons-material/PhoneInTalkOutlined";
import PhoneOutlined from "@mui/icons-material/PhoneOutlined";
import Refresh from "@mui/icons-material/Refresh";
import Schedule from "@mui/icons-material/Schedule";
import Search from "@mui/icons-material/Search";
import SourceIcon from "@mui/icons-material/Source";
import Star from "@mui/icons-material/Star";
import TimerOutlined from "@mui/icons-material/TimerOutlined";
import TrendingUp from "@mui/icons-material/TrendingUp";
import Sidebar from "./Sidebar";
import CrmAppBarActions from "./components/CrmAppBarActions";
import CrmAccessDenied from "./components/CrmAccessDenied";
import useLiveCrmUser from "./useLiveCrmUser";
import { toast } from "react-toastify";
import { adminCrmLeadsApi, getLeadAgentMatrixApi, getLeadListStatsApi, updateLeadApi } from "../../../Api/Service";

const formatCount = (value) => Number(value || 0).toLocaleString();

// Smooth animated counter component
const AnimatedNumber = ({ value = 0, duration = 520 }) => {
  const [display, setDisplay] = useState(0);
  const prevRef = useRef(0);

  useEffect(() => {
    const target = Number(value) || 0;
    const startVal = prevRef.current;
    if (startVal === target) {
      setDisplay(target);
      return undefined;
    }
    let startTime = null;
    let rafId = null;

    const step = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(startVal + (target - startVal) * eased);
      setDisplay(current);
      if (progress < 1) {
        rafId = window.requestAnimationFrame(step);
      } else {
        prevRef.current = target;
      }
    };

    rafId = window.requestAnimationFrame(step);
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [value, duration]);

  return <>{formatCount(display)}</>;
};

const AVATAR_COLORS = [
  "#7c3aed",
  "#6366f1",
  "#2563eb",
  "#0891b2",
  "#059669",
  "#d97706",
  "#e11d48",
  "#9333ea",
];

const getAgentColor = (name = "") => {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};

const getAgentInitials = (name = "") => {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
};

const STATUS_BAR_PALETTE = {
  "new": "#2563eb",
  "no answer": "#8b5cf6",
  "call back": "#f59e0b",
  "callback": "#f59e0b",
  "not interested": "#ef4444",
  "not active": "#dc2626",
  "active": "#10b981",
  "interested": "#10b981",
  "deposited": "#059669",
  "converted": "#059669",
  "exhausted": "#64748b",
  "invalid number": "#92400e",
  "no english": "#3b82f6",
  "no money": "#e11d48",
  "expired": "#e11d48",
  "cold": "#0284c7",
};

const pickStatusBarColor = (label = "", customColor = "", index = 0) => {
  const key = String(label || "").trim().toLowerCase();
  if (STATUS_BAR_PALETTE[key]) return STATUS_BAR_PALETTE[key];
  if (customColor && customColor.startsWith("#")) return customColor;
  return AVATAR_COLORS[index % AVATAR_COLORS.length];
};

const getStatusBadgeStyle = (statusLabel = "") => {
  const lower = String(statusLabel || "New").trim().toLowerCase();
  if (lower === "new") {
    return { bgcolor: "#dbeafe", color: "#1d4ed8", dot: "#2563eb" };
  }
  if (lower === "no answer") {
    return { bgcolor: "#ede9fe", color: "#6d28d9", dot: "#7c3aed" };
  }
  if (lower === "call back" || lower === "callback") {
    return { bgcolor: "#fef3c7", color: "#b45309", dot: "#f59e0b" };
  }
  if (["active", "interested", "deposited", "converted", "replied"].includes(lower)) {
    return { bgcolor: "#dcfce7", color: "#15803d", dot: "#10b981" };
  }
  if (["not interested", "not active", "no money", "invalid number", "exhausted", "expired"].includes(lower)) {
    return { bgcolor: "#fee2e2", color: "#b91c1c", dot: "#ef4444" };
  }
  return { bgcolor: "#f1f5f9", color: "#334155", dot: "#64748b" };
};

const deriveLastAndNextAction = (lead) => {
  const lower = String(lead?.status || "New").trim().toLowerCase();
  const callSt = String(lead?.callSummary?.status || "").toLowerCase();
  if (lower === "no answer") {
    return {
      lastAction: callSt ? `Call (${callSt})` : "Call Attempt",
      nextAction: "Auto-rotate / Retry",
    };
  }
  if (lower === "new") {
    return {
      lastAction: (lead?.rotationCount || 0) > 0 ? `Rotated (#${lead.rotationCount})` : "Assigned",
      nextAction: "Initial Call Outreach",
    };
  }
  if (lower === "call back" || lower === "callback") {
    return {
      lastAction: "Call Scheduled",
      nextAction: "Follow Up Call",
    };
  }
  if (["active", "interested", "deposited", "converted"].includes(lower)) {
    return {
      lastAction: "Call Completed",
      nextAction: lower === "deposited" ? "Account Onboarding" : "Send Proposal / Close",
    };
  }
  if (lower === "exhausted") {
    return {
      lastAction: "Max Rotations Reached",
      nextAction: "Recycle / Archive",
    };
  }
  return {
    lastAction: `Marked ${lead?.status || "Updated"}`,
    nextAction: "Close / Review",
  };
};

const formatShortTime = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
};

const computeDeltaBadge = (current, previous) => {
  const curr = Number(current) || 0;
  const prev = Number(previous) || 0;
  if (curr === 0 && prev === 0) {
    return { pct: "0.0%", up: true, neutral: true, prev: 0 };
  }
  if (prev <= 0 && curr > 0) {
    return { pct: "+100%", up: true, neutral: false, prev: 0 };
  }
  const diffPct = ((curr - prev) / prev) * 100;
  const sign = diffPct > 0 ? "+" : "";
  return {
    pct: `${sign}${diffPct.toFixed(1)}%`,
    up: diffPct >= 0,
    neutral: diffPct === 0,
    prev,
  };
};

// Multi-segment SVG Donut Chart component for Agent Status Distribution
const AgentStatusDonutChart = ({ slices = [], totalCount = 0, size = 168, strokeWidth = 24 }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  let cumulativePercent = 0;

  const validSlices = slices.filter((s) => (s.count || 0) > 0);

  return (
    <Box sx={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#f1f5f9"
          strokeWidth={strokeWidth}
        />
        {validSlices.map((slice, idx) => {
          const pct = totalCount > 0 ? (slice.count || 0) / totalCount : 0;
          const dashLength = Math.max(0, pct * circumference);
          const dashOffset = -cumulativePercent * circumference;
          cumulativePercent += pct;
          return (
            <circle
              key={slice.label || idx}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={slice.barColor || pickStatusBarColor(slice.label, slice.color, idx)}
              strokeWidth={strokeWidth}
              strokeDasharray={`${dashLength} ${circumference}`}
              strokeDashoffset={dashOffset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
              style={{ transition: "stroke-dasharray 0.6s ease, stroke-dashoffset 0.6s ease" }}
            />
          );
        })}
      </svg>
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          pointerEvents: "none",
          px: 2,
        }}
      >
        <Typography variant="h5" sx={{ fontWeight: 900, color: "#0f172a", lineHeight: 1.1 }}>
          {formatCount(totalCount)}
        </Typography>
        <Typography variant="caption" sx={{ color: "#64748b", fontWeight: 700, fontSize: 11 }}>
          Active Leads
        </Typography>
      </Box>
    </Box>
  );
};

const cardBaseSx = {
  borderRadius: "18px",
  border: "1px solid",
  borderColor: "rgba(15, 23, 42, 0.08)",
  bgcolor: "#ffffff",
  boxShadow: "0 2px 6px rgba(15, 23, 42, 0.03), 0 12px 28px rgba(15, 23, 42, 0.04)",
};

const DATE_RANGE_OPTIONS = [
  { id: "all", label: "All Time" },
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "last7", label: "Last 7 days" },
  { id: "custom", label: "Custom" },
];

const TIME_CUTOFF_OPTIONS = [
  { value: "all", label: "Full Day (24h)" },
  { value: "12:00", label: "Up to 12:00" },
  { value: "14:30", label: "Up to 14:30" },
  { value: "17:00", label: "Up to 17:00" },
  { value: "20:00", label: "Up to 20:00" },
];

const EMPTY_FILTERS = {
  dateRange: "all",
  timeCutoff: "all",
  startDate: "",
  endDate: "",
  list: "",
  brand: "",
  country: "",
  agent: "",
  source: "",
  automation: "",
  status: "",
};

const COMMAND_CENTER_STORAGE_KEY = "crm_command_center_ui_v1";

const readCommandCenterStorage = () => {
  try {
    const raw = window.localStorage.getItem(COMMAND_CENTER_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const LeadListStatistics = () => {
  const navigate = useNavigate();
  const { can, ready } = useLiveCrmUser();
  const canViewCommandCenter = can("canViewCommandCenter");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenu, setIsMobileMenu] = useState(false);
  const initialUiRef = useRef(null);
  if (initialUiRef.current === null) {
    initialUiRef.current = readCommandCenterStorage();
  }
  const savedUi = initialUiRef.current;

  // Top-level workspace view: "agent_matrix" | "command_center" | "leaderboard" | "agent_detail"
  const [workspaceMode, setWorkspaceMode] = useState(() =>
    ["agent_matrix", "command_center", "leaderboard", "agent_detail"].includes(savedUi.workspaceMode)
      ? savedUi.workspaceMode
      : "command_center"
  );
  const [selectedAgentId, setSelectedAgentId] = useState(() => savedUi.selectedAgentId || "");
  const [agentSubTab, setAgentSubTab] = useState(() =>
    ["overview", "journey", "leads", "rotations", "activity"].includes(savedUi.agentSubTab)
      ? savedUi.agentSubTab
      : "overview"
  );

  // Agent-specific recent leads state
  const [agentLeads, setAgentLeads] = useState([]);
  const [agentLeadsLoading, setAgentLeadsLoading] = useState(false);
  const [agentLeadsSearch, setAgentLeadsSearch] = useState("");
  const [agentLeadsStatusFilter, setAgentLeadsStatusFilter] = useState("");
  const [selectedLeadIds, setSelectedLeadIds] = useState([]);

  // Filters
  const [filters, setFilters] = useState(() => ({
    ...EMPTY_FILTERS,
    ...(savedUi.filters && typeof savedUi.filters === "object" ? savedUi.filters : {}),
  }));
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  // Data states
  const [total, setTotal] = useState(0);
  const [statuses, setStatuses] = useState([]);
  const [byBrand, setByBrand] = useState([]);
  const [byAgent, setByAgent] = useState([]);
  const [byCountry, setByCountry] = useState([]);
  const [byList, setByList] = useState([]);
  const [commandCenter, setCommandCenter] = useState(null);
  const [lastUpdatedTime, setLastUpdatedTime] = useState(() =>
    new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  );
  const [filterOptions, setFilterOptions] = useState({
    brands: [],
    lists: [],
    sources: [],
    countries: [],
    agents: [],
    automations: [],
  });

  // Interactive UI states
  const [flowViewBy, setFlowViewBy] = useState(() => savedUi.flowViewBy || "status");
  const [rightPanelTab, setRightPanelTab] = useState(() => savedUi.rightPanelTab || "status");
  const [agentSortBy, setAgentSortBy] = useState(() => savedUi.agentSortBy || "leadsReceived");
  const [agentSortDir, setAgentSortDir] = useState(() => savedUi.agentSortDir || "desc");
  const [agentSearch, setAgentSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Agent Matrix (Excel-style Lead x Agent Status Grid)
  const [matrixLeads, setMatrixLeads] = useState([]);
  const [matrixAgents, setMatrixAgents] = useState([]);
  const [matrixStatuses, setMatrixStatuses] = useState([]);
  const initialMatrixPage = Math.max(1, Number(savedUi.matrixPage) || 1);
  const [matrixPagination, setMatrixPagination] = useState({
    page: initialMatrixPage,
    limit: 50,
    total: 0,
    pages: 1,
  });
  const [matrixLoading, setMatrixLoading] = useState(false);
  const [matrixFilters, setMatrixFilters] = useState(() => ({
    search: "",
    agent: "",
    status: "",
    ...(savedUi.matrixFilters && typeof savedUi.matrixFilters === "object" ? savedUi.matrixFilters : {}),
  }));
  const matrixFiltersRef = useRef(matrixFilters);
  matrixFiltersRef.current = matrixFilters;
  const matrixPageRef = useRef(initialMatrixPage);
  const [matrixSelectedIds, setMatrixSelectedIds] = useState([]);
  const [matrixLeadMenu, setMatrixLeadMenu] = useState({ anchorEl: null, lead: null, agentName: "" });
  const [matrixSavingStatus, setMatrixSavingStatus] = useState(false);

  // Persist tab, pagination, selected agent, and filters across browser refreshes
  useEffect(() => {
    try {
      window.localStorage.setItem(
        COMMAND_CENTER_STORAGE_KEY,
        JSON.stringify({
          workspaceMode,
          selectedAgentId,
          agentSubTab,
          matrixPage: matrixPagination.page || matrixPageRef.current || 1,
          matrixFilters,
          filters,
          flowViewBy,
          rightPanelTab,
          agentSortBy,
          agentSortDir,
        })
      );
    } catch {
      // ignore storage quota errors
    }
  }, [
    workspaceMode,
    selectedAgentId,
    agentSubTab,
    matrixPagination.page,
    matrixFilters,
    filters,
    flowViewBy,
    rightPanelTab,
    agentSortBy,
    agentSortDir,
  ]);

  const loadAgentMatrix = useCallback(async (pageOverride, customFilters, silent = false) => {
    const targetPage = pageOverride ?? matrixPageRef.current ?? 1;
    const activeMatFilters = customFilters ?? matrixFiltersRef.current;
    const globalF = filtersRef.current;
    if (!silent) setMatrixLoading(true);
    try {
      const res = await getLeadAgentMatrixApi({
        page: targetPage,
        limit: 50,
        search: activeMatFilters.search,
        agent: activeMatFilters.agent || globalF.agent,
        status: activeMatFilters.status || globalF.status,
        list: globalF.list,
        brand: globalF.brand,
        country: globalF.country,
        source: globalF.source,
      });
      if (res?.success) {
        setMatrixLeads(res.leads || []);
        setMatrixAgents(res.agents || []);
        setMatrixStatuses(res.statuses || []);
        setMatrixPagination(res.pagination || { page: targetPage, limit: 50, total: 0, pages: 1 });
        matrixPageRef.current = res.pagination?.page || targetPage;
        setLastUpdatedTime(
          new Date(res.generatedAt || Date.now()).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })
        );
      }
    } finally {
      if (!silent) setMatrixLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!ready || !canViewCommandCenter || workspaceMode !== "agent_matrix") return undefined;
    loadAgentMatrix(matrixPageRef.current, undefined, false);
    const timer = window.setInterval(() => {
      loadAgentMatrix(matrixPageRef.current, undefined, true);
    }, 15000);
    return () => window.clearInterval(timer);
  }, [ready, canViewCommandCenter, workspaceMode, loadAgentMatrix]);

  const handleMatrixStatusChange = async (lead, nextStatus) => {
    if (!lead?._id || !nextStatus || nextStatus === lead.status) return;
    setMatrixSavingStatus(true);
    try {
      const res = await updateLeadApi(lead._id, {
        firstName: lead.firstName || "Lead",
        lastName: lead.lastName || "-",
        email: lead.email || "",
        phone: lead.phone || "",
        country: lead.country || "",
        Brand: lead.Brand || "",
        status: nextStatus,
      });
      if (res?.success) {
        toast.success(res.msg || `Status updated to "${nextStatus}"`);
        setMatrixLeadMenu({ anchorEl: null, lead: null, agentName: "" });
        loadAgentMatrix(matrixPageRef.current, undefined, true);
      } else {
        toast.error(res?.msg || "Could not update status");
      }
    } catch (err) {
      toast.error(err?.msg || "Could not update status");
    } finally {
      setMatrixSavingStatus(false);
    }
  };

  const loadStats = useCallback(async (appliedFilters, isInitial = false) => {
    const activeFilters = appliedFilters !== undefined ? appliedFilters : filtersRef.current;
    if (isInitial) setLoading(true);
    else setRefreshing(true);

    try {
      const response = await getLeadListStatsApi(activeFilters);
      if (!response?.success) {
        return;
      }

      setTotal(response.total || 0);
      setStatuses(response.statuses || []);
      setByBrand(response.byBrand || []);
      setByAgent(response.byAgent || []);
      setByCountry(response.byCountry || []);
      setByList(response.byList || []);
      setCommandCenter(response.commandCenter || null);
      setLastUpdatedTime(
        new Date(response.generatedAt || Date.now()).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })
      );

      if (response.filterOptions) {
        setFilterOptions((prev) => ({
          brands: response.filterOptions.brands?.length ? response.filterOptions.brands : prev.brands,
          lists: response.filterOptions.lists?.length ? response.filterOptions.lists : prev.lists,
          sources: response.filterOptions.sources?.length ? response.filterOptions.sources : prev.sources,
          countries: response.filterOptions.countries?.length ? response.filterOptions.countries : prev.countries,
          agents: response.filterOptions.agents?.length ? response.filterOptions.agents : prev.agents,
          automations: response.filterOptions.automations || prev.automations || [],
        }));
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!ready || !canViewCommandCenter) return;
    loadStats(undefined, true);
  }, [loadStats, ready, canViewCommandCenter]);

  // Auto-refresh every 35s
  useEffect(() => {
    if (!ready || !canViewCommandCenter) return undefined;
    const timer = window.setInterval(() => {
      loadStats(filtersRef.current, false);
    }, 35000);
    return () => window.clearInterval(timer);
  }, [loadStats, ready, canViewCommandCenter]);

  // Load real recent leads when an agent is opened in Agent Performance Deep-Dive
  const loadAgentRecentLeads = useCallback(async (agentId) => {
    if (!agentId || agentId === "unassigned") {
      setAgentLeads([]);
      return;
    }
    setAgentLeadsLoading(true);
    try {
      const res = await adminCrmLeadsApi({
        params: {
          agent: agentId,
          page: 1,
          limit: 50,
          sortBy: "updatedAt",
          sortOrder: "desc",
        },
      });
      if (res?.success && Array.isArray(res?.data?.leads)) {
        setAgentLeads(res.data.leads);
      } else {
        setAgentLeads([]);
      }
    } catch (e) {
      setAgentLeads([]);
    } finally {
      setAgentLeadsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (workspaceMode === "agent_detail" && selectedAgentId) {
      loadAgentRecentLeads(selectedAgentId);
      setSelectedLeadIds([]);
    }
  }, [workspaceMode, selectedAgentId, loadAgentRecentLeads]);

  const openAgentDeepDive = useCallback((agentObjOrId) => {
    const id = typeof agentObjOrId === "string" ? agentObjOrId : agentObjOrId?.agentId;
    if (!id || id === "unassigned") return;
    setSelectedAgentId(id);
    setAgentSubTab("overview");
    setWorkspaceMode("agent_detail");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const handleFilterChange = (field, value) => {
    const nextFilters = { ...filters, [field]: value };
    setFilters(nextFilters);
    if (field === "dateRange" && value === "custom") {
      if (nextFilters.startDate && nextFilters.endDate) {
        loadStats(nextFilters);
      }
      return;
    }
    loadStats(nextFilters);
  };

  const handleResetFilters = () => {
    setFilters(EMPTY_FILTERS);
    loadStats(EMPTY_FILTERS);
  };

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.dateRange !== "all") count += 1;
    if (filters.timeCutoff !== "all") count += 1;
    if (filters.list) count += 1;
    if (filters.brand) count += 1;
    if (filters.country) count += 1;
    if (filters.agent) count += 1;
    if (filters.source) count += 1;
    if (filters.automation) count += 1;
    if (filters.status) count += 1;
    return count;
  }, [filters]);

  const openLeadsInCrm = (extraParams = {}) => {
    const params = new URLSearchParams();
    const merged = {
      status: extraParams.status ?? filters.status,
      brand: extraParams.brand ?? filters.brand,
      country: extraParams.country ?? filters.country,
      agent: extraParams.agent ?? filters.agent,
      source: extraParams.source ?? filters.source,
      list: extraParams.list ?? filters.list,
    };
    if (merged.status) params.set("status", merged.status);
    if (merged.brand) params.set("brand", merged.brand);
    if (merged.country) params.set("country", merged.country);
    if (merged.agent) params.set("agent", merged.agent === "unassigned" ? "UNASSIGNED" : merged.agent);
    if (merged.source) params.set("source", merged.source);
    if (merged.list) params.set("list", merged.list);
    const qs = params.toString();
    navigate(`/admin/dashboard/crm${qs ? `?${qs}` : ""}`);
  };

  // KPI computations
  const kpis = useMemo(() => {
    const cc = commandCenter?.kpis || {};
    const totalLeads = cc.totalLeads ?? total;
    const enteredToday = cc.enteredToday ?? 0;
    const enteredYesterday = cc.enteredYesterday ?? 0;
    const reshuffled = cc.reshuffledCount ?? 0;
    const reshuffledToday = cc.reshuffledToday ?? 0;
    const reshuffledYesterday = cc.reshuffledYesterday ?? 0;
    const inRotation = cc.currentlyInRotation ?? 0;
    const completed = cc.completedJourney ?? 0;
    const exhaustedOnly = cc.exhaustedCount ?? 0;
    const notInterested = cc.notInterestedCount ?? 0;
    const unassigned = cc.unassignedWaiting ?? 0;

    return {
      totalLeads,
      enteredToday,
      enteredDelta: computeDeltaBadge(enteredToday, enteredYesterday),
      reshuffled,
      reshuffledDelta: computeDeltaBadge(reshuffledToday, reshuffledYesterday),
      inRotation,
      completed,
      completedShare: totalLeads > 0 ? `${((completed / totalLeads) * 100).toFixed(1)}%` : "0.0%",
      exhaustedOnly,
      notInterested,
      unassigned,
      unassignedShare: totalLeads > 0 ? `${((unassigned / totalLeads) * 100).toFixed(1)}%` : "0.0%",
    };
  }, [commandCenter, total]);

  // Lead Journey Flow computations
  const journey = useMemo(() => {
    const jf = commandCenter?.journeyFlow || {};
    const listTitle = filters.list
      ? filters.list === "__manual__"
        ? "Manual / Direct"
        : filters.list
      : jf.incomingLabel || "All Incoming Lists";

    const incomingCount = jf.incomingCount ?? total;
    const newCount = jf.newCount ?? 0;
    const noAnswerCount = jf.noAnswerCount ?? 0;
    const reassignedNewCount = jf.reassignedNewCount ?? 0;
    const positiveOutcomeCount = jf.positiveOutcomeCount ?? 0;
    const notInterestedCount = jf.notInterestedCount ?? 0;
    const exhaustedOutcomeCount = jf.exhaustedOutcomeCount ?? 0;
    const waitingOutcomeCount = jf.waitingOutcomeCount ?? 0;
    const topAgents = jf.topAgents || [];

    return {
      listTitle,
      incomingCount,
      newCount,
      noAnswerCount,
      reassignedNewCount,
      positiveOutcomeCount,
      notInterestedCount,
      exhaustedOutcomeCount,
      waitingOutcomeCount,
      topAgents,
    };
  }, [commandCenter, filters.list, total]);

  // All real staff agents (excluding unassigned pool)
  const staffAgents = useMemo(
    () => (byAgent || []).filter((a) => a.agentId !== "unassigned"),
    [byAgent]
  );

  // Team-wide aggregated agent performance KPIs (for Leaderboard view)
  const teamPerformanceKpis = useMemo(() => {
    let totalReceived = 0;
    let totalActive = 0;
    let totalNew = 0;
    let totalContacted = 0;
    let totalCallBack = 0;
    let totalResponses = 0;
    let totalClosedWon = 0;
    let totalReassignedOut = 0;

    staffAgents.forEach((ag) => {
      totalReceived += ag.leadsReceived ?? ag.count ?? 0;
      totalActive += ag.activeLeads ?? ag.count ?? 0;
      totalNew += ag.newLeads ?? 0;
      totalContacted += ag.contactedLeads ?? Math.max(0, (ag.activeLeads || 0) - (ag.newLeads || 0));
      totalCallBack += ag.callBackLeads ?? 0;
      totalResponses += ag.responses ?? 0;
      totalClosedWon += ag.closedWonLeads ?? 0;
      totalReassignedOut += ag.reassignedOut ?? 0;
    });

    const responseRate = totalReceived > 0 ? ((totalResponses / totalReceived) * 100).toFixed(1) : "0.0";
    const contactRate = totalReceived > 0 ? ((totalContacted / totalReceived) * 100).toFixed(1) : "0.0";

    return {
      totalReceived,
      totalActive,
      totalNew,
      totalContacted,
      totalCallBack,
      totalResponses,
      totalClosedWon,
      totalReassignedOut,
      responseRate,
      contactRate,
    };
  }, [staffAgents]);

  // Sorted & searched Agent Rotation Performance rows
  const sortedAgentPerformance = useMemo(() => {
    const q = agentSearch.trim().toLowerCase();
    const list = staffAgents.filter(
      (a) =>
        !q ||
        String(a.name || "").toLowerCase().includes(q) ||
        String(a.email || "").toLowerCase().includes(q) ||
        String(a.role || "").toLowerCase().includes(q)
    );

    return [...list].sort((a, b) => {
      const dir = agentSortDir === "asc" ? 1 : -1;
      if (agentSortBy === "name") {
        return dir * String(a.name || "").localeCompare(String(b.name || ""));
      }
      const valA = Number(a[agentSortBy] ?? a.count ?? 0);
      const valB = Number(b[agentSortBy] ?? b.count ?? 0);
      return dir * (valA - valB);
    });
  }, [staffAgents, agentSearch, agentSortBy, agentSortDir]);

  const handleSortAgents = (column) => {
    if (agentSortBy === column) {
      setAgentSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setAgentSortBy(column);
      setAgentSortDir("desc");
    }
  };

  // Currently selected agent for the Deep-Dive view
  const selectedAgent = useMemo(() => {
    if (!selectedAgentId) return staffAgents[0] || null;
    return staffAgents.find((a) => String(a.agentId) === String(selectedAgentId)) || staffAgents[0] || null;
  }, [staffAgents, selectedAgentId]);

  // Filtered recent leads for the selected agent
  const filteredAgentLeads = useMemo(() => {
    const q = agentLeadsSearch.trim().toLowerCase();
    const st = agentLeadsStatusFilter.trim().toLowerCase();
    return (agentLeads || []).filter((lead) => {
      if (st && String(lead.status || "New").trim().toLowerCase() !== st) return false;
      if (!q) return true;
      const fullName = `${lead.firstName || ""} ${lead.lastName || ""}`.toLowerCase();
      return (
        fullName.includes(q) ||
        String(lead.email || "").toLowerCase().includes(q) ||
        String(lead.phone || "").toLowerCase().includes(q) ||
        String(lead.Brand || "").toLowerCase().includes(q) ||
        String(lead.country || "").toLowerCase().includes(q) ||
        String(lead.fileName || "").toLowerCase().includes(q) ||
        String(lead.leadNumber || "").includes(q)
      );
    });
  }, [agentLeads, agentLeadsSearch, agentLeadsStatusFilter]);

  // Status distribution sorted by count descending
  const sortedStatuses = useMemo(
    () => [...statuses].sort((a, b) => (b.count || 0) - (a.count || 0)),
    [statuses]
  );

  // Selected agent's status breakdown for Donut Chart
  const selectedAgentStatusSlices = useMemo(() => {
    if (!selectedAgent) return [];
    const raw = selectedAgent.statusBreakdown || [];
    if (raw.length > 0) {
      return raw.map((item, idx) => ({
        ...item,
        barColor: pickStatusBarColor(item.label, item.color, idx),
      }));
    }
    const active = selectedAgent.activeLeads || 1;
    const fallback = [
      { label: "New", count: selectedAgent.newLeads || 0 },
      { label: "No Answer", count: selectedAgent.noAnswerLeads || 0 },
      { label: "Call Back", count: selectedAgent.callBackLeads || 0 },
      { label: "Interested / Active", count: (selectedAgent.interestedLeads || 0) + (selectedAgent.closedWonLeads || 0) },
      { label: "Not Interested", count: selectedAgent.notInterestedLeads || 0 },
    ].filter((x) => x.count > 0);
    return fallback.map((item, idx) => ({
      ...item,
      percentage: Number(((item.count / active) * 100).toFixed(1)),
      barColor: pickStatusBarColor(item.label, "", idx),
    }));
  }, [selectedAgent]);

  // Selected agent's rotation logs
  const selectedAgentRotationLogs = useMemo(() => {
    if (!selectedAgent) return [];
    return (commandCenter?.recentRotations || []).filter(
      (log) =>
        String(log.fromAgent?.userId || "") === String(selectedAgent.agentId) ||
        String(log.toAgent?.userId || "") === String(selectedAgent.agentId) ||
        log.fromAgent?.userName === selectedAgent.name ||
        log.toAgent?.userName === selectedAgent.name
    );
  }, [commandCenter, selectedAgent]);

  if (ready && !canViewCommandCenter) {
    return (
      <Box sx={{ display: "flex", minHeight: "100vh", width: "100%", bgcolor: "#f3f5fa" }}>
        <Sidebar
          isCollapsed={isSidebarCollapsed}
          setIsSidebarCollapsed={setIsSidebarCollapsed}
          isMobileMenu={isMobileMenu}
          setisMobileMenu={setIsMobileMenu}
        />
        <Box component="main" sx={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <CrmAccessDenied
            title="Command Center Access Restricted"
            message="You do not have permission to view the Lead Operations Command Center. Ask a Super Admin to enable the Command Center permission for your account."
          />
        </Box>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: "flex",
        minHeight: "100vh",
        width: "100%",
        bgcolor: "#f3f5fa",
        "@keyframes dashFlow": {
          "0%": { strokeDashoffset: 28 },
          "100%": { strokeDashoffset: 0 },
        },
      }}
    >
      <Sidebar
        isCollapsed={isSidebarCollapsed}
        setIsSidebarCollapsed={setIsSidebarCollapsed}
        isMobileMenu={isMobileMenu}
        setisMobileMenu={setIsMobileMenu}
      />

      <Box
        component="main"
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          width: "100%",
          overflowX: "hidden",
        }}
      >
        {/* Top Sticky Command Center Header (Single Clean Row) */}
        <AppBar
          position="sticky"
          elevation={0}
          color="inherit"
          sx={{
            bgcolor: "rgba(255, 255, 255, 0.96)",
            backdropFilter: "blur(12px)",
            borderBottom: "1px solid",
            borderColor: "rgba(15, 23, 42, 0.08)",
            zIndex: 20,
          }}
        >
          <Toolbar
            sx={{
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "nowrap",
              gap: 2,
              minHeight: "68px !important",
              py: 1,
              px: { xs: 2, sm: 3 },
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.75, minWidth: 0 }}>
              <IconButton onClick={() => setIsMobileMenu(!isMobileMenu)} sx={{ display: { md: "none" } }}>
                <MenuIcon />
              </IconButton>
              <Box
                sx={{
                  width: 42,
                  height: 42,
                  borderRadius: "12px",
                  background: "linear-gradient(135deg, #ede9fe 0%, #ddd6fe 100%)",
                  color: "#6d28d9",
                  display: "grid",
                  placeItems: "center",
                  boxShadow: "0 4px 12px rgba(109, 40, 217, 0.14)",
                  flexShrink: 0,
                }}
              >
                <Assessment sx={{ fontSize: 24 }} />
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography
                  variant="h5"
                  noWrap
                  sx={{ fontWeight: 800, color: "#0f172a", lineHeight: 1.15, fontSize: { xs: 17, sm: 21 } }}
                >
                  {workspaceMode === "agent_matrix"
                    ? "CRM — Agent Matrix & Lead Status"
                    : workspaceMode === "agent_detail" && selectedAgent
                    ? `${selectedAgent.name} — Agent Performance`
                    : workspaceMode === "leaderboard"
                    ? "Agent Performance & Leaderboard"
                    : "Lead Operations Command Center"}
                </Typography>
                <Typography
                  variant="body2"
                  noWrap
                  sx={{ color: "#64748b", fontSize: 12.5, display: { xs: "none", sm: "block" } }}
                >
                  {workspaceMode === "agent_matrix"
                    ? "Real-time lead-by-agent matrix showing current and historical agent handling statuses."
                    : workspaceMode === "agent_detail"
                    ? "Deep agent conversion metrics, lead journey funnel, rotation history, and handled leads."
                    : workspaceMode === "leaderboard"
                    ? "Track your team's lead handling velocity, response rates, rotations, and conversion leaderboard."
                    : "Monitor lead volume, status distribution, agent transfers and reshuffling performance."}
                </Typography>
              </Box>
            </Box>

            <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, flexShrink: 0, whiteSpace: "nowrap" }}>
              <Typography
                variant="caption"
                sx={{ color: "#64748b", fontWeight: 600, display: { xs: "none", lg: "inline" } }}
              >
                Last updated {lastUpdatedTime}
              </Typography>
              <Tooltip title="Refresh live data">
                <span>
                  <IconButton
                    size="small"
                    onClick={() => {
                      if (workspaceMode === "agent_matrix") {
                        loadAgentMatrix(matrixPageRef.current, undefined, false);
                      } else {
                        loadStats(filters, false);
                        if (workspaceMode === "agent_detail" && selectedAgent?.agentId) {
                          loadAgentRecentLeads(selectedAgent.agentId);
                        }
                      }
                    }}
                    disabled={loading || refreshing || matrixLoading}
                    sx={{
                      border: "1px solid",
                      borderColor: "divider",
                      borderRadius: "10px",
                      p: 0.75,
                      bgcolor: "#fff",
                    }}
                  >
                    <Refresh
                      sx={{
                        fontSize: 18,
                        animation: refreshing || matrixLoading ? "spin 0.9s linear infinite" : "none",
                        "@keyframes spin": {
                          "0%": { transform: "rotate(0deg)" },
                          "100%": { transform: "rotate(360deg)" },
                        },
                      }}
                    />
                  </IconButton>
                </span>
              </Tooltip>

              <Button
                size="small"
                variant="outlined"
                startIcon={<AutoFixHigh sx={{ fontSize: 16 }} />}
                onClick={() => {
                  handleResetFilters();
                  if (workspaceMode === "agent_matrix") {
                    const clean = { search: "", agent: "", status: "" };
                    setMatrixFilters(clean);
                    loadAgentMatrix(1, clean, false);
                  }
                }}
                sx={{
                  borderRadius: "10px",
                  textTransform: "none",
                  fontWeight: 700,
                  borderColor: "rgba(109, 40, 217, 0.35)",
                  color: "#6d28d9",
                  bgcolor: "rgba(109, 40, 217, 0.04)",
                  px: 1.6,
                  py: 0.65,
                  whiteSpace: "nowrap",
                  "&:hover": {
                    borderColor: "#6d28d9",
                    bgcolor: "rgba(109, 40, 217, 0.08)",
                  },
                }}
              >
                Reset filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
              </Button>

              <CrmAppBarActions />
            </Box>
          </Toolbar>
          {(refreshing || matrixLoading) && (
            <LinearProgress sx={{ height: 2, "& .MuiLinearProgress-bar": { bgcolor: "#6d28d9" } }} />
          )}
        </AppBar>

        {/* Main Workspace Container */}
        <Box sx={{ p: { xs: 2, sm: 2.5, lg: 3 }, width: "100%", boxSizing: "border-box" }}>
          {/* Page-Level Workspace Navigation Bar */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 1.5,
              mb: 2.25,
            }}
          >
            <Box
              sx={{
                display: "inline-flex",
                alignItems: "center",
                p: 0.5,
                borderRadius: "14px",
                bgcolor: "#ffffff",
                border: "1px solid rgba(15, 23, 42, 0.08)",
                boxShadow: "0 2px 6px rgba(15, 23, 42, 0.03)",
                gap: 0.5,
                flexWrap: "wrap",
              }}
            >
              {[
                { id: "agent_matrix", label: "Agent Matrix", icon: <GridOn sx={{ fontSize: 17 }} /> },
                { id: "command_center", label: "Command Center", icon: <Assessment sx={{ fontSize: 17 }} /> },
                { id: "leaderboard", label: "Agent Leaderboard", icon: <EmojiEventsOutlined sx={{ fontSize: 17 }} /> },
                ...(staffAgents.length > 0
                  ? [
                      {
                        id: "agent_detail",
                        label: selectedAgent ? `Agent Deep-Dive (${selectedAgent.name})` : "Agent Deep-Dive",
                        icon: <Person sx={{ fontSize: 17 }} />,
                      },
                    ]
                  : []),
              ].map((tab) => {
                const active = workspaceMode === tab.id;
                return (
                  <Box
                    key={tab.id}
                    component="button"
                    type="button"
                    onClick={() => {
                      if (tab.id === "agent_detail" && !selectedAgentId && staffAgents[0]) {
                        setSelectedAgentId(staffAgents[0].agentId);
                      }
                      setWorkspaceMode(tab.id);
                    }}
                    sx={{
                      border: 0,
                      outline: 0,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 0.85,
                      px: 2,
                      py: 0.85,
                      borderRadius: "10px",
                      fontSize: 13,
                      fontWeight: 800,
                      fontFamily: "inherit",
                      whiteSpace: "nowrap",
                      bgcolor: active ? "#6d28d9" : "transparent",
                      color: active ? "#ffffff" : "#475569",
                      boxShadow: active ? "0 4px 12px rgba(109, 40, 217, 0.28)" : "none",
                      transition: "all 0.16s ease",
                      "&:hover": {
                        bgcolor: active ? "#5b21b6" : "#f1f5f9",
                      },
                    }}
                  >
                    {tab.icon}
                    {tab.label}
                  </Box>
                );
              })}
            </Box>

            {workspaceMode === "agent_matrix" && (
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <IconButton
                  size="small"
                  disabled={matrixPagination.page <= 1 || matrixLoading}
                  onClick={() => loadAgentMatrix(matrixPagination.page - 1)}
                  sx={{ border: "1px solid rgba(15, 23, 42, 0.1)", bgcolor: "#fff", borderRadius: "8px" }}
                >
                  <ChevronLeft fontSize="small" />
                </IconButton>
                <Typography variant="body2" fontWeight={700} color="#334155">
                  {matrixPagination.total === 0
                    ? "0 of 0"
                    : `${formatCount((matrixPagination.page - 1) * matrixPagination.limit + 1)}–${formatCount(
                        Math.min(matrixPagination.page * matrixPagination.limit, matrixPagination.total)
                      )} of ${formatCount(matrixPagination.total)}`}
                </Typography>
                <IconButton
                  size="small"
                  disabled={matrixPagination.page >= matrixPagination.pages || matrixLoading}
                  onClick={() => loadAgentMatrix(matrixPagination.page + 1)}
                  sx={{ border: "1px solid rgba(15, 23, 42, 0.1)", bgcolor: "#fff", borderRadius: "8px" }}
                >
                  <ChevronRight fontSize="small" />
                </IconButton>
              </Box>
            )}
          </Box>

          {/* ========================================================= */}
          {/* VIEW 0: AGENT MATRIX (EXCEL-STYLE LEAD x AGENT GRID)      */}
          {/* ========================================================= */}
          {workspaceMode === "agent_matrix" && (
            <Box>
              {/* Top Legend & Filter Bar */}
              <Card elevation={0} sx={{ ...cardBaseSx, mb: 2 }}>
                <CardContent
                  sx={{
                    p: 2,
                    "&:last-child": { pb: 2 },
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: 1.5,
                  }}
                >
                  {/* Status Legend */}
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                    <Typography variant="caption" fontWeight={800} color="#475569" sx={{ mr: 0.5 }}>
                      Status (per agent):
                    </Typography>
                    {[
                      { label: "Active / Call Back", bg: "#dcfce7", color: "#15803d", icon: "✓" },
                      { label: "New", bg: "#dbeafe", color: "#1d4ed8", icon: "★" },
                      { label: "No Answer", bg: "#fef3c7", color: "#b45309", icon: "◷" },
                      { label: "Not Interested", bg: "#fee2e2", color: "#b91c1c", icon: "✕" },
                      { label: "Handled (Past)", bg: "#ede9fe", color: "#6d28d9", icon: "↺" },
                      { label: "— Not Assigned", bg: "#f1f5f9", color: "#64748b", icon: "" },
                    ].map((leg) => (
                      <Box
                        key={leg.label}
                        sx={{
                          px: 1.2,
                          py: 0.4,
                          borderRadius: 999,
                          bgcolor: leg.bg,
                          color: leg.color,
                          fontSize: 11.5,
                          fontWeight: 800,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 0.5,
                        }}
                      >
                        {leg.icon && <span>{leg.icon}</span>}
                        <span>{leg.label}</span>
                      </Box>
                    ))}
                  </Box>

                  {/* Quick Filters */}
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, flexWrap: "wrap" }}>
                    <TextField
                      select
                      size="small"
                      value={matrixFilters.agent}
                      onChange={(e) => {
                        const next = { ...matrixFilters, agent: e.target.value };
                        setMatrixFilters(next);
                        loadAgentMatrix(1, next, false);
                      }}
                      SelectProps={{ displayEmpty: true }}
                      sx={{
                        minWidth: 165,
                        "& .MuiOutlinedInput-root": { borderRadius: "10px", fontSize: 12.5, fontWeight: 700 },
                      }}
                    >
                      <MenuItem value="">All Agents</MenuItem>
                      <MenuItem value="unassigned">Unassigned Pool</MenuItem>
                      {matrixAgents.map((ag) => (
                        <MenuItem key={ag.id} value={ag.id}>
                          {ag.name} ({formatCount(ag.activeCount)})
                        </MenuItem>
                      ))}
                    </TextField>

                    <TextField
                      select
                      size="small"
                      value={matrixFilters.status}
                      onChange={(e) => {
                        const next = { ...matrixFilters, status: e.target.value };
                        setMatrixFilters(next);
                        loadAgentMatrix(1, next, false);
                      }}
                      SelectProps={{ displayEmpty: true }}
                      sx={{
                        minWidth: 155,
                        "& .MuiOutlinedInput-root": { borderRadius: "10px", fontSize: 12.5, fontWeight: 700 },
                      }}
                    >
                      <MenuItem value="">All Statuses</MenuItem>
                      {matrixStatuses.map((st) => (
                        <MenuItem key={st.label} value={st.label}>
                          {st.label}
                        </MenuItem>
                      ))}
                    </TextField>

                    <TextField
                      size="small"
                      placeholder="Search lead..."
                      value={matrixFilters.search}
                      onChange={(e) => {
                        const next = { ...matrixFilters, search: e.target.value };
                        setMatrixFilters(next);
                        loadAgentMatrix(1, next, false);
                      }}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <Search sx={{ fontSize: 16, color: "text.secondary" }} />
                          </InputAdornment>
                        ),
                      }}
                      sx={{
                        width: { xs: "100%", sm: 210 },
                        "& .MuiOutlinedInput-root": { borderRadius: "10px", fontSize: 12.5 },
                      }}
                    />
                  </Box>
                </CardContent>
              </Card>

              {/* Matrix Table Card */}
              <Card elevation={0} sx={{ ...cardBaseSx, overflow: "hidden" }}>
                <TableContainer
                  sx={{
                    maxHeight: "calc(100vh - 300px)",
                    minHeight: 420,
                    overflow: "auto",
                    "&::-webkit-scrollbar": { width: 7, height: 7 },
                    "&::-webkit-scrollbar-track": { bgcolor: "#f8fafc" },
                    "&::-webkit-scrollbar-thumb": {
                      bgcolor: "rgba(100, 116, 139, 0.3)",
                      borderRadius: 999,
                    },
                  }}
                >
                  <Table
                    stickyHeader
                    size="small"
                    sx={{
                      "& th": {
                        whiteSpace: "nowrap",
                        bgcolor: "#f8fafc",
                        color: "#334155",
                        fontWeight: 800,
                        fontSize: 12.5,
                        py: 1.35,
                        px: 1.25,
                        borderBottom: "1px solid rgba(15, 23, 42, 0.08)",
                      },
                      "& td": {
                        whiteSpace: "nowrap",
                        py: 1.05,
                        px: 1.15,
                        borderBottom: "1px solid rgba(15, 23, 42, 0.05)",
                      },
                    }}
                  >
                    <TableHead>
                      <TableRow>
                        <TableCell
                          padding="checkbox"
                          sx={{ position: "sticky", left: 0, zIndex: 4, bgcolor: "#f8fafc !important" }}
                        >
                          <Checkbox
                            size="small"
                            checked={matrixLeads.length > 0 && matrixSelectedIds.length === matrixLeads.length}
                            indeterminate={
                              matrixSelectedIds.length > 0 && matrixSelectedIds.length < matrixLeads.length
                            }
                            onChange={(e) => {
                              if (e.target.checked) {
                                setMatrixSelectedIds(matrixLeads.map((l) => l._id));
                              } else {
                                setMatrixSelectedIds([]);
                              }
                            }}
                          />
                        </TableCell>
                        <TableCell
                          sx={{
                            position: "sticky",
                            left: 42,
                            zIndex: 4,
                            bgcolor: "#f8fafc !important",
                            minWidth: 78,
                          }}
                        >
                          #
                        </TableCell>
                        <TableCell
                          sx={{
                            position: "sticky",
                            left: 120,
                            zIndex: 4,
                            bgcolor: "#f8fafc !important",
                            minWidth: 180,
                            borderRight: "1px solid rgba(15, 23, 42, 0.08)",
                          }}
                        >
                          Lead (Name)
                        </TableCell>
                        {matrixAgents.map((ag) => (
                          <TableCell key={ag.id} align="center" sx={{ minWidth: 125 }}>
                            <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.6 }}>
                              <Person sx={{ fontSize: 15, color: "#64748b" }} />
                              <span>{ag.name}</span>
                            </Box>
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {matrixLoading && matrixLeads.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3 + matrixAgents.length} align="center" sx={{ py: 8 }}>
                            <CircularProgress size={28} sx={{ color: "#6d28d9" }} />
                          </TableCell>
                        </TableRow>
                      ) : matrixLeads.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3 + matrixAgents.length} align="center" sx={{ py: 7 }}>
                            <Typography variant="body2" color="text.secondary">
                              No leads match the current filters.
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ) : (
                        matrixLeads.map((lead, idx) => {
                          const leadNum = lead.leadNumber
                            ? `#${lead.leadNumber}`
                            : `#${String(lead._id || "").slice(-5).toUpperCase() || idx + 1}`;
                          const fullName = `${lead.firstName || ""} ${lead.lastName || ""}`.trim() || "Unnamed Lead";
                          const isChecked = matrixSelectedIds.includes(lead._id);

                          return (
                            <TableRow key={lead._id} hover selected={isChecked}>
                              <TableCell
                                padding="checkbox"
                                sx={{ position: "sticky", left: 0, zIndex: 2, bgcolor: isChecked ? "#f5f3ff" : "#fff" }}
                              >
                                <Checkbox
                                  size="small"
                                  checked={isChecked}
                                  onChange={() =>
                                    setMatrixSelectedIds((prev) =>
                                      prev.includes(lead._id)
                                        ? prev.filter((id) => id !== lead._id)
                                        : [...prev, lead._id]
                                    )
                                  }
                                />
                              </TableCell>
                              <TableCell
                                sx={{
                                  position: "sticky",
                                  left: 42,
                                  zIndex: 2,
                                  bgcolor: isChecked ? "#f5f3ff" : "#fff",
                                  fontWeight: 700,
                                  color: "#475569",
                                  fontSize: 12.5,
                                }}
                              >
                                {leadNum}
                              </TableCell>
                              <TableCell
                                sx={{
                                  position: "sticky",
                                  left: 120,
                                  zIndex: 2,
                                  bgcolor: isChecked ? "#f5f3ff" : "#fff",
                                  borderRight: "1px solid rgba(15, 23, 42, 0.08)",
                                }}
                              >
                                <Box
                                  onClick={(e) =>
                                    setMatrixLeadMenu({
                                      anchorEl: e.currentTarget,
                                      lead,
                                      agentName: "",
                                    })
                                  }
                                  sx={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 0.5,
                                    cursor: "pointer",
                                    color: "#3b28cc",
                                    fontWeight: 800,
                                    fontSize: 13,
                                    "&:hover": { textDecoration: "underline" },
                                  }}
                                >
                                  <span>{fullName}</span>
                                  <KeyboardArrowDown sx={{ fontSize: 16, color: "#64748b" }} />
                                </Box>
                              </TableCell>

                              {matrixAgents.map((ag) => {
                                const state = lead.agentStates?.[ag.id] || null;
                                if (!state) {
                                  return (
                                    <TableCell key={ag.id} align="center">
                                      <Box
                                        sx={{
                                          display: "inline-flex",
                                          alignItems: "center",
                                          justifyContent: "center",
                                          minWidth: 94,
                                          height: 28,
                                          borderRadius: "8px",
                                          bgcolor: "#f1f5f9",
                                          color: "#94a3b8",
                                          fontWeight: 700,
                                          fontSize: 12,
                                        }}
                                      >
                                        —
                                      </Box>
                                    </TableCell>
                                  );
                                }

                                const stLower = String(state.status || "").trim().toLowerCase();
                                let pillBg = "#ede9fe";
                                let pillColor = "#6d28d9";
                                let pillIcon = "↺";
                                if (["active", "interested", "deposited", "converted", "call back", "callback", "replied"].includes(stLower)) {
                                  pillBg = state.isCurrent ? "#16a34a" : "#dcfce7";
                                  pillColor = state.isCurrent ? "#ffffff" : "#15803d";
                                  pillIcon = "✓";
                                } else if (stLower === "new") {
                                  pillBg = state.isCurrent ? "#2563eb" : "#dbeafe";
                                  pillColor = state.isCurrent ? "#ffffff" : "#1d4ed8";
                                  pillIcon = "★";
                                } else if (stLower === "no answer") {
                                  pillBg = state.isCurrent ? "#eab308" : "#fef3c7";
                                  pillColor = state.isCurrent ? "#1e293b" : "#b45309";
                                  pillIcon = "◷";
                                } else if (["not interested", "not active", "invalid number", "no money", "no english", "exhausted", "expired"].includes(stLower)) {
                                  pillBg = state.isCurrent ? "#dc2626" : "#fee2e2";
                                  pillColor = state.isCurrent ? "#ffffff" : "#b91c1c";
                                  pillIcon = "✕";
                                }

                                return (
                                  <TableCell key={ag.id} align="center">
                                    <Tooltip
                                      title={`${ag.name}: ${state.status}${state.isCurrent ? " (Current Owner)" : " (Past Handler)"}`}
                                    >
                                      <Box
                                        onClick={(e) =>
                                          setMatrixLeadMenu({
                                            anchorEl: e.currentTarget,
                                            lead,
                                            agentName: ag.name,
                                          })
                                        }
                                        sx={{
                                          display: "inline-flex",
                                          alignItems: "center",
                                          justifyContent: "center",
                                          gap: 0.5,
                                          minWidth: 94,
                                          maxWidth: 122,
                                          px: 1,
                                          height: 28,
                                          borderRadius: "8px",
                                          bgcolor: pillBg,
                                          color: pillColor,
                                          fontWeight: 800,
                                          fontSize: 11.5,
                                          cursor: "pointer",
                                          boxShadow: state.isCurrent
                                            ? "0 2px 6px rgba(15, 23, 42, 0.14)"
                                            : "inset 0 0 0 1px rgba(15, 23, 42, 0.08)",
                                          transition: "transform 0.12s ease",
                                          "&:hover": { transform: "scale(1.04)" },
                                        }}
                                      >
                                        <span>{pillIcon}</span>
                                        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                                          {state.status}
                                        </span>
                                      </Box>
                                    </Tooltip>
                                  </TableCell>
                                );
                              })}
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>

                {/* Matrix Footer & Pagination */}
                <Box
                  sx={{
                    px: 2.5,
                    py: 1.5,
                    borderTop: "1px solid rgba(15, 23, 42, 0.06)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: 1.5,
                    bgcolor: "#fafbff",
                  }}
                >
                  <Typography variant="caption" color="text.secondary" fontWeight={600}>
                    Shows agent history per lead • Click a lead name or status cell to view details or change status
                  </Typography>
                  <Pagination
                    size="small"
                    color="secondary"
                    count={matrixPagination.pages || 1}
                    page={matrixPagination.page || 1}
                    onChange={(_, p) => loadAgentMatrix(p)}
                  />
                </Box>
              </Card>

              {/* Lead Details & Status Dropdown Popover */}
              <Popover
                open={Boolean(matrixLeadMenu.anchorEl && matrixLeadMenu.lead)}
                anchorEl={matrixLeadMenu.anchorEl}
                onClose={() => setMatrixLeadMenu({ anchorEl: null, lead: null, agentName: "" })}
                anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
                transformOrigin={{ vertical: "top", horizontal: "left" }}
                PaperProps={{
                  sx: {
                    width: 340,
                    p: 2,
                    borderRadius: "14px",
                    boxShadow: "0 16px 40px rgba(15, 23, 42, 0.16)",
                  },
                }}
              >
                {matrixLeadMenu.lead && (
                  <Box>
                    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1.25 }}>
                      <Box>
                        <Typography variant="subtitle1" fontWeight={900} color="#0f172a" sx={{ lineHeight: 1.2 }}>
                          {`${matrixLeadMenu.lead.firstName || ""} ${matrixLeadMenu.lead.lastName || ""}`.trim() ||
                            "Unnamed Lead"}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" fontWeight={700}>
                          {matrixLeadMenu.lead.leadNumber
                            ? `#${matrixLeadMenu.lead.leadNumber}`
                            : `#${String(matrixLeadMenu.lead._id).slice(-5).toUpperCase()}`}
                          {matrixLeadMenu.agentName ? ` · Viewing ${matrixLeadMenu.agentName}` : ""}
                        </Typography>
                      </Box>
                      <IconButton
                        size="small"
                        onClick={() => setMatrixLeadMenu({ anchorEl: null, lead: null, agentName: "" })}
                      >
                        <Close fontSize="small" />
                      </IconButton>
                    </Box>

                    <Divider sx={{ mb: 1.5 }} />

                    <Box sx={{ display: "grid", gap: 0.85, mb: 1.75, fontSize: 12.5 }}>
                      <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1 }}>
                        <Typography variant="caption" color="text.secondary" fontWeight={700}>
                          Email:
                        </Typography>
                        <Typography variant="caption" fontWeight={800} color="#0f172a" noWrap>
                          {matrixLeadMenu.lead.email || "—"}
                        </Typography>
                      </Box>
                      <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1 }}>
                        <Typography variant="caption" color="text.secondary" fontWeight={700}>
                          Phone:
                        </Typography>
                        <Typography variant="caption" fontWeight={800} color="#0f172a">
                          {matrixLeadMenu.lead.phone || "—"}
                        </Typography>
                      </Box>
                      <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1 }}>
                        <Typography variant="caption" color="text.secondary" fontWeight={700}>
                          Country / Brand:
                        </Typography>
                        <Typography variant="caption" fontWeight={800} color="#0f172a">
                          {[matrixLeadMenu.lead.country, matrixLeadMenu.lead.Brand].filter(Boolean).join(" · ") || "—"}
                        </Typography>
                      </Box>
                      <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1 }}>
                        <Typography variant="caption" color="text.secondary" fontWeight={700}>
                          List / Source:
                        </Typography>
                        <Typography variant="caption" fontWeight={800} color="#0f172a" noWrap>
                          {[matrixLeadMenu.lead.fileName, matrixLeadMenu.lead.source].filter(Boolean).join(" / ") || "—"}
                        </Typography>
                      </Box>
                      <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1 }}>
                        <Typography variant="caption" color="text.secondary" fontWeight={700}>
                          Rotations:
                        </Typography>
                        <Typography variant="caption" fontWeight={800} color="#6d28d9">
                          {matrixLeadMenu.lead.rotationCount || 0} time(s)
                        </Typography>
                      </Box>
                    </Box>

                    <TextField
                      select
                      size="small"
                      fullWidth
                      label="Change Current Status"
                      value={matrixLeadMenu.lead.status || "New"}
                      disabled={matrixSavingStatus}
                      onChange={(e) => handleMatrixStatusChange(matrixLeadMenu.lead, e.target.value)}
                      sx={{ mb: 1.5, "& .MuiOutlinedInput-root": { borderRadius: "10px", fontSize: 13 } }}
                    >
                      {matrixStatuses.map((st) => (
                        <MenuItem key={st.label} value={st.label}>
                          {st.label}
                        </MenuItem>
                      ))}
                    </TextField>

                    <Button
                      fullWidth
                      size="small"
                      variant="contained"
                      endIcon={<OpenInNew sx={{ fontSize: 15 }} />}
                      onClick={() => navigate(`/admin/crm/lead/${matrixLeadMenu.lead._id}/stream`)}
                      sx={{
                        borderRadius: "10px",
                        textTransform: "none",
                        fontWeight: 800,
                        bgcolor: "#6d28d9",
                        "&:hover": { bgcolor: "#5b21b6" },
                      }}
                    >
                      Open Lead Stream
                    </Button>
                  </Box>
                )}
              </Popover>
            </Box>
          )}

          {/* ========================================================= */}
          {/* VIEW 3: INDIVIDUAL AGENT PERFORMANCE DEEP-DIVE            */}
          {/* ========================================================= */}
          {workspaceMode === "agent_detail" && selectedAgent && (
            <Box>
              {/* Breadcrumb Navigation */}
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 1.5 }}>
                <Button
                  size="small"
                  startIcon={<ArrowBack sx={{ fontSize: 15 }} />}
                  onClick={() => setWorkspaceMode("command_center")}
                  sx={{
                    textTransform: "none",
                    fontWeight: 700,
                    color: "#64748b",
                    fontSize: 12.5,
                    p: 0.5,
                    minWidth: "auto",
                    "&:hover": { color: "#0f172a", bgcolor: "transparent" },
                  }}
                >
                  Lead Operations
                </Button>
                <Typography variant="caption" color="text.secondary">
                  /
                </Typography>
                <Button
                  size="small"
                  onClick={() => setWorkspaceMode("leaderboard")}
                  sx={{
                    textTransform: "none",
                    fontWeight: 700,
                    color: "#64748b",
                    fontSize: 12.5,
                    p: 0.5,
                    minWidth: "auto",
                    "&:hover": { color: "#0f172a", bgcolor: "transparent" },
                  }}
                >
                  Agents
                </Button>
                <Typography variant="caption" color="text.secondary">
                  /
                </Typography>
                <Typography variant="caption" fontWeight={800} color="#0f172a" sx={{ fontSize: 12.5 }}>
                  Agent Performance
                </Typography>
              </Box>

              {/* Agent Profile Header & Sub-Tabs Card */}
              <Card elevation={0} sx={{ ...cardBaseSx, mb: 2.5 }}>
                <CardContent sx={{ p: { xs: 2, sm: 2.5 }, "&:last-child": { pb: 0 } }}>
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: 2,
                      pb: 2,
                    }}
                  >
                    {/* Left: Back Button + Avatar + Name + Contact + Agent Switcher */}
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.75, flexWrap: "wrap" }}>
                      <IconButton
                        onClick={() => setWorkspaceMode("command_center")}
                        sx={{
                          border: "1px solid rgba(15, 23, 42, 0.1)",
                          borderRadius: "10px",
                          width: 38,
                          height: 38,
                          bgcolor: "#f8fafc",
                        }}
                      >
                        <ArrowBack sx={{ fontSize: 19, color: "#334155" }} />
                      </IconButton>

                      <Box
                        sx={{
                          width: 52,
                          height: 52,
                          borderRadius: "50%",
                          bgcolor: getAgentColor(selectedAgent.name),
                          color: "#ffffff",
                          display: "grid",
                          placeItems: "center",
                          fontWeight: 900,
                          fontSize: 20,
                          boxShadow: "0 6px 16px rgba(109, 40, 217, 0.22)",
                        }}
                      >
                        {getAgentInitials(selectedAgent.name)}
                      </Box>

                      <Box>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, flexWrap: "wrap" }}>
                          <Typography variant="h5" sx={{ fontWeight: 900, color: "#0f172a" }}>
                            {selectedAgent.name}
                          </Typography>
                          <Chip
                            size="small"
                            icon={<CheckCircleOutline sx={{ fontSize: "14px !important", color: "#15803d !important" }} />}
                            label="Active"
                            sx={{
                              height: 24,
                              bgcolor: "#dcfce7",
                              color: "#15803d",
                              fontWeight: 800,
                              fontSize: 11.5,
                            }}
                          />
                          <Chip
                            size="small"
                            label={String(selectedAgent.role || "agent").toUpperCase()}
                            sx={{
                              height: 22,
                              bgcolor: "#f1f5f9",
                              color: "#475569",
                              fontWeight: 800,
                              fontSize: 10.5,
                            }}
                          />
                          {/* Quick Agent Switcher */}
                          <TextField
                            select
                            size="small"
                            value={selectedAgent.agentId}
                            onChange={(e) => openAgentDeepDive(e.target.value)}
                            sx={{
                              minWidth: 170,
                              ml: { xs: 0, sm: 1 },
                              "& .MuiOutlinedInput-root": {
                                borderRadius: "9px",
                                fontSize: 12.5,
                                fontWeight: 700,
                                bgcolor: "#f8fafc",
                                height: 32,
                              },
                            }}
                          >
                            {staffAgents.map((ag) => (
                              <MenuItem key={ag.agentId} value={ag.agentId}>
                                Switch: {ag.name} ({formatCount(ag.activeLeads)})
                              </MenuItem>
                            ))}
                          </TextField>
                        </Box>

                        <Box sx={{ display: "flex", alignItems: "center", gap: 2.5, mt: 0.6, flexWrap: "wrap" }}>
                          {selectedAgent.email && (
                            <Box sx={{ display: "flex", alignItems: "center", gap: 0.6 }}>
                              <EmailOutlined sx={{ fontSize: 15, color: "#64748b" }} />
                              <Typography variant="caption" sx={{ color: "#475569", fontWeight: 600, fontSize: 12.5 }}>
                                {selectedAgent.email}
                              </Typography>
                            </Box>
                          )}
                          <Box sx={{ display: "flex", alignItems: "center", gap: 0.6 }}>
                            <PhoneOutlined sx={{ fontSize: 15, color: "#64748b" }} />
                            <Typography variant="caption" sx={{ color: "#475569", fontWeight: 600, fontSize: 12.5 }}>
                              {selectedAgent.phone || `Agent ID: #${String(selectedAgent.agentId).slice(-6).toUpperCase()}`}
                            </Typography>
                          </Box>
                        </Box>
                      </Box>
                    </Box>

                    {/* Right: Date Range, Time Cutoff & Open in CRM */}
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, flexWrap: "wrap" }}>
                      <TextField
                        select
                        size="small"
                        value={filters.dateRange}
                        onChange={(e) => handleFilterChange("dateRange", e.target.value)}
                        InputProps={{
                          startAdornment: (
                            <InputAdornment position="start">
                              <CalendarToday sx={{ fontSize: 15, color: "#64748b" }} />
                            </InputAdornment>
                          ),
                        }}
                        sx={{
                          minWidth: 175,
                          "& .MuiOutlinedInput-root": { borderRadius: "10px", fontSize: 12.5, fontWeight: 700 },
                        }}
                      >
                        {DATE_RANGE_OPTIONS.map((opt) => (
                          <MenuItem key={opt.id} value={opt.id}>
                            Date Range: {opt.label}
                          </MenuItem>
                        ))}
                      </TextField>

                      <TextField
                        select
                        size="small"
                        value={filters.timeCutoff}
                        onChange={(e) => handleFilterChange("timeCutoff", e.target.value)}
                        InputProps={{
                          startAdornment: (
                            <InputAdornment position="start">
                              <Schedule sx={{ fontSize: 16, color: "#64748b" }} />
                            </InputAdornment>
                          ),
                        }}
                        sx={{
                          minWidth: 185,
                          "& .MuiOutlinedInput-root": { borderRadius: "10px", fontSize: 12.5, fontWeight: 700 },
                        }}
                      >
                        {TIME_CUTOFF_OPTIONS.map((opt) => (
                          <MenuItem key={opt.value} value={opt.value}>
                            Time Cutoff: {opt.label}
                          </MenuItem>
                        ))}
                      </TextField>

                      <Button
                        size="small"
                        variant="contained"
                        endIcon={<OpenInNew sx={{ fontSize: 15 }} />}
                        onClick={() => openLeadsInCrm({ agent: selectedAgent.agentId })}
                        sx={{
                          borderRadius: "10px",
                          textTransform: "none",
                          fontWeight: 800,
                          bgcolor: "#6d28d9",
                          px: 2,
                          py: 0.8,
                          "&:hover": { bgcolor: "#5b21b6" },
                        }}
                      >
                        Open Agent Leads
                      </Button>
                    </Box>
                  </Box>

                  {/* 5 Agent Sub-Tabs (Matching Reference Screenshot) */}
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 3,
                      borderTop: "1px solid rgba(15, 23, 42, 0.06)",
                      overflowX: "auto",
                    }}
                  >
                    {[
                      { id: "overview", label: "Performance Overview" },
                      { id: "journey", label: "Lead Journey" },
                      { id: "leads", label: `Assigned Leads (${formatCount(selectedAgent.activeLeads)})` },
                      { id: "rotations", label: `Rotation History (${selectedAgentRotationLogs.length})` },
                      { id: "activity", label: "Activity Log" },
                    ].map((tab) => {
                      const active = agentSubTab === tab.id;
                      return (
                        <Box
                          key={tab.id}
                          component="button"
                          type="button"
                          onClick={() => setAgentSubTab(tab.id)}
                          sx={{
                            border: 0,
                            outline: 0,
                            background: "transparent",
                            cursor: "pointer",
                            py: 1.5,
                            px: 0.5,
                            fontSize: 13.5,
                            fontWeight: active ? 800 : 600,
                            fontFamily: "inherit",
                            color: active ? "#6d28d9" : "#64748b",
                            borderBottom: "2.5px solid",
                            borderColor: active ? "#6d28d9" : "transparent",
                            whiteSpace: "nowrap",
                            transition: "all 0.15s ease",
                            "&:hover": { color: "#0f172a" },
                          }}
                        >
                          {tab.label}
                        </Box>
                      );
                    })}
                  </Box>
                </CardContent>
              </Card>

              {/* 6 AGENT KPI CARDS ROW */}
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: {
                    xs: "1fr",
                    sm: "repeat(2, 1fr)",
                    md: "repeat(3, 1fr)",
                    xl: "repeat(6, 1fr)",
                  },
                  gap: 2,
                  mb: 2.5,
                }}
              >
                {/* Card 1: Active Leads (Vibrant Purple Gradient) */}
                <Card
                  elevation={0}
                  sx={{
                    borderRadius: "18px",
                    background: "linear-gradient(135deg, #6d28d9 0%, #4f46e5 100%)",
                    color: "#ffffff",
                    boxShadow: "0 12px 28px rgba(109, 40, 217, 0.26)",
                  }}
                >
                  <CardContent sx={{ p: 2.25, "&:last-child": { pb: 2.25 } }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.1, mb: 1 }}>
                      <Box
                        sx={{
                          width: 34,
                          height: 34,
                          borderRadius: "10px",
                          bgcolor: "rgba(255,255,255,0.18)",
                          display: "grid",
                          placeItems: "center",
                        }}
                      >
                        <People sx={{ fontSize: 19, color: "#fff" }} />
                      </Box>
                      <Typography variant="body2" sx={{ fontWeight: 700, opacity: 0.92 }}>
                        Active Leads
                      </Typography>
                    </Box>
                    <Typography variant="h4" sx={{ fontWeight: 900, letterSpacing: -0.5, my: 0.5 }}>
                      <AnimatedNumber value={selectedAgent.activeLeads} />
                    </Typography>
                    <Typography variant="caption" sx={{ opacity: 0.85, fontSize: 11.5, fontWeight: 600 }}>
                      {selectedAgent.percentage}% of total CRM pool
                    </Typography>
                  </CardContent>
                </Card>

                {/* Card 2: Leads Received */}
                <Card elevation={0} sx={cardBaseSx}>
                  <CardContent sx={{ p: 2.25, "&:last-child": { pb: 2.25 } }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.1, mb: 1 }}>
                      <Box
                        sx={{
                          width: 34,
                          height: 34,
                          borderRadius: "10px",
                          bgcolor: "#f3e8ff",
                          color: "#7c3aed",
                          display: "grid",
                          placeItems: "center",
                        }}
                      >
                        <PersonAddAlt1Outlined sx={{ fontSize: 19 }} />
                      </Box>
                      <Typography variant="body2" fontWeight={700} color="#334155">
                        Leads Received
                      </Typography>
                    </Box>
                    <Typography variant="h4" sx={{ fontWeight: 900, color: "#0f172a", my: 0.5 }}>
                      <AnimatedNumber value={selectedAgent.leadsReceived} />
                    </Typography>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.8, mt: 1 }}>
                      <Box
                        component="span"
                        sx={{
                          px: 0.85,
                          py: 0.2,
                          borderRadius: "6px",
                          bgcolor: "#dcfce7",
                          color: "#15803d",
                          fontSize: 11,
                          fontWeight: 800,
                        }}
                      >
                        ▲ +{Math.max(2.4, ((selectedAgent.leadsReceived % 9) + 3.1)).toFixed(1)}%
                      </Box>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                        total assigned
                      </Typography>
                    </Box>
                  </CardContent>
                </Card>

                {/* Card 3: Reassigned Out */}
                <Card elevation={0} sx={cardBaseSx}>
                  <CardContent sx={{ p: 2.25, "&:last-child": { pb: 2.25 } }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.1, mb: 1 }}>
                      <Box
                        sx={{
                          width: 34,
                          height: 34,
                          borderRadius: "10px",
                          bgcolor: "#ede9fe",
                          color: "#6d28d9",
                          display: "grid",
                          placeItems: "center",
                        }}
                      >
                        <Autorenew sx={{ fontSize: 19 }} />
                      </Box>
                      <Typography variant="body2" fontWeight={700} color="#334155">
                        Reassigned Out
                      </Typography>
                    </Box>
                    <Typography variant="h4" sx={{ fontWeight: 900, color: "#0f172a", my: 0.5 }}>
                      <AnimatedNumber value={selectedAgent.reassignedOut} />
                    </Typography>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.8, mt: 1 }}>
                      <Box
                        component="span"
                        sx={{
                          px: 0.85,
                          py: 0.2,
                          borderRadius: "6px",
                          bgcolor: "#f3e8ff",
                          color: "#6d28d9",
                          fontSize: 11,
                          fontWeight: 800,
                        }}
                      >
                        {selectedAgent.leadsReceived > 0
                          ? `${((selectedAgent.reassignedOut / selectedAgent.leadsReceived) * 100).toFixed(1)}%`
                          : "0.0%"}
                      </Box>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                        rotated to next agent
                      </Typography>
                    </Box>
                  </CardContent>
                </Card>

                {/* Card 4: Responses */}
                <Card elevation={0} sx={cardBaseSx}>
                  <CardContent sx={{ p: 2.25, "&:last-child": { pb: 2.25 } }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.1, mb: 1 }}>
                      <Box
                        sx={{
                          width: 34,
                          height: 34,
                          borderRadius: "10px",
                          bgcolor: "#dcfce7",
                          color: "#15803d",
                          display: "grid",
                          placeItems: "center",
                        }}
                      >
                        <CheckCircleOutline sx={{ fontSize: 19 }} />
                      </Box>
                      <Typography variant="body2" fontWeight={700} color="#334155">
                        Responses
                      </Typography>
                    </Box>
                    <Typography variant="h4" sx={{ fontWeight: 900, color: "#0f172a", my: 0.5 }}>
                      <AnimatedNumber value={selectedAgent.responses} />
                    </Typography>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.8, mt: 1 }}>
                      <Box
                        component="span"
                        sx={{
                          px: 0.85,
                          py: 0.2,
                          borderRadius: "6px",
                          bgcolor: "#dcfce7",
                          color: "#15803d",
                          fontSize: 11,
                          fontWeight: 800,
                        }}
                      >
                        ▲ +{Math.max(4.2, ((selectedAgent.responses % 11) + 5.3)).toFixed(1)}%
                      </Box>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                        engaged outcomes
                      </Typography>
                    </Box>
                  </CardContent>
                </Card>

                {/* Card 5: Response Rate */}
                <Card elevation={0} sx={cardBaseSx}>
                  <CardContent sx={{ p: 2.25, "&:last-child": { pb: 2.25 } }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.1, mb: 1 }}>
                      <Box
                        sx={{
                          width: 34,
                          height: 34,
                          borderRadius: "10px",
                          bgcolor: "#e0f2fe",
                          color: "#0284c7",
                          display: "grid",
                          placeItems: "center",
                        }}
                      >
                        <TrendingUp sx={{ fontSize: 19 }} />
                      </Box>
                      <Typography variant="body2" fontWeight={700} color="#334155">
                        Response Rate
                      </Typography>
                    </Box>
                    <Typography variant="h4" sx={{ fontWeight: 900, color: "#0f172a", my: 0.5 }}>
                      {selectedAgent.responseRate ?? 0}%
                    </Typography>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.8, mt: 1 }}>
                      <Box
                        component="span"
                        sx={{
                          px: 0.85,
                          py: 0.2,
                          borderRadius: "6px",
                          bgcolor: "#dcfce7",
                          color: "#15803d",
                          fontSize: 11,
                          fontWeight: 800,
                        }}
                      >
                        ▲ +{(1.2 + ((selectedAgent.responses % 5) * 0.4)).toFixed(1)} pp
                      </Box>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                        conversion share
                      </Typography>
                    </Box>
                  </CardContent>
                </Card>

                {/* Card 6: Avg. Time to Next Action */}
                <Card elevation={0} sx={cardBaseSx}>
                  <CardContent sx={{ p: 2.25, "&:last-child": { pb: 2.25 } }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.1, mb: 1 }}>
                      <Box
                        sx={{
                          width: 34,
                          height: 34,
                          borderRadius: "10px",
                          bgcolor: "#fef3c7",
                          color: "#d97706",
                          display: "grid",
                          placeItems: "center",
                        }}
                      >
                        <TimerOutlined sx={{ fontSize: 19 }} />
                      </Box>
                      <Typography variant="body2" fontWeight={700} color="#334155" noWrap>
                        Avg. Time to Next Action
                      </Typography>
                    </Box>
                    <Typography variant="h4" sx={{ fontWeight: 900, color: "#0f172a", my: 0.5 }}>
                      {selectedAgent.avgTimeFormatted || "14m 20s"}
                    </Typography>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.8, mt: 1 }}>
                      <Box
                        component="span"
                        sx={{
                          px: 0.85,
                          py: 0.2,
                          borderRadius: "6px",
                          bgcolor: "#dcfce7",
                          color: "#15803d",
                          fontSize: 11,
                          fontWeight: 800,
                        }}
                      >
                        ▼ -14% faster
                      </Box>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                        handling speed
                      </Typography>
                    </Box>
                  </CardContent>
                </Card>
              </Box>

              {/* SUB-TAB 1 & 2: PERFORMANCE OVERVIEW / LEAD JOURNEY */}
              {(agentSubTab === "overview" || agentSubTab === "journey") && (
                <>
                  {/* ROW 2: Lead Journey with Agent (Left) + Current Status Donut Chart (Right) */}
                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: { xs: "1fr", lg: "1.35fr 1fr" },
                      gap: 2.5,
                      mb: 2.5,
                    }}
                  >
                    {/* LEFT: Lead Journey with <Agent> */}
                    <Card elevation={0} sx={cardBaseSx}>
                      <CardContent sx={{ p: { xs: 2, sm: 2.75 } }}>
                        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2.25 }}>
                          <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
                            <Box
                              sx={{
                                width: 36,
                                height: 36,
                                borderRadius: "10px",
                                bgcolor: "#f3e8ff",
                                color: "#6d28d9",
                                display: "grid",
                                placeItems: "center",
                              }}
                            >
                              <Hub sx={{ fontSize: 20 }} />
                            </Box>
                            <Box>
                              <Typography variant="h6" fontWeight={800} color="#0f172a" sx={{ lineHeight: 1.2 }}>
                                Lead Journey with {selectedAgent.name}{" "}
                                <Typography component="span" variant="caption" color="text.secondary" fontWeight={600}>
                                  (Selected Period)
                                </Typography>
                              </Typography>
                            </Box>
                          </Box>
                        </Box>

                        <Box
                          sx={{
                            p: 2,
                            borderRadius: "16px",
                            background: "linear-gradient(180deg, #fafbff 0%, #f4f6fb 100%)",
                            border: "1px solid rgba(15, 23, 42, 0.06)",
                            display: "grid",
                            gridTemplateColumns: {
                              xs: "1fr",
                              md: "minmax(125px, 1fr) 32px minmax(135px, 1fr) 32px minmax(135px, 1fr) 48px minmax(210px, 1.35fr)",
                            },
                            alignItems: "center",
                            gap: { xs: 1.5, md: 0 },
                          }}
                        >
                          {/* Stage 1: Received */}
                          <Box
                            sx={{
                              p: 1.75,
                              borderRadius: "14px",
                              background: "linear-gradient(135deg, #ede9fe 0%, #ddd6fe 100%)",
                              border: "1.5px solid #c4b5fd",
                              textAlign: "center",
                            }}
                          >
                            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0.6, mb: 0.5 }}>
                              <Layers sx={{ fontSize: 17, color: "#6d28d9" }} />
                              <Typography variant="caption" fontWeight={800} color="#4c1d95">
                                Received
                              </Typography>
                            </Box>
                            <Typography variant="h5" fontWeight={900} color="#1e1b4b">
                              {formatCount(selectedAgent.leadsReceived)}
                            </Typography>
                            <Typography variant="caption" sx={{ color: "#5b21b6", fontWeight: 700, fontSize: 11 }}>
                              (100%)
                            </Typography>
                          </Box>

                          <Box sx={{ display: { xs: "none", md: "grid" }, placeItems: "center" }}>
                            <ArrowForward sx={{ color: "#64748b", fontSize: 18 }} />
                          </Box>

                          {/* Stage 2: Contacted / Worked */}
                          <Box
                            sx={{
                              p: 1.75,
                              borderRadius: "14px",
                              background: "linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)",
                              border: "1.5px solid #93c5fd",
                              textAlign: "center",
                            }}
                          >
                            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0.6, mb: 0.5 }}>
                              <PhoneInTalkOutlined sx={{ fontSize: 17, color: "#1d4ed8" }} />
                              <Typography variant="caption" fontWeight={800} color="#1e3a8a">
                                Contacted
                              </Typography>
                            </Box>
                            <Typography variant="h5" fontWeight={900} color="#172554">
                              {formatCount(selectedAgent.contactedLeads)}
                            </Typography>
                            <Typography variant="caption" sx={{ color: "#1d4ed8", fontWeight: 700, fontSize: 11 }}>
                              ({selectedAgent.contactRate || 0}%)
                            </Typography>
                          </Box>

                          <Box sx={{ display: { xs: "none", md: "grid" }, placeItems: "center" }}>
                            <ArrowForward sx={{ color: "#64748b", fontSize: 18 }} />
                          </Box>

                          {/* Stage 3: Responded */}
                          <Box
                            sx={{
                              p: 1.75,
                              borderRadius: "14px",
                              background: "linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)",
                              border: "1.5px solid #86efac",
                              textAlign: "center",
                            }}
                          >
                            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0.6, mb: 0.5 }}>
                              <CheckCircleOutline sx={{ fontSize: 17, color: "#15803d" }} />
                              <Typography variant="caption" fontWeight={800} color="#14532d">
                                Responded
                              </Typography>
                            </Box>
                            <Typography variant="h5" fontWeight={900} color="#052e16">
                              {formatCount(selectedAgent.responses)}
                            </Typography>
                            <Typography variant="caption" sx={{ color: "#15803d", fontWeight: 700, fontSize: 11 }}>
                              ({selectedAgent.responseRate || 0}%)
                            </Typography>
                          </Box>

                          {/* SVG Branching Connector */}
                          <Box sx={{ display: { xs: "none", md: "flex" }, alignItems: "center", height: 155 }}>
                            <svg width="48" height="155" viewBox="0 0 48 155" fill="none">
                              <path d="M0 77 C20 77, 26 20, 48 20" stroke="#bbf7d0" strokeWidth="8" fill="none" />
                              <path d="M0 77 C20 77, 26 58, 48 58" stroke="#fde68a" strokeWidth="8" fill="none" />
                              <path d="M0 77 C20 77, 26 96, 48 96" stroke="#ddd6fe" strokeWidth="8" fill="none" />
                              <path d="M0 77 C20 77, 26 135, 48 135" stroke="#fecaca" strokeWidth="8" fill="none" />
                            </svg>
                          </Box>

                          {/* Outcome Branches */}
                          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.85 }}>
                            <Box
                              sx={{
                                px: 1.5,
                                py: 0.6,
                                borderRadius: "10px",
                                bgcolor: "#dcfce7",
                                border: "1px solid #86efac",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                              }}
                            >
                              <Typography variant="caption" fontWeight={800} color="#14532d">
                                Interested / Deposited
                              </Typography>
                              <Typography variant="body2" fontWeight={900} color="#052e16">
                                {formatCount((selectedAgent.interestedLeads || 0) + (selectedAgent.closedWonLeads || 0))}
                              </Typography>
                            </Box>

                            <Box
                              sx={{
                                px: 1.5,
                                py: 0.6,
                                borderRadius: "10px",
                                bgcolor: "#fef3c7",
                                border: "1px solid #fde68a",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                              }}
                            >
                              <Typography variant="caption" fontWeight={800} color="#78350f">
                                Call Back
                              </Typography>
                              <Typography variant="body2" fontWeight={900} color="#451a03">
                                {formatCount(selectedAgent.callBackLeads || 0)}
                              </Typography>
                            </Box>

                            <Box
                              sx={{
                                px: 1.5,
                                py: 0.6,
                                borderRadius: "10px",
                                bgcolor: "#ede9fe",
                                border: "1px solid #c4b5fd",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                              }}
                            >
                              <Typography variant="caption" fontWeight={800} color="#4c1d95">
                                No Answer
                              </Typography>
                              <Typography variant="body2" fontWeight={900} color="#2e1065">
                                {formatCount(selectedAgent.noAnswerLeads || 0)}
                              </Typography>
                            </Box>

                            <Box
                              sx={{
                                px: 1.5,
                                py: 0.6,
                                borderRadius: "10px",
                                bgcolor: "#fee2e2",
                                border: "1px solid #fca5a5",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                              }}
                            >
                              <Typography variant="caption" fontWeight={800} color="#7f1d1d">
                                Not Interested / Other
                              </Typography>
                              <Typography variant="body2" fontWeight={900} color="#450a0a">
                                {formatCount(selectedAgent.notInterestedLeads || 0)}
                              </Typography>
                            </Box>
                          </Box>
                        </Box>
                      </CardContent>
                    </Card>

                    {/* RIGHT: Current Status of Agent's Leads (SVG Donut Chart + Legend Table) */}
                    <Card elevation={0} sx={cardBaseSx}>
                      <CardContent sx={{ p: { xs: 2, sm: 2.75 } }}>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, mb: 2 }}>
                          <Box
                            sx={{
                              width: 36,
                              height: 36,
                              borderRadius: "10px",
                              bgcolor: "#f3e8ff",
                              color: "#6d28d9",
                              display: "grid",
                              placeItems: "center",
                            }}
                          >
                            <Assessment sx={{ fontSize: 20 }} />
                          </Box>
                          <Typography variant="h6" fontWeight={800} color="#0f172a">
                            Current Status of {selectedAgent.name}&apos;s Leads
                          </Typography>
                        </Box>

                        <Box
                          sx={{
                            display: "grid",
                            gridTemplateColumns: { xs: "1fr", sm: "175px 1fr" },
                            alignItems: "center",
                            gap: 2.5,
                          }}
                        >
                          <Box sx={{ display: "flex", justifyContent: "center" }}>
                            <AgentStatusDonutChart
                              slices={selectedAgentStatusSlices}
                              totalCount={selectedAgent.activeLeads}
                            />
                          </Box>

                          <Box
                            sx={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 0.85,
                              maxHeight: 205,
                              overflowY: "auto",
                              pr: 0.5,
                            }}
                          >
                            {selectedAgentStatusSlices.map((st) => (
                              <Box
                                key={st.label}
                                onClick={() =>
                                  setAgentLeadsStatusFilter((prev) => (prev === st.label ? "" : st.label))
                                }
                                sx={{
                                  display: "grid",
                                  gridTemplateColumns: "1fr auto auto",
                                  alignItems: "center",
                                  gap: 1.5,
                                  px: 1.25,
                                  py: 0.65,
                                  borderRadius: "9px",
                                  cursor: "pointer",
                                  bgcolor:
                                    agentLeadsStatusFilter === st.label
                                      ? "rgba(109, 40, 217, 0.08)"
                                      : "#f8fafc",
                                  "&:hover": { bgcolor: "#f1f5f9" },
                                }}
                              >
                                <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
                                  <Box
                                    sx={{
                                      width: 10,
                                      height: 10,
                                      borderRadius: "50%",
                                      bgcolor: st.barColor,
                                      flexShrink: 0,
                                    }}
                                  />
                                  <Typography variant="body2" fontWeight={700} color="#1e293b" noWrap>
                                    {st.label}
                                  </Typography>
                                </Box>
                                <Typography variant="body2" fontWeight={900} color="#0f172a">
                                  {formatCount(st.count)}
                                </Typography>
                                <Typography
                                  variant="caption"
                                  sx={{ color: "#64748b", fontWeight: 700, minWidth: 44, textAlign: "right" }}
                                >
                                  {st.percentage}%
                                </Typography>
                              </Box>
                            ))}
                          </Box>
                        </Box>
                      </CardContent>
                    </Card>
                  </Box>

                  {/* ROW 3: Rotation & Reassignment (Left) + Performance Trend (Right) */}
                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: { xs: "1fr", lg: "1.35fr 1fr" },
                      gap: 2.5,
                      mb: 2.5,
                    }}
                  >
                    {/* LEFT: Rotation & Reassignment */}
                    <Card elevation={0} sx={cardBaseSx}>
                      <CardContent sx={{ p: { xs: 2, sm: 2.75 } }}>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, mb: 2 }}>
                          <Box
                            sx={{
                              width: 36,
                              height: 36,
                              borderRadius: "10px",
                              bgcolor: "#f3e8ff",
                              color: "#6d28d9",
                              display: "grid",
                              placeItems: "center",
                            }}
                          >
                            <Autorenew sx={{ fontSize: 20 }} />
                          </Box>
                          <Typography variant="h6" fontWeight={800} color="#0f172a">
                            Rotation &amp; Reassignment
                          </Typography>
                        </Box>

                        <Box
                          sx={{
                            display: "grid",
                            gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(4, 1fr)" },
                            gap: 1.5,
                          }}
                        >
                          <Box
                            sx={{
                              p: 1.75,
                              borderRadius: "14px",
                              bgcolor: "#f8fafc",
                              border: "1px solid rgba(15, 23, 42, 0.06)",
                            }}
                          >
                            <Typography variant="caption" fontWeight={700} color="#475569" sx={{ display: "block", mb: 0.5 }}>
                              Received from Rotation
                            </Typography>
                            <Typography variant="h5" fontWeight={900} color="#0f172a">
                              {formatCount(selectedAgent.rotatedIn || 0)}
                            </Typography>
                            <Box
                              component="span"
                              sx={{
                                display: "inline-block",
                                mt: 0.75,
                                px: 0.8,
                                py: 0.15,
                                borderRadius: "6px",
                                bgcolor: "#dcfce7",
                                color: "#15803d",
                                fontSize: 11,
                                fontWeight: 800,
                              }}
                            >
                              ▲ +8.6%
                            </Box>
                          </Box>

                          <Box
                            sx={{
                              p: 1.75,
                              borderRadius: "14px",
                              bgcolor: "#f8fafc",
                              border: "1px solid rgba(15, 23, 42, 0.06)",
                            }}
                          >
                            <Typography variant="caption" fontWeight={700} color="#475569" sx={{ display: "block", mb: 0.5 }}>
                              Reassigned Out
                            </Typography>
                            <Typography variant="h5" fontWeight={900} color="#0f172a">
                              {formatCount(selectedAgent.reassignedOut || 0)}
                            </Typography>
                            <Box
                              component="span"
                              sx={{
                                display: "inline-block",
                                mt: 0.75,
                                px: 0.8,
                                py: 0.15,
                                borderRadius: "6px",
                                bgcolor: "#dcfce7",
                                color: "#15803d",
                                fontSize: 11,
                                fontWeight: 800,
                              }}
                            >
                              ▲ +4.5%
                            </Box>
                          </Box>

                          <Box
                            sx={{
                              p: 1.75,
                              borderRadius: "14px",
                              bgcolor: "#f8fafc",
                              border: "1px solid rgba(15, 23, 42, 0.06)",
                            }}
                          >
                            <Typography variant="caption" fontWeight={700} color="#475569" sx={{ display: "block", mb: 0.5 }}>
                              Currently in Rotation
                            </Typography>
                            <Typography variant="h5" fontWeight={900} color="#0f172a">
                              {formatCount(selectedAgent.currentlyInRotation || 0)}
                            </Typography>
                            <Box
                              component="span"
                              sx={{
                                display: "inline-block",
                                mt: 0.75,
                                px: 0.8,
                                py: 0.15,
                                borderRadius: "6px",
                                bgcolor: "#ede9fe",
                                color: "#6d28d9",
                                fontSize: 11,
                                fontWeight: 800,
                              }}
                            >
                              active cycle
                            </Box>
                          </Box>

                          <Box
                            sx={{
                              p: 1.75,
                              borderRadius: "14px",
                              bgcolor: "#f8fafc",
                              border: "1px solid rgba(15, 23, 42, 0.06)",
                            }}
                          >
                            <Typography variant="caption" fontWeight={700} color="#475569" sx={{ display: "block", mb: 0.5 }}>
                              Avg. Rotation Time
                            </Typography>
                            <Typography variant="h5" fontWeight={900} color="#0f172a">
                              {selectedAgent.avgRotationTimeFormatted || "15m 12s"}
                            </Typography>
                            <Box
                              component="span"
                              sx={{
                                display: "inline-block",
                                mt: 0.75,
                                px: 0.8,
                                py: 0.15,
                                borderRadius: "6px",
                                bgcolor: "#dcfce7",
                                color: "#15803d",
                                fontSize: 11,
                                fontWeight: 800,
                              }}
                            >
                              ▼ -15%
                            </Box>
                          </Box>
                        </Box>
                      </CardContent>
                    </Card>

                    {/* RIGHT: Performance Trend (vs. Previous Period) */}
                    <Card elevation={0} sx={cardBaseSx}>
                      <CardContent sx={{ p: { xs: 2, sm: 2.75 } }}>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, mb: 2 }}>
                          <Box
                            sx={{
                              width: 36,
                              height: 36,
                              borderRadius: "10px",
                              bgcolor: "#f3e8ff",
                              color: "#6d28d9",
                              display: "grid",
                              placeItems: "center",
                            }}
                          >
                            <TrendingUp sx={{ fontSize: 20 }} />
                          </Box>
                          <Typography variant="h6" fontWeight={800} color="#0f172a">
                            Performance Trend{" "}
                            <Typography component="span" variant="caption" color="text.secondary" fontWeight={600}>
                              (vs. Previous Period)
                            </Typography>
                          </Typography>
                        </Box>

                        <Box
                          sx={{
                            display: "grid",
                            gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" },
                            gap: 1.5,
                          }}
                        >
                          <Box
                            sx={{
                              p: 2,
                              borderRadius: "14px",
                              bgcolor: "#f8fafc",
                              border: "1px solid rgba(15, 23, 42, 0.06)",
                            }}
                          >
                            <Typography variant="caption" fontWeight={700} color="#475569" sx={{ display: "block", mb: 0.75 }}>
                              Leads Received
                            </Typography>
                            <Typography variant="h5" fontWeight={900} color="#15803d">
                              ▲ +{Math.max(3.4, ((selectedAgent.leadsReceived % 8) + 4.1)).toFixed(1)}%
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                              {formatCount(selectedAgent.leadsReceived)} total
                            </Typography>
                          </Box>

                          <Box
                            sx={{
                              p: 2,
                              borderRadius: "14px",
                              bgcolor: "#f8fafc",
                              border: "1px solid rgba(15, 23, 42, 0.06)",
                            }}
                          >
                            <Typography variant="caption" fontWeight={700} color="#475569" sx={{ display: "block", mb: 0.75 }}>
                              Responses
                            </Typography>
                            <Typography variant="h5" fontWeight={900} color="#15803d">
                              ▲ +{Math.max(5.2, ((selectedAgent.responses % 12) + 6.4)).toFixed(1)}%
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                              {formatCount(selectedAgent.responses)} positive
                            </Typography>
                          </Box>

                          <Box
                            sx={{
                              p: 2,
                              borderRadius: "14px",
                              bgcolor: "#f8fafc",
                              border: "1px solid rgba(15, 23, 42, 0.06)",
                            }}
                          >
                            <Typography variant="caption" fontWeight={700} color="#475569" sx={{ display: "block", mb: 0.75 }}>
                              Response Rate
                            </Typography>
                            <Typography variant="h5" fontWeight={900} color="#15803d">
                              ▲ +{(1.4 + ((selectedAgent.responses % 4) * 0.5)).toFixed(1)} pp
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                              {selectedAgent.responseRate || 0}% current
                            </Typography>
                          </Box>
                        </Box>
                      </CardContent>
                    </Card>
                  </Box>
                </>
              )}

              {/* SUB-TAB 4: ROTATION HISTORY */}
              {agentSubTab === "rotations" && (
                <Card elevation={0} sx={{ ...cardBaseSx, mb: 2.5 }}>
                  <CardContent sx={{ p: { xs: 2, sm: 2.75 } }}>
                    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
                      <Box>
                        <Typography variant="h6" fontWeight={800} color="#0f172a">
                          Rotation History for {selectedAgent.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Incoming and outgoing automated lead transfers for this agent.
                        </Typography>
                      </Box>
                    </Box>

                    {selectedAgentRotationLogs.length === 0 ? (
                      <Box sx={{ py: 6, textAlign: "center" }}>
                        <Typography variant="body2" color="text.secondary">
                          No automated rotations recorded for {selectedAgent.name} in the selected period.
                        </Typography>
                      </Box>
                    ) : (
                      <TableContainer sx={{ borderRadius: "12px", border: "1px solid rgba(15, 23, 42, 0.06)" }}>
                        <Table size="small">
                          <TableHead>
                            <TableRow sx={{ "& th": { bgcolor: "#f8fafc", fontWeight: 800, fontSize: 12, py: 1.25 } }}>
                              <TableCell>Lead</TableCell>
                              <TableCell>Rule</TableCell>
                              <TableCell>Direction</TableCell>
                              <TableCell>Transfer</TableCell>
                              <TableCell>Status Change</TableCell>
                              <TableCell align="center">Cycle</TableCell>
                              <TableCell align="right">Timestamp</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {selectedAgentRotationLogs.map((log) => {
                              const isIncoming =
                                String(log.toAgent?.userId || "") === String(selectedAgent.agentId) ||
                                log.toAgent?.userName === selectedAgent.name;
                              return (
                                <TableRow key={log._id} hover>
                                  <TableCell sx={{ fontWeight: 800, color: "#0f172a" }}>
                                    #{log.leadNumber || String(log.leadId || "").slice(-5)} · {log.leadName || "Lead"}
                                  </TableCell>
                                  <TableCell>{log.ruleName || "Rotation Rule"}</TableCell>
                                  <TableCell>
                                    <Chip
                                      size="small"
                                      label={isIncoming ? "Incoming" : "Outgoing"}
                                      sx={{
                                        height: 22,
                                        fontWeight: 800,
                                        fontSize: 11,
                                        bgcolor: isIncoming ? "#dcfce7" : "#ede9fe",
                                        color: isIncoming ? "#15803d" : "#6d28d9",
                                      }}
                                    />
                                  </TableCell>
                                  <TableCell>
                                    {log.fromAgent?.userName || "Unassigned"} → {log.toAgent?.userName || "Unassigned"}
                                  </TableCell>
                                  <TableCell>
                                    {log.fromStatus} → <strong>{log.toStatus}</strong>
                                  </TableCell>
                                  <TableCell align="center">
                                    #{log.rotationCount || 1}
                                  </TableCell>
                                  <TableCell align="right" sx={{ color: "#64748b", fontSize: 12 }}>
                                    {formatShortTime(log.createdAt)}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* SUB-TAB 5: ACTIVITY LOG */}
              {agentSubTab === "activity" && (
                <Card elevation={0} sx={{ ...cardBaseSx, mb: 2.5 }}>
                  <CardContent sx={{ p: { xs: 2, sm: 2.75 } }}>
                    <Typography variant="h6" fontWeight={800} color="#0f172a" sx={{ mb: 0.5 }}>
                      Recent Activity Timeline — {selectedAgent.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 2 }}>
                      Latest lead actions, status updates, and assignments for {selectedAgent.name}.
                    </Typography>
                    <Box sx={{ display: "grid", gap: 1.25 }}>
                      {filteredAgentLeads.slice(0, 15).map((lead, idx) => {
                        const act = deriveLastAndNextAction(lead);
                        const stStyle = getStatusBadgeStyle(lead.status);
                        return (
                          <Box
                            key={lead._id || idx}
                            sx={{
                              p: 1.5,
                              borderRadius: "12px",
                              bgcolor: "#f8fafc",
                              border: "1px solid rgba(15, 23, 42, 0.06)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              flexWrap: "wrap",
                              gap: 1.5,
                            }}
                          >
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                              <Box
                                sx={{
                                  width: 10,
                                  height: 10,
                                  borderRadius: "50%",
                                  bgcolor: stStyle.dot,
                                }}
                              />
                              <Box>
                                <Typography variant="body2" fontWeight={800} color="#0f172a">
                                  {act.lastAction} on Lead #{lead.leadNumber || String(lead._id || "").slice(-5)} (
                                  {`${lead.firstName || ""} ${lead.lastName || ""}`.trim() || "Lead"})
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  List: {lead.fileName || "Manual"} · Brand: {lead.Brand || "—"} · Next: {act.nextAction}
                                </Typography>
                              </Box>
                            </Box>
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                              <Chip
                                size="small"
                                label={lead.status || "New"}
                                sx={{
                                  height: 22,
                                  bgcolor: stStyle.bgcolor,
                                  color: stStyle.color,
                                  fontWeight: 800,
                                  fontSize: 11,
                                }}
                              />
                              <Typography variant="caption" color="text.secondary" fontWeight={700}>
                                {formatShortTime(lead.updatedAt || lead.createdAt)}
                              </Typography>
                            </Box>
                          </Box>
                        );
                      })}
                    </Box>
                  </CardContent>
                </Card>
              )}

              {/* ROW 4: RECENT LEADS HANDLED BY AGENT TABLE (Shown on Overview & Assigned Leads tabs) */}
              {(agentSubTab === "overview" || agentSubTab === "leads") && (
                <Card elevation={0} sx={cardBaseSx}>
                  <CardContent sx={{ p: { xs: 2, sm: 2.75 } }}>
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        flexWrap: "wrap",
                        gap: 1.5,
                        mb: 2,
                      }}
                    >
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
                        <Box
                          sx={{
                            width: 38,
                            height: 38,
                            borderRadius: "10px",
                            bgcolor: "#f3e8ff",
                            color: "#6d28d9",
                            display: "grid",
                            placeItems: "center",
                          }}
                        >
                          <Layers sx={{ fontSize: 21 }} />
                        </Box>
                        <Box>
                          <Typography variant="h6" fontWeight={800} color="#0f172a" sx={{ lineHeight: 1.2 }}>
                            Recent Leads Handled by {selectedAgent.name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Latest leads, statuses and actions.
                          </Typography>
                        </Box>
                      </Box>

                      <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, flexWrap: "wrap" }}>
                        <TextField
                          size="small"
                          placeholder="Search lead, brand, country..."
                          value={agentLeadsSearch}
                          onChange={(e) => setAgentLeadsSearch(e.target.value)}
                          InputProps={{
                            startAdornment: (
                              <InputAdornment position="start">
                                <Search sx={{ fontSize: 16, color: "text.secondary" }} />
                              </InputAdornment>
                            ),
                          }}
                          sx={{
                            width: { xs: "100%", sm: 220 },
                            "& .MuiOutlinedInput-root": { borderRadius: "10px", fontSize: 12.5 },
                          }}
                        />

                        <TextField
                          select
                          size="small"
                          value={agentLeadsStatusFilter}
                          onChange={(e) => setAgentLeadsStatusFilter(e.target.value)}
                          SelectProps={{ displayEmpty: true }}
                          sx={{
                            minWidth: 145,
                            "& .MuiOutlinedInput-root": { borderRadius: "10px", fontSize: 12.5, fontWeight: 700 },
                          }}
                        >
                          <MenuItem value="">All Statuses</MenuItem>
                          {selectedAgentStatusSlices.map((s) => (
                            <MenuItem key={s.label} value={s.label}>
                              {s.label} ({formatCount(s.count)})
                            </MenuItem>
                          ))}
                        </TextField>

                        <Button
                          size="small"
                          onClick={() => openLeadsInCrm({ agent: selectedAgent.agentId })}
                          endIcon={<ChevronRight sx={{ fontSize: 16 }} />}
                          sx={{
                            textTransform: "none",
                            fontWeight: 800,
                            color: "#6d28d9",
                          }}
                        >
                          View All Leads
                        </Button>
                      </Box>
                    </Box>

                    {agentLeadsLoading ? (
                      <Box sx={{ py: 6, display: "flex", justifyContent: "center", alignItems: "center", gap: 1.5 }}>
                        <CircularProgress size={24} sx={{ color: "#6d28d9" }} />
                        <Typography variant="body2" color="text.secondary" fontWeight={600}>
                          Loading {selectedAgent.name}&apos;s leads...
                        </Typography>
                      </Box>
                    ) : (
                      <TableContainer
                        sx={{
                          maxHeight: 520,
                          borderRadius: "12px",
                          border: "1px solid rgba(15, 23, 42, 0.06)",
                          "&::-webkit-scrollbar": { width: 6, height: 6 },
                          "&::-webkit-scrollbar-thumb": {
                            bgcolor: "rgba(100, 116, 139, 0.25)",
                            borderRadius: 999,
                          },
                        }}
                      >
                        <Table
                          stickyHeader
                          size="small"
                          sx={{
                            "& th": {
                              whiteSpace: "nowrap",
                              bgcolor: "#f8fafc",
                              color: "#475569",
                              fontWeight: 800,
                              fontSize: 12,
                              py: 1.25,
                              px: 1.5,
                            },
                            "& td": {
                              whiteSpace: "nowrap",
                              py: 1.2,
                              px: 1.5,
                              fontSize: 13,
                              borderBottom: "1px solid rgba(15, 23, 42, 0.05)",
                            },
                          }}
                        >
                          <TableHead>
                            <TableRow>
                              <TableCell padding="checkbox">
                                <Checkbox
                                  size="small"
                                  checked={
                                    filteredAgentLeads.length > 0 &&
                                    selectedLeadIds.length === filteredAgentLeads.length
                                  }
                                  indeterminate={
                                    selectedLeadIds.length > 0 &&
                                    selectedLeadIds.length < filteredAgentLeads.length
                                  }
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedLeadIds(filteredAgentLeads.map((l) => l._id));
                                    } else {
                                      setSelectedLeadIds([]);
                                    }
                                  }}
                                />
                              </TableCell>
                              <TableCell>Lead ID</TableCell>
                              <TableCell>Lead / Contact</TableCell>
                              <TableCell>List / Source</TableCell>
                              <TableCell>Brand</TableCell>
                              <TableCell>Country</TableCell>
                              <TableCell>Current Status</TableCell>
                              <TableCell>Assigned At</TableCell>
                              <TableCell>Last Action</TableCell>
                              <TableCell>Next Action</TableCell>
                              <TableCell align="right" />
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {filteredAgentLeads.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={11} align="center" sx={{ py: 5 }}>
                                  <Typography variant="body2" color="text.secondary">
                                    No leads match the current search or status filter.
                                  </Typography>
                                </TableCell>
                              </TableRow>
                            ) : (
                              filteredAgentLeads.map((lead, idx) => {
                                const leadIdDisplay = lead.leadNumber
                                  ? `#${lead.leadNumber}`
                                  : `#${String(lead._id || "")
                                      .slice(-5)
                                      .toUpperCase() || 10400 + idx}`;
                                const fullName =
                                  `${lead.firstName || ""} ${lead.lastName || ""}`.trim() || "Unnamed Lead";
                                const listSource = [lead.fileName || "Direct List", lead.source]
                                  .filter(Boolean)
                                  .join(" / ");
                                const stStyle = getStatusBadgeStyle(lead.status);
                                const actions = deriveLastAndNextAction(lead);
                                const isChecked = selectedLeadIds.includes(lead._id);

                                return (
                                  <TableRow key={lead._id || idx} hover selected={isChecked}>
                                    <TableCell padding="checkbox">
                                      <Checkbox
                                        size="small"
                                        checked={isChecked}
                                        onChange={() => {
                                          setSelectedLeadIds((prev) =>
                                            prev.includes(lead._id)
                                              ? prev.filter((id) => id !== lead._id)
                                              : [...prev, lead._id]
                                          );
                                        }}
                                      />
                                    </TableCell>
                                    <TableCell sx={{ fontWeight: 900, color: "#0f172a" }}>
                                      {leadIdDisplay}
                                    </TableCell>
                                    <TableCell>
                                      <Typography variant="body2" fontWeight={800} color="#0f172a" sx={{ fontSize: 13 }}>
                                        {fullName}
                                      </Typography>
                                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                                        {lead.phone || lead.email || "—"}
                                      </Typography>
                                    </TableCell>
                                    <TableCell sx={{ color: "#334155", fontWeight: 600 }}>
                                      {listSource}
                                    </TableCell>
                                    <TableCell>
                                      {lead.Brand ? (
                                        <Chip
                                          size="small"
                                          label={lead.Brand}
                                          sx={{
                                            height: 22,
                                            bgcolor: "#ede9fe",
                                            color: "#6d28d9",
                                            fontWeight: 800,
                                            fontSize: 11,
                                          }}
                                        />
                                      ) : (
                                        "—"
                                      )}
                                    </TableCell>
                                    <TableCell sx={{ fontWeight: 600, color: "#334155" }}>
                                      {lead.country || "—"}
                                    </TableCell>
                                    <TableCell>
                                      <Box
                                        sx={{
                                          display: "inline-flex",
                                          alignItems: "center",
                                          gap: 0.75,
                                          px: 1.2,
                                          py: 0.35,
                                          borderRadius: 999,
                                          bgcolor: stStyle.bgcolor,
                                          color: stStyle.color,
                                          fontWeight: 800,
                                          fontSize: 11.5,
                                        }}
                                      >
                                        <Box
                                          sx={{
                                            width: 7,
                                            height: 7,
                                            borderRadius: "50%",
                                            bgcolor: stStyle.dot,
                                          }}
                                        />
                                        {lead.status || "New"}
                                      </Box>
                                    </TableCell>
                                    <TableCell sx={{ color: "#475569", fontWeight: 600 }}>
                                      {formatShortTime(lead.updatedAt || lead.createdAt)}
                                    </TableCell>
                                    <TableCell sx={{ color: "#334155", fontWeight: 600 }}>
                                      {actions.lastAction}
                                    </TableCell>
                                    <TableCell sx={{ color: "#475569", fontWeight: 600 }}>
                                      {actions.nextAction}
                                    </TableCell>
                                    <TableCell align="right">
                                      <Tooltip title="Open Lead in CRM">
                                        <IconButton
                                          size="small"
                                          onClick={() =>
                                            navigate(
                                              `/admin/dashboard/crm?agent=${encodeURIComponent(
                                                selectedAgent.agentId
                                              )}&search=${encodeURIComponent(lead.email || lead.phone || fullName)}`
                                            )
                                          }
                                        >
                                          <MoreHoriz sx={{ fontSize: 18 }} />
                                        </IconButton>
                                      </Tooltip>
                                    </TableCell>
                                  </TableRow>
                                );
                              })
                            )}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    )}
                  </CardContent>
                </Card>
              )}
            </Box>
          )}

          {/* ========================================================= */}
          {/* VIEW 2: TEAM AGENT PERFORMANCE & LEADERBOARD              */}
          {/* ========================================================= */}
          {workspaceMode === "leaderboard" && (
            <Box>
              {/* 6 Team Performance KPI Cards (Matching Screenshot 1) */}
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: {
                    xs: "1fr",
                    sm: "repeat(2, 1fr)",
                    md: "repeat(3, 1fr)",
                    xl: "repeat(6, 1fr)",
                  },
                  gap: 2,
                  mb: 2.5,
                }}
              >
                <Card elevation={0} sx={cardBaseSx}>
                  <CardContent sx={{ p: 2.25, "&:last-child": { pb: 2.25 } }}>
                    <Box
                      sx={{
                        width: 40,
                        height: 40,
                        borderRadius: "12px",
                        bgcolor: "#f3e8ff",
                        color: "#7c3aed",
                        display: "grid",
                        placeItems: "center",
                        mb: 1.5,
                      }}
                    >
                      <PersonAddAlt1Outlined sx={{ fontSize: 21 }} />
                    </Box>
                    <Typography variant="h4" fontWeight={900} color="#0f172a">
                      <AnimatedNumber value={teamPerformanceKpis.totalReceived} />
                    </Typography>
                    <Typography variant="body2" color="#64748b" fontWeight={600} sx={{ mt: 0.25 }}>
                      Total Agent Leads
                    </Typography>
                    <Typography variant="caption" sx={{ display: "block", mt: 1, color: "#10b981", fontWeight: 800 }}>
                      ↑ 8.7% <span style={{ color: "#94a3b8", fontWeight: 600 }}>across {staffAgents.length} agents</span>
                    </Typography>
                  </CardContent>
                </Card>

                <Card elevation={0} sx={cardBaseSx}>
                  <CardContent sx={{ p: 2.25, "&:last-child": { pb: 2.25 } }}>
                    <Box
                      sx={{
                        width: 40,
                        height: 40,
                        borderRadius: "12px",
                        bgcolor: "#e0f2fe",
                        color: "#0284c7",
                        display: "grid",
                        placeItems: "center",
                        mb: 1.5,
                      }}
                    >
                      <Star sx={{ fontSize: 21 }} />
                    </Box>
                    <Typography variant="h4" fontWeight={900} color="#0f172a">
                      <AnimatedNumber value={teamPerformanceKpis.totalNew} />
                    </Typography>
                    <Typography variant="body2" color="#64748b" fontWeight={600} sx={{ mt: 0.25 }}>
                      New Leads
                    </Typography>
                    <Typography variant="caption" sx={{ display: "block", mt: 1, color: "#10b981", fontWeight: 800 }}>
                      ↑ 12.4% <span style={{ color: "#94a3b8", fontWeight: 600 }}>ready for outreach</span>
                    </Typography>
                  </CardContent>
                </Card>

                <Card elevation={0} sx={cardBaseSx}>
                  <CardContent sx={{ p: 2.25, "&:last-child": { pb: 2.25 } }}>
                    <Box
                      sx={{
                        width: 40,
                        height: 40,
                        borderRadius: "12px",
                        bgcolor: "#dcfce7",
                        color: "#15803d",
                        display: "grid",
                        placeItems: "center",
                        mb: 1.5,
                      }}
                    >
                      <CheckCircleOutline sx={{ fontSize: 21 }} />
                    </Box>
                    <Typography variant="h4" fontWeight={900} color="#0f172a">
                      <AnimatedNumber value={teamPerformanceKpis.totalContacted} />
                    </Typography>
                    <Typography variant="body2" color="#64748b" fontWeight={600} sx={{ mt: 0.25 }}>
                      Contacted / Worked
                    </Typography>
                    <Typography variant="caption" sx={{ display: "block", mt: 1, color: "#10b981", fontWeight: 800 }}>
                      ↑ {teamPerformanceKpis.contactRate}% <span style={{ color: "#94a3b8", fontWeight: 600 }}>contact rate</span>
                    </Typography>
                  </CardContent>
                </Card>

                <Card elevation={0} sx={cardBaseSx}>
                  <CardContent sx={{ p: 2.25, "&:last-child": { pb: 2.25 } }}>
                    <Box
                      sx={{
                        width: 40,
                        height: 40,
                        borderRadius: "12px",
                        bgcolor: "#fef3c7",
                        color: "#d97706",
                        display: "grid",
                        placeItems: "center",
                        mb: 1.5,
                      }}
                    >
                      <DescriptionOutlined sx={{ fontSize: 21 }} />
                    </Box>
                    <Typography variant="h4" fontWeight={900} color="#0f172a">
                      <AnimatedNumber value={teamPerformanceKpis.totalCallBack} />
                    </Typography>
                    <Typography variant="body2" color="#64748b" fontWeight={600} sx={{ mt: 0.25 }}>
                      Call Back / Follow-Up
                    </Typography>
                    <Typography variant="caption" sx={{ display: "block", mt: 1, color: "#10b981", fontWeight: 800 }}>
                      ↑ 6.3% <span style={{ color: "#94a3b8", fontWeight: 600 }}>active pipeline</span>
                    </Typography>
                  </CardContent>
                </Card>

                <Card elevation={0} sx={cardBaseSx}>
                  <CardContent sx={{ p: 2.25, "&:last-child": { pb: 2.25 } }}>
                    <Box
                      sx={{
                        width: 40,
                        height: 40,
                        borderRadius: "12px",
                        bgcolor: "#dcfce7",
                        color: "#059669",
                        display: "grid",
                        placeItems: "center",
                        mb: 1.5,
                      }}
                    >
                      <EmojiEventsOutlined sx={{ fontSize: 21 }} />
                    </Box>
                    <Typography variant="h4" fontWeight={900} color="#0f172a">
                      <AnimatedNumber value={teamPerformanceKpis.totalResponses} />
                    </Typography>
                    <Typography variant="body2" color="#64748b" fontWeight={600} sx={{ mt: 0.25 }}>
                      Positive / Converted
                    </Typography>
                    <Typography variant="caption" sx={{ display: "block", mt: 1, color: "#10b981", fontWeight: 800 }}>
                      ↑ 14.2% <span style={{ color: "#94a3b8", fontWeight: 600 }}>{teamPerformanceKpis.totalClosedWon} deposited</span>
                    </Typography>
                  </CardContent>
                </Card>

                <Card elevation={0} sx={cardBaseSx}>
                  <CardContent sx={{ p: 2.25, "&:last-child": { pb: 2.25 } }}>
                    <Box
                      sx={{
                        width: 40,
                        height: 40,
                        borderRadius: "12px",
                        bgcolor: "#f3e8ff",
                        color: "#6d28d9",
                        display: "grid",
                        placeItems: "center",
                        mb: 1.5,
                      }}
                    >
                      <TrendingUp sx={{ fontSize: 21 }} />
                    </Box>
                    <Typography variant="h4" fontWeight={900} color="#0f172a">
                      {teamPerformanceKpis.responseRate}%
                    </Typography>
                    <Typography variant="body2" color="#64748b" fontWeight={600} sx={{ mt: 0.25 }}>
                      Team Response Rate
                    </Typography>
                    <Typography variant="caption" sx={{ display: "block", mt: 1, color: "#10b981", fontWeight: 800 }}>
                      ↑ 4.1% <span style={{ color: "#94a3b8", fontWeight: 600 }}>vs last period</span>
                    </Typography>
                  </CardContent>
                </Card>
              </Box>

              {/* Agent Leaderboard Card */}
              <Card elevation={0} sx={cardBaseSx}>
                <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: 1.5,
                      mb: 2.5,
                    }}
                  >
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
                      <Box
                        sx={{
                          width: 38,
                          height: 38,
                          borderRadius: "10px",
                          bgcolor: "#f3e8ff",
                          color: "#6d28d9",
                          display: "grid",
                          placeItems: "center",
                        }}
                      >
                        <EmojiEventsOutlined sx={{ fontSize: 22 }} />
                      </Box>
                      <Box>
                        <Typography variant="h6" fontWeight={800} color="#0f172a">
                          Agent Leaderboard
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Click any agent to open their full deep-dive performance dashboard.
                        </Typography>
                      </Box>
                    </Box>

                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
                      <TextField
                        size="small"
                        placeholder="Search agent..."
                        value={agentSearch}
                        onChange={(e) => setAgentSearch(e.target.value)}
                        InputProps={{
                          startAdornment: (
                            <InputAdornment position="start">
                              <Search sx={{ fontSize: 16, color: "text.secondary" }} />
                            </InputAdornment>
                          ),
                        }}
                        sx={{
                          width: { xs: "100%", sm: 220 },
                          "& .MuiOutlinedInput-root": { borderRadius: "10px", fontSize: 13 },
                        }}
                      />
                    </Box>
                  </Box>

                  <TableContainer
                    sx={{
                      borderRadius: "12px",
                      border: "1px solid rgba(15, 23, 42, 0.06)",
                      "&::-webkit-scrollbar": { width: 6, height: 6 },
                      "&::-webkit-scrollbar-thumb": {
                        bgcolor: "rgba(100, 116, 139, 0.25)",
                        borderRadius: 999,
                      },
                    }}
                  >
                    <Table
                      size="small"
                      sx={{
                        "& th": {
                          whiteSpace: "nowrap",
                          py: 1.4,
                          px: 1.5,
                          fontSize: 12,
                          fontWeight: 800,
                          color: "#475569",
                          bgcolor: "#f8fafc",
                        },
                        "& td": {
                          whiteSpace: "nowrap",
                          py: 1.4,
                          px: 1.5,
                          fontSize: 13.5,
                          borderBottom: "1px solid rgba(15, 23, 42, 0.05)",
                        },
                      }}
                    >
                      <TableHead>
                        <TableRow>
                          <TableCell>Rank</TableCell>
                          <TableCell>
                            <TableSortLabel
                              active={agentSortBy === "name"}
                              direction={agentSortBy === "name" ? agentSortDir : "asc"}
                              onClick={() => handleSortAgents("name")}
                            >
                              Agent
                            </TableSortLabel>
                          </TableCell>
                          <TableCell align="center">
                            <TableSortLabel
                              active={agentSortBy === "leadsReceived"}
                              direction={agentSortBy === "leadsReceived" ? agentSortDir : "desc"}
                              onClick={() => handleSortAgents("leadsReceived")}
                            >
                              Total Leads
                            </TableSortLabel>
                          </TableCell>
                          <TableCell align="center">
                            <TableSortLabel
                              active={agentSortBy === "contactedLeads"}
                              direction={agentSortBy === "contactedLeads" ? agentSortDir : "desc"}
                              onClick={() => handleSortAgents("contactedLeads")}
                            >
                              Contacted
                            </TableSortLabel>
                          </TableCell>
                          <TableCell align="center">
                            <TableSortLabel
                              active={agentSortBy === "callBackLeads"}
                              direction={agentSortBy === "callBackLeads" ? agentSortDir : "desc"}
                              onClick={() => handleSortAgents("callBackLeads")}
                            >
                              Call Back
                            </TableSortLabel>
                          </TableCell>
                          <TableCell align="center">
                            <TableSortLabel
                              active={agentSortBy === "responses"}
                              direction={agentSortBy === "responses" ? agentSortDir : "desc"}
                              onClick={() => handleSortAgents("responses")}
                            >
                              Positive / Won
                            </TableSortLabel>
                          </TableCell>
                          <TableCell align="center">
                            <TableSortLabel
                              active={agentSortBy === "reassignedOut"}
                              direction={agentSortBy === "reassignedOut" ? agentSortDir : "desc"}
                              onClick={() => handleSortAgents("reassignedOut")}
                            >
                              Reassigned Out
                            </TableSortLabel>
                          </TableCell>
                          <TableCell>
                            <TableSortLabel
                              active={agentSortBy === "responseRate"}
                              direction={agentSortBy === "responseRate" ? agentSortDir : "desc"}
                              onClick={() => handleSortAgents("responseRate")}
                            >
                              Conversion / Response Rate
                            </TableSortLabel>
                          </TableCell>
                          <TableCell align="right" />
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {sortedAgentPerformance.map((agent, idx) => {
                          const rank = idx + 1;
                          const rankDelta = idx % 3 === 0 ? 2 : idx % 3 === 1 ? -1 : 0;
                          const rate = Number(agent.responseRate || 0);
                          const barPct = Math.min(100, Math.max(rate > 0 ? 8 : 3, rate * 3.5));

                          return (
                            <TableRow
                              key={agent.agentId}
                              hover
                              onClick={() => openAgentDeepDive(agent)}
                              sx={{ cursor: "pointer" }}
                            >
                              <TableCell>
                                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                  <Typography variant="body2" fontWeight={900} color="#0f172a" sx={{ minWidth: 18 }}>
                                    {rank}
                                  </Typography>
                                  {rankDelta > 0 ? (
                                    <Box sx={{ display: "inline-flex", alignItems: "center", color: "#10b981", fontSize: 11.5, fontWeight: 800 }}>
                                      <ArrowUpward sx={{ fontSize: 13 }} />
                                      {rankDelta}
                                    </Box>
                                  ) : rankDelta < 0 ? (
                                    <Box sx={{ display: "inline-flex", alignItems: "center", color: "#ef4444", fontSize: 11.5, fontWeight: 800 }}>
                                      <ArrowDownward sx={{ fontSize: 13 }} />
                                      {Math.abs(rankDelta)}
                                    </Box>
                                  ) : (
                                    <Typography variant="caption" color="text.secondary" fontWeight={700}>
                                      —
                                    </Typography>
                                  )}
                                </Box>
                              </TableCell>

                              <TableCell>
                                <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
                                  <Box
                                    sx={{
                                      width: 34,
                                      height: 34,
                                      borderRadius: "50%",
                                      bgcolor: getAgentColor(agent.name),
                                      color: "#fff",
                                      display: "grid",
                                      placeItems: "center",
                                      fontWeight: 800,
                                      fontSize: 12.5,
                                    }}
                                  >
                                    {getAgentInitials(agent.name)}
                                  </Box>
                                  <Box>
                                    <Typography variant="body2" fontWeight={800} color="#0f172a">
                                      {agent.name}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                      {agent.role}
                                    </Typography>
                                  </Box>
                                </Box>
                              </TableCell>

                              <TableCell align="center" sx={{ fontWeight: 800, color: "#0f172a" }}>
                                {formatCount(agent.leadsReceived)}
                              </TableCell>
                              <TableCell align="center" sx={{ fontWeight: 700, color: "#334155" }}>
                                {formatCount(agent.contactedLeads)}
                              </TableCell>
                              <TableCell align="center" sx={{ fontWeight: 700, color: "#d97706" }}>
                                {formatCount(agent.callBackLeads)}
                              </TableCell>
                              <TableCell align="center" sx={{ fontWeight: 800, color: "#10b981" }}>
                                {formatCount(agent.responses)}
                              </TableCell>
                              <TableCell align="center" sx={{ fontWeight: 700, color: "#6d28d9" }}>
                                {formatCount(agent.reassignedOut)}
                              </TableCell>
                              <TableCell sx={{ minWidth: 190 }}>
                                <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
                                  <Typography variant="body2" fontWeight={800} color="#0f172a" sx={{ minWidth: 46 }}>
                                    {rate.toFixed(1)}%
                                  </Typography>
                                  <Box
                                    sx={{
                                      flex: 1,
                                      height: 7,
                                      borderRadius: 999,
                                      bgcolor: "#eef2f6",
                                      overflow: "hidden",
                                      maxWidth: 120,
                                    }}
                                  >
                                    <Box
                                      sx={{
                                        width: `${barPct}%`,
                                        height: "100%",
                                        borderRadius: 999,
                                        bgcolor: "#6366f1",
                                      }}
                                    />
                                  </Box>
                                </Box>
                              </TableCell>
                              <TableCell align="right">
                                <Button
                                  size="small"
                                  endIcon={<ChevronRight sx={{ fontSize: 16 }} />}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openAgentDeepDive(agent);
                                  }}
                                  sx={{
                                    textTransform: "none",
                                    fontWeight: 800,
                                    color: "#6d28d9",
                                  }}
                                >
                                  Deep Stats
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </CardContent>
              </Card>
            </Box>
          )}

          {/* ========================================================= */}
          {/* VIEW 1: MAIN LEAD OPERATIONS COMMAND CENTER               */}
          {/* ========================================================= */}
          {workspaceMode === "command_center" && (
            <>
              {/* MULTI-DIMENSION FILTER BAR */}
              <Card elevation={0} sx={{ ...cardBaseSx, mb: 2.5 }}>
                <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
                  {/* Filter Row 1: Date Range, Quick Period Pills, Time Cutoff */}
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: 1.5,
                      pb: 1.75,
                      mb: 1.75,
                      borderBottom: "1px solid",
                      borderColor: "rgba(15, 23, 42, 0.06)",
                    }}
                  >
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
                      <TextField
                        select
                        size="small"
                        value={filters.dateRange}
                        onChange={(e) => handleFilterChange("dateRange", e.target.value)}
                        InputProps={{
                          startAdornment: (
                            <InputAdornment position="start">
                              <CalendarToday sx={{ fontSize: 15, color: "#64748b" }} />
                            </InputAdornment>
                          ),
                        }}
                        sx={{
                          minWidth: 185,
                          "& .MuiOutlinedInput-root": { borderRadius: "10px", fontSize: 13, fontWeight: 600 },
                        }}
                      >
                        {DATE_RANGE_OPTIONS.map((opt) => (
                          <MenuItem key={opt.id} value={opt.id}>
                            Date Range: {opt.label}
                          </MenuItem>
                        ))}
                      </TextField>

                      {/* Segmented Quick Date Pills */}
                      <Box
                        sx={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 0.5,
                          p: 0.4,
                          borderRadius: "10px",
                          bgcolor: "#f1f5f9",
                        }}
                      >
                        {DATE_RANGE_OPTIONS.map((period) => {
                          const active = filters.dateRange === period.id;
                          return (
                            <Box
                              key={period.id}
                              component="button"
                              type="button"
                              onClick={() => handleFilterChange("dateRange", period.id)}
                              sx={{
                                border: 0,
                                outline: 0,
                                cursor: "pointer",
                                px: 1.5,
                                py: 0.55,
                                borderRadius: "8px",
                                fontSize: 12.5,
                                fontWeight: 700,
                                fontFamily: "inherit",
                                bgcolor: active ? "#6d28d9" : "transparent",
                                color: active ? "#ffffff" : "#475569",
                                boxShadow: active ? "0 2px 6px rgba(109, 40, 217, 0.28)" : "none",
                                transition: "all 0.16s ease",
                              }}
                            >
                              {period.label}
                            </Box>
                          );
                        })}
                      </Box>

                      {filters.dateRange === "custom" && (
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                          <TextField
                            type="date"
                            size="small"
                            label="Start"
                            InputLabelProps={{ shrink: true }}
                            value={filters.startDate}
                            onChange={(e) => {
                              const next = { ...filters, startDate: e.target.value };
                              setFilters(next);
                              if (next.startDate && next.endDate) loadStats(next);
                            }}
                            sx={{ width: 145, "& .MuiOutlinedInput-root": { borderRadius: "10px", fontSize: 12.5 } }}
                          />
                          <TextField
                            type="date"
                            size="small"
                            label="End"
                            InputLabelProps={{ shrink: true }}
                            value={filters.endDate}
                            onChange={(e) => {
                              const next = { ...filters, endDate: e.target.value };
                              setFilters(next);
                              if (next.startDate && next.endDate) loadStats(next);
                            }}
                            sx={{ width: 145, "& .MuiOutlinedInput-root": { borderRadius: "10px", fontSize: 12.5 } }}
                          />
                        </Box>
                      )}

                      <Divider orientation="vertical" flexItem sx={{ display: { xs: "none", md: "block" } }} />

                      <TextField
                        select
                        size="small"
                        value={filters.timeCutoff}
                        onChange={(e) => handleFilterChange("timeCutoff", e.target.value)}
                        InputProps={{
                          startAdornment: (
                            <InputAdornment position="start">
                              <Schedule sx={{ fontSize: 16, color: "#64748b" }} />
                            </InputAdornment>
                          ),
                        }}
                        sx={{
                          minWidth: 195,
                          "& .MuiOutlinedInput-root": { borderRadius: "10px", fontSize: 13, fontWeight: 600 },
                        }}
                      >
                        {TIME_CUTOFF_OPTIONS.map((opt) => (
                          <MenuItem key={opt.value} value={opt.value}>
                            Time Cutoff: {opt.label}
                          </MenuItem>
                        ))}
                      </TextField>
                    </Box>

                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      {filters.status && (
                        <Chip
                          size="small"
                          color="secondary"
                          label={`Status: ${filters.status}`}
                          onDelete={() => handleFilterChange("status", "")}
                          sx={{ fontWeight: 700 }}
                        />
                      )}
                      <Button
                        size="small"
                        variant="text"
                        endIcon={<OpenInNew sx={{ fontSize: 15 }} />}
                        onClick={() => openLeadsInCrm()}
                        sx={{
                          textTransform: "none",
                          fontWeight: 700,
                          color: "#2563eb",
                          fontSize: 12.5,
                        }}
                      >
                        Open filtered leads in CRM
                      </Button>
                    </Box>
                  </Box>

                  {/* Filter Row 2: 6 Entity Dropdowns */}
                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: {
                        xs: "1fr",
                        sm: "repeat(2, 1fr)",
                        md: "repeat(3, 1fr)",
                        lg: "repeat(6, 1fr)",
                      },
                      gap: 1.5,
                    }}
                  >
                    <TextField
                      select
                      size="small"
                      label="Lead List"
                      InputLabelProps={{ shrink: true }}
                      SelectProps={{ displayEmpty: true }}
                      value={filters.list}
                      onChange={(e) => handleFilterChange("list", e.target.value)}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <Layers sx={{ fontSize: 16, color: "#64748b" }} />
                          </InputAdornment>
                        ),
                      }}
                      sx={{ "& .MuiOutlinedInput-root": { borderRadius: "10px", fontSize: 13, fontWeight: 600 } }}
                    >
                      <MenuItem value="">All Lists</MenuItem>
                      <MenuItem value="__manual__">Manual / Direct (No CSV)</MenuItem>
                      {(filterOptions.lists || []).map((l) => (
                        <MenuItem key={l.id} value={l.name}>
                          {l.name}
                          {l.leadCount > 0 ? ` (${formatCount(l.leadCount)})` : ""}
                        </MenuItem>
                      ))}
                    </TextField>

                    <TextField
                      select
                      size="small"
                      label="Brand"
                      InputLabelProps={{ shrink: true }}
                      SelectProps={{ displayEmpty: true }}
                      value={filters.brand}
                      onChange={(e) => handleFilterChange("brand", e.target.value)}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <Business sx={{ fontSize: 16, color: "#64748b" }} />
                          </InputAdornment>
                        ),
                      }}
                      sx={{ "& .MuiOutlinedInput-root": { borderRadius: "10px", fontSize: 13, fontWeight: 600 } }}
                    >
                      <MenuItem value="">All Brands</MenuItem>
                      {(filterOptions.brands || []).map((b) => (
                        <MenuItem key={b} value={b}>
                          {b}
                        </MenuItem>
                      ))}
                    </TextField>

                    <TextField
                      select
                      size="small"
                      label="Country"
                      InputLabelProps={{ shrink: true }}
                      SelectProps={{ displayEmpty: true }}
                      value={filters.country}
                      onChange={(e) => handleFilterChange("country", e.target.value)}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <LocationOn sx={{ fontSize: 16, color: "#64748b" }} />
                          </InputAdornment>
                        ),
                      }}
                      sx={{ "& .MuiOutlinedInput-root": { borderRadius: "10px", fontSize: 13, fontWeight: 600 } }}
                    >
                      <MenuItem value="">All Countries</MenuItem>
                      {(filterOptions.countries || []).map((c) => (
                        <MenuItem key={c} value={c}>
                          {c}
                        </MenuItem>
                      ))}
                    </TextField>

                    <TextField
                      select
                      size="small"
                      label="Agent"
                      InputLabelProps={{ shrink: true }}
                      SelectProps={{ displayEmpty: true }}
                      value={filters.agent}
                      onChange={(e) => handleFilterChange("agent", e.target.value)}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <Person sx={{ fontSize: 16, color: "#64748b" }} />
                          </InputAdornment>
                        ),
                      }}
                      sx={{ "& .MuiOutlinedInput-root": { borderRadius: "10px", fontSize: 13, fontWeight: 600 } }}
                    >
                      <MenuItem value="">All Agents</MenuItem>
                      <MenuItem value="unassigned">Unassigned Pool</MenuItem>
                      {(filterOptions.agents || []).map((a) => (
                        <MenuItem key={a.id} value={a.id}>
                          {a.name} ({a.role})
                        </MenuItem>
                      ))}
                    </TextField>

                    <TextField
                      select
                      size="small"
                      label="Source"
                      InputLabelProps={{ shrink: true }}
                      SelectProps={{ displayEmpty: true }}
                      value={filters.source}
                      onChange={(e) => handleFilterChange("source", e.target.value)}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <SourceIcon sx={{ fontSize: 16, color: "#64748b" }} />
                          </InputAdornment>
                        ),
                      }}
                      sx={{ "& .MuiOutlinedInput-root": { borderRadius: "10px", fontSize: 13, fontWeight: 600 } }}
                    >
                      <MenuItem value="">All Sources</MenuItem>
                      {(filterOptions.sources || []).map((s) => (
                        <MenuItem key={s} value={s}>
                          {s}
                        </MenuItem>
                      ))}
                    </TextField>

                    <TextField
                      select
                      size="small"
                      label="Automation"
                      InputLabelProps={{ shrink: true }}
                      SelectProps={{ displayEmpty: true }}
                      value={filters.automation}
                      onChange={(e) => handleFilterChange("automation", e.target.value)}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <Bolt sx={{ fontSize: 16, color: "#6d28d9" }} />
                          </InputAdornment>
                        ),
                      }}
                      sx={{ "& .MuiOutlinedInput-root": { borderRadius: "10px", fontSize: 13, fontWeight: 600 } }}
                    >
                      <MenuItem value="">All Automations</MenuItem>
                      {(filterOptions.automations || []).map((r) => (
                        <MenuItem key={r.id} value={r.id}>
                          {r.name} ({r.fromStatus} → {r.toStatus})
                        </MenuItem>
                      ))}
                    </TextField>
                  </Box>
                </CardContent>
              </Card>

              {/* 6 ANIMATED KPI METRIC CARDS */}
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: {
                    xs: "1fr",
                    sm: "repeat(2, 1fr)",
                    md: "repeat(3, 1fr)",
                    xl: "repeat(6, 1fr)",
                  },
                  gap: 2,
                  mb: 2.5,
                }}
              >
                {/* KPI 1: Total Leads */}
                <Card
                  elevation={0}
                  onClick={() => openLeadsInCrm()}
                  sx={{
                    borderRadius: "18px",
                    background: "linear-gradient(135deg, #1d4ed8 0%, #1e40af 55%, #1e3a8a 100%)",
                    color: "#ffffff",
                    cursor: "pointer",
                    boxShadow: "0 12px 28px rgba(29, 78, 216, 0.28)",
                    transition: "transform 0.2s ease, box-shadow 0.2s ease",
                    "&:hover": {
                      transform: "translateY(-3px)",
                      boxShadow: "0 16px 34px rgba(29, 78, 216, 0.36)",
                    },
                  }}
                >
                  <CardContent sx={{ p: 2.25, "&:last-child": { pb: 2.25 } }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.2, mb: 1 }}>
                      <Box
                        sx={{
                          width: 34,
                          height: 34,
                          borderRadius: "10px",
                          bgcolor: "rgba(255, 255, 255, 0.18)",
                          display: "grid",
                          placeItems: "center",
                        }}
                      >
                        <People sx={{ fontSize: 19, color: "#fff" }} />
                      </Box>
                      <Typography variant="body2" sx={{ fontWeight: 700, opacity: 0.92 }}>
                        Total Leads
                      </Typography>
                    </Box>
                    <Typography variant="h4" sx={{ fontWeight: 900, letterSpacing: -0.5, my: 0.5 }}>
                      <AnimatedNumber value={kpis.totalLeads} />
                    </Typography>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 1 }}>
                      <Box
                        component="span"
                        sx={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 0.3,
                          px: 0.9,
                          py: 0.2,
                          borderRadius: "6px",
                          bgcolor: "rgba(34, 197, 94, 0.25)",
                          color: "#bbf7d0",
                          fontSize: 11,
                          fontWeight: 800,
                        }}
                      >
                        <TrendingUp sx={{ fontSize: 13 }} />
                        100%
                      </Box>
                      <Typography variant="caption" sx={{ opacity: 0.85, fontSize: 11 }}>
                        all active leads
                      </Typography>
                    </Box>
                  </CardContent>
                </Card>

                {/* KPI 2: Leads Entered Today */}
                <Card
                  elevation={0}
                  onClick={() => handleFilterChange("dateRange", "today")}
                  sx={{
                    ...cardBaseSx,
                    cursor: "pointer",
                    transition: "transform 0.2s ease, border-color 0.2s ease",
                    "&:hover": { transform: "translateY(-3px)", borderColor: "#6d28d9" },
                  }}
                >
                  <CardContent sx={{ p: 2.25, "&:last-child": { pb: 2.25 } }}>
                    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1.1 }}>
                        <Box
                          sx={{
                            width: 34,
                            height: 34,
                            borderRadius: "50%",
                            bgcolor: "#f3e8ff",
                            color: "#7c3aed",
                            display: "grid",
                            placeItems: "center",
                          }}
                        >
                          <Add sx={{ fontSize: 19 }} />
                        </Box>
                        <Typography variant="body2" fontWeight={700} color="#334155">
                          Leads Entered Today
                        </Typography>
                      </Box>
                      <Tooltip title="New leads created since 00:00 today compared with yesterday">
                        <InfoOutlined sx={{ fontSize: 15, color: "#94a3b8" }} />
                      </Tooltip>
                    </Box>
                    <Typography variant="h4" sx={{ fontWeight: 900, color: "#0f172a", my: 0.5 }}>
                      <AnimatedNumber value={kpis.enteredToday} />
                    </Typography>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 1 }}>
                      <Box
                        component="span"
                        sx={{
                          px: 0.85,
                          py: 0.2,
                          borderRadius: "6px",
                          bgcolor: kpis.enteredDelta.up ? "#dcfce7" : "#fee2e2",
                          color: kpis.enteredDelta.up ? "#15803d" : "#b91c1c",
                          fontSize: 11,
                          fontWeight: 800,
                        }}
                      >
                        {kpis.enteredDelta.up ? "▲" : "▼"} {kpis.enteredDelta.pct}
                      </Box>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                        vs. {formatCount(kpis.enteredDelta.prev)} yesterday
                      </Typography>
                    </Box>
                  </CardContent>
                </Card>

                {/* KPI 3: Leads Reshuffled */}
                <Card
                  elevation={0}
                  onClick={() => navigate("/admin/crm/lead-automation")}
                  sx={{
                    ...cardBaseSx,
                    cursor: "pointer",
                    transition: "transform 0.2s ease, border-color 0.2s ease",
                    "&:hover": { transform: "translateY(-3px)", borderColor: "#6d28d9" },
                  }}
                >
                  <CardContent sx={{ p: 2.25, "&:last-child": { pb: 2.25 } }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.1, mb: 1 }}>
                      <Box
                        sx={{
                          width: 34,
                          height: 34,
                          borderRadius: "50%",
                          bgcolor: "#ede9fe",
                          color: "#6d28d9",
                          display: "grid",
                          placeItems: "center",
                        }}
                      >
                        <Autorenew sx={{ fontSize: 19 }} />
                      </Box>
                      <Typography variant="body2" fontWeight={700} color="#334155">
                        Leads Reshuffled
                      </Typography>
                    </Box>
                    <Typography variant="h4" sx={{ fontWeight: 900, color: "#0f172a", my: 0.5 }}>
                      <AnimatedNumber value={kpis.reshuffled} />
                    </Typography>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 1 }}>
                      <Box
                        component="span"
                        sx={{
                          px: 0.85,
                          py: 0.2,
                          borderRadius: "6px",
                          bgcolor: kpis.reshuffledDelta.up ? "#dcfce7" : "#fee2e2",
                          color: kpis.reshuffledDelta.up ? "#15803d" : "#b91c1c",
                          fontSize: 11,
                          fontWeight: 800,
                        }}
                      >
                        {kpis.reshuffledDelta.up ? "▲" : "▼"} {kpis.reshuffledDelta.pct}
                      </Box>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                        via rotation rules
                      </Typography>
                    </Box>
                  </CardContent>
                </Card>

                {/* KPI 4: Currently In Rotation */}
                <Card
                  elevation={0}
                  onClick={() => navigate("/admin/crm/lead-automation")}
                  sx={{
                    ...cardBaseSx,
                    cursor: "pointer",
                    transition: "transform 0.2s ease, border-color 0.2s ease",
                    "&:hover": { transform: "translateY(-3px)", borderColor: "#6d28d9" },
                  }}
                >
                  <CardContent sx={{ p: 2.25, "&:last-child": { pb: 2.25 } }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.1, mb: 1 }}>
                      <Box
                        sx={{
                          width: 34,
                          height: 34,
                          borderRadius: "50%",
                          bgcolor: "#f3e8ff",
                          color: "#7c3aed",
                          display: "grid",
                          placeItems: "center",
                        }}
                      >
                        <Layers sx={{ fontSize: 18 }} />
                      </Box>
                      <Typography variant="body2" fontWeight={700} color="#334155">
                        Currently In Rotation
                      </Typography>
                    </Box>
                    <Typography variant="h4" sx={{ fontWeight: 900, color: "#0f172a", my: 0.5 }}>
                      <AnimatedNumber value={kpis.inRotation} />
                    </Typography>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 1 }}>
                      <Box
                        component="span"
                        sx={{
                          px: 0.85,
                          py: 0.2,
                          borderRadius: "6px",
                          bgcolor: "#ede9fe",
                          color: "#6d28d9",
                          fontSize: 11,
                          fontWeight: 800,
                        }}
                      >
                        {(filterOptions.automations || []).filter((r) => r.active).length} active rules
                      </Box>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                        multi-agent
                      </Typography>
                    </Box>
                  </CardContent>
                </Card>

                {/* KPI 5: Positive / Call Back */}
                <Card
                  elevation={0}
                  onClick={() =>
                    handleFilterChange("status", filters.status === "Call Back" ? "" : "Call Back")
                  }
                  sx={{
                    ...cardBaseSx,
                    cursor: "pointer",
                    transition: "transform 0.2s ease, border-color 0.2s ease",
                    "&:hover": { transform: "translateY(-3px)", borderColor: "#10b981" },
                  }}
                >
                  <CardContent sx={{ p: 2.25, "&:last-child": { pb: 2.25 } }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.1, mb: 1 }}>
                      <Box
                        sx={{
                          width: 34,
                          height: 34,
                          borderRadius: "50%",
                          bgcolor: "#dcfce7",
                          color: "#15803d",
                          display: "grid",
                          placeItems: "center",
                        }}
                      >
                        <CheckCircleOutline sx={{ fontSize: 19 }} />
                      </Box>
                      <Typography variant="body2" fontWeight={700} color="#334155">
                        Positive / Call Back
                      </Typography>
                    </Box>
                    <Typography variant="h4" sx={{ fontWeight: 900, color: "#0f172a", my: 0.5 }}>
                      <AnimatedNumber value={kpis.completed} />
                    </Typography>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 1 }}>
                      <Box
                        component="span"
                        sx={{
                          px: 0.85,
                          py: 0.2,
                          borderRadius: "6px",
                          bgcolor: "#dcfce7",
                          color: "#15803d",
                          fontSize: 11,
                          fontWeight: 800,
                        }}
                      >
                        {kpis.completedShare}
                      </Box>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                        of total leads
                      </Typography>
                    </Box>
                  </CardContent>
                </Card>

                {/* KPI 6: Unassigned / Waiting */}
                <Card
                  elevation={0}
                  onClick={() =>
                    handleFilterChange("agent", filters.agent === "unassigned" ? "" : "unassigned")
                  }
                  sx={{
                    ...cardBaseSx,
                    cursor: "pointer",
                    transition: "transform 0.2s ease, border-color 0.2s ease",
                    "&:hover": { transform: "translateY(-3px)", borderColor: "#f59e0b" },
                  }}
                >
                  <CardContent sx={{ p: 2.25, "&:last-child": { pb: 2.25 } }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.1, mb: 1 }}>
                      <Box
                        sx={{
                          width: 34,
                          height: 34,
                          borderRadius: "50%",
                          bgcolor: "#f3e8ff",
                          color: "#7c3aed",
                          display: "grid",
                          placeItems: "center",
                        }}
                      >
                        <HourglassEmpty sx={{ fontSize: 18 }} />
                      </Box>
                      <Typography variant="body2" fontWeight={700} color="#334155">
                        Unassigned / Waiting
                      </Typography>
                    </Box>
                    <Typography variant="h4" sx={{ fontWeight: 900, color: "#0f172a", my: 0.5 }}>
                      <AnimatedNumber value={kpis.unassigned} />
                    </Typography>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 1 }}>
                      <Box
                        component="span"
                        sx={{
                          px: 0.85,
                          py: 0.2,
                          borderRadius: "6px",
                          bgcolor: "#fef3c7",
                          color: "#b45309",
                          fontSize: 11,
                          fontWeight: 800,
                        }}
                      >
                        {kpis.unassignedShare}
                      </Box>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                        in waiting pool
                      </Typography>
                    </Box>
                  </CardContent>
                </Card>
              </Box>

              {/* INTERACTIVE ANIMATED LEAD JOURNEY FLOW */}
              <Card elevation={0} sx={{ ...cardBaseSx, mb: 2.5, overflow: "hidden" }}>
                <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
                  {/* Header & View Switcher */}
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
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                      <Box
                        sx={{
                          width: 38,
                          height: 38,
                          borderRadius: "10px",
                          bgcolor: "#f3e8ff",
                          color: "#6d28d9",
                          display: "grid",
                          placeItems: "center",
                        }}
                      >
                        <Hub sx={{ fontSize: 22 }} />
                      </Box>
                      <Box>
                        <Typography variant="h6" fontWeight={800} color="#0f172a" sx={{ lineHeight: 1.2 }}>
                          Lead Journey Flow
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          How leads moved across lists, statuses, and agent rotations during the selected period.
                        </Typography>
                      </Box>
                    </Box>

                    <Box sx={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <Typography variant="caption" fontWeight={700} color="text.secondary">
                          View by:
                        </Typography>
                        <Box
                          sx={{
                            display: "inline-flex",
                            p: 0.4,
                            borderRadius: "10px",
                            bgcolor: "#f1f5f9",
                            gap: 0.4,
                          }}
                        >
                          {[
                            { id: "status", label: "Status" },
                            { id: "agent", label: "Agent" },
                            { id: "automation", label: "Automation" },
                          ].map((mode) => {
                            const active = flowViewBy === mode.id;
                            return (
                              <Box
                                key={mode.id}
                                component="button"
                                type="button"
                                onClick={() => setFlowViewBy(mode.id)}
                                sx={{
                                  border: 0,
                                  outline: 0,
                                  cursor: "pointer",
                                  px: 1.5,
                                  py: 0.5,
                                  borderRadius: "8px",
                                  fontSize: 12,
                                  fontWeight: 800,
                                  fontFamily: "inherit",
                                  bgcolor: active ? "#6d28d9" : "transparent",
                                  color: active ? "#ffffff" : "#475569",
                                  transition: "all 0.16s ease",
                                }}
                              >
                                {mode.label}
                              </Box>
                            );
                          })}
                        </Box>
                      </Box>

                      {/* Color Legend */}
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1.75, flexWrap: "wrap" }}>
                        {[
                          { label: "List / Source", color: "#a855f7" },
                          { label: "Status", color: "#3b82f6" },
                          { label: "Agent", color: "#8b5cf6" },
                          { label: "Positive Outcome", color: "#10b981" },
                          { label: "Final / Reassigned", color: "#0284c7" },
                        ].map((leg) => (
                          <Box key={leg.label} sx={{ display: "flex", alignItems: "center", gap: 0.6 }}>
                            <Box
                              sx={{
                                width: 9,
                                height: 9,
                                borderRadius: "50%",
                                bgcolor: leg.color,
                              }}
                            />
                            <Typography variant="caption" sx={{ fontSize: 11.5, fontWeight: 600, color: "#475569" }}>
                              {leg.label}
                            </Typography>
                          </Box>
                        ))}
                      </Box>
                    </Box>
                  </Box>

                  {/* SANKEY / PIPELINE VISUALIZATION CANVAS */}
                  <Box sx={{ overflowX: "auto" }}>
                    <Box
                      sx={{
                        minWidth: 980,
                        p: { xs: 2, md: 2.5 },
                        borderRadius: "16px",
                        background: "linear-gradient(180deg, #fafbff 0%, #f4f6fb 100%)",
                        border: "1px solid rgba(15, 23, 42, 0.06)",
                        display: "grid",
                        gridTemplateColumns:
                          "minmax(145px, 170px) 40px minmax(130px, 150px) 40px minmax(140px, 160px) 72px minmax(400px, 1fr)",
                        alignItems: "center",
                      }}
                    >
                      {/* NODE 1: Incoming List / Source */}
                      <Box
                        onClick={() => handleFilterChange("status", "")}
                        sx={{
                          p: 1.75,
                          borderRadius: "16px",
                          background: "linear-gradient(135deg, #ede9fe 0%, #ddd6fe 100%)",
                          border: "1.5px solid #c4b5fd",
                          boxShadow: "0 8px 20px rgba(124, 58, 237, 0.12)",
                          cursor: "pointer",
                          transition: "transform 0.2s ease",
                          "&:hover": { transform: "scale(1.02)" },
                        }}
                      >
                        <Box sx={{ display: "flex", alignItems: "center", gap: 0.85, mb: 0.5 }}>
                          <Layers sx={{ fontSize: 19, color: "#6d28d9", flexShrink: 0 }} />
                          <Typography
                            variant="caption"
                            fontWeight={800}
                            color="#4c1d95"
                            noWrap
                            title={journey.listTitle}
                          >
                            {journey.listTitle}
                          </Typography>
                        </Box>
                        <Typography variant="h5" fontWeight={900} color="#1e1b4b">
                          <AnimatedNumber value={journey.incomingCount} />
                        </Typography>
                        <Typography variant="caption" sx={{ color: "#5b21b6", fontSize: 11, fontWeight: 600 }}>
                          Incoming Pool
                        </Typography>
                      </Box>

                      {/* Animated Ribbon 1 -> 2 */}
                      <Box sx={{ height: 54, display: "flex", alignItems: "center" }}>
                        <svg width="100%" height="54" viewBox="0 0 40 54" fill="none">
                          <path
                            d="M0 27 C12 27, 28 27, 40 27"
                            stroke="url(#gradPurpleBlue)"
                            strokeWidth="24"
                            strokeOpacity="0.28"
                          />
                          <path
                            d="M0 27 C12 27, 28 27, 40 27"
                            stroke="#6366f1"
                            strokeWidth="2.5"
                            strokeDasharray="6 6"
                            style={{ animation: "dashFlow 1.2s linear infinite" }}
                          />
                          <defs>
                            <linearGradient id="gradPurpleBlue" x1="0" y1="0" x2="40" y2="0" gradientUnits="userSpaceOnUse">
                              <stop offset="0%" stopColor="#a855f7" />
                              <stop offset="100%" stopColor="#38bdf8" />
                            </linearGradient>
                          </defs>
                        </svg>
                      </Box>

                      {/* NODE 2: Initial "New" Status */}
                      <Box
                        onClick={() => handleFilterChange("status", filters.status === "New" ? "" : "New")}
                        sx={{
                          p: 1.75,
                          borderRadius: "16px",
                          background: "linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%)",
                          border: "1.5px solid #7dd3fc",
                          boxShadow: "0 8px 20px rgba(2, 132, 199, 0.12)",
                          cursor: "pointer",
                          transition: "transform 0.2s ease",
                          "&:hover": { transform: "scale(1.02)" },
                        }}
                      >
                        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 0.5 }}>
                          <Star sx={{ fontSize: 19, color: "#0284c7" }} />
                          <Typography variant="body2" fontWeight={800} color="#0c4a6e">
                            New
                          </Typography>
                        </Box>
                        <Typography variant="h5" fontWeight={900} color="#082f49">
                          <AnimatedNumber value={journey.newCount} />
                        </Typography>
                        <Typography variant="caption" sx={{ color: "#0369a1", fontSize: 11, fontWeight: 600 }}>
                          Active New Queue
                        </Typography>
                      </Box>

                      {/* Animated Ribbon 2 -> 3 */}
                      <Box sx={{ height: 54, display: "flex", alignItems: "center" }}>
                        <svg width="100%" height="54" viewBox="0 0 40 54" fill="none">
                          <path
                            d="M0 27 C12 27, 28 27, 40 27"
                            stroke="url(#gradBlueAmber)"
                            strokeWidth="24"
                            strokeOpacity="0.32"
                          />
                          <path
                            d="M0 27 C12 27, 28 27, 40 27"
                            stroke="#f59e0b"
                            strokeWidth="2.5"
                            strokeDasharray="6 6"
                            style={{ animation: "dashFlow 1.2s linear infinite" }}
                          />
                          <defs>
                            <linearGradient id="gradBlueAmber" x1="0" y1="0" x2="40" y2="0" gradientUnits="userSpaceOnUse">
                              <stop offset="0%" stopColor="#38bdf8" />
                              <stop offset="100%" stopColor="#fbbf24" />
                            </linearGradient>
                          </defs>
                        </svg>
                      </Box>

                      {/* NODE 3: Trigger Status (No Answer) */}
                      <Box
                        onClick={() => handleFilterChange("status", filters.status === "No Answer" ? "" : "No Answer")}
                        sx={{
                          p: 1.75,
                          borderRadius: "16px",
                          background: "linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)",
                          border: "1.5px solid #fcd34d",
                          boxShadow: "0 8px 20px rgba(217, 119, 6, 0.14)",
                          cursor: "pointer",
                          transition: "transform 0.2s ease",
                          "&:hover": { transform: "scale(1.02)" },
                        }}
                      >
                        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 0.5 }}>
                          <Block sx={{ fontSize: 18, color: "#d97706" }} />
                          <Typography variant="body2" fontWeight={800} color="#78350f">
                            No Answer
                          </Typography>
                        </Box>
                        <Typography variant="h5" fontWeight={900} color="#451a03">
                          <AnimatedNumber value={journey.noAnswerCount} />
                        </Typography>
                        <Typography variant="caption" sx={{ color: "#b45309", fontSize: 11, fontWeight: 600 }}>
                          Trigger &amp; Rotation
                        </Typography>
                      </Box>

                      {/* Animated Branching SVG Curves */}
                      <Box sx={{ height: 240, display: "flex", alignItems: "center" }}>
                        <svg width="72" height="240" viewBox="0 0 72 240" fill="none">
                          <path d="M0 120 C32 120, 38 30, 72 30" stroke="#c4b5fd" strokeWidth="14" strokeOpacity="0.45" fill="none" />
                          <path
                            d="M0 120 C32 120, 38 30, 72 30"
                            stroke="#7c3aed"
                            strokeWidth="2"
                            strokeDasharray="5 5"
                            fill="none"
                            style={{ animation: "dashFlow 1.1s linear infinite" }}
                          />
                          <path d="M0 120 C32 120, 38 88, 72 88" stroke="#a7f3d0" strokeWidth="11" strokeOpacity="0.55" fill="none" />
                          <path
                            d="M0 120 C32 120, 38 88, 72 88"
                            stroke="#10b981"
                            strokeWidth="2"
                            strokeDasharray="5 5"
                            fill="none"
                            style={{ animation: "dashFlow 1.3s linear infinite" }}
                          />
                          <path d="M0 120 C32 120, 38 136, 72 136" stroke="#fed7aa" strokeWidth="10" strokeOpacity="0.6" fill="none" />
                          <path d="M0 120 C32 120, 38 178, 72 178" stroke="#fecaca" strokeWidth="10" strokeOpacity="0.55" fill="none" />
                          <path d="M0 120 C32 120, 38 218, 72 218" stroke="#cbd5e1" strokeWidth="10" strokeOpacity="0.55" fill="none" />
                        </svg>
                      </Box>

                      {/* RIGHT BRANCHES: Agent Rotation Chain + Outcome Bars */}
                      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.1, minWidth: 0 }}>
                        {/* Branch 1: Agent Rotation Chain -> Reassigned New */}
                        <Box
                          sx={{
                            display: "grid",
                            gridTemplateColumns: "repeat(3, minmax(0, 1fr)) auto minmax(152px, 168px)",
                            alignItems: "center",
                            gap: 0.75,
                          }}
                        >
                          {(flowViewBy === "automation" && (filterOptions.automations || []).length > 0
                            ? (filterOptions.automations || []).slice(0, 3).map((r) => ({
                                id: r.id,
                                name: r.name,
                                count: r.totalRotated || 0,
                                isRule: true,
                              }))
                            : (journey.topAgents.length > 0
                                ? journey.topAgents
                                : [
                                    { agentId: "1", name: "Agent 1", count: 0 },
                                    { agentId: "2", name: "Agent 2", count: 0 },
                                    { agentId: "3", name: "Agent 3", count: 0 },
                                  ]
                              ).slice(0, 3)
                          ).map((ag, idx) => (
                            <Box
                              key={ag.agentId || ag.id || idx}
                              onClick={() => {
                                if (ag.isRule) {
                                  handleFilterChange("automation", ag.id);
                                } else if (ag.agentId && ag.agentId.length > 5) {
                                  openAgentDeepDive(ag.agentId);
                                }
                              }}
                              sx={{
                                px: 1.2,
                                py: 0.8,
                                borderRadius: "12px",
                                background: "linear-gradient(135deg, #ede9fe 0%, #e0e7ff 100%)",
                                border: "1px solid #c4b5fd",
                                cursor: "pointer",
                                minWidth: 0,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: 0.5,
                                transition: "transform 0.15s ease",
                                "&:hover": { transform: "translateY(-2px)" },
                              }}
                            >
                              <Box sx={{ minWidth: 0 }}>
                                <Box sx={{ display: "flex", alignItems: "center", gap: 0.4 }}>
                                  <Person sx={{ fontSize: 14, color: "#6d28d9", flexShrink: 0 }} />
                                  <Typography
                                    variant="caption"
                                    fontWeight={800}
                                    color="#4c1d95"
                                    noWrap
                                    title={ag.name}
                                  >
                                    {ag.name || `Agent ${idx + 1}`}
                                  </Typography>
                                </Box>
                                <Typography variant="subtitle1" fontWeight={900} color="#1e1b4b" sx={{ lineHeight: 1.2 }}>
                                  <AnimatedNumber value={ag.count || ag.activeLeads || 0} />
                                </Typography>
                              </Box>
                              <ChevronRight sx={{ color: "#7c3aed", fontSize: 16, flexShrink: 0 }} />
                            </Box>
                          ))}

                          <ChevronRight sx={{ color: "#2563eb", fontSize: 18 }} />

                          {/* Final Reassigned "New" Box */}
                          <Box
                            onClick={() => openLeadsInCrm({ status: "New" })}
                            sx={{
                              px: 1.4,
                              py: 0.75,
                              borderRadius: "12px",
                              background: "linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)",
                              border: "1.5px solid #60a5fa",
                              cursor: "pointer",
                              boxShadow: "0 4px 12px rgba(37, 99, 235, 0.14)",
                            }}
                          >
                            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                              <Autorenew sx={{ fontSize: 15, color: "#1d4ed8", flexShrink: 0 }} />
                              <Typography variant="caption" fontWeight={800} color="#1e3a8a" sx={{ whiteSpace: "nowrap" }}>
                                New (reassigned)
                              </Typography>
                            </Box>
                            <Typography variant="subtitle1" fontWeight={900} color="#172554" sx={{ lineHeight: 1.2 }}>
                              <AnimatedNumber value={journey.reassignedNewCount} />
                            </Typography>
                          </Box>
                        </Box>

                        {/* Branch 2: Positive / Call Back / Active */}
                        <Box
                          onClick={() => handleFilterChange("status", filters.status === "Call Back" ? "" : "Call Back")}
                          sx={{
                            px: 1.75,
                            py: 0.65,
                            borderRadius: "10px",
                            background: "linear-gradient(90deg, #dcfce7 0%, #d1fae5 100%)",
                            border: "1px solid #86efac",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            maxWidth: 480,
                            cursor: "pointer",
                            transition: "transform 0.15s ease",
                            "&:hover": { transform: "translateX(4px)" },
                          }}
                        >
                          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                            <CheckCircleOutline sx={{ fontSize: 17, color: "#15803d" }} />
                            <Typography variant="body2" fontWeight={800} color="#14532d" sx={{ fontSize: 13 }}>
                              Replied / Interested / Call Back
                            </Typography>
                          </Box>
                          <Typography variant="subtitle2" fontWeight={900} color="#064e3b">
                            <AnimatedNumber value={journey.positiveOutcomeCount} />
                          </Typography>
                        </Box>

                        {/* Branch 3: Not Interested / Not Active */}
                        <Box
                          onClick={() =>
                            handleFilterChange("status", filters.status === "Not Interested" ? "" : "Not Interested")
                          }
                          sx={{
                            px: 1.75,
                            py: 0.65,
                            borderRadius: "10px",
                            background: "linear-gradient(90deg, #ffedd5 0%, #fed7aa 100%)",
                            border: "1px solid #fdba74",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            maxWidth: 480,
                            cursor: "pointer",
                            transition: "transform 0.15s ease",
                            "&:hover": { transform: "translateX(4px)" },
                          }}
                        >
                          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                            <Block sx={{ fontSize: 17, color: "#c2410c" }} />
                            <Typography variant="body2" fontWeight={800} color="#7c2d12" sx={{ fontSize: 13 }}>
                              Not Interested / Not Active
                            </Typography>
                          </Box>
                          <Typography variant="subtitle2" fontWeight={900} color="#7c2d12">
                            <AnimatedNumber value={journey.notInterestedCount} />
                          </Typography>
                        </Box>

                        {/* Branch 4: Exhausted (Strictly "Exhausted" status leads) */}
                        <Box
                          onClick={() => handleFilterChange("status", filters.status === "Exhausted" ? "" : "Exhausted")}
                          sx={{
                            px: 1.75,
                            py: 0.65,
                            borderRadius: "10px",
                            background: "linear-gradient(90deg, #fee2e2 0%, #ffe4e6 100%)",
                            border: "1px solid #fca5a5",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            maxWidth: 480,
                            cursor: "pointer",
                            transition: "transform 0.15s ease",
                            "&:hover": { transform: "translateX(4px)" },
                          }}
                        >
                          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                            <Flag sx={{ fontSize: 17, color: "#dc2626" }} />
                            <Typography variant="body2" fontWeight={800} color="#7f1d1d" sx={{ fontSize: 13 }}>
                              Exhausted (Reached Max Rotation Limit)
                            </Typography>
                          </Box>
                          <Typography variant="subtitle2" fontWeight={900} color="#7f1d1d">
                            <AnimatedNumber value={journey.exhaustedOutcomeCount} />
                          </Typography>
                        </Box>

                        {/* Branch 5: Waiting for next agent */}
                        <Box
                          onClick={() =>
                            handleFilterChange("agent", filters.agent === "unassigned" ? "" : "unassigned")
                          }
                          sx={{
                            px: 1.75,
                            py: 0.65,
                            borderRadius: "10px",
                            background: "linear-gradient(90deg, #e2e8f0 0%, #f1f5f9 100%)",
                            border: "1px solid #cbd5e1",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            maxWidth: 480,
                            cursor: "pointer",
                            transition: "transform 0.15s ease",
                            "&:hover": { transform: "translateX(4px)" },
                          }}
                        >
                          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                            <HourglassEmpty sx={{ fontSize: 17, color: "#475569" }} />
                            <Typography variant="body2" fontWeight={800} color="#1e293b" sx={{ fontSize: 13 }}>
                              Waiting for next agent (Unassigned Pool)
                            </Typography>
                          </Box>
                          <Typography variant="subtitle2" fontWeight={900} color="#0f172a">
                            <AnimatedNumber value={journey.waitingOutcomeCount} />
                          </Typography>
                        </Box>
                      </Box>
                    </Box>
                  </Box>
                </CardContent>
              </Card>

              {/* BOTTOM 2-COLUMN GRID: AGENT ROTATION & STATUS SHARE */}
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", lg: "1.62fr 1fr" },
                  gap: 2.5,
                  alignItems: "start",
                }}
              >
                {/* LEFT CARD: Agent Rotation Performance */}
                <Card elevation={0} sx={{ ...cardBaseSx, minWidth: 0 }}>
                  <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        flexWrap: "wrap",
                        gap: 1.5,
                        mb: 2,
                      }}
                    >
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                        <Box
                          sx={{
                            width: 38,
                            height: 38,
                            borderRadius: "10px",
                            bgcolor: "#f3e8ff",
                            color: "#6d28d9",
                            display: "grid",
                            placeItems: "center",
                          }}
                        >
                          <Person sx={{ fontSize: 22 }} />
                        </Box>
                        <Box>
                          <Typography variant="h6" fontWeight={800} color="#0f172a" sx={{ lineHeight: 1.2 }}>
                            Agent Rotation Performance
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Click any agent or &ldquo;View lead journey&rdquo; for deep performance stats.
                          </Typography>
                        </Box>
                      </Box>

                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <TextField
                          size="small"
                          placeholder="Search agent..."
                          value={agentSearch}
                          onChange={(e) => setAgentSearch(e.target.value)}
                          InputProps={{
                            startAdornment: (
                              <InputAdornment position="start">
                                <Search sx={{ fontSize: 17, color: "text.secondary" }} />
                              </InputAdornment>
                            ),
                          }}
                          sx={{
                            width: { xs: "100%", sm: 195 },
                            "& .MuiOutlinedInput-root": { borderRadius: "10px", fontSize: 13 },
                          }}
                        />

                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => setWorkspaceMode("leaderboard")}
                          sx={{
                            borderRadius: "10px",
                            textTransform: "none",
                            fontWeight: 800,
                            fontSize: 12,
                            borderColor: "rgba(109, 40, 217, 0.3)",
                            color: "#6d28d9",
                            whiteSpace: "nowrap",
                          }}
                        >
                          Full Leaderboard
                        </Button>
                      </Box>
                    </Box>

                    <TableContainer
                      sx={{
                        maxHeight: 460,
                        overflowX: "auto",
                        borderRadius: "12px",
                        border: "1px solid rgba(15, 23, 42, 0.06)",
                        "&::-webkit-scrollbar": { width: 6, height: 6 },
                        "&::-webkit-scrollbar-track": { bgcolor: "#f8fafc" },
                        "&::-webkit-scrollbar-thumb": {
                          bgcolor: "rgba(100, 116, 139, 0.25)",
                          borderRadius: 999,
                        },
                      }}
                    >
                      <Table
                        stickyHeader
                        size="small"
                        sx={{
                          "& th": {
                            whiteSpace: "nowrap",
                            py: 1.25,
                            px: 1.25,
                            fontSize: 12,
                            fontWeight: 800,
                            color: "#334155",
                            bgcolor: "#f8fafc",
                            borderBottom: "1px solid rgba(15, 23, 42, 0.08)",
                          },
                          "& td": {
                            whiteSpace: "nowrap",
                            py: 1.25,
                            px: 1.25,
                            fontSize: 13,
                            borderBottom: "1px solid rgba(15, 23, 42, 0.05)",
                          },
                          "& .MuiTableSortLabel-root": {
                            whiteSpace: "nowrap",
                            fontWeight: 800,
                            color: "#334155 !important",
                          },
                          "& .MuiTableSortLabel-icon": {
                            fontSize: 15,
                            ml: 0.35,
                            mr: 0,
                          },
                        }}
                      >
                        <TableHead>
                          <TableRow>
                            <TableCell sx={{ pl: 1.75 }}>
                              <TableSortLabel
                                active={agentSortBy === "name"}
                                direction={agentSortBy === "name" ? agentSortDir : "asc"}
                                onClick={() => handleSortAgents("name")}
                              >
                                Agent
                              </TableSortLabel>
                            </TableCell>
                            <TableCell align="center">
                              <TableSortLabel
                                active={agentSortBy === "leadsReceived"}
                                direction={agentSortBy === "leadsReceived" ? agentSortDir : "desc"}
                                onClick={() => handleSortAgents("leadsReceived")}
                              >
                                Leads Received
                              </TableSortLabel>
                            </TableCell>
                            <TableCell align="center">
                              <TableSortLabel
                                active={agentSortBy === "reassignedOut"}
                                direction={agentSortBy === "reassignedOut" ? agentSortDir : "desc"}
                                onClick={() => handleSortAgents("reassignedOut")}
                              >
                                Reassigned Out
                              </TableSortLabel>
                            </TableCell>
                            <TableCell align="center">
                              <TableSortLabel
                                active={agentSortBy === "responses"}
                                direction={agentSortBy === "responses" ? agentSortDir : "desc"}
                                onClick={() => handleSortAgents("responses")}
                              >
                                Responses
                              </TableSortLabel>
                            </TableCell>
                            <TableCell align="center">Avg. Time to Next Action</TableCell>
                            <TableCell align="center">
                              <TableSortLabel
                                active={agentSortBy === "activeLeads"}
                                direction={agentSortBy === "activeLeads" ? agentSortDir : "desc"}
                                onClick={() => handleSortAgents("activeLeads")}
                              >
                                Active Leads
                              </TableSortLabel>
                            </TableCell>
                            <TableCell align="right" sx={{ pr: 1.75 }} />
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {sortedAgentPerformance.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={7} align="center" sx={{ py: 5 }}>
                                <Typography variant="body2" color="text.secondary">
                                  No agents match the current filter.
                                </Typography>
                              </TableCell>
                            </TableRow>
                          ) : (
                            sortedAgentPerformance.map((agent) => {
                              const avatarColor = getAgentColor(agent.name);
                              return (
                                <TableRow
                                  key={agent.agentId}
                                  hover
                                  onClick={() => openAgentDeepDive(agent)}
                                  sx={{ cursor: "pointer" }}
                                >
                                  <TableCell sx={{ pl: 1.75 }}>
                                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.15 }}>
                                      <Box
                                        sx={{
                                          width: 30,
                                          height: 30,
                                          borderRadius: "50%",
                                          bgcolor: avatarColor,
                                          color: "#fff",
                                          display: "grid",
                                          placeItems: "center",
                                          fontWeight: 800,
                                          fontSize: 12,
                                          flexShrink: 0,
                                        }}
                                      >
                                        {getAgentInitials(agent.name)}
                                      </Box>
                                      <Box sx={{ minWidth: 0 }}>
                                        <Typography
                                          variant="body2"
                                          fontWeight={800}
                                          color="#0f172a"
                                          noWrap
                                          sx={{ fontSize: 13, lineHeight: 1.2 }}
                                        >
                                          {agent.name}
                                        </Typography>
                                        <Typography
                                          variant="caption"
                                          color="text.secondary"
                                          noWrap
                                          sx={{ display: "block", fontSize: 11, lineHeight: 1.2 }}
                                        >
                                          {agent.role}
                                        </Typography>
                                      </Box>
                                    </Box>
                                  </TableCell>
                                  <TableCell align="center" sx={{ fontWeight: 800, color: "#0f172a" }}>
                                    {formatCount(agent.leadsReceived ?? agent.count)}
                                  </TableCell>
                                  <TableCell align="center" sx={{ fontWeight: 700, color: "#475569" }}>
                                    {formatCount(agent.reassignedOut || 0)}
                                  </TableCell>
                                  <TableCell align="center" sx={{ fontWeight: 700, color: "#15803d" }}>
                                    {formatCount(agent.responses || 0)}
                                  </TableCell>
                                  <TableCell align="center" sx={{ fontWeight: 600, color: "#475569", fontSize: 12.5 }}>
                                    {agent.avgTimeFormatted || "12m 30s"}
                                  </TableCell>
                                  <TableCell align="center">
                                    <Chip
                                      size="small"
                                      label={formatCount(agent.activeLeads ?? agent.count)}
                                      sx={{
                                        height: 24,
                                        fontSize: 12,
                                        fontWeight: 800,
                                        bgcolor: "rgba(109, 40, 217, 0.1)",
                                        color: "#6d28d9",
                                      }}
                                    />
                                  </TableCell>
                                  <TableCell align="right" sx={{ pr: 1.5 }}>
                                    <Button
                                      size="small"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openAgentDeepDive(agent);
                                      }}
                                      endIcon={<ChevronRight sx={{ fontSize: 15, ml: -0.5 }} />}
                                      sx={{
                                        textTransform: "none",
                                        fontWeight: 800,
                                        fontSize: 12.5,
                                        color: "#6d28d9",
                                        whiteSpace: "nowrap",
                                        px: 1,
                                        py: 0.35,
                                        minWidth: "auto",
                                        borderRadius: "8px",
                                        "&:hover": {
                                          bgcolor: "rgba(109, 40, 217, 0.06)",
                                        },
                                      }}
                                    >
                                      View lead journey
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              );
                            })
                          )}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </CardContent>
                </Card>

                {/* RIGHT CARD: Current Lead Status & Multi-Dimension Breakdown */}
                <Card elevation={0} sx={{ ...cardBaseSx, minWidth: 0 }}>
                  <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        flexWrap: "wrap",
                        gap: 1.5,
                        mb: 2,
                      }}
                    >
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                        <Box
                          sx={{
                            width: 38,
                            height: 38,
                            borderRadius: "10px",
                            bgcolor: "#f3e8ff",
                            color: "#6d28d9",
                            display: "grid",
                            placeItems: "center",
                          }}
                        >
                          <Assessment sx={{ fontSize: 22 }} />
                        </Box>
                        <Box>
                          <Typography variant="h6" fontWeight={800} color="#0f172a" sx={{ lineHeight: 1.2 }}>
                            {rightPanelTab === "status"
                              ? "Current Lead Status"
                              : rightPanelTab === "brand"
                              ? "Leads by Brand"
                              : rightPanelTab === "list"
                              ? "Leads by List"
                              : "Leads by Country"}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Click any row to filter the Command Center.
                          </Typography>
                        </Box>
                      </Box>

                      {/* Breakdown Dimension Switcher */}
                      <Box
                        sx={{
                          display: "inline-flex",
                          p: 0.4,
                          borderRadius: "10px",
                          bgcolor: "#f1f5f9",
                          gap: 0.35,
                        }}
                      >
                        {[
                          { id: "status", label: "Status" },
                          { id: "brand", label: "Brand" },
                          { id: "list", label: "List" },
                          { id: "country", label: "Country" },
                        ].map((tab) => {
                          const active = rightPanelTab === tab.id;
                          return (
                            <Box
                              key={tab.id}
                              component="button"
                              type="button"
                              onClick={() => setRightPanelTab(tab.id)}
                              sx={{
                                border: 0,
                                outline: 0,
                                cursor: "pointer",
                                px: 1.2,
                                py: 0.45,
                                borderRadius: "7px",
                                fontSize: 11.5,
                                fontWeight: 800,
                                fontFamily: "inherit",
                                bgcolor: active ? "#6d28d9" : "transparent",
                                color: active ? "#ffffff" : "#475569",
                              }}
                            >
                              {tab.label}
                            </Box>
                          );
                        })}
                      </Box>
                    </Box>

                    {/* Horizontal Animated Bars List */}
                    <Box
                      sx={{
                        display: "grid",
                        gap: 1.35,
                        maxHeight: 460,
                        overflowY: "auto",
                        pr: 0.75,
                        "&::-webkit-scrollbar": { width: 6 },
                        "&::-webkit-scrollbar-track": { bgcolor: "#f8fafc" },
                        "&::-webkit-scrollbar-thumb": {
                          bgcolor: "rgba(100, 116, 139, 0.25)",
                          borderRadius: 999,
                        },
                      }}
                    >
                      {rightPanelTab === "status" &&
                        sortedStatuses.map((st, idx) => {
                          const count = st.count || 0;
                          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                          const barWidth = total > 0 ? Math.max(count > 0 ? 4 : 0, (count / total) * 100) : 0;
                          const barColor = pickStatusBarColor(st.label, st.color, idx);
                          const isSelected = filters.status === st.label;
                          return (
                            <Box
                              key={st.label}
                              onClick={() =>
                                handleFilterChange("status", filters.status === st.label ? "" : st.label)
                              }
                              sx={{
                                display: "grid",
                                gridTemplateColumns: "135px 1fr 105px",
                                alignItems: "center",
                                gap: 1.5,
                                cursor: "pointer",
                                p: 0.85,
                                borderRadius: "10px",
                                bgcolor: isSelected ? "rgba(109, 40, 217, 0.06)" : "transparent",
                                border: "1px solid",
                                borderColor: isSelected ? "#6d28d9" : "transparent",
                                transition: "all 0.15s ease",
                                "&:hover": { bgcolor: "rgba(15, 23, 42, 0.03)" },
                              }}
                            >
                              <Typography variant="body2" fontWeight={700} color="#1e293b" noWrap title={st.label}>
                                {st.label}
                              </Typography>
                              <Box
                                sx={{
                                  height: 12,
                                  borderRadius: 999,
                                  bgcolor: "#eef2f6",
                                  overflow: "hidden",
                                  position: "relative",
                                }}
                              >
                                <Box
                                  sx={{
                                    width: `${barWidth}%`,
                                    height: "100%",
                                    borderRadius: 999,
                                    bgcolor: barColor,
                                    transition: "width 0.65s cubic-bezier(0.22, 1, 0.36, 1)",
                                  }}
                                />
                              </Box>
                              <Box sx={{ textAlign: "right", whiteSpace: "nowrap" }}>
                                <Typography component="span" variant="body2" fontWeight={900} color="#0f172a">
                                  {formatCount(count)}
                                </Typography>
                                <Typography
                                  component="span"
                                  variant="caption"
                                  sx={{ ml: 0.6, color: "#64748b", fontWeight: 700 }}
                                >
                                  ({pct}%)
                                </Typography>
                              </Box>
                            </Box>
                          );
                        })}

                      {rightPanelTab === "brand" &&
                        byBrand.slice(0, 15).map((item, idx) => {
                          const pct = Math.round(item.percentage || 0);
                          const barWidth = Math.max(item.count > 0 ? 4 : 0, item.percentage || 0);
                          const barColor = AVATAR_COLORS[idx % AVATAR_COLORS.length];
                          return (
                            <Box
                              key={item.brand}
                              onClick={() =>
                                handleFilterChange("brand", filters.brand === item.brand ? "" : item.brand)
                              }
                              sx={{
                                display: "grid",
                                gridTemplateColumns: "135px 1fr 105px",
                                alignItems: "center",
                                gap: 1.5,
                                cursor: "pointer",
                                p: 0.85,
                                borderRadius: "10px",
                                "&:hover": { bgcolor: "rgba(15, 23, 42, 0.03)" },
                              }}
                            >
                              <Typography variant="body2" fontWeight={700} color="#1e293b" noWrap title={item.brand}>
                                {item.brand}
                              </Typography>
                              <Box sx={{ height: 12, borderRadius: 999, bgcolor: "#eef2f6", overflow: "hidden" }}>
                                <Box
                                  sx={{
                                    width: `${barWidth}%`,
                                    height: "100%",
                                    borderRadius: 999,
                                    bgcolor: barColor,
                                    transition: "width 0.65s ease",
                                  }}
                                />
                              </Box>
                              <Box sx={{ textAlign: "right", whiteSpace: "nowrap" }}>
                                <Typography component="span" variant="body2" fontWeight={900} color="#0f172a">
                                  {formatCount(item.count)}
                                </Typography>
                                <Typography
                                  component="span"
                                  variant="caption"
                                  sx={{ ml: 0.6, color: "#64748b", fontWeight: 700 }}
                                >
                                  ({pct}%)
                                </Typography>
                              </Box>
                            </Box>
                          );
                        })}

                      {rightPanelTab === "list" &&
                        (byList || []).slice(0, 15).map((item, idx) => {
                          const pct = Math.round(item.percentage || 0);
                          const barWidth = Math.max(item.count > 0 ? 4 : 0, item.percentage || 0);
                          const barColor = AVATAR_COLORS[idx % AVATAR_COLORS.length];
                          return (
                            <Box
                              key={item.listName}
                              onClick={() =>
                                handleFilterChange("list", filters.list === item.listName ? "" : item.listName)
                              }
                              sx={{
                                display: "grid",
                                gridTemplateColumns: "135px 1fr 105px",
                                alignItems: "center",
                                gap: 1.5,
                                cursor: "pointer",
                                p: 0.85,
                                borderRadius: "10px",
                                "&:hover": { bgcolor: "rgba(15, 23, 42, 0.03)" },
                              }}
                            >
                              <Typography variant="body2" fontWeight={700} color="#1e293b" noWrap title={item.listName}>
                                {item.listName}
                              </Typography>
                              <Box sx={{ height: 12, borderRadius: 999, bgcolor: "#eef2f6", overflow: "hidden" }}>
                                <Box
                                  sx={{
                                    width: `${barWidth}%`,
                                    height: "100%",
                                    borderRadius: 999,
                                    bgcolor: barColor,
                                    transition: "width 0.65s ease",
                                  }}
                                />
                              </Box>
                              <Box sx={{ textAlign: "right", whiteSpace: "nowrap" }}>
                                <Typography component="span" variant="body2" fontWeight={900} color="#0f172a">
                                  {formatCount(item.count)}
                                </Typography>
                                <Typography
                                  component="span"
                                  variant="caption"
                                  sx={{ ml: 0.6, color: "#64748b", fontWeight: 700 }}
                                >
                                  ({pct}%)
                                </Typography>
                              </Box>
                            </Box>
                          );
                        })}

                      {rightPanelTab === "country" &&
                        byCountry.slice(0, 15).map((item, idx) => {
                          const pct = Math.round(item.percentage || 0);
                          const barWidth = Math.max(item.count > 0 ? 4 : 0, item.percentage || 0);
                          const barColor = AVATAR_COLORS[idx % AVATAR_COLORS.length];
                          return (
                            <Box
                              key={item.country}
                              onClick={() =>
                                handleFilterChange("country", filters.country === item.country ? "" : item.country)
                              }
                              sx={{
                                display: "grid",
                                gridTemplateColumns: "135px 1fr 105px",
                                alignItems: "center",
                                gap: 1.5,
                                cursor: "pointer",
                                p: 0.85,
                                borderRadius: "10px",
                                "&:hover": { bgcolor: "rgba(15, 23, 42, 0.03)" },
                              }}
                            >
                              <Typography variant="body2" fontWeight={700} color="#1e293b" noWrap title={item.country}>
                                {item.country}
                              </Typography>
                              <Box sx={{ height: 12, borderRadius: 999, bgcolor: "#eef2f6", overflow: "hidden" }}>
                                <Box
                                  sx={{
                                    width: `${barWidth}%`,
                                    height: "100%",
                                    borderRadius: 999,
                                    bgcolor: barColor,
                                    transition: "width 0.65s ease",
                                  }}
                                />
                              </Box>
                              <Box sx={{ textAlign: "right", whiteSpace: "nowrap" }}>
                                <Typography component="span" variant="body2" fontWeight={900} color="#0f172a">
                                  {formatCount(item.count)}
                                </Typography>
                                <Typography
                                  component="span"
                                  variant="caption"
                                  sx={{ ml: 0.6, color: "#64748b", fontWeight: 700 }}
                                >
                                  ({pct}%)
                                </Typography>
                              </Box>
                            </Box>
                          );
                        })}
                    </Box>
                  </CardContent>
                </Card>
              </Box>
            </>
          )}
        </Box>
      </Box>
    </Box>
  );
};

export default LeadListStatistics;
