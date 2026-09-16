/**
 * Retour au point de départ après un aller-retour vers un écran de second
 * niveau.
 *
 * Une page de parcours se remonte de zéro en revenant d'une collection : ses
 * rangées se rechargent, et le moteur de focus ne sait plus d'où l'on était
 * parti. On note donc, au moment d'ouvrir l'écran de second niveau, la portée
 * et l'index quittés ; la page qui se remonte les lit, et rend le focus à la
 * carte exacte — celle qu'on vient de quitter, pas la première du bandeau.
 *
 * `sessionStorage` plutôt que l'état de navigation : `navigate(-1)` restitue
 * l'entrée d'historique de la page de parcours, pas celle de la collection,
 * et cette entrée ne porte rien. Un onglet, une session : c'est la bonne
 * portée de vie.
 */

const KEY = 'movix:tv:focus-restore';

/**
 * Au-delà, un retour n'en est plus un : la page a été quittée pour autre chose,
 * et un enregistrement oublié ne doit pas ressurgir des minutes plus tard.
 */
const MAX_AGE_MS = 5 * 60_000;

export interface FocusRestore {
  /** Chemin de la page à laquelle rendre le focus. */
  path: string;
  scopeId: string;
  index: number;
}

interface StoredFocusRestore extends FocusRestore {
  at: number;
}

export function saveFocusRestore(record: FocusRestore): void {
  try {
    const stored: StoredFocusRestore = { ...record, at: Date.now() };
    sessionStorage.setItem(KEY, JSON.stringify(stored));
  } catch {
    // Stockage indisponible : on perd le retour précis, pas la navigation.
  }
}

function read(): FocusRestore | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const record = JSON.parse(raw) as Partial<StoredFocusRestore>;
    if (
      typeof record.path !== 'string'
      || typeof record.scopeId !== 'string'
      || typeof record.index !== 'number'
      || typeof record.at !== 'number'
      || Date.now() - record.at > MAX_AGE_MS
    ) {
      return null;
    }
    return { path: record.path, scopeId: record.scopeId, index: record.index };
  } catch {
    return null;
  }
}

/** Un retour est-il en attente pour cette page ? Ne consomme rien. */
export function peekFocusRestore(path: string): FocusRestore | null {
  const record = read();
  return record && record.path === path ? record : null;
}

/** Le retour en attente pour cette page, retiré du stockage. */
export function takeFocusRestore(path: string): FocusRestore | null {
  const record = peekFocusRestore(path);
  if (record) {
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      // Voir `saveFocusRestore`.
    }
  }
  return record;
}
