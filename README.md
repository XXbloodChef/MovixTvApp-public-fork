<p align="center">
  <img src="./public/movix.png" alt="Movix" width="120" />
</p>

<h1 align="center">Movix TV</h1>

<p align="center">
  <strong>MovixTv pour téléviseur Android, à la télécommande — une déclinaison du site de streaming open source Movix.</strong>
</p>

<p align="center">
  <a href="https://react.dev">React</a> |
  <a href="https://vite.dev">Vite</a> |
  <a href="https://www.typescriptlang.org">TypeScript</a> |
  <a href="https://reactnative.dev">React Native</a> |
  <a href="https://kotlinlang.org">Kotlin</a> |
  <a href="https://www.android.com/tv/">Android TV</a>
</p>

<p align="center">
  <a href="https://react.dev">
    <img alt="React" src="https://img.shields.io/badge/React-149ECA?style=flat-square&logo=react&logoColor=white" />
  </a>
  <a href="https://vite.dev">
    <img alt="Vite" src="https://img.shields.io/badge/Vite-7C3AED?style=flat-square&logo=vite&logoColor=white" />
  </a>
  <a href="https://www.typescriptlang.org">
    <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white" />
  </a>
  <a href="https://reactnative.dev">
    <img alt="React Native" src="https://img.shields.io/badge/React_Native-20232A?style=flat-square&logo=react&logoColor=61DAFB" />
  </a>
  <a href="https://kotlinlang.org">
    <img alt="Kotlin" src="https://img.shields.io/badge/Kotlin-7F52FF?style=flat-square&logo=kotlin&logoColor=white" />
  </a>
  <a href="https://www.android.com/tv/">
    <img alt="Android TV" src="https://img.shields.io/badge/Android_TV-3DDC84?style=flat-square&logo=android&logoColor=white" />
  </a>
</p>

<p align="center">
  <strong>Licence :</strong> Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0) · <a href="./LICENSE">LICENSE</a>
</p>

