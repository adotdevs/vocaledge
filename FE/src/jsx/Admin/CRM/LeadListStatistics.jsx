import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AppBar,
  Box,
  CircularProgress,
  Grid,
  IconButton,
  LinearProgress,
  Toolbar,
  Tooltip,
  Typography,
} from "@mui/material";
import { Assessment, Refresh } from "@mui/icons-material";
import Sidebar from "./Sidebar";
import CrmAppBarActions from "./components/CrmAppBarActions";
import { getLeadListStatsApi } from "../../../Api/Service";
import { getStatusColor } from "./components/leadStatusStyles";

const formatCount = (value) => Number(value || 0).toLocaleString();

const shareOf = (count, total) => {
  if (!total || !count) return { value: 0, label: "0%" };
  const value = (count / total) * 100;
  return {
    value,
    label: value < 1 ? "<1%" : `${Math.round(value)}%`,
  };
};

const LeadListStatistics = () => {
  const navigate = useNavigate();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenu, setIsMobileMenu] = useState(false);
  const [total, setTotal] = useState(0);
  const [statuses, setStatuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadStats = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await getLeadListStatsApi();
      if (!response?.success) {
        setTotal(0);
        setStatuses([]);
        setError(response?.msg || "Could not load statistics");
        return;
      }
      setTotal(response.total || 0);
      setStatuses(response.statuses || []);
    } catch (loadError) {
      setError("Could not load statistics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const openLeads = (status) => {
    const query = status ? `?status=${encodeURIComponent(status)}` : "";
    navigate(`/admin/dashboard/crm${query}`);
  };

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: "#f4f6f8" }}>
      <Sidebar
        isCollapsed={isSidebarCollapsed}
        setIsSidebarCollapsed={setIsSidebarCollapsed}
        isMobileMenu={isMobileMenu}
        setisMobileMenu={setIsMobileMenu}
      />
      <Box component="main" sx={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <AppBar position="sticky" elevation={0} color="inherit" sx={{ bgcolor: "#fff", borderBottom: "1px solid", borderColor: "divider" }}>
          <Toolbar>
            <Assessment sx={{ mr: 1.25, color: "primary.main" }} />
            <Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 700 }}>
              Statistics
            </Typography>
            <Tooltip title="Refresh">
              <span>
                <IconButton onClick={loadStats} disabled={loading} aria-label="Refresh statistics">
                  <Refresh />
                </IconButton>
              </span>
            </Tooltip>
            <CrmAppBarActions />
          </Toolbar>
        </AppBar>

        <Box sx={{ p: { xs: 2, sm: 3 }, flex: 1, maxWidth: 1280, width: "100%" }}>
          {loading && statuses.length === 0 ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 10 }}>
              <CircularProgress />
            </Box>
          ) : error ? (
            <Typography color="error">{error}</Typography>
          ) : (
            <>
              <Box
                onClick={() => openLeads("")}
                sx={{
                  mb: 3,
                  p: { xs: 2.5, sm: 3.5 },
                  borderRadius: 3,
                  color: "#fff",
                  cursor: "pointer",
                  background: "linear-gradient(135deg, #1565c0 0%, #0d47a1 100%)",
                  boxShadow: "0 12px 28px rgba(13, 71, 161, 0.22)",
                  display: "flex",
                  alignItems: "flex-end",
                  justifyContent: "space-between",
                  gap: 2,
                  flexWrap: "wrap",
                }}
              >
                <Box>
                  <Typography sx={{ letterSpacing: 1.2, fontSize: 13, fontWeight: 700, opacity: 0.85 }}>
                    ALL LEADS
                  </Typography>
                  <Typography sx={{ fontSize: { xs: 48, sm: 64 }, fontWeight: 800, lineHeight: 1.05, mt: 0.5 }}>
                    {formatCount(total)}
                  </Typography>
                </Box>
                <Typography sx={{ maxWidth: 280, opacity: 0.9, pb: 0.5 }}>
                  Every lead you can see, counted by status. Open a status to view those leads.
                </Typography>
              </Box>

              <Grid container spacing={2}>
                {statuses.map((status) => {
                  const color = getStatusColor(status, statuses);
                  const share = shareOf(status.count, total);
                  return (
                    <Grid item xs={12} sm={6} md={4} lg={3} key={status.label}>
                      <Box
                        onClick={() => openLeads(status.label)}
                        sx={{
                          height: "100%",
                          bgcolor: "#fff",
                          borderRadius: 3,
                          overflow: "hidden",
                          cursor: "pointer",
                          border: "1px solid",
                          borderColor: "rgba(0,0,0,0.06)",
                          boxShadow: "0 1px 2px rgba(16, 24, 40, 0.04)",
                          transition: "transform 160ms ease, box-shadow 160ms ease",
                          "&:hover": {
                            transform: "translateY(-3px)",
                            boxShadow: "0 10px 24px rgba(16, 24, 40, 0.08)",
                          },
                        }}
                      >
                        <Box sx={{ height: 6, bgcolor: color }} />
                        <Box sx={{ p: 2.25 }}>
                          <Typography sx={{ color: "text.secondary", fontWeight: 700, fontSize: 13, letterSpacing: 0.4 }}>
                            {status.label}
                          </Typography>
                          <Typography sx={{ fontSize: 36, fontWeight: 800, lineHeight: 1.15, mt: 0.75, color: "#1a1a1a" }}>
                            {formatCount(status.count)}
                          </Typography>
                          <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, mt: 1.75 }}>
                            <LinearProgress
                              variant="determinate"
                              value={Math.min(100, share.value)}
                              sx={{
                                flex: 1,
                                height: 8,
                                borderRadius: 99,
                                bgcolor: "rgba(0,0,0,0.06)",
                                "& .MuiLinearProgress-bar": { bgcolor: color, borderRadius: 99 },
                              }}
                            />
                            <Typography sx={{ minWidth: 42, textAlign: "right", fontWeight: 700, fontSize: 13, color }}>
                              {share.label}
                            </Typography>
                          </Box>
                        </Box>
                      </Box>
                    </Grid>
                  );
                })}
              </Grid>

              {statuses.length === 0 && (
                <Typography color="text.secondary" sx={{ mt: 2 }}>
                  No leads yet.
                </Typography>
              )}
            </>
          )}
        </Box>
      </Box>
    </Box>
  );
};

export default LeadListStatistics;
