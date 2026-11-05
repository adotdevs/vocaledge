import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Alert,
    Box,
    Button,
    Checkbox,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControl,
    FormControlLabel,
    IconButton,
    InputLabel,
    MenuItem,
    Select,
    Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import DoNotDisturbOnRoundedIcon from "@mui/icons-material/DoNotDisturbOnRounded";
import { toast } from "react-toastify";
import { assignLeadsApi, sendBackLeadsApi } from "../../../../Api/Service";

const ASSIGNABLE_ROLES = ["superadmin", "admin", "subadmin"];

const fullName = (user) => `${user?.firstName || ""} ${user?.lastName || ""}`.trim();
const adminLabel = (name, role) => `${name || "this admin"}${role ? ` (${role})` : ""}`;
const leadsText = (count) => `${count} ${count === 1 ? "lead" : "leads"}`;
const toCount = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);

// "1 lead already assigned to Hina Arooj (subadmin)"
// "1 lead already assigned to the selected admin, admin admin (admin)"
const SKIP_PHRASE = {
    already_assigned: "already assigned to",
    already_with_admin: "already assigned to the selected admin,",
    previously_assigned: "previously assigned to the selected admin,",
};

// Leads that are left as they are: one row per reason (and per admin who has them). Counts add up with "assigned".
const skipItems = (items, fallbackAdmin) =>
    (Array.isArray(items) ? items : [])
        .filter((item) => toCount(item?.count) > 0)
        .map((item) => ({
            key: `${item.reason}-${item.agentId}`,
            reason: item.reason,
            count: toCount(item.count),
            who: adminLabel(
                item.agentName || fullName(fallbackAdmin) || "another admin",
                item.agentRole || fallbackAdmin?.role
            ),
        }));

function Dot() {
    return (
        <Box
            sx={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                bgcolor: "text.disabled",
                flexShrink: 0,
                transform: "translateY(-2px)",
            }}
        />
    );
}

// Always visible: who has the selected leads right now.
function CurrentOwners({ state, owners, unassigned }) {
    return (
        <Box>
            <Typography
                variant="overline"
                sx={{ display: "block", mb: 0.5, fontWeight: 700, letterSpacing: 0.8, color: "text.secondary", lineHeight: 1.6 }}
            >
                Currently
            </Typography>
            {state === "loading" && (
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, color: "text.secondary" }}>
                    <CircularProgress size={16} color="inherit" />
                    <Typography variant="body2" color="text.secondary">
                        Checking who has these leads…
                    </Typography>
                </Box>
            )}
            {state === "error" && (
                <Typography variant="body2" color="text.secondary">
                    Could not load who has these leads.
                </Typography>
            )}
            {state === "ready" && (
                <Box sx={{ display: "grid", gap: 0.75, maxHeight: 150, overflowY: "auto" }}>
                    {owners.map((owner) => (
                        <Box key={owner.agentId} sx={{ display: "flex", alignItems: "baseline", gap: 1.25 }}>
                            <Dot />
                            <Typography variant="body2" component="div">
                                <strong>{leadsText(owner.count)}</strong> assigned to{" "}
                                <strong>{adminLabel(owner.agentName, owner.agentRole)}</strong>
                            </Typography>
                        </Box>
                    ))}
                    {unassigned > 0 && (
                        <Box sx={{ display: "flex", alignItems: "baseline", gap: 1.25 }}>
                            <Dot />
                            <Typography variant="body2" component="div">
                                <strong>{leadsText(unassigned)}</strong> not assigned to anyone
                            </Typography>
                        </Box>
                    )}
                </Box>
            )}
        </Box>
    );
}

function TreeRow({ depth, last, label, action }) {
    return (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, minHeight: 36 }}>
            <Box sx={{ width: depth ? 18 + depth * 16 : 0, flexShrink: 0, position: "relative", alignSelf: "stretch" }}>
                {depth > 0 && (
                    <Box
                        sx={{
                            position: "absolute",
                            left: 8 + (depth - 1) * 16,
                            top: last ? 0 : -8,
                            bottom: last ? "50%" : -8,
                            borderLeft: "1px solid",
                            borderColor: "divider",
                        }}
                    />
                )}
                {depth > 0 && (
                    <Box
                        sx={{
                            position: "absolute",
                            left: 8 + (depth - 1) * 16,
                            top: "50%",
                            width: 12,
                            borderTop: "1px solid",
                            borderColor: "divider",
                        }}
                    />
                )}
            </Box>
            <Typography variant="body2" component="div" sx={{ flex: 1, minWidth: 0 }}>
                {label}
            </Typography>
            {action}
        </Box>
    );
}

