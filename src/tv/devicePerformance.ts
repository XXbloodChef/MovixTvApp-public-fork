/**
 * Palier de performance du téléviseur, mesuré plutôt que deviné.
 *
 * Le « mode léger » du site coupe les animations sur les appareils faibles,
 * mais il les devine à partir de signaux déclaratifs : nombre de cœurs,
 * mémoire annoncée, agent utilisateur. Un téléviseur qui annonce quatre cœurs
 * et 3 Go peut très bien tomber à quinze images par seconde dès qu'une
 * bannière se décode. Ici on mesure : quelques secondes de
 * `requestAnimationFrame` sur l'accueil, une fois par période, et on range
 * l'appareil dans un palier que le mode léger lit ensuite.
 *
 * Deux paliers seulement. « slow » active le mode léger automatique ;
 * « reference » ne change rien. Un palier « rapide » ne servirait à rien : un
 * téléviseur plus puissant que la référence n'a besoin d'aucune adaptation
 * pour bien fonctionner.
 *
 * On retient la **pire seconde** des premières secondes de l'accueil, pas la
 * moyenne au repos : au repos, même un SoC lent tient 60 images par seconde
 * puisque rien ne bouge. C'est pendant que les affiches se décodent et que la
 * bannière s'installe que l'appareil montre ce qu'il vaut. Mesuré sur le
 * téléviseur de référence le 15/09/2026 : 60 au repos, 57 pour la pire seconde
 * de cette fenêtre, 13 pendant le tout premier décodage, 3 sous une rafale de
 * touches. Le seuil à 30 ne vise donc que des appareils nettement plus
 * faibles que la référence ; celle-ci ressort « reference ».
 *
 * Le palier est lu au **lancement suivant** : le mode léger se décide au
 * montage, avant la mesure, et changer d'animations en cours de session
 * surprendrait plus qu'il n'aiderait. Sur le téléviseur de référence
 * (Edenwood, 1 Go annoncé) le mode léger est déjà actif par la mémoire : le
 * palier « slow » ne change rien pour lui.
 */

export type PerfTier = 'reference' | 'slow';

export interface PerfRecord {
  /** Pire seconde observée pendant la fenêtre de mesure. */
  fps: number;
  tier: PerfTier;
  /** Horodatage de la mesure, en millisecondes. */
  at: number;
}

export const PERF_RECORD_KEY = 'movix:tv:perf';
/** Lu de façon synchrone par le mode léger, sans analyse JSON. */
export const PERF_TIER_KEY = 'movix:tv:perf-tier';

/** En dessous, une interface animée n'est plus fluide : palier « slow ». */
export const SLOW_FPS_THRESHOLD = 30;
/** Une mesure vaut une semaine : le matériel ne change pas, la charge un peu. */
const RECORD_MAX_AGE_MS = 7 * 24 * 60 * 60_000;
/** Le premier rendu tombe dans la fenêtre : c'est lui qui est représentatif. */
const SETTLE_MS = 500;
const SAMPLE_MS = 6_000;
/** Granularité de la pire seconde. */
const WINDOW_MS = 1_000;

let measuring = false;

export function readPerfRecord(): PerfRecord | null {
  try {
    const raw = localStorage.getItem(PERF_RECORD_KEY);
    if (!raw) return null;
    const record = JSON.parse(raw) as Partial<PerfRecord>;
    if (typeof record.fps !== 'number' || typeof record.at !== 'number') return null;
    if (record.tier !== 'reference' && record.tier !== 'slow') return null;
    return { fps: record.fps, tier: record.tier, at: record.at };
  } catch {
    return null;
  }
}

export const tierForFps = (fps: number): PerfTier =>
  fps < SLOW_FPS_THRESHOLD ? 'slow' : 'reference';

function store(record: PerfRecord): void {
  try {
    localStorage.setItem(PERF_RECORD_KEY, JSON.stringify(record));
    localStorage.setItem(PERF_TIER_KEY, record.tier);
  } catch {
    // Stockage indisponible : on mesurera de nouveau la prochaine fois.
  }
}

/**
 * Lance la mesure si aucune n'est assez récente. Sans effet visible dans la
 * session courante. Renvoie une fonction d'annulation, pour le démontage.
 */
export function ensurePerfMeasurement(now: number = Date.now()): () => void {
  const existing = readPerfRecord();
  if (measuring || (existing && now - existing.at < RECORD_MAX_AGE_MS)) return () => {};
  if (typeof requestAnimationFrame !== 'function') return () => {};
  measuring = true;

  let cancelled = false;
  let frame = 0;
  const timer = window.setTimeout(() => {
    const start = performance.now();
    let windowStart = start;
    let frames = 0;
    let worst: number | null = null;
    const tick = (time: number) => {
      if (cancelled) return;
      frames += 1;
      if (time - windowStart >= WINDOW_MS) {
        const fps = Math.round((frames * 1000) / (time - windowStart));
        worst = worst === null ? fps : Math.min(worst, fps);
        frames = 0;
        windowStart = time;
      }
      if (time - start < SAMPLE_MS || worst === null) {
        frame = requestAnimationFrame(tick);
        return;
      }
      store({ fps: worst, tier: tierForFps(worst), at: Date.now() });
      measuring = false;
    };
    frame = requestAnimationFrame(tick);
  }, SETTLE_MS);

  return () => {
    cancelled = true;
    measuring = false;
    window.clearTimeout(timer);
    cancelAnimationFrame(frame);
  };
}
