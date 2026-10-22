import React, { useMemo } from "react";
import {
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Switch,
  Typography,
  CircularProgress,
} from "@mui/material";
import { Close } from "@mui/icons-material";
import { isPermissionOn, permissionsForRole } from "../crmPermissions";

const CrmPermissionsDialog = ({ user, open, onClose, onToggle, savingKey }) => {
  const items = useMemo(() => permissionsForRole(user?.role), [user?.role]);
  const groups = useMemo(() => {
    const order = [];
    items.forEach((item) => {
      if (!order.includes(item.group)) order.push(item.group);
    });
    return order.map((group) => ({
      group,
      items: items.filter((item) => item.group === group),
    }));
  }, [items]);

  if (!user) return null;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", pr: 1 }}>
        <Box>
          <Typography variant="h6">Permissions</Typography>
          <Typography variant="body2" color="text.secondary">
            {user.firstName} {user.lastName} · {user.role}
          </Typography>
        </Box>
        <IconButton onClick={onClose} aria-label="Close">
          <Close />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Each switch is one action. Comments and status changes stay on until you turn them off.
        </Typography>
        {groups.map((section) => (
          <Box key={section.group} sx={{ mb: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>{section.group}</Typography>
            {section.items.map((item) => {
              const saving = savingKey === item.key;
              return (
                <Box
                  key={item.key}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 2,
                    py: 1,
                    borderBottom: "1px solid",
                    borderColor: "divider",
                  }}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={600}>{item.label}</Typography>
                    <Typography variant="caption" color="text.secondary">{item.detail}</Typography>
                  </Box>
                  {saving ? (
                    <CircularProgress size={22} />
                  ) : (
                    <Switch
                      checked={isPermissionOn(user, item.key)}
                      onChange={(event) => onToggle(user._id, item.key, event.target.checked)}
                    />
                  )}
                </Box>
              );
            })}
            <Divider sx={{ mt: 1 }} />
          </Box>
        ))}
      </DialogContent>
    </Dialog>
  );
};

export default CrmPermissionsDialog;
