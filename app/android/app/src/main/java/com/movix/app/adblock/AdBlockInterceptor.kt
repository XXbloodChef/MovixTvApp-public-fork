package com.movix.app.adblock

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import com.reactnativecommunity.webview.RNCWebViewClient
import java.io.ByteArrayInputStream
import java.util.ArrayDeque
import java.util.concurrent.atomic.AtomicInteger

/**
 * Bloqueur de publicités natif : branché sur `shouldInterceptRequest` du
 * client WebView (hook ajouté par notre patch de react-native-webview), il
 * voit TOUTES les requêtes, y compris celles des iframes des hébergeurs —
 * là où le userscript, confiné à la page Movix, ne voit rien.
 *
 * Une requête vers un hôte de [AdBlockList] reçoit une réponse vide (204)
 * au lieu d'atteindre le réseau. Aucune inspection de corps, aucun coût
 * sur les segments vidéo : seul l'hôte est comparé.
 *
 * L'état marche/arrêt est persisté côté natif pour être appliqué dès le
 * premier chargement, avant que le bundle JS ne soit prêt.
 */
object AdBlockInterceptor : RNCWebViewClient.RequestInterceptor {
    private const val TAG = "MovixAdBlock"
    private const val PREFS = "movix_adblock"
    private const val KEY_ENABLED = "enabled"
    private const val RECENT_MAX = 50

    @Volatile
    var enabled: Boolean = true
        private set

    private var prefs: SharedPreferences? = null
    private val blockedCount = AtomicInteger(0)
    private val recent = ArrayDeque<String>()


    fun install(context: Context) {
        val store = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        prefs = store
        enabled = store.getBoolean(KEY_ENABLED, true)
        RNCWebViewClient.requestInterceptor = this
        Log.i(TAG, "bloqueur installé (actif=$enabled, ${AdBlockList.HOSTS.size} domaines)")
    }

    fun setEnabled(value: Boolean) {
        enabled = value
        prefs?.edit()?.putBoolean(KEY_ENABLED, value)?.apply()
        Log.i(TAG, "bloqueur ${if (value) "activé" else "désactivé"}")
    }

    fun blockedTotal(): Int = blockedCount.get()

    fun recentHosts(): List<String> = synchronized(recent) { recent.toList() }

    fun resetStats() {
        blockedCount.set(0)
        synchronized(recent) { recent.clear() }
    }

    private val STATIC_EXTENSIONS = setOf(
        "m3u8", "ts", "m4s", "mp4", "webm", "mkv", "mp3", "aac", "m4a", "key",
        "vtt", "srt", "jpg", "jpeg", "png", "gif", "webp", "svg", "ico",
        "woff", "woff2", "ttf", "css",
    )

    private fun hostOf(url: String?): String? =
        try { url?.let { android.net.Uri.parse(it).host?.lowercase() } } catch (_: Throwable) { null }

    private fun extensionOf(path: String): String {
        val name = path.substringAfterLast('/')
        return if ('.' in name) name.substringAfterLast('.').lowercase() else ""
    }

    override fun intercept(view: WebView, request: WebResourceRequest): WebResourceResponse? {
        if (!enabled) return null
        val url = request.url ?: return null
        val host = url.host ?: return null
        val headers = request.requestHeaders ?: emptyMap()
        val accept = headers["Accept"] ?: ""
        val fetchDest = headers["Sec-Fetch-Dest"] ?: ""
        val path = url.path ?: ""
        val isDocument = fetchDest == "iframe" || fetchDest == "document" || accept.startsWith("text/html")
        val isScript = fetchDest == "script" || (fetchDest.isEmpty() && path.endsWith(".js"))

        // Recensement : `adb shell setprop log.tag.MovixAdBlock DEBUG` puis
        // `adb logcat -s MovixAdBlock` liste tout ce que chargent les iframes,
        // bloqué ou non — c'est ainsi qu'on alimente la liste.
        if (Log.isLoggable(TAG, Log.DEBUG)) {
            val referer = headers["Referer"] ?: headers["referer"] ?: "-"
            Log.d(TAG, "vu $host${path.take(80)} [${if (request.isForMainFrame) "main" else "sub"} dest=$fetchDest ref=${referer.take(60)} hdr=${headers.keys.joinToString(",")}]")
        }

        // Le Referer dit QUI demande : une page Movix (ou rien) → seule la liste
        // s'applique, le site garde TMDB, Firebase, Turnstile… ; un document
        // tiers (iframe d'un hébergeur, ou d'une régie) → règles strictes.
        val refererHost = hostOf(headers["Referer"] ?: headers["referer"])
        val inEmbed = refererHost != null && !AdBlockList.isAllowed(refererHost)

        val reason: String = when {
            AdBlockList.isBlocked(host) -> "liste"
            !inEmbed -> return null
            AdBlockList.isAllowed(host) -> return null
            // Navigation d'une iframe (redirection vers un miroir, sous-cadre) :
            // on laisse passer, les requêtes qu'elle émettra seront jugées.
            isDocument -> return null
            // Même marque que le document demandeur (uqload.is → uqload.vc) :
            // c'est le lecteur lui-même. Ses propres scripts de pub (pop.js,
            // vast.js) passent volontairement : les bloquer déclenche le message
            // « Disable ADBlock » d'Uqload (mesuré le 12/09/2026) ; privés des
            // régies tierces, refusées ci-dessous, ils n'ont rien à afficher.
            AdBlockList.siteOf(host) == AdBlockList.siteOf(refererHost!!) -> return null
            AdBlockList.isScriptCdn(host) -> return null
            extensionOf(path) in STATIC_EXTENSIONS -> return null
            isScript -> "script tiers"
            else -> "requête tierce"
        }

        blockedCount.incrementAndGet()
        synchronized(recent) {
            recent.addFirst(host)
            while (recent.size > RECENT_MAX) recent.removeLast()
        }
        Log.i(TAG, "bloqué ($reason) $host${path.take(60)}")

        return WebResourceResponse(
            "text/plain", "utf-8", 204, "No Content",
            emptyMap(), ByteArrayInputStream(ByteArray(0)),
        )
    }
}
