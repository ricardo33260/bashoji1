import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { strokeScore, type Pt } from "@/lib/dtw";
import { signalComplete, signalStrokeMiss, signalStrokeOk } from "@/lib/feedback";

const CACHE = new Map<string, string[]>();

function codeFor(char: string) {
  return (char.codePointAt(0) ?? 0).toString(16).padStart(5, "0");
}

async function loadStrokes(char: string): Promise<string[]> {
  const key = codeFor(char);
  const cached = CACHE.get(key);
  if (cached) return cached;
  const base = import.meta.env["VITE_OFFLINE"] === "1"
    ? "/kanjivg"
    : "https://cdn.jsdelivr.net/gh/KanjiVG/kanjivg@master/kanji";
  const res = await fetch(`${base}/${key}.svg`);
  if (!res.ok) throw new Error("no strokes");
  const text = await res.text();
  const paths = Array.from(text.matchAll(/\sd="([^"]+)"/g)).map((m) => m[1] as string);
  CACHE.set(key, paths);
  return paths;
}

const STROKE_MS = 620;
const PAUSE_MS = 1400;
const PASS = 0.55;

export type StrokeMode = "watch" | "trace" | "validate";

type Props = {
  char: string;
  /** watch : animation seule · trace : dessin libre par-dessus · validate : tracé noté */
  mode?: StrokeMode;
  /** Classe de taille du SVG. */
  sizeClass?: string;
  /** Rendu haut contraste pour affichage en lunettes (fond noir). */
  hud?: boolean;
  /** Position du doigt détectée par la caméra, normalisée 0..1. */
  airPoint?: { x: number; y: number } | null;
  /** Stylo « posé » (pincement pouce-index) pour le tracé aérien. */
  airDown?: boolean;
  /** Appelé une fois quand tous les traits sont validés. */
  onComplete?: () => void;
  /** Mode Ordre : affiche le numéro de chaque trait à son point de départ. */
  showOrder?: boolean;
};

