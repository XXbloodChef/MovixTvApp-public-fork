import { useMemo } from 'react';
import { pinnableTopLevelId, type HosterId, type TopLevelSourceId } from '@/types/sourcePriority';
import type { SourceLink, SourceProvider } from './playerSourceSection';
import { detectSourceLanguage, type SourceLanguage } from './sourceLanguage';
import { injectsAds } from '@/utils/sourceAdRisk';

/**
 * Adaptateur des sources existantes vers la forme normalisée du panneau.
 *
 * Toute la connaissance tordue du catalogue est ici, et nulle part ailleurs :
 * chaque fournisseur a son champ d'URL (`url`, `link`, `m3u8`, `decoded_url`),
 * son champ de libellé (`label`, `player`, `name`, `quality`), et son propre
 * test d'activité — les sources HLS se comparent à `src`, les embeds à
 * `embedUrl` **et** `embedType`. Aplatir ça dans un seul tableau déclaratif
 * évite les treize branches copiées-collées du bloc historique.
 */

type Item = Record<string, any>;

/** Contexte interne : l'entrée publique, plus ce que la boucle a pré-calculé. */
type AdapterContext = SourceTreeInput & { vostfrEntries: Item[] };

interface ProviderSpec {
  /** Segment de chemin et clé d'épinglage : `['source', 'fstream']`. */
  id: string;
  /** `SourceOption.type` de l'entrée top-level dans `sourceGroups`. */
  mainType: string;
  /** Premier argument de `handleSourceChange` pour les enfants. */
  childType: string;
  /** Nom affiché. Remplace le libellé i18n, qui embarque un compteur et un emoji. */
  displayName: string;
  /** `hls` compare à `src`, `embed` compare à `embedUrl` + `embedType`. */
  kind: 'hls' | 'embed';
  /** Précision courte sous le nom. */
  note?: string;
  /**
   * Id d'épinglage, quand `pinnableTopLevelId(mainType)` ne convient pas.
   * `null` explicite = source non épinglable.
   */
  pinId?: TopLevelSourceId | null;
  list: (ctx: AdapterContext) => Item[];
  /**
   * Listes d'origine, avec le type de lecture de chacune.
   *
   * C'est le point le plus délicat de l'adaptateur, et il est invisible à la
   * lecture : `handleSourceChange` ignore l'URL qu'on lui passe et relit la
   * liste NON triée à l'index encodé dans l'identifiant. Or `list` renvoie la
   * liste triée par priorités. L'ancien menu passait l'index de la liste
   * triée : dès que le tri déplaçait une ligne, on lançait un autre hébergeur
   * que celui cliqué.
   *
   * Plusieurs entrées quand un fournisseur fusionne des listes à l'affichage —
   * Nexus mêle flux et fichiers, qui ne passent pas par le même type.
   *
   * Absent quand la liste affichée EST la liste d'origine.
   */
  origins?: (ctx: AdapterContext) => Array<{ childType: string; raw: Item[] }>;
  url: (item: Item) => string;
  label: (item: Item, index: number) => string;
  /** Langue déclarée par la source, quand elle existe. */
  language?: (item: Item) => string | undefined;
  /**
   * Certains embeds encodent l'URL courante : fstream compare
   * `getOriginalUrl(embedUrl)` au lieu de `embedUrl`.
   */
  matchesEmbed?: (item: Item, ctx: AdapterContext) => boolean;
}

const first = (...values: unknown[]): string => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value;
  }
  return '';
};

