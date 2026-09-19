import { UPDATE_CHECK, FALLBACK_CONFIG, DEV_SITE_URL } from '../config';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type AddressConfig = {
  primaryUrl: string;
  mirrors: string[];
  githubUrl: string;
  telegramUrl: string;
};

type RawMirror = { url?: unknown };
type RawAddressJson = {
  primary?: { url?: unknown };
  active?: unknown[];
  github?: unknown;
  telegram?: unknown;
};

const HOSTNAME_RE =
  /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;
const ADDRESS_CACHE_KEY = 'address:lastKnownGood:v1';

async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
    });
  } finally {
    clearTimeout(timer);
  }
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isValidHostname(host: string): boolean {
  if (!HOSTNAME_RE.test(host)) return false;
  if (host === 'rentry.co') return false;
  if (host.endsWith('.rentry.co')) return false;
  if (host === 'github.com' || host === 't.me') return false;
  // Un futur domaine officiel n'est pas obligé de conserver « movix » dans
  // son nom. La confiance vient du portail ; la validité, de address.json.
  return true;
}

// Replicates the SW's parseConfig (public/sw.js) — supports two formats:
// - JSON: {"mirrors": ["host", ...]}
// - HTML: rendered rentry page; extract <a href> hosts inside the first <article>
export function parseRentryHosts(text: string): string[] {
  const hosts: string[] = [];
  const append = (value: string) => {
    const trimmed = value.trim().toLowerCase();
    let host = trimmed;
    try {
      host = trimmed.includes('://') ? new URL(trimmed).hostname : trimmed;
    } catch {
      return;
    }
    host = host.replace(/^www\./, '');
    if (isValidHostname(host) && !hosts.includes(host)) hosts.push(host);
  };

  // Try JSON first.
  try {
    const parsed = JSON.parse(text) as { mirrors?: unknown };
    if (Array.isArray(parsed.mirrors)) {
      for (const m of parsed.mirrors) {
        if (typeof m === 'string') append(m);
      }
      return hosts;
    }
  } catch {
    // Fall through to HTML parsing.
  }

  // HTML path: scope to the first <article> if present.
  const articleMatch = text.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
  const scope = articleMatch ? articleMatch[1] : text;
  const hrefRe = /href=["']https?:\/\/([^/"'\s?#]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = hrefRe.exec(scope)) !== null) {
    append(match[1]);
  }
  return hosts;
}

function normalizeHttpsUrl(value: unknown): string {
  if (!isString(value)) return '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return '';
    return url.origin;
  } catch {
    return '';
  }
}

function normalizeAddressJson(raw: RawAddressJson): AddressConfig | null {
  const primaryUrl = normalizeHttpsUrl(raw.primary?.url);
  if (!primaryUrl) return null;
  if (!isString(raw.github)) return null;
  if (!isString(raw.telegram)) return null;

  const active = Array.isArray(raw.active) ? raw.active : [];
  const mirrors: string[] = [];
  for (const m of active) {
    const url = normalizeHttpsUrl((m as RawMirror)?.url);
    if (url && url !== primaryUrl && !mirrors.includes(url)) {
      mirrors.push(url);
    }
  }

  return {
    primaryUrl,
    mirrors,
    githubUrl: raw.github,
    telegramUrl: raw.telegram,
  };
}

const HARDCODED_FALLBACK: AddressConfig = {
  primaryUrl: FALLBACK_CONFIG.PRIMARY_URL,
  mirrors: [],
  githubUrl: FALLBACK_CONFIG.GITHUB_URL,
  telegramUrl: FALLBACK_CONFIG.TELEGRAM_URL,
};

