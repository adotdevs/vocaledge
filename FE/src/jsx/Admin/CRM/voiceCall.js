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
  cameraOn: false,
  peerCameraOn: false,
  videoError: "",
  ringLocked: false,
};
const listeners = new Set();
const mediaListeners = new Set();
let pc = null;
let localStream = null;
let remoteAudio = null;
let stagedVideoTrack = null;
let localVideoSender = null;
let remoteMediaStream = null;
let previewStream = null;
let needsRenegotiation = false;
let lastHandledOffer = "";
let iceRestarts = 0;
let ringTimer = null;
let audioCtx = null;
let myId = "";
let pendingIce = [];
let pendingOffer = null;
let sdpChain = Promise.resolve();
let speakFrame = 0;
let speakCtx = null;
let speakAnalyser = null;

const publish = (patch) => {
  state = { ...state, ...patch };
  const answered = state.phase === "active" || state.phase === "connecting";
  if (answered) state.ringLocked = true;
  const shouldRing = !answered && !state.ringLocked && (state.phase === "incoming" || (state.phase === "outgoing" && state.statusText === "Ringing"));
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
let ringTimeouts = [];

const rememberTimeout = (id) => {
  ringTimeouts.push(id);
  return id;
};

const silenceThisRing = () => {
  ringOn = false;
  ringToken += 1;
  clearInterval(ringTimer);
  ringTimer = null;
  ringTimeouts.forEach((id) => clearTimeout(id));
  ringTimeouts = [];
  liveTones.forEach((tone) => {
    try { tone.onended = null; } catch (error) { /* already ended */ }
    try { tone.stop(); } catch (error) { /* already stopped */ }
    try { tone.disconnect(); } catch (error) { /* already disconnected */ }
  });
  liveTones = [];
  if (masterGain) {
    try {
      masterGain.gain.cancelScheduledValues(0);
      masterGain.gain.setValueAtTime(0, masterGain.context.currentTime);
      masterGain.disconnect();
    } catch (error) { /* context already closed */ }
    masterGain = null;
  }
  if (audioCtx) {
    const ctx = audioCtx;
    audioCtx = null;
    try { ctx.suspend(); } catch (error) { /* already suspended */ }
    ctx.close().catch(() => {});
  }
};

const stopRing = () => {
  const stops = (typeof window !== "undefined" && window.__crmVoiceRingStops) || [silenceThisRing];
  stops.forEach((stop) => {
    try { stop(); } catch (error) { /* a previous page copy already stopped */ }
  });
};

if (typeof window !== "undefined") {
  (window.__crmVoiceRingStops || []).forEach((stop) => {
    try { stop(); } catch (error) { /* a previous page copy already stopped */ }
  });
  window.__crmVoiceRingStops = [silenceThisRing];
}

const lockRingOff = () => {
  state.ringLocked = true;
  stopRing();
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
  if (state.ringLocked || state.phase === "active" || state.phase === "connecting" || state.phase === "ended") return;
  stopRing();
  ringOn = true;
  const token = ringToken;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  audioCtx = new Ctx();
  if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  masterGain = audioCtx.createGain();
  masterGain.gain.value = 1;
  masterGain.connect(audioCtx.destination);
  const pulse = () => {
    if (state.ringLocked || state.phase === "active" || state.phase === "connecting" || state.phase === "ended") {
      stopRing();
      return;
    }
    if (!ringOn || token !== ringToken || !audioCtx) return;
    if (outgoing) beep(440, 0.28);
    else {
      beep(480, 0.16);
      rememberTimeout(setTimeout(() => {
        if (ringOn && token === ringToken && !state.ringLocked) beep(620, 0.16);
      }, 200));
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

const SILENT_WAV = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

const ensureRemoteAudio = () => {
  if (!remoteAudio && typeof document !== "undefined") {
    remoteAudio = document.createElement("audio");
    remoteAudio.setAttribute("playsinline", "");
    remoteAudio.setAttribute("webkit-playsinline", "");
    remoteAudio.autoplay = true;
    remoteAudio.playsInline = true;
    remoteAudio.setAttribute("preload", "auto");
    remoteAudio.style.cssText = "position:fixed;left:0;top:0;width:0;height:0;opacity:0;pointer-events:none";
    document.body.appendChild(remoteAudio);
  }
  return remoteAudio;
};

const unlockCallAudio = () => {
  const audio = ensureRemoteAudio();
  if (!audio || audio.srcObject) return;
  if (!audio.getAttribute("src")) audio.src = SILENT_WAV;
  const played = audio.play();
  if (played && typeof played.catch === "function") played.catch(() => {});
};

const playRemoteAudio = (stream) => {
  const audio = ensureRemoteAudio();
  if (!audio) return;
  if (audio.getAttribute("src")) {
    audio.removeAttribute("src");
  }
  audio.srcObject = stream;
  const played = audio.play();
  if (played && typeof played.catch === "function") played.catch(() => {});
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

const callMedia = () => ({ local: previewStream, remote: remoteMediaStream });

const notifyMedia = () => {
  const media = callMedia();
  mediaListeners.forEach((listener) => listener(media));
};

export const subscribeCallMedia = (listener) => {
  mediaListeners.add(listener);
  listener(callMedia());
  return () => mediaListeners.delete(listener);
};

const syncPreview = () => {
  const track = stagedVideoTrack && stagedVideoTrack.readyState === "live" && stagedVideoTrack.enabled
    ? stagedVideoTrack
    : null;
  if (!track) previewStream = null;
  else if (!previewStream || previewStream.getVideoTracks()[0] !== track) previewStream = new MediaStream([track]);
  notifyMedia();
};

const stopMedia = () => {
  pendingIce = [];
  stopSpeakingWatch();
  needsRenegotiation = false;
  lastHandledOffer = "";
  iceRestarts = 0;
  const staged = stagedVideoTrack;
  stagedVideoTrack = null;
  localVideoSender = null;
  if (localStream) {
    localStream.getTracks().forEach((track) => track.stop());
    localStream = null;
  }
  if (staged && staged.readyState !== "ended") staged.stop();
  previewStream = null;
  remoteMediaStream = null;
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
  notifyMedia();
};

const reset = (statusText = "") => {
  const hadCall = Boolean(state.callId);
  state.ringLocked = false;
  stopRing();
  stopMedia();
  pendingOffer = null;
  sdpChain = Promise.resolve();
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
    cameraOn: false,
    peerCameraOn: false,
    videoError: "",
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
const ensureRemoteStream = () => {
  if (!remoteMediaStream) remoteMediaStream = new MediaStream();
  return remoteMediaStream;
};

const localSendsVideo = () => Boolean(
  localVideoSender?.track && localVideoSender.track.kind === "video" && localVideoSender.track.readyState === "live" && localVideoSender.track.enabled
);

const descriptionSendsVideo = () => /m=video (?!0 )/.test(pc?.localDescription?.sdp || "");

const sendOffer = async () => {
  if (!needsRenegotiation || !pc || pc.signalingState !== "stable" || !state.callId) return;
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  needsRenegotiation = false;
  send({ type: "offer", callId: state.callId, sdp: pc.localDescription });
};

const queueOffer = () => {
  needsRenegotiation = true;
  sdpChain = sdpChain.then(sendOffer).catch((error) => {
    console.warn("[voice] renegotiate failed", error);
  });
};

const openLocalMedia = async () => {
  if (!state.cameraOn) return askForMicrophone();
  try {
    if (stagedVideoTrack && stagedVideoTrack.readyState === "live") stagedVideoTrack.stop();
    stagedVideoTrack = null;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
      video: true,
    });
    stagedVideoTrack = stream.getVideoTracks()[0] || null;
    return stream;
  } catch (error) {
    if (error?.name === "NotAllowedError" || error?.name === "SecurityError") throw error;
    publish({ cameraOn: false, videoError: error?.name === "NotFoundError" ? "No camera found" : "Camera is blocked" });
    return askForMicrophone();
  }
};

const preparePeer = async () => {
  localStream = await openLocalMedia();
  syncPreview();
  pc = new RTCPeerConnection({
    iceServers: ICE_SERVERS,
    bundlePolicy: "max-bundle",
    rtcpMuxPolicy: "require",
  });
  localStream.getTracks().forEach((track) => {
    if (track.kind === "audio") track.enabled = !state.muted;
    if (track.kind === "video" && !state.cameraOn) return;
    const sender = pc.addTrack(track, localStream);
    if (track.kind === "video") localVideoSender = sender;
  });
  if (state.muted && state.callId) send({ type: "mute", callId: state.callId, muted: true });
  pc.ontrack = (event) => {
    const remote = ensureRemoteStream();
    if (!remote.getTracks().some((track) => track.id === event.track.id)) remote.addTrack(event.track);
    if (event.track.kind === "audio") {
      playRemoteAudio(remote);
      watchRemoteSpeaking(remote);
    }
    if (event.track.kind === "video") publish({ peerCameraOn: true });
    notifyMedia();
  };
  pc.onicecandidate = (event) => {
    if (!event.candidate || !state.callId) return;
    send({ type: "ice", callId: state.callId, candidate: event.candidate.toJSON() });
  };
  const markLive = () => {
    lockRingOff();
    playRemoteAudio(ensureRemoteStream());
    publish({ phase: "active", startedAt: state.startedAt || Date.now(), statusText: "" });
  };
  pc.onconnectionstatechange = () => {
    if (!pc) return;
    if (pc.connectionState === "connected") markLive();
  };
  pc.oniceconnectionstatechange = () => {
    if (!pc) return;
    if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") markLive();
    if (pc.iceConnectionState !== "failed") return;
    if (iceRestarts < 1) {
      iceRestarts += 1;
      try { pc.restartIce(); } catch (error) { /* restart is not available yet */ }
      queueOffer();
      return;
    }
    hangUp();
  };
  if (pendingOffer && state.direction === "in") {
    const queued = pendingOffer;
    pendingOffer = null;
    await applyOffer(queued);
  }
};

const makeOffer = () => {
  sdpChain = sdpChain.then(async () => {
    if (!pc || pc.signalingState !== "stable" || !state.callId) return;
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    send({ type: "offer", callId: state.callId, sdp: pc.localDescription });
  }).catch((error) => {
    console.warn("[voice] offer failed", error);
  });
  return sdpChain;
};

const canAnswer = () => pc && (pc.signalingState === "have-remote-offer" || pc.signalingState === "have-local-pranswer");

const applyOffer = (message) => {
  const callId = String(message?.callId || state.callId || "");
  const remoteSdp = typeof message?.sdp?.sdp === "string" ? message.sdp.sdp : "";
  sdpChain = sdpChain.then(async () => {
    if (!pc || !message?.sdp || !callId) return;
    lockRingOff();
    if (remoteSdp && remoteSdp === lastHandledOffer && pc.signalingState === "stable") return;
    if (pc.signalingState === "have-local-offer") {
      if (state.direction !== "in") return;
      await pc.setLocalDescription({ type: "rollback" });
    }
    if (pc.signalingState === "stable") await pc.setRemoteDescription(message.sdp);
    if (!canAnswer()) return;
    if (remoteSdp && remoteSdp === lastHandledOffer) return;
    await flushIce();
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    lastHandledOffer = remoteSdp;
    send({ type: "answer", callId, sdp: pc.localDescription });
    publish({ phase: "active", startedAt: state.startedAt || Date.now(), statusText: "" });
    if (localSendsVideo() && !descriptionSendsVideo()) needsRenegotiation = true;
    await sendOffer();
  }).catch((error) => {
    console.warn("[voice] offer failed", error);
  });
  return sdpChain;
};

const showExistingCall = (message) => {
  const callId = String(message?.callId || "");
  if (!callId) return;
  const direction = message.direction === "in" ? "in" : "out";
  const ringing = message.status === "ringing";
  if (state.callId === callId && state.phase !== "idle" && state.phase !== "ended") {
    if (!ringing || state.phase === "active" || state.phase === "connecting") lockRingOff();
    return;
  }
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
    cameraOn: false,
    peerCameraOn: false,
    videoError: "",
  });
  if (ringing) {
    state.ringLocked = false;
    startRing(direction === "out");
  } else lockRingOff();
};

const liveVideoTrack = () => {
  if (stagedVideoTrack && stagedVideoTrack.readyState === "live") return stagedVideoTrack;
  return localStream?.getVideoTracks().find((track) => track.readyState === "live") || null;
};

export async function toggleCamera() {
  if (!["outgoing", "incoming", "connecting", "active"].includes(state.phase)) return;
  if (state.cameraOn) {
    const track = liveVideoTrack();
    if (track) track.enabled = false;
    if (localVideoSender) localVideoSender.replaceTrack(null).catch(() => {});
    publish({ cameraOn: false, videoError: "" });
    if (state.callId) send({ type: "camera", callId: state.callId, on: false });
    syncPreview();
    return;
  }
  try {
    let track = liveVideoTrack();
    if (!track) {
      const videoStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      track = videoStream.getVideoTracks()[0];
    }
    track.enabled = true;
    stagedVideoTrack = track;
    if (localStream && !localStream.getVideoTracks().includes(track)) localStream.addTrack(track);
    if (pc) {
      if (!localVideoSender) {
        localVideoSender = pc.addTrack(track, localStream || new MediaStream([track]));
        queueOffer();
      } else if (localVideoSender.track !== track) {
        await localVideoSender.replaceTrack(track);
      }
    }
    publish({ cameraOn: true, videoError: "" });
    if (state.callId) send({ type: "camera", callId: state.callId, on: true });
    syncPreview();
  } catch (error) {
    const name = error?.name || "";
    const videoError = name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError"
      ? "No camera found"
      : "Camera is blocked";
    publish({ cameraOn: false, videoError });
  }
};

export const startVoiceCall = async ({ userId, name, conversationId, video }) => {
  unlockCallAudio();
  if (window.__crmCanVoiceCall === false) return;
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
      cameraOn: false,
      peerCameraOn: false,
      videoError: "",
    });
    return;
  }
  const callId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  state.ringLocked = false;
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
    cameraOn: false,
    peerCameraOn: false,
    videoError: "",
  });
  send({
    type: "invite",
    callId,
    to: userId,
    fromName: window.__crmVoiceName || "Agent",
    toName: name || "Agent",
    conversationId: conversationId || "",
  });
  if (video) await toggleCamera();
};

