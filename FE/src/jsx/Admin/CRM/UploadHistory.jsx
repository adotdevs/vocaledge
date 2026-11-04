import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
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
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Pagination,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Toolbar,
  Typography,
} from "@mui/material";
import { ArrowBack, DeleteOutline, History, Menu as MenuIcon, OpenInNew } from "@mui/icons-material";
import { toast } from "react-toastify";
import Sidebar from "./Sidebar.js";
import CrmAppBarActions from "./components/CrmAppBarActions";
import {
  acceptLeadUploadDuplicatesApi,
  declineLeadUploadDuplicatesApi,
  deleteLeadUploadApi,
  getLeadUploadApi,
  getLeadUploadsApi,
} from "../../../Api/Service";

const when = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const text = (value) => {
  const shown = String(value || "").trim();
  return shown || "—";
};

const personName = (row) => `${row?.firstName || ""} ${row?.lastName || ""}`.trim();

const PageBar = ({ count, page, total = 0, pageSize = 10, shown = 0, onChange }) => {
  if (!total) return null;
  const from = shown ? (page - 1) * pageSize + 1 : 0;
  const to = shown ? Math.min((page - 1) * pageSize + shown, total) : 0;
  return (
    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, py: 1, flexWrap: "wrap" }}>
      <Typography variant="body2" color="text.secondary">
        {from ? `${from.toLocaleString()}–${to.toLocaleString()} of ${total.toLocaleString()}` : `0 of ${total.toLocaleString()}`}
      </Typography>
      {count > 1 && (
        <Pagination count={count} page={page} onChange={(_, next) => onChange(next)} color="primary" shape="rounded" />
      )}
    </Box>
  );
};

const compareRows = (row) => {
  const existing = row.existing;
  const pairs = [
    ["Name", personName(row), existing ? personName(existing) : ""],
    ["Email", row.email, existing?.email],
    ["Phone", row.phone, existing?.phone],
    ["Country", row.country, existing?.country],
    ["Brand", row.Brand, existing?.Brand],
    ["Status", row.status, existing?.status],
    ["File name", row.fileName, existing?.fileName],
    ["Address", row.Address, existing?.Address],
  ];
  return pairs.filter(([label, incoming, stored]) => {
    if (["Name", "Email", "Phone"].includes(label)) return true;
    return String(incoming || "").trim() || String(stored || "").trim();
  });
};

const isMatchedDuplicate = (label, incoming, stored) => {
  if (!["Name", "Email", "Phone"].includes(label)) return false;
  const left = String(incoming || "").trim().toLowerCase().replace(/\s+/g, " ");
  const right = String(stored || "").trim().toLowerCase().replace(/\s+/g, " ");
  return Boolean(left) && left === right;
};

const Stat = ({ label, value, tone }) => (
  <Card elevation={0} sx={{ border: 1, borderColor: "divider", borderRadius: 2, flex: "1 1 140px" }}>
    <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="h5" fontWeight={800} color={tone || "text.primary"}>{value}</Typography>
    </CardContent>
  </Card>
);

