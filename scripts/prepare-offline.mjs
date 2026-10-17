// Prépare les ressources à embarquer dans l'APK : WASM + modèle MediaPipe, tracés KanjiVG.
// À lancer après `vite build -c vite.spa.config.ts` (qui vide android-app/www).
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const OUT = "android-app/www";
if (!existsSync(`${OUT}/index.html`)) throw new Error("Lance d'abord le build SPA.");

// 1. MediaPipe : fichiers WASM (déjà dans node_modules)
cpSync("node_modules/@mediapipe/tasks-vision/wasm", `${OUT}/mediapipe/wasm`, { recursive: true });

// 2. MediaPipe : modèle de suivi de la main
const MODEL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const res = await fetch(MODEL);
if (!res.ok) throw new Error(`Modèle introuvable (${res.status})`);
writeFileSync(`${OUT}/mediapipe/hand_landmarker.task`, Buffer.from(await res.arrayBuffer()));

// 3. KanjiVG : un SVG par kanji de la liste jōyō
if (!existsSync(".cache/kanjivg")) {
  execSync("git clone --depth 1 https://github.com/KanjiVG/kanjivg .cache/kanjivg", { stdio: "inherit" });
}
const chars = [...readFileSync("src/lib/kanji.ts", "utf8").matchAll(/char:\s*"(.)"/gu)].map((m) => m[1]);
mkdirSync(`${OUT}/kanjivg`, { recursive: true });
let ok = 0;
const missing = [];
for (const c of chars) {
  const key = c.codePointAt(0).toString(16).padStart(5, "0");
  const src = `.cache/kanjivg/kanji/${key}.svg`;
  if (existsSync(src)) {
    cpSync(src, `${OUT}/kanjivg/${key}.svg`);
    ok++;
  } else missing.push(c);
}
console.log(`KanjiVG : ${ok}/${chars.length} kanji copiés.`);
if (missing.length) console.warn("Sans tracé :", missing.join(" "));
if (ok < chars.length * 0.95) throw new Error("Trop de tracés manquants.");
