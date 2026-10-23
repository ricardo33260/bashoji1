# 世界 Kanji Sekai

Le kanji attaché à chaque lieu, un carré de 30 m à la fois.

Application web installable (PWA) : TanStack Start, React, TypeScript, Tailwind.

## Lancer en local
```sh
bun install      # ou npm i
bun run dev
```

## Publier sur GitHub
```sh
git init
git add .
git commit -m "Kanji Sekai: premier commit"
git branch -M main
git remote add origin https://github.com/<ton-compte>/bashoji.git
git push -u origin main
```
Le workflow `CI` build l'app à chaque push.

## (Optionnel) Déployer le site en ligne sur Cloudflare
1. Crée un token API Cloudflare (modèle « Edit Cloudflare Workers »).
2. Dans GitHub : Settings > Secrets and variables > Actions, ajoute
   `CLOUDFLARE_API_TOKEN` et `CLOUDFLARE_ACCOUNT_ID`.
3. Recrée un workflow `deploy.yml` (`bunx wrangler deploy` après `bun run build`). Il a été retiré car l'APK hors ligne n'en a pas besoin.

Si le build ne génère pas de config Wrangler, ajoute un `wrangler.jsonc`
(nom : `bashoji`) pointant vers la sortie `.output/` du build.

## Installer comme une app sur le téléphone
Ouvre l'URL déployée (HTTPS requis pour la géolocalisation et la caméra),
puis :
- **Android (Chrome)** : menu ⋮ > Installer l'application
- **iPhone (Safari)** : Partager > Sur l'écran d'accueil

## Android : APK de test et publication Play Store
Tout est hors ligne : site, polices, modèle MediaPipe et tracés KanjiVG sont embarqués.
Le workflow **Android (APK test + AAB Play Store)** (onglet Actions > Run workflow) produit :
- `bashoji-apk-debug` : APK à installer chez toi pour tester ;
- `bashoji-play-aab` : bundle **signé** à envoyer au Play Store (seulement si les secrets ci-dessous existent).

La cible est Android 16 (API 36), exigée par Google Play depuis le 31 août 2026
(Capacitor 8, Node 22, Java 21).

### 1. Créer la clé de signature (une seule fois)
Sur ton ordinateur (Java requis) : `./scripts/make-keystore.sh`. Garde `bashoji-upload.jks`
et les mots de passe en lieu sûr (jamais dans Git, le `.gitignore` l'exclut).

### 2. Secrets GitHub (Settings > Secrets and variables > Actions > Secrets)
| Secret | Valeur |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | texte base64 affiché par le script |
| `ANDROID_KEYSTORE_PASSWORD` | mot de passe du keystore |
| `ANDROID_KEY_ALIAS` | `bashoji` |
| `ANDROID_KEY_PASSWORD` | mot de passe de la clé |

### 3. Préparer la publication
- Change `appId` dans `android-app/capacitor.config.js` si tu veux un autre identifiant : il est **définitif** après le 1er envoi.
- Remplace l'e-mail de contact dans `docs/privacy.html`, puis active GitHub Pages (dossier `/docs`) pour obtenir l'URL de la politique de confidentialité.
- Crée l'appli dans la Play Console, remplis la fiche avec `store/listing.md` et les images de `store/`.
- Lance le workflow, télécharge `bashoji-play-aab`, envoie le `.aab` dans un test interne puis en production.
- Chaque exécution incrémente automatiquement le `versionCode` (numéro d'exécution GitHub).

Play App Signing est activé par défaut : Google garde la clé finale, la tienne n'est que la clé d'envoi
(récupérable en cas de perte via le support Play).

## Icône
`public/icons/` : 192, 512, maskable (Android) et 1024 px, plus
`apple-touch-icon.png` (180 px) et `favicon.ico`. Kanji 場 (basho, « lieu »)
en blanc cassé sur rouge vermillon, aux couleurs du thème.

## Origine
Projet généré avec Lovable ; le code reste synchronisable avec Lovable via GitHub.

## Licences des données
Tracés KanjiVG (CC BY-SA 3.0), KANJIDIC2 (CC BY-SA 4.0), MediaPipe (Apache 2.0),
polices Noto Serif JP et Zen Kaku Gothic New (OFL). Les mentions figurent dans `docs/privacy.html`.
