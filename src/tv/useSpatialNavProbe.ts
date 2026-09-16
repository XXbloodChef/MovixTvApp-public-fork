import { useEffect } from 'react';

/**
 * Navigation spatiale minimale, pour la page de diagnostic uniquement.
 *
 * Ce n'est PAS le moteur de navigation définitif — il sert à valider trois
 * choses sur le vrai matériel avant d'investir dans l'interface TV :
 *  - les flèches de la télécommande arrivent bien en `keydown` dans la WebView,
 *  - déplacer le focus DOM + scrollIntoView donne un rendu fluide,
 *  - la latence d'appui est acceptable.
 *
 * Le moteur réel (rangées virtualisées, scopes, mémoire de colonne) viendra
 * ensuite ; on garde ici le strict nécessaire pour mesurer.
 */

type Direction = 'up' | 'down' | 'left' | 'right';

const DIRECTION_BY_KEY: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

// Tolérance en px : un candidat parfaitement aligné a un delta nul sur l'axe
// principal. Sans marge, deux éléments de même ligne aux arrondis subpixel près
// s'excluraient mutuellement.
const AXIS_TOLERANCE = 2;

// Un candidat n'est « atteignable » que s'il est déjà confortablement à l'écran.
// Sinon on défile d'abord : sauter directement sur un élément hors champ rend
// tout ce qui le précède invisible.
const VISIBLE_MARGIN = 80;

const PAGE_SCROLL_RATIO = 0.8;

function isComfortablyVisible(rect: DOMRect, direction: Direction): boolean {
  if (direction === 'down') return rect.top < window.innerHeight - VISIBLE_MARGIN;
  if (direction === 'up') return rect.bottom > VISIBLE_MARGIN;
  return true;
}

function canScrollPage(direction: 'up' | 'down'): boolean {
  const root = document.documentElement;
  return direction === 'down'
    ? window.scrollY + window.innerHeight < root.scrollHeight - 2
    : window.scrollY > 2;
}

function scrollPage(direction: 'up' | 'down'): void {
  window.scrollBy({
    top: (direction === 'down' ? 1 : -1) * window.innerHeight * PAGE_SCROLL_RATIO,
    behavior: 'smooth',
  });
}

function collectCandidates(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>('[data-tv-focusable]'),
  ).filter(element => element.offsetParent !== null);
}

function centerOf(rect: DOMRect): { x: number; y: number } {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function scoreCandidate(
  origin: DOMRect,
  candidate: DOMRect,
  direction: Direction,
): number | null {
  const from = centerOf(origin);
  const to = centerOf(candidate);
  const dx = to.x - from.x;
  const dy = to.y - from.y;

  const alongAxis =
    direction === 'up' ? -dy
    : direction === 'down' ? dy
    : direction === 'left' ? -dx
    : dx;

  if (alongAxis <= AXIS_TOLERANCE) return null;

  const acrossAxis = direction === 'up' || direction === 'down' ? Math.abs(dx) : Math.abs(dy);

  // Le désalignement transverse pèse le double : on préfère toujours le voisin
  // de la même ligne/colonne, même s'il est plus loin, plutôt qu'un élément en
  // diagonale qui paraîtrait sauter au hasard.
  return alongAxis + acrossAxis * 2;
}

export function useSpatialNavProbe(
  onKeyEvent?: (event: KeyboardEvent) => void,
): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      onKeyEvent?.(event);

      const direction = DIRECTION_BY_KEY[event.key];
      if (!direction) return;

      // On laisse la main aux champs de saisie : les flèches y déplacent le
      // caret, ce que la télécommande doit pouvoir faire aussi.
      const active = document.activeElement;
      if (
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const candidates = collectCandidates();
      if (candidates.length === 0) return;

      const current = active instanceof HTMLElement && active.dataset.tvFocusable !== undefined
        ? active
        : null;

      if (!current) {
        event.preventDefault();
        candidates[0].focus();
        return;
      }

      const originRect = current.getBoundingClientRect();
      let best: HTMLElement | null = null;
      let bestScore = Number.POSITIVE_INFINITY;

      for (const candidate of candidates) {
        if (candidate === current) continue;
        const score = scoreCandidate(
          originRect,
          candidate.getBoundingClientRect(),
          direction,
        );
        if (score !== null && score < bestScore) {
          bestScore = score;
          best = candidate;
        }
      }

      // Défilement de page avant saut de focus.
      //
      // Les panneaux composés uniquement de données ne contiennent aucun élément
      // focusable : sans ce défilement, le focus les enjambe et ils deviennent
      // littéralement impossibles à lire à la télécommande. Tant que la cible
      // n'est pas déjà à l'écran, on fait défiler ; on ne déplace le focus que
      // lorsqu'elle est visible.
      if (direction === 'up' || direction === 'down') {
        const targetVisible =
          best !== null && isComfortablyVisible(best.getBoundingClientRect(), direction);
        if (!targetVisible && canScrollPage(direction)) {
          event.preventDefault();
          scrollPage(direction);
          return;
        }
      }

      if (!best) return;
      event.preventDefault();
      best.focus();
      // 'center' et non 'nearest' : à 3 mètres, un élément collé au bord de
      // l'écran passe inaperçu.
      best.scrollIntoView({ block: 'center', inline: 'nearest' });
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onKeyEvent]);
}
