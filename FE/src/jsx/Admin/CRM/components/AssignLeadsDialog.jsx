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
    Chip,
    Select,
    TextField,
    Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import DoNotDisturbOnRoundedIcon from "@mui/icons-material/DoNotDisturbOnRounded";
import { toast } from "react-toastify";
import { assignLeadsApi, sendBackLeadsApi } from "../../../../Api/Service";
import { fetchLeadStatuses, getCachedLeadStatuses } from "./leadStatusCache";
import { getStatusChipSx, getStatusColor } from "./leadStatusStyles";

const ASSIGNABLE_ROLES = ["superadmin", "admin", "subadmin"];

const fullName = (user) => `${user?.firstName || ""} ${user?.lastName || ""}`.trim();
const adminLabel = (name, role) => `${name || "this admin"}${role ? ` (${role})` : ""}`;
const leadsText = (count) => `${count} ${count === 1 ? "lead" : "leads"}`;
const toCount = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);

const SKIP_PHRASE = {
    already_assigned: "already assigned to",
    already_with_admin: "already assigned to the selected admin,",
    previously_assigned: "previously assigned to the selected admin,",
};

const skipItems = (items, fallbackAdmin) =>
    (Array.isArray(items) ? items : [])
        .filter((item) => toCount(item?.count) > 0)
        .map((item) => ({
            key: `${item.reason}-${item.agentId}`,
            reason: item.reason,
            count: toCount(item.count),
            who: adminLabel(item.agentName || fullName(fallbackAdmin) || "another admin", item.agentRole || fallbackAdmin?.role),
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

function StatusDot({ color }) {
    return (
        <Box
            component="span"
            sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: color, display: "inline-block", flexShrink: 0 }}
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
                                action={canSendBack && branch.agentId ? (
                                    <Button
                                        size="small"
                                        variant="contained"
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
                                    action={canSendBack && earlier.agentId ? (
                                        <Button
                                            size="small"
                                            variant="contained"
                                            disabled={Boolean(sendingId)}
                                            onClick={() => onSendBack(earlier)}
                                            sx={{ flexShrink: 0, cursor: "pointer", textTransform: "none", fontWeight: 700 }}
                                        >
                                            {sendingId === earlier.agentId ? "Sending…" : "Send back"}
                                        </Button>
                                    ) : null}
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

function ResultPanel({ future, targetLabel, assigned, skipped }) {
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
        </Box>
    );
}

function StatusChips({ summary, statuses, align = "flex-end" }) {
    const rows = Array.isArray(summary) ? summary : [];
    if (!rows.length) return null;
    return (
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, justifyContent: align, maxWidth: align === "flex-end" ? 280 : "none" }}>
            {rows.map((row) => (
                <Chip
                    key={row.status}
                    size="small"
                    label={`${row.count} ${row.status}`}
                    sx={{
                        height: 24,
                        fontWeight: 700,
                        ...getStatusChipSx(getStatusColor(row.status, statuses), { filled: true }),
                    }}
                />
            ))}
        </Box>
    );
}

function CountLine({ count, text, emphasis }) {
    return (
        <Box sx={{ display: "flex", alignItems: "baseline", gap: 1.5, py: 0.6 }}>
            <Typography
                sx={{
                    minWidth: 64,
                    fontWeight: 800,
                    fontSize: emphasis ? 28 : 22,
                    lineHeight: 1,
                    fontVariantNumeric: "tabular-nums",
                    color: emphasis ? "success.main" : "text.primary",
                }}
            >
                {count}
            </Typography>
            <Typography variant="body1" sx={{ fontWeight: emphasis ? 700 : 500 }}>
                {text}
            </Typography>
        </Box>
    );
}

// Shown under the agent dropdown. If this admin had some of these leads before,
// the choice here decides whether those leads are assigned again.
function AssignBreakdown({ name, selected, past, alreadyWith, willAssign, skip, done, loading, assignAgain, onAssignAgain, statusSummary, statusOptions }) {
    const pastText = past === 1
        ? `lead was assigned to ${name} before`
        : `leads were assigned to ${name} before`;
    const alreadyText = alreadyWith === 1
        ? `lead is already with ${name}`
        : `leads are already with ${name}`;
    const assignText = done
        ? `${willAssign === 1 ? "lead was" : "leads were"} assigned to ${name}`
        : `${willAssign === 1 ? "lead will be" : "leads will be"} assigned to ${name}`;

    return (
        <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, px: 2, py: 1.5 }}>
            <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 1.5 }}>
                <Typography variant="overline" sx={{ fontWeight: 700, letterSpacing: 0.8, color: "text.secondary" }}>
                    {name}
                </Typography>
                <StatusChips summary={statusSummary} statuses={statusOptions} />
            </Box>
            <CountLine count={selected} text={selected === 1 ? "lead selected" : "leads selected"} />
            {loading ? (
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, py: 1, color: "text.secondary" }}>
                    <CircularProgress size={16} color="inherit" />
                    <Typography variant="body2">Checking this admin’s history…</Typography>
                </Box>
            ) : (
                <>
                    {past > 0 && <CountLine count={past} text={pastText} />}
                    {alreadyWith > 0 && <CountLine count={alreadyWith} text={alreadyText} />}
                    <CountLine count={willAssign} text={assignText} emphasis />
                    {past > 0 && (
                        <Typography variant="body2" color="text.secondary" sx={{ pt: 0.5 }}>
                            {skip
                                ? `Those ${leadsText(past)} stay where they are.`
                                : `Those ${leadsText(past)} are included.`}
                        </Typography>
                    )}
                    {!done && (
                        <FormControlLabel
                            sx={{
                                alignItems: "flex-start",
                                ml: "-12px",
                                mr: 0,
                                mt: 0.5,
                                cursor: "pointer",
                                "& .MuiFormControlLabel-label": { pt: "10px" },
                            }}
                            control={
                                <Checkbox
                                    checked={assignAgain}
                                    onChange={(event) => onAssignAgain(event.target.checked)}
                                    sx={{ cursor: "pointer" }}
                                />
                            }
                            label={
                                <Box component="span" sx={{ display: "block" }}>
                                    <Typography component="span" variant="body2" sx={{ display: "block", fontWeight: 700 }}>
                                        Assign previously assigned leads again
                                    </Typography>
                                    <Typography component="span" variant="body2" color="text.secondary" sx={{ display: "block", mt: 0.25 }}>
                                        {assignAgain
                                            ? "Leads this admin had before will be assigned again too."
                                            : "Only leads that were never assigned to this admin will be assigned."}
                                    </Typography>
                                </Box>
                            }
                        />
                    )}
                </>
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
    const [skip, setSkip] = useState(true);
    const [leaveWithCurrent, setLeaveWithCurrent] = useState(false);
    const [finalStatus, setFinalStatus] = useState("");
    const [statusOptions, setStatusOptions] = useState(() => getCachedLeadStatuses() || []);
    const [assigning, setAssigning] = useState(false);
    const [summary, setSummary] = useState(null);
    const [preview, setPreview] = useState(null); // { key, data } or { key, error }
    const [owners, setOwners] = useState(null); // { ids, data } or { ids, error }
    const [historyTick, setHistoryTick] = useState(0);
    const [sendingBackId, setSendingBackId] = useState("");

    const reset = useCallback(() => {
        setAgentId("");
        setSkip(true);
        setLeaveWithCurrent(false);
        setFinalStatus("");
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

    useEffect(() => {
        if (!open) return undefined;
        let cancelled = false;
        fetchLeadStatuses()
            .then((rows) => {
                if (!cancelled && Array.isArray(rows)) setStatusOptions(rows);
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, [open]);

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
    const previewKey = `${agentId}|${total}|${skip}|${leaveWithCurrent}`;

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

    // As soon as an admin is chosen: how many of these leads were ever assigned to that admin.
    // The checkbox only decides whether those leads are included. Nothing is changed here.
    useEffect(() => {
        if (!open || summary || !agentId || ids.length === 0) return undefined;
        let cancelled = false;
        const timer = setTimeout(async () => {
            try {
                const res = await assignLeadsApi(ids, agentId, {
                    skipPreviouslyAssigned: skip,
                    leaveWithCurrentAdmin: leaveWithCurrent,
                    dryRun: true,
                });
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
    }, [open, summary, agentId, skip, leaveWithCurrent, leadIds]);

    const ownersNow = owners && owners.ids === ids ? owners : null;
    const ownersState = !ownersNow ? "loading" : ownersNow.error ? "error" : "ready";

    // Only use a preview that was made for the current admin + box state.
    const current = preview && preview.key === previewKey ? preview : null;
    const checking = Boolean(chosen) && !current;
    const checkError = Boolean(chosen) && current?.error ? current.error : "";
    const pastCount = toCount(current?.data?.previouslyAssignedCount, toCount(current?.data?.skippedPreviousCount));
    const alreadyWithCount = toCount(current?.data?.alreadyAssignedCount);

    let shown = null;
    if (chosen && !summary && current?.data) {
            shown = {
            assigned: toCount(current.data.assignedCount),
            past: pastCount,
            alreadyWith: alreadyWithCount,
            skipped: skipItems(current.data.notAssignedByAdmin, chosen),
        };
    }
    const nothingToAssign = Boolean(shown) && shown.assigned === 0;
    const canAssign = Boolean(chosen) && total > 0 && !assigning && !checkError && !(skip && checking) && !nothingToAssign;
    const assignLabel = shown
        ? (shown.assigned > 0 ? `Assign ${leadsText(shown.assigned)}` : "Nothing to assign")
        : (!skip && chosen ? `Assign ${leadsText(total)}` : "Assign");
    const statusSummary = ownersNow?.data?.statusSummary || [];

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
            const res = await assignLeadsApi(ids, agentId, {
                skipPreviouslyAssigned: skip,
                leaveWithCurrentAdmin: leaveWithCurrent,
                status: finalStatus,
            });
            if (!res?.success) {
                toast.error(res?.msg || "Failed to assign leads");
                return;
            }
            const data = res.data || {};
            const assigned = toCount(data.assignedCount, toCount(data.modifiedCount));
            const label = adminLabel(data.agentName || fullName(chosen), data.agentRole || chosen.role);
            setSummary({
                assigned,
                past: toCount(data.skippedPreviousCount),
                alreadyWith: toCount(data.alreadyAssignedCount),
                skipMode: skip,
                total: toCount(data.selectedCount, total),
                label,
            });
            toast.success(finalStatus
                ? `${leadsText(assigned)} assigned to ${label} as ${finalStatus}`
                : `${leadsText(assigned)} assigned to ${label}`);
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
                        <AssignBreakdown
                            name={summary.label}
                            selected={summary.total}
                            past={summary.past}
                            alreadyWith={summary.alreadyWith}
                            willAssign={summary.assigned}
                            skip={summary.skipMode}
                            done
                        />
                    ) : (
                        <>
                            <CurrentOwners
                                state={ownersState}
                                owners={ownersNow?.data?.currentOwners || []}
                                unassigned={toCount(ownersNow?.data?.unassignedCount)}
                            />
                            {!chosen && statusSummary.length > 0 && (
                                <Box>
                                    <Typography variant="overline" sx={{ display: "block", mb: 0.75, fontWeight: 700, letterSpacing: 0.8, color: "text.secondary" }}>
                                        Status
                                    </Typography>
                                    <StatusChips summary={statusSummary} statuses={statusOptions} align="flex-start" />
                                </Box>
                            )}

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

                            {chosen && !checkError && (
                                <AssignBreakdown
                                    name={targetLabel}
                                    selected={total}
                                    past={pastCount}
                                    alreadyWith={alreadyWithCount}
                                    willAssign={shown ? shown.assigned : (skip ? 0 : total)}
                                    skip={skip}
                                    loading={checking}
                                    assignAgain={!skip}
                                    onAssignAgain={(checked) => setSkip(!checked)}
                                    statusSummary={statusSummary}
                                    statusOptions={statusOptions}
                                />
                            )}

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
                                        checked={leaveWithCurrent}
                                        onChange={(event) => setLeaveWithCurrent(event.target.checked)}
                                        sx={{ cursor: "pointer" }}
                                    />
                                }
                                label={
                                    <Box component="span" sx={{ display: "block" }}>
                                        <Typography component="span" variant="body2" sx={{ display: "block", fontWeight: 700 }}>
                                            Remove Previously Assigned
                                        </Typography>
                                        <Typography component="span" variant="body2" color="text.secondary" sx={{ display: "block", mt: 0.25 }}>
                                            Leave out leads that already have an admin.
                                        </Typography>
                                    </Box>
                                }
                            />

                            {leaveWithCurrent && (
                                <PreviousTree
                                    history={ownersNow?.data?.history || []}
                                    canSendBack={canSendBack}
                                    sendingId={sendingBackId}
                                    onSendBack={handleSendBack}
                                />
                            )}

                            {leaveWithCurrent && chosen && shown && (
                                <ResultPanel
                                    future
                                    targetLabel={targetLabel}
                                    assigned={shown.assigned}
                                    skipped={shown.skipped}
                                />
                            )}

                            {checkError && (
                                <Alert severity="error" variant="outlined">
                                    {checkError}
                                </Alert>
                            )}

                            {chosen && finalStatus && (
                                <Typography variant="body2" color="text.secondary">
                                    Leads that are assigned will be set to {finalStatus}. Leads that stay behind keep their status.
                                </Typography>
                            )}
                        </>
                    )}
                </Box>
            </DialogContent>

            <DialogActions sx={{ px: 3, pb: 2.5, pt: 1.5, gap: 1.5, flexWrap: "wrap" }}>
                {summary ? (
                    <Button variant="contained" onClick={onClose}>
                        Done
                    </Button>
                ) : (
                    <>
                        <Box sx={{ flex: "1 1 220px", minWidth: 200, maxWidth: 320, mr: "auto" }}>
                            {chosen && (
                                <TextField
                                    select
                                    fullWidth
                                    size="small"
                                    label="Set status (optional)"
                                    value={finalStatus}
                                    onChange={(event) => setFinalStatus(event.target.value)}
                                    disabled={assigning}
                                    InputLabelProps={{ shrink: true }}
                                    SelectProps={{
                                        displayEmpty: true,
                                        renderValue: (value) => value ? (
                                            <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}>
                                                <StatusDot color={getStatusColor(value, statusOptions)} />
                                                {value}
                                            </Box>
                                        ) : (
                                            <Box component="span" sx={{ color: "text.secondary" }}>
                                                Keep current status
                                            </Box>
                                        ),
                                        MenuProps: { PaperProps: { sx: { maxHeight: 320 } } },
                                    }}
                                    sx={{ "& .MuiSelect-select": { cursor: "pointer" } }}
                                >
                                    <MenuItem value="" sx={{ cursor: "pointer" }}>
                                        Keep current status
                                    </MenuItem>
                                    {statusOptions.map((status) => (
                                        <MenuItem key={status._id || status.label} value={status.label} sx={{ cursor: "pointer" }}>
                                            <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}>
                                                <StatusDot color={getStatusColor(status, statusOptions)} />
                                                {status.label}
                                            </Box>
                                        </MenuItem>
                                    ))}
                                </TextField>
                            )}
                        </Box>
                        <Box sx={{ display: "flex", gap: 1, ml: "auto" }}>
                            <Button onClick={handleClose} disabled={assigning}>
                                Cancel
                            </Button>
                            <Button variant="contained" onClick={handleAssign} disabled={!canAssign}>
                                {assigning ? <CircularProgress size={22} color="inherit" /> : assignLabel}
                            </Button>
                        </Box>
                    </>
                )}
            </DialogActions>
        </Dialog>
    );
}
