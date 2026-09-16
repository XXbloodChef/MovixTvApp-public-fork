import { useCallback, useEffect, useRef } from 'react';
import { Languages, Palette, RotateCcw, Search } from 'lucide-react';
import type { SettingsRowDescriptor } from './PlayerSettingsRow';
import type { SectionLevel, SettingsContext } from './playerSettingsSections';
import {
  DEFAULT_SUBTITLE_PREFERENCES,
  formatSubtitleDelay,
  SUBTITLE_AUTO_FONT_SIZE_PX,
  SUBTITLE_COLOR_OPTIONS,
  SUBTITLE_DELAY_MAX,
  SUBTITLE_DELAY_MIN,
  SUBTITLE_DELAY_STEP,
  SUBTITLE_EDGE_OPTIONS,
  SUBTITLE_FONT_OPTIONS,
  SUBTITLE_FONT_SIZE_PRESETS_PX,
  SUBTITLE_WEIGHT_OPTIONS,
  type SubtitleEdgeStyle,
  type SubtitleFontFamily,
  type SubtitlePreferencePatch,
  type SubtitlePreferences,
} from '@/utils/subtitlePreferences';
import type { SubtitleFacets, SubtitleFilters, SubtitleTrack } from '@/services/subtitles/index.ts';

/**
 * Section Sous-titres — niveaux 2 à 4.
 *
 * Tout ce que l'onglet souris propose, en lignes du kit : décalage, taille,
 * pistes, recherche externe, traduction, apparence. Deux choses n'ont pas
 * d'équivalent télécommande et restent souris : la recherche par texte libre
 * (les filtres langue + source suffisent) et la couleur hexadécimale
 * personnalisée.
 *
 * Comme pour Source, la section ne connaît ni HLSPlayer ni le hook du
 * panneau : elle lit des formes normalisées que la coquille TV pose dans le
 * contexte (`subtitleSearch`, `subtitleAppearance`, `translationLanguages`),
 * à côté des props existantes du lecteur.
 *
 * Aperçu en direct : la vidéo défile derrière le panneau et les sous-titres
 * sont au centre. Les sliders prévisualisent à chaque pas et valident un peu
 * après le dernier ; les listes (taille, couleur, police) prévisualisent au
 * focus et ne valident qu'à la sélection — Retour sans choisir annule.
 */

// ---------------------------------------------------------------------------
// Contrat posé dans le contexte par la coquille
// ---------------------------------------------------------------------------

export interface SubtitleSearchModel {
  /** Un film ou un épisode est identifié : la recherche a un sens. */
  available: boolean;
  /** « S1 · E3 », « Film ». */
  contextLabel: string | null;
  loading: boolean;
  providerErrors: ReadonlyArray<{ provider: string; message: string }>;
  filters: SubtitleFilters;
  setFilters: (patch: Partial<SubtitleFilters>) => void;
  facets: SubtitleFacets;
  /** Résultats après filtres. */
  results: readonly SubtitleTrack[];
  /** Résultats avant filtres — distingue « rien trouvé » de « rien avec ces filtres ». */
  totalCount: number;
  visibleCount: number;
  showMore: () => void;
  /** Id du sous-titre externe chargé, s'il y en a un. */
  selectedId: string | null;
  load: (track: SubtitleTrack) => void;
  /** Un sous-titre est en cours de chargement. */
  loadingTrack: boolean;
}

export interface SubtitleAppearanceModel {
  preferences: SubtitlePreferences;
  /** Applique et persiste tout de suite (choix discrets). */
  patch: (patch: SubtitlePreferencePatch) => void;
  /** Montre sans persister (aperçu au focus). `cancel` ou `patch` doit suivre. */
  previewLive: (patch: SubtitlePreferencePatch) => void;
  /** Montre tout de suite, persiste un peu après le dernier appel (sliders). */
  adjust: (patch: SubtitlePreferencePatch) => void;
  /** Persiste immédiatement ce qu'`adjust` a laissé en attente. */
  flush: () => void;
  /** Abandonne l'aperçu : l'écran revient à l'état persisté. */
  cancel: () => void;
  reset: () => void;
  /** Téléviseur : la base « auto » est plus grande. */
  tv: boolean;
}

export interface TranslationLanguage {
  code: string;
}

// ---------------------------------------------------------------------------
// File d'aperçu différé — le hook que la coquille appelle pour fabriquer
// `previewLive` / `adjust` / `flush` / `cancel` à partir du hook des
// préférences.
// ---------------------------------------------------------------------------

export interface SubtitlePreviewHandlers {
  preview: (patch: SubtitlePreferencePatch) => void;
  commit: () => void;
  cancel: () => void;
}

