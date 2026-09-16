import { useCallback, useLayoutEffect, useRef } from 'react';

/**
 * Identité stable pour une fonction recréée à chaque rendu.
 *
 * La référence retournée ne change jamais, mais appelle toujours la version la
 * plus récente de `fn` — l'appelant voit donc l'état courant, pas celui du
 * premier rendu. À réserver aux fonctions passées à un enfant `React.memo`, où
 * une nouvelle identité à chaque rendu neutralise le memo ; ailleurs,
 * `useCallback` avec ses dépendances reste préférable, il est lisible par
 * ESLint.
 *
 * `useLayoutEffect` plutôt qu'une écriture pendant le rendu : la référence
 * n'est mise à jour qu'une fois le rendu validé, ce que le mode concurrent
 * exige.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useStableCallback<T extends (...args: any[]) => any>(fn: T): T {
  const latest = useRef(fn);
  useLayoutEffect(() => {
    latest.current = fn;
  });
  return useCallback(((...args: Parameters<T>) => latest.current(...args)) as T, []);
}
