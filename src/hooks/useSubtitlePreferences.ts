import { useCallback, useEffect, useRef, useState } from 'react';
import {
  loadSubtitlePreferences,
  normalizeSubtitlePreferences,
  resetSubtitleAppearance,
  saveSubtitlePreferences,
  SUBTITLE_STYLE_CHANGED_EVENT,
  SUBTITLE_STYLE_PREVIEW_EVENT,
  SUBTITLE_STYLE_STORAGE_KEY,
  type SubtitlePreferencePatch,
  type SubtitlePreferences,
} from '@/utils/subtitlePreferences';
import { ensureSubtitleFontLoaded } from '@/utils/subtitleFontLoader';

export interface UseSubtitlePreferencesResult {
  preferences: SubtitlePreferences;
  /** Applique et persiste immédiatement. */
  patchPreferences: (patch: SubtitlePreferencePatch) => void;
  /**
   * Montre le résultat sans le persister. Les aperçus successifs s'empilent
   * (deux sliders bougés à la suite) jusqu'à `commitPreferences` ou
   * `cancelPreview`.
   */
  previewPreferences: (patch: SubtitlePreferencePatch) => void;
  /** Persiste ce qui est en aperçu. Sans aperçu en cours, ne fait rien. */
  commitPreferences: () => void;
  /** Abandonne l'aperçu : l'affichage revient à l'état persisté. */
  cancelPreview: () => void;
  setPreferences: (updater: SubtitlePreferences | ((current: SubtitlePreferences) => SubtitlePreferences)) => void;
  resetAppearance: () => void;
}

const dispatchPreview = (preferences: SubtitlePreferences) => {
  window.dispatchEvent(new CustomEvent(SUBTITLE_STYLE_PREVIEW_EVENT, { detail: preferences }));
};

export function useSubtitlePreferences(): UseSubtitlePreferencesResult {
  const [preferences, setState] = useState<SubtitlePreferences>(() => loadSubtitlePreferences());
  /** État persisté. Ne contient jamais un aperçu. */
  const preferencesRef = useRef(preferences);
  /**
   * Aperçu en cours, sous forme de patch et non d'état complet : un
   * `patchPreferences` qui arrive pendant l'aperçu (choisir une couleur alors
   * qu'un slider vient de bouger) ne doit ni le persister, ni le perdre, ni
   * être écrasé par lui au commit.
   */
  const previewPatchRef = useRef<SubtitlePreferencePatch | null>(null);

  useEffect(() => {
    const refresh = (event?: Event) => {
      if (event instanceof StorageEvent && event.key !== SUBTITLE_STYLE_STORAGE_KEY) return;
      if (event instanceof CustomEvent && event.detail) {
        const next = normalizeSubtitlePreferences(event.detail);
        preferencesRef.current = next;
        setState(next);
        return;
      }
      const next = loadSubtitlePreferences();
      preferencesRef.current = next;
      setState(next);
    };
    window.addEventListener(SUBTITLE_STYLE_CHANGED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(SUBTITLE_STYLE_CHANGED_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  useEffect(() => {
    ensureSubtitleFontLoaded(preferences.fontFamily);
  }, [preferences.fontFamily]);

  const setPreferences = useCallback<UseSubtitlePreferencesResult['setPreferences']>((updater) => {
    const current = preferencesRef.current;
    const requested = typeof updater === 'function' ? updater(current) : updater;
    const next = normalizeSubtitlePreferences(requested);
    preferencesRef.current = next;
    setState(next);
    // Émet `SUBTITLE_STYLE_CHANGED_EVENT` : le lecteur clôt l'aperçu et
    // repart de l'état persisté…
    saveSubtitlePreferences(next);
    // …puis on repose l'aperçu encore en attente par-dessus, pour que
    // l'écran continue de montrer ce que l'utilisateur est en train de régler.
    if (previewPatchRef.current) {
      dispatchPreview(normalizeSubtitlePreferences({ ...next, ...previewPatchRef.current }));
    }
  }, []);

  const patchPreferences = useCallback((patch: SubtitlePreferencePatch) => {
    setPreferences((current) => ({ ...current, ...patch }));
  }, [setPreferences]);

  const previewPreferences = useCallback((patch: SubtitlePreferencePatch) => {
    previewPatchRef.current = { ...previewPatchRef.current, ...patch };
    dispatchPreview(normalizeSubtitlePreferences({ ...preferencesRef.current, ...previewPatchRef.current }));
  }, []);

  const commitPreferences = useCallback(() => {
    const patch = previewPatchRef.current;
    if (!patch) return;
    previewPatchRef.current = null;
    setPreferences((current) => ({ ...current, ...patch }));
  }, [setPreferences]);

  const cancelPreview = useCallback(() => {
    if (!previewPatchRef.current) return;
    previewPatchRef.current = null;
    // L'aperçu pose des styles en ligne sur le bloc de sous-titres ; seul un
    // nouvel aperçu, diffé contre le précédent, les remet à la valeur
    // persistée. Sauvegarder ensuite (valeur inchangée) émet l'événement de
    // clôture qui rend ses transitions au bloc.
    dispatchPreview(preferencesRef.current);
    saveSubtitlePreferences(preferencesRef.current);
  }, []);

  const resetAppearance = useCallback(() => {
    previewPatchRef.current = null;
    setPreferences(() => resetSubtitleAppearance());
  }, [setPreferences]);

  return {
    preferences,
    patchPreferences,
    previewPreferences,
    commitPreferences,
    cancelPreview,
    setPreferences,
    resetAppearance,
  };
}
