import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthUser } from "react-auth-kit";
import {
  Alert,
  AppBar,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  LinearProgress,
  MenuItem,
  Pagination,
  Select,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  Toolbar,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import MenuIcon from "@mui/icons-material/Menu";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import { toast } from "react-toastify";
import Sidebar from "./Sidebar.js";
import CrmAppBarActions from "./components/CrmAppBarActions";
import { fetchLeadStatuses, getCachedLeadStatuses, subscribeLeadStatuses } from "./components/leadStatusCache";
import { getStatusColor } from "./components/leadStatusStyles";
import {
  applyReversalApi,
  getReversalHistoryApi,
  getReversalPreviewApi,
  getReversalStatusesApi,
} from "../../../Api/Service";

const PAGE_SIZE = 15;

const number = (value) => Number(value || 0).toLocaleString("en-US");
const leadsText = (count) => `${number(count)} ${Number(count) === 1 ? "lead" : "leads"}`;
const agentsText = (count) => `${count} ${count === 1 ? "agent" : "agents"}`;
const formatWhen = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
};

const cardShell = {
  border: "1px solid",
  borderColor: "divider",
  borderRadius: "18px",
  bgcolor: "background.paper",
  boxShadow: "0 1px 2px rgba(16, 24, 40, 0.04), 0 12px 32px rgba(16, 24, 40, 0.05)",
};

const Initial = ({ name, size = 34 }) => (
  <Box
    aria-hidden="true"
    sx={{
      width: size,
      height: size,
      borderRadius: "50%",
      flexShrink: 0,
      display: "grid",
      placeItems: "center",
      fontWeight: 800,
      fontSize: size * 0.42,
      color: "primary.main",
      bgcolor: (theme) => alpha(theme.palette.primary.main, 0.1),
    }}
  >
    {(name || "?").trim().charAt(0).toUpperCase()}
  </Box>
);

const StepTitle = ({ n, title, hint }) => (
  <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.5, mb: 2 }}>
    <Box
      sx={{
        width: 28,
        height: 28,
        borderRadius: "50%",
        flexShrink: 0,
        display: "grid",
        placeItems: "center",
        bgcolor: "primary.main",
        color: "primary.contrastText",
        fontWeight: 800,
        fontSize: 14,
      }}
    >
      {n}
    </Box>
    <Box>
      <Typography fontWeight={800}>{title}</Typography>
      {hint && (
        <Typography variant="body2" color="text.secondary">
          {hint}
        </Typography>
      )}
    </Box>
  </Box>
);

const StatusTile = ({ row, color, selected, onSelect }) => {
  const disabled = row.canGoBack === 0;
  return (
    <Box
      component="button"
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={() => onSelect(row.status)}
      sx={{
        textAlign: "left",
        font: "inherit",
        color: "text.primary",
        p: 2,
        borderRadius: "14px",
        border: "1px solid",
        borderColor: selected ? "primary.main" : "divider",
        bgcolor: (theme) => (selected ? alpha(theme.palette.primary.main, 0.06) : theme.palette.background.paper),
        boxShadow: (theme) => (selected ? `0 0 0 3px ${alpha(theme.palette.primary.main, 0.14)}` : "none"),
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
        transition: "border-color .15s, box-shadow .15s, background-color .15s",
        "&:hover": disabled ? {} : { borderColor: "primary.main" },
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.25 }}>
        <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: color, flexShrink: 0 }} />
        <Typography fontWeight={700} noWrap>
          {row.status}
        </Typography>
      </Box>
      <Typography sx={{ fontSize: 30, fontWeight: 800, lineHeight: 1.1 }}>{number(row.canGoBack)}</Typography>
      <Typography variant="body2" color="text.secondary">
        {disabled ? "nothing to send back" : "can go back"}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
        {number(row.inPool)} with the admin
        {row.cannotGoBack > 0 && !disabled ? ` · ${number(row.cannotGoBack)} can't` : ""}
      </Typography>
    </Box>
  );
};

