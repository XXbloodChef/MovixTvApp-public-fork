import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  rememberPosition,
  resolveMove,
  type Direction,
  type NavState,
  type Position,
  type Scope,
} from './resolveMove';
import { TvFocusContext, type TvFocusContextValue } from './focusContext';

/**
 * Liaison React du moteur de navigation.
 *
 * Tout l'état vit dans des refs, pas dans le state : un appui sur une flèche ne
 * doit pas faire re-rendre l'arbre entier. Seule la position focalisée est
 * publiée en state, et les éléments s'y abonnent individuellement.
 */

interface RegisteredScope {
  config: Scope;
  element: HTMLElement;
  /** Demande à la rangée d'amener un index dans sa fenêtre de rendu. */
  reveal?: (index: number) => void;
}

const DIRECTION_BY_KEY: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

const itemKey = (scopeId: string, index: number) => `${scopeId}:${index}`;

export const TvFocusProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const scopesRef = useRef(new Map<string, RegisteredScope>());
  const itemsRef = useRef(new Map<string, HTMLElement>());
  const stateRef = useRef<NavState>({ scopes: [], current: null, memory: {} });
  const orderDirtyRef = useRef(true);
  /** Cible demandée mais pas encore montée (rangée virtualisée). */
  const pendingRef = useRef<Position | null>(null);
  const [focused, setFocused] = useState<Position | null>(null);

  /**
   * Les portées sont ordonnées par position dans le DOM, pas par ordre de
   * montage : React ne garantit pas que l'un suive l'autre. Le tri n'est refait
   * que lorsque l'ensemble change, jamais à chaque appui.
   */
  const orderedScopes = useCallback((): Scope[] => {
    if (!orderDirtyRef.current) return stateRef.current.scopes;
    const entries = [...scopesRef.current.values()];
    entries.sort((a, b) => {
      const relation = a.element.compareDocumentPosition(b.element);
      if (relation & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (relation & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    });
    orderDirtyRef.current = false;
    stateRef.current = { ...stateRef.current, scopes: entries.map(entry => entry.config) };
    return stateRef.current.scopes;
  }, []);

  const applyFocus = useCallback((position: Position) => {
    stateRef.current = rememberPosition(
      { ...stateRef.current, scopes: orderedScopes() },
      position,
    );
    setFocused(position);

    // La rangée virtualisée doit d'abord rendre l'élément visé ; s'il n'est pas
    // encore dans le DOM, on note la cible et registerItem prendra le relais.
    scopesRef.current.get(position.scopeId)?.reveal?.(position.index);

    const element = itemsRef.current.get(itemKey(position.scopeId, position.index));
    if (element) {
      pendingRef.current = null;
      element.focus({ preventScroll: true });
      // Vertical seulement : le centrage horizontal appartient au virtualiseur
      // de la rangée, qui sait où se trouve l'élément dans sa liste complète.
      element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
    } else {
      pendingRef.current = position;
    }
  }, [orderedScopes]);

  const registerScope = useCallback(
    (config: Scope, element: HTMLElement, reveal?: (index: number) => void) => {
      scopesRef.current.set(config.id, { config, element, reveal });
      orderDirtyRef.current = true;
      return () => {
        scopesRef.current.delete(config.id);
        orderDirtyRef.current = true;
      };
    },
    [],
  );

  const registerItem = useCallback(
    (scopeId: string, index: number, element: HTMLElement) => {
      const key = itemKey(scopeId, index);
      itemsRef.current.set(key, element);

      // L'élément attendu vient d'arriver dans le DOM : on lui donne le focus.
      const pending = pendingRef.current;
      if (pending && pending.scopeId === scopeId && pending.index === index) {
        pendingRef.current = null;
        element.focus({ preventScroll: true });
        element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
      }

      return () => {
        if (itemsRef.current.get(key) === element) itemsRef.current.delete(key);
      };
    },
    [],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const direction = DIRECTION_BY_KEY[event.key];
      if (!direction) return;

      // Les champs de saisie gardent la main : les flèches y déplacent le caret.
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
        return;
      }

      const next = resolveMove({ ...stateRef.current, scopes: orderedScopes() }, direction);
      if (next) {
        event.preventDefault();
        applyFocus(next);
        return;
      }

      // Aucune cible : on fait quand même défiler, sinon un bloc de texte sans
      // élément focusable serait impossible à lire à la télécommande.
      if (direction === 'up' || direction === 'down') {
        const root = document.documentElement;
        const atEdge =
          direction === 'down'
            ? window.scrollY + window.innerHeight >= root.scrollHeight - 2
            : window.scrollY <= 2;
        if (!atEdge) {
          event.preventDefault();
          window.scrollBy({
            top: (direction === 'down' ? 1 : -1) * window.innerHeight * 0.8,
            behavior: 'smooth',
          });
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [applyFocus, orderedScopes]);

  const value = useMemo<TvFocusContextValue>(
    () => ({ registerScope, registerItem, focus: applyFocus, focused }),
    [registerScope, registerItem, applyFocus, focused],
  );

  return <TvFocusContext.Provider value={value}>{children}</TvFocusContext.Provider>;
};
