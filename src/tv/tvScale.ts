/**
 * Échelle de l'interface téléviseur.
 *
 * L'interface est dessinée en pixels CSS sur un gabarit de 960 × 540 — le
 * viewport du téléviseur de référence (1920 × 1080 à densité 2). Un autre
 * téléviseur peut exposer un viewport CSS différent : 1280 × 720 à densité
 * 1,5, 1920 × 1080 à densité 1… Sans correction, tout y paraîtrait petit et
 * laisserait du vide.
 *
 * Plutôt que de rendre chaque dimension relative — des dizaines de constantes
 * dans les rangées, les cartes, le clavier, les fiches — la coquille `TvLayout`
 * dessine l'interface dans une boîte de 960 × 540 et la met à l'échelle du
 * viewport par `transform: scale()`. Le moteur de focus raisonne par index,
 * pas par géométrie, et n'en est pas affecté.
 *
 * Sur le téléviseur de référence le facteur vaut exactement 1 et **rien n'est
 * appliqué** : ni boîte, ni transformation. Le rendu y reste celui d'avant.
 *
 * Le lecteur (`/watch/…`) n'est pas concerné : il est fluide et remplit
 * l'écran quelle que soit sa taille.
 *
 * Pour essayer une autre échelle sur le téléviseur de référence :
 * `?tvscale=0.8` dans l'adresse, ou `localStorage['movix:tv:scale-override']`.
 */

export const TV_DESIGN_WIDTH = 960;
export const TV_DESIGN_HEIGHT = 540;

const OVERRIDE_KEY = 'movix:tv:scale-override';

/** Écart en dessous duquel on considère être sur le gabarit natif. */
const UNITY_TOLERANCE = 0.02;

function readOverride(): number | null {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('tvscale');
    const raw = fromUrl ?? localStorage.getItem(OVERRIDE_KEY);
    if (raw === null) return null;
    const value = Number(raw);
    return Number.isFinite(value) && value > 0.2 && value < 5 ? value : null;
  } catch {
    return null;
  }
}

function computeScale(): number {
  const override = readOverride();
  if (override !== null) return override;
  if (typeof window === 'undefined' || !window.innerWidth || !window.innerHeight) return 1;
  // Le plus petit des deux rapports : l'interface tient entièrement, et un
  // écran d'un autre format garde une bande vide plutôt que de rogner.
  const scale = Math.min(window.innerWidth / TV_DESIGN_WIDTH, window.innerHeight / TV_DESIGN_HEIGHT);
  return Math.abs(scale - 1) < UNITY_TOLERANCE ? 1 : Math.round(scale * 1000) / 1000;
}

/**
 * Calculée une fois au chargement : le viewport d'un téléviseur ne change pas
 * en cours de session, et une échelle qui bougerait sous le focus serait pire
 * qu'une échelle légèrement fausse.
 */
export const TV_SCALE: number = computeScale();

export const isTvScaled = (): boolean => TV_SCALE !== 1;