const PROVIDERS: ProviderSpec[] = [
  {
    id: 'darkino',
    mainType: 'darkino_main',
    childType: 'darkino',
    displayName: 'Darkino',
    kind: 'hls',
    list: ctx => ctx.sorted.darkino ?? [],
    origins: ctx => [{ childType: 'darkino', raw: ctx.darkinoSources ?? [] }],
    url: item => first(item.m3u8, item.url),
    label: (item, index) => first(item.label, item.quality) || `Lien ${index + 1}`,
  },
  {
    id: 'nexus_hls',
    mainType: 'nexus_main',
    childType: 'nexus_hls',
    displayName: 'Nexus',
    kind: 'hls',
    note: 'avance rapide',
    // `SOURCE_MAIN_TO_TOP_LEVEL` ne mappe pas `nexus_main` : l'agrégat
    // flux + fichier était ambigu, donc non épinglable. En fusionnant les deux
    // listes sous un seul fournisseur, l'ambiguïté disparaît — `nexus_hls` est
    // un id valide, et `nexus_file` est déprécié de toute façon.
    pinId: 'nexus_hls',
    // Les deux listes Nexus sont fusionnées à l'affichage : l'utilisateur ne
    // distingue pas un flux d'un fichier, il veut un lien qui marche.
    list: ctx => [...(ctx.sorted.nexusHls ?? []), ...(ctx.sorted.nexusFile ?? [])],
    // Mais elles gardent chacune leur type de lecture : un fichier cherché dans
    // la liste des flux désignerait n'importe quoi.
    origins: ctx => [
      { childType: 'nexus_hls', raw: ctx.nexusHlsSources ?? [] },
      { childType: 'nexus_file', raw: ctx.nexusFileSources ?? [] },
    ],
    url: item => first(item.url),
    label: (item, index) => first(item.label, item.player, item.name) || `Lien ${index + 1}`,
  },
  {
    id: 'bravo',
    mainType: 'bravo_main',
    childType: 'bravo',
    displayName: 'Bravo',
    kind: 'hls',
    list: ctx => ctx.sorted.bravo ?? [],
    origins: ctx => [{ childType: 'bravo', raw: ctx.purstreamSources ?? [] }],
    url: item => first(item.url),
    label: (item, index) => first(item.label, item.name) || `Lien ${index + 1}`,
  },
  {
    id: 'rivestream',
    mainType: 'rivestream_main',
    childType: 'rivestream',
    displayName: 'Rivestream',
    kind: 'hls',
    // `rivestream_main` → `rivestream_hls`, qui figure dans
    // DEPRECATED_SOURCE_IDS : l'épingler produirait une préférence que
    // `mergeWithDefaults` retirerait au chargement suivant.
    pinId: null,
    list: ctx => ctx.rivestreamSources ?? [],
    url: item => first(item.url),
    label: (item, index) => first(item.label, item.service) || `Lien ${index + 1}`,
  },
  {
    id: 'fstream',
    mainType: 'fstream_main',
    childType: 'fstream',
    displayName: 'Fstream',
    kind: 'embed',
    list: ctx => ctx.fstreamSources ?? [],
    url: item => first(item.decoded_url, item.url),
    label: (item, index) => first(item.label) || `Lien ${index + 1}`,
    language: item => item.language,
    // fstream encode l'URL dans l'iframe : on compare l'originale décodée.
    matchesEmbed: (item, ctx) =>
      ctx.embedType === 'fstream'
      && ctx.getOriginalUrl?.(ctx.embedUrl ?? '') === first(item.decoded_url, item.url),
  },
  {
    id: 'coflix',
    mainType: 'multi_main',
    childType: 'coflix',
    displayName: 'Coflix',
    kind: 'embed',
    list: ctx => ctx.coflixSources ?? [],
    // L'URL jouable est choisie par une préférence (miroir, qualité) — on ne la
    // reconstruit pas ici, on demande celle que le lecteur utiliserait.
    url: () => '',
    label: (item, index) =>
      first(String(item.quality ?? '').split('/')[0].trim()) || `Lien ${index + 1}`,
    language: item => item.language,
  },
  {
    id: 'omega',
    mainType: 'omega_main',
    childType: 'omega',
    displayName: 'Omega',
    kind: 'embed',
    list: ctx => ctx.omegaSources ?? [],
    url: item => first(item.link, item.url),
    label: (item, index) => first(item.player, item.label) || `Lien ${index + 1}`,
  },
  {
    id: 'wiflix',
    mainType: 'wiflix_main',
    childType: 'wiflix',
    displayName: 'Wiflix',
    kind: 'embed',
    list: ctx => ctx.wiflixSources ?? [],
    url: item => first(item.url),
    label: (item, index) => first(item.label, item.player) || `Lien ${index + 1}`,
    language: item => item.language,
  },
  {
    id: 'j1f',
    mainType: 'j1f_main',
    childType: 'j1f',
    displayName: '1jour1film',
    kind: 'embed',
    list: ctx => ctx.j1fSources ?? [],
    url: item => first(item.url),
    label: (item, index) => first(item.label, item.player) || `Lien ${index + 1}`,
    language: item => item.language,
  },
  {
    id: 'swiftflow',
    mainType: 'swiftflow_main',
    childType: 'swiftflow',
    displayName: 'SwiftFlow',
    kind: 'embed',
    list: ctx => ctx.swiftflowSources ?? [],
    url: item => first(item.url),
    label: (item, index) => first(item.label, item.player) || `Lien ${index + 1}`,
    language: item => item.language,
  },
  {
    id: 'vostfr',
    mainType: 'vostfr_main',
    childType: 'vostfr',
    displayName: 'VO / VOSTFR',
    kind: 'embed',
    // Ces entrées sont poussées à plat dans le même groupe que leur parent.
    list: ctx => ctx.vostfrEntries,
    url: item => first(item.url),
    label: (item, index) => first(item.label) || `Lecteur ${index + 1}`,
    language: () => 'vostfr',
  },
  {
    id: 'viper',
    mainType: 'viper_main',
    childType: 'viper',
    displayName: 'Viper',
    kind: 'embed',
    list: ctx => ctx.sorted.viper ?? [],
    origins: ctx => [{ childType: 'viper', raw: ctx.viperSources ?? [] }],
    url: item => first(item.url),
    label: (item, index) => first(item.name, item.label, item.player) || `Lien ${index + 1}`,
  },
  {
    id: 'vox',
    mainType: 'vox_main',
    childType: 'vox',
    displayName: 'Vox',
    kind: 'embed',
    list: ctx => ctx.sorted.vox ?? [],
    origins: ctx => [{ childType: 'vox', raw: ctx.voxSources ?? [] }],
    url: item => first(item.link, item.url),
    label: (item, index) => first(item.name, item.label) || `Lien ${index + 1}`,
  },
];

