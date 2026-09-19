package com.movix.app

import android.app.PictureInPictureUiState
import android.content.res.Configuration
import android.os.Build
import android.view.KeyEvent
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import com.movix.app.playback.PlaybackAwakeModule
import com.movix.app.pip.AndroidPictureInPictureHost
import com.movix.app.pip.PictureInPictureController
import com.movix.app.device.TvRemoteModule

class MainActivity : ReactActivity() {
    internal val pictureInPictureController by lazy {
        PictureInPictureController(AndroidPictureInPictureHost(this))
    }

    override fun getMainComponentName(): String = "Movix"

    override fun createReactActivityDelegate(): ReactActivityDelegate =
        DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

    /**
     * Relaie les touches TV au document principal de la WebView. C'est surtout
     * indispensable pour les flèches : une iframe d'un hébergeur vidéo est un
     * document séparé et ses keydown ne peuvent pas remonter à Movix.
     */
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (TvRemoteModule.isRemoteKey(event.keyCode)) {
            if (event.action == KeyEvent.ACTION_DOWN) {
                TvRemoteModule.dispatchRemoteKey(event.keyCode)
            }
            // ACTION_UP est aussi absorbé pour que le lecteur tiers ne voie
            // jamais la moitié d'une pression déjà traitée par Movix.
            return true
        }
        return super.dispatchKeyEvent(event)
    }

    override fun onUserLeaveHint() {
        pictureInPictureController.onUserLeaveHint()
        super.onUserLeaveHint()
    }

    override fun onPictureInPictureRequested(): Boolean =
        pictureInPictureController.onPictureInPictureRequested()

    override fun onPictureInPictureModeChanged(active: Boolean, config: Configuration) {
        super.onPictureInPictureModeChanged(active, config)
        pictureInPictureController.onPictureInPictureModeChanged(active)
    }

    override fun onPictureInPictureUiStateChanged(pipState: PictureInPictureUiState) {
        super.onPictureInPictureUiStateChanged(pipState)
        if (Build.VERSION.SDK_INT >= 35) {
            pictureInPictureController.onPictureInPictureUiStateChanged(
                pipState.isTransitioningToPip,
            )
        }
    }

    override fun onResume() {
        super.onResume()
        pictureInPictureController.onResume(isInPictureInPictureMode)
    }

    override fun onDestroy() {
        pictureInPictureController.destroy()
        PlaybackAwakeModule.clearActivityFlag(this)
        super.onDestroy()
    }
}
