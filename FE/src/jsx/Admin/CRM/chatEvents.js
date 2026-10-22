import { getBackendUrl } from "../../../config/appConfig";

let subscribers = 0;
const listeners = new Map();
let abortController = null;
let reconnectTimer = null;
let reconnectDelay = 1000;
let stopped = false;

const emit = (type, payload) => {
  const handlers = listeners.get(type);
  if (!handlers) return;
  handlers.forEach((handler) => {
    try {
      handler(payload);
    } catch (error) {
      console.error("Chat event handler failed:", error);
    }
  });
};

const parseBlock = (block) => {
  let eventName = "message";
  const dataLines = [];
  block.split("\n").forEach((line) => {
    if (line.startsWith("event:")) eventName = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  });
  if (!dataLines.length || eventName === "chat.ping") return;
  try {
    emit(eventName, JSON.parse(dataLines.join("\n")));
  } catch (error) {
    console.error("Chat event parse failed:", error);
  }
};

const connect = async () => {
  if (stopped || abortController) return;
  const controller = new AbortController();
  abortController = controller;
  const token = localStorage.getItem("jwttoken") || localStorage.getItem("token") || "";
  const cleanToken = token.startsWith("Bearer ") ? token.slice(7) : token;
  const headers = {};
  if (cleanToken) headers.Authorization = `Bearer ${cleanToken}`;

  try {
    const response = await fetch(`${getBackendUrl()}/api/v1/crm/chat/stream`, {
      method: "GET",
      headers,
      credentials: "include",
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok || !response.body) throw new Error(`Chat stream ${response.status}`);
    reconnectDelay = 1000;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (!stopped) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() || "";
      blocks.forEach(parseBlock);
    }
  } catch (error) {
    if (controller.signal.aborted || stopped) return;
  } finally {
    if (abortController === controller) abortController = null;
  }

  if (!stopped && subscribers) {
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 15000);
  }
};

const disconnect = () => {
  stopped = true;
  clearTimeout(reconnectTimer);
  if (abortController) {
    abortController.abort();
    abortController = null;
  }
};

export const subscribeChatEvents = (handlers) => {
  stopped = false;
  subscribers += 1;
  const entries = Object.entries(handlers || {});
  entries.forEach(([type, handler]) => {
    const set = listeners.get(type) || new Set();
    set.add(handler);
    listeners.set(type, set);
  });
  connect();
  return () => {
    entries.forEach(([type, handler]) => listeners.get(type)?.delete(handler));
    subscribers = Math.max(0, subscribers - 1);
    if (!subscribers) disconnect();
  };
};
