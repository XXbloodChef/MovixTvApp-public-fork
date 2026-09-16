import { useEffect, useState } from 'react';
import { hasTmdbKey, loadTvRows, type TvRowData } from './tmdb';

export type TvRowsStatus = 'loading' | 'ready' | 'no-key' | 'error';

export interface TvRowsState {
  status: TvRowsStatus;
  rows: TvRowData[];
}

/**
 * Rangées d'une page, publiées au fil de leur arrivée.
 *
 * `ids` doit être une **constante de module** — `TV_HOME_ROWS`,
 * `TV_MOVIE_ROWS` — et non un tableau construit dans le rendu : c'est la
 * dépendance de l'effet, et une identité neuve à chaque rendu relancerait le
 * chargement en boucle.
 */
export function useTvRows(ids: readonly string[]): TvRowsState {
  const [state, setState] = useState<TvRowsState>(() => ({
    // L'absence de clé est un cas distinct de l'erreur réseau : il se corrige
    // dans le .env, pas en réessayant, et mérite donc son propre message.
    status: hasTmdbKey() ? 'loading' : 'no-key',
    rows: [],
  }));

  useEffect(() => {
    if (!hasTmdbKey()) return;

    const controller = new AbortController();
    let cancelled = false;

    const rank = (id: string): number => {
      const index = ids.indexOf(id);
      return index === -1 ? Number.MAX_SAFE_INTEGER : index;
    };

    loadTvRows(ids, {
      signal: controller.signal,
      // Chaque rangée est publiée dès son arrivée. L'insertion est triée sur
      // l'ordre déclaré et non sur l'ordre de retour : une rangée lente ne doit
      // pas se retrouver au mauvais endroit sous prétexte qu'elle a mis deux
      // secondes de plus.
      onRow: row => {
        if (cancelled) return;
        setState(previous => {
          const rows = [...previous.rows.filter(r => r.id !== row.id), row].sort(
            (a, b) => rank(a.id) - rank(b.id),
          );
          return { status: 'ready', rows };
        });
      },
    })
      .then(() => {
        if (cancelled) return;
        // Rien n'est remonté : réseau coupé, ou clé refusée par TMDB.
        setState(previous =>
          previous.rows.length === 0 ? { status: 'error', rows: [] } : previous,
        );
      })
      .catch(() => {
        if (!cancelled) {
          setState(previous =>
            previous.rows.length === 0 ? { status: 'error', rows: [] } : previous,
          );
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [ids]);

  return state;
}
