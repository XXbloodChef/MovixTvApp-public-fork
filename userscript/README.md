# Userscript Movix

Dans ce clone, le userscript n'est plus un livrable à installer dans un
navigateur : c'est **la source des extracteurs embarqués dans le shell Android
TV**. Le fichier `userscript/movix.user.js` est copié tel quel dans
`app/src/injection/userscript-source.ts` par le script de build du shell, puis
injecté dans la WebView avec un pont qui remplace les API Tampermonkey
(`GM_xmlhttpRequest`, `GM_getValue`, `GM_setValue`, `unsafeWindow`).

## Ce que le script fait dans l'application TV

- extraction locale des flux chez les hébergeurs (Voe, Uqload, Vidzy, Fsvid, Vidmoly, Sibnet, Dood…), utilisée quand le registre serveur Movix n'a pas de résultat ;
- réécriture d'en-têtes pour les hébergeurs qui exigent un `Referer`, à travers un shim `declarativeNetRequest` ;
- chargement très tôt dans la page (`document-start`), avant le code du site.

Le pont natif fait les requêtes HTTP lui-même (pas de CORS) ; les corps de
segments vidéo ne doivent **jamais** transiter par ce pont (`base64` sur un
SoC de téléviseur : dix secondes par segment) — le proxy Movix
(`proxiesembed.movix.*`) en est exempté, voir `shouldProxyNetworkRequest`.

## Modifier le script

1. Éditer `userscript/movix.user.js` — jamais `app/src/injection/userscript-source.ts`, qui est généré.
2. Régénérer : `cd app && npm run build:userscript` (`node scripts/build-userscript.js --check` vérifie la cohérence sans écrire).
3. Recharger l'application sur la TV : aucun nouvel APK n'est nécessaire, le bundle passe par Metro en développement et est embarqué au build release.

## Fichiers à connaître

| Fichier | Rôle |
| --- | --- |
| `userscript/movix.user.js` | Source unique des extracteurs |
| `app/scripts/build-userscript.js` | Génère `userscript-source.ts` (lancé aussi par `prebuild`) |
| `app/src/injection/inject.ts` | Assemble les shims et le userscript injectés dans la WebView |
| `app/src/injection/bridge-runtime.ts` | Les API `GM_*` côté page |

## Installation dans Tampermonkey

Le script reste installable dans un navigateur de bureau sur le site Movix
public, comme à l'origine : installer Tampermonkey, ouvrir `movix.user.js`,
lancer l'installation, recharger Movix. Ce n'est pas l'usage de ce dépôt.
