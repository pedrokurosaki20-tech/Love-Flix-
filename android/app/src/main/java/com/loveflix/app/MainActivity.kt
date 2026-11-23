package com.loveflix.app

import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.ActivityInfo
import android.graphics.Bitmap
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.Message
import android.view.View
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.ScriptHandler
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import com.loveflix.app.databinding.ActivityMainBinding
import org.json.JSONObject
import kotlin.math.roundToInt

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private var customFullscreenView: View? = null
    private var customFullscreenCallback: WebChromeClient.CustomViewCallback? = null
    private var fileUploadCallback: ValueCallback<Array<Uri>>? = null
    private var lastBackPressedAt = 0L
    private var hasMainFrameError = false
    private var isIntroAnimationFinished = false
    private var isInitialPageFinished = false
    private var splashPausedPositionMs = 0
    private val splashSafetyHandler = Handler(Looper.getMainLooper())

    // Dedicated Native Canal 2 Player State
    private var canal2Active = false
    private var canal2IntroPlaying = false
    private var canal2NativeFullscreen = false
    private var canal2AudioPref = "pt"
    private var canal2LastBoundsJson = "{}"
    private var canal2DocStartScript: ScriptHandler? = null

    private val fileChooserLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val callback = fileUploadCallback ?: return@registerForActivityResult
            fileUploadCallback = null
            val uris = WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data)
            callback.onReceiveValue(uris)
        }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setupWindowInsets()
        configureSystemBars(fullscreen = false)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        startLaunchIntroVideo()
        setupWebView()
        setupCanal2WebView()
        setupBackNavigation()

        binding.webView.addOnLayoutChangeListener { _, left, top, right, bottom, oldLeft, oldTop, oldRight, oldBottom ->
            if (canal2Active && ((right - left) != (oldRight - oldLeft) || (bottom - top) != (oldBottom - oldTop))) {
                applyCanal2Bounds(canal2LastBoundsJson)
            }
        }

        binding.retryButton.setOnClickListener {
            hasMainFrameError = false
            isIntroAnimationFinished = true
            isInitialPageFinished = false
            binding.offlineOverlay.visibility = View.GONE
            binding.splashOverlay.visibility = View.VISIBLE
            binding.splashOverlay.alpha = 1f
            binding.splashVideoView.visibility = View.GONE
            binding.splashSlowNetworkSpinner.visibility = View.VISIBLE
            binding.webView.reload()
        }

        val initialUrl = resolveStartUrl(intent)
        binding.webView.loadUrl(initialUrl)
    }

    private fun startLaunchIntroVideo() {
        isIntroAnimationFinished = false
        splashPausedPositionMs = 0
        binding.splashOverlay.visibility = View.VISIBLE
        binding.splashOverlay.alpha = 1f
        binding.splashVideoView.visibility = View.VISIBLE
        binding.splashSlowNetworkSpinner.visibility = View.GONE

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            binding.splashVideoView.setAudioFocusRequest(AudioManager.AUDIOFOCUS_NONE)
        }

        val videoUri = Uri.parse("android.resource://$packageName/${R.raw.loveflix_launch_intro}")
        binding.splashVideoView.setVideoURI(videoUri)

        binding.splashVideoView.setOnPreparedListener { mediaPlayer ->
            mediaPlayer.isLooping = false
            binding.splashVideoView.start()
        }

        binding.splashVideoView.setOnCompletionListener {
            onLaunchIntroCompleted()
        }

        binding.splashVideoView.setOnErrorListener { _, _, _ ->
            onLaunchIntroCompleted()
            true
        }

        splashSafetyHandler.removeCallbacksAndMessages(null)
        splashSafetyHandler.postDelayed({
            if (!isIntroAnimationFinished) {
                onLaunchIntroCompleted()
            }
        }, 8500L)
    }

    private fun onLaunchIntroCompleted() {
        if (isIntroAnimationFinished) return
        isIntroAnimationFinished = true
        splashSafetyHandler.removeCallbacksAndMessages(null)

        if (hasMainFrameError) {
            binding.splashOverlay.visibility = View.GONE
            binding.offlineOverlay.visibility = View.VISIBLE
            return
        }

        if (!isInitialPageFinished) {
            binding.splashSlowNetworkSpinner.visibility = View.VISIBLE
        }
        maybeDismissSplash()
    }

    private fun maybeDismissSplash() {
        if (!isIntroAnimationFinished || !isInitialPageFinished || hasMainFrameError) return
        if (binding.splashOverlay.visibility != View.VISIBLE) return

        binding.splashSlowNetworkSpinner.visibility = View.GONE
        binding.splashOverlay.animate()
            .alpha(0f)
            .setDuration(240)
            .withEndAction {
                binding.splashOverlay.visibility = View.GONE
                binding.splashOverlay.alpha = 1f
                try {
                    binding.splashVideoView.stopPlayback()
                } catch (_: Exception) {
                }
            }
            .start()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        val deepUrl = resolveStartUrl(intent)
        if (deepUrl != BuildConfig.APP_URL) {
            binding.webView.loadUrl(deepUrl)
        }
    }

    private fun resolveStartUrl(intent: Intent?): String {
        val data = intent?.data
        if (data != null && data.scheme == "https" && data.host == "love-flix.vercel.app") {
            return data.toString()
        }
        return BuildConfig.APP_URL
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        val webView = binding.webView
        val settings = webView.settings

        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.mediaPlaybackRequiresUserGesture = false
        settings.useWideViewPort = true
        settings.loadWithOverviewMode = true
        settings.builtInZoomControls = false
        settings.displayZoomControls = false
        settings.allowFileAccess = true
        settings.allowContentAccess = true
        settings.mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
        settings.cacheMode = WebSettings.LOAD_DEFAULT
        settings.javaScriptCanOpenWindowsAutomatically = false
        settings.setSupportMultipleWindows(true)

        // Identify cleanly as standard mobile Chrome so external stream embeds do not restrict WebView
        val baseUa = WebSettings.getDefaultUserAgent(this)
        settings.userAgentString = baseUa
            .replace("; wv)", ")")
            .replace("Version/4.0 ", "")

        val cookieManager = CookieManager.getInstance()
        cookieManager.setAcceptCookie(true)
        cookieManager.setAcceptThirdPartyCookies(webView, true)

        webView.addJavascriptInterface(LoveFlixNativeBridge(), "LoveFlixNative")

        webView.webViewClient = object : WebViewClient() {

            override fun shouldInterceptRequest(
                view: WebView?,
                request: WebResourceRequest?
            ): WebResourceResponse? {
                val url = request?.url?.toString() ?: return null
                if (AdBlocker.isBlockedUrl(url, request.isForMainFrame)) {
                    return AdBlocker.emptyResponse()
                }
                return super.shouldInterceptRequest(view, request)
            }

            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest?
            ): Boolean {
                val uri = request?.url ?: return false
                val raw = uri.toString()

                // Block ad redirects, store hijacks, and unknown external intents
                if (AdBlocker.isBlockedUrl(raw, request.isForMainFrame)) {
                    return true
                }

                val scheme = uri.scheme?.lowercase() ?: return true
                if (scheme != "http" && scheme != "https") {
                    return true
                }

                return false
            }

            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                super.onPageStarted(view, url, favicon)
                view?.evaluateJavascript(AdBlocker.ANTI_POPUP_JS, null)
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                view?.evaluateJavascript(AdBlocker.ANTI_POPUP_JS, null)
                if (!hasMainFrameError) {
                    isInitialPageFinished = true
                    binding.offlineOverlay.visibility = View.GONE
                    maybeDismissSplash()
                }
                CookieManager.getInstance().flush()
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?
            ) {
                super.onReceivedError(view, request, error)
                if (request?.isForMainFrame == true) {
                    hasMainFrameError = true
                    if (isIntroAnimationFinished) {
                        binding.splashOverlay.visibility = View.GONE
                        binding.offlineOverlay.visibility = View.VISIBLE
                    }
                }
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onCreateWindow(
                view: WebView?,
                isDialog: Boolean,
                isUserGesture: Boolean,
                resultMsg: Message?
            ): Boolean {
                // Strictly block pop-up windows and ad tabs from embedded video players
                return false
            }

            override fun onShowCustomView(view: View?, callback: CustomViewCallback?) {
                if (view == null) {
                    callback?.onCustomViewHidden()
                    return
                }
                if (customFullscreenView != null) {
                    callback?.onCustomViewHidden()
                    return
                }

                customFullscreenView = view
                customFullscreenCallback = callback
                binding.fullscreenContainer.addView(view)
                binding.fullscreenContainer.visibility = View.VISIBLE
                binding.webView.visibility = View.INVISIBLE

                requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
                configureSystemBars(fullscreen = true)
            }

            override fun onHideCustomView() {
                exitCustomFullscreen()
            }

            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                fileUploadCallback?.onReceiveValue(null)
                fileUploadCallback = filePathCallback
                return try {
                    val intent = fileChooserParams?.createIntent()
                        ?: Intent(Intent.ACTION_GET_CONTENT).apply {
                            addCategory(Intent.CATEGORY_OPENABLE)
                            type = "image/*"
                        }
                    fileChooserLauncher.launch(intent)
                    true
                } catch (_: Exception) {
                    fileUploadCallback = null
                    false
                }
            }
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupCanal2WebView() {
        val c2 = binding.canal2WebView
        val settings = c2.settings

        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.mediaPlaybackRequiresUserGesture = false
        settings.useWideViewPort = true
        settings.loadWithOverviewMode = true
        settings.builtInZoomControls = false
        settings.displayZoomControls = false
        settings.allowFileAccess = true
        settings.allowContentAccess = true
        settings.mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
        settings.cacheMode = WebSettings.LOAD_DEFAULT
        settings.javaScriptCanOpenWindowsAutomatically = false
        settings.setSupportMultipleWindows(true)

        val baseUa = WebSettings.getDefaultUserAgent(this)
        settings.userAgentString = baseUa
            .replace("; wv)", ")")
            .replace("Version/4.0 ", "")

        val cookieManager = CookieManager.getInstance()
        cookieManager.setAcceptCookie(true)
        cookieManager.setAcceptThirdPartyCookies(c2, true)

        c2.addJavascriptInterface(Canal2JsBridge(), "LoveFlixCanal2Bridge")

        binding.canal2CloseBtn.setOnClickListener {
            dispatchEventToMainWebView("loveflix:canal2-close")
        }
        binding.canal2FullscreenBtn.setOnClickListener {
            dispatchEventToMainWebView("loveflix:canal2-toggle-fullscreen")
        }

        c2.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView?,
                request: WebResourceRequest?
            ): WebResourceResponse? {
                val url = request?.url?.toString() ?: return null
                if (AdBlocker.isBlockedUrl(url, request.isForMainFrame)) {
                    return AdBlocker.emptyResponse()
                }
                return super.shouldInterceptRequest(view, request)
            }

            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest?
            ): Boolean {
                val uri = request?.url ?: return true
                val raw = uri.toString()
                if (AdBlocker.isBlockedUrl(raw, request.isForMainFrame)) {
                    return true
                }
                val scheme = uri.scheme?.lowercase() ?: return true
                if (scheme != "http" && scheme != "https") {
                    return true
                }
                if (request.isForMainFrame) {
                    val host = uri.host?.lowercase() ?: return true
                    val isWrapperHost = host == "love-flix.vercel.app"
                    val isSuperFlix = host.contains("superflixapi")
                    val isCloudflare = host.contains("challenges.cloudflare.com")
                    if (!isWrapperHost && !isSuperFlix && !isCloudflare) {
                        return true
                    }
                }
                return false
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                val script = Canal2Automation.buildDocumentStartScript(
                    canal2AudioPref,
                    canal2IntroPlaying
                )
                view?.evaluateJavascript(script, null)
                view?.evaluateJavascript(
                    "window.__lfSetAudioPref && window.__lfSetAudioPref(${JSONObject.quote(canal2AudioPref)});" +
                        "window.__lfSetIntroState && window.__lfSetIntroState(${if (canal2IntroPlaying) "true" else "false"});",
                    null
                )
                CookieManager.getInstance().flush()
            }
        }

        c2.webChromeClient = object : WebChromeClient() {
            override fun onCreateWindow(
                view: WebView?,
                isDialog: Boolean,
                isUserGesture: Boolean,
                resultMsg: Message?
            ): Boolean {
                return false
            }

            override fun onShowCustomView(view: View?, callback: CustomViewCallback?) {
                if (view == null) {
                    callback?.onCustomViewHidden()
                    return
                }
                if (customFullscreenView != null) {
                    callback?.onCustomViewHidden()
                    return
                }

                customFullscreenView = view
                customFullscreenCallback = callback
                binding.fullscreenContainer.addView(view)
                binding.fullscreenContainer.visibility = View.VISIBLE
                binding.webView.visibility = View.INVISIBLE
                binding.canal2Container.visibility = View.GONE

                requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
                configureSystemBars(fullscreen = true)
            }

            override fun onHideCustomView() {
                exitCustomFullscreen()
            }
        }
    }

    private fun refreshCanal2DocumentStartScript() {
        canal2DocStartScript?.remove()
        canal2DocStartScript = null
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            val script = Canal2Automation.buildDocumentStartScript(
                canal2AudioPref,
                canal2IntroPlaying
            )
            canal2DocStartScript = WebViewCompat.addDocumentStartJavaScript(
                binding.canal2WebView,
                script,
                setOf("*")
            )
        }
    }

    private fun applyCanal2Bounds(boundsJson: String) {
        canal2LastBoundsJson = boundsJson
        if (!canal2Active) {
            binding.canal2Container.visibility = View.GONE
            binding.canal2Container.passThroughTouches = false
            return
        }

        val parsed = try {
            JSONObject(boundsJson)
        } catch (_: Exception) {
            JSONObject()
        }

        val visible = parsed.optBoolean("visible", true)
        if (!visible) {
            binding.canal2Container.visibility = View.GONE
            binding.canal2Container.passThroughTouches = false
            return
        }

        val containerW = if (binding.webView.width > 0) {
            binding.webView.width
        } else {
            resources.displayMetrics.widthPixels
        }
        val containerH = if (binding.webView.height > 0) {
            binding.webView.height
        } else {
            resources.displayMetrics.heightPixels
        }

        val leftRatio = parsed.optDouble("left", 0.0).coerceIn(0.0, 1.0)
        val topRatio = parsed.optDouble("top", 0.0).coerceIn(0.0, 1.0)
        val widthRatio = parsed.optDouble("width", 1.0).coerceIn(0.0, 1.0)
        val heightRatio = parsed.optDouble("height", 1.0).coerceIn(0.0, 1.0)
        val showFloatingControls = parsed.optBoolean("showFloatingControls", false)

        val leftPx = (leftRatio * containerW).roundToInt()
        val topPx = (topRatio * containerH).roundToInt()
        val wPx = (widthRatio * containerW).roundToInt().coerceAtLeast(1)
        val hPx = (heightRatio * containerH).roundToInt().coerceAtLeast(1)

        val lp = (binding.canal2Container.layoutParams as? FrameLayout.LayoutParams)
            ?: FrameLayout.LayoutParams(wPx, hPx)
        lp.width = wPx
        lp.height = hPx
        lp.leftMargin = leftPx
        lp.topMargin = topPx
        binding.canal2Container.layoutParams = lp

        if (customFullscreenView != null) {
            binding.canal2Container.visibility = View.GONE
            return
        }

        binding.canal2Container.visibility = View.VISIBLE
        if (canal2IntroPlaying) {
            binding.canal2Container.alpha = 0.005f
            binding.canal2Container.passThroughTouches = true
            binding.canal2FloatingControls.visibility = View.GONE
        } else {
            binding.canal2Container.alpha = 1f
            binding.canal2Container.passThroughTouches = false
            binding.canal2FloatingControls.visibility =
                if (showFloatingControls) View.VISIBLE else View.GONE
        }
    }

    private fun closeCanal2Native() {
        canal2Active = false
        canal2IntroPlaying = false
        if (canal2NativeFullscreen) {
            canal2NativeFullscreen = false
            requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
            configureSystemBars(fullscreen = false)
            binding.canal2FullscreenBtn.text = "Tela cheia"
        }
        canal2DocStartScript?.remove()
        canal2DocStartScript = null
        binding.canal2Container.passThroughTouches = false
        binding.canal2Container.visibility = View.GONE
        binding.canal2FloatingControls.visibility = View.GONE
        try {
            binding.canal2WebView.stopLoading()
            binding.canal2WebView.loadUrl("about:blank")
        } catch (_: Exception) {
        }
    }

    private fun dispatchEventToMainWebView(eventName: String) {
        runOnUiThread {
            val safeEvent = JSONObject.quote(eventName)
            binding.webView.evaluateJavascript(
                "window.dispatchEvent(new CustomEvent($safeEvent));",
                null
            )
        }
    }

    private inner class LoveFlixNativeBridge {
        @JavascriptInterface
        fun isNativeApp(): Boolean = true

        @JavascriptInterface
        fun openCanal2(
            url: String,
            audioPref: String,
            introPlaying: Boolean,
            boundsJson: String
        ) {
            if (!Canal2Automation.isAllowedCanal2Url(url)) return
            runOnUiThread {
                canal2Active = true
                canal2AudioPref = if (audioPref == "original") "original" else "pt"
                canal2IntroPlaying = introPlaying
                refreshCanal2DocumentStartScript()
                applyCanal2Bounds(boundsJson)
                val wrapperHtml = Canal2Automation.buildEmbedWrapperHtml(url)
                binding.canal2WebView.loadDataWithBaseURL(
                    "https://love-flix.vercel.app/",
                    wrapperHtml,
                    "text/html",
                    "utf-8",
                    null
                )
            }
        }

        @JavascriptInterface
        fun updateCanal2Bounds(boundsJson: String) {
            runOnUiThread {
                applyCanal2Bounds(boundsJson)
            }
        }

        @JavascriptInterface
        fun setCanal2IntroActive(introPlaying: Boolean) {
            runOnUiThread {
                canal2IntroPlaying = introPlaying
                applyCanal2Bounds(canal2LastBoundsJson)
                val jsFlag = if (introPlaying) "true" else "false"
                binding.canal2WebView.evaluateJavascript(
                    "window.__lfSetIntroState && window.__lfSetIntroState($jsFlag);",
                    null
                )
            }
        }

        @JavascriptInterface
        fun setNativeFullscreen(fullscreen: Boolean) {
            runOnUiThread {
                canal2NativeFullscreen = fullscreen
                requestedOrientation = if (fullscreen) {
                    ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
                } else {
                    ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
                }
                configureSystemBars(fullscreen = fullscreen)
                binding.canal2FullscreenBtn.text = if (fullscreen) "Sair tela cheia" else "Tela cheia"
                val jsFlag = if (fullscreen) "true" else "false"
                binding.webView.evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('loveflix:native-fullscreen-changed', { detail: { fullscreen: $jsFlag } }));",
                    null
                )
            }
        }

        @JavascriptInterface
        fun closeCanal2() {
            runOnUiThread {
                closeCanal2Native()
            }
        }
    }

    private inner class Canal2JsBridge {
        @JavascriptInterface
        fun onVideoAlive() {
            dispatchEventToMainWebView("loveflix:canal2-video-alive")
        }

        @JavascriptInterface
        fun onChallengeVisible() {
            dispatchEventToMainWebView("loveflix:canal2-challenge-visible")
        }

        @JavascriptInterface
        fun onUnavailable() {
            dispatchEventToMainWebView("loveflix:canal2-unavailable")
        }
    }

    private fun exitCustomFullscreen() {
        val fsView = customFullscreenView ?: return
        binding.fullscreenContainer.removeView(fsView)
        binding.fullscreenContainer.visibility = View.GONE
        binding.webView.visibility = View.VISIBLE

        customFullscreenView = null
        customFullscreenCallback?.onCustomViewHidden()
        customFullscreenCallback = null

        requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
        configureSystemBars(fullscreen = false)

        if (canal2Active) {
            applyCanal2Bounds(canal2LastBoundsJson)
        }
    }

    private fun setupWindowInsets() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        ViewCompat.setOnApplyWindowInsetsListener(binding.rootContainer) { view, windowInsets ->
            if (customFullscreenView != null) {
                view.setPadding(0, 0, 0, 0)
            } else {
                val safeInsets = windowInsets.getInsets(
                    WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
                )
                val imeInsets = windowInsets.getInsets(WindowInsetsCompat.Type.ime())
                val bottomPadding = maxOf(safeInsets.bottom, imeInsets.bottom)
                view.setPadding(safeInsets.left, safeInsets.top, safeInsets.right, bottomPadding)
            }
            windowInsets
        }
        ViewCompat.requestApplyInsets(binding.rootContainer)
    }

    private fun configureSystemBars(fullscreen: Boolean) {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        val controller = WindowInsetsControllerCompat(window, window.decorView)
        controller.isAppearanceLightStatusBars = false
        controller.isAppearanceLightNavigationBars = false

        if (fullscreen) {
            controller.systemBarsBehavior =
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            controller.hide(WindowInsetsCompat.Type.systemBars())
        } else {
            controller.show(WindowInsetsCompat.Type.systemBars())
        }
        ViewCompat.requestApplyInsets(binding.rootContainer)
    }

    private fun setupBackNavigation() {
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (customFullscreenView != null) {
                    exitCustomFullscreen()
                    return
                }
                if (canal2Active) {
                    dispatchEventToMainWebView("loveflix:canal2-close")
                    return
                }
                if (binding.webView.canGoBack()) {
                    binding.webView.goBack()
                    return
                }
                val now = System.currentTimeMillis()
                if (now - lastBackPressedAt < 2000) {
                    finish()
                } else {
                    lastBackPressedAt = now
                    Toast.makeText(
                        this@MainActivity,
                        getString(R.string.back_exit_prompt),
                        Toast.LENGTH_SHORT
                    ).show()
                }
            }
        })
    }

    override fun onPause() {
        super.onPause()
        if (!isIntroAnimationFinished && binding.splashVideoView.isPlaying) {
            splashPausedPositionMs = binding.splashVideoView.currentPosition
            binding.splashVideoView.pause()
        }
        binding.webView.onPause()
        binding.canal2WebView.onPause()
        CookieManager.getInstance().flush()
    }

    override fun onResume() {
        super.onResume()
        binding.webView.onResume()
        binding.canal2WebView.onResume()
        if (!isIntroAnimationFinished && binding.splashOverlay.visibility == View.VISIBLE) {
            if (splashPausedPositionMs > 0) {
                binding.splashVideoView.seekTo(splashPausedPositionMs)
            }
            binding.splashVideoView.start()
        }
        if (customFullscreenView != null || canal2NativeFullscreen) {
            configureSystemBars(fullscreen = true)
        }
    }

    override fun onDestroy() {
        splashSafetyHandler.removeCallbacksAndMessages(null)
        try {
            binding.splashVideoView.stopPlayback()
        } catch (_: Exception) {
        }
        canal2DocStartScript?.remove()
        canal2DocStartScript = null
        customFullscreenCallback = null
        fileUploadCallback?.onReceiveValue(null)
        fileUploadCallback = null
        binding.canal2WebView.destroy()
        binding.webView.destroy()
        super.onDestroy()
    }
}
