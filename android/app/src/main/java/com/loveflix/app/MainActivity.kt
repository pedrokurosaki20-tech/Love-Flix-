package com.loveflix.app

import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.ActivityInfo
import android.graphics.Bitmap
import android.net.Uri
import android.os.Bundle
import android.os.Message
import android.view.View
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.loveflix.app.databinding.ActivityMainBinding

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private var customFullscreenView: View? = null
    private var customFullscreenCallback: WebChromeClient.CustomViewCallback? = null
    private var fileUploadCallback: ValueCallback<Array<Uri>>? = null
    private var lastBackPressedAt = 0L
    private var hasMainFrameError = false

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

        configureSystemBars(fullscreen = false)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        setupWebView()
        setupBackNavigation()

        binding.retryButton.setOnClickListener {
            hasMainFrameError = false
            binding.offlineOverlay.visibility = View.GONE
            binding.splashOverlay.visibility = View.VISIBLE
            binding.webView.reload()
        }

        val initialUrl = resolveStartUrl(intent)
        binding.webView.loadUrl(initialUrl)
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
                    binding.offlineOverlay.visibility = View.GONE
                    binding.splashOverlay.animate()
                        .alpha(0f)
                        .setDuration(220)
                        .withEndAction {
                            binding.splashOverlay.visibility = View.GONE
                            binding.splashOverlay.alpha = 1f
                        }
                        .start()
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
                    binding.splashOverlay.visibility = View.GONE
                    binding.offlineOverlay.visibility = View.VISIBLE
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
    }

    private fun configureSystemBars(fullscreen: Boolean) {
        WindowCompat.setDecorFitsSystemWindows(window, !fullscreen)
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
    }

    private fun setupBackNavigation() {
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (customFullscreenView != null) {
                    exitCustomFullscreen()
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
        binding.webView.onPause()
        CookieManager.getInstance().flush()
    }

    override fun onResume() {
        super.onResume()
        binding.webView.onResume()
        if (customFullscreenView != null) {
            configureSystemBars(fullscreen = true)
        }
    }

    override fun onDestroy() {
        customFullscreenCallback = null
        fileUploadCallback?.onReceiveValue(null)
        fileUploadCallback = null
        binding.webView.destroy()
        super.onDestroy()
    }
}
