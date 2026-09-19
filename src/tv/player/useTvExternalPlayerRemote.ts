import { useEffect } from 'react';
import { setNativeBackInterception } from '../../utils/tv/isTvDevice';
import { closeOpenTvDialog, navigateOpenTvDialog } from './useTvPlayerRemote';

interface UseTvExternalPlayerRemoteOptions {
  enabled: boolean;
  onOpenSources: () => void;
  onOpenEpisodes?: () => void;
  onExit: () => void;
}

const NATIVE_PLAYER_SOURCES = new Set([
  'darkino',
  'mp4',
  'nexus_hls',
  'nexus_file',
  'm3u8',
  'swiftflux',
  'bravo',
  'kisskh',
]);

/** Vrai quand la source affichée est un lecteur tiers dans une iframe. */
export function isExternalPlayerSource(
  selectedSource: string | number | null | undefined,
  embedUrl: string | null | undefined,
): boolean {
  if (selectedSource == null) return false;
  return !NATIVE_PLAYER_SOURCES.has(String(selectedSource)) && Boolean(embedUrl || selectedSource);
}

/**
 * Garde la télécommande dans l'interface Movix lorsqu'un lecteur tiers est
 * rendu dans une iframe cross-origin. Le shell renvoie les flèches dans la
 * frame principale ; ce hook les transforme en accès aux fenêtres TV.
 *
 * OK n'est volontairement pas intercepté : certains embeds exigent un clic
 * central pour démarrer. Les contrôles internes (sous-titres propriétaires,
 * volume) restent inaccessibles par définition cross-origin ; le panneau
 * Sources permet de choisir une source extraite dans notre lecteur complet.
 */
export function useTvExternalPlayerRemote({
  enabled,
  onOpenSources,
  onOpenEpisodes,
  onExit,
}: UseTvExternalPlayerRemoteOptions): void {
  useEffect(() => {
    if (!enabled) return;

    setNativeBackInterception(true);

    const handleKey = (event: KeyboardEvent) => {
      if (navigateOpenTvDialog(event)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }

      if (!event.key.startsWith('Arrow')) return;
      event.preventDefault();
      event.stopImmediatePropagation();

      if (event.key === 'ArrowUp' && onOpenEpisodes) {
        onOpenEpisodes();
      } else {
        // Bas ouvre naturellement les réglages. Gauche/Droite sont aussi
        // capturées : elles ne doivent jamais modifier le volume du tiers.
        onOpenSources();
      }
    };

    const handleRemote = (event: Event) => {
      const action = (event as CustomEvent<{ action?: string }>).detail?.action;
      if (action === 'captions' || action === 'guide' || action === 'info') {
        onOpenSources();
      }
    };

    const handleBack = () => {
      if (!closeOpenTvDialog()) onExit();
    };

    window.addEventListener('keydown', handleKey);
    window.addEventListener('movix-tv-remote', handleRemote);
    window.addEventListener('movix-tv-back', handleBack);
    return () => {
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('movix-tv-remote', handleRemote);
      window.removeEventListener('movix-tv-back', handleBack);
      setNativeBackInterception(false);
    };
  }, [enabled, onExit, onOpenEpisodes, onOpenSources]);
}
