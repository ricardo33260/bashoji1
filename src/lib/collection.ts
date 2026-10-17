import { useCallback, useEffect, useState } from "react";

export type CollectedKanji = {
  char: string;
  meaning: string;
  geohash: string | null;
  at: number;
  count: number;
};

const KEY = "bashoji.collection.v1";

function read(): CollectedKanji[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as CollectedKanji[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(items: CollectedKanji[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* quota / mode privé */
  }
}

/** Collection locale des kanji dont le tracé a été validé entièrement. */
export function useCollection() {
  const [items, setItems] = useState<CollectedKanji[]>([]);

  useEffect(() => {
    setItems(read());
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setItems(read());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const add = useCallback((entry: Omit<CollectedKanji, "at" | "count">) => {
    setItems((prev) => {
      const idx = prev.findIndex((k) => k.char === entry.char);
      const next =
        idx >= 0
          ? prev.map((k, i) =>
              i === idx ? { ...k, ...entry, at: Date.now(), count: k.count + 1 } : k,
            )
          : [...prev, { ...entry, at: Date.now(), count: 1 }];
      next.sort((a, b) => b.at - a.at);
      write(next);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setItems([]);
    write([]);
  }, []);

  return { items, add, clear };
}
