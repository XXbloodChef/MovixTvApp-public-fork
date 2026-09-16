/**
 * Panneau de réglages du lecteur, version téléviseur (drill-down).
 *
 * Coquille mince autour du kit `player/settings` : elle ne dessine rien
 * elle-même et ne monte rien du panneau souris. `PlayerSettingsNav` rend le
 * niveau 1 et toutes les sections, natives, à partir du registre.
 *
 * Ce qui reste ici, c'est de l'adaptation : donner aux sections Source et
 * Sous-titres des formes normalisées (`sourceTree`, `subtitleSearch`,
 * `subtitleAppearance`) construites à partir des props du lecteur et de
 * l'état que `useSettingsPanelTabs` porte pour les deux panneaux — filtres de
 * recherche, épingles, listes triées. Un seul état, deux interfaces.
 *
 * Montée par HLSPlayer à la place de `HLSPlayerSettingsPanel` quand
 * `isTvPlayback` est vrai, avec le même sac de props. `isTvPlayback` ne change
 * pas au cours d'une lecture : les deux panneaux ne se remplacent jamais à
 * chaud.
 */
import React, { useCallback, useMemo } from 'react';
import { pinSource, unpinSource } from '../utils/sourcePriorityPrefs';
import type { TopLevelSourceId } from '../types/sourcePriority';
import type { SubtitleTrack } from '../services/subtitles/index.ts';
import {
  TRANSLATION_LANGS,
  useSettingsPanelTabs,
  type HLSPlayerSettingsPanelProps,
} from './HLSPlayerSettingsPanel';
import { PlayerSettingsNav } from './player/settings/PlayerSettingsNav';
import {
  stripLeadingPictograms,
  useSubtitlePreviewQueue,
  type SubtitleAppearanceModel,
  type SubtitleSearchModel,
} from './player/settings/playerSubtitleSection';
import { useSourceTree } from './player/settings/useSourceTree';

const identity = (url: string) => url;

/** Résultats par page à la télécommande : chaque ligne se parcourt à la flèche. */
const TV_SUBTITLE_RESULT_PAGE_SIZE = 20;

