import { Copy, Gauge, RefreshCw } from 'lucide-react';
import type { SettingsRowDescriptor } from './PlayerSettingsRow';
import { detectSourceLanguage, languagesPresent, type SourceLanguage } from './sourceLanguage';

/**
 * Section Source — niveaux 2 et 3.
 *
 * Le panneau ne connaît pas les quinze `source_main` du catalogue. Il consomme
 * une forme normalisée que l'adaptateur (côté HLSPlayerSettingsPanel) produit à
 * partir de `sourceGroups` et des listes triées. La logique tordue — quel type
 * est actif, lequel a un sous-menu, lequel est épinglable — reste près du code
 * qui la connaît ; ici il ne reste que de la présentation.
 */

/** Un lien jouable : un hébergeur pour une source donnée. */
export interface SourceLink {
  id: string;
  /** Nom de l'hébergeur : « Vidmoly », « Uqload ». */
  label: string;
  /** Résolution et débit déjà formatés : « 1080p · 6,2 Mb/s ». */
  quality?: string | null;
  language?: SourceLanguage | null;
  isActive: boolean;
  isPinned?: boolean;
  /** Mesure de qualité en cours sur ce lien. */
  isProbing?: boolean;
  /** Lien injoignable : ligne grisée et non sélectionnable. */
  isDead?: boolean;
  onSelect: () => void;
  onTogglePin?: () => void;
}

/** Une source de premier niveau : Fstream, Coflix, Nexus… */
export interface SourceProvider {
  id: string;
  label: string;
  /** Précision courte affichée sous le nom : « avance rapide », « direct ». */
  note?: string | null;
  isActive: boolean;
  isPinned?: boolean;
  isLoading?: boolean;
  /**
   * Liens de la source. Vide **et** `onSelect` défini → source directe : la
   * ligne se joue au lieu de descendre (cas AdFree, MP4 nu).
   */
  links: SourceLink[];
  onSelect?: () => void;
  onTogglePin?: () => void;
}

export interface SourceTreeActions {
  /** Relance la recherche de sources. */
  onRefresh?: () => void;
  /** Lance la mesure de qualité sur tous les liens. */
  onProbeQuality?: () => void;
  probing?: boolean;
  /** Copie l'URL du lien actif. */
  onCopyActiveLink?: () => void;
}

const linkLanguage = (link: SourceLink): SourceLanguage | null =>
  link.language ?? detectSourceLanguage(link.label);

/** Le lien actif, tous fournisseurs confondus. */
export function activeLink(
  providers: SourceProvider[],
): { provider: SourceProvider; link: SourceLink } | null {
  for (const provider of providers) {
    const link = provider.links.find(candidate => candidate.isActive);
    if (link) return { provider, link };
  }
  const direct = providers.find(provider => provider.isActive && provider.links.length === 0);
  return direct
    ? {
        provider: direct,
        link: { id: direct.id, label: direct.label, isActive: true, onSelect: () => {} },
      }
    : null;
}

/** Valeur affichée au niveau 1 : « Vidmoly », plus le badge de langue. */
export function summariseSource(providers: SourceProvider[]): {
  label: string | null;
  badge: string | null;
} {
  const current = activeLink(providers);
  if (!current) return { label: null, badge: null };
  const language = linkLanguage(current.link);
  return {
    label: current.link.label || current.provider.label,
    badge: language ? language.toUpperCase() : null,
  };
}

const pluralLinks = (count: number) => `${count} lien${count > 1 ? 's' : ''}`;

/** Niveau 2 : la liste des sources, avec leurs langues visibles sans y entrer. */
function buildProviderList(
  providers: SourceProvider[],
  actions: SourceTreeActions,
  push: (segment: string) => void,
): SettingsRowDescriptor[] {
  const rows: SettingsRowDescriptor[] = [];

  providers.forEach(provider => {
    const empty = provider.links.length === 0 && !provider.onSelect;
    const languages = languagesPresent(
      provider.links.map(link => ({ language: linkLanguage(link) })),
    );

    rows.push({
      kind: 'choice',
      id: `provider:${provider.id}`,
      label: provider.label,
      sublabel: provider.isLoading
        ? 'Recherche en cours'
        : empty
          ? 'Aucun lien'
          : provider.links.length === 0
            ? (provider.note ?? 'Lecture directe')
            : [pluralLinks(provider.links.length), provider.note].filter(Boolean).join(' · '),
      selected: provider.isActive,
      // Le niveau 2 ne porte pas de langue unique : la barre active reste une
      // coche, et les langues s'expriment en pastilles.
      languageDots: languages,
      pinned: provider.isPinned,
      disabled: empty,
      onSelect: () => {
        if (provider.links.length === 0) provider.onSelect?.();
        else push(provider.id);
      },
      onTogglePin: provider.onTogglePin,
    });
  });

  if (actions.onRefresh) {
    rows.push({ kind: 'separator', id: 'source:sep' });
    rows.push({
      kind: 'action',
      id: 'source:refresh',
      icon: RefreshCw,
      label: 'Relancer la recherche',
      onSelect: actions.onRefresh,
    });
  }

  return rows;
}

/** Niveau 3 : les hébergeurs d'une source. */
function buildLinkList(
  provider: SourceProvider,
  actions: SourceTreeActions,
): SettingsRowDescriptor[] {
  const rows: SettingsRowDescriptor[] = provider.links.map(link => {
    const language = linkLanguage(link);
    return {
      kind: 'choice' as const,
      id: `link:${link.id}`,
      label: link.label,
      sublabel: link.isProbing
        ? 'Mesure en cours'
        : link.isDead
          ? 'Injoignable'
          : (link.quality ?? undefined),
      badge: language ? language.toUpperCase() : undefined,
      language,
      probing: link.isProbing,
      disabled: link.isDead,
      selected: link.isActive,
      pinned: link.isPinned,
      onSelect: link.onSelect,
      onTogglePin: link.onTogglePin,
    };
  });

  const tail: SettingsRowDescriptor[] = [];

  if (actions.onProbeQuality) {
    tail.push({
      kind: 'action',
      id: 'source:probe',
      icon: Gauge,
      label: actions.probing ? 'Mesure en cours' : 'Mesurer la qualité',
      disabled: actions.probing,
      onSelect: actions.onProbeQuality,
    });
  }

  if (actions.onCopyActiveLink) {
    tail.push({
      kind: 'action',
      id: 'source:copy',
      icon: Copy,
      label: 'Copier le lien actif',
      onSelect: actions.onCopyActiveLink,
    });
  }

  if (tail.length > 0) {
    rows.push({ kind: 'separator', id: 'link:sep' });
    rows.push(...tail);
  }

  return rows;
}

/**
 * Point d'entrée appelé par le registre.
 * `subPath` vaut `[]` au niveau 2, `['fstream']` au niveau 3.
 */
export function buildSourceLevel(
  providers: SourceProvider[],
  actions: SourceTreeActions,
  subPath: readonly string[],
  push: (segment: string) => void,
): { title: string; rows: SettingsRowDescriptor[] } {
  const providerId = subPath[0];

  if (providerId) {
    const provider = providers.find(candidate => candidate.id === providerId);
    if (provider) {
      return { title: provider.label, rows: buildLinkList(provider, actions) };
    }
  }

  return { title: 'Source', rows: buildProviderList(providers, actions, push) };
}
