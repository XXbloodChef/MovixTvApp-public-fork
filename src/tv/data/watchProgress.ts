/**
 * Lecture de la progression de lecture. **Lecture seule.**
 *
 * L'écriture reste dans `HLSPlayer` (`saveProgress`, l. 7065) : ce module ne
 * fait que relire ce qu'elle dépose, pour que la fiche puisse proposer
 * « Reprendre » et barrer les épisodes vus.
 *
 * ## Ce que le lecteur écrit vraiment
 *
 *   progress_<movieId>                          film
 *   progress_tv_<tvId>_s<saison>_e<episode>     épisode
 *   → { position: number, timestamp: string, duration: number }
 *
 * Trois propriétés de cette écriture commandent tout ce fichier :
 *
 * 1. Rien n'est sauvegardé avant 30 s de lecture ni après `duration - 30`.
 *    Un épisode vu en entier conserve donc une position aux alentours de 98 %,
 *    jamais 100 %. C'est pour ça qu'on raisonne en ratio et jamais en égalité.
 * 2. Rien n'est jamais effacé, sauf `resetCurrentProgress` déclenché à la main
 *    depuis le panneau de réglages. Une entrée ancienne reste donc valide.
 * 3. L'écriture est conditionnée à `playerSaveProgressPref`. Si l'utilisateur
 *    l'a coupée, il n'y a rien à lire et la fiche doit se comporter comme une
 *    œuvre jamais lancée — d'où les `null` un peu partout plutôt que des zéros.
 *
 * On ne lit délibérément pas `continueWatching` : `HLSPlayer` ne l'écrit plus
 * (« Continue watching functionality removed », l. 7078) et aucun des fichiers
 * du lecteur ne l'alimente. La fiche souris la consulte encore en premier, ce
 * qui peut lui faire proposer un épisode périmé. Les clés `progress_*` sont la
 * seule source à jour.
 */

export interface WatchProgress {
  /** Secondes. */
  position: number;
  /** Secondes. Peut être 0 sur une entrée corrompue — toujours tester. */
  duration: number;
  /** Millisecondes depuis l'époque, pour départager plusieurs épisodes. */
  timestamp: number;
  /** Entre 0 et 1. */
  ratio: number;
}

export interface EpisodeRef {
  season: number;
  episode: number;
}

/**
 * Seuil au-delà duquel un contenu est considéré terminé.
 *
 * On réutilise `playerNextContentThresholdValue` — le réglage qui déclenche
 * déjà l'enchaînement automatique dans le lecteur — plutôt que d'inventer une
 * seconde définition de « terminé » qui divergerait de la première.
 */
const DEFAULT_FINISHED_PERCENT = 95;

export function finishedRatio(): number {
  const raw = safeRead('playerNextContentThresholdValue');
  const value = raw === null ? NaN : Number(raw);
  if (!Number.isFinite(value) || value < 50 || value > 99) {
    return DEFAULT_FINISHED_PERCENT / 100;
  }
  return value / 100;
}

/** `localStorage` peut lever en navigation privée ou en iframe cloisonnée. */
function safeRead(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function parseProgress(raw: string | null): WatchProgress | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    const position = Number(data?.position) || 0;
    const duration = Number(data?.duration) || 0;
    if (position <= 0 || duration <= 0) return null;
    const parsedTime = data?.timestamp ? Date.parse(data.timestamp) : NaN;
    return {
      position,
      duration,
      timestamp: Number.isFinite(parsedTime) ? parsedTime : 0,
      ratio: Math.min(position / duration, 1),
    };
  } catch {
    return null;
  }
}

export function readMovieProgress(movieId: string | number): WatchProgress | null {
  return parseProgress(safeRead(`progress_${movieId}`));
}

export function readEpisodeProgress(
  tvId: string | number,
  season: number,
  episode: number,
): WatchProgress | null {
  return parseProgress(safeRead(`progress_tv_${tvId}_s${season}_e${episode}`));
}

export function isFinished(progress: WatchProgress | null): boolean {
  return progress !== null && progress.ratio >= finishedRatio();
}

/**
 * Épisodes marqués vus **explicitement**, depuis la fiche souris.
 *
 * Clés `S1E1` à l'écriture, relues en minuscules parce que le site les
 * normalise ainsi à la lecture : les deux casses coexistent dans le stockage
 * des utilisateurs installés de longue date.
 */
