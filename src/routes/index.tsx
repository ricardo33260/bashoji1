import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { encodeGeohash, hashString } from "@/lib/geohash";
import { KANJI, type Kanji } from "@/lib/kanji";
import { KanjiStrokes, type StrokeMode } from "@/components/KanjiStrokes";
import { SpeakButton } from "@/components/SpeakButton";
import { readingStem, toRomaji } from "@/lib/romaji";
import { signalNewKanji } from "@/lib/feedback";
import { X } from "lucide-react";
import { useHandTracking } from "@/hooks/useHandTracking";
import { useCollection } from "@/lib/collection";
import { Credits } from "@/components/Credits";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Kanji Sekai — le kanji de chaque lieu" },
      {
        name: "description",
        content:
          "Kanji Sekai : chaque carré de 30 mètres sur Terre possède son propre kanji et sa signification, toujours identique pour un même geohash.",
      },
      { property: "og:title", content: "Kanji Sekai" },
      {
        property: "og:description",
        content: "Découvrez le kanji attaché à votre position, stable pour chaque carré de 30 m.",
      },
    ],
  }),
  component: Index,
});

const PRECISION = 8; // ~38 m x 38 m cells
const CELL_M = 30; // taille de la cellule visée, en mètres
const LOCK_MS = 20000; // durée du verrouillage du kanji, en millisecondes

/** Arrondit la position au centre d'une cellule fixe de ~30 m pour éviter les sauts de kanji. */
function snapToGrid(lat: number, lon: number) {
  const dLat = CELL_M / 111320;
  const dLon = CELL_M / (111320 * Math.max(Math.cos((lat * Math.PI) / 180), 1e-6));
  return {
    lat: (Math.floor(lat / dLat) + 0.5) * dLat,
    lon: (Math.floor(lon / dLon) + 0.5) * dLon,
  };
}

function kanjiForGeohash(geohash: string): Kanji {
  const h = hashString(geohash);
  return KANJI[h % KANJI.length]!;
}

type Pos = { lat: number; lon: number; acc: number };

