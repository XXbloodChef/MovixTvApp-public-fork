#!/usr/bin/env bash
#
# Rétablit le lien entre la télévision et le poste de développement.
#
# Les ponts `adb reverse` sont attachés à la connexion adb : ils disparaissent
# dès que la TV se met en veille ou que la connexion se rétablit. La WebView ne
# voit alors plus ni Vite (3000) ni Metro (8081), et l'application affiche
# « Unable to load script ».
#
# Usage :
#   ./scripts/tv-dev.sh              # rétablit les ponts
#   ./scripts/tv-dev.sh --restart    # rétablit puis relance l'application
#
# L'adresse de la TV peut être surchargée : TV_ADDR=192.168.1.42:5555 ./scripts/tv-dev.sh

set -euo pipefail

TV_ADDR="${TV_ADDR:-192.168.1.9:5555}"
PACKAGE="com.xxbloodchef.movixtv"
PORTS=(3000 8081)

ADB="${ADB:-adb}"
if ! command -v "$ADB" >/dev/null 2>&1; then
  ADB="$HOME/Library/Android/sdk/platform-tools/adb"
fi
if ! command -v "$ADB" >/dev/null 2>&1; then
  echo "adb introuvable. Installe les platform-tools ou renseigne ADB=/chemin/vers/adb." >&2
  exit 1
fi

# Reconnexion si l'appareil a disparu de la liste.
if ! "$ADB" devices | grep -q "^${TV_ADDR}[[:space:]]*device$"; then
  echo "TV absente, reconnexion à ${TV_ADDR}…"
  "$ADB" connect "$TV_ADDR" >/dev/null || true
  sleep 2
fi

if ! "$ADB" devices | grep -q "^${TV_ADDR}[[:space:]]*device$"; then
  echo "Connexion impossible à ${TV_ADDR}." >&2
  echo "Vérifie que la TV est allumée, sur le même réseau, et que le débogage ADB est actif." >&2
  exit 1
fi

for port in "${PORTS[@]}"; do
  "$ADB" reverse "tcp:${port}" "tcp:${port}" >/dev/null
  printf '  pont tcp:%s rétabli\n' "$port"
done

# Avertit si un serveur manque : les ponts seuls ne suffisent pas.
for port in "${PORTS[@]}"; do
  if ! lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    case "$port" in
      3000) echo "  ⚠  rien n'écoute sur 3000 — lance 'npm run dev' à la racine" ;;
      8081) echo "  ⚠  rien n'écoute sur 8081 — lance 'npm start' dans app/" ;;
    esac
  fi
done

if [[ "${1:-}" == "--restart" ]]; then
  echo "Relance de l'application…"
  "$ADB" shell am force-stop "$PACKAGE"
  sleep 1
  "$ADB" shell am start -n "${PACKAGE}/.MainActivity" >/dev/null
fi

echo "Prêt."
