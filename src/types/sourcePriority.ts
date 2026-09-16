// src/types/sourcePriority.ts

/** Sources top-level disponibles pour Films/Séries. Ordre = default hardcodé actuel. */
export const TOP_LEVEL_SOURCE_IDS = [
  'darkino', 'mp4', 'nexus_hls', 'swiftflux', 'bravo',
  'fstream', 'wiflix', 'j1f', 'swiftflow', 'omega', 'coflix', 'frembed', 'vostfr',
  'viper', 'vox', 'kisskh', 'custom',
] as const;
export type TopLevelSourceId = typeof TOP_LEVEL_SOURCE_IDS[number];

/**
 * Ids historiques retirés de l'UI de priorité.
 * mergeWithDefaults les strip des prefs persistées (cleanup migration).
 */
export const DEPRECATED_SOURCE_IDS = ['nexus_file', 'rivestream_hls', 'rivestream'] as const;
export const DEPRECATED_HOSTER_IDS = [] as const;

/**
 * Hosters built-in connus. Les custom hosters utilisent des ids prefixés `custom_`.
 *
 * **L'ordre compte deux fois** : il fixe l'ordre de priorité par défaut ET
 * l'ordre de test dans `detectHoster`. `veev` doit donc rester AVANT
 * `doodstream`, dont les patterns couvrent aussi `doods.to`.
 */
export const BUILTIN_HOSTER_IDS = [
  'voe', 'vidmoly', 'vidzy', 'uqload', 'sibnet', 'veev', 'doodstream',
  'lulustream', 'vidara',
  'seekstreaming', 'smoothpre', 'minochinos', 'darkibox',
  'supervideo', 'dropload', 'oneupload', 'fsvid',
] as const;
export type BuiltinHosterId = typeof BUILTIN_HOSTER_IDS[number];
export type HosterId = BuiltinHosterId | string; // string = custom_...

/** Langues supportées par les animes (anime-sama). */
export const LANGUAGE_IDS = ['vf', 'vostfr', 'vj', 'va', 'vkr', 'vcn'] as const;
export type LanguageId = typeof LANGUAGE_IDS[number] | string;

export interface PinSnapshot<T extends string> {
  id: T;
  snapshot: Array<{ id: T; enabled: boolean }>;
}

export interface MoviesTvPrefs {
  sourceOrder: Array<{ id: TopLevelSourceId; enabled: boolean }>;
  hosterOrder: HosterId[];
  /**
   * Préférence de langue pour les sources qui en proposent plusieurs versions
   * (FStream, Lynx/wiflix, Viper). Appliquée comme tri PRIMAIRE avant
   * l'ordre des hosters, quand les items exposent un champ `language` ou
   * `category`. Si la source n'expose pas de langue, ce tri est no-op.
   */
  languageOrder: Array<{ id: LanguageId; enabled: boolean }>;
  overrides: Partial<Record<TopLevelSourceId, HosterId[]>>;
  pinnedSource: PinSnapshot<TopLevelSourceId> | null;
  pinnedHoster: PinSnapshot<HosterId> | null;
  pinnedLanguage: PinSnapshot<LanguageId> | null;
}

export interface AnimePrefs {
  languageOrder: Array<{ id: LanguageId; enabled: boolean }>;
  hosterOrder: HosterId[];
  overrides: Partial<Record<LanguageId, HosterId[]>>;
  pinnedLanguage: PinSnapshot<LanguageId> | null;
  pinnedHoster: PinSnapshot<HosterId> | null;
}

export interface CustomHoster {
  id: string;       // ex: "custom_myhost"
  name: string;
  patterns: string[]; // regex strings
}

export interface SourcePriorityPrefs {
  version: 4;
  categories: {
    moviesTv: MoviesTvPrefs;
    anime: AnimePrefs;
  };
  customHosters: CustomHoster[];
  patternOverrides: Partial<Record<BuiltinHosterId, string[]>>;
  updatedAt: number;
}

export type PriorityCategory = 'moviesTv' | 'anime';

/**
 * Correspondance « type de source principale » → identifiant épinglable.
 *
 * Copie exportée de la table que `HLSPlayer.tsx` et `HLSPlayerSettingsPanel.tsx`
 * gardent chacun en local : le panneau de réglages téléviseur en a besoin
 * depuis un module tiers, où une constante privée n'est pas atteignable. Les
 * trois doivent rester synchronisées — c'est déjà l'avertissement porté par le
 * commentaire de `HLSPlayer.tsx`, et cette copie en ajoute une troisième.
 * `rivestream_main` est volontairement absent : `rivestream` figure dans
 * `DEPRECATED_SOURCE_IDS`.
 */
export const SOURCE_MAIN_TO_TOP_LEVEL: Record<string, TopLevelSourceId> = {
  darkino_main: 'darkino',
  fstream_main: 'fstream',
  wiflix_main: 'wiflix',
  j1f_main: 'j1f',
  swiftflow_main: 'swiftflow',
  swiftflux: 'swiftflux',
  omega_main: 'omega',
  multi_main: 'coflix', // multi = coflix (naming historique)
  viper_main: 'viper',
  vox_main: 'vox',
  kisskh_main: 'kisskh',
  bravo_main: 'bravo',
  vostfr_main: 'vostfr',
  frembed_main: 'frembed',
  mp4: 'mp4',
  custom: 'custom',
};

const DEPRECATED_SOURCE_ID_SET: ReadonlySet<string> = new Set(DEPRECATED_SOURCE_IDS);

/**
 * Id épinglable pour une source, ou `null`.
 *
 * Les sources dépréciées ne figurent plus dans l'UI de priorité : les épingler
 * produirait une préférence que `mergeWithDefaults` retirerait au chargement
 * suivant.
 */
export function pinnableTopLevelId(sourceType: string): TopLevelSourceId | null {
  const id = SOURCE_MAIN_TO_TOP_LEVEL[sourceType];
  if (!id || DEPRECATED_SOURCE_ID_SET.has(id)) return null;
  return id;
}
