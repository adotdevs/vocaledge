import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useAuthUser } from "react-auth-kit";
import { CallEnd, CloseFullscreen, Mic, MicOff, Phone } from "@mui/icons-material";
import {
  acceptVoiceCall,
  bindVoiceIdentity,
  declineVoiceCall,
  getVoiceState,
  hangUp,
  listenForVoice,
  retryMicrophone,
  subscribeVoice,
  toggleMute,
  toggleVoiceMinimized,
} from "../voiceCall";
import "./VoiceCall.css";

const LockIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
    <path fill="currentColor" d="M12 1.8A5.2 5.2 0 0 0 6.8 7v3.1H6a2 2 0 0 0-2 2V20a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.9a2 2 0 0 0-2-2h-.8V7A5.2 5.2 0 0 0 12 1.8zm-3.2 8.3V7a3.2 3.2 0 0 1 6.4 0v3.1H8.8z" />
  </svg>
);

const MicGuide = ({ kind, name }) => {
  if (kind === "missing") {
    return (
      <div className="crm-mic-guide">
        <div className="crm-mic-missing" aria-hidden="true"><MicOff /></div>
        <h3>No microphone found</h3>
        <p>Plug in a microphone or headset, then press the green button.</p>
      </div>
    );
  }
  const host = typeof window !== "undefined" ? window.location.host : "this site";
  return (
    <div className="crm-mic-guide">
      <div className="crm-mic-up">
        <span aria-hidden="true">↑</span>
        <p>Look at the top of the browser. The lock is there, not in this box.</p>
      </div>
      <h3>Allow the microphone</h3>
      <p className="crm-mic-lead">The call with {name || "this person"} is waiting. The browser is blocking the mic.</p>
      <ol className="crm-mic-steps">
        <li>
          <b>1</b>
          <div>
            <strong>Click the lock next to the address</strong>
            <div className="crm-mic-bar">
              <span className="crm-mic-lock"><LockIcon /></span>
              <span className="crm-mic-host">{host}</span>
              <em>Click the lock</em>
            </div>
          </div>
        </li>
        <li>
          <b>2</b>
          <div>
            <strong>Set Microphone to Allow</strong>
            <div className="crm-mic-choice">
              <Mic />
              <span>Microphone</span>
              <i>Allow</i>
            </div>
          </div>
        </li>
        <li>
          <b>3</b>
          <div>
            <strong>Press the green button below</strong>
          </div>
        </li>
      </ol>
    </div>
  );
};

