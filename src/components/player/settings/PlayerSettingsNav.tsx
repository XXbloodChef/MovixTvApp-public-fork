import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, X } from 'lucide-react';
import { S } from './playerSettings.tokens';
import { SettingsRowList, type SettingsRowDescriptor } from './PlayerSettingsRow';
import {
  findSection,
  getVisibleSections,
  type SectionLevel,
  type SettingsContext,
} from './playerSettingsSections';
import { usePlayerSettingsPath, type SettingsNavApi } from './usePlayerSettingsPath';
import { isEditableTarget, isTvBackKey } from './tvBackKeys';
import { isTvDevice } from '@/utils/tv/isTvDevice';

/**
 * Panneau de réglages du lecteur — piste B (drill-down).
 *
 * Remplace la coquille de HLSPlayerSettingsPanel : la barre d'onglets
 * horizontale, le calcul de largeur, et l'animation de largeur. Toutes les
 * sections sont rendues par le registre ; rien du panneau souris n'est monté.
 */

export interface PlayerSettingsNavProps {
  /** Les props actuelles du panneau, passées telles quelles. */
  ctx: SettingsContext;
  /** Ferme le panneau (Retour au niveau 1). */
  onClose: () => void;
  /** Notifie l'entrée dans une section (null à la racine). */
  onSectionChange?: (sectionId: string | null) => void;
  /** Laisser vide pour laisser `isTvDevice()` décider. */
  isTv?: boolean;
  animationsDisabled?: boolean;
  containerRef?: React.Ref<HTMLDivElement>;
}

/**
 * Balayage de la mesure de qualité. Déclaré ici plutôt que dans la feuille de
 * style globale pour que la section Source reste autoportante — et désarmé
 * quand l'utilisateur a demandé moins d'animations.
 */
const PANEL_KEYFRAMES = `
@keyframes movix-probe-sweep {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(300%); }
}
@media (prefers-reduced-motion: reduce) {
  [data-player-settings] [style*="movix-probe-sweep"] { animation: none !important; }
}
`;

