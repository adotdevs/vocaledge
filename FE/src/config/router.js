import React, { useEffect } from "react";
import { BrowserRouter, HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { APP_CONFIG } from "./appConfig";
import { AuthProvider, RequireAuth, useSignOut } from "react-auth-kit";
import ScrollToTop from "./top.js";
import axiosService from "../Api/axiosService.js";
import UserOnlineStatus from "./userOnlineStatus.js";

// CRM Imports
import LoginPage from "../jsx/Admin/CRM/Login.js";

import DarkModeProvider from "../context/DarkModeContext";
import LeadsPage from "../jsx/Admin/CRM/leads.js";
import RecycleBin from "../jsx/Admin/CRM/RecycleBin.jsx";
import EmailQueue from "../jsx/Admin/CRM/EmailQueue.jsx";
import LeadStream from "../jsx/Admin/CRM/LeadStream.jsx";
import CallDashboard from "../jsx/Admin/CRM/CallDashboard.jsx";
import PendingCallsQueue from "../jsx/Admin/CRM/PendingCallsQueue.jsx";
import FailedCalls from "../jsx/Admin/CRM/FailedCalls.jsx";
import NoAnswerCalls from "../jsx/Admin/CRM/NoAnswerCalls.jsx";
import CancelledCalls from "../jsx/Admin/CRM/CancelledCalls.jsx";
import CrmProfile from "../jsx/Admin/CRM/Profile.jsx";
import AdminManagementCRM from "../jsx/Admin/CRM/AdminManagement.jsx";
import AIInstructions from "../jsx/Admin/CRM/AIInstructions.jsx";
import Reminders from "../jsx/Admin/CRM/Reminders.jsx";
import DocumentLibrary from "../jsx/Admin/CRM/DocumentLibrary.jsx";
import AdminReminderNotifier from "../jsx/Admin/CRM/components/AdminReminderNotifier";
import StaffMessagePopup from "../jsx/Admin/CRM/components/StaffMessagePopup";
import ChatNotifier from "../jsx/Admin/CRM/components/ChatNotifier";
import StaffMessages from "../jsx/Admin/CRM/StaffMessages";
import ChatPage from "../jsx/Admin/CRM/Chat";

import Error404 from "../jsx/pages/error/Error404";

// Detect if running in Electron
const isElectron = () => {
  return (
    typeof window !== 'undefined' &&
    (window.electron?.isElectron === true ||
      window.navigator?.userAgent?.includes('Electron') ||
      (window.process && window.process.type === 'renderer') ||
      window.location.protocol === 'file:')
  );
};

function AppRouter() {
  const signOut = useSignOut();

  useEffect(() => {
    const interceptor = axiosService.interceptors.response.use(
      (response) => {
        return response;
      },
      (error) => {
        if (error.response?.status === 401 || error.response?.status === 405) {
          signOut(); // clear react-auth-kit session
          localStorage.removeItem("token");
          localStorage.removeItem("authToken");
          localStorage.removeItem("authUser");
          localStorage.removeItem("auth_state");
          localStorage.removeItem("jwttoken");
          window.location.href = "/auth/login/crm";
        }
        return Promise.reject(error);
      }
    );

    return () => {
      axiosService.interceptors.response.eject(interceptor);
    };
  }, [signOut]);

  return null;
}

export default function Router() {
  // Use HashRouter for Electron, BrowserRouter for web
  const RouterComponent = isElectron() ? HashRouter : BrowserRouter;

  // Compute cookie settings
  const isElectronEnv = isElectron();
  let cookieDomain = 'localhost'; // Default fallback
  let cookieSecure = false;

  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname || 'localhost';
    const isLocalhost = !hostname || hostname === 'localhost' || hostname.includes('localhost') || hostname === '127.0.0.1';
    const isHttps = window.location.protocol === "https:";
    const isFileProtocol = window.location.protocol === "file:";

    // For Electron (file:// protocol): Use API domain for cookies
    if (isElectronEnv || isFileProtocol) {
      cookieDomain = '.vocaledge.io';
      cookieSecure = true;
    } else if (isLocalhost) {
      cookieDomain = hostname || 'localhost';
      cookieSecure = false;
    } else if (APP_CONFIG?.COOKIE_DOMAIN) {
      cookieDomain = APP_CONFIG.COOKIE_DOMAIN;
      cookieSecure = isHttps;
    } else {
      cookieDomain = hostname;
      cookieSecure = isHttps;
    }
  }

  // Ensure cookieSecure is always a boolean and cookieDomain is always a non-empty string
  cookieSecure = Boolean(cookieSecure);
  cookieDomain = cookieDomain || 'localhost';

  return (
    <AuthProvider
      authType="cookie"
      authName="_auth"
      cookieDomain={cookieDomain}
      cookieSecure={cookieSecure}
    >

      <DarkModeProvider>
        <RouterComponent>
          <AdminReminderNotifier />
          <StaffMessagePopup />
          <ChatNotifier />
          <ScrollToTop />
          <UserOnlineStatus />
          <AppRouter />
          <Routes>
            {/* Auth & Default Landing Routes */}
            <Route index path="/" element={<LoginPage />} />
            <Route path="/auth/login" element={<LoginPage />} />
            <Route path="/auth/login/crm" element={<LoginPage />} />
            <Route path="/admin" element={<Navigate to="/admin/dashboard/crm" replace />} />
            <Route path="/admin/dashboard" element={<Navigate to="/admin/dashboard/crm" replace />} />
            <Route path="/dashboard" element={<Navigate to="/admin/dashboard/crm" replace />} />

            {/* CRM Main & Leads Routes */}
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
              path="/admin/crm/lead/:leadId/stream"
              element={
                <RequireAuth loginPath={"/auth/login/crm"}>
                  <LeadStream />
                </RequireAuth>
              }
            />

            {/* CRM Email Queue Routes */}
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

            {/* CRM Reminders & Documents */}
            <Route
              path="/admin/crm/reminders"
              element={
                <RequireAuth loginPath={"/auth/login/crm"}>
                  <Reminders />
                </RequireAuth>
              }
            />
            <Route
              path="/admin/crm/documents"
              element={
                <RequireAuth loginPath={"/auth/login/crm"}>
                  <DocumentLibrary />
                </RequireAuth>
              }
            />
            <Route
              path="/admin/crm/chat/:tab?/:conversationId?"
              element={
                <RequireAuth loginPath={"/auth/login/crm"}>
                  <ChatPage />
                </RequireAuth>
              }
            />
            <Route
              path="/admin/crm/messages"
              element={
                <RequireAuth loginPath={"/auth/login/crm"}>
                  <StaffMessages />
                </RequireAuth>
              }
            />

            {/* CRM VoIP & Call Management Routes */}
            <Route
              path="/admin/crm/call-dashboard"
              element={
                <RequireAuth loginPath={"/auth/login/crm"}>
                  <CallDashboard />
                </RequireAuth>
              }
            />
            <Route
              path="/admin/crm/pending-calls"
              element={
                <RequireAuth loginPath={"/auth/login/crm"}>
                  <PendingCallsQueue />
                </RequireAuth>
              }
            />
            <Route
              path="/admin/crm/failed-calls"
              element={
                <RequireAuth loginPath={"/auth/login/crm"}>
                  <FailedCalls />
                </RequireAuth>
              }
            />
            <Route
              path="/admin/crm/no-answer-calls"
              element={
                <RequireAuth loginPath={"/auth/login/crm"}>
                  <NoAnswerCalls />
                </RequireAuth>
              }
            />
            <Route
              path="/admin/crm/cancelled-calls"
              element={
                <RequireAuth loginPath={"/auth/login/crm"}>
                  <CancelledCalls />
                </RequireAuth>
              }
            />

            {/* CRM Admin, Profile & AI Settings */}
            <Route
              path="/admin/crm/ai-instructions"
              element={
                <RequireAuth loginPath={"/auth/login/crm"}>
                  <AIInstructions />
                </RequireAuth>
              }
            />
            <Route
              path="/admin/crm/profile"
              element={
                <RequireAuth loginPath={"/auth/login/crm"}>
                  <CrmProfile />
                </RequireAuth>
              }
            />
            <Route
              path="/admin/crm/admin-management"
              element={
                <RequireAuth loginPath={"/auth/login/crm"}>
                  <AdminManagementCRM />
                </RequireAuth>
              }
            />

            {/* Fallback 404 Route */}
            <Route path="*" element={<Error404 />} />
          </Routes>
        </RouterComponent>
      </DarkModeProvider>
    </AuthProvider>
  );
}
