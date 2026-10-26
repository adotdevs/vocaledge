import { getLiveSocket } from "../../../utils/liveSocket";

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

let state = {
  phase: "idle",
  callId: "",
  name: "",
  conversationId: "",
  direction: "",
  muted: false,
  peerMuted: false,
  peerSpeaking: false,
  minimized: false,
  rejoined: false,
  micKind: "",
  pendingUserId: "",
  startedAt: 0,
  statusText: "",
};
const listeners = new Set();
let pc = null;
let localStream = null;
let remoteAudio = null;
let ringTimer = null;
let audioCtx = null;
let myId = "";
let pendingIce = [];
let preparing = null;
let speakFrame = 0;
let speakCtx = null;
let speakAnalyser = null;

const publish = (patch) => {
  state = { ...state, ...patch };
  const shouldRing = state.phase === "incoming" || (state.phase === "outgoing" && state.statusText === "Ringing");
  if (!shouldRing) stopRing();
  listeners.forEach((listener) => listener(state));
};

export const getVoiceState = () => state;

export const subscribeVoice = (listener) => {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
};

const socket = () => getLiveSocket();

const send = (payload) => {
  const live = socket();
  if (!live) return;
  if (live.connected) live.emit("voice:signal", payload);
  else live.once("connect", () => live.emit("voice:signal", payload));
};

let ringToken = 0;
let ringOn = false;
let masterGain = null;
let liveTones = [];

const stopRing = () => {
  ringOn = false;
  ringToken += 1;
  clearInterval(ringTimer);
  ringTimer = null;
  liveTones.forEach((tone) => {
    try { tone.stop(); } catch (error) { /* already stopped */ }
  });
  liveTones = [];
  if (masterGain) {
    try { masterGain.gain.setValueAtTime(0, masterGain.context.currentTime); } catch (error) { /* context already closed */ }
    masterGain = null;
  }
  if (audioCtx) {
    const ctx = audioCtx;
    audioCtx = null;
    ctx.close().catch(() => {});
  }
};

const beep = (frequency, duration) => {
  if (!ringOn || !audioCtx || !masterGain) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.frequency.value = frequency;
  osc.type = "sine";
  gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.05, audioCtx.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
  osc.connect(gain);
  gain.connect(masterGain);
  liveTones.push(osc);
  osc.onended = () => {
    liveTones = liveTones.filter((tone) => tone !== osc);
  };
  osc.start();
  osc.stop(audioCtx.currentTime + duration);
};

const startRing = (outgoing) => {
  stopRing();
  ringOn = true;
  const token = ringToken;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  audioCtx = new Ctx();
  masterGain = audioCtx.createGain();
  masterGain.gain.value = 1;
  masterGain.connect(audioCtx.destination);
  const pulse = () => {
    if (!ringOn || token !== ringToken || !audioCtx) return;
    if (outgoing) beep(440, 0.28);
    else {
      beep(480, 0.16);
      setTimeout(() => {
        if (ringOn && token === ringToken) beep(620, 0.16);
      }, 200);
    }
  };
  pulse();
  ringTimer = setInterval(pulse, outgoing ? 2000 : 1600);
};

const silenceThen = async (work) => {
  stopRing();
  await new Promise((resolve) => setTimeout(resolve, 40));
  return work();
};

const ensureRemoteAudio = () => {
  if (!remoteAudio) {
    remoteAudio = new Audio();
    remoteAudio.autoplay = true;
  }
  return remoteAudio;
};

const stopSpeakingWatch = () => {
  if (speakFrame) cancelAnimationFrame(speakFrame);
  speakFrame = 0;
  speakAnalyser = null;
  if (speakCtx) {
    const ctx = speakCtx;
    speakCtx = null;
    ctx.close().catch(() => {});
  }
};

