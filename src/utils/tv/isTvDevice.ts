/**
 * Détection de l'exécution sur téléviseur.
 *
 * Trois sources, dans cet ordre de confiance :
 *  1. `window.MovixNative.isTv` — posé par le shell Android TV (tv-shim.ts).
 *     Seule source fiable, basée sur UiModeManager côté natif.
 *  2. Le User-Agent — secours pour les navigateurs TV intégrés (Tizen, webOS,
 *     Bravia…) où il n'y a pas de shell natif.
 *  3. Un override manuel `?tv=1` — indispensable pour développer l'interface TV
 *     dans Chrome desktop sans sideloader un APK à chaque itération.
 */

export type TvDetectionSource = 'native-bridge' | 'user-agent' | 'override' | 'none';

export interface TvDetection {
  isTv: boolean;
  source: TvDetectionSource;
  userAgent: string;
  hasNativeBridge: boolean;
}

const OVERRIDE_STORAGE_KEY = 'movix_tv_mode';

/**
 * `AFT…` couvre les références Fire TV (AFTS, AFTMM, AFTKMST12…).
 * `CrKey` est le token des Chromecast.
 * Attention : ne PAS déduire la TV d'un Android sans token `Mobile` — les
 * tablettes tomberaient dans le panneau.
 */
const TV_USER_AGENT_PATTERN =
  /\b(?:Android\s?TV|GoogleTV|AFT[A-Z0-9]+|CrKey|BRAVIA|SmartTV|SMART-TV|HbbTV|NetCast|VIDAA|Tizen|Web0S|webOS)\b/i;

interface MovixNativeBridge {
  isTv?: boolean;
  setBackInterception?: (enabled: boolean) => void;
}

function readNativeBridge(): MovixNativeBridge | null {
  const candidate = (window as { MovixNative?: unknown }).MovixNative;
  if (candidate === null || typeof candidate !== 'object') return null;
  return candidate as MovixNativeBridge;
}

/**
 * Lit `?tv=1` / `?tv=0` et le persiste : l'override doit survivre aux
 * navigations React Router, qui ne conservent pas la query string.
 */
function readOverride(): boolean | null {
  let override: boolean | null = null;

  try {
    const param = new URLSearchParams(window.location.search).get('tv');
    if (param === '1' || param === 'true') override = true;
    if (param === '0' || param === 'false') override = false;
  } catch {
    // URL malformée : on retombe sur le stockage.
  }

  try {
    if (override !== null) {
      localStorage.setItem(OVERRIDE_STORAGE_KEY, override ? 'true' : 'false');
      return override;
    }
    const stored = localStorage.getItem(OVERRIDE_STORAGE_KEY);
    if (stored === 'true') return true;
    if (stored === 'false') return false;
  } catch {
    // Mode privé / stockage bloqué : l'override vaut pour cette page seulement.
    return override;
  }

  return override;
}

export function getTvDetection(): TvDetection {
  if (typeof window === 'undefined') {
    return { isTv: false, source: 'none', userAgent: '', hasNativeBridge: false };
  }

  const userAgent = window.navigator?.userAgent ?? '';
  const bridge = readNativeBridge();
  const hasNativeBridge = bridge !== null;

  // L'override passe devant tout, y compris le bridge : il sert aussi à forcer
  // l'interface classique sur une TV pour comparer.
  const override = readOverride();
  if (override !== null) {
    return { isTv: override, source: 'override', userAgent, hasNativeBridge };
  }

  if (bridge?.isTv === true) {
    return { isTv: true, source: 'native-bridge', userAgent, hasNativeBridge };
  }

  if (TV_USER_AGENT_PATTERN.test(userAgent)) {
    return { isTv: true, source: 'user-agent', userAgent, hasNativeBridge };
  }

  return { isTv: false, source: 'none', userAgent, hasNativeBridge };
}

export function isTvDevice(): boolean {
  return getTvDetection().isTv;
}

/**
 * Déclare au shell natif que la page prendra la touche Retour à sa charge.
 *
 * `BackHandler` côté natif doit répondre de façon synchrone : il lit ce drapeau
 * au lieu d'interroger la page. Sans appel, Retour recule dans l'historique.
 * Sans shell natif (navigateur), l'appel est simplement ignoré.
 */
export function setNativeBackInterception(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  readNativeBridge()?.setBackInterception?.(enabled);
}

export function setTvOverride(value: boolean | null): void {
  try {
    if (value === null) localStorage.removeItem(OVERRIDE_STORAGE_KEY);
    else localStorage.setItem(OVERRIDE_STORAGE_KEY, value ? 'true' : 'false');
  } catch {
    // Stockage indisponible — rien à faire, l'appelant recharge de toute façon.
  }
}