export function readWatchedEpisodes(tvId: string | number): Set<string> {
  const marked = new Set<string>();
  try {
    const raw = safeRead(`watched_episodes_tv_${tvId}`);
    if (!raw) return marked;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const key of Object.keys(parsed)) {
      if (parsed[key]) marked.add(key.toLowerCase());
    }
  } catch {
    // Entrée corrompue : on préfère aucune marque à un plantage de la fiche.
  }
  return marked;
}

export const episodeKey = (season: number, episode: number) => `s${season}e${episode}`;

/**
 * Dernier épisode touché, toutes saisons confondues.
 *
 * Il n'existe aucun index des clés : on balaie `localStorage` une fois, ce qui
 * est acceptable au montage d'une fiche mais jamais dans un rendu. Le préfixe
 * inclut `_s`, ce qui empêche la série 12 d'attraper les clés de la série 123.
 */
export function readSeriesResume(
  tvId: string | number,
): { season: number; episode: number; progress: WatchProgress } | null {
  const prefix = `progress_tv_${tvId}_s`;
  const pattern = new RegExp(`^progress_tv_${tvId}_s(\\d+)_e(\\d+)$`);
  let best: { season: number; episode: number; progress: WatchProgress } | null = null;

  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(prefix)) continue;
      const match = key.match(pattern);
      if (!match) continue;
      const progress = parseProgress(safeRead(key));
      if (!progress) continue;
      if (!best || progress.timestamp > best.progress.timestamp) {
        best = { season: Number(match[1]), episode: Number(match[2]), progress };
      }
    }
  } catch {
    return null;
  }

  return best;
}

export interface SeasonRef {
  seasonNumber: number;
  episodeCount: number;
}

/**
 * Épisode suivant celui donné, en passant à la saison d'après si besoin.
 *
 * Pure : elle ne lit rien, elle raisonne sur la liste des saisons que la fiche
 * a déjà chargée. `null` quand on est au bout de la série.
 */
export function nextEpisode(
  seasons: SeasonRef[],
  season: number,
  episode: number,
): EpisodeRef | null {
  const index = seasons.findIndex(candidate => candidate.seasonNumber === season);
  if (index === -1) return null;
  if (episode < seasons[index].episodeCount) {
    return { season, episode: episode + 1 };
  }
  const following = seasons[index + 1];
  return following ? { season: following.seasonNumber, episode: 1 } : null;
}

/**
 * Ce que le bouton primaire doit faire, pour une série.
 *
 * - `resume` : un épisode est en cours, on y retourne
 * - `next`   : le dernier épisode touché est terminé, on propose le suivant
 * - `start`  : rien n'a jamais été lancé, ou la série est finie et on repart
 *              du début
 */
export type SeriesAction =
  | { kind: 'resume'; season: number; episode: number; progress: WatchProgress }
  | { kind: 'next'; season: number; episode: number }
  | { kind: 'start'; season: number; episode: number };

export function resolveSeriesAction(
  tvId: string | number,
  seasons: SeasonRef[],
): SeriesAction | null {
  const first = seasons[0];
  if (!first) return null;
  const fallback = { season: first.seasonNumber, episode: 1 } as const;

  const last = readSeriesResume(tvId);
  if (!last) return { kind: 'start', ...fallback };

  if (!isFinished(last.progress)) {
    return {
      kind: 'resume',
      season: last.season,
      episode: last.episode,
      progress: last.progress,
    };
  }

  const following = nextEpisode(seasons, last.season, last.episode);
  // Série terminée : on repart du premier épisode plutôt que de laisser la
  // fiche sans action, ce qui est aussi ce que fait Disney+.
  return following ? { kind: 'next', ...following } : { kind: 'start', ...fallback };
}

export type MovieAction =
  | { kind: 'resume'; progress: WatchProgress }
  | { kind: 'replay' }
  | { kind: 'start' };

export function resolveMovieAction(movieId: string | number): MovieAction {
  const progress = readMovieProgress(movieId);
  if (!progress) return { kind: 'start' };
  return isFinished(progress) ? { kind: 'replay' } : { kind: 'resume', progress };
}

/** « Il reste 23 min ». Arrondi à la minute supérieure, jamais « 0 min ». */
export function formatRemaining(progress: WatchProgress): string {
  const seconds = Math.max(progress.duration - progress.position, 60);
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `Il reste ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `Il reste ${hours} h` : `Il reste ${hours} h ${rest} min`;
}
