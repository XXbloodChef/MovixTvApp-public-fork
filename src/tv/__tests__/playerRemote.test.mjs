import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../../../${path}`, import.meta.url), 'utf8');

test('la télécommande n\'est active que sur l\'instance principale du lecteur', async () => {
  const player = await read('src/components/HLSPlayer.tsx');

  // WatchMovie/WatchTv montent plusieurs HLSPlayer : des instances cachées
  // (`controls={false}`) et le menu de sources (`onlyQualityMenu`). Sans cette
  // restriction, plusieurs hooks écoutent `window` en parallèle et se disputent
  // les flèches — la télécommande paraît morte dès qu'un menu s'ouvre.
  assert.match(player, /enabled: isTvPlayback && controls && !onlyQualityMenu,/);
  assert.match(player, /\{isTvPlayback && controls && !onlyQualityMenu && \(\s*\n\s*<TvPlayerControls/);
});

test('les fenêtres du lecteur reçoivent les touches quand elles sont ouvertes', async () => {
  const remote = await read('src/tv/player/useTvPlayerRemote.ts');

  // Deux fenêtres distinctes : le menu de sources (rendu par une autre instance
  // du lecteur) et le panneau de réglages (rendu par l'instance principale).
  assert.match(remote, /root: '\[data-source-menu\]'/);
  assert.match(remote, /root: '\[data-player-settings\]'/);

  // Navigation géométrique : le panneau mêle une rangée d'onglets horizontale
  // et une liste verticale, l'ordre du DOM y ferait passer « bas » d'un onglet
  // au suivant au lieu d'entrer dans la liste.
  assert.match(remote, /function bestInDirection/);
  assert.match(remote, /getBoundingClientRect\(\)/);

  // L'interception doit précéder la logique de lecture.
  const intercept = remote.indexOf('const dialog = openDialog();');
  const seek = remote.indexOf('onSeek(event.key === ');
  assert.ok(intercept > 0 && intercept < seek, 'la fenêtre doit être consultée en premier');
});

test('seule la flèche du bas ouvre la barre', async () => {
  const remote = await read('src/tv/player/useTvPlayerRemote.ts');

  // `showBar` ouvre, `touch` ne fait que repousser la fermeture. Confondre les
  // deux faisait qu'un saut de 10 s ouvrait la barre, et que le saut suivant
  // devenait un déplacement de focus.
  const down = remote.match(/case 'ArrowDown':[\s\S]{0,220}?return;/);
  assert.ok(down && /showBar\(\)/.test(down[0]), 'ArrowDown doit ouvrir la barre');

  const horizontal = remote.match(/case 'ArrowRight': \{[\s\S]*?\n {10}return;/);
  assert.ok(horizontal, 'bloc des flèches horizontales introuvable');
  assert.doesNotMatch(
    horizontal[0],
    /showBar\(\)/,
    'un saut de 10 s ne doit jamais ouvrir la barre',
  );
});

test('le Retour ferme du plus imbriqué au moins imbriqué', async () => {
  const remote = await read('src/tv/player/useTvPlayerRemote.ts');
  const handler = remote.match(/const handleBack = \(\) => \{[\s\S]*?\n {4}\};/);
  assert.ok(handler, 'handleBack introuvable');

  // Ordre attendu : fenêtre ouverte, puis surcouche, puis sortie du lecteur.
  // Et on ferme la fenêtre par SON bouton : rien n'écoute Échap, le Retour
  // repartirait au shell qui reculerait dans l'historique.
  const body = handler[0];
  const dialog = body.indexOf('openDialog()');
  const overlay = body.indexOf('setVisible(false)');
  const exit = body.indexOf('onExit()');
  assert.match(body, /dialog\.close/);
  assert.ok(dialog >= 0 && overlay > dialog && exit > overlay, `ordre incorrect :\n${body}`);
});

test('la fenêtre retenue est la plus englobante', async () => {
  const remote = await read('src/tv/player/useTvPlayerRemote.ts');

  // Le contenu de l'onglet Qualité porte lui aussi `data-source-menu`. Retenir
  // la première correspondance enfermait le focus dans la liste des qualités et
  // rendait les onglets d'en-tête inatteignables.
  assert.match(remote, /other\.root\.contains\(candidate\.root\)/);
});

test('le Retour ne quitte jamais la lecture tant qu\'une fenêtre est ouverte', async () => {
  const remote = await read('src/tv/player/useTvPlayerRemote.ts');
  const handler = remote.match(/const handleBack = \(\) => \{[\s\S]*?\n {4}\};/);
  assert.ok(handler, 'handleBack introuvable');

  // Le bouton attendu peut ne pas être monté selon l'onglet actif : sans repli,
  // le Retour retombait sur onExit() et sortait du film.
  assert.match(handler[0], /TV_DIALOG_CLOSERS/);
  const body = handler[0];
  assert.ok(
    body.indexOf('return;') < body.indexOf('onExit()'),
    'le retour anticipé doit précéder onExit()',
  );
});

test('les pannes muettes du téléviseur sont expliquées', async () => {
  const [diagnostic, player] = await Promise.all([
    read('src/tv/player/useTvPlaybackDiagnostic.ts'),
    read('src/components/HLSPlayer.tsx'),
  ]);

  // Deux cas mesurés sur la TV de référence : aucun Widevine, pas de décodeur
  // E-AC-3. Ils produisent un écran noir ou une image muette que rien
  // n'explique — d'où un message plutôt qu'un contournement impossible.
  assert.match(diagnostic, /MEDIA_ERR_SRC_NOT_SUPPORTED/);
  assert.match(diagnostic, /MEDIA_ERR_DECODE/);
  assert.match(diagnostic, /ec-3/);

  assert.match(player, /useTvPlaybackDiagnostic\(\{/);
  assert.match(player, /<TvPlaybackNotice issue=\{tvPlaybackIssue\} \/>/);
});

test('la liste des réglages coupe la propagation vers le hook', async () => {
  const [remote, row] = await Promise.all([
    read('src/tv/player/useTvPlayerRemote.ts'),
    read('src/components/player/settings/PlayerSettingsRow.tsx'),
  ]);

  // `useTvPlayerRemote` écoute les flèches sur window et y refait une navigation
  // géométrique. Sans stopPropagation, chaque appui déplacerait le focus deux
  // fois : une par la liste, une par le hook.
  const handler = row.match(/const onKeyDown = useCallback\([\s\S]*?\n {2}\);/);
  assert.ok(handler, 'gestionnaire de touches introuvable');
  assert.match(handler[0], /if \(!event\.key\.startsWith\('Arrow'\)\) return;\s*\n[\s\S]{0,600}?event\.stopPropagation\(\);/);

  // Entrée et Espace : le bouton s'active nativement, mais `navigateDialog` ne
  // doit pas déclencher un second `current.click()`.
  assert.match(handler[0], /event\.key === 'Enter' \|\| event\.key === ' '[\s\S]{0,120}?stopPropagation/);

  // Le hook, lui, reste ignorant du panneau : la coupure se fait en amont.
  assert.doesNotMatch(remote, /data-settings-row/);

  // La barre d'onglets ayant disparu, la préférence d'onglet actif est du code mort.
  assert.doesNotMatch(remote, /data-settings-tab/);
});

test('Retour est reconnu sur les téléviseurs sans shell natif', async () => {
  const [keys, row, nav] = await Promise.all([
    read('src/components/player/settings/tvBackKeys.ts'),
    read('src/components/player/settings/PlayerSettingsRow.tsx'),
    read('src/components/player/settings/PlayerSettingsNav.tsx'),
  ]);

  // Android TV relaie Retour en `movix-tv-back` ; Tizen et webOS l'envoient en
  // keydown avec un code propriétaire que le hook ne traite pas.
  assert.match(keys, /10009/);
  assert.match(keys, /461/);

  // Les niveaux migrés le traitent dans la liste, les blocs historiques via le
  // filet posé par la coquille.
  assert.match(row, /isTvBackKey\(event\.nativeEvent\)/);
  assert.match(nav, /if \(!isTvBackKey\(event\)\) return;/);
  assert.match(nav, /panelRef\.current\?\.contains\(target\)/);

  // Retour recouvre Backspace : il ne doit pas remonter d'un niveau pendant
  // qu'on corrige une frappe.
  assert.match(nav, /isEditableTarget\(target\)/);
});

test('le panneau garde une cible pour le Retour à tous les niveaux', async () => {
  const nav = await read('src/components/player/settings/PlayerSettingsNav.tsx');

  // Le Retour de la télécommande clique `[data-player-settings-close]`. Si ce
  // bouton n'existait qu'à partir du niveau 2, le Retour n'aurait aucune cible
  // à la racine et reculerait dans l'historique — donc quitterait la lecture.
  const header = nav.match(/<button[\s\S]*?data-player-settings-close[\s\S]*?<\/button>/);
  assert.ok(header, 'bouton de fermeture introuvable');
  assert.doesNotMatch(
    header[0],
    /^\s*\{canPop &&/,
    'le bouton de fermeture ne doit pas être conditionné à la profondeur',
  );
  assert.match(header[0], /onClick=\{back\}/);
});

test('OK lance la lecture tant qu\'aucun bouton n\'est sélectionné', async () => {
  const remote = await read('src/tv/player/useTvPlayerRemote.ts');

  // Sans cet état, OK activait toujours un bouton : il fallait refermer la
  // barre pour reprendre la lecture, alors que c'est le geste le plus courant.
  assert.match(remote, /useState<number \| null>\(null\)/);

  const enter = remote.match(/case 'Enter':[\s\S]*?\n {10}return;/);
  assert.ok(enter, 'bloc Entrée introuvable');
  assert.match(
    enter[0],
    /visible && focusedAction !== null/,
    'OK ne doit activer un bouton que si un bouton est sélectionné',
  );
  assert.match(enter[0], /onTogglePlay\(\)/);

  // Ouvrir la barre ne doit pas présélectionner : sinon le premier OK saute de
  // 10 s au lieu de mettre en pause.
  const show = remote.match(/const showBar = useCallback\([\s\S]*?\n {2}\}, \[armTimer\]\);/);
  assert.ok(show, 'showBar introuvable');
  assert.match(show[0], /setFocusedAction\(null\)/);
});

test('la rangée de boutons forme un anneau, sans flèche morte', async () => {
  const remote = await read('src/tv/player/useTvPlayerRemote.ts');
  const horizontal = remote.match(/case 'ArrowRight': \{[\s\S]*?\n {10}return;/);
  assert.ok(horizontal, 'bloc des flèches horizontales introuvable');

  // Entrer par les deux bords, et en ressortir vers « rien de sélectionné ».
  assert.match(horizontal[0], /step > 0 \? 0 : actionCount - 1/);
  assert.match(horizontal[0], /next < 0 \|\| next >= actionCount\) return null/);
});

test('la barre reste sobre : trois boutons et la qualité en indicateur', async () => {
  const player = await read('src/components/HLSPlayer.tsx');
  const actions = player.match(/tvActionsRef\.current = isTvPlayback[\s\S]*?\n {4}: \[\];/);
  assert.ok(actions, 'jeu de boutons TV introuvable');

  assert.match(actions[0], /id: 'rewind'/);
  assert.match(actions[0], /id: 'forward'/);
  assert.match(actions[0], /id: 'settings'/);

  // Lecture/Pause a sa touche dédiée et OK s'en charge : lui garder un bouton
  // rallongeait le trajet vers les réglages sans rien apporter.
  assert.doesNotMatch(actions[0], /id: 'playpause'/);

  // La roue crantée ouvre sur la qualité, pas sur le premier onglet venu.
  const settings = actions[0].match(/id: 'settings'[\s\S]*?\},/);
  assert.match(settings[0], /setSettingsTab\('quality'\)/);

  // La qualité s'affiche, mais ne se focalise pas : c'est une information.
  const controls = await read('src/tv/player/TvPlayerControls.tsx');
  assert.match(controls, /TvQualityBadge/);
  assert.doesNotMatch(controls, /focused=\{[^}]*\}\s*\/>\s*\)\}\s*\{qualityLabel/);
});

test('chaque type de lecture existe dans handleSourceChange', async () => {
  const [tree, player] = await Promise.all([
    read('src/components/player/settings/useSourceTree.ts'),
    read('src/components/HLSPlayer.tsx'),
  ]);

  // Un type déclaré ici mais absent du lecteur donne une source qui s'affiche
  // et ne joue pas — panne muette.
  const types = new Set([
    ...[...tree.matchAll(/childType: '([a-z0-9_]+)'/g)].map(m => m[1]),
  ]);
  types.delete('vostfr'); // pas de branche dédiée : le lecteur garde l'URL passée
  // Déprécié en amont (`DEPRECATED_SOURCE_IDS`) : plus de branche de lecture,
  // et l'arbre de sources ne doit donc rien en attendre.
  types.delete('rivestream');
  assert.ok(types.size >= 12, `trop peu de types relevés : ${[...types]}`);
  for (const type of types) {
    assert.ok(
      player.includes(`sourceType === '${type}'`),
      `handleSourceChange ne connaît pas le type « ${type} »`,
    );
  }

  // Viper et Vox lisent un index nu ; les autres découpent sur « _ ». Se tromper
  // de forme donne un NaN, et la lecture repart sur l'URL de repli.
  const bare = tree.match(/const BARE_ID_TYPES = new Set\(\[[^\]]*\]\)/);
  assert.ok(bare, 'BARE_ID_TYPES introuvable');
  assert.deepEqual([...bare[0].matchAll(/'([a-z]+)'/g)].map(m => m[1]).sort(), ['viper', 'vox']);
  for (const type of ['viper', 'vox']) {
    assert.match(
      player,
      new RegExp(`sourceType === '${type}'\\)[\\s\\S]{0,120}?parseInt\\(sourceId(, 10)?\\)`),
      `le lecteur n'attend pas un index nu pour « ${type} »`,
    );
  }
});

