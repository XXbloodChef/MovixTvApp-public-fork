import type { TopLevelSourceId } from '../types/sourcePriority';

/**
 * Sources dont le lecteur embarqué injecte des publicités.
 *
 * Ces sources s'affichent dans une iframe d'un autre domaine : ses scripts y
 * dessinent des surcouches (« 18+ », « New message from… ») et ouvrent des
 * popups que notre page ne peut ni voir ni fermer — à la télécommande, elles
 * sont infermables. Mesuré le 06/09/2026 sur téléviseur : le repli
 * automatique vers « Multi » y a atterri au milieu d'un épisode.
 *
 * Être listé ici a deux effets, et deux seulement :
 *  - un badge dans les menus de sources, pour choisir en connaissance de cause ;
 *  - l'exclusion de toute sélection **automatique** — sélection initiale,
 *    repli après échec, contournement DNS. Un choix explicite reste possible,
 *    et le « dernier lecteur mémorisé » est respecté : c'est l'utilisateur qui
 *    l'a désigné.
 *
 * N'y inscrire qu'un constat, pas un soupçon : `coflix` est le seul observé.
 */
const AD_INJECTING_SOURCES: ReadonlySet<TopLevelSourceId> = new Set<TopLevelSourceId>([
  'coflix',
]);

export function injectsAds(id: TopLevelSourceId | string | null | undefined): boolean {
  return !!id && AD_INJECTING_SOURCES.has(id as TopLevelSourceId);
}