const watchRemoteSpeaking = (stream) => {
  stopSpeakingWatch();
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx || !stream || !stream.getAudioTracks().length) return;
  try {
  speakCtx = new Ctx();
  speakCtx.resume().catch(() => {});
  const source = speakCtx.createMediaStreamSource(stream);
  speakAnalyser = speakCtx.createAnalyser();
  speakAnalyser.fftSize = 512;
  source.connect(speakAnalyser);
  const data = new Uint8Array(speakAnalyser.fftSize);
  let loudSince = 0;
  let quietSince = 0;
  const tick = () => {
    if (!speakAnalyser) return;
    speakAnalyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i += 1) {
      const sample = (data[i] - 128) / 128;
      sum += sample * sample;
    }
    const loud = Math.sqrt(sum / data.length) > 0.02 && !state.peerMuted && state.phase === "active";
    const now = Date.now();
    if (loud) {
      quietSince = 0;
      if (!loudSince) loudSince = now;
      if (!state.peerSpeaking && now - loudSince > 90) publish({ peerSpeaking: true });
    } else {
      loudSince = 0;
      if (!quietSince) quietSince = now;
      if (state.peerSpeaking && now - quietSince > 320) publish({ peerSpeaking: false });
    }
    speakFrame = requestAnimationFrame(tick);
  };
  speakFrame = requestAnimationFrame(tick);
  } catch (error) {
    stopSpeakingWatch();
  }
};

const stopMedia = () => {
  pendingIce = [];
  stopSpeakingWatch();
  if (localStream) {
    localStream.getTracks().forEach((track) => track.stop());
    localStream = null;
  }
  if (pc) {
    pc.ontrack = null;
    pc.onicecandidate = null;
    pc.onconnectionstatechange = null;
    pc.close();
    pc = null;
  }
  if (remoteAudio) {
    remoteAudio.srcObject = null;
  }
};

const reset = (statusText = "") => {
  const hadCall = Boolean(state.callId);
  stopRing();
  stopMedia();
  preparing = null;
  publish({
    phase: statusText ? "ended" : "idle",
    callId: "",
    name: state.name,
    conversationId: "",
    direction: "",
    muted: false,
    peerMuted: false,
    peerSpeaking: false,
    minimized: false,
    rejoined: false,
    micKind: "",
    pendingUserId: "",
    startedAt: 0,
    statusText,
  });
  if (hadCall) window.dispatchEvent(new CustomEvent("crm-voice-logged"));
  if (statusText) setTimeout(() => publish({ phase: "idle", name: "", statusText: "" }), 1800);
};

const flushIce = async () => {
  if (!pc || !pc.remoteDescription) return;
  const queued = pendingIce.splice(0);
  for (const candidate of queued) {
    try {
      await pc.addIceCandidate(candidate);
    } catch (error) {
      console.warn("[voice] ice failed", error);
    }
  }
};

const describeMic = (error) => {
  const name = error?.name || "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError") {
    return { micKind: "blocked", statusText: "Microphone is blocked" };
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return { micKind: "missing", statusText: "No microphone found" };
  }
  return { micKind: "failed", statusText: "Microphone could not be used" };
};

const microphonePermission = async () => {
  if (!navigator.permissions?.query) return "unknown";
  try {
    const status = await navigator.permissions.query({ name: "microphone" });
    return status.state || "unknown";
  } catch (error) {
    return "unknown";
  }
};

const hasLiveCall = () => {
  if (!pc || state.rejoined) return false;
  return pc.connectionState === "connecting" || pc.connectionState === "connected";
};

const askForMicrophone = async () => {
  if (navigator.permissions?.query) {
    try {
      const status = await navigator.permissions.query({ name: "microphone" });
      if (status.state === "denied") {
        const error = new Error("Microphone is blocked");
        error.name = "NotAllowedError";
        throw error;
      }
    } catch (error) {
      if (error?.name === "NotAllowedError") throw error;
    }
  }
  return navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true },
    video: false,
  });
};
const preparePeer = async () => {
  localStream = await askForMicrophone();
  pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
  pc.ontrack = (event) => {
    const audio = ensureRemoteAudio();
    const stream = event.streams[0];
    audio.srcObject = stream;
    audio.play().catch(() => {});
    watchRemoteSpeaking(stream);
  };
  pc.onicecandidate = (event) => {
    if (!event.candidate || !state.callId) return;
    send({ type: "ice", callId: state.callId, candidate: event.candidate.toJSON() });
  };
  pc.onconnectionstatechange = () => {
    if (!pc) return;
    if (pc.connectionState === "connected") publish({ phase: "active", startedAt: state.startedAt || Date.now(), statusText: "" });
    if (pc.connectionState === "failed") hangUp();
  };
};

const makeOffer = async () => {
  if (!pc) return;
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  send({ type: "offer", callId: state.callId, sdp: pc.localDescription });
};

