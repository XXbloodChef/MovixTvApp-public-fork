import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../../../${path}`, import.meta.url), 'utf8');

/**
 * Le parcours publicitaire exige un clic sur un lien qui ouvre un onglet. Une
 * télécommande ne sait pas le faire et le shell WebView n'ouvrirait rien : la
 * lecture resterait bloquée derrière `adPopupTriggered`. Ces gardes doivent
 * donc rester en place — leur disparition ne se verrait qu'en testant sur une
 * vraie TV.
 */

test('le contexte publicitaire est court-circuité sur téléviseur', async () => {
  const context = await read('src/context/AdFreePopupContext.tsx');

  // Contournement au point d'entrée, avant même la vérification VIP.
  assert.match(context, /if \(isTvDevice\(\)\) \{\s*\n\s*setShouldLoadIframe\(true\);\s*\n\s*return;/);
  // Et aucun script de régie chargé.
  assert.match(context, /if \(!isTvDevice\(\) && getAdPopupMode\(\) === 'normal'/);
});

test('le popup ne peut pas s\'afficher sur téléviseur, même monté avec onClose', async () => {
  const component = await read('src/components/AdFreePlayerAds.tsx');

  // Les pages Watch passent `onClose`, ce qui rendait `shouldShow` vrai quel que
  // soit l'état du contexte : le garde-fou doit exister ici aussi.
  assert.match(component, /const shouldShow = !isTv && \(!!onClose \|\| showAdFreePopup\);/);
});

test('la lecture n\'est pas verrouillée derrière le popup sur téléviseur', async () => {
  for (const page of ['src/pages/Watch/WatchMovie.tsx', 'src/pages/Watch/WatchTv.tsx']) {
    const source = await read(page);

    // Masquer le popup ne suffit pas : tant que `adPopupTriggered` passe à vrai,
    // les branches de rendu du lecteur restent fermées.
    assert.match(source, /if \(isTvDevice\(\)\) return;/, `${page} : garde absente`);
    assert.match(
      source,
      /import \{ isTvDevice \} from '\.\.\/\.\.\/utils\/tv\/isTvDevice';/,
      `${page} : import absent`,
    );

    // La garde doit précéder le déclenchement, sinon elle ne sert à rien.
    const guard = source.indexOf('if (isTvDevice()) return;');
    const trigger = source.indexOf('adPopupTriggered || adPopupBypass');
    assert.ok(guard > 0 && guard < trigger, `${page} : garde placée après le déclencheur`);
  }
});
