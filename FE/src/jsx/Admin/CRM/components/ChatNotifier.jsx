import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useAuthUser } from "react-auth-kit";
import useLiveCrmUser from "../useLiveCrmUser";
import { subscribeChatEvents } from "../chatEvents";
import LiveStatusDot from "./LiveStatusDot";
import { deliveredChatApi, getChatUnreadPopupsApi } from "../../../../Api/Service";
import { playNotificationSound } from "../notificationSound";
import "../Chat.css";

const personId = (value) => {
  if (value == null || value === "") return "";
  if (typeof value === "object") return personId(value._id || value.id || "");
  return String(value);
};

const ChatNotifier = () => {
  const authUser = useAuthUser();
  const { can, role, ready, user } = useLiveCrmUser();
  const navigate = useNavigate();
  const [popups, setPopups] = useState([]);
  const allowed = role === "superadmin" || can("canAccessChat");
  const crmRole = ["superadmin", "admin", "subadmin", "manager"].includes(role);
  const myIdRef = useRef("");
  const heardRef = useRef(new Set());
  myIdRef.current = personId(authUser()?.user?._id || user?._id);

  const pushPopup = (message, options = {}) => {
    if (!message?._id) return;
    const senderId = personId(message.senderId);
    if (senderId && myIdRef.current && senderId === myIdRef.current) return;
    const viewing = personId(message.conversationId) === personId(window.__crmActiveChat)
      && window.location.pathname.startsWith("/admin/crm/chat")
      && document.visibilityState === "visible";
    const id = String(message._id);
    if (heardRef.current.has(id)) return;
    heardRef.current.add(id);
    if (options.sound) playNotificationSound(viewing ? "message" : "unseen");
    if (viewing) return;
    deliveredChatApi([message._id]);
    setPopups((current) => {
      if (current.some((item) => String(item._id) === String(message._id))) return current;
      return [...current, message].slice(-6);
    });
  };

  useEffect(() => {
    const onIncoming = (event) => pushPopup(event.detail, { sound: true });
    const clearOpenChat = () => {
      if (document.visibilityState !== "visible") return;
      const openId = personId(window.__crmActiveChat);
      if (!openId || !window.location.pathname.startsWith("/admin/crm/chat")) return;
      setPopups((current) => current.filter((item) => personId(item.conversationId) !== openId));
    };
    window.addEventListener("crm-chat-incoming", onIncoming);
    document.addEventListener("visibilitychange", clearOpenChat);
    window.addEventListener("focus", clearOpenChat);
    return () => {
      window.removeEventListener("crm-chat-incoming", onIncoming);
      document.removeEventListener("visibilitychange", clearOpenChat);
      window.removeEventListener("focus", clearOpenChat);
    };
  }, []);

  useEffect(() => {
    if (!crmRole) return undefined;
    let cancelled = false;
    if (allowed) getChatUnreadPopupsApi().then((response) => {
      if (cancelled || !response?.success) return;
      (response.messages || []).forEach((message) => pushPopup(message));
    }).catch(() => {});
    const unsubscribe = subscribeChatEvents({
      "chat.message.created": (payload) => pushPopup(payload?.message, { sound: true }),
      "chat.notification.created": (payload) => pushPopup(payload?.message, { sound: true }),
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [crmRole, allowed]);

  const closePopup = (id) => setPopups((current) => current.filter((item) => String(item._id) !== String(id)));

  const openChat = (message) => {
    closePopup(message._id);
    navigate(message.conversationId ? `/admin/crm/chat/chats/${message.conversationId}` : "/admin/crm/chat/chats");
  };

  const popupLayer = popups.length ? createPortal(
    <div className="crm-chat-popups">
      {popups.map((message) => (
        <article className="crm-chat-popup" key={message._id}>
          <header>
            <strong>{message.senderName || "New message"}</strong>
            <button type="button" aria-label="Close" onClick={() => closePopup(message._id)}>×</button>
          </header>
          <p>{(message.body || "Sent an attachment").slice(0, 140)}</p>
          <button type="button" onClick={() => openChat(message)}>Open chat</button>
        </article>
      ))}
    </div>,
    document.body
  ) : null;

  return (
    <>
      <LiveStatusDot />
      {popupLayer}
    </>
  );
};

export default ChatNotifier;
