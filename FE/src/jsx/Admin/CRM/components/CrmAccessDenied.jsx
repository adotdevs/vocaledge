import React from "react";
import { Box, Button, Paper, Typography } from "@mui/material";
import { LockOutlined } from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import { useSignOut } from "react-auth-kit";
import { toast } from "react-toastify";
import { logoutApi } from "../../../../Api/Service";
import { endLiveSession } from "../../../../utils/endLiveSession";
import useLiveCrmUser from "../useLiveCrmUser";

const CrmAccessDenied = () => {
  const navigate = useNavigate();
  const signOut = useSignOut();
  const { can } = useLiveCrmUser();

  const handleLogout = async () => {
    try {
      const logout = await logoutApi();
      if (!logout.success) {
        toast.error(logout.msg || "Logout failed");
        return;
      }
      try {
        const { isBackendLocalhost, isElectronApp } = require("../../../../config/appConfig");
        if (isElectronApp() || isBackendLocalhost()) {
          localStorage.removeItem("jwttoken");
        }
      } catch (error) {
        localStorage.removeItem("jwttoken");
      }
      signOut();
      endLiveSession();
      navigate("/auth/login/crm");
    } catch (error) {
      toast.error(error?.message || "Logout failed");
    }
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: "background.default",
        p: 3,
      }}
    >
      <Paper elevation={3} sx={{ maxWidth: 440, width: "100%", p: 4, textAlign: "center", borderRadius: 3 }}>
        <LockOutlined sx={{ fontSize: 48, color: "text.secondary", mb: 1 }} />
        <Typography variant="h5" fontWeight={700} gutterBottom>
          No CRM access
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          CRM is turned off for this account. A super admin can turn on Open CRM in your permissions.
        </Typography>
        {can("canAccessChat") && (
          <Button variant="contained" sx={{ mr: 1 }} onClick={() => navigate("/admin/crm/chat/chats")}>
            Open chat
          </Button>
        )}
        <Button variant="outlined" onClick={handleLogout}>
          Log out
        </Button>
      </Paper>
    </Box>
  );
};

export default CrmAccessDenied;
