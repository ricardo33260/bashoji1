import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/** Mentions de licence exigées par les données et modèles embarqués. */
export function Credits() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="text-xs text-muted-foreground underline underline-offset-4 hover:text-primary"
        >
          Crédits et licences
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-jp">世界 Kanji Sekai — Crédits</DialogTitle>
          <DialogDescription>
            Kanji Sekai ne collecte aucune donnée : tout reste sur votre appareil.
          </DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-3 text-sm leading-relaxed">
          <li>
            <strong>Tracés des kanji</strong> : KanjiVG © Ulrich Apel, licence CC BY-SA 3.0
            (kanjivg.tagaini.net).
          </li>
          <li>
            <strong>Sens et lectures</strong> : KANJIDIC2 © Groupe EDRDG, licence CC BY-SA 4.0
            (edrdg.org).
          </li>
          <li>
            <strong>Suivi de la main</strong> : Google MediaPipe Hand Landmarker, licence Apache 2.0.
          </li>
          <li>
            <strong>Polices</strong> : Noto Serif JP et Zen Kaku Gothic New, licence SIL Open Font
            License 1.1.
          </li>
        </ul>
      </DialogContent>
    </Dialog>
  );
}