test('l\'index envoyé au lecteur est celui de la liste non triée', async () => {
  const tree = await read('src/components/player/settings/useSourceTree.ts');

  // `handleSourceChange` relit la liste d'origine à l'index encodé dans
  // l'identifiant. L'ancien menu affichait la liste triée et passait l'index de
  // cette liste triée : dès que le tri déplaçait une ligne, on lançait un autre
  // hébergeur que celui cliqué.
  assert.match(tree, /const direct = origin\.raw\.indexOf\(item\);/);
  assert.match(tree, /origin\.raw\.findIndex\(candidate => spec\.url\(candidate\) === url\)/);
  assert.match(tree, /const origin = resolveOrigin\(spec, item, url, context, index\);/);

  // Les cinq listes réordonnées par `enrichAndSort` doivent toutes déclarer
  // leur liste d'origine, sinon l'index reste celui de l'affichage.
  for (const raw of [
    'ctx.darkinoSources', 'ctx.purstreamSources', 'ctx.viperSources',
    'ctx.voxSources', 'ctx.nexusHlsSources', 'ctx.nexusFileSources',
  ]) {
    assert.ok(tree.includes(`raw: ${raw}`), `origine manquante : ${raw}`);
  }

  // Nexus fusionne deux listes à l'affichage mais garde deux origines : sinon un
  // fichier serait cherché dans la liste des flux.
  const nexus = tree.match(/id: 'nexus_hls',[\s\S]*?\n {2}\},/);
  assert.ok(nexus, 'fournisseur Nexus introuvable');
  assert.match(nexus[0], /childType: 'nexus_hls', raw: ctx\.nexusHlsSources/);
  assert.match(nexus[0], /childType: 'nexus_file', raw: ctx\.nexusFileSources/);
});

