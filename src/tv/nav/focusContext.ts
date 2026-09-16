import { createContext, useContext } from 'react';
import type { Position, Scope } from './resolveMove';

export interface TvFocusContextValue {
  registerScope: (
    config: Scope,
    element: HTMLElement,
    reveal?: (index: number) => void,
  ) => () => void;
  registerItem: (scopeId: string, index: number, element: HTMLElement) => () => void;
  focus: (position: Position) => void;
  focused: Position | null;
}

export const TvFocusContext = createContext<TvFocusContextValue | null>(null);

export function useTvFocusContext(): TvFocusContextValue {
  const context = useContext(TvFocusContext);
  if (!context) {
    throw new Error('Les hooks de focus TV exigent un <TvFocusProvider> parent');
  }
  return context;
}
