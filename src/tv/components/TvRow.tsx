import React, { useCallback, useRef } from 'react';
import { useVirtualizer, type Virtualizer } from '@tanstack/react-virtual';
import { isTvScaled } from '../tvScale';
import { useFocusItem, useFocusScope } from '../nav/hooks';
import { TvMoreCard } from './TvMoreCard';

/**
 * Rangée horizontale virtualisée.
 *
 * Virtualisée et non montée en entier : une rangée de catalogue dépasse
 * facilement la centaine de titres, et le SoC d'un téléviseur ne tient pas
 * autant de nœuds. C'est aussi ce qui impose la navigation par index plutôt que
 * par géométrie — les éléments hors fenêtre n'existent pas dans le DOM.
 */

/**
 * Marge de sûreté horizontale.
 *
 * Elle n'est appliquée qu'à **gauche**, comme padding de départ du virtualiseur.
 * À droite, la rangée court jusqu'au bord physique de la dalle : une carte
 * coupée par le bord est la seule chose qui dise « ça continue ». Une rangée qui
 * s'arrête proprement à 48 px du bord droit se lit comme une rangée finie, et
 * c'est ce que faisait le `px-[6%]` posé sur le conteneur des rangées.
 */
export const TV_SAFE_X = 48;

/**
 * Gabarits de carte, exprimés en **taille focalisée**.
 *
 * Inversion par rapport à la version précédente : la carte est rendue à sa
 * taille maximale et c'est l'état *au repos* qui est réduit par `scale`. Un
 * `scale(1.1)` au focus demandait à Chromium de re-rastériser la couche à
 * 110 % — coûteux sur ce SoC, et l'affiche y perdait en netteté puisqu'elle
 * était agrandie au-delà de sa résolution native. Ici la rastérisation se fait
 * toujours à la taille maximale, et réduire une couche déjà rastérisée est
 * gratuit pour le compositeur.
 *
 * Les dimensions sont calées sur un viewport CSS de 960 : à densité 2,
 * `poster` fait 296×444 px physiques, ce que `w342` couvre sans un octet
 * de trop. `still` fait 416×234, d'où `w500`.
 */
/**
 * Largeur du bloc de rang, à gauche de l'affiche dans le gabarit `rank`.
 *
 * 84 px : assez pour qu'un chiffre seul tienne entier, pas assez pour « 10 »,
 * dont le zéro passe sous l'affiche — comme sur Netflix, où c'est précisément
 * ce recouvrement qui fait tenir les deux chiffres sans élargir la cellule.
 */
export const TV_RANK_WIDTH = 84;

export const TV_LAYOUTS = {
  poster: { width: 148, height: 222 },
  still: { width: 208, height: 117 },
  compact: { width: 120, height: 180 },
  /**
   * Affiche `poster` précédée de son numéro de classement. La largeur est
   * celle de la *cellule* — c'est elle que le virtualiseur mesure ; l'image,
   * elle, garde le gabarit `poster`. Voir `TvCard`.
   */
  rank: { width: 148 + TV_RANK_WIDTH, height: 222 },
} as const;

export type TvRowLayout = keyof typeof TV_LAYOUTS;

export const TV_CARD_GAP = 10;
/** Hauteur réservée au bloc titre. Fixe, pour qu'aucun focus ne décale la rangée. */
export const TV_CARD_LABEL_HEIGHT = 40;
/** Échelle des cartes non focalisées. Voir le commentaire de TV_LAYOUTS. */
export const TV_CARD_REST_SCALE = 0.92;

/**
 * Débord réservé autour des cartes.
 *
 * Il ne couvre plus qu'un contour de focus (2 px de décalage + 3 px
 * d'épaisseur), puisque plus rien ne dépasse de la boîte : la carte focalisée
 * est à `scale(1)`. On passe de 24 px à 8 px de chaque côté, soit 32 px
 * récupérés par rangée — de quoi faire tenir une rangée de plus dans le champ.
 */
const FOCUS_BLEED = 8;

const rowHeight = (layout: TvRowLayout): number =>
  TV_LAYOUTS[layout].height + TV_CARD_LABEL_HEIGHT + FOCUS_BLEED * 2;

export interface TvRowItemState {
  focused: boolean;
  index: number;
  /** Vrai si le focus est quelque part dans cette rangée. Pilote `will-change`. */
  rowFocused: boolean;
}