test('chaque menu déroulant du lecteur a son fournisseur', async () => {
  const [tree, player] = await Promise.all([
    read('src/components/player/settings/useSourceTree.ts'),
    read('src/components/HLSPlayer.tsx'),
  ]);

  // Ces types ne jouent rien : `handleSourceChange` bascule un état et retourne.
  // Sans fournisseur déclaré, la ligne tombe dans la branche « lecture directe »
  // et devient un bouton qui ne répond pas.
  const guard = player.match(/if \(sourceType === 'darkino_main'[\s\S]*?\) \{/);
  assert.ok(guard, 'condition de bascule introuvable dans handleSourceChange');
  const menuTypes = [...guard[0].matchAll(/'([a-z0-9_]+_main)'/g)].map(m => m[1]);

  const declared = new Set([...tree.matchAll(/mainType: '([a-z0-9_]+)'/g)].map(m => m[1]));
  for (const type of menuTypes) {
    assert.ok(declared.has(type), `aucun fournisseur pour « ${type} » — ligne morte`);
  }
});

test('l\'épinglage passe par la table officielle, pas par nos identifiants', async () => {
  const [tree, priority] = await Promise.all([
    read('src/components/player/settings/useSourceTree.ts'),
    read('src/types/sourcePriority.ts'),
  ]);

  const union = priority.match(/TOP_LEVEL_SOURCE_IDS = \[[\s\S]*?\] as const;/);
  assert.ok(union, 'union introuvable');

  // Tout id d'épinglage déclaré en dur doit exister dans l'union.
  for (const [, pin] of tree.matchAll(/pinId: '([a-z0-9_]+)'/g)) {
    assert.ok(union[0].includes(`'${pin}'`), `pinId « ${pin} » absent de TOP_LEVEL_SOURCE_IDS`);
  }

  // Rivestream mappe vers un id déprécié : l'épingle serait retirée au
  // chargement suivant, donc la ligne n'en propose pas.
  const rive = tree.match(/id: 'rivestream',[\s\S]*?\n {2}\},/);
  assert.ok(rive, 'fournisseur Rivestream introuvable');
  assert.match(rive[0], /pinId: null/);
  assert.match(priority, /DEPRECATED_SOURCE_IDS = \[[^\]]*'rivestream_hls'/);

  // Et à défaut de déclaration, on interroge la table plutôt que d'inventer.
  assert.match(tree, /pinnableTopLevelId\(spec\.mainType\)/);
});

