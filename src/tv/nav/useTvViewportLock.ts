import { useEffect } from 'react';

/**
 * Rend le document non défilable pendant toute la durée de vie de l'interface TV.
 *
 * Le symptôme : à chaque flèche, l'écran sursaute et une fine barre claire
 * apparaît en bas. C'est le pied de page du site souris, qui vit sous la
 * coquille TV dans le même document. `element.focus()` demande au navigateur de
 * révéler l'élément focalisé, et il calcule ce défilement sur la position de
 * *mise en page* — laquelle ignore le `transform` qui déplace déjà la colonne.
 * Le document part donc de quelques dizaines de pixels, le pied de page pointe,
 * puis tout revient.
 *
 * La correction précédente ramenait `window.scrollY` à zéro après coup. C'était
 * une erreur de nature : corriger un défilement une frame trop tard, c'est
 * transformer un décalage silencieux en tremblement visible. On empêche ici le
 * défilement d'exister plutôt que de le rattraper.
 *
 * `clip` et non `hidden` : les deux rognent de la même façon, mais `hidden`
 * laisse un conteneur défilable par programme — exactement ce dont
 * `element.focus()` a besoin pour nuire. C'est la même distinction que dans
 * `TvRow`, où `hidden` est au contraire obligatoire puisque le virtualiseur
 * pilote `scrollLeft`.
 *
 * Appelé depuis `TvLayout` et non depuis un écran : `TvDetails`, les pages de
 * parcours (`TvBrowse`) et `TvSearch` sont exposés au même problème.
 *
 * Cela ne dispense pas des vraies corrections en amont — le pied de page n'est
 * plus monté sur `/tvapp`, et `useFocusItem` passe déjà `{ preventScroll: true }`
 * à `focus()`. Ce verrou est ce qui garantit qu'aucune régression ultérieure ne
 * puisse ramener le tremblement.
 */
export function useTvViewportLock(): void {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;

    const previous = {
      htmlOverflow: html.style.overflow,
      htmlHeight: html.style.height,
      bodyOverflow: body.style.overflow,
      bodyHeight: body.style.height,
      bodyOverscroll: body.style.overscrollBehavior,
    };

    // Le document peut déjà être défilé quand on arrive depuis le site souris.
    window.scrollTo(0, 0);

    html.style.overflow = 'clip';
    html.style.height = '100%';
    body.style.overflow = 'clip';
    body.style.height = '100%';
    body.style.overscrollBehavior = 'none';

    // Restauration à la sortie : le site souris, lui, doit continuer de défiler.
    return () => {
      html.style.overflow = previous.htmlOverflow;
      html.style.height = previous.htmlHeight;
      body.style.overflow = previous.bodyOverflow;
      body.style.height = previous.bodyHeight;
      body.style.overscrollBehavior = previous.bodyOverscroll;
    };
  }, []);
}