const Kpi = ({ label, value, tone, children }) => (
  <Box sx={{ p: 2, borderRadius: "14px", border: "1px solid", borderColor: "divider" }}>
    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: 0.4 }}>
      {label}
    </Typography>
    <Typography sx={{ fontSize: 28, fontWeight: 800, lineHeight: 1.2, color: tone || "text.primary" }}>{value}</Typography>
    <Box sx={{ mt: 0.25 }}>{children}</Box>
  </Box>
);

const AgentRow = ({ agent, max, checked, onToggle }) => (
  <Box
    component="label"
    sx={{
      display: "grid",
      gridTemplateColumns: "auto auto minmax(0, 1fr) auto",
      alignItems: "center",
      columnGap: 1.5,
      py: 1,
      px: 1,
      borderRadius: "12px",
      cursor: "pointer",
      opacity: checked ? 1 : 0.5,
      "&:hover": { bgcolor: "action.hover" },
    }}
  >
    <Checkbox checked={checked} onChange={() => onToggle(agent.agentId)} sx={{ p: 0.5, cursor: "pointer" }} />
    <Initial name={agent.name} />
    <Box sx={{ minWidth: 0 }}>
      <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
        <Typography fontWeight={700} noWrap>
          {agent.name}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {agent.role}
        </Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={max ? Math.max(3, (agent.count / max) * 100) : 0}
        sx={{ mt: 0.75, height: 6, borderRadius: 3, bgcolor: "action.hover", "& .MuiLinearProgress-bar": { borderRadius: 3 } }}
      />
    </Box>
    <Typography fontWeight={800} sx={{ minWidth: 56, textAlign: "right" }}>
      {number(agent.count)}
    </Typography>
  </Box>
);

