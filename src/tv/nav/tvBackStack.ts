/**
 * Pile des gestionnaires de la touche Retour.
 *
 * `TvLayout` écoute `movix-tv-back` sur `window` et appelle `navigate(-1)`.
 * Tant qu'une page n'avait qu'un seul niveau, c'était juste. La fiche de détail
 * en a deux — l'accueil de la fiche, puis le contenu d'un onglet — et Retour
 * doit d'abord remonter d'un niveau avant de quitter la page.
 *
 * On ne peut pas simplement ajouter un second écouteur sur `window` : les deux
 * s'exécuteraient, et la page reviendrait en arrière en même temps qu'elle
 * remonterait d'un niveau. La pile rend l'arbitrage explicite — `TvLayout`
 * consulte le sommet avant de décider.
 *
 * LIFO volontairement : si une boîte de dialogue s'ouvre par-dessus la fiche,
 * c'est elle qui reçoit Retour, pas la fiche en dessous.
 */

/** Renvoie `true` si la touche a été consommée. */
type BackHandler = () => boolean;

const stack: BackHandler[] = [];

/** Empile un gestionnaire. La fonction rendue le retire — à appeler au démontage. */
export function pushBackHandler(handler: BackHandler): () => void {
  stack.push(handler);
  return () => {
    const index = stack.lastIndexOf(handler);
    if (index !== -1) stack.splice(index, 1);
  };
}

/**
 * Donne sa chance au sommet de pile.
 *
 * @returns `true` si un gestionnaire a consommé la touche, auquel cas
 *   l'appelant ne doit pas naviguer.
 */
export function runTopBackHandler(): boolean {
  const handler = stack[stack.length - 1];
  return handler ? handler() : false;
}