function PreviousTree({ history, canSendBack, sendingId, onSendBack }) {
    const groups = history || [];
    const hasBranch = groups.some((group) => (group.branches || []).length > 0);
    return (
        <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, px: 1.5, py: 1.25 }}>
            <Typography variant="overline" sx={{ display: "block", fontWeight: 700, letterSpacing: 0.8, color: "text.secondary", lineHeight: 1.6 }}>
                Previously assigned
            </Typography>
            {!hasBranch && (
                <Typography variant="body2" color="text.secondary" sx={{ py: 0.5 }}>
                    No earlier agent is saved for these leads.
                </Typography>
            )}
            {groups.map((group) => (
                <Box key={group.agentId || "none"}>
                    <TreeRow
                        depth={0}
                        label={(
                            <>
                                <strong>{leadsText(group.count)}</strong>
                                {group.agentName ? <> with <strong>{adminLabel(group.agentName, group.agentRole)}</strong> now</> : " not assigned now"}
                            </>
                        )}
                    />
                    {group.branches.map((branch, index) => (
                        <Box key={branch.agentId}>
                            <TreeRow
                                depth={1}
                                last={index === group.branches.length - 1 && branch.earlier.length === 0}
                                label={(
                                    <>
                                        <strong>{leadsText(branch.count)}</strong> were with <strong>{adminLabel(branch.agentName, branch.agentRole)}</strong>
                                    </>
                                )}
                                action={canSendBack && branch.canSendBack ? (
                                    <Button
                                        size="small"
                                        variant="outlined"
                                        disabled={Boolean(sendingId)}
                                        onClick={() => onSendBack(branch)}
                                        sx={{ flexShrink: 0, cursor: "pointer", textTransform: "none", fontWeight: 700 }}
                                    >
                                        {sendingId === branch.agentId ? "Sending…" : "Send back"}
                                    </Button>
                                ) : null}
                            />
                            {branch.earlier.map((earlier, earlierIndex) => (
                                <TreeRow
                                    key={earlier.agentId}
                                    depth={2}
                                    last={earlierIndex === branch.earlier.length - 1 && index === group.branches.length - 1}
                                    label={(
                                        <>
                                            <strong>{leadsText(earlier.count)}</strong> were with <strong>{adminLabel(earlier.agentName, earlier.agentRole)}</strong> before that
                                        </>
                                    )}
                                />
                            ))}
                        </Box>
                    ))}
                </Box>
            ))}
        </Box>
    );
}

function ResultLine({ tone, icon, children }) {
    return (
        <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.25 }}>
            <Box sx={(theme) => ({ display: "flex", pt: "1px", color: theme.palette[tone].main })}>{icon}</Box>
            <Box sx={{ minWidth: 0, flex: 1 }}>{children}</Box>
        </Box>
    );
}

// Every selected lead is counted once: assigned to the chosen admin, or left with whoever has it.
function ResultPanel({ future, targetLabel, assigned, skipped, noneNote }) {
    const assignedVerb = future ? "will be" : assigned === 1 ? "was" : "were";
    return (
        <Box
            sx={(theme) => ({
                display: "grid",
                gap: 1.5,
                px: 2,
                py: 1.75,
                borderRadius: 2,
                bgcolor: alpha(theme.palette.text.primary, 0.04),
            })}
        >
            <ResultLine tone="success" icon={<CheckCircleRoundedIcon sx={{ fontSize: 20 }} />}>
                <Typography variant="body2" component="div">
                    <strong>{leadsText(assigned)}</strong> {assignedVerb} assigned to <strong>{targetLabel}</strong>
                </Typography>
            </ResultLine>
            {skipped.map((item) => (
                <ResultLine key={item.key} tone="warning" icon={<DoNotDisturbOnRoundedIcon sx={{ fontSize: 20 }} />}>
                    <Typography variant="body2" component="div">
                        <strong>{leadsText(item.count)}</strong> {SKIP_PHRASE[item.reason] || SKIP_PHRASE.already_assigned}{" "}
                        <strong>{item.who}</strong>
                    </Typography>
                </ResultLine>
            ))}
            {skipped.length > 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ pl: "30px", mt: -0.75 }}>
                    {future ? "These leads stay as they are." : "These leads were left as they are."}
                </Typography>
            )}
            {skipped.length === 0 && noneNote && (
                <Typography variant="body2" color="text.secondary" sx={{ pl: "30px" }}>
                    {future
                        ? "None of the selected leads are already assigned."
                        : "None of the selected leads were already assigned."}
                </Typography>
            )}
        </Box>
    );
}

