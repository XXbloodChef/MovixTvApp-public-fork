/**
 * Jetons de design du panneau de réglages du lecteur — piste B (drill-down).
 *
 * Volontairement en objet TS et non en classes Tailwind : les valeurs sont
 * consommées en style inline par les lignes, ce qui garantit qu'un focus TV
 * rendu à 3 m est identique au pixel près quel que soit l'ordre des classes
 * utilitaires. Les seules classes Tailwind utilisées dans le kit sont
 * structurelles (flex, truncate…), jamais chromatiques.
 */

export const SETTINGS_TOKENS = {
  panel: {
    /** Largeur fixe. Ne dépend plus du nombre de sections (cf. recalculateMenuWidth supprimé). */
    widthTv: 380,
    widthDesktop: 420,
    // Sous-ton froid volontaire : un fond parfaitement neutre paraît terne
    // derrière une image. Le bleu-noir est la signature Disney+.
    background: 'rgba(8, 11, 18, 0.84)',
    backdropFilter: 'blur(24px)',
    borderLeft: 'rgba(255, 255, 255, 0.10)',
    paddingX: 12,
    paddingTop: 20,
    paddingBottom: 16,
  },

  row: {
    height: 48,
    /** Lignes à deux niveaux (hébergeur + méta), cf. niveau 3 des sources. */
    heightTwoLine: 56,
    radius: 12,
    paddingX: 12,
    gap: 12,
  },

  separator: {
    color: 'rgba(255, 255, 255, 0.055)',
    thickness: 0.5,
    marginY: 10,
    marginX: 12,
  },

  text: {
    title: '#F4F5F7',
    label: '#C9CED6',
    value: '#7C848F',
    inactive: '#5A616B',
    /** Contenu d'une ligne focusée (fond clair). */
    onFocus: '#0B0E12',
    onFocusMuted: '#4A5058',
  },

  icon: {
    idle: '#727A85',
    faint: '#4C535D',
    fainter: '#3E454E',
  },

  focus: {
    background: '#F4F5F7',
  },

  /** Bleu discret : épinglage, badges informatifs. Jamais le focus. */
  accent: {
    solid: '#5B9DFF',
    text: '#BFD7FF',
    background: 'rgba(91, 157, 255, 0.16)',
  },

  /** Rouge réservé à la seule action destructive (réinitialiser la progression). */
  danger: {
    text: '#B98080',
    icon: '#8A6060',
  },

  badge: {
    background: 'rgba(255, 255, 255, 0.07)',
    backgroundOnFocus: 'rgba(11, 14, 18, 0.12)',
    radius: 5,
    paddingX: 7,
    paddingY: 2,
  },

  font: {
    title: 18,
    label: 15,
    value: 13,
    sublabel: 11,
    badge: 11,
    caption: 11,
  },

  motion: {
    duration: 0.22,
    ease: [0.32, 0.72, 0, 1] as [number, number, number, number],
    /** Amplitude du glissement latéral entre deux niveaux. */
    slide: 24,
  },
} as const;

export type SettingsTokens = typeof SETTINGS_TOKENS;

/** Raccourci de lecture dans les composants. */
export const S = SETTINGS_TOKENS;