const formatDuration = (startedAt) => {
  if (!startedAt) return "00:00";
  const total = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const minutes = String(Math.floor(total / 60)).padStart(2, "0");
  const seconds = String(total % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
};

const VoiceCall = () => {
  const authUser = useAuthUser();
  const navigate = useNavigate();
  const [call, setCall] = useState(getVoiceState());
  const [clock, setClock] = useState("00:00");
  const person = authUser()?.user;

  useEffect(() => {
    const name = `${person?.firstName || ""} ${person?.lastName || ""}`.trim() || "Agent";
    bindVoiceIdentity(person?._id || "", name);
    listenForVoice();
  }, [person?._id, person?.firstName, person?.lastName]);

  useEffect(() => subscribeVoice(setCall), []);

  useEffect(() => {
    if (call.phase !== "active") return undefined;
    setClock(formatDuration(call.startedAt));
    const timer = setInterval(() => setClock(formatDuration(call.startedAt)), 1000);
    return () => clearInterval(timer);
  }, [call.phase, call.startedAt]);

  if (call.phase === "idle") return null;

  const initial = (call.name || "A").slice(0, 1).toUpperCase();
  const accept = async () => {
    await acceptVoiceCall();
    if (call.conversationId) navigate(`/admin/crm/chat/chats/${call.conversationId}`);
  };
  const statusLabel = call.phase === "active"
    ? clock
    : call.statusText === "Ringing"
      ? "Ringing"
      : call.statusText === "Offline"
        ? "Offline"
        : (call.statusText || "Voice call");

  if (call.minimized && (call.phase === "active" || call.phase === "connecting")) {
    return createPortal(
      <button type="button" className="crm-voice-mini" onClick={toggleVoiceMinimized}>
        <Phone />
        <span>{call.name}</span>
        <strong>
          {call.peerMuted ? "Muted" : call.peerSpeaking ? "Speaking" : call.phase === "active" ? clock : "Connecting"}
        </strong>
      </button>,
      document.body
    );
  }

  return createPortal(
    <section className={`crm-voice is-${call.phase}`} role="dialog" aria-label="Voice call">
      {(call.phase === "active" || call.phase === "connecting") && (
        <button type="button" className="crm-voice-fold" aria-label="Minimize call" onClick={toggleVoiceMinimized}>
          <CloseFullscreen />
        </button>
      )}
      {call.phase !== "mic" && <div className="crm-voice-person">
        <div className={`crm-voice-avatar ${call.phase === "incoming" || call.statusText === "Ringing" ? "is-ringing" : ""} ${call.peerSpeaking ? "is-speaking" : ""} ${call.statusText === "Offline" ? "is-offline" : ""}`}>{initial}</div>
        <p className="crm-voice-kicker">
          {call.phase === "incoming" && "Incoming voice call"}
          {call.phase === "outgoing" && (call.statusText === "Ringing" ? "Ringing" : call.statusText === "Offline" ? "Not connected" : "Calling")}
          {call.phase === "connecting" && "Connecting"}
          {call.phase === "mic" && "Microphone needed"}
          {call.phase === "active" && (call.rejoined ? "Call still open" : "Connected")}
          {call.phase === "ended" && (call.statusText === "Offline" ? "Not connected" : "Finished")}
        </p>
        <p className="crm-voice-name">{call.name || "Agent"}</p>
        <p className={`crm-voice-status ${call.statusText === "Ringing" ? "is-live" : ""} ${call.statusText === "Offline" ? "is-off" : ""}`}>
          {call.phase === "mic" ? "The microphone is off" : statusLabel}
        </p>
        {call.phase === "active" && call.peerMuted && (
          <p className="crm-voice-peer-mute"><MicOff /> {call.name || "They"} muted their microphone</p>
        )}
        {call.phase === "active" && !call.peerMuted && call.peerSpeaking && (
          <p className="crm-voice-speaking"><span className="crm-voice-waves" aria-hidden="true"><i /><i /><i /><i /><i /></span> Speaking</p>
        )}
        {call.phase === "active" && !call.peerMuted && !call.peerSpeaking && !call.rejoined && (
          <p className="crm-voice-quiet">Quiet</p>
        )}
      </div>}
      {call.phase === "mic" && <MicGuide kind={call.micKind} name={call.name} />}
      {call.rejoined && call.phase === "active" && (
        <p className="crm-voice-help">This call is still open. End it before starting another.</p>
      )}
      <div className="crm-voice-actions">
        {call.phase === "incoming" && (
          <>
            <button type="button" className="crm-voice-btn decline" onClick={declineVoiceCall}>
              <CallEnd />
              <span>Decline</span>
            </button>
            <button type="button" className="crm-voice-btn accept" onClick={accept}>
              <Phone />
              <span>Accept</span>
            </button>
          </>
        )}
        {call.phase === "outgoing" && (
          <button type="button" className="crm-voice-btn decline" onClick={declineVoiceCall}>
            <CallEnd />
            <span>Cancel</span>
          </button>
        )}
        {call.phase === "mic" && (
          <>
            <button type="button" className="crm-mic-go" onClick={retryMicrophone}>
              {call.micKind === "missing" ? "Try again" : "I allowed it"}
            </button>
            <button type="button" className="crm-mic-cancel" onClick={declineVoiceCall}>
              Cancel the call
            </button>
          </>
        )}
        {(call.phase === "active" || call.phase === "connecting") && (
          <>
            {!call.rejoined && (
              <button type="button" className={`crm-voice-btn mute ${call.muted ? "is-muted" : ""}`} onClick={toggleMute}>
                {call.muted ? <MicOff /> : <Mic />}
                <span>{call.muted ? "Unmute" : "Mute"}</span>
              </button>
            )}
            <button type="button" className="crm-voice-btn decline" onClick={hangUp}>
              <CallEnd />
              <span>End</span>
            </button>
          </>
        )}
      </div>
    </section>,
    document.body
  );
};

export default VoiceCall;
