/**
 * Reconnaissance de la touche Retour sur les téléviseurs sans shell natif.
 *
 * Sur Android TV, `TvLayout` négocie Retour et le relaie en événement
 * `movix-tv-back` : aucun keydown n'arrive jamais. Mais `TV_USER_AGENT_PATTERN`
 * (isTvDevice.ts) accepte aussi Tizen, webOS, VIDAA, NetCast et HbbTV, où il n'y
 * a pas de `MovixNative` — Retour y arrive comme un keydown portant un code
 * propriétaire que `useTvPlayerRemote` ne traite pas.
 *
 *   10009  Tizen (Samsung)
 *     461  webOS (LG)
 *      27  Escape — navigateurs desktop et mode `?tv=1`
 *       8  Backspace — idem
 */

const TV_BACK_KEY_CODES = new Set([10009, 461, 27, 8]);
const TV_BACK_KEYS = new Set(['XF86Back', 'BrowserBack', 'GoBack', 'Escape', 'Backspace']);

/** Vrai si l'événement clavier correspond à un Retour, tous téléviseurs confondus. */
export function isTvBackKey(event: Pick<KeyboardEvent, 'key' | 'keyCode'>): boolean {
  if (event.key && TV_BACK_KEYS.has(event.key)) return true;
  return typeof event.keyCode === 'number' && TV_BACK_KEY_CODES.has(event.keyCode);
}

/**
 * Vrai si la cible est un champ de saisie.
 *
 * Retour recouvre Backspace : sans ce filtre, corriger une frappe dans un champ
 * de recherche remonterait d'un niveau. Aucun champ texte n'existe encore dans
 * le panneau, mais la réécriture des sous-titres en amènera un.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag !== 'INPUT') return false;
  // Les curseurs et cases à cocher ne consomment pas Backspace.
  return !['range', 'checkbox', 'radio', 'button', 'submit', 'color'].includes(
    (target as HTMLInputElement).type,
  );
}
