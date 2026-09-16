/**
 * Langue d'une source, et sa couleur.
 *
 * C'est la seule dimension colorée du panneau. Rien d'autre — ni le focus, ni
 * les séparateurs, ni les titres, ni les chevrons — ne prend de teinte. Une
 * couleur qui n'encode rien redevient de la décoration, et la liste des sources
 * est précisément l'endroit où on ne peut pas se le permettre : elle peut faire
 * quinze lignes.
 *
 * Palette froide et désaturée : ces teintes doivent tenir sur un fond quasi
 * noir à trois mètres, pas ressortir. La version « pleine » (`solid`) sert sur
 * fond clair (ligne focusée), la version « douce » sur fond sombre.
 */

export type SourceLanguage = 'vf' | 'vostfr' | 'vo';

export interface LanguagePaint {
  /** Libellé du badge. */
  label: string;
  /** Teinte sur fond sombre — texte du badge, pastilles, barre active. */
  soft: string;
  /** Fond du badge sur fond sombre. */
  softBackground: string;
  /** Teinte sur fond clair — ligne focusée. */
  solid: string;
  /** Fond du badge sur ligne focusée. */
  solidBackground: string;
  /** Texte du badge sur ligne focusée. */
  solidText: string;
}

export const LANGUAGE_PAINT: Record<SourceLanguage, LanguagePaint> = {
  vf: {
    label: 'VF',
    soft: '#5B9DFF',
    softBackground: 'rgba(91, 157, 255, 0.16)',
    solid: '#2C6FD1',
    solidBackground: 'rgba(44, 111, 209, 0.18)',
    solidText: '#123B72',
  },
  vostfr: {
    label: 'VOSTFR',
    soft: '#E0A458',
    softBackground: 'rgba(224, 164, 88, 0.16)',
    solid: '#B87A2E',
    solidBackground: 'rgba(184, 122, 46, 0.18)',
    solidText: '#5C3A11',
  },
  vo: {
    label: 'VO',
    soft: '#5BC8A8',
    softBackground: 'rgba(91, 200, 168, 0.16)',
    solid: '#2F9678',
    solidBackground: 'rgba(47, 150, 120, 0.18)',
    solidText: '#0F4536',
  },
};

/** Langue inconnue : gris, jamais une teinte par défaut. Mieux vaut ne rien dire. */
export const NEUTRAL_PAINT: LanguagePaint = {
  label: '',
  soft: '#7C848F',
  softBackground: 'rgba(255, 255, 255, 0.06)',
  solid: '#4A5058',
  solidBackground: 'rgba(11, 14, 18, 0.10)',
  solidText: '#4A5058',
};

export const paintFor = (language: SourceLanguage | null | undefined): LanguagePaint =>
  language ? LANGUAGE_PAINT[language] : NEUTRAL_PAINT;

/**
 * Ordre d'importance : VOSTFR avant VF, car « vostfr » contient « vf » dans
 * plusieurs libellés du catalogue (« VOSTFR/VF »), et un test naïf sur « vf »
 * classerait tout en VF.
 */
const PATTERNS: Array<[SourceLanguage, RegExp]> = [
  ['vostfr', /\b(?:vostfr|vost\.?fr|sub\s?fr|soustitr|subbed)\b/i],
  ['vf', /\b(?:vf|vff|vfq|truefrench|french|fran[cç]ais|multi)\b/i],
  ['vo', /\b(?:vo|vosta?|original|eng(?:lish)?|sub\s?eng|raw)\b/i],
];

/**
 * Déduit la langue d'un libellé, avec l'URL en second recours.
 *
 * Volontairement conservateur : en cas de doute on renvoie `null` et la ligne
 * s'affiche sans badge. Une pastille bleue mensongère coûte plus cher qu'une
 * pastille absente — l'utilisateur lance la source et découvre la mauvaise
 * langue trente secondes plus tard.
 */
export function detectSourceLanguage(
  label?: string | null,
  url?: string | null,
): SourceLanguage | null {
  for (const haystack of [label, url]) {
    if (!haystack) continue;
    for (const [language, pattern] of PATTERNS) {
      if (pattern.test(haystack)) return language;
    }
  }
  return null;
}

/** Langues présentes dans une liste, dans l'ordre VF → VOSTFR → VO. */
export function languagesPresent(
  items: Array<{ language?: SourceLanguage | null }>,
): SourceLanguage[] {
  const order: SourceLanguage[] = ['vf', 'vostfr', 'vo'];
  const found = new Set(items.map(item => item.language).filter(Boolean) as SourceLanguage[]);
  return order.filter(language => found.has(language));
}