/**
 * Une télécommande maintenue répète la touche : sans file, chaque pas de
 * slider écrirait localStorage et émettrait l'événement de changement. On
 * prévisualise à chaque pas et on valide 160 ms après le dernier — le même
 * délai que les boutons ± du panneau souris.
 */
export function useSubtitlePreviewQueue(
  handlers: SubtitlePreviewHandlers,
  delayMs = 160,
): Pick<SubtitleAppearanceModel, 'previewLive' | 'adjust' | 'flush' | 'cancel'> {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const timerRef = useRef<number | null>(null);

  const clearTimer = () => {
    if (timerRef.current === null) return;
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  const previewLive = useCallback((patch: SubtitlePreferencePatch) => {
    handlersRef.current.preview(patch);
  }, []);

  const adjust = useCallback(
    (patch: SubtitlePreferencePatch) => {
      handlersRef.current.preview(patch);
      clearTimer();
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        handlersRef.current.commit();
      }, delayMs);
    },
    [delayMs],
  );

  const flush = useCallback(() => {
    if (timerRef.current === null) return;
    clearTimer();
    handlersRef.current.commit();
  }, []);

  const cancel = useCallback(() => {
    clearTimer();
    handlersRef.current.cancel();
  }, []);

  // Démontage pendant une file en cours (fermeture du panneau) : on valide,
  // le réglage était voulu.
  useEffect(() => () => {
    if (timerRef.current === null) return;
    clearTimer();
    handlersRef.current.commit();
  }, []);

  return { previewLive, adjust, flush, cancel };
}

// ---------------------------------------------------------------------------
// Aides
// ---------------------------------------------------------------------------

type Nav = { push: (segment: string) => void; pop: () => void };

/**
 * Certains libellés du panneau souris commencent par un pictogramme (📺, 🎬,
 * ℹ️) que les polices de téléviseur rendent en carré. Plages explicites plutôt
 * que `\p{Extended_Pictographic}` : cette propriété manque aux Chromium des
 * téléviseurs de 2018-2019, et un `\p{…}` inconnu casse le module entier au
 * chargement.
 */
export const stripLeadingPictograms = (value: string): string =>
  value.replace(/^(?:[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u2139\uFE0F\u200D]|\s)+/u, '');

const tr = (ctx: SettingsContext, key: string, fallback: string, vars?: Record<string, unknown>): string => {
  const value = vars ? ctx.t?.(key, vars) : ctx.t?.(key);
  if (!value || value === key) return fallback;
  return stripLeadingPictograms(String(value));
};

/**
 * Texte d'un nœud React : `getLanguageName` du lecteur renvoie un fragment
 * (drapeau + nom), pas une chaîne. `String(node)` donnerait « [object Object] »
 * sur chaque ligne de piste — mesuré sur la TV le 12/09/2026. On ne garde que
 * les chaînes, le drapeau n'a pas de glyphe sur téléviseur de toute façon.
 */
const reactNodeText = (node: unknown): string => {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(reactNodeText).join('');
  if (typeof node === 'object' && 'props' in (node as object)) {
    return reactNodeText((node as { props?: { children?: unknown } }).props?.children);
  }
  return '';
};

const langName = (ctx: SettingsContext, code: string | null | undefined): string => {
  if (!code) return '';
  const name = reactNodeText(ctx.getLanguageName?.(code)).trim();
  return name && name !== code ? name : code.toUpperCase();
};

/**
 * Langue d'une piste : celle qu'elle déclare, sinon celle devinée par le
 * lecteur dans le texte des cues (sous-titres incrustés, cf. HLSPlayer
 * `embeddedLanguageHints`). `detected` vrai dans le second cas.
 */
const trackLanguage = (ctx: SettingsContext, track: { label?: string; language?: string }): { code: string; detected: boolean } => {
  if (track.language) return { code: track.language, detected: false };
  const hint = ctx.embeddedLanguageHints?.[track.label ?? ''];
  return hint ? { code: String(hint), detected: true } : { code: '', detected: false };
};

const trackLanguageLabel = (ctx: SettingsContext, track: { label?: string; language?: string }): string => {
  const { code, detected } = trackLanguage(ctx, track);
  const name = langName(ctx, code);
  if (!name) return '';
  return detected ? tr(ctx, 'watch.detectedLanguage', `${name} (détecté)`, { lang: name }) : name;
};

const search = (ctx: SettingsContext): SubtitleSearchModel | null =>
  ctx.subtitleSearch && typeof ctx.subtitleSearch === 'object' ? (ctx.subtitleSearch as SubtitleSearchModel) : null;

const appearance = (ctx: SettingsContext): SubtitleAppearanceModel | null =>
  ctx.subtitleAppearance && typeof ctx.subtitleAppearance === 'object'
    ? (ctx.subtitleAppearance as SubtitleAppearanceModel)
    : null;

