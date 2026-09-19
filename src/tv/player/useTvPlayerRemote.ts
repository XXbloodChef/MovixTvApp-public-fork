import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Pilotage télécommande du lecteur.
 *
 * Regroupe trois entrées distinctes : les flèches, Entrée et les touches
 * média que Chromium convertit en `keydown`, les mêmes touches média relayées
 * par le shell natif via `movix-tv-remote`, et le Retour négocié par `TvLayout`.
 *
 * Les touches média arrivent bien en `keydown` sur l'Edenwood (WebView 152,
 * mesuré le 15/09/2026 : `MediaPlayPause`, `MediaPlay`, `MediaRewind`,
 * `MediaFastForward`), contrairement à ce que supposait le relais natif — que
 * `MainActivity` n'a d'ailleurs jamais branché. Les deux chemins mènent à la
 * même action ; le jour où le relais natif sera câblé, il devra avaler la
 * touche côté système pour qu'elle n'arrive pas deux fois.
 */

/** Touches média telles que Chromium les nomme, vers les actions du relais natif. */
const MEDIA_KEY_ACTIONS: Record<string, string> = {
  MediaPlayPause: 'playpause',
  MediaPlay: 'play',
  MediaPause: 'pause',
  MediaStop: 'stop',
  MediaRewind: 'rewind',
  MediaFastForward: 'fastforward',
};
export interface UseTvPlayerRemoteOptions {
  enabled: boolean;
  actionCount: number;
  onTogglePlay: () => void;
  onSeek: (seconds: number) => void;
  onActivate: (index: number) => void;
  onExit: () => void;
}

/**
 * Fenêtres qui prennent la main sur les touches quand elles sont ouvertes.
 *
 * `[data-source-menu]` est le menu « Changer de source », rendu par une **autre
 * instance** de HLSPlayer. `[data-player-settings]` est le panneau de réglages
 * (Qualité, Sous-titres, Audio…), rendu par l'instance principale. Sans ça, les
 * flèches partaient piloter la barre de lecture par-dessus la fenêtre ouverte.
 */
const TV_DIALOGS = [
  { root: '[data-tv-episode-menu]', close: '[data-tv-episode-menu-close]' },
  { root: '[data-source-menu]', close: '[data-source-menu-close]' },
  { root: '[data-player-settings]', close: '[data-player-settings-close]' },
] as const;

const TV_DIALOG_FOCUSABLE =
  'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

function visibleFocusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(TV_DIALOG_FOCUSABLE)).filter(
    element => element.offsetParent !== null,
  );
}

/**
 * Fenêtre réellement ouverte : montée, contenant du focusable, et **la plus
 * englobante**.
 *
 * Ce dernier point est essentiel : le contenu de l'onglet Qualité porte lui aussi
 * `data-source-menu`. Prendre la première correspondance enfermait le focus dans
 * la liste des qualités, rendait les onglets d'en-tête inatteignables, et
 * cherchait un bouton de fermeture qui n'existe pas dans ce contexte.
 */
function openDialog(): { root: HTMLElement; close: string } | null {
  const matches: Array<{ root: HTMLElement; close: string }> = [];
  for (const dialog of TV_DIALOGS) {
    const root = document.querySelector<HTMLElement>(dialog.root);
    if (root && visibleFocusables(root).length > 0) {
      matches.push({ root, close: dialog.close });
    }
  }

  if (matches.length === 0) return null;
  return (
    matches.find(
      candidate => !matches.some(other => other !== candidate && other.root.contains(candidate.root)),
    ) ?? matches[0]
  );
}

/** Navigation partagée avec le lecteur iframe, qui n'a pas d'instance HLS. */
export function navigateOpenTvDialog(event: KeyboardEvent): boolean {
  const dialog = openDialog();
  return dialog ? navigateDialog(event, dialog.root) : false;
}

/** Ferme la fenêtre TV la plus haute sans laisser Retour quitter la lecture. */
export function closeOpenTvDialog(): boolean {
  const dialog = openDialog();
  if (!dialog) return false;
  const closer =
    document.querySelector<HTMLElement>(dialog.close) ??
    TV_DIALOG_CLOSERS.map(selector => document.querySelector<HTMLElement>(selector))
      .find((element): element is HTMLElement => element !== null) ??
    // Les écrans Watch historiques rendent le bouton × autour du composant
    // HLSPlayer `onlyQualityMenu`, donc hors de `[data-source-menu]`.
    // Remonter au panneau fixe permet de le fermer sans dupliquer un marqueur
    // dans chacune des nombreuses branches de rendu.
    Array.from(
      dialog.root.closest<HTMLElement>('.fixed')?.querySelectorAll<HTMLElement>('button') ?? [],
    ).find(element => element.textContent?.trim() === '×') ??
    null;
  if (!closer) return false;
  closer.click();
  return true;
}

