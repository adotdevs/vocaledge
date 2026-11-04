import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuthUser } from "react-auth-kit";
import {
  AppBar,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  IconButton,
  Switch,
  TextField,
  Toolbar,
  Typography,
} from "@mui/material";
import { Menu as MenuIcon } from "@mui/icons-material";
import { toast } from "react-toastify";
import Sidebar from "./Sidebar.js";
import CrmAppBarActions from "./components/CrmAppBarActions";
import { getLeadAutomationApi, saveLeadAutomationAdminApi, saveLeadAutomationApi } from "../../../Api/Service";

const emptySkip = { fileNames: [], countries: [], brands: [], sources: [] };

const MultiSelect = ({ label, helper, options, value, onChange, placeholder }) => (
  <Autocomplete
    multiple
    disableCloseOnSelect
    filterSelectedOptions
    options={options}
    value={value || []}
    onChange={(_, next) => onChange(next)}
    renderTags={(tags, getTagProps) => tags.map((option, index) => (
      <Chip {...getTagProps({ index })} key={option} size="small" label={option} />
    ))}
    renderInput={(params) => (
      <TextField {...params} size="small" label={label} placeholder={value?.length ? "" : placeholder} helperText={helper} />
    )}
  />
);

const emptyRules = (admin) => ({
  enabled: admin.enabled !== false,
  maxLeads: admin.maxLeads || 100,
  listNames: admin.listNames || [],
  countries: admin.countries || [],
  agentIds: admin.agentIds || [],
});

