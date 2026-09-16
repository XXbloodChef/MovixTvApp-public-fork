package com.movix.app.device

import android.view.KeyEvent

/**
 * Traduit les keycodes de télécommande TV en noms d'actions consommables par le
 * site dans la WebView.
 *
 * Ne mappe QUE les touches que la WebView ne reçoit pas déjà toute seule.
 * Les flèches directionnelles, Enter/Center et Back sont converties nativement
 * par Chromium en `keydown` (ArrowUp/…/Enter) et en navigation d'historique :
 * les intercepter ici casserait la navigation spatiale de la page.
 */
object TvRemoteKeyMap {
    fun actionFor(keyCode: Int): String? = when (keyCode) {
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