/** Tous les boutons de fermeture connus, pour le repli du Retour. */
const TV_DIALOG_CLOSERS = TV_DIALOGS.map(dialog => dialog.close);

// Le désalignement transverse pèse le double : on préfère toujours le voisin de
// la même ligne ou colonne, même plus éloigné, plutôt qu'un saut en diagonale
// qui paraîtrait aléatoire.
const CROSS_AXIS_WEIGHT = 2;
const AXIS_TOLERANCE = 2;

function bestInDirection(
  items: HTMLElement[],
  current: HTMLElement | null,
  key: string,
): HTMLElement | null {
  if (!current) return items[0] ?? null;
  const origin = current.getBoundingClientRect();
  const from = { x: origin.left + origin.width / 2, y: origin.top + origin.height / 2 };

  let best: HTMLElement | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const item of items) {
    if (item === current) continue;
    const rect = item.getBoundingClientRect();
    const dx = rect.left + rect.width / 2 - from.x;
    const dy = rect.top + rect.height / 2 - from.y;

    const along =
      key === 'ArrowUp' ? -dy : key === 'ArrowDown' ? dy : key === 'ArrowLeft' ? -dx : dx;
    if (along <= AXIS_TOLERANCE) continue;

    const across = key === 'ArrowUp' || key === 'ArrowDown' ? Math.abs(dx) : Math.abs(dy);
    const score = along + across * CROSS_AXIS_WEIGHT;
    if (score < bestScore) {
      bestScore = score;
      best = item;
    }
  }
  return best;
}

/**
 * Navigation géométrique et non par ordre du DOM : le panneau de réglages mêle
 * une rangée d'onglets horizontale et une liste verticale. Suivre l'ordre du
 * DOM y ferait passer « bas » d'un onglet au suivant au lieu d'entrer dans la
 * liste.
 *
 * @returns true si la touche a été traitée par la fenêtre.
 */
function navigateDialog(event: KeyboardEvent, root: HTMLElement): boolean {
  const items = visibleFocusables(root);
  if (items.length === 0) return false;

  const active = document.activeElement;
  const current = active instanceof HTMLElement && root.contains(active) ? active : null;

  if (event.key === 'Enter' || event.key === ' ') {
    if (current) current.click();
    else items[0].focus();
    return true;
  }

  if (!event.key.startsWith('Arrow')) return false;

  const target = bestInDirection(items, current, event.key);


  if (!target) return true; // bord atteint : on absorbe pour ne pas fuir vers le lecteur
  target.focus();
  target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  return true;
}

const IDLE_MS = 4000;