/**
 * Prolongement de la rangée par une carte « Voir plus ».
 *
 * Elle occupe un index logique de plus dans la portée, ce qui suffit à la rendre
 * atteignable : le moteur navigue par index, pas par géométrie, donc rien
 * d'autre n'est à déclarer. À n'activer que sur les rangées adossées à une
 * collection réellement paginable — une carte « Voir plus » qui ouvre vingt
 * titres de plus que ceux déjà visibles est une promesse non tenue.
 */
export interface TvRowMore {
  /** Catégorie rappelée sur la carte. Par défaut, le titre de la rangée. */
  category?: string;
  onSelect: () => void;
}

interface TvRowProps<T> {
  /** Identifiant de portée, doit être stable entre deux rendus. */
  id: string;
  title: string;
  items: T[];
  renderItem: (item: T, state: TvRowItemState) => React.ReactNode;
  onSelect?: (item: T, index: number) => void;
  /** Notifié quand le focus arrive sur un **élément** de la rangée. */
  onFocusChange?: (item: T, index: number) => void;
  /**
   * Notifié quand le focus arrive n'importe où dans la rangée, carte « Voir
   * plus » comprise. Distinct de `onFocusChange`, qui porte un élément : la
   * carte de fin n'en a pas, et l'appelant qui veut seulement savoir « le focus
   * est entré ici » n'a pas à s'en soucier.
   */
  onRowEnter?: () => void;
  more?: TvRowMore;
  /**
   * Voisins verticaux déclarés explicitement.
   *
   * Indispensable ici : les rangées arrivent par vagues (chargement étagé), donc
   * l'ordre de *montage* — celui dans lequel les portées s'enregistrent — ne
   * correspond pas à l'ordre du DOM. Sans déclaration, Bas depuis « Tendances »
   * pouvait atterrir dans une rangée arrivée plus tôt mais affichée plus bas.
   */
  neighbors?: { up?: string | null; down?: string | null };
  /** Vrai si cette rangée porte le focus. Fourni par le parent. */
  active?: boolean;
  layout?: TvRowLayout;
}

