import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import DeleteOutline from "@mui/icons-material/DeleteOutline";
import Refresh from "@mui/icons-material/Refresh";
import Sidebar from "./Sidebar";
import { clearFieldNotesApi, deleteFieldNoteApi, fieldNotesApi } from "../../../Api/Service";

const GATE = "fn-gate";

const when = (value) => (value ? new Date(value).toLocaleString() : "—");

const deviceLine = (device) => [device?.type, device?.os, device?.browser].filter(Boolean).join(" · ") || "—";

const placeLine = (place) => {
  if (!place) return "—";
  const spot = place.label || [place.city, place.region, place.country].filter(Boolean).join(", ");
  const pin = place.latitude != null && place.longitude != null
    ? `${Number(place.latitude).toFixed(4)}, ${Number(place.longitude).toFixed(4)}`
    : "";
  return [spot, pin, place.timezone, place.isp].filter(Boolean).join(" · ") || "—";
};

const kindLabel = (row) => {
  if (row.kind === "presence") return "Working";
  if (row.kind === "failed" || row.success === false) return row.reason || "Failed";
  return "Signed in";
};

const kindColor = (row) => {
  if (row.kind === "presence") return "info";
  if (row.kind === "failed" || row.success === false) return "error";
  return "success";
};

const FieldNotes = () => {
  const [isMobileMenu, setisMobileMenu] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [key, setKey] = useState(() => sessionStorage.getItem(GATE) || "");
  const [draft, setDraft] = useState("");
  const [data, setData] = useState(null);
  const [locked, setLocked] = useState(true);
  const [busy, setBusy] = useState(false);
  const [miss, setMiss] = useState(false);
  const [tab, setTab] = useState(0);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [confirmClear, setConfirmClear] = useState(false);
  const [removingId, setRemovingId] = useState("");

  const open = async (nextKey) => {
    const value = String(nextKey || "").trim();
    if (!value) return;
    setBusy(true);
    const response = await fieldNotesApi(value);
    setBusy(false);
    if (!response?.success) {
      sessionStorage.removeItem(GATE);
      setData(null);
      setLocked(true);
      setMiss(true);
      return;
    }
    setMiss(false);
    sessionStorage.setItem(GATE, value);
    setKey(value);
    setData(response);
    setLocked(false);
  };

  useEffect(() => {
    const saved = sessionStorage.getItem(GATE);
    if (saved) open(saved);
  }, []);

  const filteredHistory = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (data?.history || []).filter((row) => {
      if (kind === "login" && row.kind === "presence") return false;
      if (kind === "login" && (row.kind === "failed" || row.success === false)) return false;
      if (kind === "failed" && !(row.kind === "failed" || row.success === false)) return false;
      if (kind === "presence" && row.kind !== "presence") return false;
      if (!needle) return true;
      return `${row.name} ${row.email} ${row.role} ${row.ip} ${placeLine(row.place)} ${deviceLine(row.device)}`.toLowerCase().includes(needle);
    });
  }, [data, query, kind]);

  const removeRow = async (id) => {
    setRemovingId(id);
    const response = await deleteFieldNoteApi(key, id);
    setRemovingId("");
    if (response?.success) {
      setData((current) => current ? {
        ...current,
        history: (current.history || []).filter((row) => row.id !== id),
      } : current);
    }
  };

  const clearAll = async () => {
    setBusy(true);
    const response = await clearFieldNotesApi(key);
    setBusy(false);
    setConfirmClear(false);
    if (response?.success) open(key);
  };

  return (
    <Box sx={{ display: "block", minHeight: "100vh", bgcolor: "#f4f6f8" }}>
      <Sidebar
        setisMobileMenu={setisMobileMenu}
        isMobileMenu={isMobileMenu}
        isCollapsed={isSidebarCollapsed}
        setIsSidebarCollapsed={setIsSidebarCollapsed}
      />
      <Box
        component="main"
        sx={{
          minHeight: "100vh",
          ml: { xs: 0, md: isSidebarCollapsed ? "80px" : "280px" },
          p: { xs: 2, md: 3 },
        }}
      >
        {locked || !data ? (
          <Box sx={{ maxWidth: 420, mx: "auto", mt: 12 }}>
            <Typography variant="h5" fontWeight={800}>Notes</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Private</Typography>
            <TextField
              fullWidth
              type="password"
              size="small"
              placeholder="Key"
              value={draft}
              autoFocus
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") open(draft);
              }}
              sx={{ mt: 2, bgcolor: "background.paper" }}
            />
            <Button sx={{ mt: 1.5 }} variant="contained" disabled={busy || !draft.trim()} onClick={() => open(draft)}>
              {busy ? "Checking..." : "Open"}
            </Button>
            {miss && !busy && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
                Nothing here.
              </Typography>
            )}
          </Box>
        ) : (
          <Box sx={{ display: "grid", gap: 2 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
              <Box>
                <Typography variant="h5" fontWeight={800}>Staff ledger</Typography>
                <Typography variant="body2" color="text.secondary">Sign-ins, failed attempts, and working sessions. Saved on the server.</Typography>
              </Box>
              <Box sx={{ display: "flex", gap: 1 }}>
                <Button size="small" startIcon={<Refresh />} onClick={() => open(key)} disabled={busy}>Refresh</Button>
                <Button size="small" color="error" variant="outlined" startIcon={<DeleteOutline />} onClick={() => setConfirmClear(true)} disabled={busy}>
                  Clear history
                </Button>
              </Box>
            </Box>

            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" }, gap: 1.5 }}>
              {[
                ["Working now", data.counts?.sessions || 0],
                ["Staff", data.counts?.staff || 0],
                ["Saved events", (data.history || []).length],
              ].map(([label, value]) => (
                <Paper key={label} elevation={0} sx={{ p: 2, borderRadius: 2, border: "1px solid", borderColor: "divider" }}>
                  <Typography variant="body2" color="text.secondary">{label}</Typography>
                  <Typography variant="h4" fontWeight={800}>{value}</Typography>
                </Paper>
              ))}
            </Box>

            <Paper elevation={0} sx={{ borderRadius: 2, border: "1px solid", borderColor: "divider" }}>
              <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ px: 1, borderBottom: 1, borderColor: "divider" }}>
                <Tab label="Working now" />
                <Tab label="Everyone" />
                <Tab label="History" />
              </Tabs>

              {tab === 2 && (
                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", p: 1.5 }}>
                  <TextField size="small" placeholder="Search name, email, IP, place" value={query} onChange={(event) => setQuery(event.target.value)} sx={{ minWidth: 260 }} />
                  {[
                    ["all", "All"],
                    ["login", "Sign-ins"],
                    ["failed", "Failed"],
                    ["presence", "Working"],
                  ].map(([id, label]) => (
                    <Chip key={id} label={label} color={kind === id ? "primary" : "default"} variant={kind === id ? "filled" : "outlined"} onClick={() => setKind(id)} />
                  ))}
                </Box>
              )}

              <Box sx={{ overflowX: "auto" }}>
                {tab === 0 && (
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Person</TableCell>
                        <TableCell>Role</TableCell>
                        <TableCell>Last action</TableCell>
                        <TableCell>IP</TableCell>
                        <TableCell>Place</TableCell>
                        <TableCell>Device</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {(data.sessions || []).length === 0 && (
                        <TableRow><TableCell colSpan={6}>No one active in the last 20 minutes.</TableCell></TableRow>
                      )}
                      {(data.sessions || []).map((row) => (
                        <TableRow key={row.id} hover>
                          <TableCell><b>{row.name}</b><br /><Typography variant="caption">{row.email}</Typography></TableCell>
                          <TableCell>{row.role}</TableCell>
                          <TableCell>{when(row.lastActivity)}</TableCell>
                          <TableCell>{row.lastLogin?.ip || "—"}</TableCell>
                          <TableCell sx={{ maxWidth: 280 }}>{placeLine(row.lastLogin?.place)}</TableCell>
                          <TableCell>{deviceLine(row.lastLogin?.device)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}

                {tab === 1 && (
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Person</TableCell>
                        <TableCell>Role</TableCell>
                        <TableCell>Phone</TableCell>
                        <TableCell>Account address</TableCell>
                        <TableCell>Last seen</TableCell>
                        <TableCell>Last IP / place / device</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {(data.staff || []).map((row) => (
                        <TableRow key={row.id} hover selected={row.role === "superadmin"}>
                          <TableCell>
                            <b>{row.name}</b>
                            {row.online && <Chip size="small" color="success" label="Live" sx={{ ml: 1 }} />}
                            <br /><Typography variant="caption">{row.email}</Typography>
                          </TableCell>
                          <TableCell>{row.role}</TableCell>
                          <TableCell>{row.phone || "—"}</TableCell>
                          <TableCell>{[row.address, row.city, row.postalCode, row.country].filter(Boolean).join(", ") || "—"}</TableCell>
                          <TableCell>{when(row.lastActivity || row.lastLogin?.at)}</TableCell>
                          <TableCell sx={{ maxWidth: 320 }}>
                            {row.lastLogin?.ip || "—"}<br />
                            <Typography variant="caption">{placeLine(row.lastLogin?.place)}</Typography><br />
                            <Typography variant="caption">{deviceLine(row.lastLogin?.device)}</Typography>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}

                {tab === 2 && (
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>When</TableCell>
                        <TableCell>Who</TableCell>
                        <TableCell>Event</TableCell>
                        <TableCell>IP</TableCell>
                        <TableCell>Place</TableCell>
                        <TableCell>Device</TableCell>
                        <TableCell align="right" />
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {filteredHistory.length === 0 && (
                        <TableRow><TableCell colSpan={7}>No saved events yet. The next sign-in and later work sessions are stored here.</TableCell></TableRow>
                      )}
                      {filteredHistory.map((row) => (
                        <TableRow key={row.id} hover selected={row.role === "superadmin"}>
                          <TableCell sx={{ whiteSpace: "nowrap" }}>{when(row.createdAt)}</TableCell>
                          <TableCell>
                            <b>{row.name || "Unknown"}</b><br />
                            <Typography variant="caption">{row.email}{row.role ? ` · ${row.role}` : ""}</Typography>
                          </TableCell>
                          <TableCell><Chip size="small" color={kindColor(row)} label={kindLabel(row)} /></TableCell>
                          <TableCell>{row.ip || "—"}</TableCell>
                          <TableCell sx={{ maxWidth: 260 }}>{placeLine(row.place)}</TableCell>
                          <TableCell>
                            {deviceLine(row.device)}
                            <br />
                            <Tooltip title={row.device?.userAgent || ""}>
                              <Typography variant="caption" color="text.secondary">{row.source || ""}</Typography>
                            </Tooltip>
                          </TableCell>
                          <TableCell align="right">
                            <IconButton aria-label="Delete event" size="small" color="error" disabled={removingId === row.id} onClick={() => removeRow(row.id)}>
                              <DeleteOutline fontSize="small" />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </Box>
            </Paper>
          </Box>
        )}
      </Box>

      <Dialog open={confirmClear} onClose={() => !busy && setConfirmClear(false)}>
        <DialogTitle>Clear all history?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">This removes every saved sign-in, failure, and working-session row. Staff profiles stay.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmClear(false)} disabled={busy}>Cancel</Button>
          <Button color="error" variant="contained" onClick={clearAll} disabled={busy}>{busy ? "Clearing..." : "Clear history"}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default FieldNotes;
