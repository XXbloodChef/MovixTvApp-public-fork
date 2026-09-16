# AGENTS.md - Movix TV

## Overview

Ce dépôt est un clone de Movix consacré uniquement à une **application
Android TV** : un shell React Native (`app/`) qui affiche dans une WebView le
site React/Vite (`src/`) réduit à l'interface téléviseur et au lecteur. Pas de
site web, pas de backend, pas d'extension, pas d'iOS, pas de Chromecast. Les
services distants (API Movix, proxy `proxiesembed`) restent en ligne et sont
appelés avec la clé VIP (`x-access-key`).

Optimisé pour un téléviseur de référence (Edenwood 4K, Android 11, WebView
152, viewport CSS 960 × 540, SoC lent), mais adaptable à tout autre téléviseur
Android : l'interface se met à l'échelle du viewport (`src/tv/tvScale.ts`) et
un palier de performance mesuré (`src/tv/devicePerformance.ts`) active le mode
léger sur les appareils qui ne tiennent pas 30 images par seconde. Sur la
référence, aucun de ces deux mécanismes ne modifie le rendu.

Le contenu retiré le 15/09/2026 est archivé dans `.tv-backup/suppression-2026-09-15*/`
avec son arborescence d'origine et un README de restauration. Rien dans le
code ne référence ce dossier.

## Setup

```bash
npm install            # racine (site)
cd app && npm install  # shell (postinstall : patch-package applique patches/react-native-webview)
```

Gradle a besoin du JDK 21 (`~/.gradle/gradle.properties`, `org.gradle.java.home`).
La TV se pilote par adb réseau (`adb connect <ip>:5555`), avec
`adb reverse tcp:3000` et `tcp:8081` pour joindre Vite et Metro.

## Commands

```bash
npm run dev                    # Vite, http://localhost:3000
npm run build                  # dist/
npm run lint                   # ESLint
npm run tv                     # Vite + Metro + ponts adb, maintenus en vie (scripts/tv-dev-up.sh)
npm run app:publish            # publie l'APK release (scripts/publish-app.mjs)
node --test src/tv/__tests__/*.mjs src/tv/nav/__tests__/*.mjs
# Typecheck : `tsc -p tsconfig.json` ne vérifie rien (fichier « solution »).
# tsconfig.app.json exige ignoreDeprecations "6.0", refusé par TS 5.9 :
echo '{ "extends": "./tsconfig.app.json", "compilerOptions": { "ignoreDeprecations": "5.0" } }' > tsconfig.check.json \
  && npx tsc --noEmit -p tsconfig.check.json; rm -f tsconfig.check.json
# ~40 erreurs de type préexistantes (amont) dans HLSPlayer*.tsx : comparer avant/après.

cd app
npm start                      # Metro — tenu par l'utilisateur dans son terminal
npm run android                # build debug + installation
npm run build:userscript       # régénère src/injection/userscript-source.ts depuis userscript/movix.user.js
node --test tests/*.mjs
cd android && ./gradlew assembleDebug && ./gradlew testDebugUnitTest
```

## Repository Structure

