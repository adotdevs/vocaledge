import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuthUser } from "react-auth-kit";
import {
  AppBar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  Switch,
  TextField,
  Toolbar,
  Typography,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { Menu as MenuIcon } from "@mui/icons-material";
import Select from "react-select";
import { toast } from "react-toastify";
import Sidebar from "./Sidebar.js";
import CrmAppBarActions from "./components/CrmAppBarActions";
import { getLeadAutomationApi, saveLeadAutomationAdminApi, saveLeadAutomationApi } from "../../../Api/Service";

const emptyAllow = { fileNames: [], countries: [], brands: [], sources: [] };

const PersonAvatar = ({ name, src, size = 36, active = false }) => {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [src]);
  const initial = (name || "?").trim().charAt(0).toUpperCase();
  const showImage = Boolean(src) && !failed;
  return (
    <Box
      sx={{
        width: size,
        height: size,
        borderRadius: "50%",
        overflow: "hidden",
        flexShrink: 0,
        bgcolor: showImage ? "action.selected" : (active ? "primary.main" : "action.selected"),
        color: active && !showImage ? "primary.contrastText" : "text.secondary",
        display: "grid",
        placeItems: "center",
        fontWeight: 800,
      }}
    >
      {showImage ? (
        <Box component="img" src={src} alt="" onError={() => setFailed(true)} sx={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : initial}
    </Box>
  );
};

const MultiSelect = ({ label, options, value, onChange, placeholder }) => {
  const theme = useTheme();
  const primary = theme.palette.primary.main;
  const known = new Set(options || []);
  const extra = (value || []).filter((item) => item && !known.has(item));
  const selectOptions = [...extra, ...(options || [])].map((option) => ({ value: option, label: option }));
  const selected = (value || []).filter(Boolean).map((option) => ({ value: option, label: option }));
  return (
    <Box>
      <Typography variant="caption" sx={{ display: "block", mb: 0.5, fontWeight: 700, color: "text.secondary" }}>{label}</Typography>
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
            minHeight: 42,
            borderRadius: 10,
            borderColor: state.isFocused ? primary : theme.palette.divider,
            boxShadow: state.isFocused ? `0 0 0 1px ${primary}` : "none",
            backgroundColor: theme.palette.background.paper,
            "&:hover": { borderColor: primary },
          }),
          valueContainer: (base) => ({ ...base, padding: "4px 10px" }),
          menu: (base) => ({
            ...base,
            borderRadius: 12,
            overflow: "hidden",
            backgroundColor: theme.palette.background.paper,
            boxShadow: "0 16px 40px rgba(49, 42, 42, 0.16)",
          }),
          menuPortal: (base) => ({ ...base, zIndex: 1600 }),
          menuList: (base) => ({ ...base, maxHeight: 260, padding: 6 }),
          option: (base, state) => ({
            ...base,
            borderRadius: 8,
            cursor: "pointer",
            backgroundColor: state.isSelected ? "rgba(118, 52, 220, 0.14)" : state.isFocused ? theme.palette.action.hover : "transparent",
            color: theme.palette.text.primary,
            fontWeight: state.isSelected ? 700 : 500,
          }),
          multiValue: (base) => ({ ...base, borderRadius: 999, backgroundColor: "rgba(118, 52, 220, 0.12)" }),
          multiValueLabel: (base) => ({ ...base, color: primary, fontWeight: 700, paddingLeft: 8 }),
          multiValueRemove: (base) => ({
            ...base,
            borderRadius: 999,
            color: primary,
            ":hover": { backgroundColor: primary, color: "#fff" },
          }),
          placeholder: (base) => ({ ...base, color: theme.palette.text.secondary }),
          input: (base) => ({ ...base, color: theme.palette.text.primary }),
          indicatorSeparator: () => ({ display: "none" }),
          dropdownIndicator: (base, state) => ({ ...base, color: state.isFocused ? primary : theme.palette.text.secondary }),
        }}
      />
    </Box>
  );
};

