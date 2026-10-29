import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useAuthUser } from "react-auth-kit";
import useLiveCrmUser from "../useLiveCrmUser";
import { subscribeChatEvents } from "../chatEvents";
import LiveStatusDot from "./LiveStatusDot";
import { CheckCircleOutline, Close, NotificationsNone, Send } from "@mui/icons-material";
import { deliveredChatApi, flagChatConversationApi, getChatUnreadPopupsApi, seenChatApi, sendChatMessageApi } from "../../../../Api/Service";
import { playNotificationSound } from "../notificationSound";
import "../Chat.css";

const personId = (value) => {
  if (value == null || value === "") return "";
  if (typeof value === "object") return personId(value._id || value.id || "");
  return String(value);
};

const AVATAR_GRADIENTS = [
  "linear-gradient(135deg, #6366f1 0%, #4338ca 100%)",
  "linear-gradient(135deg, #0ea5e9 0%, #0369a1 100%)",
  "linear-gradient(135deg, #10b981 0%, #047857 100%)",
  "linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)",
  "linear-gradient(135deg, #f43f5e 0%, #be123c 100%)",
  "linear-gradient(135deg, #f59e0b 0%, #b45309 100%)",
  "linear-gradient(135deg, #06b6d4 0%, #0e7490 100%)",
  "linear-gradient(135deg, #ec4899 0%, #be185d 100%)",
];

const getAvatarStyle = (seed) => {
  const key = String(seed || "notification");
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % AVATAR_GRADIENTS.length;
  return { background: AVATAR_GRADIENTS[idx] };
};

const timeAgo = (value) => {
  if (!value) return "now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "now";
  const diff = Date.now() - date.getTime();
  if (diff < 60 * 1000) return "now";
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

const attachmentLabel = (message) => {
  const files = Array.isArray(message?.attachments) ? message.attachments : [];
  if (!files.length) return "";
  const first = files[0]?.originalName || (files[0]?.resourceType === "image" ? "Photo" : "File");
  return files.length > 1 ? `${first} +${files.length - 1}` : first;
};

const PopupCard = ({ message, onClose, onOpen }) => {
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [imgError, setImgError] = useState(false);
  const name = message.senderName || "New message";
  const initial = name.trim().slice(0, 1).toUpperCase() || "M";
  const file = attachmentLabel(message);
  const preview = (message.body || "").replace(/\s+/g, " ").trim() || (file ? `Sent ${file}` : "New message");
  const avatarUrl =
    !imgError &&
    (message.senderAvatar ||
      message.avatar?.url ||
      (typeof message.avatar === "string" ? message.avatar : "") ||
      message.sender?.avatar?.url ||
      (typeof message.sender?.avatar === "string" ? message.sender?.avatar : "") ||
      "");

  const sendReply = async (event) => {
    event.preventDefault();
    const text = reply.trim();
    if (!text || !message.conversationId || busy) return;
    setBusy(true);
    const form = new FormData();
    form.append("conversationId", message.conversationId);
    form.append("body", text);
    const response = await sendChatMessageApi(form);
    setBusy(false);
    if (response?.success) onClose();
  };

  const markRead = async () => {
    if (message.conversationId) await seenChatApi(message.conversationId);
    onClose();
  };

  const mute = async () => {
    if (message.conversationId) await flagChatConversationApi(message.conversationId, "mutedBy");
    onClose();
  };

  return (
    <article className="crm-chat-popup">
      <header className="crm-chat-popup-top">
        <span className="crm-chat-popup-app" aria-hidden="true">V</span>
        <span className="crm-chat-popup-appname">Vocaledge <i>•</i> {timeAgo(message.createdAt)}</span>
        <button type="button" className="crm-chat-popup-x" aria-label="Close" onClick={onClose}><Close style={{ fontSize: 16 }} /></button>
      </header>
      <button type="button" className="crm-chat-popup-msg" onClick={() => onOpen(message)}>
        <span
          className="crm-chat-popup-avatar"
          style={avatarUrl ? { background: "transparent" } : getAvatarStyle(message.senderId || name)}
          aria-hidden="true"
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              className="crm-chat-popup-avatar-img"
              onError={() => setImgError(true)}
            />
          ) : (
            initial
          )}
        </span>
        <span className="crm-chat-popup-text">
          <strong>{name}</strong>
          <em>{preview.slice(0, 140)}</em>
        </span>
      </button>
      <form className="crm-chat-popup-reply" onSubmit={sendReply}>
        <input value={reply} placeholder="Reply..." onChange={(event) => setReply(event.target.value)} />
        <button type="submit" aria-label="Send reply" disabled={busy || !reply.trim()}><Send /></button>
      </form>
      <div className="crm-chat-popup-actions">
        <button type="button" onClick={markRead}><CheckCircleOutline /> Mark as read</button>
        <button type="button" onClick={mute}><NotificationsNone /> Mute</button>
      </div>
    </article>
  );
};

const ChatNotifier = () => {
  const authUser = useAuthUser();
  const { can, role, user } = useLiveCrmUser();
  const navigate = useNavigate();
  const [popups, setPopups] = useState([]);
  const allowed = role === "superadmin" || role === "manager" || can("canAccessChat");
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
        <PopupCard
          key={message._id}
          message={message}
          onClose={() => closePopup(message._id)}
          onOpen={openChat}
        />
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
