import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowBack,
  AttachFile,
  Call,
  Close,
  ContentCopy,
  DeleteForever,
  DeleteOutline,
  DeleteSweep,
  Done,
  DoneAll,
  Edit,
  EmojiEmotions,
  ForumOutlined,
  History,
  InfoOutlined,
  MailOutline,
  MoreVert,
  NotificationsOff,
  Phone,
  PushPin,
  RestoreFromTrash,
  Search,
  Send,
  Videocam,
} from "@mui/icons-material";
import { useAuthUser } from "react-auth-kit";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import Sidebar from "./Sidebar";
import useLiveCrmUser from "./useLiveCrmUser";
import { subscribeChatEvents } from "./chatEvents";
import { bindVoiceIdentity, listenForVoice, startVoiceCall } from "./voiceCall";
import LiveStatusDot from "./components/LiveStatusDot";
import "./Chat.css";
import {
  deleteChatMessageApi,
  deliveredChatApi,
  editChatMessageApi,
  flagChatConversationApi,
  getAdminChatConversationsApi,
  getChatAgentsApi,
  getChatConversationsApi,
  getChatMessagesApi,
  getChatRecycleApi,
  getChatCallsApi,
  clearChatRecycleConversationApi,
  hideChatMessageApi,
  openChatApi,
  reactChatMessageApi,
  removeChatConversationApi,
  restoreChatMessageApi,
  deleteChatRecycleMessageApi,
  seenChatApi,
  typingChatApi,
  sendChatMessageApi,
} from "../../../Api/Service";

const EMOJIS = ["😀", "😁", "😂", "😊", "😍", "😎", "🤔", "😢", "🙏", "👍", "👎", "👏", "🔥", "🎉", "✅", "❤️", "💬", "📎", "⭐", "🚀"];
const CHAT_TABS = ["chats", "people", "unread"];
const chatPath = (tab, conversationId) => {
  const safeTab = tab === "monitor" || CHAT_TABS.includes(tab) ? tab : "chats";
  return conversationId ? `/admin/crm/chat/${safeTab}/${conversationId}` : `/admin/crm/chat/${safeTab}`;
};
const nameOf = (user) => {
  const full = `${user?.firstName || ""} ${user?.lastName || ""}`.trim();
  return full || user?.name || "Agent";
};
const initials = (user) => nameOf(user).slice(0, 1).toUpperCase();

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

const getAvatarStyle = (user) => {
  const key = String(user?._id || user?.id || nameOf(user) || "crm");
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % AVATAR_GRADIENTS.length;
  return { background: AVATAR_GRADIENTS[idx] };
};

const ChatAvatar = ({ person, style, className = "", showOnline = true }) => {
  const [erroredSrc, setErroredSrc] = useState(null);
  const rawUrl =
    person?.avatar?.url ||
    (typeof person?.avatar === "string" ? person.avatar : "") ||
    person?.profilePic ||
    "";
  const avatarUrl = rawUrl && erroredSrc !== rawUrl ? rawUrl : "";
  const bgStyle = avatarUrl ? { background: "transparent" } : getAvatarStyle(person);
  return (
    <div className={`crm-chat-avatar ${className}`.trim()} style={style}>
      <div className="crm-chat-avatar-inner" style={bgStyle}>
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={nameOf(person)}
            className="crm-chat-avatar-img"
            onError={() => setErroredSrc(rawUrl)}
          />
        ) : (
          initials(person)
        )}
      </div>
      {showOnline && person?.online && <i className="dot pulse" />}
    </div>
  );
};

const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;
const URL_REGEX = /(https?:\/\/[^\s]+)/g;

const parseLeadLine = (line) => {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const emailMatch = trimmed.match(EMAIL_REGEX);
  if (!emailMatch) return null;

  const email = emailMatch[0];
  const withoutEmail = trimmed.replace(email, "").trim();
  const phoneMatch = withoutEmail.match(/(?:\+?\d[\d\s\-().]{6,16}\d)/);
  const phone = phoneMatch ? phoneMatch[0].trim() : "";
  const remainder = withoutEmail.replace(phone, "").trim().replace(/\s+/g, " ");

  return {
    raw: trimmed,
    email,
    phone,
    nameOrDetails: remainder,
  };
};

const LeadLine = ({ lead }) => (
  <div className="crm-lead-line">
    {lead.nameOrDetails && <span className="crm-lead-name">{lead.nameOrDetails}</span>}
    <div className="crm-lead-meta">
      <a href={`mailto:${lead.email}`} className="crm-lead-link email" onClick={(e) => e.stopPropagation()}>
        <MailOutline style={{ fontSize: 13 }} />
        <span>{lead.email}</span>
      </a>
      {lead.phone && (
        <a href={`tel:${lead.phone}`} className="crm-lead-link phone" onClick={(e) => e.stopPropagation()}>
          <Call style={{ fontSize: 13 }} />
          <span>{lead.phone}</span>
        </a>
      )}
    </div>
  </div>
);

const renderFormattedText = (text) => {
  const parts = text.split(URL_REGEX);
  return parts.map((part, i) => {
    if (part.match(URL_REGEX)) {
      return (
        <a key={i} href={part} target="_blank" rel="noopener noreferrer">
          {part}
        </a>
      );
    }
    return part;
  });
};

const MessageBody = ({ body }) => {
  if (!body) return null;
  const lines = body.split("\n");
  const hasLeads = lines.some((l) => parseLeadLine(l));

  if (hasLeads) {
    return (
      <div className="crm-lead-text-list">
        {lines.map((line, idx) => {
          const lead = parseLeadLine(line);
          if (!line.trim()) return null;
          if (lead) {
            return <LeadLine key={idx} lead={lead} />;
          }
          return <div key={idx} className="crm-lead-text-plain">{renderFormattedText(line)}</div>;
        })}
      </div>
    );
  }

  return <p>{renderFormattedText(body)}</p>;
};

const systemTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