const translationLanguages = (ctx: SettingsContext): TranslationLanguage[] =>
  Array.isArray(ctx.translationLanguages) ? (ctx.translationLanguages as TranslationLanguage[]) : [];

const translationLangLabel = (ctx: SettingsContext, code: string): string =>
  tr(ctx, `watch.translationLanguages.${code}`, langName(ctx, code));

const fontSizeLabel = (ctx: SettingsContext, model: SubtitleAppearanceModel): string => {
  const { preferences, tv } = model;
  if (preferences.fontSizeMode === 'auto') {
    const px = tv ? SUBTITLE_AUTO_FONT_SIZE_PX.tv : preferences.fontSizePx;
    return `${tr(ctx, 'settings.subtitles.auto', 'Auto')} · ${px} px`;
  }
  return `${preferences.fontSizePx} px`;
};

const colorLabel = (ctx: SettingsContext, hex: string): string => {
  const option = SUBTITLE_COLOR_OPTIONS.find(candidate => candidate.color === hex.toLowerCase());
  return option ? tr(ctx, option.labelKey, hex) : hex;
};

const fontLabel = (ctx: SettingsContext, family: SubtitleFontFamily): string => {
  const option = SUBTITLE_FONT_OPTIONS.find(candidate => candidate.value === family);
  return option ? tr(ctx, option.labelKey, family) : family;
};

// ---------------------------------------------------------------------------
// Niveau 1 : valeur affichée à côté de « Sous-titres »
// ---------------------------------------------------------------------------

