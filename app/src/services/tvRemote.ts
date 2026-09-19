import { DeviceEventEmitter } from 'react-native';
import type { RefObject } from 'react';

interface InjectableRef {
  injectJavaScript: (script: string) => void;
}

const EVENT_NAME = 'MovixTvRemoteKey';

/**
 * Doit rester aligné sur TvRemoteKeyMap.kt.
 *
 * L'action est interpolée dans du JS injecté : on la valide contre cette liste
 * plutôt que de faire confiance au payload du bridge.
 */
const REMOTE_ACTIONS = [
  'dpadup',
  'dpaddown',
  'dpadleft',
  'dpadright',
  'playpause',
  'play',
  'pause',
  'stop',
  'rewind',
  'fastforward',
  'next',
  'previous',
  'channelup',
  'channeldown',
  'info',
  'captions',
  'guide',
] as const;

export type TvRemoteAction = (typeof REMOTE_ACTIONS)[number];

function isRemoteAction(value: unknown): value is TvRemoteAction {
  return (
    typeof value === 'string' &&
    (REMOTE_ACTIONS as readonly string[]).includes(value)
  );
}

/**
 * Relaie les touches média de la télécommande dans la page.
 *
 * @returns fonction de désabonnement
 */
export function startTvRemoteForwarding(
  webViewRef: RefObject<InjectableRef | null>,
): () => void {
  const subscription = DeviceEventEmitter.addListener(
    EVENT_NAME,
    (payload: unknown) => {
      const action = (payload as { action?: unknown } | null)?.action;
      if (!isRemoteAction(action)) return;
      webViewRef.current?.injectJavaScript(
        `window.dispatchEvent(new CustomEvent('__MOVIX_TV_REMOTE__', {` +
          `detail: { action: ${JSON.stringify(action)} }` +
          `})); true;`,
      );
    },
  );
  return () => subscription.remove();
}
