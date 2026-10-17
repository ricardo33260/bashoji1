/** Retours discrets : vibration + petit son, utilisables sans dépendance. */

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** Petit "toc" sinusoïdal, très court, volume faible. */
export function chime(freq = 660, ms = 140, gain = 0.06) {
  const a = audio();
  if (!a) return;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, a.currentTime);
  g.gain.exponentialRampToValueAtTime(gain, a.currentTime + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + ms / 1000);
  osc.connect(g).connect(a.destination);
  osc.start();
  osc.stop(a.currentTime + ms / 1000 + 0.02);
}

export function vibrate(pattern: number | number[]) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {
      /* ignoré */
    }
  }
}

/** Nouveau kanji détecté : deux notes montantes + vibration double. */
export function signalNewKanji() {
  chime(587, 120);
  setTimeout(() => chime(880, 180), 130);
  vibrate([25, 60, 40]);
}

export function signalStrokeOk() {
  chime(920, 90, 0.05);
  vibrate(18);
}

export function signalStrokeMiss() {
  chime(180, 160, 0.05);
  vibrate([12, 40, 12]);
}

export function signalComplete() {
  chime(660, 110);
  setTimeout(() => chime(880, 110), 110);
  setTimeout(() => chime(1174, 220), 230);
  vibrate([30, 50, 30, 50, 80]);
}
