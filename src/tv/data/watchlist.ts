/**
 * « Ma liste », partagée avec la fiche souris.
 *
 * La forme de l'entrée n'est pas négociable : `pages/TVDetails.tsx` (l. 3160)
 * écrit `{ id, type, title, poster_path, addedAt }` dans `watchlist_tv`, et la
 * page qui affiche la liste lit `poster_path` — le chemin TMDB brut, pas une
 * URL. Une entrée écrite depuis le téléviseur avec un champ en moins donnerait
 * une vignette vide sur le site.
 *
 * Les films utilisent `watchlist_movie` par symétrie ; si ta clé côté site
 * diffère, c'est la seule ligne à changer.
 */

export interface WatchlistEntry {
  id: number;
  type: 'movie' | 'tv';
  title: string;
  /** Chemin TMDB brut, ex. `/abc123.jpg`. Peut être `null`. */
  posterPath: string | null;
}

const storageKey = (type: 'movie' | 'tv') =>
  type === 'tv' ? 'watchlist_tv' : 'watchlist_movie';

/** Forme inconnue : le stockage vient du site, et d'anciennes versions. */
type StoredEntry = Record<string, unknown>;

function readList(type: 'movie' | 'tv'): StoredEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(type)) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function isInWatchlist(id: number, type: 'movie' | 'tv'): boolean {
  return readList(type).some(item => Number(item?.id) === id);
}

/** @returns le nouvel état d'appartenance, pour piloter l'icône sans relire. */
export function toggleWatchlist(entry: WatchlistEntry): boolean {
  const list = readList(entry.type);
  const present = list.some(item => Number(item?.id) === entry.id);
  const next = present
    ? list.filter(item => Number(item?.id) !== entry.id)
    : [
        ...list,
        {
          id: entry.id,
          type: entry.type,
          title: entry.title,
          poster_path: entry.posterPath,
          addedAt: new Date().toISOString(),
        },
      ];

  try {
    localStorage.setItem(storageKey(entry.type), JSON.stringify(next));
  } catch {
    // Quota plein ou stockage refusé : l'état affiché ne changera pas, ce qui
    // est préférable à une icône qui ment.
    return present;
  }
  return !present;
}
