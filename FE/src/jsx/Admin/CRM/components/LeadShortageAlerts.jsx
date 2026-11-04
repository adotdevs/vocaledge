import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuthUser } from "react-auth-kit";
import { Box, Button, IconButton, Paper, Typography } from "@mui/material";
import { Close } from "@mui/icons-material";
import { getLeadShortageAlertsApi, ignoreLeadShortageAlertApi } from "../../../../Api/Service";
import { subscribeChatEvents } from "../chatEvents";
import { playNotificationSound } from "../notificationSound";

const SNOOZE_MS = 20000;

const LeadShortageAlerts = () => {
  const authUser = useAuthUser();
  const navigate = useNavigate();
  const location = useLocation();
  const role = authUser?.()?.user?.role;
  const [alerts, setAlerts] = useState([]);
  const snoozed = useRef(new Map());
  const ignored = useRef(new Set());
  const shownIds = useRef(new Set());

  const applyAlerts = useCallback((incoming) => {
    const now = Date.now();
    const visible = (incoming || []).filter((alert) => {
      if (!alert?._id || ignored.current.has(String(alert._id))) return false;
      return (snoozed.current.get(String(alert._id)) || 0) <= now;
    });
    setAlerts(visible);
  }, []);

  const load = useCallback(async () => {
    if (role !== "superadmin") return;
    const response = await getLeadShortageAlertsApi();
    if (response?.success) applyAlerts(response.alerts || []);
  }, [applyAlerts, role]);

  useEffect(() => {
    snoozed.current.clear();
    load();
  }, [load, location.pathname]);

  useEffect(() => {
    if (role !== "superadmin") return undefined;
    const timer = setInterval(load, 20000);
    const stop = subscribeChatEvents({
      "leads.shortage": () => load(),
      "leads.shortage.resolved": () => load(),
    });
    return () => {
      clearInterval(timer);
      stop();
    };
  }, [load, role]);

  useEffect(() => {
    const ids = alerts.map((alert) => String(alert._id));
    const hasNew = ids.some((id) => !shownIds.current.has(id));
    shownIds.current = new Set(ids);
    if (hasNew) playNotificationSound("notification");
  }, [alerts]);

  if (role !== "superadmin" || !alerts.length) return null;

  const hideForNow = (id) => {
    snoozed.current.set(String(id), Date.now() + SNOOZE_MS);
    setAlerts((current) => current.filter((alert) => String(alert._id) !== String(id)));
  };

  const ignore = async (id) => {
    ignored.current.add(String(id));
    setAlerts((current) => current.filter((alert) => String(alert._id) !== String(id)));
    const response = await ignoreLeadShortageAlertApi(id);
    if (!response?.success) {
      ignored.current.delete(String(id));
      load();
    }
  };

  return (
    <Box sx={{ position: "fixed", top: 16, right: 16, zIndex: 2000, width: { xs: "calc(100% - 32px)", sm: 420 }, maxHeight: "80vh", overflowY: "auto", overflowX: "visible", display: "grid", gap: 1.5, pr: 1, pb: 3, boxSizing: "border-box" }}>
      {alerts.map((alert) => (
        <Paper key={alert._id} elevation={0} sx={{ p: 2, borderLeft: "4px solid", borderColor: "warning.main", boxShadow: "0 10px 28px rgba(0,0,0,0.22)" }}>
          <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
            <Box sx={{ flex: 1 }}>
              <Typography fontWeight={800}>No leads left for {alert.agentName || "this admin"}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Choose a new list, country, or agent so this user can receive leads.
              </Typography>
            </Box>
            <IconButton size="small" aria-label="Close" onClick={() => hideForNow(alert._id)}>
              <Close fontSize="small" />
            </IconButton>
          </Box>
          <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1, mt: 1.5 }}>
            <Button size="small" onClick={() => navigate(`/admin/crm/lead-automation?admin=${alert.agentId}`)}>Choose leads</Button>
            <Button size="small" color="warning" variant="contained" onClick={() => ignore(alert._id)}>Ignore</Button>
          </Box>
        </Paper>
      ))}
    </Box>
  );
};

export default LeadShortageAlerts;
