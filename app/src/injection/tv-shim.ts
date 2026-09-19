/**
 * Injecté avant le code du site pour lui signaler qu'il tourne sur une TV.
 *
 * Sert deux choses :
 *  - `window.MovixNative.isTv` : détection fiable côté web, sans deviner via le
 *    User-Agent (les UA des TV constructeur sont incohérents).
 *  - `movix-tv-remote` : les touches média de la télécommande, relayées par le
 *    shell. Sur l'Edenwood (WebView 152) Chromium les convertit aussi en
 *    `keydown` (`MediaPlayPause`…), et c'est ce chemin que le lecteur écoute en
 *    premier ; ce relais reste un secours pour un WebView qui ne le ferait pas.
 *    Les flèches, Enter et Back arrivent nativement en `keydown` et ne passent
 *    pas par ici.
 */
export function buildTvShim(isTv: boolean): string {
  return `
(function() {
  'use strict';
  if (${isTv === true ? 'false' : 'true'}) return;
  if (window.__MOVIX_TV_SHIM_INSTALLED__) return;
  window.__MOVIX_TV_SHIM_INSTALLED__ = true;

  var existing = window.MovixNative;
  var native = (existing && typeof existing === 'object') ? existing : {};
  native.isTv = true;
  native.platform = 'android-tv';
  window.MovixNative = native;

  // Marqueur CSS : permet au site de cibler la TV avant même que React ait
  // monté (fond noir, curseur masqué, pas d'animation au premier paint).
  var root = document.documentElement;
  if (root && root.classList) root.classList.add('movix-tv');

  window.addEventListener('__MOVIX_TV_REMOTE__', function(event) {
    var detail = event && event.detail;
    if (!detail || typeof detail !== 'object') return;
    if (typeof detail.action !== 'string') return;
    var dpadKeys = {
      dpadup: 'ArrowUp',
      dpaddown: 'ArrowDown',
      dpadleft: 'ArrowLeft',
      dpadright: 'ArrowRight'
    };
    var dpadKey = dpadKeys[detail.action];
    if (dpadKey) {
      window.dispatchEvent(new KeyboardEvent('keydown', {
        key: dpadKey,
        code: dpadKey,
        bubbles: true,
        cancelable: true
      }));
      return;
    }
    window.dispatchEvent(new CustomEvent('movix-tv-remote', {
      detail: { action: detail.action }
    }));
  });

  // Négociation du Retour. La page déclare à l'avance qu'elle a quelque chose à
  // fermer ; le shell, qui doit répondre de façon synchrone à BackHandler, se
  // contente de lire ce drapeau. Sans déclaration, Retour recule dans
  // l'historique comme d'habitude.
  var backEnabled = false;
  function postBackState() {
    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'TV_BACK_INTERCEPT',
        capability: 'MOVIX_TV_BACK_V1',
        enabled: backEnabled
      }));
    }
  }

  native.setBackInterception = function(enabled) {
    enabled = enabled === true;
    if (enabled === backEnabled) return;
    backEnabled = enabled;
    postBackState();
  };

  // Le shell efface ses capacités a chaque navigation de frame principale, y
  // compris quand isTopFrame est indefini. Sans cette resynchronisation, la page
  // continuait de croire son drapeau pose alors que le shell l'avait oublie :
  // le Retour repartait alors dans l'historique et sortait de la lecture.
  window.addEventListener('__MOVIX_TV_BACK_RESYNC__', function() {
    postBackState();
  });

  window.addEventListener('__MOVIX_TV_BACK__', function() {
    window.dispatchEvent(new CustomEvent('movix-tv-back'));
  });

  // Un rechargement laisserait le drapeau levé côté natif alors que plus
  // personne n'écoute : le shell l'efface aussi à chaque navigation.
  window.addEventListener('pagehide', function() {
    native.setBackInterception(false);
  });
})();
true;
`;
}
