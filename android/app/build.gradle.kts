plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.lorekasaia.catunes"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.lorekasaia.catunes"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "0.1.2"
    }

    signingConfigs {
        // Fixed, non-secret debug key (checked in) so every CI build has the
        // same signature — otherwise Android refuses to install an update
        // over a previous build signed with a different, randomly
        // generated debug key ("package conflicts with an existing package").
        getByName("debug") {
            storeFile = rootProject.file("keystore/debug.keystore")
            storePassword = "catunes123"
            keyAlias = "catunes"
            keyPassword = "catunes123"
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}
