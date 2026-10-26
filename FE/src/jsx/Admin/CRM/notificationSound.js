let audioContext = null;

const getContext = () => {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!audioContext) audioContext = new Ctx();
  return audioContext;
};

const arm = () => {
  const audio = getContext();
  if (audio && audio.state === "suspended") audio.resume().catch(() => {});
};

if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", arm);
  window.addEventListener("keydown", arm);
}

const beep = (audio, frequency, start, duration, volume = 0.12) => {
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.03);
  gain.gain.setValueAtTime(volume, start + Math.max(duration - 0.08, 0.05));
  gain.gain.linearRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(audio.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
};

export const playNotificationSound = async (kind) => {
  const audio = getContext();
  if (!audio) return;
  if (audio.state === "suspended") {
    try {
      await audio.resume();
    } catch (error) {
      return;
    }
  }
  const now = audio.currentTime;
  if (kind === "unseen") {
    beep(audio, 698, now, 0.4, 0.07);
    beep(audio, 880, now + 0.48, 0.46, 0.06);
    return;
  }
  if (kind === "message") {
    beep(audio, 523, now, 0.22, 0.055);
    beep(audio, 659, now + 0.18, 0.28, 0.05);
    return;
  }
  beep(audio, 440, now, 0.5, 0.06);
};