function Index() {
  const [pos, setPos] = useState<Pos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [watching, setWatching] = useState(false);
  const [manual, setManual] = useState("");
  const watchId = useRef<number | null>(null);
  const collection = useCollection();

  // Verrouillage temporaire du geohash pour éviter les sauts de kanji.
  const [lockedHash, setLockedHash] = useState<string | null>(null);
  const lockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mode d'interaction avec le tracé et affichage plein écran (lunettes Viture).
  const [mode, setMode] = useState<StrokeMode>("watch");
  const [order, setOrder] = useState(false);
  const [hud, setHud] = useState(false);
  const [alerts, setAlerts] = useState(true);
  const [camera, setCamera] = useState(true);
  const [camError, setCamError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  // Ref stable : une lambda inline provoquerait un détach/attach à chaque rendu
  // (donc une boucle de rendu infinie via setState).
  const attachVideo = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    setVideoEl((prev) => (prev === el ? prev : el));
  }, []);
  const [air, setAir] = useState(false);
  // Pad plein écran : tout l'écran du téléphone capte le tracé (plus de navigation).
  const [pad, setPad] = useState(false);
  const prevHash = useRef<string | null>(null);


  // Tracé aérien : suivi du doigt devant la caméra (MediaPipe Hands).
  const hand = useHandTracking(videoEl, hud && camera && air);

  const start = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("La géolocalisation n'est pas disponible sur cet appareil.");
      return;
    }
    setError(null);
    setWatching(true);
    watchId.current = navigator.geolocation.watchPosition(
      (p) =>
        setPos({
          lat: p.coords.latitude,
          lon: p.coords.longitude,
          acc: p.coords.accuracy,
        }),
      (e) => {
        setError(
          e.code === e.PERMISSION_DENIED
            ? "Accès à la position refusé. Autorisez la localisation puis réessayez."
            : "Position introuvable pour le moment.",
        );
        setWatching(false);
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 },
    );
  }, []);

  useEffect(() => {
    return () => {
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
      if (lockTimer.current !== null) clearTimeout(lockTimer.current);
    };
  }, []);

  const manualParts = manual.split(",").map((s) => parseFloat(s.trim()));
  const manualPos: Pos | null =
    manualParts.length === 2 && manualParts.every((n) => Number.isFinite(n))
      ? { lat: manualParts[0] as number, lon: manualParts[1] as number, acc: 0 }
      : null;

  const active = manualPos ?? pos;
  const snapped = active ? snapToGrid(active.lat, active.lon) : null;
  const liveHash = snapped ? encodeGeohash(snapped.lat, snapped.lon, PRECISION) : null;

  // Tant qu'un verrou est actif, on conserve l'ancien geohash affiché.
  const geohash = lockedHash ?? liveHash;
  const geoKanji = geohash ? kanjiForGeohash(geohash) : null;

  // Enchaînement : après validation, le kanji suivant de la liste apparaît.
  const [chainIndex, setChainIndex] = useState<number | null>(null);
  const kanji = chainIndex !== null ? KANJI[chainIndex % KANJI.length]! : geoKanji;

  // Un kanji entièrement tracé et validé rejoint la collection locale,
  // puis l'enchaînement passe au kanji suivant.
  const collect = () => {
    if (!kanji) return;
    collection.add({ char: kanji.char, meaning: kanji.meaning, geohash });
    const currentIdx = KANJI.findIndex((k) => k.char === kanji.char);
    setChainIndex((currentIdx >= 0 ? currentIdx : 0) + 1);
  };

  // Quand le geohash vivant change et qu'aucun verrou n'est actif,
  // on adopte le nouveau et on déclenche un verrou de LOCK_MS.
  // Une série lancée reste figée : le GPS ne la casse plus, seul le bouton « Lieu » y met fin.
  useEffect(() => {
    if (!liveHash) return;
    if (liveHash === lockedHash) return;
    setLockedHash(liveHash);
    if (lockTimer.current !== null) clearTimeout(lockTimer.current);
    lockTimer.current = setTimeout(() => {
      setLockedHash((current) => (current === liveHash ? null : current));
    }, LOCK_MS);
  }, [liveHash, lockedHash]);

  // Détection d'entrée dans une nouvelle case : signal sonore + vibration discrets
  // (silencieux pendant une série, puisque le kanji affiché ne change pas).
  const chaining = chainIndex !== null;
  useEffect(() => {
    if (!geohash) return;
    const previous = prevHash.current;
    prevHash.current = geohash;
    if (previous && previous !== geohash && alerts && !chaining) signalNewKanji();
  }, [geohash, alerts, chaining]);

  // En mode marche, le fond est noir et la caméra arrière du téléphone
  // affiche l'extérieur en direct (passthrough) derrière le kanji.
  useEffect(() => {
    if (!hud) return;
    const html = document.documentElement;
    const body = document.body;
    const prev = { html: html.style.background, body: body.style.background };
    html.style.background = "#000";
    body.style.background = "#000";
    return () => {
      html.style.background = prev.html;
      body.style.background = prev.body;
    };
  }, [hud]);

  // Flux caméra (passthrough).
  useEffect(() => {
    if (!hud || !camera) return;
    let stream: MediaStream | null = null;
    let alive = true;
    setCamError(null);
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false })
      .then((s) => {
        if (!alive) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          void videoRef.current.play().catch(() => undefined);
        }
      })
      .catch(() => alive && setCamError("Caméra indisponible ou refusée."));
    return () => {
      alive = false;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [hud, camera]);

  // Empêche la mise en veille pendant la marche : un écran verrouillé coupe
  // tous les événements tactiles et donc le tracé.
  useEffect(() => {
    if (!hud) return;
    let lock: { release: () => Promise<void> } | null = null;
    let alive = true;
    const request = () => {
      (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } })
        .wakeLock?.request("screen")
        .then((l) => {
          if (!alive) return void l.release().catch(() => undefined);
          lock = l;
        })
        .catch(() => undefined);
    };
    request();
    const onVisible = () => {
      if (document.visibilityState === "visible") request();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVisible);

      void lock?.release().catch(() => undefined);
    };
  }, [hud]);



  if (hud) {
    return (
      <main
        className="fixed inset-0 z-50 flex touch-none select-none flex-col items-center justify-center gap-6 overscroll-none bg-black px-4 text-center"
        style={{ touchAction: "none" }}
      >
        {camera && (
          <video
            ref={attachVideo}
            playsInline
            muted
            autoPlay
            aria-hidden
            className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          />
        )}
        {!pad && (
          <div className="absolute left-4 top-[calc(var(--safe-area-inset-top,env(safe-area-inset-top,0px))+1rem)] flex gap-2">
            <button
              type="button"
              onClick={() => setCamera((c) => !c)}
              className="rounded-full border border-white/25 px-3 py-1 text-xs text-white/70"
            >
              {camera ? "Caméra : on" : "Caméra : off"}
            </button>
            <button
              type="button"
              onClick={() => setAir((a) => !a)}
              disabled={!camera}
              className={`rounded-full border px-3 py-1 text-xs disabled:opacity-40 ${
                air ? "border-white bg-white/15 text-white" : "border-white/25 text-white/70"
              }`}
            >
              {air ? (hand.ready ? (hand.point ? "Doigt : suivi" : "Doigt : cherche…") : "Doigt : chargement…") : "Doigt : off"}
            </button>
            {camError && <span className="self-center text-xs text-white/50">{camError}</span>}
            {hand.error && <span className="self-center text-xs text-white/50">{hand.error}</span>}
          </div>
        )}
        {!pad && (
          <button
            type="button"
            onClick={() => setHud(false)}
            aria-label="Quitter le mode marche"
            className="absolute right-4 top-[calc(var(--safe-area-inset-top,env(safe-area-inset-top,0px))+1rem)] rounded-full border border-white/25 p-2 text-white/70"
          >
            <X className="h-5 w-5" />
          </button>
        )}
        {kanji ? (
          <div
            className={
              pad
                ? "absolute inset-0 flex items-center justify-center text-white"
                : "relative flex w-full flex-col items-center gap-3 text-white [text-shadow:0_2px_8px_rgba(0,0,0,0.9)]"
            }
          >
            <KanjiStrokes
              key={`${kanji.char}-${mode}-${pad ? "pad" : "hud"}`}
              char={kanji.char}
              mode={mode}
              hud
              airPoint={air ? hand.point : null}
              airDown={air && hand.pinching}
              onComplete={collect}
              showOrder={order}
              sizeClass={pad ? "h-[100vmin] w-[100vmin] touch-none" : "h-[80vmin] w-[80vmin] touch-none"}
            />
            {!pad && (
              <>
                <p className="text-xl font-medium text-white">{kanji.meaning}</p>
                <p className="font-jp text-base text-white/70">
                  {[kanji.on, kanji.kun].filter(Boolean).join(" · ")}
                </p>
                <p className="font-mono text-xs tracking-widest text-white/40">{geohash}</p>
              </>
            )}
          </div>
        ) : (
          <p className="relative text-white/70">Activez votre position pour démarrer la marche.</p>
        )}
        <div className="absolute inset-x-0 bottom-[calc(var(--safe-area-inset-bottom,env(safe-area-inset-bottom,0px))+1.25rem)] flex flex-wrap justify-center gap-2 px-3">
          {!pad && chaining && (
            <button
              type="button"
              onClick={() => setChainIndex(null)}
              className="rounded-full border border-white/25 px-3 py-1 text-xs text-white/60"
            >
              Lieu
            </button>
          )}
          {!pad &&
            ([
              ["watch", "Regarder"],
              ["trace", "Tracer"],
              ["validate", "Valider"],
            ] as const).map(([m, label]) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  mode === m ? "border-white bg-white/15 text-white" : "border-white/25 text-white/60"
                }`}
              >
                {label}
              </button>
            ))}
          {!pad && (
            <button
              type="button"
              onClick={() => setOrder((o) => !o)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                order ? "border-white bg-white/15 text-white" : "border-white/25 text-white/60"
              }`}
            >
              Ordre
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setPad((p) => {
                if (!p) setMode("validate");
                return !p;
              });
            }}
            className={`relative z-10 rounded-full border px-3 py-1 text-xs transition-colors ${
              pad ? "border-white bg-white/20 text-white" : "border-white/25 text-white/60"
            }`}
          >
            {pad ? "Pad : on — quitter" : "Pad : off"}
          </button>
        </div>
      </main>
    );
  }




  return (
    <main className="min-h-screen bg-background px-5 py-10 text-foreground">
      <div className="mx-auto flex w-full max-w-md flex-col gap-8">
        <header className="text-center">
          <p className="font-jp text-sm tracking-[0.4em] text-primary">漢字世界</p>
          <h1 className="mt-2 font-jp text-2xl font-semibold tracking-tight">Kanji Sekai</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Le kanji du lieu. Chaque carré de 30 mètres possède son propre kanji, toujours le même
            pour un même geohash.
          </p>
        </header>

        <section className="paper relative overflow-hidden rounded-2xl px-6 py-10 text-center">
          {kanji ? (
            <>
              <div className="seal font-jp">印</div>
              <KanjiStrokes key={kanji.char} char={kanji.char} mode={mode} onComplete={collect} showOrder={order} />
              {chaining && (
                <button
                  type="button"
                  onClick={() => setChainIndex(null)}
                  className="mt-3 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground"
                >
                  Série en cours · revenir au kanji du lieu
                </button>
              )}
              <p className="mt-6 text-lg font-medium text-primary">{kanji.meaning}</p>
              <p className="font-jp mt-2 text-sm text-muted-foreground">
                {[kanji.on && `音 ${kanji.on}`, kanji.kun && `訓 ${kanji.kun}`]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <p className="mt-1 text-sm italic text-muted-foreground">
                {[
                  kanji.on && toRomaji(kanji.on).toUpperCase(),
                  kanji.kun && toRomaji(kanji.kun),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <SpeakButton text={kanji.char} label="Kanji" />
                {kanji.kun && (
                  <SpeakButton text={readingStem(kanji.kun)} label={readingStem(kanji.kun)} />
                )}
                {kanji.on && <SpeakButton text={readingStem(kanji.on)} label={readingStem(kanji.on)} />}
              </div>

              <div className="mt-8 border-t border-border pt-4">
                <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">geohash</p>
                <p className="mt-1 font-mono text-base tracking-widest">{geohash}</p>
                {active && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {active.lat.toFixed(6)}, {active.lon.toFixed(6)}
                    {active.acc ? ` · ±${Math.round(active.acc)} m` : ""}
                  </p>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="font-jp text-[7rem] leading-none text-muted-foreground/30">白</div>
              <p className="mt-4 text-base font-medium text-muted-foreground">
                <span className="font-jp">しろ</span> · shiro · blanc
              </p>
              <div className="mt-3 flex justify-center">
                <SpeakButton text="白" label="Écouter しろ" />
              </div>
              <p className="mt-4 text-sm text-muted-foreground">
                Activez votre position pour révéler le kanji de l'endroit où vous êtes.
              </p>
            </>
          )}

        </section>

        <Link
          to="/collection"
          className="paper flex items-center justify-between rounded-2xl px-5 py-4 text-sm transition-colors hover:border-primary"
        >
          <span className="font-jp font-semibold">
            Collection{" "}
            <span className="text-primary">{collection.items.length}</span>
          </span>
          <span className="text-muted-foreground">Voir →</span>
        </Link>


        <div className="flex flex-col gap-3">
          <div className="flex justify-center gap-2">
            {([
              ["watch", "Regarder"],
              ["trace", "Tracer"],
              ["validate", "Valider"],
            ] as const).map(([m, label]) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  mode === m
                    ? "border-primary text-primary"
                    : "border-border text-muted-foreground hover:border-primary"
                }`}
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setOrder((o) => !o)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                order
                  ? "border-primary text-primary"
                  : "border-border text-muted-foreground hover:border-primary"
              }`}
            >
              Ordre
            </button>
          </div>
          <div className="flex justify-center gap-2">
            <button
              type="button"
              onClick={() => {
                setMode("validate");
                setHud(true);
              }}
              className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            >
              Mode marche (Viture)
            </button>
            <button
              type="button"
              onClick={() => setAlerts((a) => !a)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                alerts ? "border-primary text-primary" : "border-border text-muted-foreground"
              }`}
            >
              {alerts ? "Signal : activé" : "Signal : coupé"}
            </button>
          </div>
          <button onClick={start} className="btn-ink" disabled={watching && !error}>
            {watching && !error ? "Suivi en cours…" : "Révéler mon kanji"}
          </button>
          {error && <p className="text-center text-sm text-destructive">{error}</p>}
          <label className="mt-2 text-xs text-muted-foreground">
            Ou explorez des coordonnées (lat, lon)
            <input
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="48.858370, 2.294481"
              inputMode="decimal"
              className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 font-mono text-sm text-foreground outline-none focus:border-primary"
            />
          </label>
        </div>

        <footer className="pb-6 text-center text-xs leading-relaxed text-muted-foreground">
          Grille fixe de {CELL_M} m (geohash {PRECISION} caractères). Le même carré renvoie toujours le même
          kanji, partout et pour tout le monde. Verrouillage de {LOCK_MS / 1000} s pour la stabilité.
          Tracez le kanji au doigt sur l'écran ; en mode « Valider », chaque trait est comparé au
          modèle (DTW + Fréchet) avec retour haptique.
          <div className="mt-3">
            <Credits />
          </div>
        </footer>
      </div>
    </main>
  );
}
