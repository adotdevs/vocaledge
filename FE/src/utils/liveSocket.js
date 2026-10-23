import { io } from "socket.io-client";
import { getBackendUrl, isBackendLocalhost, isElectronApp } from "../config/appConfig";

let socket = null;
let socketStatus = "offline";
let socketDetail = "Not connected";
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
  if (socket) return socket;
  const token = localStorage.getItem("jwttoken") || localStorage.getItem("token") || "";
  const cleanToken = token.startsWith("Bearer ") ? token.slice(7) : token;
  const useToken = isBackendLocalhost() || isElectronApp();
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
    auth: useToken && cleanToken ? { token: `Bearer ${cleanToken}` } : {},
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
  return socket;
}
