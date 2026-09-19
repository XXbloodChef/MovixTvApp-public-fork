const normalizeBaseUrl = (value?: string): string =>
  (value || '').trim().replace(/\/+$/, '');

const normalizeHttpBase = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  const candidate = normalizeBaseUrl(value);
  if (!candidate) return '';

  try {
    const url = new URL(
      candidate.includes('://') ? candidate : `https://${candidate}`,
    );
    if (url.protocol !== 'https:' && url.hostname !== 'localhost') return '';
    if (url.username || url.password) return '';
    return url.origin;
  } catch {
    return '';
  }
};

const normalizeConfigUrl = (value: unknown): string => {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:') return '';
    if (url.username || url.password) return '';
    return url.toString();
  } catch {
    return '';
  }
};

const unique = (values: string[]): string[] =>
  Array.from(new Set(values.filter(Boolean)));

const configuredMainApi = normalizeHttpBase(import.meta.env.VITE_MAIN_API as string);
const configuredProxiesEmbedApi = normalizeHttpBase(
  import.meta.env.VITE_PROXIES_EMBED_API as string,
);

export const SITE_URL = normalizeBaseUrl(import.meta.env.VITE_SITE_URL as string);

// Ces exports sont des bindings ES vivants. Ils sont initialisés avec le .env,
// puis remplacés avant le chargement d'App.tsx si le domaine configuré ne
// répond plus. Les consommateurs voient donc tous la même base résolue.
export let MAIN_API = configuredMainApi;
export let PROXIES_EMBED_API = configuredProxiesEmbedApi;

export const WATCHPARTY_API =
  normalizeBaseUrl(import.meta.env.VITE_WATCHPARTY_API as string) || MAIN_API;
export const BESTDEBRID_API_BASE = 'https://bestdebrid.com/api/v1';

const DISCOVERY_URL =
  normalizeConfigUrl(import.meta.env.VITE_MIRRORS_CONFIG_URL as string)
  || 'https://rentry.co/movix';
const DEFAULT_SITE_HOSTS = String(import.meta.env.VITE_DEFAULT_MIRRORS || 'movix.health')
  .split(',')
  .map(value => value.trim().toLowerCase())
  .filter(Boolean);
const CACHE_KEY = 'movix:runtime-endpoints:v1';
const PROBE_TIMEOUT_MS = 2500;
const DISCOVERY_TIMEOUT_MS = 3500;

interface RuntimeEndpointCache {
  mainApi?: string;
  proxiesEmbedApi?: string;
}

