import React, { useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider, RequireAuth, useSignOut } from "react-auth-kit";
import UseApplyBodyStyles from "./hookUpdate.js";
import ScrollToTop from "./top.js";
import axiosService from "../Api/axiosService.js";
import UserOnlineStatus from "./userOnlineStatus.js";
import LoginPage from "../jsx/Admin/CRM/Login.js";
import LeadsPage from "../jsx/Admin/CRM/leads.js";
import RecycleBin from "../jsx/Admin/CRM/RecycleBin.jsx";
import EmailQueue from "../jsx/Admin/CRM/EmailQueue.jsx";
import LeadStream from "../jsx/Admin/CRM/LeadStream.jsx";

import CallDashboard from "../jsx/Admin/CRM/CallDashboard.jsx";
import Error404 from "../jsx/pages/error/Error404";
function AppRouter() {
  const signOut = useSignOut();

  useEffect(() => {
    const interceptor = axiosService.interceptors.response.use(

      (response) => {
        return response
      },
      (error) => {
        if (error.response?.status === 401 || error.response?.status === 405) {
          signOut();                    // clear react-auth-kit session
          localStorage.removeItem("token");
          localStorage.removeItem("authToken");
          localStorage.removeItem("authUser");
          localStorage.removeItem("auth_state");
          window.location.href = "/auth/login";
        }
        return Promise.reject(error);
      }
    );

    return () => {
      axiosService.interceptors.response.eject(interceptor);
    };
  }, [signOut]);
}
export default function Router() {

  return (
    <AuthProvider authType={"cookie"}
      authName={"_auth"}
      cookieDomain={
        ".vocaledge.io"
      }
      cookieSecure={window.location.protocol === "https:"} >
      <BrowserRouter basename="/admin">
        <UseApplyBodyStyles />
        <ScrollToTop />
        <UserOnlineStatus />
        <AppRouter />
        <Routes>
          <Route index path="/" element={<LoginPage />} />
          <Route path="/auth/login/crm" element={<LoginPage />} />
          <Route
            path="/admin/dashboard/crm"
            element={
              <RequireAuth loginPath={"/auth/login/crm"}>
                <LeadsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/admin/dashboard/crm/recycle-bin"
            element={
              <RequireAuth loginPath={"/auth/login/crm"}>
                <RecycleBin />
              </RequireAuth>
            }
          />
           <Route
            path="/admin/crm/call-dashboard"
            element={
              <RequireAuth loginPath={"/auth/login/crm"}>
                <CallDashboard />
              </RequireAuth>
            }
          />
          <Route
            path="/admin/crm/failed-emails"
            element={
              <RequireAuth loginPath={"/auth/login/crm"}>
                <EmailQueue />
              </RequireAuth>
            }
          />
          <Route
            path="/admin/crm/email-queue"
            element={
              <RequireAuth loginPath={"/auth/login/crm"}>
                <EmailQueue />
              </RequireAuth>
            }
          />
          <Route
            path="/admin/crm/lead/:leadId/stream"
            element={
              <RequireAuth loginPath={"/auth/login/crm"}>
                <LeadStream />
              </RequireAuth>
            }
          />
          <Route path="*" element={<Error404 />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider >
  );
}