const showExistingCall = (message) => {
  const callId = String(message?.callId || "");
  if (!callId) return;
  if (state.callId === callId && state.phase !== "idle" && state.phase !== "ended") return;
  const direction = message.direction === "in" ? "in" : "out";
  const ringing = message.status === "ringing";
  const hasMedia = Boolean(pc && localStream);
  publish({
    phase: ringing ? (direction === "out" ? "outgoing" : "incoming") : "active",
    callId,
    name: message.peerName || "Agent",
    conversationId: message.conversationId || "",
    direction,
    muted: false,
    peerMuted: false,
    peerSpeaking: false,
    minimized: false,
    rejoined: !hasMedia && !ringing,
    micKind: "",
    pendingUserId: "",
    startedAt: message.connectedAt || (ringing ? 0 : Date.now()),
    statusText: ringing ? (direction === "out" ? "Ringing" : "Incoming voice call") : "",
  });
  if (ringing) startRing(direction === "out");
};

export const startVoiceCall = async ({ userId, name, conversationId }) => {
  if (!userId || userId === myId) return;
  if (["outgoing", "active", "connecting", "incoming"].includes(state.phase) || (state.phase === "mic" && state.callId)) {
    publish({ minimized: false });
    return;
  }
  if (await microphonePermission() === "denied") {
    publish({
      phase: "mic",
      callId: "",
      name: name || "Agent",
      conversationId: conversationId || "",
      direction: "out",
      muted: false,
      peerMuted: false,
      peerSpeaking: false,
      minimized: false,
      rejoined: false,
      micKind: "blocked",
      pendingUserId: userId,
      startedAt: 0,
      statusText: "Microphone is blocked",
    });
    return;
  }
  const callId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  publish({
    phase: "outgoing",
    callId,
    name: name || "Agent",
    conversationId: conversationId || "",
    direction: "out",
    muted: false,
    peerMuted: false,
    peerSpeaking: false,
    minimized: false,
    rejoined: false,
    micKind: "",
    pendingUserId: "",
    startedAt: 0,
    statusText: "Calling…",
  });
  send({
    type: "invite",
    callId,
    to: userId,
    fromName: window.__crmVoiceName || "Agent",
    toName: name || "Agent",
    conversationId: conversationId || "",
  });
};

export const toggleVoiceMinimized = () => publish({ minimized: !state.minimized });

export const acceptVoiceCall = async () => {
  if (state.phase !== "incoming" || !state.callId) return;
  publish({ phase: "connecting", statusText: "Connecting…", peerMuted: false });
  try {
    await silenceThen(() => preparePeer());
  } catch (error) {
    publish({ phase: "mic", ...describeMic(error) });
    return;
  }
  send({ type: "accept", callId: state.callId });
};

export const retryMicrophone = async () => {
  if (state.phase !== "mic") return;
  if (!state.callId && state.pendingUserId) {
    const target = { userId: state.pendingUserId, name: state.name, conversationId: state.conversationId };
    publish({ phase: "idle", pendingUserId: "", statusText: "" });
    await startVoiceCall(target);
    return;
  }
  if (!state.callId) return;
  publish({ statusText: "Asking for the microphone…" });
  try {
    await preparePeer();
  } catch (error) {
    publish({ phase: "mic", ...describeMic(error) });
    return;
  }
  if (state.direction === "in") {
    publish({ phase: "connecting", statusText: "Connecting…" });
    send({ type: "accept", callId: state.callId });
    return;
  }
  publish({ phase: "connecting", statusText: "Connecting…" });
  try {
    await makeOffer();
  } catch (error) {
    hangUp();
  }
};

export const declineVoiceCall = () => {
  if (!state.callId) {
    reset("");
    return;
  }
  const outgoing = state.direction === "out";
  if (state.phase === "mic") {
    send({ type: outgoing ? "hangup" : "reject", callId: state.callId });
  } else {
    send({ type: state.phase === "outgoing" ? "cancel" : "reject", callId: state.callId });
  }
  reset(outgoing ? "Call cancelled" : "");
};

export const hangUp = () => {
  if (state.callId && (state.phase === "active" || state.phase === "connecting")) {
    send({ type: "hangup", callId: state.callId });
  } else if (state.callId && state.phase === "outgoing") {
    send({ type: "cancel", callId: state.callId });
  }
  reset("Call ended");
};

export const toggleMute = () => {
  if (!localStream) return;
  const next = !state.muted;
  localStream.getAudioTracks().forEach((track) => {
    track.enabled = !next;
  });
  if (state.callId) send({ type: "mute", callId: state.callId, muted: next });
  publish({ muted: next });
};

