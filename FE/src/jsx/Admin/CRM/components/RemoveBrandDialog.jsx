import React, { useEffect, useRef, useState } from "react";
import {
    Box,
    Button,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    IconButton,
    Tooltip,
    Typography,
} from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { toast } from "react-toastify";
import { removeLeadBrandApi } from "../../../../Api/Service";

const leadsText = (count) => `${count.toLocaleString()} ${count === 1 ? "lead" : "leads"}`;

/**
 * renderOption for the Brand filter (MUI Autocomplete). Super admins get a small delete button on every brand;
 * clicking it asks to remove that brand (onRemove(brand)) without selecting the brand in the filter.
 */
export const brandOptionRenderer = (canRemove, onRemove) => (props, option) => {
    const { key, ...optionProps } = props;
    return (
        <li key={key} {...optionProps}>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, width: "100%" }}>
                <span>{option}</span>
                {canRemove && (
                    <Tooltip title="Remove this brand from all leads" placement="left">
                        <IconButton
                            size="small"
                            aria-label={`Remove brand ${option}`}
                            onMouseDown={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                            }}
                            onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                onRemove(String(option));
                            }}
                            sx={{
                                color: "text.secondary",
                                "&:hover": { color: "error.main", bgcolor: "rgba(211, 47, 47, 0.08)" },
                            }}
                        >
                            <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                )}
            </Box>
        </li>
    );
};

/**
 * Confirmation for removing a brand everywhere (super admin only).
 * Shows how many leads have the brand first, then clears it from all of them and from the Brand filter list.
 * Open it by passing the brand name, close it by passing an empty string.
 */
export default function RemoveBrandDialog({ brand, onClose, onRemoved }) {
    const open = Boolean(brand);
    const [count, setCount] = useState(null); // null while counting
    const [error, setError] = useState("");
    const [removing, setRemoving] = useState(false);

    // Keep the name on screen while the dialog fades out.
    const lastBrand = useRef("");
    if (brand) lastBrand.current = brand;
    const shownBrand = brand || lastBrand.current;

    useEffect(() => {
        if (!brand) return undefined;
        let cancelled = false;
        setCount(null);
        setError("");
        setRemoving(false);
        const load = async () => {
            try {
                const res = await removeLeadBrandApi(brand, { dryRun: true });
                if (cancelled) return;
                if (res?.success) setCount(Number(res.data?.leadCount) || 0);
                else setError(res?.msg || "Could not check this brand.");
            } catch (err) {
                if (!cancelled) setError("Could not check this brand.");
            }
        };
        load();
        return () => {
            cancelled = true;
        };
    }, [brand]);

    const handleClose = () => {
        if (!removing) onClose();
    };

    const handleRemove = async () => {
        setRemoving(true);
        try {
            const res = await removeLeadBrandApi(brand);
            if (!res?.success) {
                toast.error(res?.msg || "Failed to remove the brand");
                return;
            }
            const removedFrom = Number(res.data?.modifiedCount) || 0;
            toast.success(`Brand "${brand}" removed from ${leadsText(removedFrom)}`);
            if (onRemoved) onRemoved(brand, res.data);
            onClose();
        } catch (err) {
            toast.error("Error removing the brand");
        } finally {
            setRemoving(false);
        }
    };

    return (
        <Dialog open={open} onClose={handleClose} fullWidth maxWidth="xs" PaperProps={{ sx: { borderRadius: 3 } }}>
            <DialogTitle sx={{ pb: 1, fontWeight: 700 }}>Remove this brand?</DialogTitle>
            <DialogContent>
                <Box sx={{ display: "grid", gap: 1.5 }}>
                    <Typography variant="body2" component="div">
                        Brand: <strong>{shownBrand}</strong>
                    </Typography>

                    {count === null && !error && (
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, color: "text.secondary" }}>
                            <CircularProgress size={16} color="inherit" />
                            <Typography variant="body2" color="text.secondary">
                                Counting leads with this brand…
                            </Typography>
                        </Box>
                    )}
                    {count !== null && (
                        <Typography variant="body2" component="div">
                            <strong>{leadsText(count)}</strong> {count === 1 ? "has" : "have"} this brand.
                        </Typography>
                    )}
                    {error && (
                        <Typography variant="body2" color="error">
                            {error}
                        </Typography>
                    )}

                    <Typography variant="body2" color="text.secondary">
                        The brand will be taken off {count === 1 ? "that lead" : "all of these leads"} and removed from the
                        Brand filter. The leads themselves are not deleted. This cannot be undone.
                    </Typography>
                </Box>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2.5, pt: 1 }}>
                <Button onClick={handleClose} disabled={removing}>
                    Cancel
                </Button>
                <Button
                    variant="contained"
                    color="error"
                    onClick={handleRemove}
                    disabled={removing || count === null}
                >
                    {removing ? <CircularProgress size={22} color="inherit" /> : "Remove brand"}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