function TvRowInner<T>({
  id,
  title,
  items,
  renderItem,
  onSelect,
  onFocusChange,
  onRowEnter,
  more,
  neighbors,
  active = false,
  layout = 'poster',
}: TvRowProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const count = items.length + (more ? 1 : 0);

  const virtualizer = useVirtualizer({
    horizontal: true,
    count,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => TV_LAYOUTS[layout].width + TV_CARD_GAP,
    overscan: 4,
    // La marge de sûreté vit ici et non sur un conteneur parent : le
    // virtualiseur l'intègre à `start` et à `getTotalSize`, donc `scrollToIndex`
    // continue de centrer exactement, et la rangée peut déborder à droite.
    paddingStart: TV_SAFE_X,
    paddingEnd: TV_SAFE_X,
    // Interface mise à l'échelle (autre viewport que 960 × 540) : la mesure
    // par défaut lit `getBoundingClientRect`, qui renvoie la taille APRÈS
    // transformation, alors que le défilement se fait en pixels de mise en
    // page. Le centrage de `scrollToIndex` serait faux du facteur d'échelle.
    // On mesure donc en `offsetWidth`, insensible aux transformations. Sur le
    // téléviseur de référence, le comportement par défaut est conservé.
    ...(isTvScaled() ? { observeElementRect: observeLayoutRect } : {}),
  });

  const reveal = useCallback(
    (index: number) => virtualizer.scrollToIndex(index, { align: 'center' }),
    [virtualizer],
  );

  const scopeRef = useFocusScope({
    id,
    orientation: 'row',
    count,
    neighbors,
    reveal,
  });

  // Une rangée réduite à sa seule carte « Voir plus » n'a rien à annoncer.
  if (items.length === 0) return null;

  const { width } = TV_LAYOUTS[layout];

  return (
    <section
      ref={scopeRef}
      className="mb-6"
      // `contain` borne l'invalidation à la rangée : quand le virtualiseur
      // pousse `scrollLeft`, Chromium n'a pas à reconsidérer le reste de la page.
      style={{ contain: 'layout paint' }}>
      <h2
        className="mb-2 text-[19px] font-bold tracking-tight text-white/90"
        style={{ paddingLeft: TV_SAFE_X }}>
        {title}
      </h2>
      <div
        ref={scrollRef}
        className="relative overflow-hidden"
        style={{ height: rowHeight(layout) }}>
        <div className="relative h-full" style={{ width: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map(virtualItem =>
            more && virtualItem.index === items.length ? (
              <TvRowMoreItem
                key={virtualItem.key}
                scopeId={id}
                index={virtualItem.index}
                offset={virtualItem.start}
                width={width}
                rowFocused={active}
                category={more.category ?? title}
                layout={layout}
                onSelect={more.onSelect}
                onRowEnter={onRowEnter}
              />
            ) : (
              <TvRowItem
                key={virtualItem.key}
                scopeId={id}
                index={virtualItem.index}
                offset={virtualItem.start}
                item={items[virtualItem.index]}
                renderItem={renderItem}
                onSelect={onSelect}
                onFocusChange={onFocusChange}
                onRowEnter={onRowEnter}
                rowFocused={active}
                width={width}
              />
            ),
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * Mémoïsé : un changement de diapositive dans la bannière, ou l'arrivée d'une
 * rangée de la seconde vague, re-rend `TvHome`. Sans ça, chaque événement de ce
 * type re-rendrait les quatorze rangées et leurs cartes.
 */
export const TvRow = React.memo(TvRowInner) as typeof TvRowInner;

function observeLayoutRect(
  instance: Virtualizer<HTMLDivElement, Element>,
  cb: (rect: { width: number; height: number }) => void,
): (() => void) | undefined {
  const element = instance.scrollElement;
  if (!element) return undefined;
  const measure = () => cb({ width: element.offsetWidth, height: element.offsetHeight });
  measure();
  if (typeof ResizeObserver === 'undefined') return undefined;
  const observer = new ResizeObserver(measure);
  observer.observe(element);
  return () => observer.disconnect();
}

interface TvRowItemProps<T> {
  scopeId: string;
  index: number;
  offset: number;
  item: T;
  renderItem: (item: T, state: TvRowItemState) => React.ReactNode;
  onSelect?: (item: T, index: number) => void;
  onFocusChange?: (item: T, index: number) => void;
  onRowEnter?: () => void;
  rowFocused: boolean;
  width: number;
}

function TvRowItem<T>({
  scopeId,
  index,
  offset,
  item,
  renderItem,
  onSelect,
  onFocusChange,
  onRowEnter,
  rowFocused,
  width,
}: TvRowItemProps<T>) {
  const { ref, focused, focusProps } = useFocusItem<HTMLDivElement>(scopeId, index);

  // Notifié par effet et non pendant le rendu : prévenir le parent en plein
  // rendu déclencherait une mise à jour d'état imbriquée.
  React.useEffect(() => {
    if (!focused) return;
    onRowEnter?.();
    onFocusChange?.(item, index);
  }, [focused, item, index, onFocusChange, onRowEnter]);

  return (
    <div
      ref={ref}
      {...focusProps}
      role="button"
      onKeyDown={event => {
        if (event.key === 'Enter') {
          event.preventDefault();
          onSelect?.(item, index);
        }
      }}
      onClick={() => onSelect?.(item, index)}
      className="absolute outline-none"
      style={{ left: offset, top: FOCUS_BLEED, width }}>
      {renderItem(item, { focused, index, rowFocused })}
    </div>
  );
}

function TvRowMoreItem({
  scopeId,
  index,
  offset,
  width,
  rowFocused,
  category,
  layout,
  onSelect,
  onRowEnter,
}: {
  scopeId: string;
  index: number;
  offset: number;
  width: number;
  rowFocused: boolean;
  category: string;
  layout: TvRowLayout;
  onSelect: () => void;
  onRowEnter?: () => void;
}) {
  const { ref, focused, focusProps } = useFocusItem<HTMLDivElement>(scopeId, index);

  React.useEffect(() => {
    if (focused) onRowEnter?.();
  }, [focused, onRowEnter]);

  return (
    <div
      ref={ref}
      {...focusProps}
      role="button"
      onKeyDown={event => {
        if (event.key === 'Enter') {
          event.preventDefault();
          onSelect();
        }
      }}
      onClick={onSelect}
      className="absolute outline-none"
      style={{ left: offset, top: FOCUS_BLEED, width }}>
      <TvMoreCard
        category={category}
        width={width}
        height={TV_LAYOUTS[layout].height}
        labelHeight={TV_CARD_LABEL_HEIGHT}
        focused={focused}
        rowFocused={rowFocused}
        restScale={TV_CARD_REST_SCALE}
      />
    </div>
  );
}
