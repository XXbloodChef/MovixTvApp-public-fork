package com.movix.app.device

import android.view.KeyEvent

/**
 * Traduit les keycodes de télécommande TV en noms d'actions consommables par le
 * site dans la WebView.
 *
 * Les flèches sont relayées par le shell même si Chromium sait normalement les
 * convertir. Dès qu'une iframe cross-origin prend le focus, ses événements ne
 * remontent plus au document Movix : le lecteur tiers change alors son volume
 * ou son seek et notre menu Sources devient inaccessible. MainActivity avale
 * donc les quatre flèches et le shim les recrée dans la frame principale.
 * Enter/Center et Back restent natifs : OK doit encore pouvoir lancer un
 * lecteur externe, et Retour possède sa négociation dédiée.
 */
object TvRemoteKeyMap {
    fun actionFor(keyCode: Int): String? = when (keyCode) {
        KeyEvent.KEYCODE_DPAD_UP -> "dpadup"
        KeyEvent.KEYCODE_DPAD_DOWN -> "dpaddown"
        KeyEvent.KEYCODE_DPAD_LEFT -> "dpadleft"
        KeyEvent.KEYCODE_DPAD_RIGHT -> "dpadright"
        KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE -> "playpause"
        KeyEvent.KEYCODE_MEDIA_PLAY -> "play"
        KeyEvent.KEYCODE_MEDIA_PAUSE -> "pause"
        KeyEvent.KEYCODE_MEDIA_STOP -> "stop"
        KeyEvent.KEYCODE_MEDIA_REWIND -> "rewind"
        KeyEvent.KEYCODE_MEDIA_FAST_FORWARD -> "fastforward"
        KeyEvent.KEYCODE_MEDIA_NEXT -> "next"
        KeyEvent.KEYCODE_MEDIA_PREVIOUS -> "previous"
        KeyEvent.KEYCODE_CHANNEL_UP -> "channelup"
        KeyEvent.KEYCODE_CHANNEL_DOWN -> "channeldown"
        KeyEvent.KEYCODE_INFO -> "info"
        KeyEvent.KEYCODE_CAPTIONS -> "captions"
        KeyEvent.KEYCODE_GUIDE -> "guide"
        else -> null
    }
}