test('la source VO/VOSTFR reste atteignable sans son ancien menu', async () => {
  const [tree, player] = await Promise.all([
    read('src/components/player/settings/useSourceTree.ts'),
    read('src/components/HLSPlayer.tsx'),
  ]);

  // L'ancien menu `showVostfrMenu` subsiste en amont, pour la chrome souris :
  // on ne lui demande plus de disparaître, seulement que le panneau téléviseur
  // atteigne la source sans lui.
  // Ce ne sont pas des sources de premier niveau : ce sont les liens de
  // `vostfr_main`, et le lecteur attend leur identifiant propre, pas un index.
  assert.match(tree, /mainType: 'vostfr_main'/);
  assert.match(tree, /list: ctx => ctx\.vostfrEntries/);
  assert.match(tree, /if \(spec\.id === 'vostfr'\) return String\(item\.id \?\? index\);/);
});

test('l\'hébergeur est détecté même sur les listes non enrichies', async () => {
  const [tree, panel] = await Promise.all([
    read('src/components/player/settings/useSourceTree.ts'),
    read('src/components/HLSPlayerSettingsPanelTv.tsx'),
  ]);

  // Seules darkino, nexus, viper, vox et bravo portent un champ `type`. Sans
  // repli, l'épinglage d'hébergeur ne marcherait que sur cinq fournisseurs.
  assert.match(tree, /detectHosterFromUrl\?\.\(url, label\)/);
  // Depuis le patch amont des sous-titres natifs, le panneau passe la fonction
  // depuis son arbre de sources plutôt que par destructuration directe.
  assert.match(panel, /^\s+detectHosterFromUrl(?:: sources\.detectHosterFromUrl)?,$/m);
});