const AssignmentReversal = () => {
  const authUser = useAuthUser();
  const navigate = useNavigate();
  const role = authUser?.()?.user?.role;

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenu, setisMobileMenu] = useState(false);
  const [tab, setTab] = useState(0);

  const [leadStatuses, setLeadStatuses] = useState(() => getCachedLeadStatuses() || []);
  const [statuses, setStatuses] = useState([]);
  const [loadingStatuses, setLoadingStatuses] = useState(true);
  const [statusError, setStatusError] = useState("");

  const [selectedStatus, setSelectedStatus] = useState("");
  const [excluded, setExcluded] = useState(() => new Set());
  const [viewAgent, setViewAgent] = useState("");
  const [page, setPage] = useState(1);
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const fetchSeq = useRef(0);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [runState, setRunState] = useState("confirm"); // confirm | running | done | changed | error
  const [runMessage, setRunMessage] = useState("");
  const [runResult, setRunResult] = useState(null);

  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (role && role !== "superadmin") navigate("/admin/dashboard/crm");
  }, [navigate, role]);

  useEffect(() => subscribeLeadStatuses(setLeadStatuses), []);
  useEffect(() => {
    fetchLeadStatuses().catch(() => {});
  }, []);

  const loadStatuses = useCallback(async () => {
    setLoadingStatuses(true);
    const response = await getReversalStatusesApi();
    setLoadingStatuses(false);
    if (!response?.success) {
      setStatusError(response?.msg || "Could not load the statuses");
      return;
    }
    setStatusError("");
    setStatuses(response.data?.statuses || []);
  }, []);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    const response = await getReversalHistoryApi();
    setLoadingHistory(false);
    if (response?.success) setHistory(response.data?.reversals || []);
  }, []);

  useEffect(() => {
    loadStatuses();
  }, [loadStatuses]);

  useEffect(() => {
    if (tab === 1) loadHistory();
  }, [tab, loadHistory]);

  // which agents are sent back to: nothing excluded means everyone (the server default)
  const agentParam = useMemo(() => {
    if (!preview || excluded.size === 0) return undefined;
    const ids = preview.agents.filter((agent) => !excluded.has(agent.agentId)).map((agent) => agent.agentId);
    if (ids.length === preview.agents.length) return undefined;
    return ids.join(",") || "none";
  }, [preview, excluded]);

  const loadPreview = useCallback(async () => {
    if (!selectedStatus) return;
    const seq = ++fetchSeq.current;
    setPreviewLoading(true);
    const response = await getReversalPreviewApi({
      status: selectedStatus,
      agentIds: agentParam,
      viewAgentId: viewAgent,
      page,
      limit: PAGE_SIZE,
    });
    if (seq !== fetchSeq.current) return; // a newer request is already on its way
    setPreviewLoading(false);
    if (!response?.success) {
      setPreviewError(response?.msg || "Could not load this status");
      return;
    }
    setPreviewError("");
    setPreview(response.data);
  }, [selectedStatus, agentParam, viewAgent, page]);

  useEffect(() => {
    if (!selectedStatus) {
      setPreview(null);
      return;
    }
    loadPreview();
  }, [selectedStatus, agentParam, viewAgent, page, loadPreview]);

  const chooseStatus = (status) => {
    if (status === selectedStatus) return;
    setSelectedStatus(status);
    setExcluded(new Set());
    setViewAgent("");
    setPage(1);
    setPreview(null);
    setPreviewError("");
  };

  const toggleAgent = (agentId) => {
    setExcluded((current) => {
      const next = new Set(current);
      if (next.has(agentId)) next.delete(agentId);
      else next.add(agentId);
      return next;
    });
    setViewAgent("");
    setPage(1);
  };

  const selectAllAgents = () => {
    setExcluded(new Set());
    setPage(1);
  };
  const selectNoAgents = () => {
    setExcluded(new Set((preview?.agents || []).map((agent) => agent.agentId)));
    setViewAgent("");
    setPage(1);
  };

  const agents = preview?.agents || [];
  const includedAgents = agents.filter((agent) => !excluded.has(agent.agentId));
  const maxCount = agents.reduce((max, agent) => Math.max(max, agent.count), 0);
  const willGoBack = preview?.willGoBack || 0;
  const cannotTotal = (preview?.cannot?.noHistory || 0) + (preview?.cannot?.agentUnavailable || 0);
  const rows = preview?.table?.rows || [];
  const totalRows = preview?.table?.total || 0;
  const pageCount = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));

  const openDialog = () => {
    setRunState("confirm");
    setRunMessage("");
    setRunResult(null);
    setDialogOpen(true);
  };

  const closeDialog = () => {
    if (runState === "running") return;
    setDialogOpen(false);
  };

  const runReversal = async () => {
    setRunState("running");
    const body = { status: selectedStatus, expectedCount: willGoBack };
    if (agentParam) body.agentIds = agentParam === "none" ? [] : agentParam.split(",");
    const response = await applyReversalApi(body);
    if (response?.success) {
      setRunResult(response.data);
      setRunState("done");
      toast.success(response.msg || "Leads sent back");
      setExcluded(new Set());
      setViewAgent("");
      setPage(1);
      loadStatuses();
      loadHistory();
      loadPreview();
      return;
    }
    if (response?.code === "PLAN_CHANGED") {
      setRunMessage(response.msg);
      setRunState("changed");
      loadStatuses();
      loadPreview();
      return;
    }
    if (response?.data?.movedCount) setRunResult(response.data);
    setRunMessage(response?.msg || "Something went wrong. Nothing more was changed.");
    setRunState("error");
    loadStatuses();
    loadPreview();
  };

  const statusColor = (label) => getStatusColor(label, leadStatuses);
  const dimmed = previewLoading && Boolean(preview);

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
        }}
      >
        <AppBar position="static" elevation={0} sx={{ bgcolor: "background.paper", borderBottom: 1, borderColor: "divider" }}>
          <Toolbar sx={{ justifyContent: "space-between" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <IconButton onClick={() => setisMobileMenu(!isMobileMenu)} sx={{ display: { md: "none" } }}>
                <MenuIcon />
              </IconButton>
              <Box>
                <Typography variant="h5" fontWeight={800} color="text.primary">
                  Reverse assignment
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Send leads back to the agent who had them before.
                </Typography>
              </Box>
            </Box>
            <CrmAppBarActions />
          </Toolbar>
        </AppBar>

        <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", p: { xs: 2, sm: 3 } }}>
          <Box sx={{ maxWidth: 1180, mx: "auto" }}>
            <Tabs value={tab} onChange={(event, value) => setTab(value)} sx={{ mb: 2.5, "& .MuiTab-root": { cursor: "pointer", fontWeight: 700 } }}>
              <Tab label="Reverse" />
              <Tab label="History" />
            </Tabs>

            {tab === 0 && (
              <Box sx={{ display: "grid", gap: 3 }}>
                <Card elevation={0} sx={cardShell}>
                  <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
                    <StepTitle
                      n={1}
                      title="Choose a status"
                      hint="Only leads that are now with the super admin, or with nobody, are listed here."
                    />
                    {loadingStatuses && (
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, color: "text.secondary" }}>
                        <CircularProgress size={18} color="inherit" />
                        <Typography variant="body2">Loading statuses…</Typography>
                      </Box>
                    )}
                    {!loadingStatuses && statusError && <Alert severity="error">{statusError}</Alert>}
                    {!loadingStatuses && !statusError && statuses.length === 0 && (
                      <Typography variant="body2" color="text.secondary">
                        No leads are with the super admin right now, so there is nothing to send back.
                      </Typography>
                    )}
                    {!loadingStatuses && statuses.length > 0 && (
                      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 1.5 }}>
                        {statuses.map((row) => (
                          <StatusTile
                            key={row.status}
                            row={row}
                            color={statusColor(row.status)}
                            selected={row.status === selectedStatus}
                            onSelect={chooseStatus}
                          />
                        ))}
                      </Box>
                    )}
                  </CardContent>
                </Card>

                {selectedStatus && (
                  <Card elevation={0} sx={cardShell}>
                    <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
                      <StepTitle
                        n={2}
                        title={`Check who gets what: ${selectedStatus}`}
                        hint="Each lead goes back to the last agent who had it. Untick an agent to leave their leads where they are."
                      />
                      {previewError && (
                        <Alert severity="error" sx={{ mb: 2 }}>
                          {previewError}
                        </Alert>
                      )}
                      {!preview && !previewError && (
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, color: "text.secondary" }}>
                          <CircularProgress size={18} color="inherit" />
                          <Typography variant="body2">Checking the leads…</Typography>
                        </Box>
                      )}
                      {preview && (
                        <Box sx={{ opacity: dimmed ? 0.6 : 1, transition: "opacity .15s" }}>
                          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 1.5, mb: 3 }}>
                            <Kpi label="WILL GO BACK" value={number(willGoBack)} tone="success.main">
                              <Typography variant="body2" color="text.secondary">
                                to {agentsText(includedAgents.length)}
                              </Typography>
                            </Kpi>
                            <Kpi label="CAN'T GO BACK" value={number(cannotTotal)} tone={cannotTotal ? "warning.main" : "text.primary"}>
                              {cannotTotal === 0 && (
                                <Typography variant="body2" color="text.secondary">
                                  Every lead here has an agent to go back to.
                                </Typography>
                              )}
                              {preview.cannot.noHistory > 0 && (
                                <Typography variant="body2" color="text.secondary">
                                  {number(preview.cannot.noHistory)} never had an agent saved
                                </Typography>
                              )}
                              {preview.cannot.agentUnavailable > 0 && (
                                <Typography variant="body2" color="text.secondary">
                                  {number(preview.cannot.agentUnavailable)} have a last agent who can't take leads now
                                </Typography>
                              )}
                            </Kpi>
                          </Box>

                          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 1, mb: 0.5 }}>
                            <Typography fontWeight={800}>Going back to</Typography>
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                              <Typography variant="body2" color="text.secondary">
                                {includedAgents.length} of {agents.length} selected
                              </Typography>
                              <Button size="small" onClick={selectAllAgents} disabled={excluded.size === 0} sx={{ cursor: "pointer" }}>
                                Select all
                              </Button>
                              <Button size="small" onClick={selectNoAgents} disabled={includedAgents.length === 0} sx={{ cursor: "pointer" }}>
                                Select none
                              </Button>
                            </Box>
                          </Box>
                          <Box sx={{ mb: 2 }}>
                            {agents.map((agent) => (
                              <AgentRow
                                key={agent.agentId}
                                agent={agent}
                                max={maxCount}
                                checked={!excluded.has(agent.agentId)}
                                onToggle={toggleAgent}
                              />
                            ))}
                            {agents.length === 0 && (
                              <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
                                No lead in this status can go back.
                              </Typography>
                            )}
                          </Box>

                          {preview.cannot.unavailable.length > 0 && (
                            <Alert severity="warning" icon={<WarningAmberRoundedIcon />} sx={{ mb: 3 }}>
                              These leads stay where they are because their last agent can't take leads now (removed, or no CRM access):{" "}
                              {preview.cannot.unavailable.map((agent) => `${agent.name} (${number(agent.count)})`).join(", ")}
                            </Alert>
                          )}

                          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 1.5, mb: 1.5 }}>
                            <Typography fontWeight={800}>The leads</Typography>
                            <FormControl size="small" sx={{ minWidth: 220 }}>
                              <InputLabel id="reversal-view-agent" shrink>
                                Show leads of
                              </InputLabel>
                              <Select
                                labelId="reversal-view-agent"
                                label="Show leads of"
                                displayEmpty
                                notched
                                value={viewAgent}
                                onChange={(event) => {
                                  setViewAgent(event.target.value);
                                  setPage(1);
                                }}
                                sx={{ cursor: "pointer" }}
                              >
                                <MenuItem value="" sx={{ cursor: "pointer" }}>
                                  All selected agents
                                </MenuItem>
                                {includedAgents.map((agent) => (
                                  <MenuItem key={agent.agentId} value={agent.agentId} sx={{ cursor: "pointer" }}>
                                    {agent.name} ({number(agent.count)})
                                  </MenuItem>
                                ))}
                              </Select>
                            </FormControl>
                          </Box>
                          <TableContainer sx={{ border: "1px solid", borderColor: "divider", borderRadius: "14px" }}>
                            <Table size="small">
                              <TableHead>
                                <TableRow sx={{ "& th": { fontWeight: 800, bgcolor: "action.hover" } }}>
                                  <TableCell>Lead</TableCell>
                                  <TableCell>Phone</TableCell>
                                  <TableCell>Country</TableCell>
                                  <TableCell>Now with</TableCell>
                                  <TableCell>Goes back to</TableCell>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {rows.map((row) => (
                                  <TableRow key={row.id} hover>
                                    <TableCell>
                                      <Typography variant="body2" fontWeight={700}>
                                        {row.name}
                                      </Typography>
                                      {row.email && (
                                        <Typography variant="caption" color="text.secondary">
                                          {row.email}
                                        </Typography>
                                      )}
                                    </TableCell>
                                    <TableCell>{row.phone || "—"}</TableCell>
                                    <TableCell>{row.country || "—"}</TableCell>
                                    <TableCell>
                                      <Typography variant="body2" color="text.secondary">
                                        {row.nowWith ? row.nowWith.name : "Nobody"}
                                      </Typography>
                                    </TableCell>
                                    <TableCell>
                                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                        <ArrowForwardRoundedIcon sx={{ fontSize: 16, color: "text.disabled" }} />
                                        <Typography variant="body2" fontWeight={700}>
                                          {row.goesBackTo.name}
                                        </Typography>
                                      </Box>
                                    </TableCell>
                                  </TableRow>
                                ))}
                                {rows.length === 0 && (
                                  <TableRow>
                                    <TableCell colSpan={5} sx={{ textAlign: "center", color: "text.secondary", py: 4 }}>
                                      No leads to show.
                                    </TableCell>
                                  </TableRow>
                                )}
                              </TableBody>
                            </Table>
                          </TableContainer>
                          {totalRows > PAGE_SIZE && (
                            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 1, mt: 1.5 }}>
                              <Typography variant="body2" color="text.secondary">
                                Showing {number((page - 1) * PAGE_SIZE + 1)}–{number(Math.min(page * PAGE_SIZE, totalRows))} of {number(totalRows)}
                              </Typography>
                              <Pagination count={pageCount} page={page} onChange={(event, value) => setPage(value)} shape="rounded" />
                            </Box>
                          )}
                        </Box>
                      )}
                    </CardContent>
                  </Card>
                )}

                {selectedStatus && preview && (
                  <Card
                    elevation={0}
                    sx={{
                      ...cardShell,
                      position: "sticky",
                      bottom: 0,
                      zIndex: 2,
                      boxShadow: "0 -4px 24px rgba(16, 24, 40, 0.10)",
                    }}
                  >
                    <CardContent sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, flexWrap: "wrap", py: 2 }}>
                      <Box>
                        <Typography fontWeight={800}>
                          {willGoBack > 0
                            ? `${leadsText(willGoBack)} will go back to ${agentsText(includedAgents.length)}`
                            : "Nothing selected to send back"}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Taken from the super admin. Each move is saved in the lead's history.
                        </Typography>
                      </Box>
                      <Button
                        variant="contained"
                        size="large"
                        disabled={willGoBack === 0 || previewLoading}
                        onClick={openDialog}
                        sx={{ borderRadius: 2.5, px: 3, fontWeight: 800, cursor: "pointer" }}
                      >
                        Reverse assignment
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </Box>
            )}

            {tab === 1 && (
              <Card elevation={0} sx={cardShell}>
                <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
                  <Typography fontWeight={800} sx={{ mb: 0.5 }}>
                    Earlier reversals
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    The latest 50. Every lead that moved also has a line in its own history.
                  </Typography>
                  {loadingHistory && history.length === 0 && (
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, color: "text.secondary" }}>
                      <CircularProgress size={18} color="inherit" />
                      <Typography variant="body2">Loading…</Typography>
                    </Box>
                  )}
                  {!loadingHistory && history.length === 0 && (
                    <Typography variant="body2" color="text.secondary">
                      Nothing has been reversed yet.
                    </Typography>
                  )}
                  <Box sx={{ display: "grid", gap: 1.5 }}>
                    {history.map((entry) => (
                      <Box key={entry.id} sx={{ p: 2, borderRadius: "14px", border: "1px solid", borderColor: "divider" }}>
                        <Box sx={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 1, mb: 1 }}>
                          <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, flexWrap: "wrap" }}>
                            <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: statusColor(entry.status) }} />
                            <Typography fontWeight={800}>{entry.status}</Typography>
                            <Typography variant="body2" color="text.secondary">
                              {leadsText(entry.movedCount)} sent back to {agentsText(entry.agents.length)}
                            </Typography>
                          </Box>
                          <Typography variant="body2" color="text.secondary">
                            {formatWhen(entry.createdAt)}
                            {entry.by ? ` · by ${entry.by}` : ""}
                          </Typography>
                        </Box>
                        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
                          {entry.agents.map((agent) => (
                            <Chip key={agent.agentId} size="small" label={`${agent.name} · ${number(agent.count)}`} />
                          ))}
                        </Box>
                        {entry.notMovedCount > 0 && (
                          <Typography variant="caption" color="warning.main" sx={{ display: "block", mt: 1 }}>
                            {leadsText(entry.notMovedCount)} changed in the meantime and were left alone.
                          </Typography>
                        )}
                      </Box>
                    ))}
                  </Box>
                </CardContent>
              </Card>
            )}
          </Box>
        </Box>
      </Box>

      <Dialog open={dialogOpen} onClose={closeDialog} fullWidth maxWidth="xs" PaperProps={{ sx: { borderRadius: 3 } }}>
        {runState === "confirm" && (
          <>
            <DialogTitle sx={{ fontWeight: 800 }}>Send {leadsText(willGoBack)} back?</DialogTitle>
            <DialogContent>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                These <strong>{selectedStatus}</strong> leads move from the super admin to the agent who had them before:
              </Typography>
              <Box sx={{ display: "grid", gap: 0.75, maxHeight: 220, overflowY: "auto", mb: 1.5 }}>
                {includedAgents.map((agent) => (
                  <Box key={agent.agentId} sx={{ display: "flex", justifyContent: "space-between", gap: 2 }}>
                    <Typography variant="body2">{agent.name}</Typography>
                    <Typography variant="body2" fontWeight={800}>
                      {number(agent.count)}
                    </Typography>
                  </Box>
                ))}
              </Box>
              <Typography variant="body2" color="text.secondary">
                Leads that changed since you opened this page are skipped. Everything that moves is saved in the lead's history.
              </Typography>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2.5 }}>
              <Button onClick={closeDialog} sx={{ cursor: "pointer" }}>
                Cancel
              </Button>
              <Button variant="contained" onClick={runReversal} sx={{ cursor: "pointer", fontWeight: 800 }}>
                Send back {leadsText(willGoBack)}
              </Button>
            </DialogActions>
          </>
        )}

        {runState === "running" && (
          <>
            <DialogTitle sx={{ fontWeight: 800 }}>Sending leads back…</DialogTitle>
            <DialogContent>
              <Box sx={{ display: "flex", alignItems: "center", gap: 2, py: 1 }}>
                <CircularProgress size={28} />
                <Typography variant="body2" color="text.secondary">
                  Please keep this window open. A large batch can take up to a minute.
                </Typography>
              </Box>
            </DialogContent>
          </>
        )}

        {runState === "done" && runResult && (
          <>
            <DialogTitle sx={{ fontWeight: 800, display: "flex", alignItems: "center", gap: 1 }}>
              <CheckCircleRoundedIcon color="success" /> Done
            </DialogTitle>
            <DialogContent>
              <Typography sx={{ mb: 1.5 }}>
                <strong>{leadsText(runResult.movedCount)}</strong> went back to <strong>{agentsText(runResult.agents.length)}</strong>.
              </Typography>
              <Box sx={{ display: "grid", gap: 0.75, maxHeight: 220, overflowY: "auto" }}>
                {runResult.agents.map((agent) => (
                  <Box key={agent.agentId} sx={{ display: "flex", justifyContent: "space-between", gap: 2 }}>
                    <Typography variant="body2">{agent.name}</Typography>
                    <Typography variant="body2" fontWeight={800}>
                      {number(agent.count)}
                    </Typography>
                  </Box>
                ))}
              </Box>
              {runResult.notMovedCount > 0 && (
                <Alert severity="info" sx={{ mt: 2 }}>
                  {leadsText(runResult.notMovedCount)} changed while you were reviewing and were left alone.
                </Alert>
              )}
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2.5 }}>
              <Button variant="contained" onClick={closeDialog} sx={{ cursor: "pointer" }}>
                Close
              </Button>
            </DialogActions>
          </>
        )}

        {runState === "changed" && (
          <>
            <DialogTitle sx={{ fontWeight: 800 }}>The leads changed</DialogTitle>
            <DialogContent>
              <Typography variant="body2">{runMessage}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Nothing was moved. The numbers on the page are updated.
              </Typography>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2.5 }}>
              <Button variant="contained" onClick={closeDialog} sx={{ cursor: "pointer" }}>
                Review again
              </Button>
            </DialogActions>
          </>
        )}

        {runState === "error" && (
          <>
            <DialogTitle sx={{ fontWeight: 800 }}>It did not finish</DialogTitle>
            <DialogContent>
              <Typography variant="body2">{runMessage}</Typography>
              {runResult?.movedCount > 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  {leadsText(runResult.movedCount)} already went back before it stopped.
                </Typography>
              )}
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2.5 }}>
              <Button variant="contained" onClick={closeDialog} sx={{ cursor: "pointer" }}>
                Close
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
};

export default AssignmentReversal;