export const toggleVoiceMinimized = () => publish({ minimized: !state.minimized });

export const acceptVoiceCall = async () => {
  unlockCallAudio();
  if (state.phase !== "incoming" || !state.callId) return;
  lockRingOff();
  publish({ phase: "connecting", statusText: "Connecting…", peerMuted: false });
  try {
    await silenceThen(() => preparePeer());
  } catch (error) {
    publish({ phase: "mic", ...describeMic(error) });
    return;
  }
  if (state.cameraOn && state.callId) send({ type: "camera", callId: state.callId, on: true });
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
    if (state.cameraOn && state.callId) send({ type: "camera", callId: state.callId, on: true });
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
  const next = !state.muted;
  if (localStream) {
    localStream.getAudioTracks().forEach((track) => {
      track.enabled = !next;
    });
    if (state.callId) send({ type: "mute", callId: state.callId, muted: next });
  }
  publish({ muted: next });
};

const onSignal = async (message) => {
  const type = message?.type;
  const callId = String(message?.callId || "");
  if (!type) return;

  if (type === "invite") {
    if (window.__crmCanVoiceCall === false) {
      send({ type: "reject", callId });
      return;
    }
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
      cameraOn: false,
      peerCameraOn: false,
      videoError: "",
    });
    state.ringLocked = false;
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
    if (state.phase === "connecting" || state.phase === "active" || state.phase === "mic" || state.ringLocked) {
      lockRingOff();
      return;
    }
    if (state.phase !== "outgoing" || callId !== state.callId) return;
    publish({ statusText: "Ringing" });
    startRing(true);
    if (state.cameraOn && state.callId) send({ type: "camera", callId: state.callId, on: true });
    return;
  }

  if (type === "offline") {
    if (callId && state.callId && callId !== state.callId) return;
    reset("Offline");
    return;
  }

  if (type === "accept") {
    lockRingOff();
    publish({ phase: "connecting", statusText: "Connecting…" });
    try {
      await silenceThen(() => preparePeer());
      await makeOffer();
      if (state.cameraOn && state.callId) send({ type: "camera", callId: state.callId, on: true });
    } catch (error) {
      publish({ phase: "mic", ...describeMic(error) });
    }
    return;
  }

  if (type === "offer" && message.sdp) {
    if (!pc) {
      pendingOffer = message;
      return;
    }
    await applyOffer(message);
    return;
  }

  if (type === "answer" && message.sdp && pc) {
    sdpChain = sdpChain.then(async () => {
      if (!pc || (pc.signalingState !== "have-local-offer" && pc.signalingState !== "have-remote-pranswer")) return;
      lockRingOff();
      await pc.setRemoteDescription(message.sdp);
      await flushIce();
      publish({ phase: "active", startedAt: state.startedAt || Date.now(), statusText: "" });
      await sendOffer();
    }).catch((error) => {
      console.warn("[voice] answer failed", error);
    });
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

  if (type === "camera") {
    publish({ peerCameraOn: Boolean(message.on) });
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
    const text = message.reason === "unavailable"
      ? "Calling is turned off"
      : message.reason === "missed"
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
  if (live.__crmVoiceHandler) live.off("voice:signal", live.__crmVoiceHandler);
  live.__crmVoiceHandler = onSignal;
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
