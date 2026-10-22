import React, { useCallback, useEffect, useRef, useState } from "react";
import {
    Box,
    Button,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Divider,
    FormControl,
    IconButton,
    InputLabel,
    List,
    ListItem,
    MenuItem,
    Select,
    InputAdornment,
    Popover,
    Slider,
    TextField,
    Tooltip,
    Typography,
} from "@mui/material";
import {
    Add,
    Delete,
    Edit,
    Settings,
    Star,
    StarBorder,
    Check,
    Close,
} from "@mui/icons-material";
import { toast } from "react-toastify";
import {
    createLeadStatusApi,
    updateLeadStatusApi,
    deleteLeadStatusApi,
} from "../../../../Api/Service";
import {
    fetchLeadStatuses,
    getCachedLeadStatuses,
    invalidateLeadStatuses,
    subscribeLeadStatuses,
} from "./leadStatusCache";
import {
    STATUS_COLOR_PALETTE,
    getStatusColor,
    hexToHsl,
    hslToHex,
    normalizeHexColor,
} from "./leadStatusStyles";

const ColorButton = ({ color, onClick, disabled = false }) => (
    <Button
        size="small"
        variant="outlined"
        color="inherit"
        disabled={disabled}
        onClick={onClick}
        startIcon={(
            <Box
                sx={{
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    bgcolor: color,
                    boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.25)",
                }}
            />
        )}
        sx={{
            textTransform: "none",
            minWidth: 0,
            px: 1.25,
            py: 0.25,
            flexShrink: 0,
            color: "text.primary",
            borderColor: "divider",
        }}
    >
        Color
    </Button>
);

const MANAGE_STATUS_VALUE = "__manage_statuses__";