export function useTvPlayerRemote({
  enabled,
  actionCount,
  onTogglePlay,
  onSeek,
  onActivate,
  onExit,
}: UseTvPlayerRemoteOptions) {
  const [visible, setVisible] = useState(false);
  /**
   * `null` = aucune action sélectionnée.
   *
   * C'est cet état qui permet à OK de lancer ou mettre en pause pendant que la
   * barre est ouverte : sans lui, OK activait toujours un bouton et il fallait
   * refermer la barre pour reprendre la lecture.
   */
  const [focusedAction, setFocusedAction] = useState<number | null>(null);
  const timerRef = useRef<number | null>(null);

  const armTimer = useCallback(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setVisible(false), IDLE_MS);
  }, []);

  /** Ouvre la barre, sans rien sélectionner, et repousse sa fermeture. */
  const showBar = useCallback(() => {
    setVisible(true);
    setFocusedAction(null);
    armTimer();
  }, [armTimer]);

  const hideBar = useCallback(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    setVisible(false);
  }, []);

  /**
   * Repousse la fermeture sans jamais ouvrir. C'est la distinction qui manquait :
   * un simple saut de 10 s ouvrait la barre, et le saut suivant devenait un
   * déplacement de focus.
   */
  const touch = useCallback(() => {
    setVisible(current => {
      if (current) armTimer();
      return current;
    });
  }, [armTimer]);

  useEffect(() => {
    if (!enabled) return;
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    /** Une action de touche média, d'où qu'elle vienne. Vrai si elle est connue. */
    const runRemoteAction = (action: string | undefined): boolean => {
      switch (action) {
        case 'playpause':
        case 'play':
        case 'pause':
          onTogglePlay();
          break;
        case 'fastforward':
          onSeek(30);
          break;
        case 'rewind':
          onSeek(-30);
          break;
        case 'stop':
          onExit();
          return true;
        default:
          return false;
      }
      showBar();
      return true;
    };

    const handleKey = (event: KeyboardEvent) => {
      // Avant les fenêtres : lecture/pause et les sauts doivent répondre même
      // panneau ouvert — ce sont des touches dédiées, pas des flèches.
      if (runRemoteAction(MEDIA_KEY_ACTIONS[event.key])) {
        event.preventDefault();
        return;
      }

      const dialog = openDialog();
      if (dialog) {
        if (navigateDialog(event, dialog.root)) event.preventDefault();
        return;
      }

      switch (event.key) {
        case 'ArrowDown':
          // Seule la flèche du bas ouvre la barre.
          event.preventDefault();
          showBar();
          return;
        case 'ArrowUp':
          // Et le haut la referme, symétriquement.
          event.preventDefault();
          hideBar();
          return;
        case 'ArrowLeft':
        case 'ArrowRight': {
          // Barre visible, les flèches déplacent le focus entre les actions ;
          // barre masquée, elles reculent et avancent dans le flux. C'est ce
          // que fait toute interface TV, et ça évite un mode explicite.
          event.preventDefault();
          if (visible && actionCount > 0) {
            const step = event.key === 'ArrowRight' ? 1 : -1;
            // Anneau : null → 0 → 1 → … → dernier → null. « Rien de
            // sélectionné » est ainsi toujours à une pression, dans les deux
            // sens, et aucune flèche ne reste sans effet.
            setFocusedAction(current => {
              if (current === null) return step > 0 ? 0 : actionCount - 1;
              const next = current + step;
              if (next < 0 || next >= actionCount) return null;
              return next;
            });
            // La barre est déjà ouverte : on ne fait que repousser sa fermeture.
            touch();
          } else {
            // Barre fermée : on avance dans le flux SANS l'ouvrir, sinon le
            // saut suivant se transformerait en déplacement de focus.
            onSeek(event.key === 'ArrowRight' ? 10 : -10);
          }
          return;
        }
        case 'Enter':
          event.preventDefault();
          if (visible && focusedAction !== null) {
            onActivate(focusedAction);
            touch();
          } else {
            // Barre fermée, ou ouverte sans sélection : OK pilote la lecture.
            onTogglePlay();
            touch();
          }
          return;
        case ' ':
          event.preventDefault();
          onTogglePlay();
          return;
        default:
      }
    };

    const handleRemote = (event: Event) => {
      runRemoteAction((event as CustomEvent<{ action?: string }>).detail?.action);
    };

    const handleBack = () => {
      // Ordre de fermeture, du plus imbriqué au moins : menu de sources, puis
      // surcouche, puis sortie. Sortir du lecteur alors qu'un menu est ouvert
      // serait brutal.
      const dialog = openDialog();
      if (dialog) {
        // On clique le bouton de fermeture de CETTE fenêtre plutôt que d'envoyer
        // un Échap : rien ne l'écoute, et le Retour repartait alors au shell qui
        // reculait dans l'historique — ce qui faisait quitter la lecture.
        const closer =
          document.querySelector<HTMLElement>(dialog.close) ??
          // Repli : le bouton attendu peut ne pas être monté dans ce contexte.
          // On ne sort JAMAIS de la lecture tant qu'une fenêtre est ouverte —
          // c'est ce qui faisait quitter le film au lieu de fermer le panneau.
          TV_DIALOG_CLOSERS.map(selector =>
            document.querySelector<HTMLElement>(selector),
          ).find((element): element is HTMLElement => element !== null) ??
          null;
        closer?.click();
        return;
      }
      if (visible) setVisible(false);
      else onExit();
    };

    window.addEventListener('keydown', handleKey);
    window.addEventListener('movix-tv-remote', handleRemote);
    window.addEventListener('movix-tv-back', handleBack);
    return () => {
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('movix-tv-remote', handleRemote);
      window.removeEventListener('movix-tv-back', handleBack);
    };
  }, [
    enabled,
    visible,
    actionCount,
    focusedAction,
    showBar,
    touch,
    hideBar,
    onActivate,
    onExit,
    onSeek,
    onTogglePlay,
  ]);

  return { visible, focusedAction, showBar };
}
