import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { KanjiStrokes } from "@/components/KanjiStrokes";
import type { CollectedKanji, MemoryPlace } from "@/lib/collection";

/** Précision GPS maximale acceptée pour sceller un lieu (mètres). */
const MAX_ACCURACY_M = 50;
/** Distance minimale entre deux lieux scellés : un lieu = un seul kanji (mètres). */
const MIN_DISTANCE_M = 30;

function distanceM(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const mapsUrl = (p: MemoryPlace) =>
  `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lon}`;

type Fix = { lat: number; lon: number; accuracy: number };

/**
 * Rite d'ancrage : on se rend sur l'endroit que le mot rappelle, on prend sa position,
 * on trace le kanji une dernière fois, puis on scelle. Un lieu ne porte qu'un seul kanji.
 */
export function MemoryPlaceEditor({
  kanji,
  others,
  onSave,
}: {
  kanji: CollectedKanji;
  others: CollectedKanji[];
  onSave: (m: MemoryPlace | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [fix, setFix] = useState<Fix | null>(null);
  const [note, setNote] = useState("");
  const [traced, setTraced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const memory = kanji.memory;

  const reset = (o: boolean) => {
    setFix(null);
    setNote("");
    setTraced(false);
    setError(null);
    setLocating(false);
    setOpen(o);
  };

  const locate = () => {
    if (!navigator.geolocation) {
      setError("Position indisponible sur cet appareil.");
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const here: Fix = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        };
        if (here.accuracy > MAX_ACCURACY_M) {
          setFix(null);
          setError(
            `Signal trop imprécis (±${Math.round(here.accuracy)} m). Sortez à découvert et réessayez.`,
          );
          return;
        }
        const taken = others.find(
          (o) =>
            o.char !== kanji.char &&
            o.memory &&
            distanceM(o.memory, here) < MIN_DISTANCE_M,
        );
        if (taken) {
          setFix(null);
          setError(`Ce lieu appartient déjà au kanji ${taken.char}. Un lieu, un seul kanji.`);
          return;
        }
        setFix(here);
      },
      () => {
        setLocating(false);
        setError("Impossible d'obtenir la position (autorisation ou signal GPS).");
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  };

  const seal = () => {
    if (!fix || !traced) return;
    onSave({ lat: fix.lat, lon: fix.lon, note: note.trim(), sealedAt: Date.now() });
    reset(false);
  };

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3 text-sm">
      {memory ? (
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="font-jp flex h-9 w-9 shrink-0 items-center justify-center rounded border-2 border-primary text-lg text-primary"
          >
            印
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">
              Lieu scellé
              {memory.sealedAt
                ? ` · ${new Date(memory.sealedAt).toLocaleDateString("fr-FR", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}`
                : ""}
            </p>
            {memory.note && <p className="leading-relaxed">{memory.note}</p>}
            <p className="font-mono text-xs text-muted-foreground">
              {memory.lat.toFixed(5)}, {memory.lon.toFixed(5)}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <a
                href={mapsUrl(memory)}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-primary underline underline-offset-4"
              >
                Voir sur la carte (connexion requise)
              </a>
              <button
                type="button"
                onClick={() => {
                  if (
                    confirm(
                      "Briser le sceau ? Le lieu sera dissocié de ce kanji et vous devrez refaire le rite sur place.",
                    )
                  ) {
                    onSave(null);
                  }
                }}
                className="text-xs text-muted-foreground underline underline-offset-4 hover:text-destructive"
              >
                Briser le sceau
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Quel endroit ce mot vous rappelle-t-il ? Rendez-vous-y pour sceller le kanji.
          </p>
          <Dialog open={open} onOpenChange={reset}>
            <DialogTrigger asChild>
              <button
                type="button"
                className="self-start rounded-full border border-border px-3 py-1 text-xs text-primary transition-colors hover:border-primary"
              >
                Ancrer à un lieu
              </button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="font-jp">
                  {kanji.char} — {kanji.meaning}
                </DialogTitle>
                <DialogDescription>
                  Le rite se fait sur place : position, tracé, sceau. Ces informations restent
                  sur votre téléphone.
                </DialogDescription>
              </DialogHeader>

              <div className="flex flex-col gap-4 text-sm">
                <section className="flex flex-col gap-2">
                  <p className="font-medium">1. Rendez-vous à l'endroit choisi</p>
                  <button
                    type="button"
                    onClick={locate}
                    disabled={locating}
                    className="rounded-full bg-primary px-4 py-2 text-primary-foreground disabled:opacity-60"
                  >
                    {locating
                      ? "Recherche du signal…"
                      : fix
                        ? "Reprendre ma position"
                        : "Je suis sur le lieu"}
                  </button>
                  {fix && (
                    <p className="text-xs text-muted-foreground">
                      Position prise (±{Math.round(fix.accuracy)} m).
                    </p>
                  )}
                </section>

                {fix && (
                  <>
                    <section className="flex flex-col gap-2">
                      <p className="font-medium">2. Que vous rappelle ce mot ici ?</p>
                      <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        rows={2}
                        maxLength={280}
                        placeholder="Ex. : le banc face à la mer"
                        className="rounded-md border border-border bg-background px-3 py-2"
                      />
                    </section>

                    <section className="flex flex-col items-center gap-2">
                      <p className="self-start font-medium">3. Tracez le kanji une dernière fois</p>
                      <KanjiStrokes
                        key={`${kanji.char}-${fix.lat}-${fix.lon}`}
                        char={kanji.char}
                        mode="validate"
                        onComplete={() => setTraced(true)}
                      />
                    </section>

                    <button
                      type="button"
                      onClick={seal}
                      disabled={!traced}
                      className="rounded-full bg-primary px-4 py-2 text-primary-foreground disabled:opacity-40"
                    >
                      {traced ? "Sceller ce lieu 印" : "Tracez le kanji pour sceller"}
                    </button>
                  </>
                )}

                {error && <p className="text-xs text-destructive">{error}</p>}
              </div>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
