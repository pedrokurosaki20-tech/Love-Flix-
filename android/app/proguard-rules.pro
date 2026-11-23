# Keep Love Flix JavaScript bridge & WebView classes intact
-keepattributes *Annotation*
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
