import { endLiveSocket } from "./liveSocket";
import { stopChatStream } from "../jsx/Admin/CRM/chatEvents";

export function endLiveSession() {
  window.dispatchEvent(new CustomEvent("crm-voice-force-end"));
  endLiveSocket();
  stopChatStream();
}
