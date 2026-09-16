import { useCallback, useMemo, useRef, useState } from 'react';

/**
 * Navigation du panneau de réglages — piste B.
 *
 * Remplace `settingsTab: 'quality' | 'subtitles' | …` par un chemin.
 * La profondeur donne l'écran, le premier segment donne la section :
 *
 *   []                        → niveau 1, la liste des sections
 *   ['source']                → niveau 2, la section Source
 *   ['source', 'fstream']     → niveau 3, les hébergeurs de Fstream
 *
 * `pop()` au niveau 1 ne fait rien : c'est l'appelant qui décide de fermer le
 * panneau (cf. `onClose` dans PlayerSettingsNav).
 */

export type SettingsPath = readonly string[];

export const ROOT_PATH: SettingsPath = [];

/** Clé stable d'un niveau, utilisée pour AnimatePresence et la mémoire de focus. */
export const pathKey = (path: SettingsPath): string => (path.length ? path.join('/') : '@root');

export interface SettingsNavApi {
  path: SettingsPath;
  /** 0 au niveau 1, 1 au niveau 2, etc. */
  depth: number;
  key: string;
  /** Id de la section courante, null à la racine. */
  sectionId: string | null;
  /** Segments sous la section courante : ['fstream'] pour ['source','fstream']. */
  subPath: readonly string[];
  /** Sens de la dernière navigation — pilote le sens du glissement. */
  direction: 1 | -1;
  canPop: boolean;

  push: (segment: string) => void;
  pop: () => void;
  popToRoot: () => void;

  /** Mémorise la ligne focusée avant de descendre, pour la restaurer au retour. */
  rememberFocus: (rowId: string) => void;
  recallFocus: () => string | null;
}

export function usePlayerSettingsPath(initial: SettingsPath = ROOT_PATH): SettingsNavApi {
  const [path, setPath] = useState<SettingsPath>(initial);
  const [direction, setDirection] = useState<1 | -1>(1);

  // Mémoire de focus par niveau. Un ref plutôt qu'un state : la restauration se
  // fait à la première frame du niveau, on ne veut pas de rendu supplémentaire.
  const focusMemory = useRef<Map<string, string>>(new Map());

  const key = useMemo(() => pathKey(path), [path]);

  const push = useCallback((segment: string) => {
    setDirection(1);
    setPath(prev => [...prev, segment]);
  }, []);

  const pop = useCallback(() => {
    setPath(prev => {
      if (prev.length === 0) return prev;
      setDirection(-1);
      return prev.slice(0, -1);
    });
  }, []);

  const popToRoot = useCallback(() => {
    setPath(prev => {
      if (prev.length === 0) return prev;
      setDirection(-1);
      return ROOT_PATH;
    });
  }, []);

  const rememberFocus = useCallback(
    (rowId: string) => {
      focusMemory.current.set(pathKey(path), rowId);
    },
    [path],
  );

  const recallFocus = useCallback(() => {
    return focusMemory.current.get(pathKey(path)) ?? null;
  }, [path]);

  return {
    path,
    depth: path.length,
    key,
    sectionId: path.length > 0 ? path[0] : null,
    subPath: path.slice(1),
    direction,
    canPop: path.length > 0,
    push,
    pop,
    popToRoot,
    rememberFocus,
    recallFocus,
  };
}
