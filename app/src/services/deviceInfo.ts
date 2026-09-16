import { NativeModules, Platform } from 'react-native';

interface DeviceInfoNativeModule {
  isTv?: boolean;
}

/**
 * Vrai sur Android TV / box leanback.
 *
 * Lu depuis getConstants() du module natif, donc disponible synchronement dès le
 * premier rendu : le User-Agent de la WebView en dépend et ne peut pas attendre
 * un aller-retour de bridge.
 */
export const IS_TV: boolean =
  Platform.OS === 'android' &&
  (NativeModules.MovixDeviceInfo as DeviceInfoNativeModule | undefined)?.isTv === true;
