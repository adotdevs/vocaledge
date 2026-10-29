import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useAuthUser } from "react-auth-kit";
import { restartChatStream, startChatStream, subscribeChatStatus } from "../chatEvents";
import { getLiveSocket, subscribeSocketStatus } from "../../../../utils/liveSocket";
import "../Chat.css";

const CRM_ROLES = new Set(["superadmin", "admin", "subadmin", "manager"]);

const LiveStatusDot = ({ variant = "fixed" }) => {
  const authUser = useAuthUser();
  const role = authUser()?.user?.role || "";
  const [chat, setChat] = useState({ state: "offline", detail: "Not connected" });
  const [socket, setSocket] = useState({ state: "offline", detail: "Not connected" });

  useEffect(() => {
    if (!CRM_ROLES.has(role)) return undefined;
    startChatStream();
    getLiveSocket();
    const stopChat = subscribeChatStatus(setChat);
    const stopSocket = subscribeSocketStatus(setSocket);
    return () => {
      stopChat();
      stopSocket();
    };
  }, [role]);

  if (!CRM_ROLES.has(role)) return null;

  const state = chat.state === "open" ? "open" : chat.state === "connecting" ? "connecting" : "offline";
  const label = state === "open" ? "Live" : state === "connecting" ? "Connecting" : "Offline";
  const pill = (
    <button
      type="button"
      className={`crm-live-pill is-${state} ${variant === "inline" ? "is-inline" : ""}`}
      title={`Chat: ${chat.detail}. Socket: ${socket.detail}. Click to reconnect.`}
      onClick={() => {
        if (chat.state === "open") return;
        restartChatStream();
        getLiveSocket();
      }}
    >
      <i />
      <span>{label}</span>
    </button>
  );

  if (variant === "inline") return pill;
  if (typeof window !== "undefined" && window.location.pathname.startsWith("/admin/crm")) {
    return null;
  }
  return createPortal(pill, document.body);
};

export default LiveStatusDot;