const emptyRules = (admin) => ({
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
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(true);
  const [allow, setAllow] = useState(emptyAllow);
  const [savingAllow, setSavingAllow] = useState(false);
  const [savingGlobal, setSavingGlobal] = useState(false);
  const [listNames, setListNames] = useState([]);
  const [countries, setCountries] = useState([]);
  const [brands, setBrands] = useState([]);
  const [sources, setSources] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [savingId, setSavingId] = useState("");
  const [search, setSearch] = useState("");
  const [searchParams] = useSearchParams();
  const focusAdminId = searchParams.get("admin") || "";
  const [highlightId, setHighlightId] = useState("");
  const cardRefs = useRef({});

  useEffect(() => {
    if (role && role !== "superadmin") navigate("/admin/dashboard/crm");
  }, [navigate, role]);

  const load = async () => {
    setLoading(true);
    const response = await getLeadAutomationApi();
    setLoading(false);
    if (!response?.success) {
      toast.error(response?.msg || "Could not load automation");
      return;
    }
    setEnabled(response.enabled !== false);
    setAllow({ ...emptyAllow, ...(response.allow || {}) });
    setListNames(response.listNames || []);
    setCountries(response.countries || []);
    setBrands(response.brands || []);
    setSources(response.sources || []);
    setAdmins(response.admins || []);
    const next = {};
    (response.admins || []).forEach((admin) => {
      next[admin._id] = emptyRules(admin);
    });
    setDrafts(next);
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!focusAdminId || loading) return undefined;
    setSearch("");
    setHighlightId(focusAdminId);
    const timer = setTimeout(() => {
      cardRefs.current[focusAdminId]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 60);
    const clear = setTimeout(() => setHighlightId(""), 5000);
    return () => {
      clearTimeout(timer);
      clearTimeout(clear);
    };
  }, [focusAdminId, loading, admins]);

  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return admins;
    return admins.filter((admin) => `${admin.name} ${admin.email} ${admin.role}`.toLowerCase().includes(term));
  }, [admins, search]);

  const updateDraft = (id, patch) => {
    setDrafts((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  };

  const toggleGlobal = async (next) => {
    setSavingGlobal(true);
    const response = await saveLeadAutomationApi({ enabled: next });
    setSavingGlobal(false);
    if (!response?.success) {
      toast.error(response?.msg || "Could not update automation");
      return;
    }
    setEnabled(response.enabled !== false);
    toast.success(next ? "Automation is on for every admin" : "Automation is off for every admin");
  };

  const saveAllow = async () => {
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

  const setAgentEnabled = async (admin, nextEnabled) => {
    const draft = { ...(drafts[admin._id] || emptyRules(admin)), enabled: nextEnabled };
    updateDraft(admin._id, { enabled: nextEnabled });
    setSavingId(admin._id);
    const response = await saveLeadAutomationAdminApi(admin._id, draft);
    setSavingId("");
    if (!response?.success) {
      updateDraft(admin._id, { enabled: !nextEnabled });
      toast.error(response?.msg || "Could not update this agent");
      return;
    }
    setAdmins((current) => current.map((item) => (item._id === admin._id ? { ...item, ...response.admin, enabled: nextEnabled } : item)));
  };

  const saveAdmin = async (admin) => {
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
    toast.success(`Saved rules for ${admin.name}`);
  };

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
                <Typography variant="h5" fontWeight={800}>Lead automation</Typography>
                <Typography variant="body2" color="text.secondary">Global rules at the top. Extra rules for each allowed admin below.</Typography>
              </Box>
            </Box>
            <CrmAppBarActions />
          </Toolbar>
        </AppBar>
        <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", p: { xs: 2, sm: 3 } }}>
          <Card elevation={0} sx={{ mb: 3, border: 1, borderColor: "divider", borderRadius: 3 }}>
            <CardContent sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
              <Box>
                <Typography fontWeight={800}>Automation</Typography>
                <Typography variant="body2" color="text.secondary">
                  {enabled ? "On. Allowed admins receive leads when they have none marked New." : "Off. No leads are assigned."}
                </Typography>
              </Box>
              <Switch checked={enabled} disabled={savingGlobal} onChange={(event) => toggleGlobal(event.target.checked)} />
            </CardContent>
          </Card>

          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" }, gap: 2, mb: 3, alignItems: "start" }}>
            <Card elevation={0} sx={{ border: 1, borderColor: "divider", borderRadius: 3, opacity: enabled ? 1 : 0.45, pointerEvents: enabled ? "auto" : "none" }}>
              <CardContent>
                <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, alignItems: "flex-start", mb: 0.5 }}>
                  <Typography fontWeight={800}>Allow agents</Typography>
                  <Chip size="small" label={`${admins.filter((admin) => (drafts[admin._id] || emptyRules(admin)).enabled).length} on`} />
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Everyone starts off. Turn an admin on here. Only these admins receive leads.
                </Typography>
                <TextField
                  size="small"
                  fullWidth
                  placeholder="Search admin"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  sx={{ mb: 1.5 }}
                />
                {loading && <CircularProgress size={28} />}
                {!loading && !shown.length && (
                  <Typography variant="body2" color="text.secondary">No admin matches that search.</Typography>
                )}
                <Box sx={{ display: "grid", gap: 1 }}>
                  {shown.map((admin) => {
                    const on = (drafts[admin._id] || emptyRules(admin)).enabled === true;
                    return (
                      <Box
                        key={admin._id}
                        sx={{
                          border: 1,
                          borderColor: on ? "primary.main" : "divider",
                          bgcolor: on ? "action.hover" : "background.paper",
                          borderRadius: 2,
                          px: 1.25,
                          py: 1,
                          display: "flex",
                          alignItems: "center",
                          gap: 1.25,
                        }}
                      >
                        <PersonAvatar name={admin.name} src={admin.avatar} active={on} />
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Typography fontWeight={700} noWrap>{admin.name}</Typography>
                          <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
                            {admin.role}{admin.openCrm ? "" : " · CRM off"} · {admin.newLeads || 0} New
                          </Typography>
                        </Box>
                        <Switch
                          checked={on}
                          disabled={savingId === admin._id}
                          onChange={(event) => setAgentEnabled(admin, event.target.checked)}
                          inputProps={{ "aria-label": `Allow ${admin.name}` }}
                        />
                      </Box>
                    );
                  })}
                </Box>
              </CardContent>
            </Card>

            <Card elevation={0} sx={{ border: 1, borderColor: "divider", borderRadius: 3 }}>
              <CardContent>
                <Typography fontWeight={800}>Allow these leads</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
                  Applies to every allowed admin. Leave a field empty to allow every value.
                </Typography>
                <Box sx={{ display: "grid", gap: 1.5 }}>
                  <MultiSelect label="File names" options={listNames} value={allow.fileNames} onChange={(fileNames) => setAllow((current) => ({ ...current, fileNames }))} placeholder="Every file" />
                  <MultiSelect label="Countries" options={countries} value={allow.countries} onChange={(next) => setAllow((current) => ({ ...current, countries: next }))} placeholder="Every country" />
                  <MultiSelect label="Brands" options={brands} value={allow.brands} onChange={(next) => setAllow((current) => ({ ...current, brands: next }))} placeholder="Every brand" />
                  <MultiSelect label="Sources" options={sources} value={allow.sources} onChange={(next) => setAllow((current) => ({ ...current, sources: next }))} placeholder="Every source" />
                </Box>
                <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 2 }}>
                  <Button variant="contained" disabled={savingAllow} onClick={saveAllow}>{savingAllow ? "Saving" : "Save global leads"}</Button>
                </Box>
              </CardContent>
            </Card>
          </Box>

          <Box sx={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 2, mb: 1.5, flexWrap: "wrap" }}>
            <Box>
              <Typography fontWeight={800}>Individual admins</Typography>
              <Typography variant="body2" color="text.secondary">
                Optional. An empty field follows the global list above.
              </Typography>
            </Box>
          </Box>

          <Box sx={{ opacity: enabled ? 1 : 0.45, pointerEvents: enabled ? "auto" : "none" }}>
          {loading && <CircularProgress size={28} />}
          {!loading && !admins.some((admin) => (drafts[admin._id] || emptyRules(admin)).enabled === true || String(admin._id) === focusAdminId) && (
            <Card elevation={0} sx={{ border: 1, borderColor: "divider", borderRadius: 3 }}>
              <CardContent>
                <Typography color="text.secondary">Turn an admin on under Allow agents. Their card will show here.</Typography>
              </CardContent>
            </Card>
          )}
          {!loading && admins.filter((admin) => (drafts[admin._id] || emptyRules(admin)).enabled === true || String(admin._id) === focusAdminId).map((admin) => {
            const draft = drafts[admin._id] || emptyRules(admin);
            return (
              <Card
                key={admin._id}
                ref={(node) => { cardRefs.current[String(admin._id)] = node; }}
                elevation={0}
                sx={{
                  mb: 2,
                  border: 1,
                  borderColor: highlightId === String(admin._id) ? "warning.main" : "divider",
                  borderRadius: 3,
                  boxShadow: highlightId === String(admin._id) ? "0 0 0 6px rgba(237, 108, 2, 0.28)" : "none",
                  transition: "box-shadow 0.3s ease, border-color 0.3s ease",
                }}
              >
                <CardContent>
                  <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, minWidth: 0 }}>
                      <PersonAvatar name={admin.name} src={admin.avatar} size={40} active />
                      <Box sx={{ minWidth: 0 }}>
                        <Typography fontWeight={800} noWrap>{admin.name}</Typography>
                        <Typography variant="body2" color="text.secondary" noWrap>
                          {admin.role}{admin.email ? ` · ${admin.email}` : ""}
                        </Typography>
                      </Box>
                    </Box>
                    <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                      {!admin.openCrm && <Chip size="small" color="warning" label="CRM off" />}
                      <Chip size="small" label={`${admin.newLeads || 0} New`} color={admin.newLeads ? "success" : "default"} />
                      <Chip size="small" variant="outlined" label={`${admin.totalLeads || 0} total`} />
                    </Box>
                  </Box>
                  <Divider sx={{ my: 2 }} />
                  <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "200px 1fr" }, gap: 2, alignItems: "start" }}>
                    <TextField
                      size="small"
                      type="number"
                      label="Maximum leads"
                      value={draft.maxLeads}
                      onChange={(event) => updateDraft(admin._id, { maxLeads: event.target.value })}
                      inputProps={{ min: 1, max: 500 }}
                      helperText="When they have no New leads"
                    />
                    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.5 }}>
                      <MultiSelect label="File names" options={listNames} value={draft.listNames} onChange={(listNames) => updateDraft(admin._id, { listNames })} placeholder="Use global list" />
                      <MultiSelect label="Countries" options={countries} value={draft.countries} onChange={(next) => updateDraft(admin._id, { countries: next })} placeholder="Use global list" />
                      <MultiSelect label="Brands" options={brands} value={draft.brands} onChange={(next) => updateDraft(admin._id, { brands: next })} placeholder="Use global list" />
                      <MultiSelect label="Sources" options={sources} value={draft.sources} onChange={(next) => updateDraft(admin._id, { sources: next })} placeholder="Use global list" />
                    </Box>
                  </Box>
                  <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 2 }}>
                    <Button variant="contained" disabled={savingId === admin._id} onClick={() => saveAdmin(admin)}>
                      {savingId === admin._id ? "Saving" : "Save"}
                    </Button>
                  </Box>
                </CardContent>
              </Card>
            );
          })}
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

export default LeadAutomation;
