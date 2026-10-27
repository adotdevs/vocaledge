import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useAuthUser } from "react-auth-kit";
import { CallEnd, ChatBubbleOutline, CloseFullscreen, Mic, MicOff, Phone, Videocam, VideocamOff } from "@mui/icons-material";
import useLiveCrmUser from "../useLiveCrmUser";
import {
  acceptVoiceCall,
  bindVoiceIdentity,
  declineVoiceCall,
  getVoiceState,
  hangUp,
  listenForVoice,
  retryMicrophone,
  subscribeCallMedia,
  subscribeVoice,
  toggleCamera,
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
  const { can, role, ready } = useLiveCrmUser();
  const voiceAllowed = role === "superadmin" || can("canAccessChat");
  const [call, setCall] = useState(getVoiceState());
  const [clock, setClock] = useState("00:00");
  const person = authUser()?.user;
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  useEffect(() => {
    window.__crmCanVoiceCall = voiceAllowed;
    if (ready && !voiceAllowed) {
      window.dispatchEvent(new CustomEvent("crm-voice-force-end"));
    }
  }, [voiceAllowed, ready]);

  useEffect(() => {
    const name = `${person?.firstName || ""} ${person?.lastName || ""}`.trim() || "Agent";
    bindVoiceIdentity(person?._id || "", name);
    listenForVoice();
  }, [person?._id, person?.firstName, person?.lastName]);

  useEffect(() => subscribeVoice(setCall), []);

  useEffect(() => {
    const attach = (media) => {
      if (remoteVideoRef.current && remoteVideoRef.current.srcObject !== media.remote) {
        remoteVideoRef.current.srcObject = media.remote || null;
        remoteVideoRef.current.play?.().catch(() => {});
      }
      if (localVideoRef.current && localVideoRef.current.srcObject !== media.local) {
        localVideoRef.current.srcObject = media.local || null;
        localVideoRef.current.play?.().catch(() => {});
      }
    };
    return subscribeCallMedia(attach);
  }, [call.cameraOn, call.peerCameraOn, call.phase]);

  useEffect(() => {
    if (call.phase !== "active") return undefined;
    setClock(formatDuration(call.startedAt));
    const timer = setInterval(() => setClock(formatDuration(call.startedAt)), 1000);
    return () => clearInterval(timer);
  }, [call.phase, call.startedAt]);

  if (call.phase === "idle") return null;

  const initial = (call.name || "A").slice(0, 1).toUpperCase();
  const dark = call.phase === "incoming";
  const live = call.phase === "active" || call.phase === "connecting";
  const canFold = live || call.phase === "outgoing";
  const openChat = () => {
    if (call.conversationId) navigate(`/admin/crm/chat/chats/${call.conversationId}`);
  };
  const accept = async () => {
    await acceptVoiceCall();
    openChat();
  };
  const videoLive = Boolean(call.cameraOn || call.peerCameraOn);
  const remoteVisible = Boolean(call.peerCameraOn && (call.phase === "active" || call.phase === "connecting"));
  const headline = call.phase === "incoming"
    ? (call.peerCameraOn ? "Incoming video call..." : "Incoming call...")
    : call.phase === "outgoing"
      ? (call.statusText === "Offline" ? "Not connected" : call.statusText === "Ringing" ? "Ringing..." : "Calling...")
      : call.phase === "connecting"
        ? "Connecting..."
        : call.phase === "ended"
          ? (call.statusText || "Call ended")
          : "";
  const showVideo = (call.cameraOn || remoteVisible) && call.phase !== "mic" && call.phase !== "ended";
  const cameraButton = !call.rejoined ? (
    <button type="button" className={`crm-voice-btn camera ${call.cameraOn ? "is-on" : ""}`} onClick={toggleCamera}>
      <span className="crm-voice-orb">{call.cameraOn ? <Videocam /> : <VideocamOff />}</span>
      <em>{call.cameraOn ? "Camera on" : "Camera off"}</em>
    </button>
  ) : null;

  if (call.minimized && canFold) {
    return createPortal(
      <button type="button" className="crm-voice-mini" onClick={toggleVoiceMinimized}>
        {videoLive ? <Videocam /> : <Phone />}
        <span>{call.name}</span>
        <strong>
          {call.peerMuted ? "Muted" : call.peerSpeaking ? "Speaking" : call.phase === "active" ? clock : "Connecting"}
        </strong>
      </button>,
      document.body
    );
  }

  return createPortal(
    <section className={`crm-voice ${dark ? "is-dark" : "is-light"} is-${call.phase} ${showVideo ? "has-video" : ""}`} role="dialog" aria-label={videoLive ? "Video call" : "Voice call"}>
      {canFold && (
        <button type="button" className="crm-voice-fold" aria-label="Minimize call" onClick={toggleVoiceMinimized}>
          <CloseFullscreen />
        </button>
      )}
      {call.phase !== "mic" && (
        <div className="crm-voice-person">
          {showVideo && (
            <div className="crm-video-stage">
              {remoteVisible && (
                <video key="remote" ref={remoteVideoRef} className="crm-video-remote" autoPlay playsInline webkit-playsinline="" muted />
              )}
              {call.cameraOn && (
                <video
                  key="local"
                  ref={localVideoRef}
                  className={remoteVisible ? "crm-video-local" : "crm-video-remote is-self"}
                  autoPlay
                  playsInline
                  webkit-playsinline=""
                  muted
                />
              )}
              <div className="crm-video-meta">
                <strong>{call.name || "Agent"}</strong>
                <span>{call.phase === "active" ? clock : (headline || "Video")}</span>
              </div>
            </div>
          )}
          {!showVideo && (
            <>
              <div className={`crm-voice-avatar ${call.phase === "incoming" || call.statusText === "Ringing" ? "is-ringing" : ""} ${call.peerSpeaking ? "is-speaking" : ""} ${call.statusText === "Offline" ? "is-offline" : ""}`}>{initial}</div>
              <p className="crm-voice-name">{call.name || "Agent"}</p>
            </>
          )}
          {!showVideo && (call.phase === "active" ? <p className="crm-voice-clock">{clock}</p> : headline && <p className="crm-voice-sub">{headline}</p>)}
          {showVideo && call.phase !== "active" && headline && <p className="crm-voice-sub">{headline}</p>}
          {call.phase === "active" && (
            <p className={`crm-voice-live ${call.peerMuted ? "is-muted" : ""} ${call.peerSpeaking ? "is-speaking" : ""}`}>
              <span className="crm-voice-bars" aria-hidden="true"><i /><i /><i /><i /></span>
              {call.rejoined ? "Call still open" : call.peerMuted ? "Muted" : call.peerSpeaking ? "Speaking" : "Connected"}
            </p>
          )}
          {call.phase !== "active" && call.phase !== "ended" && (
            <p className="crm-voice-kind">{videoLive ? <Videocam /> : <Phone />} {videoLive ? "Video call" : "Audio call"}</p>
          )}
          {call.phase === "active" && call.muted && <p className="crm-voice-you-mute">Your microphone is muted</p>}
          {call.videoError && <p className="crm-voice-you-mute">{call.videoError}</p>}
        </div>
      )}
      {call.phase === "mic" && <MicGuide kind={call.micKind} name={call.name} />}
      {call.rejoined && call.phase === "active" && (
        <p className="crm-voice-help">This call is still open. End it before starting another.</p>
      )}
      <div className="crm-voice-actions">
        {call.phase === "incoming" && (
          <>
            <button type="button" className="crm-voice-btn decline" onClick={declineVoiceCall}>
              <span className="crm-voice-orb"><CallEnd /></span>
              <em>Decline</em>
            </button>
            {cameraButton}
            <button type="button" className="crm-voice-btn accept" onClick={accept}>
              <span className="crm-voice-orb"><Phone /></span>
              <em>Accept</em>
            </button>
          </>
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
        {(call.phase === "outgoing" || live) && (
          <>
            {call.phase !== "active" || !call.rejoined ? (
              <button type="button" className={`crm-voice-btn mute ${call.muted ? "is-muted" : ""}`} onClick={toggleMute}>
                <span className="crm-voice-orb">{call.muted ? <MicOff /> : <Mic />}</span>
                <em>{call.muted ? "Unmute" : "Mute"}</em>
              </button>
            ) : null}
            {cameraButton}
            <button type="button" className="crm-voice-btn decline" onClick={call.phase === "outgoing" ? declineVoiceCall : hangUp}>
              <span className="crm-voice-orb"><CallEnd /></span>
              <em>End call</em>
            </button>
            {call.conversationId && (
              <button type="button" className="crm-voice-btn chat" onClick={openChat}>
                <span className="crm-voice-orb"><ChatBubbleOutline /></span>
                <em>Chat</em>
              </button>
            )}
          </>
        )}
      </div>
    </section>,
    document.body
  );
};

export default VoiceCall;
