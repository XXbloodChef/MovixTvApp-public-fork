/**
 * Bloqueur de publicités de l'application TV (natif, dans le WebView).
 *
 * L'API `window.movixNativeAdBlock` est posée par le pont de l'application
 * (app/src/injection/bridge-runtime.ts). Hors application — site souris,
 * navigateur — elle n'existe pas et tout renvoie `null`.
 */
export interface NativeAdBlockState {
  enabled: boolean;
  blocked: number;
  recent: string[];
}

interface BridgeReply {
  success: boolean;
  value?: NativeAdBlockState;
  error?: string;
}

declare global {
  interface Window {
    movixNativeAdBlock?: {
      getState: () => Promise<BridgeReply>;
      setEnabled: (enabled: boolean) => Promise<BridgeReply>;
    };
  }
}

export function hasNativeAdBlock(): boolean {
  return typeof window !== 'undefined' && !!window.movixNativeAdBlock;
}

export async function getNativeAdBlockState(): Promise<NativeAdBlockState | null> {
  const api = window.movixNativeAdBlock;
  if (!api) return null;
  const reply = await api.getState();
  return reply.success && reply.value ? reply.value : null;
}

export async function setNativeAdBlockEnabled(enabled: boolean): Promise<NativeAdBlockState | null> {
  const api = window.movixNativeAdBlock;
  if (!api) return null;
  const reply = await api.setEnabled(enabled);
  return reply.success && reply.value ? reply.value : null;
}