const PROVIDER_BY_MAIN_TYPE = new Map(PROVIDERS.map(spec => [spec.mainType, spec]));

/**
 * Viper et Vox lisent `parseInt(sourceId)` là où les autres découpent sur « _ ».
 * Leur donner la forme préfixée produit un NaN, et la lecture repart alors sur
 * l'URL de repli plutôt que sur l'entrée désignée.
 */
const BARE_ID_TYPES = new Set(['viper', 'vox']);

/**
 * Retrouve le type de lecture et l'index dans la liste NON triée.
 *
 * `indexOf` suffit quand la liste affichée EST la liste d'origine ; les listes
 * passées par `enrichAndSort` recréent leurs objets, on retombe alors sur une
 * comparaison d'URL. La position affichée n'est qu'un dernier recours.
 */
function resolveOrigin(
  spec: ProviderSpec,
  item: Item,
  url: string,
  ctx: AdapterContext,
  position: number,
): { childType: string; index: number } {
  for (const origin of spec.origins?.(ctx) ?? []) {
    const direct = origin.raw.indexOf(item);
    if (direct >= 0) return { childType: origin.childType, index: direct };
    if (url) {
      const byUrl = origin.raw.findIndex(candidate => spec.url(candidate) === url);
      if (byUrl >= 0) return { childType: origin.childType, index: byUrl };
    }
  }
  return { childType: spec.childType, index: position };
}

/** Identifiant attendu par `handleSourceChange` pour un lien. */
function sourceIdFor(spec: ProviderSpec, item: Item, childType: string, index: number): string {
  // VOSTFR n'est pas une liste indexée : le lecteur attend l'identifiant propre
  // du lecteur choisi, pas une position.
  if (spec.id === 'vostfr') return String(item.id ?? index);
  return BARE_ID_TYPES.has(childType) ? String(index) : `${childType}_${index}`;
}

/**
 * Retire emoji, compteur entre parenthèses et espaces superflus d'un libellé
 * i18n — pour les entrées top-level qui n'ont pas de `displayName` déclaré.
 */
