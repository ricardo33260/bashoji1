// Build 100 % statique (SPA) pour l'APK hors ligne. Indépendant de la config Lovable/Start.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  root: r("./spa"),
  publicDir: r("./public"),
  base: "/",
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": r("./src") }, dedupe: ["react", "react-dom"] },
  build: { outDir: r("./android-app/www"), emptyOutDir: true, target: "es2022" },
});