async function readCachedConfig(): Promise<AddressConfig | null> {
  try {
    const raw = await AsyncStorage.getItem(ADDRESS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AddressConfig;
    const primaryUrl = normalizeHttpsUrl(parsed.primaryUrl);
    if (!primaryUrl) return null;
    const mirrors = Array.isArray(parsed.mirrors)
      ? parsed.mirrors.map(normalizeHttpsUrl).filter(Boolean)
      : [];
    return {
      primaryUrl,
      mirrors: mirrors.filter(url => url !== primaryUrl),
      githubUrl: isString(parsed.githubUrl) ? parsed.githubUrl : HARDCODED_FALLBACK.githubUrl,
      telegramUrl: isString(parsed.telegramUrl) ? parsed.telegramUrl : HARDCODED_FALLBACK.telegramUrl,
    };
  } catch {
    return null;
  }
}

async function cacheConfig(config: AddressConfig): Promise<void> {
  try {
    await AsyncStorage.setItem(ADDRESS_CACHE_KEY, JSON.stringify(config));
  } catch {
    // Le basculement reste valable pour le lancement courant.
  }
}

async function isSiteReachable(baseUrl: string): Promise<boolean> {
  try {
    const response = await fetchWithTimeout(
      `${baseUrl.replace(/\/+$/, '')}/tvapp?_=${Date.now()}`,
      UPDATE_CHECK.TIMEOUT_MS,
    );
    return response.ok;
  } catch {
    return false;
  }
}

async function keepReachableSites(config: AddressConfig): Promise<AddressConfig> {
  const candidates = [config.primaryUrl, ...config.mirrors]
    .filter((url, index, values) => values.indexOf(url) === index);
  const checks = await Promise.all(candidates.map(isSiteReachable));
  const reachable = candidates.filter((_, index) => checks[index]);
  if (reachable.length === 0) return config;
  return {
    ...config,
    primaryUrl: reachable[0],
    mirrors: reachable.slice(1),
  };
}

export async function resolveAddressConfig(): Promise<AddressConfig> {
  // Court-circuit de dev : voir DEV_SITE_URL. Le garde `__DEV__` est ce qui
  // garantit qu'un build release ne peut pas partir sur un localhost.
  if (__DEV__ && DEV_SITE_URL) {
    return { ...HARDCODED_FALLBACK, primaryUrl: DEV_SITE_URL, mirrors: [] };
  }

  // Step 1: discover every resolver host via rentry. Tester toute la liste est
  // indispensable : le premier lien peut précisément être celui qui vient de
  // tomber ou d'être bloqué par le FAI.
  let resolverHosts: string[];
  try {
    const res = await fetchWithTimeout(
      `${UPDATE_CHECK.RENTRY_URL}?_=${Date.now()}`,
      UPDATE_CHECK.TIMEOUT_MS,
    );
    if (!res.ok) throw new Error(`rentry status ${res.status}`);
    const text = await res.text();
    resolverHosts = parseRentryHosts(text);
    if (resolverHosts.length === 0) throw new Error('rentry: no valid hostname');
  } catch (err) {
    console.warn('[addressResolver] rentry fetch failed', err);
    return (await readCachedConfig()) ?? HARDCODED_FALLBACK;
  }

  // Step 2: fetch /address.json on every discovered host in parallel, then
  // retain the first valid official response in portal order.
  const results = await Promise.all(
    resolverHosts.map(async resolverHost => {
      try {
        const res = await fetchWithTimeout(
          `https://${resolverHost}/address.json?_=${Date.now()}`,
          UPDATE_CHECK.TIMEOUT_MS,
        );
        if (!res.ok) throw new Error(`address.json status ${res.status}`);
        return normalizeAddressJson((await res.json()) as RawAddressJson);
      } catch (err) {
        console.warn(`[addressResolver] ${resolverHost}/address.json failed`, err);
        return null;
      }
    }),
  );
  const discovered = results.find((value): value is AddressConfig => value !== null);
  if (!discovered) {
    return (await readCachedConfig()) ?? HARDCODED_FALLBACK;
  }

  // Step 3: do not wait for WebView's error page. Probe primary + mirrors now,
  // promote the first reachable site, and remember the working chain.
  const reachable = await keepReachableSites(discovered);
  await cacheConfig(reachable);
  return reachable;
}
