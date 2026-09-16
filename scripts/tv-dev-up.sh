#!/usr/bin/env bash
#
# Lance tout l'environnement de développement TV, dans le bon ordre, et le
# maintient en vie.
#
# ## Pourquoi ce script existe
#
# Trois choses doivent tourner ensemble : Vite (3000) sert l'interface web,
# Metro (8081) sert le paquet React Native, et deux ponts `adb reverse` font
# croire à la télévision que ces deux ports sont chez elle.
#
# Les ponts sont le maillon faible : ils sont attachés à la **connexion adb**.
# Dès qu'elle se rompt — veille de la télévision, changement d'adresse, hoquet
# du Wi-Fi — la table des ponts est vidée en entier. Au retour, le CLI React
# Native rétablit `tcp:8081`, qui est le seul dont il ait besoin. Le pont 3000,
# lui, ne revient jamais tout seul : la WebView cherche alors `localhost:3000`,
# ne trouve rien, bascule sur la liste de miroirs, et affiche
# « Movix injoignable ».
#
# Le symptôme accuse donc toujours autre chose que la cause — Metro, le domaine,
# le réseau. D'où la surveillance ci-dessous : elle réaffirme les deux ponts
# toutes les `WATCH_INTERVAL` secondes. `adb reverse` est idempotent, donc
# réaffirmer un pont déjà en place ne coûte rien.
#
# ## Usage
#
#   ./scripts/tv-dev-up.sh          # démarre ce qui manque, surveille, Ctrl+C pour arrêter
#   TV_ADDR=192.168.1.42:5555 ./scripts/tv-dev-up.sh
#
# Les serveurs déjà lancés à la main sont réutilisés tels quels, et laissés en
# vie à la sortie : le script n'arrête que ce qu'il a lui-même démarré.

set -uo pipefail

TV_ADDR="${TV_ADDR:-192.168.1.9:5555}"
PACKAGE="com.movix.app"
WATCH_INTERVAL="${WATCH_INTERVAL:-10}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$ROOT/.tv-dev-logs"
mkdir -p "$LOG_DIR"

ADB="${ADB:-adb}"
command -v "$ADB" >/dev/null 2>&1 || ADB="$HOME/Library/Android/sdk/platform-tools/adb"
if ! command -v "$ADB" >/dev/null 2>&1; then
  echo "adb introuvable. Installe les platform-tools ou renseigne ADB=/chemin/vers/adb." >&2
  exit 1
fi

VITE_PID=""
METRO_PID=""

say()  { printf '  %s\n' "$*"; }
step() { printf '\n\033[1m%s\033[0m\n' "$*"; }

listening() { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }

# Attend qu'un port réponde, jusqu'à `timeout` secondes.
wait_for_port() {
  local port="$1" timeout="${2:-60}" waited=0
  while ! listening "$port"; do
    sleep 1
    waited=$((waited + 1))
    if [ "$waited" -ge "$timeout" ]; then return 1; fi
  done
  return 0
}

cleanup() {
  trap - INT TERM EXIT
  step "Arrêt"
  # Seuls les processus démarrés par ce script sont arrêtés : un serveur que
  # l'utilisateur avait lancé dans son propre terminal doit lui survivre.
  for pid in "$VITE_PID" "$METRO_PID"; do
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null
      say "processus $pid arrêté"
    fi
  done
  say "les serveurs lancés à la main restent en vie"
  exit 0
}
trap cleanup INT TERM

# --- Serveurs ---------------------------------------------------------------

step "Serveurs"

if listening 3000; then
  say "Vite (3000) déjà lancé — réutilisé"
else
  say "démarrage de Vite (3000)…"
  ( cd "$ROOT" && npm run dev >"$LOG_DIR/vite.log" 2>&1 ) &
  VITE_PID=$!
fi

if listening 8081; then
  say "Metro (8081) déjà lancé — réutilisé"
else
  say "démarrage de Metro (8081)…"
  ( cd "$ROOT/app" && npm start >"$LOG_DIR/metro.log" 2>&1 ) &
  METRO_PID=$!
fi

for port in 3000 8081; do
  if wait_for_port "$port" 90; then
    say "port $port prêt"
  else
    say "⚠  le port $port n'écoute toujours pas — voir $LOG_DIR/"
  fi
done

# --- Télévision -------------------------------------------------------------

step "Télévision"

connect_tv() {
  if "$ADB" devices | grep -q "^${TV_ADDR}[[:space:]]*device$"; then return 0; fi
  "$ADB" connect "$TV_ADDR" >/dev/null 2>&1
  sleep 2
  "$ADB" devices | grep -q "^${TV_ADDR}[[:space:]]*device$"
}

if connect_tv; then
  say "connectée à $TV_ADDR"
else
  say "⚠  connexion impossible à $TV_ADDR"
  say "   vérifie qu'elle est allumée, sur le même réseau, débogage ADB actif"
fi

# Les ponts sont posés APRÈS Metro : le CLI React Native touche à la table des
# ponts au démarrage, et la surveillance ci-dessous rattrape le reste.
bridges() {
  "$ADB" reverse tcp:3000 tcp:3000 >/dev/null 2>&1 &&
  "$ADB" reverse tcp:8081 tcp:8081 >/dev/null 2>&1
}

if bridges; then say "ponts 3000 et 8081 posés"; else say "⚠  ponts non posés"; fi

step "Application"
"$ADB" shell am force-stop "$PACKAGE" >/dev/null 2>&1
sleep 1
"$ADB" shell am start -n "${PACKAGE}/.MainActivity" >/dev/null 2>&1 && say "relancée"

# --- Surveillance -----------------------------------------------------------

step "Surveillance active — Ctrl+C pour tout arrêter"
say "les ponts sont réaffirmés toutes les ${WATCH_INTERVAL} s"
say "journaux : $LOG_DIR/"
echo

missing_since=""
while true; do
  sleep "$WATCH_INTERVAL"

  if ! "$ADB" devices | grep -q "^${TV_ADDR}[[:space:]]*device$"; then
    if [ -z "$missing_since" ]; then
      missing_since="$(date '+%H:%M:%S')"
      printf '  [%s] télévision déconnectée — reconnexion…\n' "$(date '+%H:%M:%S')"
    fi
    connect_tv >/dev/null 2>&1 && {
      printf '  [%s] reconnectée\n' "$(date '+%H:%M:%S')"
      missing_since=""
      bridges && printf '  [%s] ponts rétablis\n' "$(date '+%H:%M:%S')"
    }
    continue
  fi

  # Connexion vivante : on vérifie chaque pont séparément. Le 3000 est celui qui
  # disparaît sans revenir — c'est lui qu'on surveille vraiment.
  #
  # Un test par pont, et non un comptage de lignes : `adb reverse --list` change
  # de format selon la version, et une expression d'alternation qui compte mal
  # rendait la surveillance muette — elle rétablissait le pont sans le dire, ce
  # qui est le pire des deux mondes quand on cherche à comprendre une panne.
  listing="$("$ADB" reverse --list 2>/dev/null)"
  missing=""
  case "$listing" in *tcp:3000*) ;; *) missing="3000" ;; esac
  case "$listing" in *tcp:8081*) ;; *) missing="${missing:+$missing et }8081" ;; esac

  if [ -n "$missing" ]; then
    if bridges; then
      printf '  [%s] pont %s rétabli\n' "$(date '+%H:%M:%S')" "$missing"
    else
      printf '  [%s] ⚠  pont %s introuvable et non rétabli\n' "$(date '+%H:%M:%S')" "$missing"
    fi
  fi
done
