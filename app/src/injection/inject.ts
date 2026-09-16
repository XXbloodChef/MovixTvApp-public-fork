import { buildBridgeRuntime } from './bridge-runtime';
import {
  buildPictureInPictureShim,
  type PictureInPictureShimMode,
} from './picture-in-picture-shim';
import { buildPlaybackAwakeShim } from './playback-awake-shim';
import { buildTvShim } from './tv-shim';
import { USERSCRIPT_SOURCE } from './userscript-source';

export function buildInjectedJavaScript(
  options: {
    pictureInPictureMode?: PictureInPictureShimMode;
    mediaProxyRoutingEnabled?: boolean;
    mediaProxyCapabilityEnabled?: boolean;
    mediaProxyXhrRoutingEnabled?: boolean;
    journalConsoleEnabled?: boolean;
    mediaProxyScheme?: string | null;
    isTv?: boolean;
  } = {},
): string {
  const pipShim = buildPictureInPictureShim(
    options.pictureInPictureMode ?? 'disabled',
  );
  const playbackAwakeShim = buildPlaybackAwakeShim();
  // Position libre parmi les shims : le site lit `MovixNative.isTv` et la classe
  // `.movix-tv` depuis son bootstrap, qui s'exécute après tous les shims.
  // (Le shim Cast, jadis en tête, a été retiré : pas de Chromecast sur TV.)
  const tvShim = buildTvShim(options.isTv === true);
  const bridge = buildBridgeRuntime({
    mediaProxyRoutingEnabled: options.mediaProxyRoutingEnabled,
    mediaProxyCapabilityEnabled: options.mediaProxyCapabilityEnabled,
    mediaProxyXhrRoutingEnabled: options.mediaProxyXhrRoutingEnabled,
    journalConsoleEnabled: options.journalConsoleEnabled,
    mediaProxyScheme: options.mediaProxyScheme,
  });

  return `
${pipShim}

${playbackAwakeShim}

${tvShim}

${bridge}

// --- Userscript Movix ---
${USERSCRIPT_SOURCE}

true;
`;
}
