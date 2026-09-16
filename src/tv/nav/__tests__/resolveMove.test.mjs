import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function importTypeScript(relativePath) {
  const source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  });
  return import(
    `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
  );
}

const { resolveMove, rememberPosition } = await importTypeScript('../resolveMove.ts');

const scopes = [
  { id: 'hero', orientation: 'row', count: 2 },
  { id: 'empty', orientation: 'row', count: 0 },
  { id: 'films', orientation: 'row', count: 200 },
  { id: 'grilleA', orientation: 'grid', count: 9, columns: 3 },
  { id: 'grilleB', orientation: 'grid', count: 6, columns: 3 },
  { id: 'grilleC', orientation: 'grid', count: 7, columns: 3 },
];

const state = (current, memory = {}) => ({ scopes, current, memory });

test('la première flèche entre dans la première portée non vide', () => {
  assert.deepEqual(resolveMove(state(null), 'down'), { scopeId: 'hero', index: 0 });
});

test('une rangée se parcourt horizontalement et bute sur ses bords', () => {
  assert.deepEqual(
    resolveMove(state({ scopeId: 'films', index: 4 }), 'right'),
    { scopeId: 'films', index: 5 },
  );
  assert.deepEqual(
    resolveMove(state({ scopeId: 'films', index: 0 }), 'left'),
    null,
    'pas de bouclage : revenir au début en poussant à gauche désoriente',
  );
  assert.deepEqual(
    resolveMove(state({ scopeId: 'films', index: 199 }), 'right'),
    null,
  );
});

test('les portées vides sont enjambées, jamais un piège à focus', () => {
  assert.deepEqual(
    resolveMove(state({ scopeId: 'hero', index: 0 }), 'down'),
    { scopeId: 'films', index: 0 },
    'la rangée "empty" (count 0) doit être sautée',
  );
});

test('on retrouve sa place en revenant dans une rangée quittée', () => {
  // Descendre depuis « films » à l'index 42 mémorise la colonne…
  let navState = rememberPosition(state({ scopeId: 'films', index: 42 }), {
    scopeId: 'films',
    index: 42,
  });
  assert.equal(navState.memory.films, 42);

  // …on descend dans la grille…
  const down = resolveMove(navState, 'down');
  assert.equal(down.scopeId, 'grilleA');

  // …et en remontant, on revient exactement où on était.
  navState = rememberPosition(navState, down);
  assert.deepEqual(resolveMove(navState, 'up'), { scopeId: 'films', index: 42 });
});

test('la colonne se conserve d\'une grille à l\'autre', () => {
  // Index 8 de grilleA = ligne 2, colonne 2. En descendant vers grilleB, on
  // doit rester en colonne 2.
  assert.deepEqual(
    resolveMove(state({ scopeId: 'grilleA', index: 8 }), 'down'),
    { scopeId: 'grilleB', index: 2 },
  );
});

test('un carrousel ne propage pas son index comme numéro de colonne', () => {
  // L'élément 42 d'une rangée défilante peut être n'importe où à l'écran :
  // transmettre « 42 » comme colonne ferait atterrir au hasard. On entre au
  // début, ce qui est prévisible.
  assert.deepEqual(
    resolveMove(state({ scopeId: 'films', index: 42 }), 'down'),
    { scopeId: 'grilleA', index: 0 },
  );
});

test('une grille se déplace d\'une colonne, et d\'une ligne entière', () => {
  assert.deepEqual(
    resolveMove(state({ scopeId: 'grilleA', index: 1 }), 'right'),
    { scopeId: 'grilleA', index: 2 },
  );
  assert.deepEqual(
    resolveMove(state({ scopeId: 'grilleA', index: 2 }), 'right'),
    null,
    'bord droit de la grille : on ne repart pas à la ligne suivante',
  );
  assert.deepEqual(
    resolveMove(state({ scopeId: 'grilleA', index: 1 }), 'down'),
    { scopeId: 'grilleA', index: 4 },
  );
});

test('la dernière ligne incomplète ne bloque pas la descente', () => {
  // 7 éléments sur 3 colonnes : la dernière ligne n'a que l'index 6.
  // Descendre depuis l'index 5 (colonne 2) viserait l'index 8, inexistant.
  assert.deepEqual(
    resolveMove(state({ scopeId: 'grilleC', index: 5 }), 'down'),
    { scopeId: 'grilleC', index: 6 },
  );
  // Depuis la dernière ligne, il n'y a plus rien en dessous.
  assert.equal(resolveMove(state({ scopeId: 'grilleC', index: 6 }), 'down'), null);
});

test('un index hors bornes est ramené dans la portée au lieu de planter', () => {
  // Peut arriver si une rangée rétrécit pendant qu'elle a le focus.
  assert.deepEqual(
    resolveMove(state({ scopeId: 'hero', index: 99 }), 'left'),
    { scopeId: 'hero', index: 0 },
  );
});

test('une portée qui disparaît ne laisse pas la télécommande sans effet', () => {
  // Cas réel : on est dans « episodes-s1 », l'utilisateur change de saison, la
  // portée est remplacée par « episodes-s2 ». Sans repli, plus aucune flèche
  // n'aurait d'effet jusqu'à un clic.
  const disparue = resolveMove(state({ scopeId: 'episodes-s1', index: 4 }), 'down');
  assert.deepEqual(disparue, { scopeId: 'hero', index: 0 });
});

test('une portée vide mais montée ne déclenche pas de repli brutal', () => {
  // Chargement en cours : on ne veut pas propulser l'utilisateur en haut de
  // page, le défilement prendra le relais.
  assert.equal(resolveMove(state({ scopeId: 'empty', index: 0 }), 'down'), null);
});

test('une grille de clavier se parcourt ligne par ligne et en sort par le bas', () => {
  // Le clavier est une grille de 6 colonnes (26 lettres + 10 chiffres = 36),
  // suivie d'une rangée d'actions. Sortir par le bas doit mener aux actions,
  // pas rester bloqué sur la dernière ligne.
  const clavier = [
    { id: 'clavier-grille', orientation: 'grid', count: 36, columns: 6 },
    { id: 'clavier-actions', orientation: 'row', count: 3 },
  ];
  const state = current => ({ scopes: clavier, current, memory: {} });

  // Dernière ligne de la grille : indices 30 à 35.
  assert.deepEqual(
    resolveMove(state({ scopeId: 'clavier-grille', index: 32 }), 'down'),
    { scopeId: 'clavier-actions', index: 2 },
    'la colonne se conserve vers la rangée d\'actions',
  );
  // Et on remonte dans la grille depuis les actions.
  assert.equal(
    resolveMove(state({ scopeId: 'clavier-actions', index: 0 }), 'up').scopeId,
    'clavier-grille',
  );
});

test('deux blocs côte à côte se rejoignent par les voisins déclarés', () => {
  // Le moteur ne connaît que l'ordre vertical des portées. Sans déclaration
  // explicite, un clavier et sa grille de résultats sont mutuellement
  // inatteignables — c'est ce qui bloquait la page de recherche.
  const scopes = [
    {
      id: 'clavier-grille',
      orientation: 'grid',
      count: 36,
      columns: 6,
      neighbors: { right: 'resultats' },
    },
    {
      id: 'resultats',
      orientation: 'grid',
      count: 9,
      columns: 3,
      neighbors: { left: 'clavier-grille' },
    },
  ];
  const state = current => ({ scopes, current, memory: {} });

  // Bord droit du clavier (colonne 5) -> résultats.
  assert.deepEqual(
    resolveMove(state({ scopeId: 'clavier-grille', index: 5 }), 'right'),
    { scopeId: 'resultats', index: 0 },
  );
  // Bord gauche des résultats -> retour au clavier.
  assert.equal(
    resolveMove(state({ scopeId: 'resultats', index: 3 }), 'left').scopeId,
    'clavier-grille',
  );
  // À l'intérieur, rien ne change : on ne saute pas tant qu'il reste une colonne.
  assert.deepEqual(
    resolveMove(state({ scopeId: 'clavier-grille', index: 2 }), 'right'),
    { scopeId: 'clavier-grille', index: 3 },
  );
});

test('sans voisin déclaré, le bord reste un bord', () => {
  const scopes = [{ id: 'seule', orientation: 'grid', count: 9, columns: 3 }];
  assert.equal(
    resolveMove({ scopes, current: { scopeId: 'seule', index: 2 }, memory: {} }, 'right'),
    null,
  );
});

test('un voisin vertical déclaré l\'emporte sur l\'ordre du DOM', () => {
  // Disposition réelle de la fiche : le rail des saisons et la liste
  // d'épisodes sont côte à côte, donc ils se suivent dans le DOM. Sans
  // déclaration, Haut depuis le premier épisode retomberait dans le rail.
  const scopes = [
    { id: 'onglets', orientation: 'row', count: 3 },
    { id: 'saisons', orientation: 'column', count: 4, neighbors: { right: 'episodes', up: 'onglets', down: null } },
    { id: 'episodes', orientation: 'column', count: 10, neighbors: { left: 'saisons', up: 'onglets', down: null } },
  ];
  const at = (scopeId, index) => ({ scopeId, index });

  // Haut depuis le premier épisode vise les onglets, pas le rail qui le précède.
  assert.deepEqual(
    resolveMove({ scopes, current: at('episodes', 0), memory: {} }, 'up'),
    at('onglets', 0),
  );

  // `down: null` ferme la sortie : sous le rail il n'y a rien, et l'ordre du DOM
  // y aurait déversé le focus dans la liste d'épisodes.
  assert.equal(
    resolveMove({ scopes, current: at('saisons', 3), memory: {} }, 'down'),
    null,
  );
  assert.equal(
    resolveMove({ scopes, current: at('episodes', 9), memory: {} }, 'down'),
    null,
  );

  // L'axe horizontal reste celui qui relie les deux blocs.
  assert.deepEqual(
    resolveMove({ scopes, current: at('saisons', 1), memory: {} }, 'right'),
    at('episodes', 0),
  );
});

test('un voisin vertical déclaré mais absent retombe sur l\'ordre du DOM', () => {
  // Une portée déclarée peut n'être pas encore montée — un onglet dont le
  // contenu charge. Bloquer serait pire que d'utiliser l'ordre du DOM.
  const scopes = [
    { id: 'haut', orientation: 'row', count: 2 },
    { id: 'bas', orientation: 'row', count: 2, neighbors: { up: 'jamais-montee' } },
  ];
  assert.deepEqual(
    resolveMove({ scopes, current: { scopeId: 'bas', index: 0 }, memory: {} }, 'up'),
    { scopeId: 'haut', index: 0 },
  );

  // Et une portée déclarée mais vide compte comme absente.
  const withEmpty = [
    { id: 'haut', orientation: 'row', count: 2 },
    { id: 'vide', orientation: 'row', count: 0 },
    { id: 'bas', orientation: 'row', count: 2, neighbors: { up: 'vide' } },
  ];
  assert.deepEqual(
    resolveMove({ scopes: withEmpty, current: { scopeId: 'bas', index: 0 }, memory: {} }, 'up'),
    { scopeId: 'haut', index: 0 },
  );
});

test('le bouclage ne s\'applique que là où il est demandé', () => {
  const carousel = [{ id: 'hero', orientation: 'row', count: 5, wrap: true }];
  const at = index => ({ scopes: carousel, current: { scopeId: 'hero', index }, memory: {} });

  // Cinq diapositives : buter sur la dernière est simplement agaçant.
  assert.deepEqual(resolveMove(at(4), 'right'), { scopeId: 'hero', index: 0 });
  assert.deepEqual(resolveMove(at(0), 'left'), { scopeId: 'hero', index: 4 });

  // Une rangée de catalogue ne boucle pas : revenir au début en poussant à
  // droite sur 200 titres désoriente plus que ça ne sert.
  const row = [{ id: 'films', orientation: 'row', count: 200 }];
  assert.equal(
    resolveMove({ scopes: row, current: { scopeId: 'films', index: 199 }, memory: {} }, 'right'),
    null,
  );

  // Et une portée d'un seul élément ne boucle pas sur elle-même.
  const single = [{ id: 'hero', orientation: 'row', count: 1, wrap: true }];
  assert.equal(
    resolveMove({ scopes: single, current: { scopeId: 'hero', index: 0 }, memory: {} }, 'right'),
    null,
  );
});
