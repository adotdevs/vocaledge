import { getBackendUrl, isBackendLocalhost, isElectronApp } from "../../../config/appConfig";

const listeners = new Map();
const statusListeners = new Set();

let source = null;
let reconnectTimer = null;
let reconnectDelay = 1000;
let chatStatus = "offline";
let statusDetail = "Not connected";

const emit = (type, payload) => {
  const handlers = listeners.get(type);
  if (!handlers) return;
  handlers.forEach((handler) => {
    try {
      handler(payload);
    } catch (error) {
      console.error("[chat] event handler failed", error);
    }
  });
};

const setChatStatus = (next, detail) => {
  chatStatus = next;
  if (detail) statusDetail = detail;
  statusListeners.forEach((listener) => {
    listener({ state: chatStatus, detail: statusDetail });
  });
};

export const getChatConnectionStatus = () => ({ state: chatStatus, detail: statusDetail });

export const subscribeChatStatus = (listener) => {
  statusListeners.add(listener);
  listener({ state: chatStatus, detail: statusDetail });
  return () => statusListeners.delete(listener);
};

const streamUrl = () => {
  const base = `${getBackendUrl()}/api/v1/crm/chat/stream`;
  const useToken = isBackendLocalhost() || isElectronApp();
  if (!useToken) return base;
  const token = localStorage.getItem("jwttoken") || localStorage.getItem("token") || "";
  const cleanToken = token.startsWith("Bearer ") ? token.slice(7) : token;
  if (!cleanToken) return base;
  return `${base}?token=${encodeURIComponent(cleanToken)}`;
};

const publicUrl = (url) => url.replace(/token=[^&]+/, "token=hidden");

const handleMessage = (messageEvent) => {
  if (!messageEvent?.data) return;
  let data;
  try {
    data = JSON.parse(messageEvent.data);
  } catch (error) {
    console.error("[chat] event parse failed", error);
    return;
  }
  if (!data?.event || data.event === "chat.ping") return;
  if (data.event === "chat.connected") {
    console.log("[chat] stream open");
    setChatStatus("open", "Connected");
    return;
  }
  emit(data.event, data.payload);
};

const closeSource = () => {
  if (!source) return;
  source.onopen = null;
  source.onmessage = null;
  source.onerror = null;
  source.close();
  source = null;
};

const openStream = () => {
  clearTimeout(reconnectTimer);
  closeSource();
  const url = streamUrl();
  console.log("[chat] stream connecting", publicUrl(url));
  setChatStatus("connecting", "Connecting");
  const next = new EventSource(url, { withCredentials: true });
  source = next;

  next.onopen = () => {
    if (source !== next) return;
    console.log("[chat] stream open", publicUrl(url));
    reconnectDelay = 1000;
    setChatStatus("open", "Connected");
  };

  next.onmessage = (messageEvent) => {
    if (source !== next) return;
    handleMessage(messageEvent);
  };

  next.onerror = () => {
    if (source !== next) return;
    const closed = next.readyState === EventSource.CLOSED;
    console.warn("[chat] stream failed", closed ? "closed" : "connecting");
    setChatStatus("offline", closed ? "Connection closed" : "Reconnecting");
    closeSource();
    reconnectTimer = setTimeout(openStream, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 10000);
  };
};

export const startChatStream = () => {
  if (source && source.readyState !== EventSource.CLOSED) return;
  openStream();
};

export const restartChatStream = () => {
  reconnectDelay = 1000;
  openStream();
};

export const subscribeChatEvents = (handlers) => {
  startChatStream();
  const entries = Object.entries(handlers || {});
  entries.forEach(([type, handler]) => {
    const set = listeners.get(type) || new Set();
    set.add(handler);
    listeners.set(type, set);
  });
  return () => {
    entries.forEach(([type, handler]) => listeners.get(type)?.delete(handler));
  };
};

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && chatStatus !== "open" && (source || statusListeners.size || listeners.size)) {
      startChatStream();
    }
  });
}