function stripDecoration(label: string): string {
  return (
    label
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
      // Le sélecteur de variante est retiré à part : dans la même classe il
      // pourrait couper un emoji composé au lieu de le retirer en entier.
      .replace(/\uFE0F/g, '')
      .replace(/\s*\(\s*\d+\s*\)\s*$/, '')
      .trim()
  );
}

const normaliseLanguage = (value?: string | null): SourceLanguage | null => {
  if (!value) return null;
  return detectSourceLanguage(value);
};

export interface SourceTreeInput {
  sourceGroups: Array<{ type: string; title: string; sources: Item[] }>;
  /** Listes réordonnées selon les priorités de l'utilisateur — l'affichage. */
  sorted: {
    darkino?: Item[];
    nexusHls?: Item[];
    nexusFile?: Item[];
    viper?: Item[];
    vox?: Item[];
    bravo?: Item[];
  };
  /** Listes d'origine. Indispensables : le lecteur les relit à l'index donné. */
  darkinoSources?: Item[];
  nexusHlsSources?: Item[];
  nexusFileSources?: Item[];
  viperSources?: Item[];
  voxSources?: Item[];
  purstreamSources?: Item[];
  fstreamSources?: Item[];
  coflixSources?: Item[];
  omegaSources?: Item[];
  wiflixSources?: Item[];
  j1fSources?: Item[];
  swiftflowSources?: Item[];
  rivestreamSources?: Item[];

  src?: string | null;
  embedUrl?: string | null;
  embedType?: string | null;

  handleSourceChange: (type: string, id: string, url: string) => void;
  getOriginalUrl?: (url: string) => string;
  getCoflixPreferredUrl?: (item: Item) => string;
  /** Résolution et débit déjà connus pour cette URL, s'il y en a. */
  getSourceQualityLabel?: (
    url?: string | null,
    fallback?: string | number | null,
    label?: string,
  ) => string | null;

  pinnedSourceId?: string | null;
  pinnedHosterId?: string | null;
  onToggleSourcePin?: (id: TopLevelSourceId) => void;
  onToggleHosterPin?: (hosterId: HosterId) => void;
  /**
   * Seules les listes passées par `enrichAndSort` portent un champ `type`
   * (darkino, nexus, viper, vox, bravo). Pour les sept autres — fstream,
   * coflix, omega, wiflix, j1f, swiftflow, rivestream — l'hébergeur se déduit
   * de l'URL et du libellé, exactement comme le faisait le bloc historique.
   */
  detectHosterFromUrl?: (url?: string | null, label?: string | null) => HosterId | null;

  probing?: boolean;
  loadingRivestream?: boolean;
  loadingKisskh?: boolean;
}

/**
 * Construit l'arbre consommé par la section Source.
 *
 * L'ordre suit `sourceGroups` : les sources HLS premium d'abord, les lecteurs
 * embarqués ensuite — c'est déjà l'ordre de qualité décroissante, et il est
 * calculé en amont selon les préférences de l'utilisateur.
 */