test('l\'indicateur de saut annonce les secondes réelles, pas les appuis', async () => {
  const [player, remote] = await Promise.all([
    read('src/components/HLSPlayer.tsx'),
    read('src/tv/player/useTvPlayerRemote.ts'),
  ]);

  // Les touches média sautent de 30 s, les flèches de 10. L'encart comptait les
  // appuis ×10 : deux sauts de 30 s annonçaient « +20 s ».
  assert.match(remote, /onSeek\(30\)/);
  assert.match(remote, /onSeek\(event\.key === 'ArrowRight' \? 10 : -10\)/);

  assert.match(player, /setForwardSkipSeconds\(prev => prev \+ seconds\)/);
  assert.match(player, /setRewindSkipSeconds\(prev => prev \+ Math\.abs\(seconds\)\)/);
  assert.match(player, /seconds=\{forwardSkipSeconds\}/);
  assert.match(player, /seconds=\{rewindSkipSeconds\}/);

  // Remise à zéro en fin de rafale, sinon le cumul repart du saut précédent.
  assert.match(player, /setForwardClickCount\(0\);\s*\n\s*setForwardSkipSeconds\(0\);/);
  assert.match(player, /setRewindClickCount\(0\);\s*\n\s*setRewindSkipSeconds\(0\);/);

  // Les `key` distinguent les deux branches : sans elles, framer-motion ne voit
  // qu'un seul enfant et la sortie ne se joue pas.
  // Seules les branches TV nous appartiennent ; le balisage souris est celui de
  // l'amont et n'a pas à être figé ici.
  assert.match(player, /key="tv-seek-forward"/);
  assert.match(player, /key="tv-seek-rewind"/);

  // La chrome souris reste intacte.
  assert.match(player, /<FastForward size=\{window\.innerWidth < 768 \? 44 : 52\}/);
});