const LeadAutomation = () => {
  const authUser = useAuthUser();
  const navigate = useNavigate();
  const role = authUser?.()?.user?.role;
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenu, setisMobileMenu] = useState(false);
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(true);
  const [skip, setSkip] = useState(emptySkip);
  const [savingSkip, setSavingSkip] = useState(false);
  const [savingGlobal, setSavingGlobal] = useState(false);
  const [listNames, setListNames] = useState([]);
  const [countries, setCountries] = useState([]);
  const [brands, setBrands] = useState([]);
  const [sources, setSources] = useState([]);
  const [agents, setAgents] = useState([]);
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
    setSkip({ ...emptySkip, ...(response.skip || {}) });
    setListNames(response.listNames || []);
    setCountries(response.countries || []);
    setBrands(response.brands || []);
    setSources(response.sources || []);
    setAgents(response.agents || []);
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

  const saveSkip = async () => {
    setSavingSkip(true);
    const response = await saveLeadAutomationApi({ skip });
    setSavingSkip(false);
    if (!response?.success) {
      toast.error(response?.msg || "Could not save skipped leads");
      return;
    }
    setSkip({ ...emptySkip, ...(response.skip || skip) });
    toast.success("Skipped leads saved");
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
                <Typography variant="body2" color="text.secondary">Choose which New leads each admin receives</Typography>
              </Box>
            </Box>
            <CrmAppBarActions />
          </Toolbar>
        </AppBar>
        <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", p: { xs: 2, sm: 3 } }}>
          <Card elevation={0} sx={{ mb: 2, border: 1, borderColor: "divider", borderRadius: 3 }}>
            <CardContent sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
              <Box>
                <Typography fontWeight={800}>Automation for all admins</Typography>
                <Typography variant="body2" color="text.secondary">
                  {enabled
                    ? "On. An admin receives a batch only when they have no leads marked New."
                    : "Off. Nobody receives automatic leads. The admin rules below are paused."}
                </Typography>
              </Box>
              <Switch checked={enabled} disabled={savingGlobal} onChange={(event) => toggleGlobal(event.target.checked)} />
            </CardContent>
          </Card>

          <Card elevation={0} sx={{ mb: 2, border: 1, borderColor: "divider", borderRadius: 3 }}>
            <CardContent>
              <Typography fontWeight={800}>Skip these leads for everyone</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
                Anything you select here is never assigned automatically, even if an admin is allowed to receive that list or country. Leave a field empty to skip nothing in that field. Every field is a multiple selection.
              </Typography>
              <Box sx={{ display: "grid", gap: 1.5 }}>
                <MultiSelect label="Skip file names" helper="These files are left out of automation." options={listNames} value={skip.fileNames} onChange={(fileNames) => setSkip((current) => ({ ...current, fileNames }))} placeholder="No file is skipped" />
                <MultiSelect label="Skip countries" helper="These countries are left out of automation." options={countries} value={skip.countries} onChange={(countries) => setSkip((current) => ({ ...current, countries }))} placeholder="No country is skipped" />
                <MultiSelect label="Skip brands" helper="These brands are left out of automation." options={brands} value={skip.brands} onChange={(brands) => setSkip((current) => ({ ...current, brands }))} placeholder="No brand is skipped" />
                <MultiSelect label="Skip sources" helper="These sources are left out of automation." options={sources} value={skip.sources} onChange={(sources) => setSkip((current) => ({ ...current, sources }))} placeholder="No source is skipped" />
              </Box>
              <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 2 }}>
                <Button variant="contained" disabled={savingSkip} onClick={saveSkip}>{savingSkip ? "Saving" : "Save skipped leads"}</Button>
              </Box>
            </CardContent>
          </Card>

          <Box sx={{ opacity: enabled ? 1 : 0.45, pointerEvents: enabled ? "auto" : "none" }}>
          <TextField
            size="small"
            placeholder="Search admin"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            sx={{ mb: 2, width: { xs: "100%", sm: 280 } }}
          />

          {loading && <CircularProgress size={28} />}
          {!loading && shown.map((admin) => {
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
                  opacity: draft.enabled ? 1 : 0.72,
                  boxShadow: highlightId === String(admin._id) ? "0 0 0 6px rgba(237, 108, 2, 0.28)" : "none",
                  transition: "box-shadow 0.3s ease, border-color 0.3s ease",
                }}
              >
                <CardContent>
                  <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, flexWrap: "wrap", mb: 2 }}>
                    <Box>
                      <Typography fontWeight={800}>{admin.name}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {admin.role}{admin.email ? ` · ${admin.email}` : ""}{admin.openCrm ? "" : " · CRM is off, so no leads are sent"}
                      </Typography>
                      <Box sx={{ display: "flex", gap: 1, mt: 1 }}>
                        <Chip size="small" label={`${admin.newLeads || 0} New`} color={admin.newLeads ? "success" : "default"} />
                        <Chip size="small" variant="outlined" label={`${admin.totalLeads || 0} leads in total`} />
                      </Box>
                    </Box>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <Typography variant="body2">{draft.enabled ? "Receives leads" : "Does not receive leads"}</Typography>
                      <Switch checked={draft.enabled} onChange={(event) => updateDraft(admin._id, { enabled: event.target.checked })} />
                    </Box>
                  </Box>
                  <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "160px 1fr" }, gap: 2 }}>
                    <TextField
                      size="small"
                      type="number"
                      label="Maximum leads"
                      value={draft.maxLeads}
                      onChange={(event) => updateDraft(admin._id, { maxLeads: event.target.value })}
                      inputProps={{ min: 1, max: 500 }}
                      helperText="Given when they have no New leads"
                    />
                    <Box sx={{ display: "grid", gap: 1.5 }}>
                      <Typography variant="body2" color="text.secondary">
                        These fields skip leads for this admin only. A selected country or file is not given to them. Leave a field empty to skip nothing extra. If the same country or file is also skipped for everyone, it is still just skipped once.
                      </Typography>
                      <MultiSelect
                        label="Skip file names"
                        helper={draft.listNames.length ? "These files are not given to this admin." : "Empty: no extra file is skipped for this admin."}
                        options={listNames}
                        value={draft.listNames}
                        onChange={(listNames) => updateDraft(admin._id, { listNames })}
                        placeholder="Skip no files"
                      />
                      <MultiSelect
                        label="Skip countries"
                        helper={draft.countries.length ? "These countries are not given to this admin." : "Empty: no extra country is skipped for this admin."}
                        options={countries}
                        value={draft.countries}
                        onChange={(countries) => updateDraft(admin._id, { countries })}
                        placeholder="Skip no countries"
                      />
                      <Autocomplete
                        multiple
                        disableCloseOnSelect
                        filterSelectedOptions
                        options={agents}
                        getOptionLabel={(option) => option.name || ""}
                        isOptionEqualToValue={(option, value) => option.id === value.id}
                        value={agents.filter((agent) => draft.agentIds.includes(agent.id))}
                        onChange={(_, value) => updateDraft(admin._id, { agentIds: value.map((agent) => agent.id) })}
                        renderTags={(value, getTagProps) => value.map((option, index) => (
                          <Chip {...getTagProps({ index })} key={option.id} size="small" label={option.name} />
                        ))}
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            size="small"
                            label="Take leads from agents"
                            placeholder={draft.agentIds.length ? "" : "Usual unassigned pool"}
                            helperText={draft.agentIds.length ? "Only New leads sitting with these agents are given. This does not skip a country." : "Empty: unassigned leads and leads held by a super admin."}
                          />
                        )}
                      />
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
