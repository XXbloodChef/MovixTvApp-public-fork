import type { RefObject } from 'react';

interface InjectableRef {
  injectJavaScript: (script: string) => void;
}

/**
 * Négociation de la touche Retour entre le shell et la page.
 *
 * `BackHandler` est synchrone : il faut répondre « consommé / pas consommé »
 * immédiatement, alors qu'interroger la WebView serait asynchrone. On inverse
 * donc le sens : la page **déclare à l'avance** si elle a quelque chose à fermer
 * (panneau ouvert, lecteur affiché, écran non racine), et le shell se contente
 * de lire ce drapeau.
 *
 * Quand le drapeau est levé, Retour est renvoyé dans la page en événement
 * `movix-tv-back` au lieu de reculer dans l'historique.
 */

const interceptors = new WeakMap<object, boolean>();

export function setBackInterception(
  webViewRef: RefObject<InjectableRef | null>,
  enabled: boolean,
): void {
  interceptors.set(webViewRef, enabled);
}

export function wantsBackInterception(
  webViewRef: RefObject<InjectableRef | null>,
): boolean {
  return interceptors.get(webViewRef) === true;
}

/**
 * Le drapeau doit retomber à chaque navigation : la nouvelle page n'a pas encore
 * dit ce qu'elle voulait, et garder l'ancien état ferait avaler des Retour sans
 * que personne ne les traite — l'utilisateur ne pourrait plus sortir.
 */
export function clearBackInterception(
  webViewRef: RefObject<InjectableRef | null>,
): void {
  interceptors.delete(webViewRef);
}

export function dispatchBackToPage(
  webViewRef: RefObject<InjectableRef | null>,
): void {
  webViewRef.current?.injectJavaScript(
    "window.dispatchEvent(new CustomEvent('__MOVIX_TV_BACK__')); true;",
  );
}

/**
 * Demande à la page de redéclarer son état d'interception.
 *
 * Le shim mémoïse sa valeur et ne la republie qu'au changement : après un effacement
 * côté shell, seul ce rappel permet de retrouver l'état réel.
 */
export function requestBackInterceptionResync(
  webViewRef: RefObject<InjectableRef | null>,
): void {
  webViewRef.current?.injectJavaScript(
    "window.dispatchEvent(new CustomEvent('__MOVIX_TV_BACK_RESYNC__')); true;",
  );
}