const onSignal = async (message) => {
  const type = message?.type;
  const callId = String(message?.callId || "");
  if (!type) return;

  if (type === "invite") {
    if (String(message.from || "") === String(myId || "")) return;
    if (state.callId === callId && state.phase !== "idle" && state.phase !== "ended") return;
    if (hasLiveCall() && state.callId !== callId) {
      send({ type: "busy", callId });
      return;
    }
    publish({
      phase: "incoming",
      callId,
      name: message.fromName || "Agent",
      conversationId: message.conversationId || "",
      direction: "in",
      muted: false,
      peerMuted: false,
      peerSpeaking: false,
      minimized: false,
      rejoined: false,
      micKind: "",
      pendingUserId: "",
      statusText: "Incoming voice call",
    });
    startRing(false);
    const permission = await microphonePermission();
    if (permission === "denied" && state.callId === callId && state.phase === "incoming") {
      publish({ phase: "mic", micKind: "blocked", statusText: "Microphone is blocked" });
    }
    return;
  }

  if (type === "resume") {
    showExistingCall(message);
    return;
  }

  if (callId && state.callId && callId !== state.callId) return;

  if (type === "ringing") {
    if (state.phase !== "outgoing" || callId !== state.callId) return;
    publish({ statusText: "Ringing" });
    startRing(true);
    return;
  }

  if (type === "offline") {
    if (callId && state.callId && callId !== state.callId) return;
    reset("Offline");
    return;
  }

  if (type === "accept") {
    publish({ phase: "connecting", statusText: "Connecting…" });
    try {
      await silenceThen(() => preparePeer());
      await makeOffer();
    } catch (error) {
      publish({ phase: "mic", ...describeMic(error) });
    }
    return;
  }

  if (type === "offer" && message.sdp && pc) {
    await pc.setRemoteDescription(message.sdp);
    await flushIce();
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    send({ type: "answer", callId: state.callId, sdp: pc.localDescription });
    publish({ phase: "active", startedAt: state.startedAt || Date.now(), statusText: "" });
    return;
  }

  if (type === "answer" && message.sdp && pc) {
    await pc.setRemoteDescription(message.sdp);
    await flushIce();
    publish({ phase: "active", startedAt: Date.now(), statusText: "" });
    return;
  }

  if (type === "ice" && message.candidate) {
    if (!pc || !pc.remoteDescription) pendingIce.push(message.candidate);
    else {
      try {
        await pc.addIceCandidate(message.candidate);
      } catch (error) {
        console.warn("[voice] ice failed", error);
      }
    }
    return;
  }

  if (type === "mute") {
    const peerMuted = Boolean(message.muted);
    publish({ peerMuted, peerSpeaking: peerMuted ? false : state.peerSpeaking });
    return;
  }

  if (type === "reject") {
    reset("Call declined");
    return;
  }
  if (type === "busy") {
    reset(message.reason === "busy" ? "On another call" : (message.reason || "Busy"));
    return;
  }
  if (type === "cancel") {
    reset("");
    return;
  }
  if (type === "ended") {
    const text = message.reason === "missed"
      ? (state.direction === "out" ? "No answer" : "")
      : message.reason === "rejected"
        ? "Call declined"
        : message.reason === "busy"
          ? "On another call"
          : message.reason === "cancelled"
            ? ""
            : "Call ended";
    reset(text);
  }
};

export const bindVoiceIdentity = (userId, name) => {
  myId = String(userId || "");
  window.__crmVoiceName = name || "Agent";
};

let listening = false;
const attachSignal = () => {
  const live = socket();
  if (!live) return;
  live.off("voice:signal", onSignal);
  live.on("voice:signal", onSignal);
};
export const listenForVoice = () => {
  if (listening || typeof window === "undefined") return;
  listening = true;
  attachSignal();
  window.addEventListener("crm-live-socket-ready", () => {
    attachSignal();
    send({ type: "sync" });
  });
  send({ type: "sync" });
  window.addEventListener("crm-voice-start", (event) => {
    const detail = event.detail || {};
    startVoiceCall(detail);
  });
  window.addEventListener("crm-voice-force-end", () => {
    if (state.callId && state.phase === "incoming") send({ type: "reject", callId: state.callId });
    else if (state.callId && state.phase !== "idle" && state.phase !== "ended") send({ type: "hangup", callId: state.callId });
    reset("");
  });
  window.addEventListener("beforeunload", () => {
    if (state.callId && state.phase !== "idle") send({ type: "hangup", callId: state.callId });
  });
};
