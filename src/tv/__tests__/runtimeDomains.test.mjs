import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { glob } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = relative => readFile(path.join(root, relative), 'utf8');

test('les API sont résolues avant le chargement de l’application', async () => {
  const main = await read('src/main.tsx');
  const initialize = main.indexOf('await initializeRuntimeConfig()');
  const loadApp = main.indexOf("await import('./App.tsx')");

  assert.ok(initialize >= 0, 'initialisation des domaines absente');
  assert.ok(loadApp > initialize, 'App.tsx est évalué avant la résolution des domaines');
});

test('aucun consommateur ne fige directement les API du build', async () => {
  const offenders = [];
  for await (const relative of glob('src/**/*.{ts,tsx}', { cwd: root })) {
    // Le tracker Wrapped est volontairement exclu : sa publication nécessite
    // une autorisation explicite distincte car il transporte des données de
    // visionnage et des identifiants vers l'API Movix existante.
    if (relative === 'src/config/runtime.ts' || relative === 'src/hooks/useWrappedTracker.ts') continue;
    const source = await read(relative);
    if (/import\.meta\.env\.VITE_(?:MAIN_API|PROXIES_EMBED_API)/.test(source)) {
      offenders.push(relative);
    }
  }
  assert.deepEqual(offenders, []);
});

test('le portail, les address.json, le cache et les sondes sont tous conservés', async () => {
  const runtime = await read('src/config/runtime.ts');
  const nativeResolver = await read('app/src/services/addressResolver.ts');

  assert.match(runtime, /VITE_MIRRORS_CONFIG_URL/);
  assert.match(runtime, /address\.json/);
  assert.match(runtime, /Promise\.allSettled/);
  assert.match(runtime, /movix:runtime-endpoints:v1/);
  assert.match(runtime, /isMainApiProbe \? 'cors' : 'no-cors'/);
  assert.match(runtime, /mainApi.*proxiesEmbedApi/s);

  assert.match(nativeResolver, /parseRentryHosts/);
  assert.match(nativeResolver, /Promise\.all\(/);
  assert.match(nativeResolver, /address:lastKnownGood:v1/);
  assert.match(nativeResolver, /keepReachableSites/);
});

test('le userscript relit les API résolues au moment de chaque requête', async () => {
  const userscript = await read('userscript/movix.user.js');

  assert.match(userscript, /function getMovixMainApiBase\(\)/);
  assert.match(userscript, /function getMovixProxiesEmbedBase\(\)/);
  assert.match(userscript, /movix:runtime-endpoints:v1/);
  assert.match(userscript, /getMovixMainApiBase\(\).*api\/kisskh\/fallback/s);
  assert.match(userscript, /getMovixMainApiBase\(\).*api\/livetv\/catalog/s);
});

test('les mises à jour familiales ne dépendent ni du code privé ni du portail Movix', async () => {
  const [config, app, publisher] = await Promise.all([
    read('app/src/config/index.ts'),
    read('app/src/App.tsx'),
    read('scripts/publish-app.mjs'),
  ]);

  assert.match(config, /XXbloodChef\/MovixTvApp-Updates/);
  assert.match(config, /GITHUB_VERSION_RAW_PATH: '\/raw\/refs\/heads\/main\/version\.json'/);
  assert.match(app, /UPDATE_CHECK\.REPOSITORY_URL/);
  assert.doesNotMatch(app, /config\?\.githubUrl/);
  assert.match(publisher, /releases\/download\/v\$\{versionName\}/);
  assert.match(publisher, /release\/version\.json/);
});
