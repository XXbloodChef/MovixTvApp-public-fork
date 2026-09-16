package com.movix.app.device

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.concurrent.CopyOnWriteArrayList

/**
 * Relais des touches média de la télécommande vers le JS.
 *
 * MainActivity intercepte les keycodes dans dispatchKeyEvent (la WebView ne les
 * reçoit pas : Chromium ne convertit pas les touches média en événements DOM),
 * puis appelle [dispatchRemoteKey]. Le JS réémet l'action dans la page via
 * injectJavaScript — même chemin que les shims Cast et PiP.
 */
class TvRemoteModule(
    private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

    init {
        register(this)
    }

    override fun getName() = "MovixTvRemote"

    // Requis par NativeEventEmitter côté JS ; l'abonnement réel se fait via
    // DeviceEventEmitter, ces méthodes existent juste pour éviter le warning RN.
    @ReactMethod
    fun addListener(eventName: String) = Unit

    @ReactMethod
    fun removeListeners(count: Double) = Unit

    override fun invalidate() {
        unregister(this)
        super.invalidate()
    }

    private fun emit(action: String) {
        if (!reactContext.hasActiveReactInstance()) return
        val payload = Arguments.createMap().apply { putString("action", action) }
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(EVENT_NAME, payload)
    }

    companion object {
        const val EVENT_NAME = "MovixTvRemoteKey"

        // CopyOnWriteArrayList : dispatchKeyEvent tourne sur le thread UI pendant
        // que l'instanciation/invalidation du module vient du thread natif RN.
        private val instances = CopyOnWriteArrayList<TvRemoteModule>()

        private fun register(module: TvRemoteModule) {
            instances.addIfAbsent(module)
        }

        private fun unregister(module: TvRemoteModule) {
            instances.remove(module)
        }

        /**
         * true si la touche est relayée au JS, et donc à ne pas propager au
         * système (sinon le lecteur natif de la TV réagit en parallèle).
         *
         * Faux tant qu'aucun module n'est vivant : au boot, ou après un reload du
         * bundle, mieux vaut laisser la TV gérer la touche que l'avaler.
         */
        fun isRemoteKey(keyCode: Int): Boolean =
            TvRemoteKeyMap.actionFor(keyCode) != null && instances.isNotEmpty()

        fun dispatchRemoteKey(keyCode: Int) {
            val action = TvRemoteKeyMap.actionFor(keyCode) ?: return
            instances.forEach { it.emit(action) }
        }
    }
}
