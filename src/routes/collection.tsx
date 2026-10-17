import { createFileRoute, Link } from "@tanstack/react-router";
import { useCollection, type CollectedKanji } from "@/lib/collection";
import { SpeakButton } from "@/components/SpeakButton";
import { Credits } from "@/components/Credits";

export const Route = createFileRoute("/collection")({
  head: () => ({
    meta: [
      { title: "Collection — Bashoji" },
      {
        name: "description",
        content:
          "Les kanji dont vous avez validé le tracé en marchant. Votre collection personnelle Bashoji.",
      },
      { property: "og:title", content: "Collection — Bashoji" },
      {
        property: "og:description",
        content: "Kanji validés au tracé, classés par date de réussite.",
      },
    ],
  }),
  component: CollectionPage,
});

function CollectionPage() {
  const collection = useCollection();
  const total = collection.items.reduce((n, k) => n + k.count, 0);

  return (
    <main className="min-h-screen bg-background px-5 py-10 text-foreground">
      <div className="mx-auto flex w-full max-w-md flex-col gap-8">
        <header className="text-center">
          <p className="font-jp text-sm tracking-[0.4em] text-primary">場所じ</p>
          <h1 className="mt-2 font-jp text-2xl font-semibold tracking-tight">Collection</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {collection.items.length === 0
              ? "Aucun kanji validé pour l'instant. Tracez un kanji entier en mode « Valider » pour l'ajouter."
              : `${collection.items.length} kanji distinct${collection.items.length > 1 ? "s" : ""} · ${total} validation${total > 1 ? "s" : ""} au total.`}
          </p>
        </header>

        {collection.items.length === 0 ? (
          <section className="paper rounded-2xl px-5 py-10 text-center">
            <div className="font-jp text-[5rem] leading-none text-muted-foreground/30">白</div>
            <p className="mt-4 text-sm text-muted-foreground">
              Votre collection est vide. Retournez à la carte, révélez un kanji, puis tracez-le.
            </p>
          </section>
        ) : (
          <ul className="flex flex-col gap-3">
            {collection.items.map((k: CollectedKanji) => (
              <li
                key={k.char}
                className="paper flex items-center gap-4 rounded-2xl px-4 py-3"
              >
                <span className="font-jp text-4xl leading-none text-primary">{k.char}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{k.meaning}</p>
                  {k.geohash && (
                    <p className="truncate font-mono text-xs tracking-widest text-muted-foreground">
                      {k.geohash}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {new Date(k.at).toLocaleDateString("fr-FR", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    · ×{k.count}
                  </p>
                </div>
                <SpeakButton text={k.char} label="Écouter" />
              </li>
            ))}
          </ul>
        )}

        {collection.items.length > 0 && (
          <button
            type="button"
            onClick={() => {
              if (confirm("Vider toute la collection ? Cette action est définitive.")) {
                collection.clear();
              }
            }}
            className="rounded-full border border-border px-4 py-2 text-xs text-muted-foreground transition-colors hover:border-destructive hover:text-destructive"
          >
            Vider la collection
          </button>
        )}

        <Link
          to="/"
          className="text-center text-sm text-primary underline-offset-4 hover:underline"
        >
          ← Retour à la carte
        </Link>
        <div className="text-center">
          <Credits />
        </div>
      </div>
    </main>
  );
}