export function useSourceTree(input: SourceTreeInput): SourceProvider[] {
  const {
    sourceGroups,
    src,
    embedUrl,
    embedType,
    handleSourceChange,
    getCoflixPreferredUrl,
    getSourceQualityLabel,
    detectHosterFromUrl,
    pinnedSourceId,
    pinnedHosterId,
    onToggleSourcePin,
    onToggleHosterPin,
    probing,
    loadingRivestream,
    loadingKisskh,
  } = input;

  return useMemo<SourceProvider[]>(() => {
    const providers: SourceProvider[] = [];

    // Les entrées VOSTFR sont poussées à plat dans le groupe, à côté de leur
    // parent `vostfr_main`. On les récolte avant de boucler.
    const vostfrEntries = (sourceGroups ?? []).flatMap(group =>
      (group.sources ?? []).filter(entry => entry.type === 'vostfr'),
    );
    const context: AdapterContext = { ...input, vostfrEntries };

    for (const group of sourceGroups ?? []) {
      for (const entry of group.sources ?? []) {
        if (entry.type === 'vostfr') continue;

        const spec = PROVIDER_BY_MAIN_TYPE.get(entry.type);

        // Source directe : AdFree, MP4 nu, KissKH, Frembed, custom. Pas de
        // sous-niveau, la ligne se joue.
        if (!spec) {
          const url = first(entry.url);
          if (!url || url === '#') continue;
          const isActive =
            Boolean(entry.isActive)
            || src === url
            || (embedType === entry.type && embedUrl === url);

          // mp4, kisskh, frembed, custom sont des ids top-level valides : ces
          // lignes gardent leur épingle, comme dans le bloc historique.
          const pinId = pinnableTopLevelId(entry.type);

          providers.push({
            id: String(entry.id ?? entry.type),
            label: stripDecoration(String(entry.label ?? entry.type)),
            note: 'direct',
            isActive,
            isPinned: pinId !== null && pinnedSourceId === pinId,
            isLoading: (entry.type === 'kisskh_main' && loadingKisskh) || undefined,
            links: [],
            onSelect: () => handleSourceChange(entry.type, entry.id, url),
            onTogglePin:
              pinId !== null && onToggleSourcePin ? () => onToggleSourcePin(pinId) : undefined,
          });
          continue;
        }

        const items = spec.list(context);
        const links: SourceLink[] = items.map((item, index) => {
          const url =
            spec.id === 'coflix'
              ? (getCoflixPreferredUrl?.(item) ?? first(item.url, item.link))
              : spec.url(item);
          const label = spec.label(item, index);
          const origin = resolveOrigin(spec, item, url, context, index);

          const isActive = spec.matchesEmbed
            ? spec.matchesEmbed(item, context)
            : spec.kind === 'hls'
              ? Boolean(url) && src === url
              : embedType === spec.childType && Boolean(url) && embedUrl === url;

          const quality = getSourceQualityLabel?.(url, item.quality, label) ?? null;
          const detected =
            item.type && item.type !== 'unknown'
              ? (item.type as HosterId)
              : (detectHosterFromUrl?.(url, label) ?? null);
          const hosterId = detected && detected !== 'unknown' ? detected : null;

          return {
            id: `${spec.id}:${origin.childType}:${origin.index}`,
            label,
            quality,
            language: normaliseLanguage(spec.language?.(item)) ?? detectSourceLanguage(label, url),
            isActive,
            isPinned: hosterId !== null && pinnedHosterId === hosterId,
            // Une ligne est « en mesure » tant que le scan tourne et qu'elle
            // n'a pas encore de résolution : c'est exactement ce que remplace
            // l'ancien compteur global.
            isProbing: Boolean(probing) && !quality,
            onSelect: () =>
              handleSourceChange(
                origin.childType,
                sourceIdFor(spec, item, origin.childType, origin.index),
                url,
              ),
            onTogglePin:
              hosterId !== null && onToggleHosterPin
                ? () => onToggleHosterPin(hosterId)
                : undefined,
          };
        });

        // `pinId` explicite s'il est déclaré (y compris `null` = non
        // épinglable), sinon la table officielle de correspondance.
        const pinId = spec.pinId !== undefined ? spec.pinId : pinnableTopLevelId(spec.mainType);

        providers.push({
          id: spec.id,
          label: spec.displayName,
          // « pubs » s'ajoute à la note du fournisseur : c'est ce que la ligne
          // affiche sous son nom (« 3 liens · pubs »), voir sourceAdRisk.ts.
          note: [spec.note, injectsAds(spec.pinId ?? spec.id) ? 'pubs' : null].filter(Boolean).join(' · ') || null,
          isActive: links.some(link => link.isActive) || Boolean(entry.isActive),
          isPinned: pinId !== null && pinnedSourceId === pinId,
          isLoading: (spec.id === 'rivestream' && loadingRivestream) || undefined,
          links,
          onTogglePin:
            pinId !== null && onToggleSourcePin ? () => onToggleSourcePin(pinId) : undefined,
        });
      }
    }

    return providers;
    // `input` est volontairement absent : ses fonctions changent d'identité à
    // chaque rendu du panneau et feraient recalculer l'arbre en continu, ce qui
    // réordonnerait visuellement la liste sous le doigt de l'utilisateur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    sourceGroups,
    src,
    embedUrl,
    embedType,
    pinnedSourceId,
    pinnedHosterId,
    probing,
    loadingRivestream,
    loadingKisskh,
  ]);
}
