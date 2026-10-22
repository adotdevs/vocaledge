import { useEffect, useState } from "react";
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from "@mui/material";
import { toast } from "react-toastify";
import { deleteLeadUploadApi, getLeadUploadsApi } from "../../../../Api/Service";

const when = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const LeadUploadHistory = ({ open, onClose, onDeleted }) => {
  const [uploads, setUploads] = useState([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const response = await getLeadUploadsApi();
      if (!response?.success) {
        toast.error(response?.msg || "Could not load upload history");
        setUploads([]);
        return;
      }
      setUploads(response.uploads || []);
    } catch (error) {
      toast.error("Could not load upload history");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) load();
  }, [open]);

  const remove = async (upload) => {
    const count = upload.leadCount || 0;
    const name = upload.fileName || "this upload";
    const confirmed = window.confirm(`Delete ${count} lead${count === 1 ? "" : "s"} from "${name}"?`);
    if (!confirmed) return;
    setDeletingId(String(upload._id));
    const response = await deleteLeadUploadApi(upload._id);
    setDeletingId("");
    if (!response?.success) {
      toast.error(response?.msg || "Could not delete this upload");
      return;
    }
    toast.success(response.deleted ? `Deleted ${response.deleted} leads` : "This upload was already removed");
    await load();
    if (onDeleted) onDeleted();
  };

  const latest = uploads.find((item) => !item.deletedAt);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>CSV upload history</DialogTitle>
      <DialogContent>
        {latest && (
          <Box sx={{ mb: 2 }}>
            <Button
              variant="contained"
              color="error"
              disabled={Boolean(deletingId)}
              onClick={() => remove(latest)}
            >
              Delete last upload
            </Button>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {latest.fileName} · {latest.leadCount || 0} leads · {when(latest.createdAt)}
            </Typography>
          </Box>
        )}
        {loading && <CircularProgress size={22} />}
        {!loading && uploads.length === 0 && (
          <Typography color="text.secondary">
            No CSV uploads yet. Uploads made from now on are listed here.
          </Typography>
        )}
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
          {uploads.map((upload) => (
            <Box
              key={upload._id}
              sx={{
                display: "flex",
                justifyContent: "space-between",
                gap: 2,
                alignItems: "center",
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 2,
                p: 1.5,
              }}
            >
              <Box>
                <Typography fontWeight={700}>{upload.fileName || "upload.csv"}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {upload.leadCount || 0} leads
                  {upload.skippedCount ? ` · ${upload.skippedCount} skipped` : ""}
                  {upload.uploadedByName ? ` · ${upload.uploadedByName}` : ""}
                  {upload.createdAt ? ` · ${when(upload.createdAt)}` : ""}
                </Typography>
                {upload.deletedAt && (
                  <Typography variant="body2" color="error">
                    Deleted {when(upload.deletedAt)}
                    {upload.deletedCount ? ` · ${upload.deletedCount} leads` : ""}
                  </Typography>
                )}
              </Box>
              {!upload.deletedAt && (
                <Button
                  color="error"
                  size="small"
                  disabled={deletingId === String(upload._id)}
                  onClick={() => remove(upload)}
                >
                  Delete
                </Button>
              )}
            </Box>
          ))}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default LeadUploadHistory;