export const PlayerSettingsNav: React.FC<PlayerSettingsNavProps> = ({
  ctx,
  onClose,
  onSectionChange,
  isTv,
  animationsDisabled = false,
  containerRef,
}) => {
  const nav = usePlayerSettingsPath();
  const section = findSection(nav.sectionId);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // La prop reste prioritaire (une instance peut forcer le mode), sinon on
  // interroge la détection maison — override `?tv=1` compris.
  const onTv = isTv ?? isTvDevice();

  useEffect(() => {
    onSectionChange?.(nav.sectionId);
  }, [nav.sectionId, onSectionChange]);

  const back = useCallback(() => {
    if (nav.canPop) nav.pop();
    else onClose();
  }, [nav, onClose]);

  /**
   * Retour sur téléviseur sans shell natif (Tizen, webOS, HbbTV).
   *
   * Android TV passe par `movix-tv-back` → `handleBack` de `useTvPlayerRemote`,
   * qui clique `[data-player-settings-close]` — le bouton d'en-tête ci-dessous,
   * qui dépile. Rien à faire pour ce chemin.
   *
   * Ailleurs, Retour arrive en keydown. `SettingsRowList` le traite quand une
   * ligne a le focus ; ce filet en phase de bouillonnement ne voit que ce que
   * la liste n'a pas consommé — typiquement le focus posé sur le bouton
   * d'en-tête.
   */
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (!isTvBackKey(event)) return;
      const target = event.target;
      if (!(target instanceof Node) || !panelRef.current?.contains(target)) return;
      // Retour recouvre Backspace : sans ce filtre, corriger une frappe dans un
      // champ de recherche remonterait d'un niveau.
      if (isEditableTarget(target)) return;
      event.preventDefault();
      back();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [back]);

  const setPanelRef = useCallback(
    (node: HTMLDivElement | null) => {
      panelRef.current = node;
      if (typeof containerRef === 'function') containerRef(node);
      else if (containerRef) {
        (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }
    },
    [containerRef],
  );

  const rootRows = useRootRows(ctx, nav);

  const level = useMemo<SectionLevel | null>(() => {
    if (nav.depth === 0 || !section) return null;
    if (section.build) return section.build(ctx, nav.subPath, { push: nav.push, pop: nav.pop });
    return null;
  }, [ctx, nav, section]);

  /**
   * `onLeave` du niveau qu'on quitte — retour, descente ou fermeture du
   * panneau. Le niveau est reconstruit à chaque rendu ; le premier effet garde
   * la dernière version de son `onLeave`. Il est mis à jour *après* le commit,
   * et React exécute tous les nettoyages d'un commit avant tous ses effets :
   * quand la clé change, le nettoyage du second effet lit donc encore le
   * `onLeave` du niveau qu'on vient de quitter.
   */
  const onLeaveRef = useRef<(() => void) | undefined>(undefined);
  useEffect(() => {
    onLeaveRef.current = level?.onLeave;
  });
  useEffect(() => () => {
    onLeaveRef.current?.();
  }, [nav.key]);

  const transition = animationsDisabled
    ? { duration: 0 }
    : { duration: S.motion.duration, ease: S.motion.ease };

  const slide = animationsDisabled ? 0 : S.motion.slide;

  /**
   * Un seul bouton, présent à tous les niveaux : chevron à gauche quand on peut
   * dépiler, croix à droite au niveau 1. Il porte toujours
   * `data-player-settings-close`, le marqueur que `useTvPlayerRemote.handleBack`
   * clique sur Android TV — comme il dépile, Retour remonte d'un niveau puis
   * ferme, sans une ligne à changer dans le hook.
   */
  const backButton = (
    <button
      type="button"
      onClick={back}
      data-player-settings-close
      aria-label={nav.canPop ? 'Revenir en arrière' : 'Fermer les réglages'}
      style={{
        display: 'flex',
        alignItems: 'center',
        border: 'none',
        background: 'none',
        cursor: 'pointer',
        padding: 0,
        color: '#8B93A0',
      }}
    >
      {nav.canPop ? <ChevronLeft size={18} /> : <X size={17} />}
    </button>
  );

  return (
    <motion.div
      ref={setPanelRef}
      key="settings-panel"
      data-player-settings
      initial={{ opacity: 0, x: slide }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: slide }}
      transition={transition}
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        height: '100%',
        width: onTv ? S.panel.widthTv : S.panel.widthDesktop,
        maxWidth: '92vw',
        // Pas de `backdrop-filter` sur téléviseur : les mesures sur la TV de
        // référence ont montré qu'un flou coûtait une part considérable du
        // budget d'image, et il est ici recalculé à chaque image de la vidéo qui
        // défile dessous. On rend le fond opaque à la place.
        background: onTv ? '#0B0E12' : S.panel.background,
        backdropFilter: onTv ? undefined : S.panel.backdropFilter,
        WebkitBackdropFilter: onTv ? undefined : S.panel.backdropFilter,
        borderLeft: `0.5px solid ${S.panel.borderLeft}`,
        display: 'flex',
        flexDirection: 'column',
        zIndex: 10002,
      }}
    >
      <style>{PANEL_KEYFRAMES}</style>

      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: `${S.panel.paddingTop}px ${S.panel.paddingX + 8}px 20px`,
          flexShrink: 0,
        }}
      >
        {nav.canPop && backButton}
        <h2
          style={{
            flex: 1,
            margin: 0,
            fontSize: S.font.title,
            fontWeight: 500,
            color: S.text.title,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {nav.depth === 0
            ? (ctx.t?.('watch.settingsTitle') ?? 'Réglages')
            : (level?.title ?? (section ? section.label(ctx) : ''))}
        </h2>
        {!nav.canPop && backButton}
      </header>

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: `0 ${S.panel.paddingX}px ${S.panel.paddingBottom}px`,
        }}
        className="custom-scrollbar"
        data-lenis-prevent
      >
        <AnimatePresence mode="wait" initial={false} custom={nav.direction}>
          <motion.div
            key={nav.key}
            custom={nav.direction}
            initial={{ opacity: 0, x: nav.direction * slide }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: nav.direction * -slide }}
            transition={transition}
          >
            {nav.depth === 0 ? (
              <SettingsRowList
                rows={rootRows}
                initialFocusId={nav.recallFocus()}
                onFocusChange={nav.rememberFocus}
                onBack={onClose}
              />
            ) : level ? (
              <SettingsRowList
                rows={level.rows}
                initialFocusId={nav.recallFocus()}
                onFocusChange={nav.rememberFocus}
                onBack={back}
              />
            ) : null}
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

/** Niveau 1 : une ligne par section visible, avec sa valeur courante. */
function useRootRows(ctx: SettingsContext, nav: SettingsNavApi): SettingsRowDescriptor[] {
  return useMemo(() => {
    const sections = getVisibleSections(ctx);
    const rows: SettingsRowDescriptor[] = [];

    sections.forEach((section, index) => {
      const previous = sections[index - 1];

      // Deux séparateurs seulement : avant Vitesse (bloc « confort »)
      // et avant Réinitialiser (action destructive).
      if (section.id === 'speed' || (section.tone === 'danger' && previous?.tone !== 'danger')) {
        rows.push({ kind: 'separator', id: `sep:${section.id}` });
      }

      if (section.onSelect) {
        rows.push({
          kind: 'action',
          id: section.id,
          icon: section.icon,
          label: section.label(ctx),
          tone: section.tone,
          onSelect: () => section.onSelect?.(ctx),
        });
        return;
      }

      rows.push({
        kind: 'nav',
        id: section.id,
        icon: section.icon,
        label: section.label(ctx),
        value: section.getValue?.(ctx) ?? undefined,
        badge: section.getBadge?.(ctx) ?? undefined,
        tone: section.tone,
        onSelect: () => nav.push(section.id),
      });
    });

    return rows;
  }, [ctx, nav]);
}

export default PlayerSettingsNav;