test('les lecteurs iframe gardent les flèches dans l\'interface TV', async () => {
  const [external, movie, tv, activity, keyMap, shim] = await Promise.all([
    read('src/tv/player/useTvExternalPlayerRemote.ts'),
    read('src/pages/Watch/WatchMovie.tsx'),
    read('src/pages/Watch/WatchTv.tsx'),
    read('app/android/app/src/main/java/com/movix/app/MainActivity.kt'),
    read('app/android/app/src/main/java/com/movix/app/device/TvRemoteKeyMap.kt'),
    read('app/src/injection/tv-shim.ts'),
  ]);

  // L'activité avale les flèches même quand l'iframe cross-origin a le focus,
  // puis le shim les recrée dans le document Movix.
  assert.match(activity, /override fun dispatchKeyEvent/);
  for (const action of ['dpadup', 'dpaddown', 'dpadleft', 'dpadright']) {
    assert.match(keyMap, new RegExp(`"${action}"`));
    assert.match(shim, new RegExp(`${action}: 'Arrow`));
  }

  // Haut ouvre les épisodes d'une série ; les autres flèches ouvrent les
  // sources au lieu de modifier le volume ou le seek du lecteur tiers.
  assert.match(external, /event\.key === 'ArrowUp' && onOpenEpisodes/);
  assert.match(external, /onOpenSources\(\)/);
  assert.match(movie, /useTvExternalPlayerRemote\(\{/);
  assert.match(tv, /onOpenEpisodes: openExternalEpisodes/);
});

test('le menu des saisons et épisodes capture la navigation du lecteur', async () => {
  const [remote, player, tv] = await Promise.all([
    read('src/tv/player/useTvPlayerRemote.ts'),
    read('src/components/HLSPlayer.tsx'),
    read('src/pages/Watch/WatchTv.tsx'),
  ]);

  assert.match(remote, /root: '\[data-tv-episode-menu\]'/);
  for (const source of [player, tv]) {
    assert.match(source, /data-tv-episode-menu/);
    assert.match(source, /data-tv-episode-menu-close/);
  }
});
