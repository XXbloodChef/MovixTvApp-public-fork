package com.movix.app.device

import android.app.UiModeManager
import android.content.Context
import android.content.pm.PackageManager
import android.content.res.Configuration
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Expose au JS le type d'appareil sur lequel tourne le shell.
 *
 * `isTv` est publié via getConstants() et non via une méthode async : le choix
 * du User-Agent doit être fait avant le premier rendu de la WebView, donc on ne
 * peut pas attendre un aller-retour de bridge.
 */
class DeviceInfoModule(
    private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

    // Préfixe obligatoire : React Native enregistre déjà un module natif nommé
    // "DeviceInfo" (com.facebook.react.modules.deviceinfo.DeviceInfoModule, qui
    // alimente Dimensions). Sans préfixe, le registre refuse le doublon et l'app
    // crashe au démarrage.
    override fun getName() = "MovixDeviceInfo"

    override fun getConstants(): Map<String, Any> = mapOf(
        "isTv" to isTelevision(reactContext),
    )

    @ReactMethod
    fun getIsTv(promise: Promise) {
        promise.resolve(isTelevision(reactContext))
    }

    companion object {
        // Constante string plutôt que PackageManager.FEATURE_TELEVISION, qui est
        // deprecated depuis API 21 mais toujours remontée par certains firmwares
        // constructeur (Philips/TCL) qui ne déclarent pas FEATURE_LEANBACK.
        private const val FEATURE_TYPE_TELEVISION = "android.hardware.type.television"

        fun isTelevision(context: Context): Boolean {
            val uiModeManager =
                context.getSystemService(Context.UI_MODE_SERVICE) as? UiModeManager
            if (uiModeManager?.currentModeType == Configuration.UI_MODE_TYPE_TELEVISION) {
                return true
            }

            val packageManager = context.packageManager
            return packageManager.hasSystemFeature(PackageManager.FEATURE_LEANBACK) ||
                packageManager.hasSystemFeature(FEATURE_TYPE_TELEVISION)
        }
    }
}
