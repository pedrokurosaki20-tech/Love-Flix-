package com.loveflix.app

import android.net.Uri
import android.webkit.WebResourceResponse
import java.io.ByteArrayInputStream
import java.util.Locale

object AdBlocker {

    private val EMPTY_STREAM = ByteArray(0)

    private val TRUSTED_HOSTS = setOf(
        "love-flix.vercel.app",
        "image.tmdb.org",
        "api.themoviedb.org",
        "fonts.googleapis.com",
        "fonts.gstatic.com",
        "cdn.jsdelivr.net",
        "unpkg.com"
    )

    private val TRUSTED_HOST_SUFFIXES = listOf(
        ".supabase.co",
        ".supabase.in",
        ".vercel.app"
    )

    private val AD_HOST_SUBSTRINGS = listOf(
        "doubleclick.net",
        "googlesyndication.com",
        "googleadservices.com",
        "adservice.google.",
        "pagead2.",
        "googletagmanager.com",
        "google-analytics.com",
        "popads.net",
        "popcash.net",
        "propellerads.com",
        "propellerclick.com",
        "monetag.",
        "adsterra.",
        "effectivegatecpm.com",
        "highperformanceformat.com",
        "topcreativeformat.com",
        "profitabledisplaycontent.com",
        "admaven.",
        "exoclick.com",
        "exosrv.com",
        "realsrv.com",
        "juicyads.com",
        "trafficjunky.",
        "hilltopads.",
        "clickadu.",
        "galaksion.",
        "acscdn.com",
        "onclkds.",
        "onclicka.",
        "onclickmax.",
        "richpush.",
        "pushub.",
        "histats.com",
        "mc.yandex.ru",
        "yandexadexchange.",
        "taboola.com",
        "outbrain.com",
        "mgid.com",
        "criteo.com",
        "pubmatic.com",
        "rubiconproject.com",
        "openx.net",
        "smartadserver.com",
        "adroll.com",
        "2mdn.net",
        "scorecardresearch.com",
        "quantserve.com",
        "adnxs.com",
        "casalemedia.com",
        "bidswitch.net",
        "sharethrough.com",
        "revcontent.com",
        "adskeeper.",
        "adspyglass.",
        "tsyndicate.com",
        "magsrv.com",
        "betterbanner.",
        "whos.amung.us",
        "dtscout.com",
        "bidgear.com",
        "adtng.com",
        "tsyndicate.",
        "bet365.",
        "1xbet.",
        "betano.",
        "blaze."
    )

    private val AD_PATH_HINTS = listOf(
        "/popunder",
        "/pop.js",
        "/popup.js",
        "/prebid",
        "/pagead/",
        "/adserver",
        "/ads.js",
        "/adframe",
        "/show_ads",
        "/vast.xml",
        "/vpaid",
        "/clicktrack"
    )

    private val MEDIA_EXTENSIONS = listOf(
        ".m3u8",
        ".ts",
        ".m4s",
        ".mp4",
        ".webm",
        ".vtt",
        ".srt"
    )

    fun isTrustedHost(host: String): Boolean {
        val clean = host.lowercase(Locale.ROOT)
        if (clean in TRUSTED_HOSTS) return true
        return TRUSTED_HOST_SUFFIXES.any { clean.endsWith(it) }
    }

    fun isBlockedUrl(rawUrl: String?, isMainFrame: Boolean): Boolean {
        if (rawUrl.isNullOrBlank()) return false
        val lower = rawUrl.lowercase(Locale.ROOT)
        if (lower.startsWith("data:") || lower.startsWith("blob:") || lower.startsWith("about:")) {
            return false
        }

        val uri = try {
            Uri.parse(rawUrl)
        } catch (_: Exception) {
            return false
        }

        val scheme = uri.scheme?.lowercase(Locale.ROOT) ?: return false
        if (scheme != "http" && scheme != "https") {
            return true
        }

        val host = uri.host?.lowercase(Locale.ROOT) ?: return false
        val path = uri.path?.lowercase(Locale.ROOT) ?: ""

        // Always allow first-party app and Love Flix proxy/HLS endpoints
        if (isTrustedHost(host) || path.contains("/api/supercdn/")) {
            return false
        }

        // Never drop actual video stream segments/manifests
        if (MEDIA_EXTENSIONS.any { path.endsWith(it) }) {
            return false
        }

        if (AD_HOST_SUBSTRINGS.any { host.contains(it) }) {
            return true
        }

        if (!isMainFrame && AD_PATH_HINTS.any { path.contains(it) }) {
            return true
        }

        return false
    }

    fun emptyResponse(): WebResourceResponse {
        return WebResourceResponse(
            "text/plain",
            "utf-8",
            ByteArrayInputStream(EMPTY_STREAM)
        )
    }

    /**
     * Lightweight anti-popup guard injected after load to neutralize window.open redirects
     * without interfering with Love Flix playback or interactive controls.
     */
    val ANTI_POPUP_JS = """
        (function() {
            try {
                if (window.__loveflixPopupShield) return;
                window.__loveflixPopupShield = true;
                var origOpen = window.open;
                window.open = function(url) {
                    try {
                        if (typeof url === 'string' && url.indexOf('love-flix.vercel.app') !== -1) {
                            return origOpen.apply(window, arguments);
                        }
                    } catch (e) {}
                    return null;
                };
            } catch (e) {}
        })();
    """.trimIndent()
}