export function summariseSubtitles(ctx: SettingsContext): string | null {
  const current: string = typeof ctx.currentSubtitle === 'string' ? ctx.currentSubtitle : 'off';
  if (!current || current === 'off') return tr(ctx, 'common.disabled', 'Désactivés');

  const internal = /^internal:(\d+)$/.exec(current);
  if (internal) {
    const track = (ctx.subtitles ?? [])[Number(internal[1])];
    if (!track) return null;
    return track.label || trackLanguageLabel(ctx, track) || null;
  }

  const translated = /^translated:(.+)$/.exec(current);
  if (translated) {
    const entry = (ctx.translatedSubtitleHistory ?? []).find((item: any) => item.id === translated[1]);
    return entry ? langName(ctx, entry.targetLanguage) : null;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Niveau 2 : la section
// ---------------------------------------------------------------------------

function buildRoot(ctx: SettingsContext, nav: Nav): SectionLevel {
  const rows: SettingsRowDescriptor[] = [];
  const current: string = typeof ctx.currentSubtitle === 'string' ? ctx.currentSubtitle : 'off';
  const delay = Number(ctx.subtitleDelay ?? 0);
  const model = appearance(ctx);
  const searchModel = search(ctx);

  // Le décalage en tête : c'est le réglage qu'on touche *pendant* la lecture.
  rows.push({
    kind: 'slider',
    id: 'subtitles:delay',
    label: tr(ctx, 'watch.timeOffset', 'Décalage temporel'),
    value: delay,
    min: SUBTITLE_DELAY_MIN,
    max: SUBTITLE_DELAY_MAX,
    step: SUBTITLE_DELAY_STEP,
    format: formatSubtitleDelay,
    onChange: value => ctx.setSubtitleDelay?.(value),
  });
  rows.push({
    kind: 'action',
    id: 'subtitles:delay:reset',
    label: tr(ctx, 'watch.subtitleDelayReset', 'Remettre le décalage à zéro'),
    disabled: delay === 0,
    onSelect: () => ctx.setSubtitleDelay?.(0),
  });

  if (model) {
    rows.push({ kind: 'separator', id: 'subtitles:sep:size' });
    rows.push({
      kind: 'nav',
      id: 'subtitles:size',
      label: tr(ctx, 'settings.subtitles.textSize', 'Taille du texte'),
      value: fontSizeLabel(ctx, model),
      onSelect: () => nav.push('size'),
    });
  }

  rows.push({ kind: 'separator', id: 'subtitles:sep:tracks' });
  rows.push({ kind: 'caption', id: 'subtitles:tracks', label: tr(ctx, 'watch.subtitleTrack', 'Piste') });
  rows.push({
    kind: 'choice',
    id: 'subtitles:off',
    label: tr(ctx, 'common.disabled', 'Désactivés'),
    selected: !current || current === 'off',
    onSelect: () => ctx.handleSubtitleChange?.('off'),
  });

  const tracks: any[] = ctx.subtitles ?? [];
  tracks.forEach((track, index) => {
    // Indexé, pas par langue : deux pistes peuvent partager une langue
    // (« Français (forced) » + « Français »).
    const id = `internal:${index}`;
    rows.push({
      kind: 'choice',
      id: `subtitles:${id}`,
      label: track.label || trackLanguageLabel(ctx, track) || `${tr(ctx, 'watch.subtitleTrack', 'Piste')} ${index + 1}`,
      sublabel: track.label ? trackLanguageLabel(ctx, track) || undefined : undefined,
      selected: current === id,
      onSelect: () => ctx.handleSubtitleChange?.(id),
    });
  });

  const history: any[] = ctx.translatedSubtitleHistory ?? [];
  history.forEach(entry => {
    rows.push({
      kind: 'choice',
      id: `subtitles:translated:${entry.id}`,
      label: `${langName(ctx, entry.sourceLanguage)} → ${langName(ctx, entry.targetLanguage)}`,
      sublabel: entry.sourceLabel || undefined,
      selected: current === `translated:${entry.id}` || ctx.activeTranslatedSubtitleId === entry.id,
      onSelect: () => ctx.activateTranslatedSubtitle?.(entry.id),
    });
  });

  if (tracks.length === 0 && history.length === 0) {
    rows.push({
      kind: 'caption',
      id: 'subtitles:none',
      label: tr(ctx, 'watch.noBuiltInSubtitles', 'Aucun sous-titre intégré'),
    });
  }

  rows.push({ kind: 'separator', id: 'subtitles:sep:more' });

  if (searchModel) {
    rows.push({
      kind: 'nav',
      id: 'subtitles:search',
      icon: Search,
      label: tr(ctx, 'watch.externalSubtitles', 'Sous-titres externes'),
      value: searchValue(ctx, searchModel),
      onSelect: () => nav.push('search'),
    });
  }

  rows.push({
    kind: 'nav',
    id: 'subtitles:translate',
    icon: Languages,
    label: tr(ctx, 'watch.translateSubtitles', 'Traduction'),
    value: translateValue(ctx),
    onSelect: () => nav.push('translate'),
  });

  if (model) {
    rows.push({ kind: 'separator', id: 'subtitles:sep:appearance' });
    rows.push({
      kind: 'nav',
      id: 'subtitles:appearance',
      icon: Palette,
      label: tr(ctx, 'watch.subtitleAppearance', 'Apparence'),
      value: fontLabel(ctx, model.preferences.fontFamily),
      onSelect: () => nav.push('appearance'),
    });
  }

  return { title: tr(ctx, 'watch.subtitlesTab', 'Sous-titres'), rows };
}

const searchValue = (ctx: SettingsContext, model: SubtitleSearchModel): string | undefined => {
  if (!model.available) return undefined;
  if (model.loading) return tr(ctx, 'watch.searchingSubtitles', 'Recherche…');
  if (model.totalCount === 0) return undefined;
  return tr(ctx, 'watch.resultsCount', `${model.results.length} résultats`, { count: model.results.length });
};

const translateValue = (ctx: SettingsContext): string | undefined => {
  const progress = ctx.translationProgress;
  if (progress) return `${progress.done}/${progress.total}`;
  if (ctx.translationLang) return translationLangLabel(ctx, String(ctx.translationLang));
  if (ctx.translateSubsTo) return translationLangLabel(ctx, String(ctx.translateSubsTo));
  return tr(ctx, 'watch.noTranslation', 'Désactivé');
};

// ---------------------------------------------------------------------------
// Niveau 3 : taille du texte — liste courte, aperçu au focus
// ---------------------------------------------------------------------------

function buildSizeLevel(ctx: SettingsContext, model: SubtitleAppearanceModel): SectionLevel {
  const { preferences, tv } = model;
  const autoPatch: SubtitlePreferencePatch = {
    fontSizeMode: 'auto',
    fontSizePx: DEFAULT_SUBTITLE_PREFERENCES.fontSizePx,
  };
  const rows: SettingsRowDescriptor[] = [
    {
      kind: 'choice',
      id: 'size:auto',
      label: tr(ctx, 'settings.subtitles.auto', 'Auto'),
      sublabel: `${tv ? SUBTITLE_AUTO_FONT_SIZE_PX.tv : SUBTITLE_AUTO_FONT_SIZE_PX.desktop} px`,
      selected: preferences.fontSizeMode === 'auto',
      onFocus: () => model.previewLive(autoPatch),
      onSelect: () => model.patch(autoPatch),
    },
  ];

  const sizes = [...SUBTITLE_FONT_SIZE_PRESETS_PX];
  // Une valeur réglée finement à la souris (26 px) reste visible et
  // sélectionnée ici, sans devenir un preset.
  if (preferences.fontSizeMode === 'manual' && !sizes.includes(preferences.fontSizePx)) {
    sizes.push(preferences.fontSizePx);
    sizes.sort((a, b) => a - b);
  }

  sizes.forEach(px => {
    const patch: SubtitlePreferencePatch = { fontSizeMode: 'manual', fontSizePx: px };
    rows.push({
      kind: 'choice',
      id: `size:${px}`,
      label: `${px} px`,
      selected: preferences.fontSizeMode === 'manual' && preferences.fontSizePx === px,
      onFocus: () => model.previewLive(patch),
      onSelect: () => model.patch(patch),
    });
  });

  return {
    title: tr(ctx, 'settings.subtitles.textSize', 'Taille du texte'),
    rows,
    // Retour sans choisir : l'aperçu posé par le focus est abandonné.
    onLeave: model.cancel,
  };
}

// ---------------------------------------------------------------------------
// Niveau 3 : recherche externe, et ses deux filtres au niveau 4
// ---------------------------------------------------------------------------

function buildSearchLevel(ctx: SettingsContext, model: SubtitleSearchModel, nav: Nav): SectionLevel {
  const title = tr(ctx, 'watch.externalSubtitles', 'Sous-titres externes');
  const rows: SettingsRowDescriptor[] = [];

  if (!model.available) {
    rows.push({
      kind: 'caption',
      id: 'search:unavailable',
      label: tr(ctx, 'watch.selectContentForSubs', 'Sélectionnez un film ou une série pour charger les sous-titres'),
    });
    return { title, rows };
  }

  if (model.contextLabel) {
    rows.push({ kind: 'caption', id: 'search:context', label: model.contextLabel });
  }
  model.providerErrors.forEach(error => {
    rows.push({
      kind: 'caption',
      id: `search:error:${error.provider}`,
      label: tr(ctx, 'watch.sourceUnavailable', `${error.provider} n'a pas répondu`, { provider: error.provider }),
    });
  });

  const langOption = model.facets.languages.find(option => option.value === model.filters.lang);
  const sourceOption = model.facets.sources.find(option => option.value === model.filters.source);
  const withCount = (label: string, count: number | undefined) =>
    count === undefined ? label : `${label} · ${count}`;

  rows.push({
    kind: 'nav',
    id: 'search:lang',
    label: tr(ctx, 'watch.chooseLanguage', 'Langue'),
    value: withCount(
      model.filters.lang === 'all'
        ? tr(ctx, 'watch.filterAllLanguages', 'Toutes les langues')
        : langName(ctx, model.filters.lang),
      langOption?.count,
    ),
    onSelect: () => nav.push('lang'),
  });
  rows.push({
    kind: 'nav',
    id: 'search:source',
    label: tr(ctx, 'watch.filterBySource', 'Source'),
    value: withCount(
      model.filters.source === 'all'
        ? tr(ctx, 'watch.filterAllSources', 'Toutes les sources')
        : model.filters.source,
      sourceOption?.count,
    ),
    onSelect: () => nav.push('source'),
  });

  rows.push({ kind: 'separator', id: 'search:sep' });

  if (model.loading) {
    rows.push({ kind: 'caption', id: 'search:loading', label: tr(ctx, 'watch.searchingSubtitles', 'Recherche de sous-titres…') });
  } else if (model.totalCount === 0) {
    rows.push({
      kind: 'caption',
      id: 'search:empty',
      label: tr(ctx, 'watch.noExternalSubtitlesAvailable', 'Aucun sous-titre externe disponible pour ce contenu.'),
    });
  } else if (model.results.length === 0) {
    rows.push({ kind: 'caption', id: 'search:noresult', label: tr(ctx, 'watch.noResultsForFilters', 'Aucun résultat pour ces filtres.') });
  } else {
    rows.push({
      kind: 'caption',
      id: 'search:results',
      label: `${tr(ctx, 'watch.subtitleResults', 'Résultats')} · ${model.results.length}`,
    });
    model.results.slice(0, model.visibleCount).forEach(track => {
      const meta = [
        langName(ctx, track.lang),
        track.format,
        track.source,
        track.downloads != null ? `${track.downloads} DL` : null,
      ].filter(Boolean).join(' · ');
      rows.push({
        kind: 'choice',
        id: `search:track:${track.id}`,
        label: track.label,
        sublabel: meta,
        selected: model.selectedId === track.id,
        onSelect: () => model.load(track),
      });
    });
    if (model.results.length > model.visibleCount) {
      rows.push({
        kind: 'action',
        id: 'search:more',
        label: tr(ctx, 'watch.showMoreResults', 'Afficher plus de résultats'),
        onSelect: model.showMore,
      });
    }
  }

  if (model.loadingTrack) {
    rows.push({ kind: 'caption', id: 'search:loadingTrack', label: tr(ctx, 'watch.loadingSubtitle', 'Chargement du sous-titre…') });
  }

  return { title, rows };
}

function buildSearchFilterLevel(
  ctx: SettingsContext,
  model: SubtitleSearchModel,
  dimension: 'lang' | 'source',
  nav: Nav,
): SectionLevel {
  const isLang = dimension === 'lang';
  const options = isLang ? model.facets.languages : model.facets.sources;
  const currentValue = isLang ? model.filters.lang : model.filters.source;

  const rows: SettingsRowDescriptor[] = options.map(option => ({
    kind: 'choice' as const,
    id: `filter:${dimension}:${option.value}`,
    label: option.value === 'all'
      ? tr(ctx, isLang ? 'watch.filterAllLanguages' : 'watch.filterAllSources', isLang ? 'Toutes les langues' : 'Toutes les sources')
      : isLang ? langName(ctx, option.value) : option.value,
    badge: String(option.count),
    selected: currentValue === option.value,
    onSelect: () => {
      model.setFilters(isLang ? { lang: option.value } : { source: option.value });
      // Un filtre choisi, on revient aux résultats : c'est eux qu'on veut voir.
      nav.pop();
    },
  }));

  return {
    title: tr(ctx, isLang ? 'watch.chooseLanguage' : 'watch.filterBySource', isLang ? 'Langue' : 'Source'),
    rows,
  };
}

// ---------------------------------------------------------------------------
// Niveau 3 : traduction, langue cible au niveau 4
// ---------------------------------------------------------------------------

function buildTranslateLevel(ctx: SettingsContext, nav: Nav): SectionLevel {
  const title = tr(ctx, 'watch.translateSubtitles', 'Traduction des sous-titres');
  const rows: SettingsRowDescriptor[] = [];
  const progress = ctx.translationProgress as { done: number; total: number } | null | undefined;
  const target = ctx.translateSubsTo ? String(ctx.translateSubsTo) : null;

  if (progress) {
    rows.push({
      kind: 'caption',
      id: 'translate:progress',
      label: `${tr(ctx, 'watch.translating', 'Traduction en cours…')} ${progress.done}/${progress.total}`,
    });
    rows.push({
      kind: 'action',
      id: 'translate:cancel',
      label: tr(ctx, 'watch.cancelTranslation', 'Annuler'),
      onSelect: () => ctx.cancelSubtitleTranslation?.(),
    });
  } else if (ctx.translationLang) {
    rows.push({
      kind: 'caption',
      id: 'translate:active',
      label: `${tr(ctx, 'watch.translationActive', 'Traduction active')} · ${translationLangLabel(ctx, String(ctx.translationLang))}`,
    });
    rows.push({
      kind: 'action',
      id: 'translate:stop',
      label: tr(ctx, 'watch.stopTranslation', 'Désactiver la traduction'),
      onSelect: () => ctx.cancelSubtitleTranslation?.(),
    });
  } else if (target) {
    rows.push({
      kind: 'action',
      id: 'translate:start',
      icon: Languages,
      label: tr(ctx, 'watch.translateButton', 'Traduire les sous-titres'),
      onSelect: () => ctx.startSubtitleTranslation?.(),
    });
  }

  rows.push({
    kind: 'nav',
    id: 'translate:target',
    label: tr(ctx, 'watch.translateTo', 'Traduire en'),
    value: target ? translationLangLabel(ctx, target) : tr(ctx, 'watch.noTranslation', 'Désactivé'),
    onSelect: () => nav.push('target'),
  });

  const history: any[] = ctx.translatedSubtitleHistory ?? [];
  if (history.length > 0) {
    rows.push({ kind: 'separator', id: 'translate:sep' });
    rows.push({ kind: 'caption', id: 'translate:history', label: tr(ctx, 'watch.translatedSubtitles', 'Sous-titres traduits') });
    history.forEach(entry => {
      rows.push({
        kind: 'choice',
        id: `translate:entry:${entry.id}`,
        label: `${langName(ctx, entry.sourceLanguage)} → ${langName(ctx, entry.targetLanguage)}`,
        sublabel: entry.sourceLabel || undefined,
        selected: ctx.activeTranslatedSubtitleId === entry.id,
        onSelect: () => ctx.activateTranslatedSubtitle?.(entry.id),
      });
    });
  }

  return { title, rows };
}

function buildTranslateTargetLevel(ctx: SettingsContext, nav: Nav): SectionLevel {
  const target = ctx.translateSubsTo ? String(ctx.translateSubsTo) : null;
  const choose = (code: string | null) => {
    ctx.setTranslateSubsTo?.(code);
    nav.pop();
  };

  const rows: SettingsRowDescriptor[] = [
    {
      kind: 'choice',
      id: 'target:none',
      label: tr(ctx, 'watch.noTranslation', 'Désactivé'),
      selected: !target,
      onSelect: () => choose(null),
    },
    ...translationLanguages(ctx).map(({ code }) => ({
      kind: 'choice' as const,
      id: `target:${code}`,
      label: translationLangLabel(ctx, code),
      selected: target === code,
      onSelect: () => choose(code),
    })),
  ];

  return { title: tr(ctx, 'watch.translateTo', 'Traduire en'), rows };
}

// ---------------------------------------------------------------------------
// Niveau 3 : apparence, et ses listes au niveau 4
// ---------------------------------------------------------------------------

function buildAppearanceLevel(ctx: SettingsContext, model: SubtitleAppearanceModel, nav: Nav): SectionLevel {
  const { preferences: prefs } = model;
  const rows: SettingsRowDescriptor[] = [];
  const px = (value: number) => `${Number(value.toFixed(1))} px`;

  rows.push({
    kind: 'slider',
    id: 'appearance:height',
    label: tr(ctx, 'settings.subtitles.height', 'Hauteur'),
    value: prefs.bottomOffsetPx,
    min: 25,
    max: 900,
    step: 5,
    format: px,
    onChange: bottomOffsetPx => model.adjust({ bottomOffsetPx }),
  });
  // Absent du panneau souris, qui passe par le glisser de l'aperçu.
  rows.push({
    kind: 'slider',
    id: 'appearance:x',
    label: tr(ctx, 'settings.subtitles.horizontalPosition', 'Position horizontale'),
    value: prefs.positionXPercent,
    min: 0,
    max: 100,
    step: 5,
    format: value => (value === 50 ? tr(ctx, 'settings.subtitles.previewAlignedCenter', 'Centre') : `${Math.round(value)} %`),
    onChange: positionXPercent => model.adjust({ positionXPercent }),
  });

  rows.push({ kind: 'separator', id: 'appearance:sep:text' });
  rows.push({
    kind: 'nav',
    id: 'appearance:color',
    label: tr(ctx, 'settings.subtitles.textColor', 'Couleur du texte'),
    value: colorLabel(ctx, prefs.color),
    onSelect: () => nav.push('color'),
  });
  rows.push({
    kind: 'nav',
    id: 'appearance:font',
    label: tr(ctx, 'settings.subtitles.font', 'Police'),
    value: fontLabel(ctx, prefs.fontFamily),
    onSelect: () => nav.push('font'),
  });
  rows.push({
    kind: 'segmented',
    id: 'appearance:weight',
    label: tr(ctx, 'settings.subtitles.weight', 'Gras'),
    options: SUBTITLE_WEIGHT_OPTIONS.map(option => ({
      id: String(option.value),
      label: tr(ctx, option.labelKey, option.value >= 600 ? 'Épaisse' : 'Normale'),
    })),
    // 500 réglé finement à la souris tombe du côté « normale » sans être perdu.
    value: String(prefs.fontWeight >= 600 ? 700 : 400),
    onChange: id => model.patch({ fontWeight: Number(id) }),
  });
  rows.push({
    kind: 'slider',
    id: 'appearance:weightSize',
    label: tr(ctx, 'settings.subtitles.weightSize', 'Épaisseur du texte'),
    value: prefs.fontWeight,
    min: 100,
    max: 900,
    step: 100,
    onChange: fontWeight => model.adjust({ fontWeight }),
  });

  rows.push({ kind: 'separator', id: 'appearance:sep:edge' });
  rows.push({
    kind: 'segmented',
    id: 'appearance:edge',
    label: tr(ctx, 'settings.subtitles.edge', 'Contour'),
    options: SUBTITLE_EDGE_OPTIONS.map(option => ({ id: option.value, label: tr(ctx, option.labelKey, option.value) })),
    value: prefs.edgeStyle,
    onChange: id => model.patch({ edgeStyle: id as SubtitleEdgeStyle }),
  });
  if (prefs.edgeStyle !== 'none') {
    rows.push({
      kind: 'nav',
      id: 'appearance:edgeColor',
      label: tr(ctx, 'settings.subtitles.edgeColor', 'Couleur du contour'),
      value: colorLabel(ctx, prefs.edgeColor),
      onSelect: () => nav.push('edgeColor'),
    });
    rows.push({
      kind: 'slider',
      id: 'appearance:edgeSize',
      label: tr(ctx, 'settings.subtitles.edgeSize', 'Taille du contour'),
      value: prefs.edgeSizePx,
      min: 0.5,
      max: 6,
      step: 0.5,
      format: px,
      onChange: edgeSizePx => model.adjust({ edgeSizePx }),
    });
  }

  rows.push({ kind: 'separator', id: 'appearance:sep:bg' });
  rows.push({
    kind: 'toggle',
    id: 'appearance:bg',
    label: tr(ctx, 'settings.subtitles.background', 'Fond derrière le texte'),
    checked: prefs.backgroundEnabled,
    onToggle: backgroundEnabled => model.patch({ backgroundEnabled }),
  });
  if (prefs.backgroundEnabled) {
    rows.push({
      kind: 'slider',
      id: 'appearance:bgOpacity',
      label: tr(ctx, 'settings.subtitles.backgroundOpacity', 'Opacité du fond'),
      value: prefs.backgroundOpacity,
      min: 0,
      max: 1,
      step: 0.05,
      format: value => `${Math.round(value * 100)} %`,
      onChange: backgroundOpacity => model.adjust({ backgroundOpacity }),
    });
  }

  rows.push({ kind: 'separator', id: 'appearance:sep:reset' });
  rows.push({
    kind: 'action',
    id: 'appearance:reset',
    icon: RotateCcw,
    label: tr(ctx, 'settings.subtitles.resetAll', 'Tout réinitialiser'),
    onSelect: model.reset,
  });

  return {
    title: tr(ctx, 'watch.subtitleAppearance', 'Apparence'),
    rows,
    // Un slider encore en file au moment de quitter : on valide, le réglage
    // était voulu.
    onLeave: model.flush,
  };
}

function buildColorLevel(
  ctx: SettingsContext,
  model: SubtitleAppearanceModel,
  field: 'color' | 'edgeColor',
): SectionLevel {
  const currentHex = model.preferences[field].toLowerCase();
  const options = [...SUBTITLE_COLOR_OPTIONS];
  // Une couleur personnalisée (souris) reste visible et sélectionnée.
  if (!options.some(option => option.color === currentHex)) {
    options.push({ color: currentHex, labelKey: '' });
  }

  const rows: SettingsRowDescriptor[] = options.map(option => {
    const patch: SubtitlePreferencePatch = { [field]: option.color };
    return {
      kind: 'choice' as const,
      id: `${field}:${option.color}`,
      label: option.labelKey ? tr(ctx, option.labelKey, option.color) : option.color,
      selected: currentHex === option.color,
      onFocus: () => model.previewLive(patch),
      onSelect: () => model.patch(patch),
    };
  });

  return {
    title: field === 'color'
      ? tr(ctx, 'settings.subtitles.textColor', 'Couleur du texte')
      : tr(ctx, 'settings.subtitles.edgeColor', 'Couleur du contour'),
    rows,
    onLeave: model.cancel,
  };
}

function buildFontLevel(ctx: SettingsContext, model: SubtitleAppearanceModel): SectionLevel {
  const rows: SettingsRowDescriptor[] = SUBTITLE_FONT_OPTIONS.map(option => {
    const patch: SubtitlePreferencePatch = { fontFamily: option.value };
    return {
      kind: 'choice' as const,
      id: `font:${option.value}`,
      label: tr(ctx, option.labelKey, option.value),
      selected: model.preferences.fontFamily === option.value,
      onFocus: () => model.previewLive(patch),
      onSelect: () => model.patch(patch),
    };
  });
  return { title: tr(ctx, 'settings.subtitles.font', 'Police'), rows, onLeave: model.cancel };
}

// ---------------------------------------------------------------------------
// Point d'entrée appelé par le registre
// ---------------------------------------------------------------------------

/**
 * `subPath` :
 *   []                      → niveau 2
 *   ['size']                → taille du texte
 *   ['search']              → recherche externe ; ['search','lang'|'source'] → filtres
 *   ['translate']           → traduction ; ['translate','target'] → langue cible
 *   ['appearance']          → apparence ; ['appearance','color'|'edgeColor'|'font'] → listes
 */
export function buildSubtitleLevel(
  ctx: SettingsContext,
  subPath: readonly string[],
  nav: Nav,
): SectionLevel {
  const [segment, sub] = subPath;
  const model = appearance(ctx);
  const searchModel = search(ctx);

  switch (segment) {
    case 'size':
      if (model) return buildSizeLevel(ctx, model);
      break;
    case 'search':
      if (!searchModel) break;
      if (sub === 'lang' || sub === 'source') return buildSearchFilterLevel(ctx, searchModel, sub, nav);
      return buildSearchLevel(ctx, searchModel, nav);
    case 'translate':
      if (sub === 'target') return buildTranslateTargetLevel(ctx, nav);
      return buildTranslateLevel(ctx, nav);
    case 'appearance':
      if (!model) break;
      if (sub === 'color' || sub === 'edgeColor') return buildColorLevel(ctx, model, sub);
      if (sub === 'font') return buildFontLevel(ctx, model);
      return buildAppearanceLevel(ctx, model, nav);
    default:
      break;
  }
  return buildRoot(ctx, nav);
}