/** Kanji rendu depuis KanjiVG : animation trait par trait, tracé tactile et validation. */
export function KanjiStrokes({
  char,
  mode = "watch",
  sizeClass = "h-40 w-40",
  hud = false,
  airPoint = null,
  airDown = false,
  onComplete,
  showOrder = false,
}: Props) {
  const inkClass = hud ? "stroke-white" : "stroke-foreground";
  const ghostClass = hud ? "stroke-white/20" : "stroke-foreground/12";
  const [paths, setPaths] = useState<string[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [idx, setIdx] = useState(-1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tracé tactile
  const svgRef = useRef<SVGSVGElement | null>(null);
  const refPaths = useRef<(SVGPathElement | null)[]>([]);
  const [drawn, setDrawn] = useState<Pt[][]>([]);
  const [current, setCurrent] = useState<Pt[]>([]);
  const currentRef = useRef<Pt[]>([]);

  const drawing = useRef(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const startPt = useRef<Pt | null>(null);
  const movedRef = useRef(0);
  const [lastScore, setLastScore] = useState<number | null>(null);
  const winMoveRef = useRef<((e: PointerEvent) => void) | null>(null);
  const airStrokeRef = useRef(false);



  useEffect(() => {
    let alive = true;
    setPaths(null);
    setFailed(false);
    setIdx(-1);
    setDrawn([]);
    setCurrent([]);
    currentRef.current = [];
    drawing.current = false;
    setLastScore(null);
    loadStrokes(char)
      .then((p) => alive && setPaths(p))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
      if (winMoveRef.current) {
        window.removeEventListener("pointermove", winMoveRef.current);
        winMoveRef.current = null;
      }
    };
  }, [char]);

  const total = paths?.length ?? 0;
  const auto = mode !== "validate";

  useEffect(() => {
    if (!total || !auto) return;
    if (timer.current) clearTimeout(timer.current);
    const next = idx >= total ? -1 : idx + 1;
    timer.current = setTimeout(() => {
      if (next === -1) setDrawn([]);
      setIdx(next);
    }, idx >= total ? PAUSE_MS : STROKE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [idx, total, auto]);

  // En mode validation, on part du premier trait à tracer.
  useEffect(() => {
    if (mode === "validate") setIdx(0);
  }, [mode, char, total]);

  const strokes = useMemo(() => paths ?? [], [paths]);

  const toLocal = useCallback((e: React.PointerEvent): Pt | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const r = svg.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return {
      x: ((e.clientX - r.left) / r.width) * 109,
      y: ((e.clientY - r.top) / r.height) * 109,
    };
  }, []);

  const sampleRef = useCallback((i: number): Pt[] => {
    const el = refPaths.current[i];
    if (!el || typeof el.getTotalLength !== "function") return [];
    const len = el.getTotalLength();
    const n = 32;
    const out: Pt[] = [];
    for (let k = 0; k < n; k++) {
      const p = el.getPointAtLength((len * k) / (n - 1));
      out.push({ x: p.x, y: p.y });
    }
    return out;
  }, []);

  const endDrawing = () => {
    drawing.current = false;
    setIsDrawing(false);
    startPt.current = null;
    movedRef.current = 0;
    if (winMoveRef.current) {
      window.removeEventListener("pointermove", winMoveRef.current);
      winMoveRef.current = null;
    }
  };

  const finishStroke = (raw: Pt[]) => {
    let stroke = raw;
    setCurrent([]);
    currentRef.current = [];
    endDrawing();
    if (stroke.length < 2) return;

    if (mode === "trace") {
      setDrawn((d) => [...d, stroke]);
      return;
    }

    const target = sampleRef(idx);
    // Tracé aérien : la caméra donne une position approximative, on recale le
    // trait sur le centre de la référence pour ne noter que sa forme.
    if (airStrokeRef.current && target.length) {
      const c = (pts: Pt[]) =>
        pts.reduce((a, p) => ({ x: a.x + p.x / pts.length, y: a.y + p.y / pts.length }), { x: 0, y: 0 });
      const cu = c(stroke);
      const ct = c(target);
      stroke = stroke.map((p) => ({ x: p.x + ct.x - cu.x, y: p.y + ct.y - cu.y }));
    }
    airStrokeRef.current = false;
    const score = target.length ? strokeScore(stroke, target) : 0;
    setLastScore(score);

    if (score >= PASS) {
      setDrawn((d) => [...d, stroke]);
      const next = idx + 1;
      if (next >= total) {
        signalComplete();
        setIdx(total);
        onComplete?.();
      } else {
        signalStrokeOk();
        setIdx(next);
      }
    } else {
      signalStrokeMiss();
    }
  };

  const push = (p: Pt) => {
    setCurrent((c) => {
      if (c.length && Math.hypot(p.x - c[c.length - 1]!.x, p.y - c[c.length - 1]!.y) < 0.8) return c;
      const next = [...c, p];
      currentRef.current = next;
      return next;
    });
  };

  const beginStroke = (p: Pt) => {
    drawing.current = true;
    setIsDrawing(true);
    startPt.current = p;
    movedRef.current = 0;
    currentRef.current = [p];
    setCurrent([p]);
  };

  /** Mode étendu (Viture) : le téléphone est un trackpad. On utilise le
   *  mouvement relatif (movementX/Y) via un écouteur global pour que le
   *  tracé suive le doigt même quand le curseur sort du SVG. En validation
   *  on démarre au premier point du trait cible pour aligner le tracé avec
   *  la référence DTW (non invariante en translation). */
  const beginMouseStroke = (p: Pt) => {
    let start = p;
    if (mode === "validate") {
      const target = sampleRef(idx);
      if (target.length) start = target[0]!;
    }
    beginStroke(start);
    const svg = svgRef.current;
    const r = svg?.getBoundingClientRect();
    const scale = r && r.width ? 109 / r.width : 1;
    const handler = (e: PointerEvent) => {
      if (!drawing.current) return;
      e.preventDefault();
      const last = currentRef.current[currentRef.current.length - 1];
      if (!last) return;
      const np: Pt = {
        x: Math.max(0, Math.min(109, last.x + (e.movementX || 0) * scale)),
        y: Math.max(0, Math.min(109, last.y + (e.movementY || 0) * scale)),
      };
      const s = startPt.current;
      if (s) movedRef.current = Math.max(movedRef.current, Math.hypot(np.x - s.x, np.y - s.y));
      push(np);
    };
    winMoveRef.current = handler;
    window.addEventListener("pointermove", handler);
  };

  // Stylet (ex. Honor Magic Pencil) : suivi absolu comme le doigt, avec pression.
  const pressureRef = useRef(0.5);
  const [pressure, setPressure] = useState(0.5);

  const onDown = (e: React.PointerEvent) => {
    if (mode === "watch") return;
    const p = toLocal(e);
    if (!p) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.pointerType === "pen") {
      pressureRef.current = e.pressure || 0.5;
      setPressure(pressureRef.current);
    }

    // Mode étendu (Viture) : clic pour démarrer / clic pour terminer le tracé.
    if (drawing.current) {
      finishStroke(currentRef.current);
      return;
    }

    if (e.pointerType === "mouse") {
      beginMouseStroke(p);
    } else {
      try {
        svgRef.current?.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      beginStroke(p);
    }
  };

  const onMove = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    // Souris/trackpad : géré par l'écouteur global (mouvement relatif).
    if (e.pointerType === "mouse") return;
    e.preventDefault();
    if (e.pointerType === "pen" && e.pressure > 0) {
      pressureRef.current = e.pressure;
      setPressure(e.pressure);
    }
    const p = toLocal(e);
    if (!p) return;
    const s = startPt.current;
    if (s) movedRef.current = Math.max(movedRef.current, Math.hypot(p.x - s.x, p.y - s.y));
    push(p);
  };

  const onUp = (e?: React.PointerEvent) => {
    if (!drawing.current) return;
    // Souris/trackpad : un simple clic (sans déplacement) arme le tracé,
    // un vrai glissé se termine normalement au relâchement.
    if (e?.pointerType === "mouse" && movedRef.current < 4) return;
    if (e && e.pointerType !== "mouse") {
      try {
        svgRef.current?.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    finishStroke(currentRef.current);
  };

  const reset = () => {
    setDrawn([]);
    setCurrent([]);
    currentRef.current = [];
    endDrawing();
    setLastScore(null);
    setIdx(0);
  };

  /** Tracé aérien : le bout de l'index détecté par la caméra pilote le stylo,
   *  le pincement pouce-index remplace l'appui sur l'écran. */
  const airDownRef = useRef(false);
  useEffect(() => {
    if (mode === "watch") return;
    if (!airPoint) {
      if (airDownRef.current) {
        airDownRef.current = false;
        finishStroke(currentRef.current);
      }
      return;
    }
    const p: Pt = {
      x: Math.max(0, Math.min(109, airPoint.x * 109)),
      y: Math.max(0, Math.min(109, airPoint.y * 109)),
    };
    if (airDown && !airDownRef.current) {
      airDownRef.current = true;
      airStrokeRef.current = true;
      beginStroke(p);
    } else if (airDown) {
      push(p);
    } else if (airDownRef.current) {
      airDownRef.current = false;
      finishStroke(currentRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [airPoint, airDown, mode]);


  if (failed || (!paths && !total)) {
    return (
      <div className={`font-jp text-[7rem] leading-none ${hud ? "text-white" : "text-foreground"}`} aria-label={char}>
        {char}
      </div>
    );
  }

  const toPolyline = (pts: Pt[]) => pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const done = mode === "validate" && idx >= total && total > 0;

  return (
    <div className="flex flex-col items-center gap-2">
      <svg
        ref={svgRef}
        viewBox="0 0 109 109"
        role="img"
        aria-label={`Tracé du kanji ${char}`}
        className={`mx-auto block touch-none select-none ${sizeClass}`}
        style={{ touchAction: "none", WebkitUserSelect: "none", cursor: mode === "watch" ? "default" : "crosshair" }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onLostPointerCapture={onUp}
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* Surface tactile : sans ce rect, le SVG ne capte les gestes que sur les traits. */}
        <rect x={0} y={0} width={109} height={109} fill="transparent" pointerEvents="all" />

        {strokes.map((d, i) => (
          <path
            key={i}
            ref={(el) => {
              refPaths.current[i] = el;
            }}
            d={d}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={ghostClass}
            strokeWidth={5}
          />
        ))}
        {strokes.map((d, i) => {
          const complete = i < idx;
          const active = i === idx;
          const show = mode === "validate" ? complete : complete || active;
          return (
            <path
              key={`ink-${i}`}
              d={d}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={show ? 0 : 1}
              strokeWidth={active && mode !== "validate" ? 6.5 : 5}
              className={active && mode !== "validate" ? "stroke-primary" : inkClass}
              opacity={show ? 1 : 0}
              style={{
                transition: `stroke-dashoffset ${STROKE_MS}ms linear, stroke-width 200ms ease, stroke 400ms ease`,
                filter:
                  active && mode !== "validate"
                    ? "drop-shadow(0 0 6px oklch(0.6 0.19 27 / 0.6))"
                    : undefined,
              }}
            />
          );
        })}
        {/* Guide du trait attendu en mode validation */}
        {mode === "validate" && idx < total && strokes[idx] && (
          <path
            d={strokes[idx]}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={5}
            strokeDasharray="3 4"
            className="stroke-primary/60"
          />
        )}
        {/* Mode Ordre : numéro de chaque trait à son point de départ */}
        {showOrder &&
          strokes.map((d, i) => {
            const m = /M\s*([\d.]+)[ ,]([\d.]+)/.exec(d);
            if (!m) return null;
            return (
              <text
                key={`ord-${i}`}
                x={Number(m[1]) + 2}
                y={Number(m[2]) - 2}
                fontSize={8}
                className={hud ? "fill-white/70" : "fill-muted-foreground"}
                style={{ pointerEvents: "none", userSelect: "none" }}
              >
                {i + 1}
              </text>
            );
          })}
        {/* Tracé de l'utilisateur */}
        {drawn.map((pts, i) => (
          <polyline
            key={`u-${i}`}
            points={toPolyline(pts)}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={4}
            className="stroke-primary/70"
          />
        ))}
        {airPoint && mode !== "watch" && (
          <circle
            cx={Math.max(0, Math.min(109, airPoint.x * 109))}
            cy={Math.max(0, Math.min(109, airPoint.y * 109))}
            r={airDown ? 3.2 : 2.2}
            className={airDown ? "fill-primary" : "fill-primary/40"}
          />
        )}
        {current.length > 1 && (
          <polyline
            points={toPolyline(current)}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={3 + pressure * 3.5}
            className="stroke-primary"
          />
        )}
      </svg>

      {mode === "validate" && (
        <div className={`flex items-center gap-3 text-xs ${hud ? "text-white/60" : "text-muted-foreground"}`}>
          <span>
            {done ? "Kanji complet ✓" : `Trait ${Math.min(idx + 1, total)} / ${total}`}
          </span>
          {lastScore !== null && !done && <span>score {Math.round(lastScore * 100)}%</span>}
          {isDrawing && (
            <button
              type="button"
              onClick={() => finishStroke(currentRef.current)}
              className={`rounded-full border px-2.5 py-0.5 ${hud ? "border-white/60 text-white" : "border-primary text-primary"}`}
            >
              Terminer le trait
            </button>
          )}

          <button
            type="button"
            onClick={reset}
            className="rounded-full border border-border px-2.5 py-0.5 transition-colors hover:border-primary hover:text-primary"
          >
            Recommencer
          </button>
        </div>
      )}
      {mode === "trace" && (
        <button
          type="button"
          onClick={() => setDrawn([])}
          className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
        >
          Effacer mon tracé
        </button>
      )}
    </div>
  );
}
