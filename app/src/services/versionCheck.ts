import { UPDATE_CHECK } from '../config';
import { getLocalVersionCode } from './apkInstaller';

export type ReleaseNotes = {
  fr: string;
  en: string;
};

export type Manifest = {
  version: string;
  buildNumber: number;
  apkUrl: string;
  apkSizeBytes: number;
  apkSha256: string;
  mandatory: boolean;
  releasedAt: string;
  releaseNotes: ReleaseNotes;
};

export type VersionCheckResult =
  | { kind: 'update-available'; remote: Manifest }
  | { kind: 'up-to-date' }
  | { kind: 'no-check' };

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

function isValidReleaseNotes(obj: unknown): obj is ReleaseNotes {
  if (typeof obj !== 'object' || obj === null) return false;
  const r = obj as Record<string, unknown>;
  return typeof r.fr === 'string' && typeof r.en === 'string';
}

function trustedRepositoryUrl(value: string): string | null {
  try {
    const url = new URL(value);
    const expected = new URL(UPDATE_CHECK.REPOSITORY_URL);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.origin !== expected.origin ||
      url.pathname.replace(/\/+$/, '') !== expected.pathname.replace(/\/+$/, '')
    ) {
      return null;
    }
    return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
  } catch {
    return null;
  }
}

function isTrustedReleaseApkUrl(value: unknown, repositoryUrl: string): value is string {
  if (typeof value !== 'string') return false;
  try {
    const apk = new URL(value);
    const repository = new URL(repositoryUrl);
    const releasePrefix = `${repository.pathname.replace(/\/+$/, '')}/releases/download/`;
    return (
      apk.protocol === 'https:' &&
      !apk.username &&
      !apk.password &&
      !apk.search &&
      !apk.hash &&
      apk.origin === repository.origin &&
      apk.pathname.startsWith(releasePrefix) &&
      apk.pathname.toLowerCase().endsWith('.apk') &&
      apk.pathname.length > releasePrefix.length + 4
    );
  } catch {
    return false;
  }
}

function isValidManifest(obj: unknown, repositoryUrl: string): obj is Manifest {
  if (typeof obj !== 'object' || obj === null) return false;
  const m = obj as Record<string, unknown>;
  return (
    typeof m.version === 'string' &&
    typeof m.buildNumber === 'number' &&
    Number.isInteger(m.buildNumber) &&
    isTrustedReleaseApkUrl(m.apkUrl, repositoryUrl) &&
    typeof m.apkSizeBytes === 'number' &&
    Number.isInteger(m.apkSizeBytes) &&
    m.apkSizeBytes > 0 &&
    typeof m.apkSha256 === 'string' &&
    /^[a-f0-9]{64}$/.test(m.apkSha256) &&
    typeof m.mandatory === 'boolean' &&
    typeof m.releasedAt === 'string' &&
    isValidReleaseNotes(m.releaseNotes)
  );
}

export async function fetchLatestVersion(
  githubUrl: string,
): Promise<VersionCheckResult> {
  // Le portail Movix publie lui aussi un champ GitHub. Il ne doit jamais
  // pouvoir sélectionner le canal officiel et remplacer cette application TV
  // par l'APK téléphone, même si un appelant lui transmet cette adresse.
  const repositoryUrl = trustedRepositoryUrl(githubUrl);
  if (!repositoryUrl) {
    console.warn('[versionCheck] untrusted update repository');
    return { kind: 'no-check' };
  }

  let manifest: Manifest;
  try {
    const manifestUrl = `${repositoryUrl}${UPDATE_CHECK.GITHUB_VERSION_RAW_PATH}?_=${Date.now()}`;
    const res = await fetchWithTimeout(manifestUrl, UPDATE_CHECK.TIMEOUT_MS);
    if (!res.ok) {
      console.warn('[versionCheck] manifest status', res.status);
      return { kind: 'no-check' };
    }
    const json: unknown = await res.json();
    if (!isValidManifest(json, repositoryUrl)) {
      console.warn('[versionCheck] manifest invalid', json);
      return { kind: 'no-check' };
    }
    manifest = json;
  } catch (err) {
    console.warn('[versionCheck] fetch error', err);
    return { kind: 'no-check' };
  }

  let localCode: number;
  try {
    localCode = await getLocalVersionCode();
  } catch (err) {
    console.warn('[versionCheck] getLocalVersionCode failed', err);
    return { kind: 'no-check' };
  }

  if (manifest.buildNumber > localCode) {
    return { kind: 'update-available', remote: manifest };
  }
  return { kind: 'up-to-date' };
}