const UploadHistory = () => {
  const authUser = useAuthUser();
  const navigate = useNavigate();
  const { uploadId } = useParams();
  const user = authUser?.();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenu, setisMobileMenu] = useState(false);

  const [uploads, setUploads] = useState([]);
  const [listPage, setListPage] = useState(1);
  const [listPages, setListPages] = useState(1);
  const [listTotal, setListTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [listLoading, setListLoading] = useState(false);

  const [detail, setDetail] = useState(null);
  const [duplicates, setDuplicates] = useState({ rows: [], page: 1, pages: 1, total: 0, pending: 0, accepted: 0, declined: 0 });
  const [added, setAdded] = useState({ rows: [], page: 1, pages: 1, total: 0 });
  const [tab, setTab] = useState("pending");
  const [duplicatePage, setDuplicatePage] = useState(1);
  const [duplicatePageSize, setDuplicatePageSize] = useState(10);
  const [duplicateSort, setDuplicateSort] = useState("name");
  const [leadPage, setLeadPage] = useState(1);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selected, setSelected] = useState([]);
  const [accepting, setAccepting] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [confirmAccept, setConfirmAccept] = useState(null);
  const [confirmDeclineAll, setConfirmDeclineAll] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const role = user?.user?.role;
  useEffect(() => {
    if (role && role !== "superadmin") navigate("/admin/dashboard/crm");
  }, [navigate, role]);

  const loadList = async (page = listPage, fileSearch = appliedSearch) => {
    setListLoading(true);
    const response = await getLeadUploadsApi({ page, limit: 20, search: fileSearch });
    setListLoading(false);
    if (!response?.success) {
      toast.error(response?.msg || "Could not load upload history");
      setUploads([]);
      return;
    }
    setUploads(response.uploads || []);
    setListPage(response.pagination?.page || page);
    setListPages(response.pagination?.pages || 1);
    setListTotal(response.pagination?.total || 0);
  };

  const loadDetail = async (page = duplicatePage, addedPage = leadPage, status = tab, sort = duplicateSort, limit = duplicatePageSize) => {
    if (!uploadId) return;
    setDetailLoading(true);
    const response = await getLeadUploadApi(uploadId, {
      duplicatePage: page,
      duplicateLimit: limit,
      duplicateStatus: status === "added" ? "pending" : status,
      duplicateSort: sort,
      leadPage: addedPage,
      leadLimit: 25,
    });
    setDetailLoading(false);
    if (!response?.success) {
      toast.error(response?.msg || "Could not load this upload");
      setDetail(null);
      return;
    }
    setDetail(response.upload);
    setDuplicates(response.duplicates || { rows: [], page: 1, pages: 1, total: 0, pending: 0, accepted: 0 });
    setAdded(response.leads || { rows: [], page: 1, pages: 1, total: 0 });
    setSelected([]);
  };

  useEffect(() => {
    if (!uploadId) loadList(1, appliedSearch);
  }, [uploadId, appliedSearch]);

  useEffect(() => {
    if (uploadId) loadDetail(duplicatePage, leadPage, tab, duplicateSort, duplicatePageSize);
  }, [uploadId, duplicatePage, leadPage, tab, duplicateSort, duplicatePageSize]);

  const askAccept = (keys, all = false) => {
    if (detail?.deletedAt) return;
    if (!all && !keys.length) return;
    setConfirmAccept({
      all,
      keys,
      count: all ? (duplicates.pending || keys.length) : keys.length,
    });
  };

  const accept = async () => {
    const plan = confirmAccept;
    setConfirmAccept(null);
    if (!plan) return;
    setAccepting(true);
    const response = await acceptLeadUploadDuplicatesApi(
      uploadId,
      plan.all ? { all: true } : { keys: plan.keys }
    );
    setAccepting(false);
    if (!response?.success) {
      toast.error(response?.msg || "Could not accept these duplicates");
      return;
    }
    toast.success(response.msg || "Leads added");
    forgetRows({
      kind: "accept",
      keys: response.keys || plan.keys || [],
      all: Boolean(response.all),
      count: response.accepted || (plan.keys || []).length,
      fromDeclined: tab === "declined",
    });
  };

  const decline = async (body) => {
    setDeclining(true);
    const response = await declineLeadUploadDuplicatesApi(uploadId, body);
    setDeclining(false);
    setConfirmDeclineAll(false);
    if (!response?.success) {
      toast.error(response?.msg || "Could not decline these duplicates");
      return;
    }
    toast.success(response.msg || "Declined");
    forgetRows({
      kind: "decline",
      keys: response.keys || body.keys || [],
      all: Boolean(response.all || body.all),
      count: response.declined || (body.keys || []).length,
    });
  };

  const forgetRows = ({ kind, keys = [], all = false, count = 0, fromDeclined = false }) => {
    const drop = new Set(keys.map(String));
    setDuplicates((current) => {
      const rows = all ? [] : (current.rows || []).filter((row) => !drop.has(String(row.key)));
      const next = { ...current, rows };
      if (kind === "decline") {
        next.pending = Math.max(0, (current.pending || 0) - count);
        next.declined = (current.declined || 0) + count;
      } else if (fromDeclined) {
        next.declined = Math.max(0, (current.declined || 0) - count);
        next.accepted = (current.accepted || 0) + count;
      } else {
        next.pending = Math.max(0, (current.pending || 0) - count);
        next.accepted = (current.accepted || 0) + count;
      }
      next.total = all ? 0 : Math.max(0, (current.total || 0) - count);
      next.pages = Math.max(1, Math.ceil((next.total || 0) / duplicatePageSize));
      return next;
    });
    if (kind === "accept") {
      setAdded((current) => ({ ...current, total: (current.total || 0) + count }));
      setDetail((current) => current ? {
        ...current,
        leadCount: (current.leadCount || 0) + count,
        acceptedCount: (current.acceptedCount || 0) + count,
      } : current);
    }
    setSelected((current) => (all ? [] : current.filter((key) => !drop.has(String(key)))));
  };

  const removeUpload = async () => {
    const target = confirmDelete;
    setConfirmDelete(null);
    if (!target) return;
    setDeleting(true);
    const response = await deleteLeadUploadApi(target._id);
    setDeleting(false);
    if (!response?.success) {
      toast.error(response?.msg || "Could not delete this upload");
      return;
    }
    toast.success(response.deleted ? `Permanently deleted ${response.deleted} leads. They are not in the recycle bin.` : "This upload was already deleted");
    if (uploadId) navigate("/admin/crm/upload-history");
    else loadList(listPage, appliedSearch);
  };

  const pageKeys = (duplicates.rows || []).filter((row) => !row.acceptedLeadId && !row.declinedAt).map((row) => String(row.key));
  const selectedOnPage = pageKeys.filter((key) => selected.includes(key));
  const allPageSelected = pageKeys.length > 0 && selectedOnPage.length === pageKeys.length;
  const somePageSelected = selectedOnPage.length > 0 && !allPageSelected;

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
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
              <IconButton onClick={() => setisMobileMenu(!isMobileMenu)} size="small" sx={{ display: { xs: "inline-flex", md: "none" } }}>
                <MenuIcon />
              </IconButton>
              {uploadId && (
                <IconButton onClick={() => navigate("/admin/crm/upload-history")} size="small">
                  <ArrowBack />
                </IconButton>
              )}
              <History color="primary" />
              <Box>
                <Typography variant="h5" fontWeight={800} color="text.primary">Upload history</Typography>
                <Typography variant="body2" color="text.secondary">
                  {uploadId ? (detail?.fileName || "Upload") : "Every CSV upload, the leads it added, and the duplicates held back"}
                </Typography>
              </Box>
            </Box>
            <CrmAppBarActions />
          </Toolbar>
        </AppBar>

        <Box sx={{ px: { xs: 2, sm: 3 }, pb: { xs: 2, sm: 3 }, pt: 0, flex: 1, minHeight: 0, overflowY: "auto" }}>
          {!uploadId && (
            <>
              <Card elevation={0} sx={{ mb: 2, borderRadius: 3, border: 1, borderColor: "divider" }}>
                <CardContent sx={{ display: "flex", gap: 1.5, alignItems: "center", flexWrap: "wrap" }}>
                  <TextField
                    size="small"
                    placeholder="Search by file name"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") setAppliedSearch(search.trim());
                    }}
                    sx={{ minWidth: { xs: "100%", sm: 280 } }}
                  />
                  <Button variant="contained" onClick={() => setAppliedSearch(search.trim())}>Search</Button>
                  {appliedSearch && (
                    <Button onClick={() => { setSearch(""); setAppliedSearch(""); }}>Clear</Button>
                  )}
                </CardContent>
              </Card>

              <PageBar count={listPages} page={listPage} total={listTotal} pageSize={20} shown={uploads.length} onChange={(page) => loadList(page, appliedSearch)} />
              <Card elevation={0} sx={{ borderRadius: 3, border: 1, borderColor: "divider" }}>
                {listLoading && <Box sx={{ p: 4, textAlign: "center" }}><CircularProgress size={28} /></Box>}
                {!listLoading && uploads.length === 0 && (
                  <Box sx={{ p: 4 }}>
                    <Typography color="text.secondary">No CSV uploads yet.</Typography>
                  </Box>
                )}
                {!listLoading && uploads.length > 0 && (
                  <TableContainer>
                    <Table>
                      <TableHead>
                        <TableRow>
                          <TableCell>File</TableCell>
                          <TableCell>Uploaded</TableCell>
                          <TableCell>Added</TableCell>
                          <TableCell>Duplicates</TableCell>
                          <TableCell>Accepted</TableCell>
                          <TableCell>Status</TableCell>
                          <TableCell align="right">Actions</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {uploads.map((upload) => (
                          <TableRow
                            key={upload._id}
                            hover={!upload.deletedAt}
                            sx={{ cursor: upload.deletedAt ? "default" : "pointer" }}
                            onClick={() => {
                              if (!upload.deletedAt) navigate(`/admin/crm/upload-history/${upload._id}`);
                            }}
                          >
                            <TableCell>
                              <Typography fontWeight={700}>{upload.fileName || "upload.csv"}</Typography>
                              <Typography variant="caption" color="text.secondary">
                                {upload.uploadedByName || "Unknown"}{upload.uploadedByRole ? ` · ${upload.uploadedByRole}` : ""}
                              </Typography>
                            </TableCell>
                            <TableCell>{when(upload.createdAt)}</TableCell>
                            <TableCell>{upload.leadCount || 0}</TableCell>
                            <TableCell>{upload.duplicateCount ?? upload.skippedCount ?? 0}</TableCell>
                            <TableCell>{upload.acceptedCount || 0}</TableCell>
                            <TableCell>
                              {upload.deletedAt ? (
                                <Chip size="small" color="error" label={`Removed ${when(upload.deletedAt)}`} />
                              ) : (
                                <Chip size="small" color="success" variant="outlined" label="Active" />
                              )}
                            </TableCell>
                            <TableCell align="right">
                              <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1, flexWrap: "wrap" }}>
                                {!upload.deletedAt && (
                                <Button
                                  variant="contained"
                                  size="small"
                                  startIcon={<History />}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    navigate(`/admin/crm/upload-history/${upload._id}`);
                                  }}
                                >
                                  View history
                                </Button>
                                )}
                                {!upload.deletedAt && (
                                  <Button
                                    color="error"
                                    size="small"
                                    startIcon={<DeleteOutline />}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setConfirmDelete(upload);
                                    }}
                                  >
                                    Delete permanently
                                  </Button>
                                )}
                              </Box>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </Card>
              <PageBar count={listPages} page={listPage} total={listTotal} pageSize={20} shown={uploads.length} onChange={(page) => loadList(page, appliedSearch)} />
            </>
          )}

          {uploadId && detailLoading && !detail && (
            <Box sx={{ p: 6, textAlign: "center" }}><CircularProgress /></Box>
          )}
          {uploadId && !detailLoading && !detail && (
            <Typography color="text.secondary">This upload could not be opened.</Typography>
          )}

          {uploadId && detail && (
            <>
              <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", mb: 2 }}>
                <Stat label="Uploaded leads" value={added.total ?? detail.leadCount ?? 0} />
                <Stat label="Duplicates" value={detail.duplicateCount ?? detail.skippedCount ?? 0} tone="warning.main" />
                <Stat label="Still to sort" value={duplicates.pending || 0} />
                <Stat label="Declined" value={duplicates.declined || 0} />
                <Stat label="Added anyway" value={duplicates.accepted || detail.acceptedCount || 0} tone="success.main" />
              </Box>

              <Card elevation={0} sx={{ mb: 2, borderRadius: 3, border: 1, borderColor: "divider" }}>
                <CardContent sx={{ display: "flex", justifyContent: "space-between", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
                  <Box>
                    <Typography fontWeight={800}>{detail.fileName || "upload.csv"}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {detail.uploadedByName || "Unknown"} · {when(detail.createdAt)}
                      {detail.deletedAt ? ` · Removed ${when(detail.deletedAt)}` : ""}
                    </Typography>
                  </Box>
                  {!detail.deletedAt && (
                    <Button color="error" variant="outlined" startIcon={<DeleteOutline />} onClick={() => setConfirmDelete(detail)}>
                      Delete permanently
                    </Button>
                  )}
                </CardContent>
              </Card>

              <Card elevation={0} sx={{ borderRadius: 3, border: 1, borderColor: "divider", overflow: "visible" }}>
                <Tabs
                  value={tab}
                  onChange={(_, value) => {
                    setTab(value);
                    setDuplicatePage(1);
                    setLeadPage(1);
                  }}
                  sx={{ px: 2, borderBottom: 1, borderColor: "divider" }}
                >
                  <Tab value="pending" label={`To sort (${duplicates.pending || 0})`} />
                  <Tab value="declined" label={`Declined (${duplicates.declined || 0})`} />
                  <Tab value="accepted" label={`Added anyway (${duplicates.accepted || 0})`} />
                  <Tab value="added" label={`Uploaded leads (${added.total || 0})`} />
                </Tabs>

                {detailLoading && <Box sx={{ p: 3 }}><CircularProgress size={22} /></Box>}

                {!detailLoading && tab !== "added" && (
                  <Box sx={{ px: { xs: 1.5, sm: 2 }, pb: { xs: 1.5, sm: 2 }, pt: 0 }}>
                    <Box
                      sx={{
                        position: "sticky",
                        top: 0,
                        zIndex: 30,
                        mb: 1.5,
                        mt: 0,
                        px: 1.5,
                        py: 1.25,
                        border: "1px solid",
                        borderColor: "divider",
                        borderRadius: "10px",
                        bgcolor: "background.paper",
                        boxShadow: "0 6px 16px rgba(0,0,0,0.08)",
                      }}
                    >
                      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, minHeight: 40 }}>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                          {tab === "pending" && pageKeys.length > 0 && !detail.deletedAt && (
                            <Box sx={{ display: "flex", alignItems: "center", height: 40 }}>
                              <Checkbox
                                size="small"
                                checked={allPageSelected}
                                indeterminate={somePageSelected}
                                onChange={() => setSelected(allPageSelected ? selected.filter((key) => !pageKeys.includes(key)) : [...new Set([...selected, ...pageKeys])])}
                                sx={{ p: 0.5, mr: 0.5 }}
                              />
                              <Typography variant="body2" sx={{ whiteSpace: "nowrap" }}>Select this page</Typography>
                            </Box>
                          )}
                          <TextField
                            select
                            size="small"
                            label="Sort"
                            value={duplicateSort}
                            onChange={(event) => {
                              setDuplicateSort(event.target.value);
                              setDuplicatePage(1);
                            }}
                            sx={{ width: 140 }}
                          >
                            <MenuItem value="name">Name</MenuItem>
                            <MenuItem value="email">Email</MenuItem>
                            <MenuItem value="phone">Phone</MenuItem>
                          </TextField>
                        </Box>
                        {tab === "pending" && !detail.deletedAt && (
                          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                            <Button size="small" color="error" variant="outlined" disabled={!selected.length || declining} onClick={() => decline({ keys: selected })}>
                              Decline selected
                            </Button>
                            <Button size="small" variant="contained" disabled={!selected.length || accepting} onClick={() => askAccept(selected)}>
                              Add selected
                            </Button>
                            <Button size="small" color="error" variant="text" disabled={!duplicates.pending || declining} onClick={() => setConfirmDeclineAll(true)}>
                              Decline all
                            </Button>
                            <Button size="small" variant="text" disabled={!duplicates.pending || accepting} onClick={() => askAccept([], true)}>
                              Add all
                            </Button>
                          </Box>
                        )}
                      </Box>
                      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, mt: 1.25, minHeight: 40 }}>
                        <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
                          {(duplicates.rows || []).length
                            ? `${((duplicates.page || duplicatePage) - 1) * duplicatePageSize + 1}–${Math.min(((duplicates.page || duplicatePage) - 1) * duplicatePageSize + (duplicates.rows || []).length, duplicates.total || 0)} of ${(duplicates.total || 0).toLocaleString()}`
                            : `0 of ${(duplicates.total || 0).toLocaleString()}`}
                        </Typography>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                          <TextField
                            select
                            size="small"
                            label="Per page"
                            value={duplicatePageSize}
                            onChange={(event) => {
                              setDuplicatePageSize(Number(event.target.value));
                              setDuplicatePage(1);
                            }}
                            sx={{ width: 110 }}
                          >
                            {[10, 25, 50, 100].map((size) => (
                              <MenuItem key={size} value={size}>{size}</MenuItem>
                            ))}
                          </TextField>
                          {duplicates.pages > 1 && (
                            <Pagination count={duplicates.pages} page={duplicates.page || duplicatePage} onChange={(_, next) => setDuplicatePage(next)} color="primary" shape="rounded" />
                          )}
                        </Box>
                      </Box>
                    </Box>
                    {duplicates.rows.length === 0 && (
                      <Typography color="text.secondary" sx={{ py: 3 }}>
                        {(detail.duplicateCount || detail.skippedCount) && !duplicates.pending && !duplicates.accepted && !duplicates.declined
                          ? "This upload was saved before duplicate names were kept, so these people cannot be compared."
                          : tab === "accepted"
                            ? "No duplicates have been added as new leads."
                            : tab === "declined"
                              ? "No duplicates have been declined."
                              : "Nothing left to sort."}
                      </Typography>
                    )}
                    {duplicates.rows.map((row) => {
                      const pairs = compareRows(row);
                      const checked = selected.includes(String(row.key));
                      const canSort = tab === "pending" && !row.acceptedLeadId && !row.declinedAt && !detail.deletedAt;
                      return (
                        <Box key={row.key} sx={{ border: "1px solid", borderColor: "divider", borderRadius: "10px", mb: 2, overflow: "hidden", bgcolor: "background.paper" }}>
                          <Box sx={{ px: 1.5, py: 1, display: "flex", alignItems: "center", gap: 1, borderBottom: "1px solid", borderColor: "divider", flexWrap: "wrap", bgcolor: "action.hover" }}>
                            {canSort && (
                              <Checkbox
                                size="small"
                                checked={checked}
                                onChange={() => setSelected((current) => (
                                  current.includes(String(row.key))
                                    ? current.filter((key) => key !== String(row.key))
                                    : [...current, String(row.key)]
                                ))}
                              />
                            )}
                            <Typography fontWeight={800}>{personName(row) || "Unnamed"}</Typography>
                            {row.reason && <Chip size="small" label={row.reason} color="warning" />}
                            {row.declinedAt && <Chip size="small" label={`Declined ${when(row.declinedAt)}`} />}
                            {row.acceptedLeadId && <Chip size="small" color="success" label={`Added ${when(row.acceptedAt)}`} />}
                            <Box sx={{ flex: 1 }} />
                            {row.existing?._id && (
                              <Button size="small" endIcon={<OpenInNew />} onClick={() => navigate(`/admin/crm/lead/${row.existing._id}/stream`)}>
                                View saved lead
                              </Button>
                            )}
                            {row.acceptedLead?._id && (
                              <Button size="small" endIcon={<OpenInNew />} onClick={() => navigate(`/admin/crm/lead/${row.acceptedLead._id}/stream`)}>
                                View new lead
                              </Button>
                            )}
                            {canSort && (
                              <>
                                <Button size="small" color="error" variant="outlined" disabled={declining} onClick={() => decline({ keys: [String(row.key)] })}>
                                  Decline
                                </Button>
                                <Button size="small" variant="contained" disabled={accepting} onClick={() => askAccept([String(row.key)])}>
                                  Add lead
                                </Button>
                              </>
                            )}
                            {tab === "declined" && !detail.deletedAt && (
                              <Button size="small" variant="contained" disabled={accepting} onClick={() => askAccept([String(row.key)])}>
                                Add lead
                              </Button>
                            )}
                          </Box>
                          {!row.existing && (
                            <Typography variant="body2" color="text.secondary" sx={{ px: 2, pt: 1.25 }}>
                              The saved lead could not be loaded.
                            </Typography>
                          )}
                          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "120px 1fr 1fr" } }}>
                            <Box sx={{ display: { xs: "none", md: "block" }, px: 2, py: 0.85, borderBottom: "1px solid", borderColor: "divider" }} />
                            <Typography variant="caption" sx={{ px: 2, py: 0.85, fontWeight: 700, color: "text.secondary", borderBottom: "1px solid", borderColor: "divider" }}>
                              In the file
                            </Typography>
                            <Typography variant="caption" sx={{ px: 2, py: 0.85, fontWeight: 700, color: "text.secondary", borderBottom: "1px solid", borderLeft: { md: "1px solid" }, borderColor: "divider" }}>
                              Saved lead{row.existing?.createdAt ? ` · ${when(row.existing.createdAt)}` : ""}{row.existing?.isDeleted ? " · removed" : ""}
                            </Typography>
                            {pairs.map(([label, incoming, stored]) => {
                              const matched = isMatchedDuplicate(label, incoming, stored);
                              const base = {
                                px: 2,
                                py: 0.9,
                                borderTop: "1px solid",
                                borderColor: "divider",
                              };
                              const marked = matched ? { bgcolor: "rgba(251, 191, 36, 0.2)", fontWeight: 700 } : { fontWeight: 500 };
                              return (
                                <Box key={label} sx={{ display: "contents" }}>
                                  <Box sx={{ ...base, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
                                    <Typography variant="body2" color="text.secondary">{label}</Typography>
                                    {matched && (
                                      <Typography variant="caption" sx={{ fontWeight: 700, color: "#8a5a00", letterSpacing: "0.03em" }}>Same</Typography>
                                    )}
                                  </Box>
                                  <Typography variant="body2" sx={{ ...base, ...marked }}>{text(incoming)}</Typography>
                                  <Typography variant="body2" sx={{ ...base, ...marked, borderLeft: { md: "1px solid" }, borderColor: "divider" }}>{text(stored)}</Typography>
                                </Box>
                              );
                            })}
                          </Box>
                        </Box>
                      );
                    })}
                    <PageBar count={duplicates.pages} page={duplicates.page || duplicatePage} total={duplicates.total || 0} pageSize={duplicatePageSize} shown={(duplicates.rows || []).length} onChange={setDuplicatePage} />
                  </Box>
                )}

                {!detailLoading && tab === "added" && (
                  <Box sx={{ px: { xs: 1.5, sm: 2 } }}>
                    <PageBar count={added.pages} page={added.page || leadPage} total={added.total || 0} pageSize={25} shown={(added.rows || []).length} onChange={setLeadPage} />
                    {added.rows.length === 0 && (
                      <Typography color="text.secondary" sx={{ p: 3 }}>No leads from this upload are stored.</Typography>
                    )}
                    {added.rows.length > 0 && (
                      <TableContainer>
                        <Table>
                          <TableHead>
                            <TableRow>
                              <TableCell>Lead</TableCell>
                              <TableCell>Email</TableCell>
                              <TableCell>Phone</TableCell>
                              <TableCell>Status</TableCell>
                              <TableCell>Created</TableCell>
                              <TableCell />
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {added.rows.map((lead) => (
                              <TableRow key={lead._id} hover>
                                <TableCell>
                                  <Typography fontWeight={700}>{personName(lead) || "—"}</Typography>
                                  {lead.isDeleted && <Chip size="small" color="error" label="Removed" />}
                                </TableCell>
                                <TableCell>{text(lead.email)}</TableCell>
                                <TableCell>{text(lead.phone)}</TableCell>
                                <TableCell>{text(lead.status)}</TableCell>
                                <TableCell>{when(lead.createdAt)}</TableCell>
                                <TableCell align="right">
                                  {!lead.isDeleted && (
                                    <Button size="small" endIcon={<OpenInNew />} onClick={() => navigate(`/admin/crm/lead/${lead._id}/stream`)}>
                                      View lead
                                    </Button>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    )}
                    <PageBar count={added.pages} page={added.page || leadPage} total={added.total || 0} pageSize={25} shown={(added.rows || []).length} onChange={setLeadPage} />
                  </Box>
                )}
              </Card>
            </>
          )}
        </Box>
      </Box>

      <Dialog open={Boolean(confirmAccept)} onClose={() => setConfirmAccept(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Add {confirmAccept?.count === 1 ? "this lead" : "these leads"}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Create {confirmAccept?.count || 0} new lead{(confirmAccept?.count || 0) === 1 ? "" : "s"} from the file. The saved lead stays.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmAccept(null)}>Cancel</Button>
          <Button variant="contained" onClick={accept} disabled={accepting}>Add lead</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={confirmDeclineAll} onClose={() => setConfirmDeclineAll(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Decline all duplicates</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Decline {duplicates.pending || 0} duplicates still to sort. They will not be added. The saved leads stay.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDeclineAll(false)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={() => decline({ all: true })} disabled={declining}>Decline all</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(confirmDelete)} onClose={() => setConfirmDelete(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete uploaded leads</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Permanently delete every lead added by {confirmDelete?.fileName || "this file"}, including duplicates you added from it. They will not go to the recycle bin. Leads that were already saved before this upload are not deleted.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={removeUpload} disabled={deleting}>Delete permanently</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default UploadHistory;