const HLSPlayerSettingsPanelTv = (props: HLSPlayerSettingsPanelProps) => {
  const {
    settingsMenuRef,
    setShowSettings,
    sourceGroups,
    darkinoSources,
    nexusHlsSources,
    nexusFileSources,
    viperSources,
    voxSources,
    purstreamSources,
    fstreamSources,
    coflixSources,
    omegaSources,
    wiflixSources,
    j1fSources,
    swiftflowSources,
    rivestreamSources,
    src,
    embedUrl,
    embedType,
    handleSourceChange,
    getOriginalUrl,
    getCoflixPreferredUrl,
    getSourceQualityLabel,
    hlsQualityScan,
    loadingRivestream,
    loadingKisskh,
    // Sous-titres externes
    movieId,
    tvShowId,
    seasonNumber,
    episodeNumber,
    externalTracks,
    externalLoading,
    externalProviderErrors,
    selectedExternalSub,
    loadExternalSubtitle,
    loadingSubtitle,
    // Apparence des sous-titres
    subtitlePreferences,
    patchSubtitlePreferences,
    previewSubtitlePreferences,
    commitSubtitlePreferences,
    cancelSubtitlePreview,
    resetSubtitleAppearance,
    isTvPlayback,
  } = props;

  // Même modèle que le panneau souris : filtres de sous-titres, épingles,
  // listes triées. Seule la page de résultats diffère.
  const { sources, subtitleSearch, animationsDisabled } = useSettingsPanelTabs(
    useMemo(() => ({ ...props, subtitleResultPageSize: TV_SUBTITLE_RESULT_PAGE_SIZE }), [props]),
  );

  // ── Source ───────────────────────────────────────────────────────────────

  /**
   * Épingle top-level. Le panneau souris l'écrit en ligne dans l'onglet des
   * sources ; ici l'arbre normalisé attend un callback.
   */
  const toggleSourcePin = useCallback(
    (id: TopLevelSourceId) => {
      if (sources.pinnedSourceId === id) unpinSource();
      else pinSource(id);
    },
    [sources.pinnedSourceId],
  );

  // Comme dans le panneau souris, l'épingle top-level n'existe qu'en
  // Films/Séries : côté anime, la langue est gérée dans WatchAnime.
  const pinTopLevel = sources.category === 'moviesTv';

  /**
   * Arbre des sources normalisé pour la section Source du kit.
   *
   * Les listes triées ET les listes d'origine sont passées : l'affichage suit
   * les premières, mais `handleSourceChange` relit les secondes à l'index qu'on
   * lui donne. `useSourceTree` fait la correspondance (cf. son mécanisme
   * `origins`) — c'est lui qui connaît les quinze `source_main`, pas cette
   * coquille.
   */
  const sourceTree = useSourceTree({
    sourceGroups,
    sorted: sources.sorted,
    darkinoSources,
    nexusHlsSources,
    nexusFileSources,
    viperSources,
    voxSources,
    purstreamSources,
    fstreamSources,
    coflixSources,
    omegaSources,
    wiflixSources,
    j1fSources,
    swiftflowSources,
    rivestreamSources,

    src,
    embedUrl,
    embedType,
    handleSourceChange,
    // fstream compare `getOriginalUrl(embedUrl)` à `decoded_url`. HLSPlayer ne
    // fournit pas cette fonction ; l'identité reproduit la comparaison du
    // panneau souris (`embedUrl === decoded_url`). Sans elle, aucun lien
    // fstream ne s'afficherait jamais comme actif.
    getOriginalUrl: getOriginalUrl ?? identity,
    getCoflixPreferredUrl,
    getSourceQualityLabel,
    detectHosterFromUrl: sources.detectHosterFromUrl,

    pinnedSourceId: pinTopLevel ? sources.pinnedSourceId : null,
    pinnedHosterId: sources.pinnedHosterId,
    onToggleSourcePin: pinTopLevel ? toggleSourcePin : undefined,
    onToggleHosterPin: sources.toggleHosterPin,

    probing: hlsQualityScan?.status === 'running',
    loadingRivestream,
    loadingKisskh,
  });

  // ── Sous-titres : recherche externe ──────────────────────────────────────

  const contextLabel = useMemo(() => {
    if (tvShowId && seasonNumber && episodeNumber) return `S${seasonNumber} · E${episodeNumber}`;
    if (movieId) {
      // « 🎬 Film » à la souris ; le pictogramme n'a pas de glyphe sur téléviseur.
      const label = props.t?.('watch.filmLabel');
      return label && label !== 'watch.filmLabel' ? stripLeadingPictograms(String(label)) : 'Film';
    }
    return null;
  }, [tvShowId, seasonNumber, episodeNumber, movieId, props.t]);

  const searchModel = useMemo<SubtitleSearchModel>(() => ({
    available: Boolean(movieId || (tvShowId && seasonNumber && episodeNumber)),
    contextLabel,
    loading: Boolean(externalLoading),
    providerErrors: externalProviderErrors ?? [],
    filters: subtitleSearch.filters,
    setFilters: subtitleSearch.setFilters,
    facets: subtitleSearch.facets,
    results: subtitleSearch.results,
    totalCount: (externalTracks ?? []).length,
    visibleCount: subtitleSearch.visibleCount,
    showMore: subtitleSearch.showMore,
    selectedId: selectedExternalSub?.id ?? null,
    load: (track: SubtitleTrack) => loadExternalSubtitle?.(track),
    loadingTrack: Boolean(loadingSubtitle),
  }), [
    movieId, tvShowId, seasonNumber, episodeNumber, contextLabel,
    externalLoading, externalProviderErrors, externalTracks,
    subtitleSearch, selectedExternalSub, loadExternalSubtitle, loadingSubtitle,
  ]);

  // ── Sous-titres : apparence ──────────────────────────────────────────────

  const previewQueue = useSubtitlePreviewQueue({
    preview: previewSubtitlePreferences,
    commit: commitSubtitlePreferences,
    cancel: cancelSubtitlePreview,
  });

  const appearanceModel = useMemo<SubtitleAppearanceModel>(() => ({
    preferences: subtitlePreferences,
    patch: patchSubtitlePreferences,
    previewLive: previewQueue.previewLive,
    adjust: previewQueue.adjust,
    flush: previewQueue.flush,
    cancel: previewQueue.cancel,
    reset: resetSubtitleAppearance,
    tv: Boolean(isTvPlayback),
  }), [subtitlePreferences, patchSubtitlePreferences, previewQueue, resetSubtitleAppearance, isTvPlayback]);

  // ── Montage ──────────────────────────────────────────────────────────────

  const handleClose = useCallback(() => setShowSettings(false), [setShowSettings]);

  return (
    <PlayerSettingsNav
      // Les formes normalisées rejoignent le contexte, à côté des props du
      // lecteur : le registre les lit sous `ctx.sourceTree`,
      // `ctx.subtitleSearch`, `ctx.subtitleAppearance`, `ctx.translationLanguages`.
      ctx={{
        ...props,
        sourceTree,
        subtitleSearch: searchModel,
        subtitleAppearance: appearanceModel,
        translationLanguages: TRANSLATION_LANGS,
      }}
      containerRef={settingsMenuRef}
      // `tvMode` du lecteur reste prioritaire sur la détection globale ; sans
      // lui, `PlayerSettingsNav` interroge `isTvDevice()` de lui-même.
      isTv={isTvPlayback}
      animationsDisabled={animationsDisabled}
      onClose={handleClose}
    />
  );
};

export default React.memo(HLSPlayerSettingsPanelTv);