interface RuntimeCandidates {
  mainApis: string[];
  proxiesEmbedApis: string[];
  siteHosts: string[];
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function readUrl(value: unknown): string {
  if (typeof value === 'string') return normalizeHttpBase(value);
  const record = asRecord(value);
  return record ? normalizeHttpBase(record.url) : '';
}

function readFirstUrl(record: UnknownRecord, keys: string[]): string {
  for (const key of keys) {
    const value = readUrl(record[key]);
    if (value) return value;
  }
  return '';
}

function siteHostFromUrl(value: unknown): string {
  const base = normalizeHttpBase(value);
  if (!base) return '';
  try {
    const host = new URL(base).hostname.toLowerCase().replace(/^www\./, '');
    if (
      host === 'localhost'
      || host === 'rentry.co'
      || host === 'github.com'
      || host === 't.me'
      || host.endsWith('.rentry.co')
    ) return '';
    return host;
  } catch {
    return '';
  }
}

function appendSiteValue(value: unknown, output: string[]) {
  if (typeof value === 'string') {
    const host = siteHostFromUrl(value);
    if (host) output.push(host);
    return;
  }
  const record = asRecord(value);
  if (record) appendSiteValue(record.url, output);
}

/**
 * Lit les deux formats du portail Movix : JSON (address.json ou liste de
 * miroirs) et page HTML rentry. Les URL d'API explicites sont préférées ; à
 * défaut, les sous-domaines api.* et proxiesembed.* seront testés.
 */
export function parseRuntimeCandidates(text: string): RuntimeCandidates {
  const candidates: RuntimeCandidates = {
    mainApis: [],
    proxiesEmbedApis: [],
    siteHosts: [],
  };

  try {
    const parsed = JSON.parse(text) as unknown;
    const record = asRecord(parsed);
    if (record) {
      const mainApi = readFirstUrl(record, [
        'mainApi', 'main_api', 'apiUrl', 'api_url', 'api',
      ]);
      const proxiesEmbedApi = readFirstUrl(record, [
        'proxiesEmbedApi', 'proxies_embed_api', 'proxyApi', 'proxy_api',
        'proxiesEmbed', 'proxiesembed',
      ]);
      if (mainApi) candidates.mainApis.push(mainApi);
      if (proxiesEmbedApi) candidates.proxiesEmbedApis.push(proxiesEmbedApi);

      appendSiteValue(record.primary, candidates.siteHosts);
      for (const key of ['active', 'mirrors']) {
        const values = record[key];
        if (Array.isArray(values)) {
          values.forEach(value => appendSiteValue(value, candidates.siteHosts));
        }
      }
    }
  } catch {
    // Le portail rentry est habituellement du HTML : traité ci-dessous.
  }

  const article = text.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1] || text;
  const hrefPattern = /href=["'](https?:\/\/[^"'\s<>]+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = hrefPattern.exec(article)) !== null) {
    const host = siteHostFromUrl(match[1]);
    if (host) candidates.siteHosts.push(host);
  }

  candidates.mainApis = unique(candidates.mainApis);
  candidates.proxiesEmbedApis = unique(candidates.proxiesEmbedApis);
  candidates.siteHosts = unique(candidates.siteHosts);
  return candidates;
}

function mergeCandidates(target: RuntimeCandidates, source: RuntimeCandidates) {
  target.mainApis = unique([...target.mainApis, ...source.mainApis]);
  target.proxiesEmbedApis = unique([
    ...target.proxiesEmbedApis,
    ...source.proxiesEmbedApis,
  ]);
  target.siteHosts = unique([...target.siteHosts, ...source.siteHosts]);
}

async function fetchText(url: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
      headers: { 'Cache-Control': 'no-cache' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    window.clearTimeout(timer);
  }
}

async function discoverRuntimeCandidates(): Promise<RuntimeCandidates> {
  const currentSiteHost = typeof window === 'undefined'
    ? ''
    : siteHostFromUrl(window.location.origin);
  const discovered: RuntimeCandidates = {
    mainApis: [],
    proxiesEmbedApis: [],
    siteHosts: unique([...DEFAULT_SITE_HOSTS, currentSiteHost]),
  };

  try {
    const separator = DISCOVERY_URL.includes('?') ? '&' : '?';
    const portalText = await fetchText(
      `${DISCOVERY_URL}${separator}_=${Date.now()}`,
      DISCOVERY_TIMEOUT_MS,
    );
    mergeCandidates(discovered, parseRuntimeCandidates(portalText));
  } catch (error) {
    console.warn('[runtime] portail de domaines injoignable', error);
  }

  // Chaque domaine officiel peut publier address.json. On les interroge en
  // parallèle : un domaine mort ne retarde pas l'essai des suivants.
  const resolverHosts = [...discovered.siteHosts];
  const addressResults = await Promise.allSettled(
    resolverHosts.map(async host => {
      const text = await fetchText(
        `https://${host}/address.json?_=${Date.now()}`,
        DISCOVERY_TIMEOUT_MS,
      );
      return { resolverHost: host, candidates: parseRuntimeCandidates(text) };
    }),
  );
  const verifiedSiteHosts = unique([...DEFAULT_SITE_HOSTS, currentSiteHost]);
  for (const result of addressResults) {
    if (result.status !== 'fulfilled') continue;
    verifiedSiteHosts.push(result.value.resolverHost);
    verifiedSiteHosts.push(...result.value.candidates.siteHosts);
    mergeCandidates(discovered, result.value.candidates);
  }

  // Ne dérive jamais api.github.com ou api.t.me depuis un lien annexe du
  // portail : seuls le domaine de la page, les replis du build et les hôtes
  // ayant réellement servi un address.json sont autorisés.
  for (const host of unique(verifiedSiteHosts)) {
    const bareHost = host.replace(/^www\./, '');
    discovered.mainApis.push(`https://api.${bareHost}`);
    discovered.proxiesEmbedApis.push(`https://proxiesembed.${bareHost}`);
  }

  discovered.mainApis = unique(discovered.mainApis.map(normalizeHttpBase));
  discovered.proxiesEmbedApis = unique(
    discovered.proxiesEmbedApis.map(normalizeHttpBase),
  );
  return discovered;
}

