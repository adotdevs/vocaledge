import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AppBar,
  Autocomplete,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
  Grid,
  IconButton,
  InputAdornment,
  InputLabel,
  LinearProgress,
  MenuItem,
  Select,
  Tab,
  Tabs,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  Assessment,
  Business,
  Clear,
  FilterList,
  FormatListBulleted,
  LocationOn,
  OpenInNew,
  People,
  Person,
  Public,
  Refresh,
  RestartAlt,
  Search,
  Source as SourceIcon,
  TrendingUp,
} from "@mui/icons-material";
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

const getInitials = (name) => {
  if (!name) return "?";
  const parts = String(name).trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const LeadListStatistics = () => {
  const navigate = useNavigate();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenu, setIsMobileMenu] = useState(false);

  // Filter states
  const [filters, setFilters] = useState({
    list: "",
    brand: "",
    agent: "",
    country: "",
    source: "",
  });
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  // Data states
  const [total, setTotal] = useState(0);
  const [statuses, setStatuses] = useState([]);
  const [byBrand, setByBrand] = useState([]);
  const [byAgent, setByAgent] = useState([]);
  const [byCountry, setByCountry] = useState([]);
  const [bySource, setBySource] = useState([]);
  const [filterOptions, setFilterOptions] = useState({
    brands: [],
    lists: [],
    sources: [],
    countries: [],
    agents: [],
  });

  // UI states
  const [activeTab, setActiveTab] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadStats = useCallback(
    async (appliedFilters, isInitial = false) => {
      const activeFilters = appliedFilters !== undefined ? appliedFilters : filtersRef.current;
      if (isInitial) setLoading(true);
      else setRefreshing(true);
      setError("");

      try {
        const response = await getLeadListStatsApi(activeFilters);
        if (!response?.success) {
          setTotal(0);
          setStatuses([]);
          setByBrand([]);
          setByAgent([]);
          setByCountry([]);
          setBySource([]);
          setError(response?.msg || "Could not load statistics");
          return;
        }

        setTotal(response.total || 0);
        setStatuses(response.statuses || []);
        setByBrand(response.byBrand || []);
        setByAgent(response.byAgent || []);
        setByCountry(response.byCountry || []);
        setBySource(response.bySource || []);

        if (response.filterOptions) {
          setFilterOptions((prev) => ({
            brands: response.filterOptions.brands?.length ? response.filterOptions.brands : prev.brands,
            lists: response.filterOptions.lists?.length ? response.filterOptions.lists : prev.lists,
            sources: response.filterOptions.sources?.length ? response.filterOptions.sources : prev.sources,
            countries: response.filterOptions.countries?.length ? response.filterOptions.countries : prev.countries,
            agents: response.filterOptions.agents?.length ? response.filterOptions.agents : prev.agents,
          }));
        }
      } catch (loadError) {
        setError("Could not load statistics. Please try again.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    loadStats(undefined, true);
  }, [loadStats]);

  const handleFilterChange = (key, value) => {
    const nextFilters = { ...filters, [key]: value || "" };
    setFilters(nextFilters);
    loadStats(nextFilters, false);
  };

  const handleClearAllFilters = () => {
    const emptyFilters = {
      list: "",
      brand: "",
      agent: "",
      country: "",
      source: "",
    };
    setFilters(emptyFilters);
    loadStats(emptyFilters, false);
  };

  const activeFilterCount = useMemo(() => {
    return Object.values(filters).filter((val) => Boolean(val)).length;
  }, [filters]);

  const openLeads = (extraParams = {}) => {
    const params = new URLSearchParams();

    // Include active filters in navigation query
    if (filters.brand) params.set("brandSearch", filters.brand);
    if (filters.country) params.set("countrySearch", filters.country);
    if (filters.agent) params.set("agent", filters.agent);
    if (filters.list) params.set("list", filters.list);
    if (filters.source) params.set("source", filters.source);

    // Apply specific item clicks (status, brand, agent, country)
    Object.entries(extraParams).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") {
        params.set(k, v);
      }
    });

    const queryString = params.toString();
    navigate(`/admin/dashboard/crm${queryString ? `?${queryString}` : ""}`);
  };

  // Filtered lists for the active tab when search is used
  const filteredBrands = useMemo(() => {
    if (!searchTerm.trim()) return byBrand;
    const q = searchTerm.toLowerCase();
    return byBrand.filter((item) => item.brand.toLowerCase().includes(q));
  }, [byBrand, searchTerm]);

  const filteredAgents = useMemo(() => {
    if (!searchTerm.trim()) return byAgent;
    const q = searchTerm.toLowerCase();
    return byAgent.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.email?.toLowerCase().includes(q) ||
        item.role?.toLowerCase().includes(q)
    );
  }, [byAgent, searchTerm]);

  const filteredCountries = useMemo(() => {
    if (!searchTerm.trim()) return byCountry;
    const q = searchTerm.toLowerCase();
    return byCountry.filter((item) => item.country.toLowerCase().includes(q));
  }, [byCountry, searchTerm]);

  const filteredSources = useMemo(() => {
    if (!searchTerm.trim()) return bySource;
    const q = searchTerm.toLowerCase();
    return bySource.filter((item) => item.source.toLowerCase().includes(q));
  }, [bySource, searchTerm]);

  const filteredStatuses = useMemo(() => {
    if (!searchTerm.trim()) return statuses;
    const q = searchTerm.toLowerCase();
    return statuses.filter((item) => item.label.toLowerCase().includes(q));
  }, [statuses, searchTerm]);

  // Selected list display name helper
  const selectedListName = useMemo(() => {
    if (!filters.list) return "";
    const found = filterOptions.lists.find((l) => l.id === filters.list || l.name === filters.list);
    return found ? found.name : filters.list;
  }, [filters.list, filterOptions.lists]);

  // Selected agent display name helper
  const selectedAgentName = useMemo(() => {
    if (!filters.agent) return "";
    if (filters.agent === "unassigned") return "Unassigned";
    const found = filterOptions.agents.find((a) => a.id === filters.agent);
    return found ? found.name : filters.agent;
  }, [filters.agent, filterOptions.agents]);

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: "#f4f6f8" }}>
      <Sidebar
        isCollapsed={isSidebarCollapsed}
        setIsSidebarCollapsed={setIsSidebarCollapsed}
        isMobileMenu={isMobileMenu}
        setisMobileMenu={setIsMobileMenu}
      />
      <Box component="main" sx={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* Sticky App Bar */}
        <AppBar
          position="sticky"
          elevation={0}
          color="inherit"
          sx={{
            bgcolor: "#fff",
            borderBottom: "1px solid",
            borderColor: "divider",
            zIndex: 10,
          }}
        >
          <Toolbar sx={{ flexWrap: "wrap", gap: 1, py: { xs: 1, sm: 1.25 } }}>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 38,
                height: 38,
                borderRadius: 2,
                background: "linear-gradient(135deg, #1565c0 0%, #0d47a1 100%)",
                color: "#fff",
                mr: 1.5,
                boxShadow: "0 4px 10px rgba(21, 101, 192, 0.3)",
              }}
            >
              <Assessment sx={{ fontSize: 22 }} />
            </Box>
            <Box sx={{ flexGrow: 1, minWidth: 200 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Typography variant="h6" sx={{ fontWeight: 800, color: "#111827", lineHeight: 1.2 }}>
                  Lead Statistics & Analytics
                </Typography>
                <Chip
                  size="small"
                  label={`${formatCount(total)} Leads`}
                  color="primary"
                  sx={{ fontWeight: 700, fontSize: "0.75rem", height: 22 }}
                />
              </Box>
              <Typography variant="caption" sx={{ color: "text.secondary", display: { xs: "none", sm: "block" } }}>
                Analyze lead distribution across lists, brands, agents, countries, and status stages.
              </Typography>
            </Box>

            <Tooltip title="Refresh statistics">
              <span>
                <IconButton
                  onClick={() => loadStats(filters, false)}
                  disabled={loading || refreshing}
                  aria-label="Refresh statistics"
                  sx={{
                    bgcolor: "rgba(0,0,0,0.03)",
                    "&:hover": { bgcolor: "rgba(0,0,0,0.06)" },
                  }}
                >
                  <Refresh
                    sx={{
                      animation: refreshing ? "spin 1s linear infinite" : "none",
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
              variant="contained"
              size="small"
              startIcon={<OpenInNew sx={{ fontSize: 16 }} />}
              onClick={() => openLeads()}
              sx={{
                bgcolor: "#1565c0",
                fontWeight: 700,
                textTransform: "none",
                borderRadius: 2,
                px: 2,
                boxShadow: "0 4px 12px rgba(21, 101, 192, 0.25)",
                "&:hover": { bgcolor: "#0d47a1" },
              }}
            >
              View in CRM
            </Button>
            <CrmAppBarActions />
          </Toolbar>
          {refreshing && <LinearProgress color="primary" sx={{ height: 2 }} />}
        </AppBar>

        <Box sx={{ p: { xs: 2, sm: 3 }, flex: 1, maxWidth: 1400, width: "100%", mx: "auto" }}>
          {/* Filters Card */}
          <Card
            elevation={0}
            sx={{
              mb: 3,
              borderRadius: 3,
              border: "1px solid",
              borderColor: "rgba(0,0,0,0.08)",
              boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
              bgcolor: "#fff",
            }}
          >
            <CardContent sx={{ p: { xs: 2, sm: 2.5 }, "&:last-child": { pb: 2.5 } }}>
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
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <FilterList sx={{ color: "primary.main", fontSize: 22 }} />
                  <Typography variant="subtitle1" sx={{ fontWeight: 800, color: "#111827" }}>
                    Filter Statistics
                  </Typography>
                  {activeFilterCount > 0 && (
                    <Chip
                      size="small"
                      color="secondary"
                      label={`${activeFilterCount} active`}
                      sx={{ fontWeight: 700, height: 20, fontSize: "0.7rem" }}
                    />
                  )}
                </Box>

                {activeFilterCount > 0 && (
                  <Button
                    size="small"
                    variant="text"
                    color="error"
                    startIcon={<RestartAlt fontSize="small" />}
                    onClick={handleClearAllFilters}
                    sx={{ textTransform: "none", fontWeight: 700, py: 0.25 }}
                  >
                    Clear All Filters
                  </Button>
                )}
              </Box>

              <Grid container spacing={2}>
                {/* 1. List Name Filter */}
                <Grid item xs={12} sm={6} md={2.4}>
                  <FormControl fullWidth size="small">
                    <InputLabel id="filter-list-label">List Name</InputLabel>
                    <Select
                      labelId="filter-list-label"
                      label="List Name"
                      value={filters.list}
                      onChange={(e) => handleFilterChange("list", e.target.value)}
                      startAdornment={
                        <InputAdornment position="start">
                          <FormatListBulleted fontSize="small" sx={{ color: "text.secondary" }} />
                        </InputAdornment>
                      }
                    >
                      <MenuItem value="">
                        <em>All Lists</em>
                      </MenuItem>
                      {filterOptions.lists.map((list) => (
                        <MenuItem key={list.id} value={list.id}>
                          <Box sx={{ display: "flex", justifyContent: "space-between", width: "100%", gap: 1 }}>
                            <Typography variant="body2" sx={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis" }}>
                              {list.name}
                            </Typography>
                            {list.leadCount > 0 && (
                              <Chip
                                size="small"
                                label={formatCount(list.leadCount)}
                                sx={{ height: 18, fontSize: "0.7rem", fontWeight: 700 }}
                              />
                            )}
                          </Box>
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>

                {/* 2. Brand Filter */}
                <Grid item xs={12} sm={6} md={2.4}>
                  <Autocomplete
                    size="small"
                    options={filterOptions.brands}
                    value={filters.brand || null}
                    onChange={(event, newValue) => handleFilterChange("brand", newValue || "")}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Brand"
                        placeholder="Search or select brand"
                        InputProps={{
                          ...params.InputProps,
                          startAdornment: (
                            <>
                              <InputAdornment position="start">
                                <Business fontSize="small" sx={{ color: "text.secondary" }} />
                              </InputAdornment>
                              {params.InputProps.startAdornment}
                            </>
                          ),
                        }}
                      />
                    )}
                  />
                </Grid>

                {/* 3. Agent Filter */}
                <Grid item xs={12} sm={6} md={2.4}>
                  <FormControl fullWidth size="small">
                    <InputLabel id="filter-agent-label">Agent</InputLabel>
                    <Select
                      labelId="filter-agent-label"
                      label="Agent"
                      value={filters.agent}
                      onChange={(e) => handleFilterChange("agent", e.target.value)}
                      startAdornment={
                        <InputAdornment position="start">
                          <Person fontSize="small" sx={{ color: "text.secondary" }} />
                        </InputAdornment>
                      }
                    >
                      <MenuItem value="">
                        <em>All Agents</em>
                      </MenuItem>
                      <MenuItem value="unassigned">
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                          <Box
                            sx={{
                              width: 8,
                              height: 8,
                              borderRadius: "50%",
                              bgcolor: "#f59e0b",
                            }}
                          />
                          <Typography variant="body2" sx={{ fontWeight: 600, color: "#d97706" }}>
                            Unassigned
                          </Typography>
                        </Box>
                      </MenuItem>
                      <Divider />
                      {filterOptions.agents.map((agent) => (
                        <MenuItem key={agent.id} value={agent.id}>
                          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                            <Avatar
                              sx={{
                                width: 22,
                                height: 22,
                                fontSize: "0.65rem",
                                bgcolor: "#1565c0",
                              }}
                            >
                              {getInitials(agent.name)}
                            </Avatar>
                            <Box>
                              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                {agent.name}
                              </Typography>
                              {agent.role && (
                                <Typography variant="caption" sx={{ color: "text.secondary", fontSize: "0.68rem" }}>
                                  ({agent.role})
                                </Typography>
                              )}
                            </Box>
                          </Box>
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>

                {/* 4. Country Filter */}
                <Grid item xs={12} sm={6} md={2.4}>
                  <Autocomplete
                    size="small"
                    options={filterOptions.countries}
                    value={filters.country || null}
                    onChange={(event, newValue) => handleFilterChange("country", newValue || "")}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Country"
                        placeholder="Search or select country"
                        InputProps={{
                          ...params.InputProps,
                          startAdornment: (
                            <>
                              <InputAdornment position="start">
                                <LocationOn fontSize="small" sx={{ color: "text.secondary" }} />
                              </InputAdornment>
                              {params.InputProps.startAdornment}
                            </>
                          ),
                        }}
                      />
                    )}
                  />
                </Grid>

                {/* 5. Source Filter */}
                <Grid item xs={12} sm={6} md={2.4}>
                  <FormControl fullWidth size="small">
                    <InputLabel id="filter-source-label">Source</InputLabel>
                    <Select
                      labelId="filter-source-label"
                      label="Source"
                      value={filters.source}
                      onChange={(e) => handleFilterChange("source", e.target.value)}
                      startAdornment={
                        <InputAdornment position="start">
                          <SourceIcon fontSize="small" sx={{ color: "text.secondary" }} />
                        </InputAdornment>
                      }
                    >
                      <MenuItem value="">
                        <em>All Sources</em>
                      </MenuItem>
                      {filterOptions.sources.map((src) => (
                        <MenuItem key={src} value={src}>
                          {src}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>

              {/* Active Filter Chips Bar */}
              {activeFilterCount > 0 && (
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: 1,
                    mt: 2,
                    pt: 1.5,
                    borderTop: "1px dashed rgba(0,0,0,0.08)",
                  }}
                >
                  <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary", mr: 0.5 }}>
                    Active filters:
                  </Typography>

                  {filters.list && (
                    <Chip
                      size="small"
                      color="primary"
                      variant="outlined"
                      icon={<FormatListBulleted sx={{ fontSize: "14px !important" }} />}
                      label={`List: ${selectedListName}`}
                      onDelete={() => handleFilterChange("list", "")}
                      sx={{ fontWeight: 600, bgcolor: "rgba(21, 101, 192, 0.04)" }}
                    />
                  )}

                  {filters.brand && (
                    <Chip
                      size="small"
                      color="primary"
                      variant="outlined"
                      icon={<Business sx={{ fontSize: "14px !important" }} />}
                      label={`Brand: ${filters.brand}`}
                      onDelete={() => handleFilterChange("brand", "")}
                      sx={{ fontWeight: 600, bgcolor: "rgba(21, 101, 192, 0.04)" }}
                    />
                  )}

                  {filters.agent && (
                    <Chip
                      size="small"
                      color="primary"
                      variant="outlined"
                      icon={<Person sx={{ fontSize: "14px !important" }} />}
                      label={`Agent: ${selectedAgentName}`}
                      onDelete={() => handleFilterChange("agent", "")}
                      sx={{ fontWeight: 600, bgcolor: "rgba(21, 101, 192, 0.04)" }}
                    />
                  )}

                  {filters.country && (
                    <Chip
                      size="small"
                      color="primary"
                      variant="outlined"
                      icon={<LocationOn sx={{ fontSize: "14px !important" }} />}
                      label={`Country: ${filters.country}`}
                      onDelete={() => handleFilterChange("country", "")}
                      sx={{ fontWeight: 600, bgcolor: "rgba(21, 101, 192, 0.04)" }}
                    />
                  )}

                  {filters.source && (
                    <Chip
                      size="small"
                      color="primary"
                      variant="outlined"
                      icon={<SourceIcon sx={{ fontSize: "14px !important" }} />}
                      label={`Source: ${filters.source}`}
                      onDelete={() => handleFilterChange("source", "")}
                      sx={{ fontWeight: 600, bgcolor: "rgba(21, 101, 192, 0.04)" }}
                    />
                  )}
                </Box>
              )}
            </CardContent>
          </Card>

          {/* KPI Summary Cards */}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            {/* 1. All Leads (Hero Card) */}
            <Grid item xs={12} sm={6} md={3}>
              <Box
                onClick={() => openLeads()}
                sx={{
                  p: 2.5,
                  borderRadius: 3,
                  color: "#fff",
                  cursor: "pointer",
                  height: "100%",
                  background: "linear-gradient(135deg, #1565c0 0%, #0d47a1 100%)",
                  boxShadow: "0 10px 24px rgba(13, 71, 161, 0.22)",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  transition: "transform 180ms ease, box-shadow 180ms ease",
                  "&:hover": {
                    transform: "translateY(-3px)",
                    boxShadow: "0 14px 28px rgba(13, 71, 161, 0.3)",
                  },
                }}
              >
                <Box>
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <Typography sx={{ letterSpacing: 1.1, fontSize: 12, fontWeight: 800, opacity: 0.9 }}>
                      {activeFilterCount > 0 ? "FILTERED LEADS" : "ALL LEADS"}
                    </Typography>
                    <OpenInNew sx={{ fontSize: 16, opacity: 0.8 }} />
                  </Box>
                  <Typography sx={{ fontSize: { xs: 36, sm: 42 }, fontWeight: 800, lineHeight: 1.1, mt: 0.75 }}>
                    {formatCount(total)}
                  </Typography>
                </Box>
                <Typography sx={{ fontSize: 12, opacity: 0.85, mt: 1.5 }}>
                  Click to open all {formatCount(total)} leads in CRM
                </Typography>
              </Box>
            </Grid>

            {/* 2. Brands KPI */}
            <Grid item xs={12} sm={6} md={3}>
              <Box
                onClick={() => setActiveTab(1)}
                sx={{
                  p: 2.5,
                  borderRadius: 3,
                  bgcolor: "#fff",
                  border: "1px solid",
                  borderColor: "rgba(0,0,0,0.06)",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                  cursor: "pointer",
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  transition: "transform 180ms ease, box-shadow 180ms ease",
                  "&:hover": {
                    transform: "translateY(-3px)",
                    boxShadow: "0 10px 24px rgba(0,0,0,0.08)",
                  },
                }}
              >
                <Box>
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <Typography sx={{ color: "text.secondary", fontSize: 12, fontWeight: 700, letterSpacing: 0.5 }}>
                      BRANDS
                    </Typography>
                    <Box
                      sx={{
                        width: 32,
                        height: 32,
                        borderRadius: "50%",
                        bgcolor: "rgba(124, 58, 237, 0.1)",
                        color: "#7c3aed",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Business sx={{ fontSize: 18 }} />
                    </Box>
                  </Box>
                  <Typography sx={{ fontSize: { xs: 32, sm: 36 }, fontWeight: 800, color: "#111827", mt: 0.5 }}>
                    {byBrand.length}
                  </Typography>
                </Box>
                <Typography sx={{ fontSize: 12, color: "text.secondary", mt: 1 }}>
                  {byBrand[0] ? `Top: ${byBrand[0].brand} (${formatCount(byBrand[0].count)})` : "No brands"}
                </Typography>
              </Box>
            </Grid>

            {/* 3. Agents KPI */}
            <Grid item xs={12} sm={6} md={3}>
              <Box
                onClick={() => setActiveTab(2)}
                sx={{
                  p: 2.5,
                  borderRadius: 3,
                  bgcolor: "#fff",
                  border: "1px solid",
                  borderColor: "rgba(0,0,0,0.06)",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                  cursor: "pointer",
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  transition: "transform 180ms ease, box-shadow 180ms ease",
                  "&:hover": {
                    transform: "translateY(-3px)",
                    boxShadow: "0 10px 24px rgba(0,0,0,0.08)",
                  },
                }}
              >
                <Box>
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <Typography sx={{ color: "text.secondary", fontSize: 12, fontWeight: 700, letterSpacing: 0.5 }}>
                      AGENTS
                    </Typography>
                    <Box
                      sx={{
                        width: 32,
                        height: 32,
                        borderRadius: "50%",
                        bgcolor: "rgba(16, 185, 129, 0.1)",
                        color: "#10b981",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <People sx={{ fontSize: 18 }} />
                    </Box>
                  </Box>
                  <Typography sx={{ fontSize: { xs: 32, sm: 36 }, fontWeight: 800, color: "#111827", mt: 0.5 }}>
                    {byAgent.filter((a) => a.agentId !== "unassigned").length}
                  </Typography>
                </Box>
                <Typography sx={{ fontSize: 12, color: "text.secondary", mt: 1 }}>
                  {byAgent.find((a) => a.agentId === "unassigned")?.count
                    ? `${formatCount(byAgent.find((a) => a.agentId === "unassigned")?.count)} unassigned`
                    : "All leads assigned"}
                </Typography>
              </Box>
            </Grid>

            {/* 4. Countries KPI */}
            <Grid item xs={12} sm={6} md={3}>
              <Box
                onClick={() => setActiveTab(3)}
                sx={{
                  p: 2.5,
                  borderRadius: 3,
                  bgcolor: "#fff",
                  border: "1px solid",
                  borderColor: "rgba(0,0,0,0.06)",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                  cursor: "pointer",
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  transition: "transform 180ms ease, box-shadow 180ms ease",
                  "&:hover": {
                    transform: "translateY(-3px)",
                    boxShadow: "0 10px 24px rgba(0,0,0,0.08)",
                  },
                }}
              >
                <Box>
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <Typography sx={{ color: "text.secondary", fontSize: 12, fontWeight: 700, letterSpacing: 0.5 }}>
                      COUNTRIES
                    </Typography>
                    <Box
                      sx={{
                        width: 32,
                        height: 32,
                        borderRadius: "50%",
                        bgcolor: "rgba(245, 158, 11, 0.1)",
                        color: "#f59e0b",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Public sx={{ fontSize: 18 }} />
                    </Box>
                  </Box>
                  <Typography sx={{ fontSize: { xs: 32, sm: 36 }, fontWeight: 800, color: "#111827", mt: 0.5 }}>
                    {byCountry.length}
                  </Typography>
                </Box>
                <Typography sx={{ fontSize: 12, color: "text.secondary", mt: 1 }}>
                  {byCountry[0] ? `Top: ${byCountry[0].country} (${formatCount(byCountry[0].count)})` : "No countries"}
                </Typography>
              </Box>
            </Grid>
          </Grid>

          {/* Navigation Tabs Bar with In-Tab Search */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 2,
              mb: 2.5,
              borderBottom: "1px solid",
              borderColor: "divider",
              pb: 0.5,
            }}
          >
            <Tabs
              value={activeTab}
              onChange={(e, val) => {
                setActiveTab(val);
                setSearchTerm("");
              }}
              variant="scrollable"
              scrollButtons="auto"
              sx={{
                "& .MuiTab-root": {
                  textTransform: "none",
                  fontWeight: 700,
                  fontSize: "0.9375rem",
                  minHeight: 48,
                  px: 2,
                },
              }}
            >
              <Tab
                icon={<Assessment sx={{ fontSize: 18 }} />}
                iconPosition="start"
                label={
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                    <span>By Status</span>
                    <Chip size="small" label={statuses.length} sx={{ height: 18, fontSize: "0.68rem", fontWeight: 700 }} />
                  </Box>
                }
              />
              <Tab
                icon={<Business sx={{ fontSize: 18 }} />}
                iconPosition="start"
                label={
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                    <span>Stats by Brand</span>
                    <Chip size="small" label={byBrand.length} sx={{ height: 18, fontSize: "0.68rem", fontWeight: 700 }} />
                  </Box>
                }
              />
              <Tab
                icon={<Person sx={{ fontSize: 18 }} />}
                iconPosition="start"
                label={
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                    <span>Stats by Agent</span>
                    <Chip size="small" label={byAgent.length} sx={{ height: 18, fontSize: "0.68rem", fontWeight: 700 }} />
                  </Box>
                }
              />
              <Tab
                icon={<LocationOn sx={{ fontSize: 18 }} />}
                iconPosition="start"
                label={
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                    <span>Stats by Country</span>
                    <Chip size="small" label={byCountry.length} sx={{ height: 18, fontSize: "0.68rem", fontWeight: 700 }} />
                  </Box>
                }
              />
              {bySource.length > 0 && (
                <Tab
                  icon={<SourceIcon sx={{ fontSize: 18 }} />}
                  iconPosition="start"
                  label={
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                      <span>Stats by Source</span>
                      <Chip size="small" label={bySource.length} sx={{ height: 18, fontSize: "0.68rem", fontWeight: 700 }} />
                    </Box>
                  }
                />
              )}
            </Tabs>

            {/* Quick In-Tab Search */}
            <TextField
              size="small"
              placeholder={`Search in ${["statuses", "brands", "agents", "countries", "sources"][activeTab]}...`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              sx={{ width: { xs: "100%", sm: 260 }, bgcolor: "#fff", borderRadius: 2 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Search sx={{ fontSize: 18, color: "text.secondary" }} />
                  </InputAdornment>
                ),
                endAdornment: searchTerm ? (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setSearchTerm("")}>
                      <Clear sx={{ fontSize: 16 }} />
                    </IconButton>
                  </InputAdornment>
                ) : null,
              }}
            />
          </Box>

          {/* Tab Panels */}
          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", py: 12 }}>
              <CircularProgress size={44} />
            </Box>
          ) : error ? (
            <Box sx={{ p: 4, bgcolor: "#fee2e2", borderRadius: 3, color: "#b91c1c" }}>
              <Typography fontWeight={700}>{error}</Typography>
              <Button variant="outlined" color="error" sx={{ mt: 2 }} onClick={() => loadStats(filters, false)}>
                Retry
              </Button>
            </Box>
          ) : (
            <>
              {/* TAB 0: BY STATUS */}
              {activeTab === 0 && (
                <Grid container spacing={2}>
                  {filteredStatuses.map((status) => {
                    const color = getStatusColor(status, statuses);
                    const share = shareOf(status.count, total);
                    return (
                      <Grid item xs={12} sm={6} md={4} lg={3} key={status.label}>
                        <Box
                          onClick={() => openLeads({ status: status.label })}
                          sx={{
                            height: "100%",
                            bgcolor: "#fff",
                            borderRadius: 3,
                            overflow: "hidden",
                            cursor: "pointer",
                            border: "1px solid",
                            borderColor: "rgba(0,0,0,0.06)",
                            boxShadow: "0 1px 3px rgba(16, 24, 40, 0.04)",
                            transition: "all 180ms ease",
                            "&:hover": {
                              transform: "translateY(-4px)",
                              boxShadow: "0 12px 26px rgba(16, 24, 40, 0.09)",
                              borderColor: color,
                            },
                          }}
                        >
                          <Box sx={{ height: 6, bgcolor: color }} />
                          <Box sx={{ p: 2.25 }}>
                            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <Typography sx={{ color: "text.secondary", fontWeight: 700, fontSize: 13, letterSpacing: 0.3 }}>
                                {status.label}
                              </Typography>
                              <OpenInNew sx={{ fontSize: 14, color: "text.disabled" }} />
                            </Box>
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
                  {filteredStatuses.length === 0 && (
                    <Grid item xs={12}>
                      <Typography color="text.secondary" sx={{ py: 4, textAlign: "center" }}>
                        No status matching "{searchTerm}"
                      </Typography>
                    </Grid>
                  )}
                </Grid>
              )}

              {/* TAB 1: STATS BY BRAND */}
              {activeTab === 1 && (
                <Grid container spacing={2}>
                  {filteredBrands.map((b) => {
                    const isUnbranded = b.brand === "Unbranded";
                    return (
                      <Grid item xs={12} sm={6} md={4} lg={3} key={b.brand}>
                        <Box
                          onClick={() => openLeads({ brandSearch: isUnbranded ? "" : b.brand })}
                          sx={{
                            height: "100%",
                            bgcolor: "#fff",
                            borderRadius: 3,
                            overflow: "hidden",
                            cursor: "pointer",
                            border: "1px solid",
                            borderColor: isUnbranded ? "rgba(245, 158, 11, 0.3)" : "rgba(0,0,0,0.06)",
                            boxShadow: "0 1px 3px rgba(16, 24, 40, 0.04)",
                            transition: "all 180ms ease",
                            "&:hover": {
                              transform: "translateY(-4px)",
                              boxShadow: "0 12px 26px rgba(124, 58, 237, 0.12)",
                              borderColor: "#7c3aed",
                            },
                          }}
                        >
                          <Box sx={{ height: 5, bgcolor: isUnbranded ? "#f59e0b" : "#7c3aed" }} />
                          <Box sx={{ p: 2.25 }}>
                            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 1 }}>
                              <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
                                <Avatar
                                  sx={{
                                    width: 32,
                                    height: 32,
                                    bgcolor: isUnbranded ? "#fef3c7" : "#ede9fe",
                                    color: isUnbranded ? "#b45309" : "#7c3aed",
                                    fontWeight: 800,
                                    fontSize: "0.75rem",
                                  }}
                                >
                                  {getInitials(b.brand)}
                                </Avatar>
                                <Typography
                                  sx={{
                                    fontWeight: 700,
                                    fontSize: 14,
                                    color: "#111827",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                  title={b.brand}
                                >
                                  {b.brand}
                                </Typography>
                              </Box>
                              <OpenInNew sx={{ fontSize: 14, color: "text.disabled", flexShrink: 0 }} />
                            </Box>

                            <Typography sx={{ fontSize: 32, fontWeight: 800, lineHeight: 1.15, mt: 1.25, color: "#111827" }}>
                              {formatCount(b.count)}
                            </Typography>

                            <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, mt: 1.5 }}>
                              <LinearProgress
                                variant="determinate"
                                value={Math.min(100, b.percentage)}
                                sx={{
                                  flex: 1,
                                  height: 7,
                                  borderRadius: 99,
                                  bgcolor: "rgba(0,0,0,0.06)",
                                  "& .MuiLinearProgress-bar": {
                                    bgcolor: isUnbranded ? "#f59e0b" : "#7c3aed",
                                    borderRadius: 99,
                                  },
                                }}
                              />
                              <Typography
                                sx={{
                                  minWidth: 42,
                                  textAlign: "right",
                                  fontWeight: 700,
                                  fontSize: 12,
                                  color: isUnbranded ? "#b45309" : "#7c3aed",
                                }}
                              >
                                {b.percentage}%
                              </Typography>
                            </Box>

                            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mt: 1.5, pt: 1, borderTop: "1px dashed rgba(0,0,0,0.06)" }}>
                              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                                Click to view leads
                              </Typography>
                              {!isUnbranded && filters.brand !== b.brand && (
                                <Button
                                  size="small"
                                  variant="text"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleFilterChange("brand", b.brand);
                                  }}
                                  sx={{ fontSize: "0.7rem", py: 0, px: 0.5, textTransform: "none", fontWeight: 700 }}
                                >
                                  Filter by brand
                                </Button>
                              )}
                            </Box>
                          </Box>
                        </Box>
                      </Grid>
                    );
                  })}
                  {filteredBrands.length === 0 && (
                    <Grid item xs={12}>
                      <Typography color="text.secondary" sx={{ py: 6, textAlign: "center" }}>
                        No brands found matching current filters.
                      </Typography>
                    </Grid>
                  )}
                </Grid>
              )}

              {/* TAB 2: STATS BY AGENT */}
              {activeTab === 2 && (
                <Grid container spacing={2}>
                  {filteredAgents.map((a) => {
                    const isUnassigned = a.agentId === "unassigned";
                    return (
                      <Grid item xs={12} sm={6} md={4} lg={3} key={a.agentId}>
                        <Box
                          onClick={() => openLeads({ agent: a.agentId })}
                          sx={{
                            height: "100%",
                            bgcolor: isUnassigned ? "#fffbeb" : "#fff",
                            borderRadius: 3,
                            overflow: "hidden",
                            cursor: "pointer",
                            border: "1px solid",
                            borderColor: isUnassigned ? "#fde68a" : "rgba(0,0,0,0.06)",
                            boxShadow: "0 1px 3px rgba(16, 24, 40, 0.04)",
                            transition: "all 180ms ease",
                            "&:hover": {
                              transform: "translateY(-4px)",
                              boxShadow: "0 12px 26px rgba(16, 185, 129, 0.12)",
                              borderColor: isUnassigned ? "#f59e0b" : "#10b981",
                            },
                          }}
                        >
                          <Box sx={{ height: 5, bgcolor: isUnassigned ? "#f59e0b" : "#10b981" }} />
                          <Box sx={{ p: 2.25 }}>
                            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 1 }}>
                              <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
                                <Avatar
                                  sx={{
                                    width: 34,
                                    height: 34,
                                    bgcolor: isUnassigned ? "#f59e0b" : "#10b981",
                                    color: "#fff",
                                    fontWeight: 800,
                                    fontSize: "0.75rem",
                                  }}
                                >
                                  {isUnassigned ? "?" : getInitials(a.name)}
                                </Avatar>
                                <Box sx={{ minWidth: 0 }}>
                                  <Typography
                                    sx={{
                                      fontWeight: 700,
                                      fontSize: 14,
                                      color: "#111827",
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                    }}
                                    title={a.name}
                                  >
                                    {a.name}
                                  </Typography>
                                  {a.role && (
                                    <Chip
                                      size="small"
                                      label={a.role}
                                      sx={{ height: 16, fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase" }}
                                    />
                                  )}
                                </Box>
                              </Box>
                              <OpenInNew sx={{ fontSize: 14, color: "text.disabled", flexShrink: 0 }} />
                            </Box>

                            <Typography sx={{ fontSize: 32, fontWeight: 800, lineHeight: 1.15, mt: 1.25, color: "#111827" }}>
                              {formatCount(a.count)}
                            </Typography>

                            <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, mt: 1.5 }}>
                              <LinearProgress
                                variant="determinate"
                                value={Math.min(100, a.percentage)}
                                sx={{
                                  flex: 1,
                                  height: 7,
                                  borderRadius: 99,
                                  bgcolor: "rgba(0,0,0,0.06)",
                                  "& .MuiLinearProgress-bar": {
                                    bgcolor: isUnassigned ? "#f59e0b" : "#10b981",
                                    borderRadius: 99,
                                  },
                                }}
                              />
                              <Typography
                                sx={{
                                  minWidth: 42,
                                  textAlign: "right",
                                  fontWeight: 700,
                                  fontSize: 12,
                                  color: isUnassigned ? "#b45309" : "#059669",
                                }}
                              >
                                {a.percentage}%
                              </Typography>
                            </Box>

                            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mt: 1.5, pt: 1, borderTop: "1px dashed rgba(0,0,0,0.06)" }}>
                              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                                Click to view leads
                              </Typography>
                              {filters.agent !== a.agentId && (
                                <Button
                                  size="small"
                                  variant="text"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleFilterChange("agent", a.agentId);
                                  }}
                                  sx={{ fontSize: "0.7rem", py: 0, px: 0.5, textTransform: "none", fontWeight: 700 }}
                                >
                                  Filter by agent
                                </Button>
                              )}
                            </Box>
                          </Box>
                        </Box>
                      </Grid>
                    );
                  })}
                  {filteredAgents.length === 0 && (
                    <Grid item xs={12}>
                      <Typography color="text.secondary" sx={{ py: 6, textAlign: "center" }}>
                        No agents found matching current filters.
                      </Typography>
                    </Grid>
                  )}
                </Grid>
              )}

              {/* TAB 3: STATS BY COUNTRY */}
              {activeTab === 3 && (
                <Grid container spacing={2}>
                  {filteredCountries.map((c) => {
                    const isUnknown = c.country.includes("Unknown");
                    return (
                      <Grid item xs={12} sm={6} md={4} lg={3} key={c.country}>
                        <Box
                          onClick={() => openLeads({ countrySearch: isUnknown ? "" : c.country })}
                          sx={{
                            height: "100%",
                            bgcolor: "#fff",
                            borderRadius: 3,
                            overflow: "hidden",
                            cursor: "pointer",
                            border: "1px solid",
                            borderColor: "rgba(0,0,0,0.06)",
                            boxShadow: "0 1px 3px rgba(16, 24, 40, 0.04)",
                            transition: "all 180ms ease",
                            "&:hover": {
                              transform: "translateY(-4px)",
                              boxShadow: "0 12px 26px rgba(245, 158, 11, 0.12)",
                              borderColor: "#f59e0b",
                            },
                          }}
                        >
                          <Box sx={{ height: 5, bgcolor: isUnknown ? "#9ca3af" : "#f59e0b" }} />
                          <Box sx={{ p: 2.25 }}>
                            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 1 }}>
                              <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
                                <Box
                                  sx={{
                                    width: 32,
                                    height: 32,
                                    borderRadius: "50%",
                                    bgcolor: "rgba(245, 158, 11, 0.1)",
                                    color: "#f59e0b",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    flexShrink: 0,
                                  }}
                                >
                                  <LocationOn sx={{ fontSize: 18 }} />
                                </Box>
                                <Typography
                                  sx={{
                                    fontWeight: 700,
                                    fontSize: 14,
                                    color: "#111827",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                  title={c.country}
                                >
                                  {c.country}
                                </Typography>
                              </Box>
                              <OpenInNew sx={{ fontSize: 14, color: "text.disabled", flexShrink: 0 }} />
                            </Box>

                            <Typography sx={{ fontSize: 32, fontWeight: 800, lineHeight: 1.15, mt: 1.25, color: "#111827" }}>
                              {formatCount(c.count)}
                            </Typography>

                            <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, mt: 1.5 }}>
                              <LinearProgress
                                variant="determinate"
                                value={Math.min(100, c.percentage)}
                                sx={{
                                  flex: 1,
                                  height: 7,
                                  borderRadius: 99,
                                  bgcolor: "rgba(0,0,0,0.06)",
                                  "& .MuiLinearProgress-bar": {
                                    bgcolor: isUnknown ? "#9ca3af" : "#f59e0b",
                                    borderRadius: 99,
                                  },
                                }}
                              />
                              <Typography
                                sx={{
                                  minWidth: 42,
                                  textAlign: "right",
                                  fontWeight: 700,
                                  fontSize: 12,
                                  color: isUnknown ? "#6b7280" : "#d97706",
                                }}
                              >
                                {c.percentage}%
                              </Typography>
                            </Box>

                            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mt: 1.5, pt: 1, borderTop: "1px dashed rgba(0,0,0,0.06)" }}>
                              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                                Click to view leads
                              </Typography>
                              {!isUnknown && filters.country !== c.country && (
                                <Button
                                  size="small"
                                  variant="text"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleFilterChange("country", c.country);
                                  }}
                                  sx={{ fontSize: "0.7rem", py: 0, px: 0.5, textTransform: "none", fontWeight: 700 }}
                                >
                                  Filter by country
                                </Button>
                              )}
                            </Box>
                          </Box>
                        </Box>
                      </Grid>
                    );
                  })}
                  {filteredCountries.length === 0 && (
                    <Grid item xs={12}>
                      <Typography color="text.secondary" sx={{ py: 6, textAlign: "center" }}>
                        No countries found matching current filters.
                      </Typography>
                    </Grid>
                  )}
                </Grid>
              )}

              {/* TAB 4: STATS BY SOURCE */}
              {activeTab === 4 && (
                <Grid container spacing={2}>
                  {filteredSources.map((s) => (
                    <Grid item xs={12} sm={6} md={4} lg={3} key={s.source}>
                      <Box
                        onClick={() => openLeads({ source: s.source })}
                        sx={{
                          height: "100%",
                          bgcolor: "#fff",
                          borderRadius: 3,
                          overflow: "hidden",
                          cursor: "pointer",
                          border: "1px solid",
                          borderColor: "rgba(0,0,0,0.06)",
                          boxShadow: "0 1px 3px rgba(16, 24, 40, 0.04)",
                          transition: "all 180ms ease",
                          "&:hover": {
                            transform: "translateY(-4px)",
                            boxShadow: "0 12px 26px rgba(2, 132, 199, 0.12)",
                            borderColor: "#0284c7",
                          },
                        }}
                      >
                        <Box sx={{ height: 5, bgcolor: "#0284c7" }} />
                        <Box sx={{ p: 2.25 }}>
                          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 1 }}>
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
                              <Avatar
                                sx={{
                                  width: 32,
                                  height: 32,
                                  bgcolor: "#e0f2fe",
                                  color: "#0284c7",
                                  fontWeight: 800,
                                  fontSize: "0.75rem",
                                }}
                              >
                                {getInitials(s.source)}
                              </Avatar>
                              <Typography
                                sx={{
                                  fontWeight: 700,
                                  fontSize: 14,
                                  color: "#111827",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                                title={s.source}
                              >
                                {s.source}
                              </Typography>
                            </Box>
                            <OpenInNew sx={{ fontSize: 14, color: "text.disabled" }} />
                          </Box>

                          <Typography sx={{ fontSize: 32, fontWeight: 800, lineHeight: 1.15, mt: 1.25, color: "#111827" }}>
                            {formatCount(s.count)}
                          </Typography>

                          <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, mt: 1.5 }}>
                            <LinearProgress
                              variant="determinate"
                              value={Math.min(100, s.percentage)}
                              sx={{
                                flex: 1,
                                height: 7,
                                borderRadius: 99,
                                bgcolor: "rgba(0,0,0,0.06)",
                                "& .MuiLinearProgress-bar": { bgcolor: "#0284c7", borderRadius: 99 },
                              }}
                            />
                            <Typography sx={{ minWidth: 42, textAlign: "right", fontWeight: 700, fontSize: 12, color: "#0284c7" }}>
                              {s.percentage}%
                            </Typography>
                          </Box>
                        </Box>
                      </Box>
                    </Grid>
                  ))}
                  {filteredSources.length === 0 && (
                    <Grid item xs={12}>
                      <Typography color="text.secondary" sx={{ py: 6, textAlign: "center" }}>
                        No sources found matching current filters.
                      </Typography>
                    </Grid>
                  )}
                </Grid>
              )}

              {/* Zero Results State */}
              {total === 0 && (
                <Box
                  sx={{
                    textAlign: "center",
                    py: 8,
                    px: 3,
                    bgcolor: "#fff",
                    borderRadius: 3,
                    border: "1px dashed rgba(0,0,0,0.15)",
                  }}
                >
                  <TrendingUp sx={{ fontSize: 48, color: "text.secondary", mb: 1, opacity: 0.5 }} />
                  <Typography variant="h6" fontWeight={700} color="text.primary">
                    No leads found matching current filters
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
                    Try selecting a different list, clearing active filters, or checking your permissions.
                  </Typography>
                  {activeFilterCount > 0 && (
                    <Button variant="contained" color="primary" onClick={handleClearAllFilters}>
                      Clear Active Filters
                    </Button>
                  )}
                </Box>
              )}
            </>
          )}
        </Box>
      </Box>
    </Box>
  );
};

export default LeadListStatistics;
