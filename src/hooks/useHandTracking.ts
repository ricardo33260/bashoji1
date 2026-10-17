import { useEffect, useRef, useState } from "react";

export type AirPoint = { x: number; y: number };

export type HandTracking = {
  /** Position lissée du bout de l'index, normalisée 0..1 dans la zone active. */
  point: AirPoint | null;
  /** Vrai tant que le pouce et l'index sont pincés (= stylo posé). */
  pinching: boolean;
  ready: boolean;
  error: string | null;
};

// Build APK hors ligne : modèle et WASM embarqués dans l'appli (voir scripts/prepare-offline.mjs).
const OFFLINE = import.meta.env["VITE_OFFLINE"] === "1";
const WASM_BASE = OFFLINE
  ? "/mediapipe/wasm"
  : "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const MODEL_URL = OFFLINE
  ? "/mediapipe/hand_landmarker.task"
  : "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

const PINCH_ON = 0.5; // ratio distance pouce-index / taille de la main
const PINCH_OFF = 0.8;
const PINCH_FRAMES = 2; // confirmation temporelle pour éviter les faux appuis

/** Zone active : la partie centrale de l'image est étirée sur tout le kanji.
 *  Un petit mouvement du doigt couvre ainsi une plus grande course => plus de précision. */
const ZONE = 0.5;

/** Filtre « One Euro » : peu de latence sur les gestes rapides,
 *  fort lissage quand le doigt est presque immobile. */
class OneEuro {
  private xPrev: number | null = null;
  private dxPrev = 0;
  private tPrev = 0;
  constructor(
    private minCutoff = 1.0,
    private beta = 0.007,
    private dCutoff = 1.0,
  ) {}
  private static alpha(cutoff: number, dt: number) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }
  reset() {
    this.xPrev = null;
    this.dxPrev = 0;
  }
  filter(x: number, t: number): number {
    if (this.xPrev === null) {
      this.xPrev = x;
      this.tPrev = t;
      return x;
    }
    const dt = Math.max(1e-3, (t - this.tPrev) / 1000);
    this.tPrev = t;
    const dx = (x - this.xPrev) / dt;
    const ad = OneEuro.alpha(this.dCutoff, dt);
    this.dxPrev = ad * dx + (1 - ad) * this.dxPrev;
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dxPrev);
    const a = OneEuro.alpha(cutoff, dt);
    const out = a * x + (1 - a) * this.xPrev;
    this.xPrev = out;
    return out;
  }
}

/** Suivi de la main via MediaPipe Hands sur un flux vidéo déjà actif. */
export function useHandTracking(
  video: HTMLVideoElement | null,
  enabled: boolean,
  /** Miroir horizontal (caméra frontale). */
  mirrored = false,
): HandTracking {
  const [point, setPoint] = useState<AirPoint | null>(null);
  const [pinching, setPinching] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pinchRef = useRef(false);

  useEffect(() => {
    if (!enabled || !video) {
      setReady(false);
      setPoint(null);
      setPinching(false);
      pinchRef.current = false;
      return;
    }

    let alive = true;
    let raf = 0;
    let landmarker: { detectForVideo: (v: HTMLVideoElement, t: number) => unknown; close: () => void } | null =
      null;
    let lastTs = -1;
    const fx = new OneEuro();
    const fy = new OneEuro();
    let pinchStreak = 0;
    let lostFrames = 0;

    (async () => {
      try {
        const vision = await import("@mediapipe/tasks-vision");
        const fileset = await vision.FilesetResolver.forVisionTasks(WASM_BASE);
        const hl = await vision.HandLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
          runningMode: "VIDEO",
          numHands: 1,
          minHandDetectionConfidence: 0.6,
          minHandPresenceConfidence: 0.6,
          minTrackingConfidence: 0.6,
        });
        if (!alive) {
          hl.close();
          return;
        }
        landmarker = hl as unknown as typeof landmarker;
        setReady(true);

        const loop = () => {
          if (!alive) return;
          raf = requestAnimationFrame(loop);
          if (!landmarker || video.readyState < 2) return;
          const ts = video.currentTime * 1000;
          if (ts === lastTs) return;
          lastTs = ts;

          let res: { landmarks?: { x: number; y: number }[][] };
          try {
            res = landmarker.detectForVideo(video, performance.now()) as typeof res;
          } catch {
            return;
          }
          const lm = res.landmarks?.[0];
          if (!lm || lm.length < 13) {
            // Tolérance de quelques images perdues : on ne coupe pas le trait
            // au moindre clignotement de la détection.
            if (++lostFrames < 5) return;
            setPoint(null);
            if (pinchRef.current) {
              pinchRef.current = false;
              setPinching(false);
            }
            pinchStreak = 0;
            fx.reset();
            fy.reset();
            return;
          }
          lostFrames = 0;

          const tip = lm[8]!;
          const thumb = lm[4]!;
          const wrist = lm[0]!;
          const mcp = lm[9]!;
          const span = Math.hypot(mcp.x - wrist.x, mcp.y - wrist.y) || 1e-6;
          const ratio = Math.hypot(thumb.x - tip.x, thumb.y - tip.y) / span;

          const rawX = mirrored ? 1 - tip.x : tip.x;
          const now = performance.now();
          // Zone active centrée : étirement pour gagner en résolution utile.
          const zoom = (v: number) => Math.max(0, Math.min(1, (v - (1 - ZONE) / 2) / ZONE));
          const nx = zoom(fx.filter(rawX, now));
          const ny = zoom(fy.filter(tip.y, now));
          setPoint({ x: nx, y: ny });

          const was = pinchRef.current;
          const want = was ? ratio < PINCH_OFF : ratio < PINCH_ON;
          if (want !== was) {
            pinchStreak++;
            if (pinchStreak >= PINCH_FRAMES) {
              pinchStreak = 0;
              pinchRef.current = want;
              setPinching(want);
            }
          } else {
            pinchStreak = 0;
          }
        };
        raf = requestAnimationFrame(loop);
      } catch {
        if (alive) setError("Suivi de la main indisponible sur cet appareil.");
      }
    })();

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      landmarker?.close();
      setReady(false);
      setPoint(null);
      setPinching(false);
    };
  }, [video, enabled, mirrored]);

  return { point, pinching, ready, error };
}