function readCache(): RuntimeEndpointCache {
  try {
    const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') as RuntimeEndpointCache;
    return {
      mainApi: normalizeHttpBase(parsed.mainApi),
      proxiesEmbedApi: normalizeHttpBase(parsed.proxiesEmbedApi),
    };
  } catch {
    return {};
  }
}

function writeCache(value: RuntimeEndpointCache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(value));
  } catch {
    // Stockage privé ou saturé : la découverte reste valable pour ce lancement.
  }
}

async function isReachable(base: string, path: string): Promise<boolean> {
  if (!base) return false;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const isMainApiProbe = path === '/api/check-vip';
    const response = await fetch(`${base}${path}`, {
      cache: 'no-store',
      // L'API principale doit réellement autoriser l'origine de l'app ; une
      // simple réponse DNS/404 ne suffit pas. Le proxy, dont la racine n'a pas
      // de contrat CORS, reste une sonde de connectivité opaque.
      mode: isMainApiProbe ? 'cors' : 'no-cors',
      signal: controller.signal,
    });
    return !isMainApiProbe || response.status !== 404;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timer);
  }
}

async function firstReachable(values: string[], path: string): Promise<string> {
  const candidates = unique(values.map(normalizeHttpBase));
  if (candidates.length === 0) return '';

  // Tous les essais partent ensemble : un premier domaine hors ligne ne fait
  // pas patienter 2,5 s par miroir. L'ordre officiel reste prioritaire parmi
  // les réponses valides.
  const checks = await Promise.all(candidates.map(base => isReachable(base, path)));
  return candidates.find((_, index) => checks[index]) || '';
}

let initialization: Promise<void> | null = null;

/** Résout les API une fois, avant d'importer le reste de l'application. */
export function initializeRuntimeConfig(): Promise<void> {
  if (initialization) return initialization;

  initialization = (async () => {
    const cached = readCache();
    let mainApi = await firstReachable(
      [cached.mainApi || '', configuredMainApi],
      '/api/check-vip',
    );
    let proxiesEmbedApi = await firstReachable(
      [cached.proxiesEmbedApi || '', configuredProxiesEmbedApi],
      '/',
    );

    if (!mainApi || !proxiesEmbedApi) {
      const discovered = await discoverRuntimeCandidates();
      if (!mainApi) {
        mainApi = await firstReachable(discovered.mainApis, '/api/check-vip');
      }
      if (!proxiesEmbedApi) {
        proxiesEmbedApi = await firstReachable(discovered.proxiesEmbedApis, '/');
      }
    }

    // Dernier repli : mieux vaut conserver la valeur du build et afficher
    // l'erreur réseau normale que démarrer avec une base vide.
    MAIN_API = mainApi || configuredMainApi;
    PROXIES_EMBED_API = proxiesEmbedApi || configuredProxiesEmbedApi;
    writeCache({ mainApi: MAIN_API, proxiesEmbedApi: PROXIES_EMBED_API });
  })().catch(error => {
    console.warn('[runtime] découverte des API impossible', error);
  });

  return initialization;
}

export const buildSiteUrl = (path: string): string => {
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
};