/**
 * One dialog for assigning leads (bulk list and single lead page).
 * - Always shows who has the selected leads right now.
 * - Pick an admin. Optionally tick "Remove Previously Assigned".
 * - Nothing extra is shown until the box is ticked. Then the server does a dry run, so the numbers shown
 *   before you click Assign are exactly what will happen.
 * - After assigning, the same panel shows how many were assigned and where the other leads stayed.
 * `leadIds` must keep the same array identity while nothing changes (wrap it in useMemo).
 */
export default function AssignLeadsDialog({
    open,
    onClose,
    leadIds,
    agents,
    currentUserId,
    title = "Assign Selected Leads",
    subtitle = "",
    canSendBack = false,
    onAssigned,
}) {
    const [agentId, setAgentId] = useState("");
    const [skip, setSkip] = useState(false);
    const [assigning, setAssigning] = useState(false);
    const [summary, setSummary] = useState(null);
    const [preview, setPreview] = useState(null); // { key, data } or { key, error }
    const [owners, setOwners] = useState(null); // { ids, data } or { ids, error }
    const [historyTick, setHistoryTick] = useState(0);
    const [sendingBackId, setSendingBackId] = useState("");

    const reset = useCallback(() => {
        setAgentId("");
        setSkip(false);
        setAssigning(false);
        setSummary(null);
        setPreview(null);
        setOwners(null);
        setHistoryTick(0);
        setSendingBackId("");
    }, []);

    useEffect(() => {
        if (open) reset();
    }, [open, reset]);

    const options = useMemo(
        () => (Array.isArray(agents) ? agents : []).filter((agent) => ASSIGNABLE_ROLES.includes(agent?.role)),
        [agents]
    );
    const agentById = useMemo(() => new Map(options.map((agent) => [String(agent._id), agent])), [options]);
    const chosen = agentById.get(String(agentId)) || null;
    const targetLabel = adminLabel(fullName(chosen), chosen?.role);
    // The parent clears its selection as soon as the dialog closes/assigns; keep the last list so the
    // dialog does not flash "0 leads" while it fades out.
    const idsRef = useRef([]);
    if (Array.isArray(leadIds) && leadIds.length > 0) idsRef.current = leadIds;
    const ids = idsRef.current;
    const total = ids.length;
    const previewKey = `${agentId}|${skip}|${total}`;

    // As soon as the dialog opens: who has these leads right now (no admin needed, nothing is changed).
    useEffect(() => {
        if (!open || summary || ids.length === 0) return undefined;
        let cancelled = false;
        const load = async () => {
            try {
                const res = await assignLeadsApi(ids, null, { dryRun: true });
                if (cancelled) return;
                if (res?.success && res.data) setOwners({ ids, data: res.data });
                else setOwners({ ids, error: res?.msg || "Could not load who has these leads." });
            } catch (error) {
                if (!cancelled) setOwners({ ids, error: "Could not load who has these leads." });
            }
        };
        load();
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, leadIds, historyTick]);

    // Only when the box is ticked: ask the server what would happen (nothing is changed).
    useEffect(() => {
        if (!open || summary || !agentId || !skip || ids.length === 0) return undefined;
        let cancelled = false;
        const timer = setTimeout(async () => {
            try {
                const res = await assignLeadsApi(ids, agentId, { skipPreviouslyAssigned: true, dryRun: true });
                if (cancelled) return;
                if (res?.success && res.data) setPreview({ key: previewKey, data: res.data });
                else setPreview({ key: previewKey, error: res?.msg || "Could not check these leads." });
            } catch (error) {
                if (!cancelled) setPreview({ key: previewKey, error: "Could not check these leads." });
            }
        }, 250);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, summary, agentId, skip, leadIds]);

    const ownersNow = owners && owners.ids === ids ? owners : null;
    const ownersState = !ownersNow ? "loading" : ownersNow.error ? "error" : "ready";

    // Only use a preview that was made for the current admin + box state.
    const current = preview && preview.key === previewKey ? preview : null;
    const checking = Boolean(chosen) && skip && !current;
    const checkError = Boolean(chosen) && skip && current?.error ? current.error : "";

    let shown = null;
    if (chosen && !summary) {
        if (!skip) {
            shown = { assigned: total, skipped: [] };
        } else if (current?.data) {
            shown = {
                assigned: toCount(current.data.assignedCount),
                skipped: skipItems(current.data.notAssignedByAdmin, chosen),
            };
        }
    }
    const nothingToAssign = skip && Boolean(shown) && shown.assigned === 0;
    const canAssign = Boolean(chosen) && total > 0 && !assigning && !nothingToAssign;
    const assignLabel = shown ? `Assign ${leadsText(shown.assigned)}` : "Assign";

    const handleSendBack = async (branch) => {
        setSendingBackId(branch.agentId);
        try {
            const res = await sendBackLeadsApi(ids, branch.agentId);
            if (!res?.success) {
                toast.error(res?.msg || "Could not send these leads back");
                return;
            }
            toast.success(res.msg || `${leadsText(branch.count)} sent back`);
            setPreview(null);
            setHistoryTick((tick) => tick + 1);
            if (onAssigned) onAssigned(res.data);
        } catch (error) {
            toast.error("Could not send these leads back");
        } finally {
            setSendingBackId("");
        }
    };

    const handleClose = () => {
        if (!assigning) onClose();
    };

    const handleAssign = async () => {
        if (!chosen) {
            toast.error("Please select an admin");
            return;
        }
        setAssigning(true);
        try {
            const res = await assignLeadsApi(ids, agentId, { skipPreviouslyAssigned: skip });
            if (!res?.success) {
                toast.error(res?.msg || "Failed to assign leads");
                return;
            }
            const data = res.data || {};
            const assigned = toCount(data.assignedCount, toCount(data.modifiedCount));
            const label = adminLabel(data.agentName || fullName(chosen), data.agentRole || chosen.role);
            setSummary({
                assigned,
                skipped: skipItems(data.notAssignedByAdmin, chosen),
                skipMode: skip,
                total: toCount(data.selectedCount, total),
                label,
            });
            toast.success(`${leadsText(assigned)} assigned to ${label}`);
            if (onAssigned) onAssigned(data);
        } catch (error) {
            toast.error("Error assigning leads");
        } finally {
            setAssigning(false);
        }
    };

    const headerSubtitle = subtitle || `${leadsText(summary ? summary.total : total)} selected`;

    return (
        <Dialog
            open={open}
            onClose={handleClose}
            fullWidth
            maxWidth="sm"
            PaperProps={{ sx: { borderRadius: 3 } }}
            TransitionProps={{ onExited: reset }}
        >
            <DialogTitle sx={{ pr: 7, pb: 1 }}>
                <Box component="span" sx={{ display: "block", fontWeight: 700, fontSize: 20, lineHeight: 1.3 }}>
                    {summary ? "Assignment complete" : title}
                </Box>
                <Box
                    component="span"
                    sx={{ display: "block", mt: 0.25, fontSize: 14, fontWeight: 400, color: "text.secondary" }}
                >
                    {headerSubtitle}
                </Box>
                <IconButton
                    aria-label="Close"
                    onClick={handleClose}
                    disabled={assigning}
                    size="small"
                    sx={{ position: "absolute", right: 16, top: 16 }}
                >
                    <CloseRoundedIcon fontSize="small" />
                </IconButton>
            </DialogTitle>

            <DialogContent>
                <Box sx={{ display: "grid", gap: 2.5, pt: 1 }}>
                    {summary ? (
                        <ResultPanel
                            future={false}
                            targetLabel={summary.label}
                            assigned={summary.assigned}
                            skipped={summary.skipped}
                            noneNote={summary.skipMode}
                        />
                    ) : (
                        <>
                            <CurrentOwners
                                state={ownersState}
                                owners={ownersNow?.data?.currentOwners || []}
                                unassigned={toCount(ownersNow?.data?.unassignedCount)}
                            />

                            <FormControl fullWidth size="small">
                                <InputLabel id="assign-leads-admin-label">Assign to</InputLabel>
                                <Select
                                    labelId="assign-leads-admin-label"
                                    label="Assign to"
                                    value={agentId}
                                    onChange={(event) => setAgentId(event.target.value)}
                                    renderValue={(value) => {
                                        const agent = agentById.get(String(value));
                                        return agent ? adminLabel(fullName(agent), agent.role) : "";
                                    }}
                                    MenuProps={{ PaperProps: { sx: { maxHeight: 340 } } }}
                                    sx={{ cursor: "pointer" }}
                                >
                                    {options.map((agent) => (
                                        <MenuItem key={agent._id} value={agent._id} sx={{ cursor: "pointer" }}>
                                            <Box sx={{ minWidth: 0 }}>
                                                <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                                                    {fullName(agent)}
                                                    {String(agent._id) === String(currentUserId) ? " (you)" : ""}
                                                </Typography>
                                                <Typography variant="caption" color="text.secondary" noWrap>
                                                    {agent.role}
                                                    {agent.email ? ` · ${agent.email}` : ""}
                                                </Typography>
                                            </Box>
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>

                            <FormControlLabel
                                sx={{
                                    alignItems: "flex-start",
                                    ml: "-12px",
                                    mr: 0,
                                    cursor: "pointer",
                                    "& .MuiFormControlLabel-label": { pt: "10px" },
                                }}
                                control={
                                    <Checkbox
                                        checked={skip}
                                        onChange={(event) => setSkip(event.target.checked)}
                                        sx={{ cursor: "pointer" }}
                                    />
                                }
                                label={
                                    <Box component="span" sx={{ display: "block" }}>
                                        <Typography component="span" variant="body2" sx={{ display: "block", fontWeight: 700 }}>
                                            Remove Previously Assigned
                                        </Typography>
                                        <Typography
                                            component="span"
                                            variant="body2"
                                            color="text.secondary"
                                            sx={{ display: "block", mt: 0.25 }}
                                        >
                                            {skip
                                                ? "Leave out leads that already have an admin, or that this admin had before."
                                                : "Assign all selected leads, even if another admin already has them."}
                                        </Typography>
                                    </Box>
                                }
                            />

                            {skip && (
                                <PreviousTree
                                    history={ownersNow?.data?.history || []}
                                    canSendBack={canSendBack}
                                    sendingId={sendingBackId}
                                    onSendBack={handleSendBack}
                                />
                            )}

                            {checking && (
                                <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, color: "text.secondary" }}>
                                    <CircularProgress size={16} color="inherit" />
                                    <Typography variant="body2" color="text.secondary">
                                        Checking which leads can be assigned…
                                    </Typography>
                                </Box>
                            )}

                            {checkError && (
                                <Alert severity="error" variant="outlined">
                                    {checkError}
                                </Alert>
                            )}

                            {skip && shown && (
                                <ResultPanel
                                    future
                                    targetLabel={targetLabel}
                                    assigned={shown.assigned}
                                    skipped={shown.skipped}
                                    noneNote
                                />
                            )}
                        </>
                    )}
                </Box>
            </DialogContent>

            <DialogActions sx={{ px: 3, pb: 2.5, pt: 1 }}>
                {summary ? (
                    <Button variant="contained" onClick={onClose}>
                        Done
                    </Button>
                ) : (
                    <>
                        <Button onClick={handleClose} disabled={assigning}>
                            Cancel
                        </Button>
                        <Button variant="contained" onClick={handleAssign} disabled={!canAssign}>
                            {assigning ? <CircularProgress size={22} color="inherit" /> : assignLabel}
                        </Button>
                    </>
                )}
            </DialogActions>
        </Dialog>
    );
}
