import { io } from "socket.io-client";
import { getBackendUrl } from "../config/appConfig";

let socket = null;
let socketStatus = "offline";
let socketDetail = "Not connected";
let sessionClosed = false;
const listeners = new Set();

const publish = (state, detail) => {
  socketStatus = state;
  if (detail) socketDetail = detail;
  listeners.forEach((listener) => listener({ state: socketStatus, detail: socketDetail }));
};

export function subscribeSocketStatus(listener) {
  listeners.add(listener);
  listener({ state: socketStatus, detail: socketDetail });
  return () => listeners.delete(listener);
}

export function getLiveSocket() {
  if (sessionClosed) return null;
  if (socket) return socket;
  const cookieMatch = typeof document !== "undefined"
    ? document.cookie.match(/(?:^|;\s*)(?:jwttoken|_auth)=([^;]+)/)
    : null;
  const cookieToken = cookieMatch ? decodeURIComponent(cookieMatch[1]) : "";
  const token = localStorage.getItem("jwttoken") || localStorage.getItem("token") || cookieToken || "";
  const cleanToken = token.startsWith("Bearer ") ? token.slice(7) : token;
  const url = getBackendUrl();
  console.log("[live] socket connecting", url);
  publish("connecting", "Connecting");
  socket = io(url, {
    path: "/socket.io",
    withCredentials: true,
    transports: ["polling", "websocket"],
    upgrade: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    timeout: 20000,
    auth: cleanToken ? { token: `Bearer ${cleanToken}` } : {},
    query: cleanToken ? { token: cleanToken } : {},
  });
  const forwardChat = (data) => {
    window.dispatchEvent(new CustomEvent("crm-chat-stream", { detail: data }));
  };
  socket.on("connect", () => {
    console.log("[live] socket connected", socket.id);
    publish("open", "Connected");
  });
  socket.on("chat.event", forwardChat);
  socket.on("disconnect", () => {
    console.warn("[live] socket disconnected");
    publish("connecting", "Reconnecting");
  });
  socket.on("connect_error", (error) => {
    console.warn("[live] socket error", error?.message || error);
    publish("offline", error?.message || "Socket error");
  });
  window.dispatchEvent(new CustomEvent("crm-live-socket-ready"));
  return socket;
}

export function endLiveSocket() {
  sessionClosed = true;
  if (!socket) return;
  socket.io.reconnection(false);
  socket.removeAllListeners();
  socket.disconnect();
  socket = null;
  publish("offline", "Signed out");
}

export function allowLiveSession() {
  sessionClosed = false;
}
