plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.loveflix.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.loveflix.app"
        minSdk = 24
        targetSdk = 35
        versionCode = 6
        versionName = "1.0.5"

        buildConfigField("String", "APP_URL", "\"https://love-flix.vercel.app\"")
    }

    signingConfigs {
        val keystoreFile = System.getenv("LOVEFLIX_KEYSTORE_PATH")
        if (!keystoreFile.isNullOrBlank()) {
            create("release") {
                storeFile = file(keystoreFile)
                storePassword = System.getenv("LOVEFLIX_KEYSTORE_PASS") ?: ""
                keyAlias = System.getenv("LOVEFLIX_KEY_ALIAS") ?: ""
                keyPassword = System.getenv("LOVEFLIX_KEY_PASS") ?: ""
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            signingConfigs.findByName("release")?.let {
                signingConfig = it
            }
        }
        debug {
            applicationIdSuffix = ""
            isDebuggable = true
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        buildConfig = true
        viewBinding = true
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.webkit:webkit:1.12.1")
}
