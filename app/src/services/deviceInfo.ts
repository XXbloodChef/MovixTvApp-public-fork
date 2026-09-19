import { Platform } from 'react-native';

/**
 * Ce shell Android est exclusivement destiné aux téléviseurs.
 *
 * Ne pas dépendre des drapeaux `FEATURE_LEANBACK` du constructeur : plusieurs
 * firmwares TCL/Philips incomplets ne les déclarent pas et feraient alors
 * charger la version téléphone du site. iOS conserve son comportement mobile.
 */
export const IS_TV: boolean = Platform.OS === 'android';