```
src/
  main.tsx, App.tsx            # entrée et racine réduites (VIP, langue, 401, 4 routes)
  routing/registry.tsx         # /tvapp/*, /tvapp/diag, /watch/movie/:tmdbid, /watch/tv/:tmdbid/s/:season/e/:episode
  tv/                          # interface téléviseur
    TvBrowse.tsx               # accueil, Films, Séries, Animés (bannière + rangées)
    TvCollection.tsx           # « Voir plus » : grille + bandeau de prévisualisation
    TvDetails.tsx, TvSearch.tsx, TvSettings.tsx, TvDiagnosticsPage.tsx
    tvScale.ts, devicePerformance.ts   # échelle de viewport, palier de performance mesuré
    components/                # TvTopNav, TvRow, TvCard, TvMoreCard, TvKeyboard, TvPreviewBanner
    data/tmdb.ts               # registre des rangées TMDB et ordre par page
    nav/                       # moteur de focus télécommande (resolveMove, TvFocusProvider, focusRestore)
    player/                    # télécommande du lecteur, contrôles TV
  pages/Watch/                 # WatchMovie, WatchTv
  components/HLSPlayer.tsx     # lecteur principal (fichier de plus de 10 000 lignes)
  components/player/settings/  # panneau de réglages TV
  utils/, services/, hooks/, context/, i18n/locales/, types/
app/
  src/screens/BrowserScreen.tsx, src/components/WebViewBrowser.tsx
  src/services/bridge.ts       # pont page <-> natif
  src/injection/               # scripts injectés (userscript-source.ts est GÉNÉRÉ)
  android/.../com/movix/app/   # adblock, proxy, device, update, dns, pip, playback
  patches/                     # react-native-webview : hook du bloqueur + isTopFrame
userscript/movix.user.js       # source des extracteurs (éditer ici, puis build:userscript)
scripts/                       # tv-dev-up.sh, tv-dev.sh, publish-app.mjs
public/movix.png               # seul asset public
```

## Code Style

- ES modules partout, TypeScript strict, alias `@/` vers `src/`.
- Composants PascalCase, hooks `use*`, utilitaires camelCase, constantes
  SCREAMING_SNAKE_CASE. Tailwind seul, état par React Context.
- Français d'abord ; `fr.json` et `en.json` alignés, jamais réécrits par un
  sérialiseur JSON (insérer les clés textuellement).
- Commentaires : le pourquoi, avec la mesure qui a motivé le choix.
- Le lecteur (`HLSPlayer.tsx`) porte des erreurs de lint préexistantes :
  comparer les comptes avant/après.

## Working Rules

- Ne rien effacer : déplacer dans `.tv-backup/<libellé>/` en conservant les
  chemins. Le tri de `.tv-backup/` appartient à l'utilisateur.
- Patchs de l'auteur amont : `git apply` du `.patch`, jamais un écrasement par
  des fichiers complets antérieurs aux ajouts locaux ; contrôler par `diff`.
- `app/android/**` exige un nouvel APK ; `app/src/**` et `src/**` non.
- Valider sur la TV (captures `adb exec-out screencap -p`, console via
  `adb logcat -d | grep CONSOLE`), pas seulement par le typecheck.
- Ne pas lancer Metro ni Vite en tâche de fond depuis une session d'agent.

## Standalone APK (final step)

Faisable directement en l'état ; procédure complète dans `app/README.md`,
section « Portage en APK autonome ». Points de vigilance : en release le shell
résout l'adresse via rentry/`address.json` de Movix (remplacer par une adresse
fixe), le pont n'accepte qu'une origine `https` (héberger `dist/` en HTTPS avec
repli SPA), la clé VIP n'est amorcée qu'en développement (retirer la garde ou
ajouter une saisie dans les réglages TV), la mise à jour automatique vise le
dépôt Movix (la neutraliser ou publier son propre `version.json`), et la
signature release passe par `android/app/keystore.properties`.

## Environment Variables

`.env` (gitignoré) : `VITE_MAIN_API`, `VITE_TMDB_API_KEY`,
`VITE_PROXIES_EMBED_API`, `VITE_SITE_URL`, `VITE_DEV_ACCESS_CODE` (clé VIP
personnelle, amorcée dans `localStorage` en développement seulement). Le
reste du fichier est un héritage du site web, sans effet.

## Security Rules

- Ne jamais committer `.env` ni la clé VIP ; ne jamais l'écrire dans un
  fichier versionné, un journal ou une capture.
- Le pont natif n'accepte que des origines de confiance (`https`, plus
  `localhost:3000` en développement) : ne pas élargir sans mesure.
- Le bloqueur natif filtre par liste et par en-tête `Referer` ; les requêtes
  vers `movix.*`, `localhost` et les adresses privées ne sont jamais bloquées.