Ce dépôt est un clone de [Movix](https://github.com/movixcorp/MovixOpenSource) consacré à **une seule chose : une application Android TV**. Il contient le site réduit à l'interface téléviseur et au lecteur, et le shell Android qui l'affiche. Le site web souris, les backends, les extensions navigateur, la WatchParty, iOS et Chromecast n'en font plus partie. Les services distants de Movix (API, proxy d'extraction) restent utilisés tels quels, avec une clé d'accès VIP.

Le projet a été optimisé sur un téléviseur de référence — Edenwood 4K, Android 11, WebView Chromium 152, viewport 960 × 540 — et s'adapte automatiquement à d'autres téléviseurs Android : mise à l'échelle du viewport et palier de performance mesuré (voir plus bas).

## Ce que fait l'application

- **Une interface pensée pour trois mètres** : bannière, rangées d'affiches, pages Films, Séries et Animés, collections « Voir plus », fiche de détail, recherche au clavier virtuel, réglages. Tout se pilote au pavé directionnel, avec un moteur de focus qui raisonne par index plutôt que par géométrie.
- **Le lecteur Movix, adapté à la télécommande** : barre de lecture, panneau de réglages en arborescence (sources, qualité, audio, sous-titres, vitesse, format), touches Lecture/Pause, avance et retour rapides, sauts de 10 s aux flèches, reprise de lecture, épisode suivant.
- **Sous-titres** : décalage temporel, taille automatique pour la TV, pistes incrustées CEA-608 listées et activables, avec détection automatique de leur langue d'après le texte.
- **Récupération des médias** : registre serveur Movix avec repli sur l'extraction locale embarquée (userscript) quand le serveur n'a pas de résultat.
- **Bloqueur de publicités natif** dans la WebView (liste d'hôtes, règles par en-tête `Referer`, autorisation des scripts de même marque), débrayable depuis les réglages de l'interface TV.
- **Shell Android** : proxy média natif (contournement CORS et en-têtes exigés par certains hébergeurs, moteur réseau Cronet), mise à jour d'APK intégrée, DNS Cloudflare optionnel, écran maintenu allumé pendant la lecture, image dans l'image.

## Architecture

```
src/                    site React 18 + Vite 5, servi dans la WebView
  tv/                   interface téléviseur (/tvapp/*), moteur de focus, télécommande du lecteur
  pages/Watch/          pages de lecture (/watch/movie, /watch/tv)
  components/HLSPlayer  lecteur principal (hls.js) et son panneau de réglages TV
app/                    shell React Native 0.75 (Android uniquement)
  src/                  WebView, pont page <-> natif, scripts injectés, mise à jour d'APK
  android/              modules Kotlin : bloqueur, proxy média, télécommande, mise à jour, DNS, PiP
userscript/             source des extracteurs, générée dans le shell (npm run build:userscript)
scripts/                environnement de dev TV (Vite + Metro + ponts adb), publication d'APK
```

En développement, la TV charge le site depuis le poste de travail : `adb reverse` fait pointer `localhost:3000` (Vite) et `localhost:8081` (Metro) de la TV vers le Mac. En production, le shell charge l'adresse configurée dans `app/src/config/index.ts`.

## Démarrage rapide

### Prérequis

- Node.js 20 ou plus, npm
- Android SDK avec `adb`, et un JDK 21 pour Gradle (à déclarer dans `~/.gradle/gradle.properties` via `org.gradle.java.home`)
- Un téléviseur ou une box Android TV sur le même réseau, avec le débogage adb activé (`adb connect <ip>:5555`)
- Une clé API TMDB et une clé d'accès VIP Movix

### Installer

```bash
npm install
cd app && npm install && cd ..
cp .env.example .env    # puis renseigner les variables ci-dessous
```

### Configurer `.env`

Le fichier `.env` est gitignoré : chaque poste le remplit. Les variables sont lues au build, donc relancer `npm run dev` ou `npm run tv` après modification. Les URL d'API doivent inclure `https://`.

| Variable | Obligatoire | Valeur |
|---|---|---|
| `VITE_MAIN_API` | oui | `https://api.movix.men` (API distante, pas dans ce dépôt) |
| `VITE_PROXIES_EMBED_API` | oui | `https://proxiesembed.movix.men` (extraction des hébergeurs) |
| `VITE_TMDB_API_KEY` | oui | clé API TMDB v3, à créer sur themoviedb.org |
| `VITE_DEV_ACCESS_CODE` | oui en développement | clé VIP personnelle, posée dans `localStorage['access_code']` de la WebView par `src/main.tsx` en dev seulement. Sans elle, l'API répond « VIP access required ». Ne jamais la committer. |
| `VITE_SITE_URL` | oui | `http://localhost:3000` en développement, l'adresse HTTPS d'hébergement en production |

Les autres entrées de `.env.example` (miroirs du service worker, Turnstile, régie, analytics) sont héritées du site web et peuvent rester vides.

### Lancer sur la TV

```bash
npm run tv              # Vite + Metro + ponts adb, relancés automatiquement s'ils tombent
cd app && npm run android   # première installation de l'APK de développement
```

Ensuite, toute modification de `src/` (site) ou `app/src/` (shell JavaScript) est prise à chaud. Seuls les changements sous `app/android/` (Kotlin, manifeste, Gradle) exigent de recompiler l'APK :

```bash
cd app/android && ./gradlew assembleDebug && adb install -r app/build/outputs/apk/debug/app-debug.apk
```

### Vérifier

```bash
npm run build                                                   # build de production du site
npm run lint                                                    # ESLint
node --test src/tv/__tests__/*.mjs src/tv/nav/__tests__/*.mjs   # tests de l'interface TV
cd app && node --test tests/*.mjs                               # tests du shell
cd app/android && ./gradlew testDebugUnitTest                   # tests Kotlin
```

Le typecheck du site a une particularité : `tsconfig.json` est un fichier « solution » qui ne vérifie rien par lui-même, et `tsconfig.app.json` vise TypeScript 6. Avec la version installée, passer par un fichier temporaire :

```bash
echo '{ "extends": "./tsconfig.app.json", "compilerOptions": { "ignoreDeprecations": "5.0" } }' > tsconfig.check.json \
  && npx tsc --noEmit -p tsconfig.check.json; rm -f tsconfig.check.json
```

Il reste une soixantaine d'erreurs de type héritées du projet amont dans le lecteur et ses pages de lecture ; elles n'empêchent ni le build ni l'exécution.

## Adaptation à d'autres téléviseurs

- **Échelle de viewport** (`src/tv/tvScale.ts`) : l'interface est dessinée sur un gabarit de 960 × 540 pixels CSS. Sur un viewport différent, elle est mise à l'échelle par transformation ; sur le gabarit natif, rien n'est appliqué. Pour essayer une autre échelle : `?tvscale=0.8` dans l'adresse.
- **Palier de performance** (`src/tv/devicePerformance.ts`) : les premières secondes de l'accueil sont chronométrées ; un appareil qui ne tient pas trente images par seconde passe en mode léger (animations coupées) au lancement suivant.
- Les réglages de l'interface TV affichent le viewport, l'échelle et le palier mesurés ; la page `/tvapp/diag` mesure en direct.

## Portage en APK autonome

L'objectif final est une application installée sur le téléviseur qui tourne
sans le poste de développement. **En l'état, la conversion peut être faite
directement** : le build release du shell embarque le bundle JavaScript, les
modules natifs sont finis, et le site se construit en une commande. Il reste
deux décisions et quelques réglages, sans nouveau développement natif :

1. construire le site (`npm run build`) et le servir en HTTPS avec repli SPA, sur un domaine à soi ;
2. choisir comment la clé VIP arrive dans l'application : amorçage au build (simple, pour un site privé) ou écran de saisie dans les réglages TV (propre) ;
3. pointer le shell vers cette adresse, neutraliser la mise à jour automatique qui vise le dépôt Movix, fixer le nom et la version, signer, construire `assembleRelease`, installer.

La procédure détaillée, étape par étape avec les fichiers à modifier, est dans [app/README.md](app/README.md#portage-en-apk-autonome).

## Documentation

- [CLAUDE.md](CLAUDE.md) et [AGENTS.md](AGENTS.md) : guides pour les assistants de code, avec les règles de travail du projet.
- [app/README.md](app/README.md) : le shell Android, son fonctionnement et la procédure de portage en APK autonome.
- [userscript/README.md](userscript/README.md) : le userscript d'extraction.
- [src/README.md](src/README.md) : notes du frontend amont.

## Ce qui a été retiré, et où le retrouver

Le nettoyage du 15/09/2026 a déplacé, sans les effacer, les backends, les extensions, la WatchParty, le site souris, iOS et Chromecast dans `.tv-backup/` (dossiers `suppression-2026-09-15*`, avec un README de restauration chacun). Ce dossier n'est référencé par aucun code et peut être supprimé une fois l'application validée à l'usage.

## Licence et crédits

Ce projet dérive de Movix et reste distribué sous licence Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0). Le texte complet est disponible dans [LICENSE](LICENSE). L'utilisation de ce code implique le maintien des crédits et l'interdiction stricte de le monétiser : aucune publicité, aucun abonnement.

## Avertissement

Ce projet est fourni uniquement à des fins éducatives, de recherche et de démonstration.
Il n'encourage ni ne cautionne une utilisation illégale, le contournement de droits, ou toute violation des lois applicables.
Chaque utilisateur est seul responsable de l'usage qu'il en fait.