const LeadStatusSelect = ({
    value,
    onChange,
    label = "Status",
    size = "small",
    fullWidth = true,
    showAllOption = false,
    allowManage = false,
    disabled = false,
    onStatusesChange,
    manageButtonOnly = false,
}) => {
    const [statuses, setStatuses] = useState(() => getCachedLeadStatuses() || []);
    const [initialLoading, setInitialLoading] = useState(() => !getCachedLeadStatuses());
    const [selectOpen, setSelectOpen] = useState(false);
    const [manageOpen, setManageOpen] = useState(false);
    const [newLabel, setNewLabel] = useState("");
    const [newColor, setNewColor] = useState(STATUS_COLOR_PALETTE[0]);
    const [saving, setSaving] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [editLabel, setEditLabel] = useState("");
    const [colorAnchor, setColorAnchor] = useState(null);
    const [colorStatus, setColorStatus] = useState(null);
    const [colorDraft, setColorDraft] = useState("");

    useEffect(() => {
        return subscribeLeadStatuses((nextStatuses) => {
            setStatuses(nextStatuses);
            setInitialLoading(false);
        });
    }, []);

    useEffect(() => {
        let cancelled = false;

        fetchLeadStatuses()
            .catch((err) => {
                if (!cancelled) {
                    toast.error(err?.msg || "Failed to load lead statuses");
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setInitialLoading(false);
                }
            });

        return () => {
            cancelled = true;
        };
    }, []);

    const reloadAfterMutation = useCallback(async () => {
        invalidateLeadStatuses();
        const nextStatuses = await fetchLeadStatuses({ force: true });
        onStatusesChange?.(nextStatuses);
    }, [onStatusesChange]);

    const handleAddStatus = async () => {
        const statusLabel = newLabel.trim();
        const color = normalizeHexColor(newColor);
        if (!statusLabel || !color) return;
        setSaving(true);
        try {
            const res = await createLeadStatusApi({ label: statusLabel, color });
            if (res.success) {
                toast.success("Status added");
                setNewLabel("");
                setNewColor(STATUS_COLOR_PALETTE[0]);
                await reloadAfterMutation();
                onChange?.({ target: { value: statusLabel } });
            } else {
                toast.error(res.msg || "Failed to add status");
            }
        } catch (err) {
            toast.error(err?.msg || "Failed to add status");
        } finally {
            setSaving(false);
        }
    };

    const closeColorPicker = () => {
        setColorAnchor(null);
        setColorStatus(null);
        setColorDraft("");
    };

    const openColorPicker = (event, status) => {
        setColorAnchor(event.currentTarget);
        setColorStatus(status || null);
        setColorDraft(status ? getStatusColor(status) : (normalizeHexColor(newColor) || STATUS_COLOR_PALETTE[0]));
    };

    const applyColor = async (rawColor, { close = true } = {}) => {
        const color = normalizeHexColor(rawColor);
        if (!color) {
            if (close) toast.error("Use a color code like #1976d2");
            return;
        }

        if (!colorStatus) {
            setNewColor(color);
            setColorDraft(color);
            if (close) closeColorPicker();
            return;
        }

        if (color === getStatusColor(colorStatus)) {
            setColorDraft(color);
            if (close) closeColorPicker();
            return;
        }

        setSaving(true);
        try {
            const res = await updateLeadStatusApi(colorStatus._id, { color });
            if (res.success) {
                setColorDraft(color);
                setColorStatus((current) => (current ? { ...current, color } : current));
                if (close) closeColorPicker();
                await reloadAfterMutation();
            } else {
                toast.error(res.msg || "Failed to update color");
            }
        } catch (err) {
            toast.error(err?.msg || "Failed to update color");
        } finally {
            setSaving(false);
        }
    };

    const handleSaveEdit = async (status) => {
        const nextLabel = editLabel.trim();
        if (!nextLabel) return;
        setSaving(true);
        try {
            const res = await updateLeadStatusApi(status._id, { label: nextLabel });
            if (res.success) {
                toast.success("Status updated");
                if (value === status.label) {
                    onChange?.({ target: { value: nextLabel } });
                }
                setEditingId(null);
                setEditLabel("");
                await reloadAfterMutation();
            } else {
                toast.error(res.msg || "Failed to update status");
            }
        } catch (err) {
            toast.error(err?.msg || "Failed to update status");
        } finally {
            setSaving(false);
        }
    };

    const handleSetDefault = async (status) => {
        setSaving(true);
        try {
            const res = await updateLeadStatusApi(status._id, { label: status.label, isDefault: true });
            if (res.success) {
                toast.success(`"${status.label}" set as default`);
                await reloadAfterMutation();
            } else {
                toast.error(res.msg || "Failed to set default");
            }
        } catch (err) {
            toast.error(err?.msg || "Failed to set default");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (status) => {
        if (!window.confirm(`Delete status "${status.label}"? Leads with this status will be reassigned.`)) {
            return;
        }
        setSaving(true);
        try {
            const res = await deleteLeadStatusApi(status._id);
            if (res.success) {
                toast.success(res.msg || "Status deleted");
                if (value === status.label) {
                    onChange?.({ target: { value: res.reassignedTo || "" } });
                }
                await reloadAfterMutation();
            } else {
                toast.error(res.msg || "Failed to delete status");
            }
        } catch (err) {
            toast.error(err?.msg || "Failed to delete status");
        } finally {
            setSaving(false);
        }
    };

    const openManage = () => {
        setSelectOpen(false);
        window.setTimeout(() => setManageOpen(true), 0);
    };

    const handleSelectChange = (event) => {
        const nextValue = event.target.value;
        if (nextValue === MANAGE_STATUS_VALUE) {
            openManage();
            return;
        }
        if (nextValue === value) {
            return;
        }
        onChange?.(event);
    };

    const labels = statuses.map((s) => s.label);
    const selectDisabled = disabled;
    const selectValue = value ?? (showAllOption ? "" : "");
    const labelShrunk = showAllOption || Boolean(selectValue);

    const previewColor = normalizeHexColor(colorDraft);
    const sliderColorRef = useRef(previewColor || "#1976d2");
    if (previewColor) sliderColorRef.current = previewColor;
    const sliderColor = hexToHsl(sliderColorRef.current || "#1976d2");
    const setSliderColor = (hue, saturation, lightness) => {
        const next = hslToHex(hue, saturation, lightness);
        sliderColorRef.current = next;
        setColorDraft(next);
    };

    const manageDialog = (
        <Dialog
            open={manageOpen}
            onClose={() => {
                if (saving) return;
                setManageOpen(false);
                setEditingId(null);
                setEditLabel("");
                setNewLabel("");
                setNewColor(STATUS_COLOR_PALETTE[0]);
                closeColorPicker();
            }}
            maxWidth="sm"
            fullWidth
            disableRestoreFocus
            sx={{ zIndex: (theme) => theme.zIndex.modal + 2 }}
        >
            <DialogTitle>Manage Lead Statuses</DialogTitle>
            <DialogContent dividers>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Press <strong>Color</strong> on a status and pick one. It saves immediately.
                </Typography>

                <List dense disablePadding>
                    {statuses.map((status) => (
                        <ListItem key={status._id} sx={{ px: 0 }}>
                            {editingId === status._id ? (
                                <Box sx={{ display: "flex", alignItems: "center", gap: 1, width: "100%" }}>
                                    <TextField
                                        size="small"
                                        fullWidth
                                        value={editLabel}
                                        onChange={(e) => setEditLabel(e.target.value)}
                                        disabled={saving}
                                        autoFocus
                                        onKeyDown={(e) => e.key === "Enter" && handleSaveEdit(status)}
                                    />
                                    <IconButton size="small" color="success" onClick={() => handleSaveEdit(status)} disabled={saving || !editLabel.trim()}>
                                        <Check fontSize="small" />
                                    </IconButton>
                                    <IconButton size="small" onClick={() => { setEditingId(null); setEditLabel(""); }} disabled={saving}>
                                        <Close fontSize="small" />
                                    </IconButton>
                                </Box>
                            ) : (
                                <Box sx={{ display: "flex", alignItems: "center", gap: 1, width: "100%", py: 0.5 }}>
                                    <Typography sx={{ flex: 1, minWidth: 0 }} noWrap>
                                        {status.label}
                                    </Typography>
                                    {status.isDefault && (
                                        <Chip label="Default" size="small" color="primary" variant="outlined" />
                                    )}
                                    <ColorButton
                                        color={getStatusColor(status)}
                                        disabled={saving}
                                        onClick={(event) => openColorPicker(event, status)}
                                    />
                                    <Tooltip title={status.isDefault ? "Default status" : "Set as default"}>
                                        <span>
                                            <IconButton
                                                size="small"
                                                onClick={() => handleSetDefault(status)}
                                                disabled={saving || status.isDefault}
                                            >
                                                {status.isDefault ? <Star fontSize="small" color="primary" /> : <StarBorder fontSize="small" />}
                                            </IconButton>
                                        </span>
                                    </Tooltip>
                                    <IconButton
                                        size="small"
                                        onClick={() => {
                                            setEditingId(status._id);
                                            setEditLabel(status.label);
                                        }}
                                        disabled={saving}
                                    >
                                        <Edit fontSize="small" />
                                    </IconButton>
                                    <IconButton
                                        size="small"
                                        color="error"
                                        onClick={() => handleDelete(status)}
                                        disabled={saving || statuses.length <= 1}
                                    >
                                        <Delete fontSize="small" />
                                    </IconButton>
                                </Box>
                            )}
                        </ListItem>
                    ))}
                </List>

                <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 2 }}>
                    <ColorButton
                        color={normalizeHexColor(newColor) || STATUS_COLOR_PALETTE[0]}
                        disabled={saving}
                        onClick={(event) => openColorPicker(event, null)}
                    />
                    <TextField
                        size="small"
                        fullWidth
                        placeholder="New status name"
                        value={newLabel}
                        onChange={(e) => setNewLabel(e.target.value)}
                        disabled={saving}
                        onKeyDown={(e) => e.key === "Enter" && handleAddStatus()}
                    />
                    <Button
                        variant="contained"
                        startIcon={<Add />}
                        onClick={handleAddStatus}
                        disabled={saving || !newLabel.trim() || !normalizeHexColor(newColor)}
                    >
                        Add
                    </Button>
                </Box>
            </DialogContent>
            <Popover
                open={Boolean(colorAnchor)}
                anchorEl={colorAnchor}
                onClose={closeColorPicker}
                anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
                transformOrigin={{ vertical: "top", horizontal: "left" }}
                sx={{ zIndex: (theme) => theme.zIndex.modal + 5 }}
            >
                <Box sx={{ p: 1.5, width: 248 }}>
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>
                        Choose a color
                    </Typography>
                    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
                        {STATUS_COLOR_PALETTE.map((color) => {
                            const selected = normalizeHexColor(colorDraft) === color;
                            return (
                                <Box
                                    key={color}
                                    component="button"
                                    type="button"
                                    aria-label={color}
                                    onClick={() => applyColor(color)}
                                    sx={{
                                        width: 22,
                                        height: 22,
                                        p: 0,
                                        borderRadius: "50%",
                                        bgcolor: color,
                                        border: 0,
                                        cursor: "pointer",
                                        boxShadow: selected
                                            ? `0 0 0 2px #fff, 0 0 0 3px ${color}`
                                            : "inset 0 0 0 1px rgba(0,0,0,0.18)",
                                    }}
                                />
                            );
                        })}
                    </Box>
                    <TextField
                        size="small"
                        fullWidth
                        placeholder="#1976d2"
                        value={colorDraft}
                        onChange={(event) => setColorDraft(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter") {
                                event.preventDefault();
                                applyColor(colorDraft);
                            }
                        }}
                        onBlur={() => {
                            const typed = normalizeHexColor(colorDraft);
                            const current = colorStatus
                                ? getStatusColor(colorStatus)
                                : (normalizeHexColor(newColor) || STATUS_COLOR_PALETTE[0]);
                            if (typed && typed !== current) {
                                applyColor(typed);
                            }
                        }}
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <Box
                                        sx={{
                                            width: 22,
                                            height: 22,
                                            borderRadius: "4px",
                                            bgcolor: previewColor || "transparent",
                                            border: "1px solid",
                                            borderColor: "divider",
                                        }}
                                    />
                                </InputAdornment>
                            ),
                        }}
                        sx={{ mt: 1.5 }}
                    />
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1.25 }}>
                        Hue
                    </Typography>
                    <Slider
                        size="small"
                        min={0}
                        max={360}
                        value={sliderColor.h}
                        onChange={(_, nextHue) => setSliderColor(nextHue, sliderColor.s < 8 ? 80 : sliderColor.s, sliderColor.l)}
                        onChangeCommitted={() => applyColor(sliderColorRef.current, { close: false })}
                        sx={{
                            py: 1,
                            "& .MuiSlider-rail": {
                                opacity: 1,
                                height: 8,
                                background: "linear-gradient(90deg, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)",
                            },
                            "& .MuiSlider-track": { background: "transparent", border: "none" },
                        }}
                    />
                    <Typography variant="caption" color="text.secondary">
                        Shade
                    </Typography>
                    <Slider
                        size="small"
                        min={0}
                        max={100}
                        value={sliderColor.l}
                        onChange={(_, nextLight) => setSliderColor(sliderColor.h, sliderColor.s, nextLight)}
                        onChangeCommitted={() => applyColor(sliderColorRef.current, { close: false })}
                        sx={{
                            py: 1,
                            "& .MuiSlider-rail": {
                                opacity: 1,
                                height: 8,
                                background: `linear-gradient(90deg, #000000, ${hslToHex(sliderColor.h, sliderColor.s || 100, 50)}, #ffffff)`,
                            },
                            "& .MuiSlider-track": { background: "transparent", border: "none" },
                        }}
                    />
                </Box>
            </Popover>
            <DialogActions>
                <Button
                    onClick={() => {
                        closeColorPicker();
                        setManageOpen(false);
                    }}
                    disabled={saving}
                >
                    Done
                </Button>
            </DialogActions>
        </Dialog>
    );

    if (manageButtonOnly) {
        return (
            <>
                <Button
                    variant="outlined"
                    size="medium"
                    startIcon={<Settings />}
                    onClick={() => setManageOpen(true)}
                    disabled={selectDisabled}
                    sx={{
                        height: 36,
                        borderRadius: '999px',
                        px: 2,
                        fontSize: '0.9375rem',
                        fontWeight: 600,
                        textTransform: 'none',
                    }}
                >
                    Manage statuses
                </Button>
                {manageDialog}
            </>
        );
    }

    return (
        <>
            <FormControl fullWidth={fullWidth} size={size} disabled={selectDisabled}>
                <InputLabel id="lead-status-select-label" shrink={labelShrunk}>
                    {label}
                </InputLabel>
                <Select
                    labelId="lead-status-select-label"
                    value={selectValue}
                    label={label}
                    open={selectOpen}
                    onOpen={() => setSelectOpen(true)}
                    onClose={() => setSelectOpen(false)}
                    onChange={handleSelectChange}
                    MenuProps={{
                        disablePortal: false,
                        PaperProps: { sx: { maxHeight: 320 } },
                    }}
                >
                    {showAllOption && <MenuItem value="">All Statuses</MenuItem>}
                    {statuses.map((status) => (
                        <MenuItem key={status._id || status.label} value={status.label}>
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                <Box
                                    sx={{
                                        width: 10,
                                        height: 10,
                                        borderRadius: "50%",
                                        bgcolor: getStatusColor(status),
                                        flexShrink: 0,
                                    }}
                                />
                                {status.label}
                            </Box>
                        </MenuItem>
                    ))}
                    {selectValue && !labels.includes(selectValue) && (
                        <MenuItem value={selectValue}>{selectValue}</MenuItem>
                    )}
                    {allowManage && [
                        <Divider key="divider" />,
                        <MenuItem
                            key="manage"
                            value={MANAGE_STATUS_VALUE}
                            onMouseDown={(e) => e.preventDefault()}
                        >
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1, color: "primary.main" }}>
                                <Settings fontSize="small" />
                                Manage statuses...
                            </Box>
                        </MenuItem>,
                    ]}
                </Select>
            </FormControl>

            {manageDialog}
        </>
    );
};

export default LeadStatusSelect;