const asSystemDate = (value) => {
  if (value == null || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const text = String(value).trim();
  const hasZone = /(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(text);
  const normalized = hasZone ? text : `${text.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
};

const listTime = (value) => {
  const date = asSystemDate(value);
  if (!date) return "";
  const now = new Date();
  if (sameSystemDay(date, now)) return formatClock(date);
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (sameSystemDay(date, yesterday)) return "Yesterday";
  return new Intl.DateTimeFormat(undefined, { timeZone: systemTimeZone, month: "short", day: "numeric" }).format(date);
};

const formatClock = (value) => {
  const date = asSystemDate(value);
  if (!date) return "";
  return new Intl.DateTimeFormat(undefined, {
    timeZone: systemTimeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

const formatFull = (value) => {
  const date = asSystemDate(value);
  if (!date) return "Not yet";
  return new Intl.DateTimeFormat(undefined, {
    timeZone: systemTimeZone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
};

const sameSystemDay = (date, other) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: systemTimeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date)
  === new Intl.DateTimeFormat("en-CA", { timeZone: systemTimeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(other);

const lastSeenText = (user) => {
  if (!user) return "";
  if (user.online) return "Online";
  const date = asSystemDate(user.lastOnline);
  if (!date) return "Offline";
  const diff = Date.now() - date.getTime();
  if (diff < 60 * 1000) return "Last seen just now";
  if (diff < 60 * 60 * 1000) return `Last seen ${Math.max(1, Math.round(diff / 60000))} min ago`;
  const now = new Date();
  if (sameSystemDay(date, now)) return `Last seen today at ${formatClock(date)}`;
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (sameSystemDay(date, yesterday)) return `Last seen yesterday at ${formatClock(date)}`;
  const day = new Intl.DateTimeFormat(undefined, { timeZone: systemTimeZone, month: "short", day: "numeric" }).format(date);
  return `Last seen ${day} at ${formatClock(date)}`;
};

const dayLabel = (value) => {
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return "Today";
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString([], { month: "long", day: "numeric", year: "numeric" });
};

const WaTicks = ({ state }) => {
  if (state === "failed") return <span className="crm-chat-ticks failed" aria-label="Failed">!</span>;
  if (state === "sending") return <span className="crm-chat-ticks pending" aria-label="Sending" />;
  const seen = state === "seen";
  const delivered = state === "delivered" || seen;
  const Icon = delivered ? DoneAll : Done;
  const label = seen ? "Seen" : delivered ? "Delivered" : "Sent";
  return (
    <span className={`crm-chat-ticks ${seen ? "seen" : ""}`} aria-label={label} title={label}>
      <Icon />
    </span>
  );
};

const personId = (value) => {
  if (value == null || value === "") return "";
  if (typeof value === "object") return personId(value._id || value.id || "");
  return String(value);
};

const forViewer = (message, viewerId) => ({
  ...message,
  mine: personId(message?.senderId) === personId(viewerId),
});

const placeMessage = (prev, message, viewerId) => {
  const nextMessage = forViewer(message, viewerId);
  const same = (item) => {
    if (nextMessage._id && personId(item._id) === personId(nextMessage._id)) return true;
    if (nextMessage.clientKey && item.clientKey && item.clientKey === nextMessage.clientKey) return true;
    return item.state === "sending" && item.mine && nextMessage.mine && item.body === nextMessage.body;
  };
  const index = prev.findIndex(same);
  if (index === -1) return [...prev, nextMessage];
  return prev.reduce((list, item, itemIndex) => {
    if (itemIndex === index) list.push({ ...item, ...nextMessage, state: nextMessage.state || "sent" });
    else if (!same(item)) list.push(item);
    return list;
  }, []);
};

const reactionFirstName = (item, directory) => {
  const stored = (item.firstName || item.userName || "").trim().split(/\s+/)[0];
  if (stored && stored.toLowerCase() !== "agent") return stored;
  return directory.get(personId(item.userId)) || "";
};

const ListSkeleton = () => (
  <div className="crm-chat-skel-list" aria-hidden="true">
    {[78, 62, 84, 54, 70].map((width, index) => (
      <div className="crm-chat-skel" key={index}>
        <span className="av" />
        <span className="lines">
          <span className="ln" style={{ width: `${width}%` }} />
          <span className="ln short" />
        </span>
      </div>
    ))}
  </div>
);

const ThreadSkeleton = () => (
  <div className="crm-chat-thread-skel" aria-hidden="true">
    <span className="bub in" />
    <span className="bub out" />
    <span className="bub in short" />
    <span className="bub out mid" />
  </div>
);

const FileChip = ({ file, sending, uploadProgress, onRemove }) => {
  const image = file.type.startsWith("image/");
  const preview = useMemo(() => (image ? URL.createObjectURL(file) : ""), [file, image]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  return (
    <div className="crm-chat-file">
      {image ? <img src={preview} alt="" /> : <span className="crm-chat-file-kind">{(file.name.split(".").pop() || "file").slice(0, 4)}</span>}
      <span>
        <strong>{file.name}</strong>
        <em>{Math.max(1, Math.round(file.size / 1024))} KB{sending ? ` · ${uploadProgress}%` : ""}</em>
      </span>
      <button type="button" aria-label="Remove file" onClick={onRemove}><Close style={{ fontSize: 14 }} /></button>
    </div>
  );
};

const ChatPage = () => {
  const navigate = useNavigate();
  const { tab: tabParam, conversationId: routeConversationId } = useParams();
  const tab = tabParam === "monitor" ? "monitor" : (CHAT_TABS.includes(tabParam) ? tabParam : "chats");
  const authUser = useAuthUser();
  const signedIn = authUser()?.user || null;
  const { can, role, ready, user } = useLiveCrmUser();
  const myId = personId(signedIn?._id || user?._id);
  const allowed = role === "superadmin" || role === "manager" || can("canAccessChat");

  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [monitored, setMonitored] = useState([]);
  const [agents, setAgents] = useState([]);
  const [active, setActive] = useState(null);

  useEffect(() => {
    const currentMyId = personId(signedIn?._id || signedIn?.id || user?._id || user?.id);
    const myName = `${signedIn?.firstName || user?.firstName || ""} ${signedIn?.lastName || user?.lastName || ""}`.trim() || "Agent";
    if (currentMyId) bindVoiceIdentity(currentMyId, myName);
    listenForVoice();
  }, [signedIn?._id, signedIn?.id, signedIn?.firstName, signedIn?.lastName, user?._id, user?.id, user?.firstName, user?.lastName]);

  const startCall = useCallback((video = false) => {
    if (!active?.other?._id) return;
    const currentMyId = personId(signedIn?._id || signedIn?.id || user?._id || user?.id);
    const myName = `${signedIn?.firstName || user?.firstName || ""} ${signedIn?.lastName || user?.lastName || ""}`.trim() || "Agent";
    if (currentMyId) bindVoiceIdentity(currentMyId, myName);
    listenForVoice();
    const detail = {
      userId: String(active.other._id),
      name: nameOf(active.other),
      conversationId: String(active._id || ""),
      video: Boolean(video),
    };
    startVoiceCall(detail);
    window.dispatchEvent(new CustomEvent("crm-voice-start", { detail }));
  }, [active, signedIn, user]);
  const [messages, setMessages] = useState([]);
  const [unavailable, setUnavailable] = useState(false);
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState([]);
  const [search, setSearch] = useState("");
  const [typing, setTyping] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [menuId, setMenuId] = useState(null);
  const [info, setInfo] = useState(null);
  const [callLogOpen, setCallLogOpen] = useState(false);
  const [callLogs, setCallLogs] = useState([]);
  const [contactOpen, setContactOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState("");
  const [recycleOpen, setRecycleOpen] = useState(false);
  const [recycle, setRecycle] = useState([]);
  const [recycleSearch, setRecycleSearch] = useState("");
  const [recycleTab, setRecycleTab] = useState("all");
  const activeRef = useRef(null);
  const meRef = useRef(null);
  const bottomRef = useRef(null);
  const streamRef = useRef(null);
  const [unreadChip, setUnreadChip] = useState(null);
  const inputRef = useRef(null);
  const requestRef = useRef(0);
  const typingOut = useRef({ on: false, timer: null, ping: 0, id: "" });
  const typingHide = useRef(null);

  const adjustTextareaHeight = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    const minHeight = 24;
    const maxHeight = 140;
    const scrollH = el.scrollHeight;
    const nextHeight = Math.min(Math.max(scrollH, minHeight), maxHeight);
    el.style.height = `${nextHeight}px`;
    el.style.overflowY = scrollH > maxHeight ? "auto" : "hidden";
  }, []);

  useEffect(() => {
    adjustTextareaHeight();
  }, [draft, adjustTextareaHeight]);

  const loadLists = useCallback(async () => {
    setError("");
    const requests = [getChatConversationsApi(), getChatAgentsApi("")];
    if (role === "superadmin") requests.push(getAdminChatConversationsApi());
    const [chats, people, all] = await Promise.all(requests);
    if (!chats.success && !people.success) setError(chats.msg || people.msg || "Could not load chat");
    setConversations(chats.conversations || []);
    setAgents(people.agents || []);
    if (role === "superadmin") setMonitored(all?.conversations || []);
    setLoadingList(false);
  }, [role]);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const prevHeight = document.body.style.height;
    document.body.style.overflow = "hidden";
    document.body.style.height = "100vh";
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.height = prevHeight;
    };
  }, []);

  const openThread = useCallback(async (conversation, person, destinationTab) => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    const knownId = conversation?._id ? String(conversation._id) : "";
    openingIdRef.current = knownId || "pending";
    if (knownId) {
      const earlyPath = chatPath(destinationTab || tab, knownId);
      if (window.location.pathname !== earlyPath) navigate(earlyPath);
    }
    activeRef.current = knownId || null;
    setActive(conversation || { other: person, pendingUserId: person?._id });
    setLoadingThread(true);
    setInfo(null);
    setContactOpen(false);
    const readOnly = destinationTab === "monitor" || tab === "monitor";
    const response = conversation?._id
      ? await getChatMessagesApi(conversation._id, readOnly ? { admin: "1" } : {})
      : await openChatApi(person._id);
    if (requestRef.current !== requestId) return;
    if (!response.success) {
      openingIdRef.current = "";
      setLoadingThread(false);
      toast.error(response.msg || "Could not open this chat");
      return;
    }
    const conversationId = String(response.conversationId || conversation._id || "");
    openingIdRef.current = conversationId;
    activeRef.current = conversationId;
    setActive({
      _id: conversationId,
      other: response.other || conversation?.other || person,
      participants: conversation?.participants || [],
      readOnly,
      messagingUnavailable: readOnly ? false : response.messagingUnavailable,
      lastMessagePreview: conversation?.lastMessagePreview,
    });
    const fresh = (response.messages || []).map((message) => forViewer(message, meRef.current));
    const unread = fresh.filter((message) => !message.mine && !message.seenByMe && !message.deleted);
    const lastUnread = unread[unread.length - 1];
    setUnreadChip(lastUnread ? { id: String(lastUnread._id), count: unread.length } : null);
    setMessages(fresh);
    setUnavailable(Boolean(response.messagingUnavailable));
    setLoadingThread(false);
    if (!readOnly && (conversation?._id || response.conversationId) && document.visibilityState === "visible") seenChatApi(conversationId);
    const nextPath = chatPath(destinationTab || tab, conversationId);
    if (conversationId && window.location.pathname !== nextPath) navigate(nextPath);
    loadLists();
  }, [navigate, tab, loadLists]);

  useEffect(() => {
    if (!ready || !allowed) return;
    if (tabParam === "monitor" && role !== "superadmin") navigate(chatPath("chats"), { replace: true });
    else if (tabParam && tabParam !== "monitor" && !CHAT_TABS.includes(tabParam)) navigate(chatPath("chats"), { replace: true });
  }, [ready, allowed, tabParam, navigate, role]);

  const routeIdRef = useRef(routeConversationId || "");
  const openingIdRef = useRef("");
  useEffect(() => {
    const previous = routeIdRef.current;
    routeIdRef.current = routeConversationId || "";
    if (!routeConversationId) {
      if (openingIdRef.current) return;
      if (previous && String(activeRef.current || "") === String(previous)) {
        setActive(null);
        setMessages([]);
        setUnreadChip(null);
      }
      return;
    }
    if (!ready || loadingList) return;
    if (String(openingIdRef.current || "") === String(routeConversationId)) return;
    if (String(activeRef.current || "") === String(routeConversationId)) return;
    const source = tab === "monitor" ? monitored : conversations;
    const conversation = source.find((item) => String(item._id) === String(routeConversationId));
    if (conversation) openThread(conversation, null, tab === "monitor" ? "monitor" : undefined);
    else if (!openingIdRef.current) navigate(chatPath(tab), { replace: true });
  }, [ready, allowed, loadingList, routeConversationId, conversations, monitored, openThread, navigate, tab]);

  useEffect(() => {
    if (!ready || !allowed) return undefined;
    loadLists();
    return undefined;
  }, [ready, allowed, loadLists]);

  useEffect(() => {
    if (tab !== "monitor" || role !== "superadmin" || !active?._id) return undefined;
    const conversationId = String(active._id);
    const refresh = () => {
      getChatMessagesApi(conversationId, { admin: "1" }).then((response) => {
        if (String(activeRef.current || "") !== conversationId || !response?.success) return;
        setMessages((response.messages || []).map((message) => forViewer(message, meRef.current)));
      }).catch(() => {});
    };
    const timer = setInterval(refresh, 4000);
    return () => clearInterval(timer);
  }, [tab, role, active?._id]);

  useEffect(() => {
    if (!["superadmin", "admin", "subadmin", "manager"].includes(signedIn?.role)) return undefined;
    return subscribeChatEvents({
      "chat.message.created": (payload) => {
      const message = payload?.message;
      if (!message) return;
      if (window.location.pathname.includes("/admin/crm/chat/monitor")) {
        const routeId = (window.location.pathname.match(/\/admin\/crm\/chat\/monitor\/([^/]+)/) || [])[1] || "";
        if (routeId && personId(message.conversationId) === personId(routeId)) {
          setMessages((prev) => placeMessage(prev, message, meRef.current));
        }
        return;
      }
      loadLists();
      const fromMe = personId(message.senderId) === personId(meRef.current);
      const routeId = (window.location.pathname.match(/\/admin\/crm\/chat\/(?:chats|people|unread)\/([^/]+)/) || [])[1] || "";
      const openHere = personId(message.conversationId) === personId(activeRef.current)
        || (routeId && personId(message.conversationId) === personId(routeId));
      const onScreen = openHere && document.visibilityState === "visible";
      if (openHere) {
        setMessages((prev) => placeMessage(prev, message, meRef.current));
        if (!fromMe) setTyping("");
      }
      if (fromMe) return;
      if (onScreen) seenChatApi(message.conversationId);
      else {
        deliveredChatApi([message._id]);
        window.dispatchEvent(new CustomEvent("crm-chat-incoming", { detail: message }));
      }
    },
      "chat.message.delivered": (payload) => {
      setMessages((prev) => prev.map((item) => (
        payload.messageIds?.map(String).includes(String(item._id))
          ? { ...item, state: item.state === "seen" ? "seen" : "delivered", deliveredAt: item.deliveredAt || payload.deliveredAt }
          : item
      )));
    },
      "chat.message.seen": (payload) => {
      setMessages((prev) => prev.map((item) => (
        item.conversationId === payload.conversationId && item.mine
          ? { ...item, state: "seen", seenAt: item.seenAt || payload.seenAt, deliveredAt: item.deliveredAt || payload.seenAt }
          : item
      )));
    },
      "chat.message.edited": () => activeRef.current && getChatMessagesApi(activeRef.current).then((response) => response.success && setMessages((response.messages || []).map((message) => forViewer(message, meRef.current)))),
      "chat.message.deleted": () => activeRef.current && getChatMessagesApi(activeRef.current).then((response) => response.success && setMessages((response.messages || []).map((message) => forViewer(message, meRef.current)))),
      "chat.typing.started": (payload) => {
      if (personId(payload?.conversationId) !== personId(activeRef.current)) return;
      const label = String(payload?.name || "Someone").trim().split(/\s+/)[0] || "Someone";
      setTyping(label);
      clearTimeout(typingHide.current);
      typingHide.current = setTimeout(() => setTyping(""), 2500);
    },
      "chat.typing.stopped": (payload) => {
      if (personId(payload?.conversationId) !== personId(activeRef.current)) return;
      clearTimeout(typingHide.current);
      setTyping("");
    },
      "chat.presence.updated": (payload) => {
      const patch = (person) => person && String(person._id) === String(payload.userId)
        ? { ...person, online: payload.online, lastOnline: payload.lastOnline || person.lastOnline }
        : person;
      setAgents((prev) => prev.map(patch));
      setConversations((prev) => prev.map((item) => ({ ...item, other: patch(item.other) })));
      setActive((prev) => prev ? { ...prev, other: patch(prev.other) } : prev);
    },
      "chat.permission.revoked": () => {
      toast.error("Chat access was turned off");
      window.location.assign("/admin/dashboard/crm");
    },
      "chat.contact.availability_changed": () => loadLists(),
    });
  }, [signedIn?.role, loadLists]);

  activeRef.current = active?._id ? String(active._id) : null;
  window.__crmActiveChat = activeRef.current || "";
  meRef.current = myId || null;
  useEffect(() => {
    const markSeen = () => {
      if (document.visibilityState !== "visible" || !activeRef.current) return;
      if (window.location.pathname.includes("/admin/crm/chat/monitor")) return;
      seenChatApi(activeRef.current);
    };
    document.addEventListener("visibilitychange", markSeen);
    window.addEventListener("focus", markSeen);
    const onProfileUpdated = () => {
      loadLists();
    };
    window.addEventListener("crm-user-profile-updated", onProfileUpdated);
    return () => {
      document.removeEventListener("visibilitychange", markSeen);
      window.removeEventListener("focus", markSeen);
      window.removeEventListener("crm-user-profile-updated", onProfileUpdated);
    };
  }, [loadLists]);
  useEffect(() => {
    if (!menuId && !emojiOpen) return undefined;
    const close = (event) => {
      if (event.target.closest(".crm-chat-menu, .crm-chat-dots, .crm-chat-emoji, .crm-chat-tool")) return;
      setMenuId(null);
      setEmojiOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuId, emojiOpen]);
  useEffect(() => {
    if (loadingThread) return undefined;
    const pane = streamRef.current;
    if (!pane) return undefined;
    const snapToLatest = () => { pane.scrollTop = pane.scrollHeight; };
    snapToLatest();
    const frame = requestAnimationFrame(snapToLatest);
    return () => cancelAnimationFrame(frame);
  }, [messages.length, typing, unreadChip, active?._id, loadingThread]);

  const nameDirectory = useMemo(() => {
    const map = new Map();
    const add = (person) => {
      const id = personId(person?._id);
      const first = (person?.firstName || "").trim();
      if (id && first) map.set(id, first);
    };
    agents.forEach(add);
    conversations.forEach((item) => add(item.other));
    add(active?.other);
    add(signedIn);
    add(user);
    return map;
  }, [agents, conversations, active, signedIn, user]);

  const filteredRecycle = useMemo(() => {
    const query = recycleSearch.trim().toLowerCase();
    return recycle.filter((item) => {
      if (recycleTab === "conversations" && item.type !== "conversation") return false;
      if (recycleTab === "messages" && item.type === "conversation") return false;
      if (!query) return true;
      if (item.type === "conversation") {
        return (item.participants || []).some((p) => String(p).toLowerCase().includes(query))
          || (item.thread || []).some((t) => (t.body || "").toLowerCase().includes(query));
      }
      return (item.senderName || "").toLowerCase().includes(query) || (item.body || "").toLowerCase().includes(query);
    });
  }, [recycle, recycleSearch, recycleTab]);

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (tab === "people") {
      return agents
        .filter((agent) => !query || nameOf(agent).toLowerCase().includes(query))
        .sort((a, b) => Number(b.online) - Number(a.online) || nameOf(a).localeCompare(nameOf(b)));
    }
    if (tab === "monitor") {
      return monitored.filter((item) => {
        const names = (item.participants || []).map((person) => nameOf(person)).join(" ").toLowerCase();
        return !query || names.includes(query) || (item.lastMessagePreview || "").toLowerCase().includes(query);
      });
    }
    return conversations.filter((item) => {
      const matches = !query || nameOf(item.other).toLowerCase().includes(query) || (item.lastMessagePreview || "").toLowerCase().includes(query);
      return matches && (tab !== "unread" || item.unread > 0);
    });
  }, [tab, agents, conversations, monitored, search]);

  const submitMessage = async ({ clientKey, body, chosen, conversationId, pendingUserId }) => {
    setSending(true);
    const form = new FormData();
    if (conversationId) form.append("conversationId", conversationId);
    if (pendingUserId) form.append("userId", pendingUserId);
    form.append("body", body || "");
    form.append("clientKey", clientKey);
    (chosen || []).forEach((file) => form.append("files", file));
    const response = await sendChatMessageApi(form, setUploadProgress);
    setSending(false);
    setUploadProgress(0);
    if (!response?.success) {
      setMessages((prev) => prev.map((item) => item.clientKey === clientKey ? { ...item, state: "failed", retryFiles: chosen || item.retryFiles || [] } : item));
      toast.error(response?.msg || "Message failed");
      return;
    }
    setMessages((prev) => placeMessage(prev, response.message, meRef.current));
    const createdId = response.conversation?._id || response.conversationId;
    if (!active?._id && createdId) {
      setActive((prev) => prev ? { ...prev, _id: createdId } : prev);
      const nextPath = chatPath(tab, createdId);
      if (window.location.pathname !== nextPath) navigate(nextPath);
    }
    loadLists();
    inputRef.current?.focus();
  };

  const send = async () => {
    if (!active || unavailable || sending || (!draft.trim() && files.length === 0)) return;
    const clientKey = `${Date.now()}-${Math.random()}`;
    const chosen = files;
    const body = draft;
    setMessages((prev) => [...prev, {
      _id: clientKey,
      clientKey,
      mine: true,
      body,
      createdAt: new Date().toISOString(),
      state: "sending",
      attachments: [],
      retryFiles: chosen,
    }]);
    stopTyping(active._id);
    setDraft("");
    setFiles([]);
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.overflowY = "hidden";
    }
    await submitMessage({
      clientKey,
      body,
      chosen,
      conversationId: active._id,
      pendingUserId: active.pendingUserId,
    });
  };

  const retryMessage = (message) => {
    if (sending || !active || message.state === "sending") return;
    setMessages((prev) => prev.map((item) => item.clientKey === message.clientKey ? { ...item, state: "sending" } : item));
    submitMessage({
      clientKey: message.clientKey,
      body: message.body,
      chosen: message.retryFiles || [],
      conversationId: active._id,
      pendingUserId: active.pendingUserId,
    });
  };

  const insertEmoji = (emoji) => {
    const input = inputRef.current;
    const start = input?.selectionStart ?? draft.length;
    const next = `${draft.slice(0, start)}${emoji}${draft.slice(start)}`;
    onType(next);
    setEmojiOpen(false);
    requestAnimationFrame(() => input?.focus());
  };

  const reactTo = async (message, emoji) => {
    setMenuId(null);
    const response = await reactChatMessageApi(message._id, emoji);
    if (!response?.success || !response.message) {
      toast.error(response?.msg || "Could not react");
      return;
    }
    setMessages((prev) => prev.map((item) => (
      String(item._id) === String(message._id) ? { ...item, reactions: response.message.reactions || [] } : item
    )));
  };

  const deleteConversation = async (conversation) => {
    if (!conversation?._id) return;
    const confirmed = window.confirm(`Delete this chat with ${nameOf(conversation.other)}?`);
    if (!confirmed) return;
    const response = await removeChatConversationApi(conversation._id);
    if (!response?.success) {
      toast.error(response?.msg || "Could not delete conversation");
      return;
    }
    setContactOpen(false);
    if (String(active?._id) === String(conversation._id)) {
      openingIdRef.current = "";
      activeRef.current = null;
      setActive(null);
      navigate(chatPath(tab));
    }
    loadLists();
  };

  const stopTyping = (conversationId) => {
    const state = typingOut.current;
    clearTimeout(state.timer);
    const id = conversationId || state.id;
    if (state.on && id) typingChatApi(id, false);
    state.on = false;
    state.id = "";
    state.ping = 0;
  };

  const onType = (value) => {
    setDraft(value);
    const id = active?._id ? String(active._id) : "";
    if (!id) return;
    if (!String(value || "").trim()) {
      stopTyping(id);
      return;
    }
    const state = typingOut.current;
    const now = Date.now();
    if (!state.on || state.id !== id || now - state.ping > 1500) {
      state.on = true;
      state.id = id;
      state.ping = now;
      typingChatApi(id, true);
    }
    clearTimeout(state.timer);
    state.timer = setTimeout(() => stopTyping(id), 2000);
  };

  useEffect(() => {
    setTyping("");
    const typingRefObj = typingOut.current;
    return () => {
      clearTimeout(typingRefObj.timer);
      if (typingRefObj.on && typingRefObj.id) typingChatApi(typingRefObj.id, false);
      typingRefObj.on = false;
      typingRefObj.id = "";
    };
  }, [active?._id]);

  useEffect(() => {
    if (!active?._id) {
      setCallLogs([]);
      return undefined;
    }
    let cancelled = false;
    const load = () => {
      getChatCallsApi(active._id, { admin: active.readOnly ? "1" : "" }).then((response) => {
        if (!cancelled && response?.success) setCallLogs(response.calls || []);
      }).catch(() => {});
    };
    load();
    window.addEventListener("crm-voice-logged", load);
    return () => {
      cancelled = true;
      window.removeEventListener("crm-voice-logged", load);
    };
  }, [active?._id, active?.readOnly]);

  if (ready && !allowed) {
    return (
      <div className={`crm-chat ${collapsed ? "is-collapsed" : ""}`}>
        <Sidebar isCollapsed={collapsed} setIsSidebarCollapsed={setCollapsed} isMobileMenu={mobile} setisMobileMenu={setMobile} />
        <div className="crm-chat-shell">
          <div className="crm-chat-center"><h2>Chat access is turned off</h2><p>A super admin can turn on Chat access for this account.</p></div>
        </div>
      </div>
    );
  }

  return (
    <div className={`crm-chat ${collapsed ? "is-collapsed" : ""}`}>
      <Sidebar isCollapsed={collapsed} setIsSidebarCollapsed={setCollapsed} isMobileMenu={mobile} setisMobileMenu={setMobile} />
      <div className={`crm-chat-shell ${active ? "has-thread" : ""}`}>
        <aside className="crm-chat-list">
          <div className="crm-chat-list-head">
            <h1>{tab === "monitor" ? "All chats" : "Chats"}</h1>
            <div className="crm-chat-list-head-actions">
              <LiveStatusDot variant="inline" />
              {role === "superadmin" && (
                <button
                  type="button"
                  className="crm-chat-icon"
                  title="Recycle bin"
                  aria-label="Recycle bin"
                  onClick={async () => {
                    const response = await getChatRecycleApi();
                    setRecycle(response.messages || []);
                    setRecycleOpen(true);
                  }}
                >
                  <DeleteSweep style={{ fontSize: 20 }} />
                </button>
              )}
            </div>
          </div>
          <div className="crm-chat-search">
            <span className="crm-chat-search-icon"><Search style={{ fontSize: 18 }} /></span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={tab === "monitor" ? "Search agent chats..." : "Search people or chats..."}
            />
            {search && (
              <button
                type="button"
                className="crm-chat-search-clear"
                aria-label="Clear search"
                onClick={() => setSearch("")}
              >
                <Close style={{ fontSize: 14 }} />
              </button>
            )}
          </div>
          <div className="crm-chat-tabs">
            {(role === "superadmin" ? ["chats", "people", "unread", "monitor"] : ["chats", "people", "unread"]).map((item) => (
              <button
                key={item}
                className={tab === item ? "active" : ""}
                onClick={() => navigate((item === "monitor" || tab === "monitor") ? chatPath(item) : chatPath(item, active?._id))}
              >
                {item === "monitor" ? "All" : item[0].toUpperCase() + item.slice(1)}
              </button>
            ))}
          </div>
          <div className="crm-chat-rows">
            {(!ready || loadingList) && <ListSkeleton />}
            {ready && !loadingList && error && <div className="crm-chat-center"><p>{error}</p><button type="button" className="crm-chat-retry" onClick={loadLists}>Retry</button></div>}
            {ready && !loadingList && !error && rows.length === 0 && <div className="crm-chat-center"><p>{tab === "unread" ? "No unread chats" : tab === "monitor" ? "No agent chats yet" : "No people available"}</p></div>}
            {ready && !loadingList && tab === "people" && rows.map((agent) => (
              <button className="crm-chat-row" key={agent._id} onClick={() => openThread(conversations.find((item) => String(item.other?._id) === String(agent._id)), agent, "chats")}>
                <ChatAvatar person={agent} />
                <div className="crm-chat-row-copy">
                  <div className="crm-chat-row-top">
                    <strong>{nameOf(agent)}</strong>
                    {agent.role && <span className={`crm-chat-row-role ${String(agent.role).toLowerCase()}`}>{agent.role}</span>}
                  </div>
                  <span className="crm-chat-row-preview">{lastSeenText(agent)}</span>
                </div>
              </button>
            ))}
            {ready && !loadingList && tab === "monitor" && rows.map((item) => {
              const pair = item.participants || [];
              const title = pair.map((person) => nameOf(person)).filter(Boolean).join(" · ") || "Chat";
              return (
                <div className={`crm-chat-row ${String(active?._id) === String(item._id) ? "selected" : ""}`} key={item._id} role="button" tabIndex={0} onClick={() => openThread(item, null, "monitor")} onKeyDown={(event) => { if (event.key === "Enter") openThread(item, null, "monitor"); }}>
                  <ChatAvatar person={pair[0]} />
                  <div className="crm-chat-row-copy">
                    <div className="crm-chat-row-top">
                      <strong>{title}</strong>
                      {item.lastMessageAt && <time className="crm-chat-row-time">{listTime(item.lastMessageAt)}</time>}
                    </div>
                    <span className="crm-chat-row-preview">{item.lastActivityKind === "call" ? (item.lastMessagePreview || "Call") : (item.lastMessagePreview || "No messages yet")}</span>
                  </div>
                </div>
              );
            })}
            {ready && !loadingList && tab !== "people" && tab !== "monitor" && rows.map((item) => (
              <div className={`crm-chat-row ${active?._id === item._id ? "selected" : ""}`} key={item._id} role="button" tabIndex={0} onClick={() => openThread(item)} onKeyDown={(event) => { if (event.key === "Enter") openThread(item); }}>
                <ChatAvatar person={item.other} />
                <div className="crm-chat-row-copy">
                  <div className="crm-chat-row-top">
                    <strong>{nameOf(item.other)}</strong>
                    {item.other?.role && <span className={`crm-chat-row-role ${String(item.other.role).toLowerCase()}`}>{item.other.role}</span>}
                    {item.lastMessageAt && <time className="crm-chat-row-time">{listTime(item.lastMessageAt)}</time>}
                  </div>
                  <span className={`crm-chat-row-preview ${typing && personId(item._id) === personId(active?._id) ? "crm-chat-row-typing" : ""}`}>
                    {typing && personId(item._id) === personId(active?._id)
                      ? "typing…"
                      : item.lastActivityKind === "call"
                        ? item.lastMessagePreview
                        : item.lastMessagePreview
                        ? `${personId(item.lastMessageSenderId) === myId ? "You" : (item.lastMessageSenderName || nameOf(item.other).split(" ")[0])}: ${item.lastMessagePreview}`
                        : lastSeenText(item.other)}
                  </span>
                </div>
                {item.unread > 0 && <span className="crm-chat-badge">{item.unread}</span>}
                <button type="button" className="crm-chat-row-delete" aria-label="Delete conversation" title="Delete conversation" onClick={(event) => { event.stopPropagation(); deleteConversation(item); }}><DeleteOutline style={{ fontSize: 18 }} /></button>
              </div>
            ))}
          </div>
        </aside>
        <section className="crm-chat-main">
          {!active && (!ready || loadingList) && (
            <div className="crm-chat-stream"><ThreadSkeleton /></div>
          )}
          {!active && ready && !loadingList && (
            <div className="crm-chat-empty">
              <div style={{
                width: 72,
                height: 72,
                borderRadius: "22px",
                background: "linear-gradient(135deg, #eef2ff 0%, #ede9fe 100%)",
                color: "#4f46e5",
                display: "grid",
                placeItems: "center",
                margin: "0 auto 18px",
                boxShadow: "0 8px 24px rgba(79, 70, 229, 0.12)"
              }}>
                <ForumOutlined style={{ fontSize: 36 }} />
              </div>
              <h2>Your conversations, all in one place</h2>
              <p>Select a teammate from the left to start a conversation, make calls, or view past records.</p>
            </div>
          )}
          {active && (
            <>
              <header className="crm-chat-head">
                <button
                  type="button"
                  className="crm-chat-icon"
                  aria-label="Back to conversations"
                  title="Back"
                  onClick={() => {
                    openingIdRef.current = "";
                    activeRef.current = null;
                    setActive(null);
                    setMessages([]);
                    setUnreadChip(null);
                    navigate(chatPath(tab));
                  }}
                >
                  <ArrowBack style={{ fontSize: 20 }} />
                </button>
                <ChatAvatar
                  person={active.readOnly ? active.participants?.[0] : active.other}
                />
                <div className="crm-chat-head-user">
                  <div className="crm-chat-head-name">
                    <h2>
                      {active.readOnly
                        ? ((active.participants || []).map((person) => nameOf(person)).filter(Boolean).join(" · ") || "Chat")
                        : nameOf(active.other)}
                    </h2>
                    {!active.readOnly && active.other?.role && (
                      <span className={`crm-chat-role-chip ${String(active.other.role).toLowerCase()}`}>{active.other.role}</span>
                    )}
                  </div>
                  <p className={typing && !active.readOnly ? "is-typing" : (active.other?.online && !active.readOnly ? "is-online" : "")}>
                    {active.readOnly ? (
                      "Read only"
                    ) : typing ? (
                      <>
                        <span className="crm-chat-typing-dots" aria-hidden="true"><i /><i /><i /></span>
                        {typing} is typing…
                      </>
                    ) : (
                      `${active.other?.role || "Agent"} · ${lastSeenText(active.other)}`
                    )}
                  </p>
                </div>
                <div className="crm-chat-head-actions">
                  {!active.readOnly && active.other?._id && (
                    <button
                      type="button"
                      className="crm-chat-icon"
                      title="Call log"
                      aria-label="Call log"
                      onClick={() => setCallLogOpen(true)}
                    >
                      <History style={{ fontSize: 19 }} />
                    </button>
                  )}
                  {!active.readOnly && active.other?._id && !unavailable && (
                    <button
                      type="button"
                      className="crm-chat-icon call-btn"
                      title="Voice call"
                      aria-label="Voice call"
                      onClick={() => startCall(false)}
                    >
                      <Phone style={{ fontSize: 18 }} />
                    </button>
                  )}
                  {!active.readOnly && active.other?._id && !unavailable && (
                    <button
                      type="button"
                      className="crm-chat-icon video-btn"
                      title="Video call"
                      aria-label="Video call"
                      onClick={() => startCall(true)}
                    >
                      <Videocam style={{ fontSize: 20 }} />
                    </button>
                  )}
                  {!active.readOnly && (
                    <button
                      type="button"
                      className="crm-chat-icon delete-btn"
                      aria-label="Delete conversation"
                      title="Delete conversation"
                      onClick={() => deleteConversation(active)}
                    >
                      <DeleteOutline style={{ fontSize: 19 }} />
                    </button>
                  )}
                  {!active.readOnly && (
                    <button
                      type="button"
                      className="crm-chat-icon"
                      title="Contact info"
                      aria-label="Contact info"
                      onClick={() => { setContactOpen(true); setInfo(null); }}
                    >
                      <InfoOutlined style={{ fontSize: 19 }} />
                    </button>
                  )}
                </div>
              </header>
              <div className="crm-chat-stream" ref={streamRef}>
                {loadingThread && <ThreadSkeleton />}
                {!loadingThread && messages.length === 0 && callLogs.length === 0 && <div className="crm-chat-empty"><h2>{active.readOnly ? "No messages in this chat" : `Start your conversation with ${nameOf(active.other)}`}</h2><p>{active.readOnly ? "This conversation is empty." : "Send your first message to get started."}</p></div>}
                {!loadingThread && [...messages.map((message) => ({ kind: "message", at: new Date(message.createdAt).getTime() || 0, message })), ...callLogs.map((item) => ({ kind: "call", at: new Date(item.createdAt).getTime() || 0, call: item }))].sort((a, b) => a.at - b.at).map((entry, index, list) => {
                  if (entry.kind === "call") {
                    const item = entry.call;
                    const mine = personId(item.fromId) === myId;
                    const label = item.status === "completed" ? "Answered" : item.status === "declined" ? "Declined" : item.status === "cancelled" ? "Cancelled" : item.status === "offline" ? "Offline" : item.status === "busy" ? "Busy" : "Missed";
                    const mins = Math.floor((item.durationSec || 0) / 60);
                    const secs = String((item.durationSec || 0) % 60).padStart(2, "0");
                    const who = active.readOnly
                      ? `${item.fromName || "Agent"} called ${item.toName || "Agent"}`
                      : (mine ? "Outgoing" : "Incoming") + " call";
                    return (
                      <div className={`crm-chat-call ${item.status || "missed"}`} key={item._id || item.callId}>
                        <Phone />
                        <span>{who} · {label}{item.durationSec ? ` · ${mins}:${secs}` : ""}</span>
                        <time>{formatClock(item.createdAt)}</time>
                      </div>
                    );
                  }
                  const message = entry.message;
                  const previous = list.slice(0, index).reverse().find((item) => item.kind === "message")?.message;
                  const showDay = !previous || dayLabel(previous.createdAt) !== dayLabel(message.createdAt);
                  const onRight = active.readOnly
                    ? personId(message.senderId) === personId(active.participants?.[1]?._id)
                    : Boolean(message.mine);
                  const alignedMine = active.readOnly ? onRight : Boolean(message.mine);
                  return (
                    <React.Fragment key={message._id}>
                      {showDay && <div className="crm-chat-day">{dayLabel(message.createdAt)}</div>}
                      {unreadChip && !active.readOnly && String(unreadChip.id) === String(message._id) && (
                        <div className="crm-chat-unread">
                          {unreadChip.count} unread message{unreadChip.count === 1 ? "" : "s"}
                        </div>
                      )}
                      <div className={`crm-chat-line ${alignedMine ? "mine" : "theirs"} ${menuId === message._id ? "menu-open" : ""}`}>
                      {message.mine && !active.readOnly && !message.deleted && (
                        <div className="crm-chat-side">
                          <button type="button" className="crm-chat-info" title="Message info" onClick={() => setInfo(message)}><InfoOutlined /></button>
                          <button type="button" className="crm-chat-dots" aria-label="Message actions" onClick={() => setMenuId(menuId === message._id ? null : message._id)}><MoreVert /></button>
                        </div>
                      )}
                      <article className={`crm-chat-bubble ${message.deleted ? "deleted" : alignedMine ? "mine" : "theirs"} ${message.state === "failed" ? "failed" : ""}`}>
                        {active.readOnly && !message.deleted && <strong className="crm-chat-speaker">{(message.senderName || "Agent").trim().split(/\s+/)[0]}</strong>}
                        {!message.deleted && menuId === message._id && (
                              <div className="crm-chat-menu">
                                <div className="crm-chat-reacts">
                                  {EMOJIS.slice(0, 8).map((emoji) => {
                                    const selected = (message.reactions || []).some((item) => personId(item.userId) === myId && item.emoji === emoji);
                                    return (
                                      <button key={emoji} type="button" className={selected ? "active" : ""} title={selected ? "Remove your reaction" : `React with ${emoji}`} onClick={() => reactTo(message, emoji)}>{emoji}</button>
                                    );
                                  })}
                                </div>
                                {message.mine && (
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      const next = window.prompt("Edit message", message.body);
                                      setMenuId(null);
                                      if (!next || next === message.body) return;
                                      const response = await editChatMessageApi(message._id, { body: next });
                                      if (!response.success) toast.error(response.msg || "Could not edit");
                                    }}
                                  >
                                    <Edit style={{ fontSize: 16 }} />
                                    <span>Edit</span>
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => {
                                    navigator.clipboard?.writeText(message.body || "");
                                    setMenuId(null);
                                  }}
                                >
                                  <ContentCopy style={{ fontSize: 16 }} />
                                  <span>Copy</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => hideChatMessageApi(message._id).then(() => openThread(active))}
                                >
                                  <DeleteOutline style={{ fontSize: 16 }} />
                                  <span>Delete for me</span>
                                </button>
                                {message.mine && (
                                  <button
                                    type="button"
                                    className="danger"
                                    onClick={async () => {
                                      const response = await deleteChatMessageApi(message._id, {});
                                      setMenuId(null);
                                      if (!response.success) toast.error(response.msg || "Could not delete");
                                    }}
                                  >
                                    <DeleteForever style={{ fontSize: 16 }} />
                                    <span>Delete for everyone</span>
                                  </button>
                                )}
                              </div>
                        )}
                        {message.deleted ? <p>This message was deleted</p> : <MessageBody body={message.body} />}
                        {(message.attachments || []).map((file) => (
                          <div className="crm-chat-attach" key={file.publicId || file.url}>
                            {String(file.mimeType || "").startsWith("image/")
                              ? <a href={file.url} target="_blank" rel="noreferrer"><img src={file.url} alt={file.originalName || "Image"} /></a>
                              : <a className="crm-chat-doc" href={file.url} target="_blank" rel="noreferrer">{file.originalName || "File"} · {Math.ceil((file.size || 0) / 1024)} KB</a>}
                          </div>
                        ))}
                        {(message.reactions || []).length > 0 && (
                          <div className="crm-chat-reactions">
                            {message.reactions.map((item) => {
                              const id = personId(item.userId);
                              const firstName = reactionFirstName(item, nameDirectory);
                              const viewerFirst = (signedIn?.firstName || user?.firstName || "").trim().toLowerCase();
                              const mine = Boolean(myId) && id === myId && (!firstName || firstName.toLowerCase() === viewerFirst);
                              const label = mine ? "You" : (firstName || "Member");
                              return (
                                <button
                                  key={`${id}${item.emoji}${label}`}
                                  type="button"
                                  className={`crm-chat-reaction ${mine ? "mine" : ""}`}
                                  title={mine ? "Remove your reaction" : `${label} reacted ${item.emoji}`}
                                  onClick={() => { if (mine) reactTo(message, item.emoji); }}
                                >
                                  <em>{item.emoji}</em>
                                  <span>{label}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                        <div className="crm-chat-meta">
                          {message.edited && <span>Edited</span>}
                          <span className={message.state === "failed" ? "crm-chat-failed-label" : ""}>{message.state === "sending" ? "Sending" : message.state === "failed" ? "Not sent" : formatClock(message.createdAt)}</span>
                          {message.state === "failed" && <button type="button" className="crm-chat-retry-msg" onClick={() => retryMessage(message)}>Retry</button>}
                          {message.mine && !message.deleted && message.state !== "failed" && <WaTicks state={message.state || "sent"} />}
                        </div>
                      </article>
                      {!active.readOnly && !message.mine && !message.deleted && (
                        <div className="crm-chat-side">
                          <button type="button" className="crm-chat-dots" aria-label="Message actions" onClick={() => setMenuId(menuId === message._id ? null : message._id)}><MoreVert /></button>
                        </div>
                      )}
                      </div>
                    </React.Fragment>
                  );
                })}
                <div ref={bottomRef} />
              </div>
              {active.readOnly ? (
                <div className="crm-chat-readonly">Read only. Opening this chat does not mark messages seen.</div>
              ) : unavailable ? (
                <div className="crm-chat-center"><p>Messaging is unavailable for this contact.</p></div>
              ) : (
                <>
                  {emojiOpen && <div className="crm-chat-emoji">{EMOJIS.map((emoji) => <button key={emoji} onClick={() => insertEmoji(emoji)}>{emoji}</button>)}</div>}
                  {files.length > 0 && (
                    <div className="crm-chat-files">
                      {files.map((file) => (
                        <FileChip key={`${file.name}-${file.size}-${file.lastModified}`} file={file} sending={sending} uploadProgress={uploadProgress} onRemove={() => setFiles((prev) => prev.filter((item) => item !== file))} />
                      ))}
                    </div>
                  )}
                  {typing && (
                    <div className="crm-chat-typing-line">
                      <span className="crm-chat-typing-dots" aria-hidden="true"><i /><i /><i /></span>
                      {typing} is typing…
                    </div>
                  )}
                  <form className="crm-chat-compose" onSubmit={(event) => { event.preventDefault(); send(); }}>
                    <button type="button" className={`crm-chat-tool ${emojiOpen ? "active" : ""}`} aria-label="Emoji" onClick={() => setEmojiOpen((open) => !open)}><EmojiEmotions /></button>
                    <label className="crm-chat-tool" aria-label="Attach file"><AttachFile /><input hidden type="file" multiple onChange={(event) => setFiles(Array.from(event.target.files || []))} /></label>
                    <textarea
                      ref={inputRef}
                      rows={1}
                      placeholder="Write a message or paste leads..."
                      value={draft}
                      onInput={adjustTextareaHeight}
                      onChange={(event) => {
                        onType(event.target.value);
                        adjustTextareaHeight();
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          send();
                        }
                      }}
                    />
                    <button className="crm-chat-send" type="submit" aria-label="Send" disabled={sending || (!draft.trim() && files.length === 0)}><Send /></button>
                  </form>
                </>
              )}
              {callLogOpen && !active.readOnly && (
                <aside className="crm-chat-drawer">
                  <header>
                    <strong>Call log</strong>
                    <button type="button" className="crm-chat-icon" onClick={() => setCallLogOpen(false)}><Close style={{ fontSize: 18 }} /></button>
                  </header>
                  <section>
                    {callLogs.length === 0 && <p className="crm-chat-empty-note">No calls with {nameOf(active.other)} yet.</p>}
                    {callLogs.map((item) => {
                      const mine = personId(item.fromId) === myId;
                      const label = item.status === "completed" ? "Answered" : item.status === "declined" ? "Declined" : item.status === "cancelled" ? "Cancelled" : item.status === "offline" ? "Offline" : item.status === "busy" ? "Busy" : "Missed";
                      const mins = Math.floor((item.durationSec || 0) / 60);
                      const secs = String((item.durationSec || 0) % 60).padStart(2, "0");
                      return (
                        <article className="crm-call-log" key={item._id}>
                          <div>
                            <strong>{mine ? "Outgoing" : "Incoming"} · {label}</strong>
                            <p>{new Date(item.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}{item.durationSec ? ` · ${mins}:${secs}` : ""}</p>
                          </div>
                          {!unavailable && (
                            <div className="crm-call-log-actions">
                              <button type="button" onClick={() => startCall(false)}>
                                <Phone style={{ fontSize: 13 }} />
                                <span>Call</span>
                              </button>
                              <button type="button" onClick={() => startCall(true)}>
                                <Videocam style={{ fontSize: 14 }} />
                                <span>Video</span>
                              </button>
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </section>
                </aside>
              )}
              {info && (
                <aside className="crm-chat-drawer">
                  <header><strong>Message info</strong><button className="crm-chat-icon" onClick={() => setInfo(null)}><Close style={{ fontSize: 18 }} /></button></header>
                  <section>
                    <p>{info.body || "Attachment"}</p>
                    <p className="crm-chat-receipt"><WaTicks state="sent" /> Sent<br />{formatFull(info.sentAt || info.createdAt)}</p>
                    <p className="crm-chat-receipt"><WaTicks state="delivered" /> Delivered<br />{info.deliveredAt ? formatFull(info.deliveredAt) : "Not yet delivered"}</p>
                    <p className="crm-chat-receipt seen"><WaTicks state="seen" /> Read<br />{info.seenAt ? formatFull(info.seenAt) : "Not yet seen"}</p>
                  </section>
                </aside>
              )}
              {contactOpen && (
                <aside className="crm-chat-drawer">
                  <header><strong>Contact info</strong><button className="crm-chat-icon" onClick={() => setContactOpen(false)}><Close style={{ fontSize: 18 }} /></button></header>
                  <section>
                    <ChatAvatar
                      person={active.other}
                      showOnline={false}
                      style={{ width: 64, height: 64, fontSize: 24, borderRadius: "50%" }}
                    />
                    <h2>{nameOf(active.other)}</h2>
                    {active.other?.role && (
                      <span className={`crm-chat-role-chip ${String(active.other.role).toLowerCase()}`} style={{ margin: "4px auto 8px" }}>
                        {active.other.role}
                      </span>
                    )}
                    <p>{lastSeenText(active.other)}</p>
                    <div className="crm-chat-actions-col">
                      <button type="button" onClick={() => flagChatConversationApi(active._id, "mutedBy")}>
                        <NotificationsOff style={{ fontSize: 18 }} />
                        <span>Mute notifications</span>
                      </button>
                      <button type="button" onClick={() => flagChatConversationApi(active._id, "pinnedBy")}>
                        <PushPin style={{ fontSize: 18 }} />
                        <span>Pin conversation</span>
                      </button>
                      <button type="button" className="danger" onClick={() => deleteConversation(active)}>
                        <DeleteOutline style={{ fontSize: 18 }} />
                        <span>Delete conversation</span>
                      </button>
                    </div>
                  </section>
                </aside>
              )}
            </>
          )}
        </section>
      </div>
      {recycleOpen && (
        <div className="crm-recycle-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setRecycleOpen(false); }}>
          <div className="crm-recycle-modal" role="dialog" aria-modal="true">
            <header className="crm-recycle-head">
              <div className="crm-recycle-title-group">
                <div className="crm-recycle-icon-box">
                  <DeleteSweep style={{ fontSize: 24 }} />
                </div>
                <div>
                  <div className="crm-recycle-headline">
                    <h2>Chat Recycle Bin</h2>
                    <span className="crm-recycle-pill">{recycle.length} item{recycle.length === 1 ? "" : "s"}</span>
                  </div>
                  <p>Restore or permanently delete messages and conversations</p>
                </div>
              </div>
              <button type="button" className="crm-recycle-close" aria-label="Close recycle bin" onClick={() => setRecycleOpen(false)}>
                <Close style={{ fontSize: 20 }} />
              </button>
            </header>

            <div className="crm-recycle-toolbar">
              <div className="crm-recycle-search">
                <Search style={{ fontSize: 18 }} />
                <input
                  value={recycleSearch}
                  onChange={(e) => setRecycleSearch(e.target.value)}
                  placeholder="Search deleted messages or conversations..."
                />
                {recycleSearch && (
                  <button type="button" className="crm-recycle-clear-btn" onClick={() => setRecycleSearch("")}><Close style={{ fontSize: 14 }} /></button>
                )}
              </div>
              <div className="crm-recycle-tabs">
                <button
                  type="button"
                  className={`crm-recycle-tab ${recycleTab === "all" ? "active" : ""}`}
                  onClick={() => setRecycleTab("all")}
                >
                  All ({recycle.length})
                </button>
                <button
                  type="button"
                  className={`crm-recycle-tab ${recycleTab === "conversations" ? "active" : ""}`}
                  onClick={() => setRecycleTab("conversations")}
                >
                  Conversations ({recycle.filter((i) => i.type === "conversation").length})
                </button>
                <button
                  type="button"
                  className={`crm-recycle-tab ${recycleTab === "messages" ? "active" : ""}`}
                  onClick={() => setRecycleTab("messages")}
                >
                  Messages ({recycle.filter((i) => i.type !== "conversation").length})
                </button>
              </div>
            </div>

            <div className="crm-recycle-body">
              {filteredRecycle.length === 0 ? (
                <div className="crm-recycle-empty">
                  <div className="crm-recycle-empty-icon"><DeleteSweep style={{ fontSize: 48 }} /></div>
                  <h3>Recycle bin is empty</h3>
                  <p>{recycleSearch ? "No items matching your search query." : "No deleted conversations or messages stored here."}</p>
                </div>
              ) : (
                <div className="crm-recycle-list">
                  {filteredRecycle.map((item) => (
                    <article className="crm-recycle-card" key={item._id}>
                      <div className="crm-recycle-card-head">
                        <div className="crm-recycle-card-badges">
                          <span className={`crm-recycle-kind ${item.type === "conversation" ? "conv" : "msg"}`}>
                            {item.type === "conversation" ? "Conversation" : "Message"}
                          </span>
                          <span className="crm-recycle-time">
                            Deleted {formatClock(item.deletedForEveryoneAt || item.createdAt)}
                            {item.deletedByName ? ` by ${item.deletedByName}` : ""}
                          </span>
                        </div>
                        <div className="crm-recycle-card-actions">
                          {item.type === "conversation" ? (
                            <button
                              type="button"
                              className="crm-recycle-btn-danger"
                              title="Permanently remove"
                              onClick={async () => {
                                if (!window.confirm("Remove this conversation from the recycle bin?")) return;
                                const response = await clearChatRecycleConversationApi(item.conversationId);
                                if (!response?.success) {
                                  toast.error(response?.msg || "Could not clear conversation");
                                  return;
                                }
                                const next = await getChatRecycleApi();
                                setRecycle(next.messages || []);
                              }}
                            >
                              <DeleteForever style={{ fontSize: 16 }} />
                              <span>Clear</span>
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="crm-recycle-btn-restore"
                                title="Restore message"
                                onClick={() => restoreChatMessageApi(item._id).then(async () => {
                                  toast.success("Message restored");
                                  const response = await getChatRecycleApi();
                                  setRecycle(response.messages || []);
                                })}
                              >
                                <RestoreFromTrash style={{ fontSize: 16 }} />
                                <span>Restore</span>
                              </button>
                              <button
                                type="button"
                                className="crm-recycle-btn-danger"
                                title="Delete permanently"
                                onClick={async () => {
                                  if (!window.confirm("Permanently delete this message?")) return;
                                  const response = await deleteChatRecycleMessageApi(item._id);
                                  if (!response?.success) {
                                    toast.error(response?.msg || "Could not delete message");
                                    return;
                                  }
                                  const next = await getChatRecycleApi();
                                  setRecycle(next.messages || []);
                                }}
                              >
                                <DeleteForever style={{ fontSize: 16 }} />
                                <span>Delete</span>
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {item.type === "conversation" ? (
                        <div className="crm-recycle-conv-content">
                          {item.participants?.length > 0 && (
                            <div className="crm-recycle-participants">
                              <strong>Participants:</strong> {item.participants.join(" & ")}
                            </div>
                          )}
                          <div className="crm-recycle-thread-box">
                            {(item.thread || []).length === 0 && <em>No preview messages saved.</em>}
                            {(item.thread || []).slice(0, 4).map((line, index) => (
                              <div className="crm-recycle-thread-line" key={`${item._id}-${index}`}>
                                <span className="sender">{line.senderName}:</span>
                                <span className="body">{line.body}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="crm-recycle-msg-content">
                          <strong className="crm-recycle-sender">{item.senderName || "Unknown member"}</strong>
                          <div className="crm-recycle-quote">{item.body || "Attachment or empty message"}</div>
                          {item.deleteReason && <div className="crm-recycle-reason">Reason: {item.deleteReason}</div>}
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatPage;
