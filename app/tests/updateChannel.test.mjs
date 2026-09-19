import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const read = relativePath =>
  readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), 'utf8');

test('TV app identity cannot be replaced by the official Movix phone package', () => {
  const gradle = read('android/app/build.gradle');
  const nativeUpdater = read(
    'android/app/src/main/java/com/movix/app/update/UpdateModule.kt',
  );

  assert.match(gradle, /applicationId\s+"com\.xxbloodchef\.movixtv"/);
  assert.doesNotMatch(gradle, /applicationId\s+"com\.movix\.app"/);
  assert.match(nativeUpdater, /archivePackage != reactContext\.packageName/);
  assert.match(nativeUpdater, /APK_PACKAGE_MISMATCH/);
});

test('updates only trust the dedicated MovixTvApp release repository', () => {
  const config = read('src/config/index.ts');
  const checker = read('src/services/versionCheck.ts');

  assert.match(
    config,
    /REPOSITORY_URL:\s*'https:\/\/github\.com\/XXbloodChef\/MovixTvApp-Updates'/,
  );
  assert.match(checker, /trustedRepositoryUrl\(githubUrl\)/);
  assert.match(checker, /isTrustedReleaseApkUrl\(m\.apkUrl, repositoryUrl\)/);
  assert.match(checker, /\/releases\/download\//);
});

test('every Android build is forced into TV mode', () => {
  const deviceInfo = read('src/services/deviceInfo.ts');
  assert.match(deviceInfo, /IS_TV:\s*boolean\s*=\s*Platform\.OS === 'android'/);
  assert.doesNotMatch(deviceInfo, /NativeModules\.MovixDeviceInfo/);
});
