// build.gradle.app — Template para GoAdmin ERP (Capacitor)
// ============================================================
// Este archivo se copia a: mobile/android/app/build.gradle
// DESPUÉS de ejecutar `npx cap add android`.
//
// IMPORTANTE: Debes hacer un MERGE con el build.gradle generado
// por Capacitor. Conserva las dependencias de plugins de Capacitor
// (implementación de dependencies { }) y aplica estos cambios:
//   - namespace
//   - compileSdk, minSdk, targetSdk
//   - signingConfigs.release
//   - buildTypes.release con signingConfig
//   - apply plugin: 'com.google.gms.google-services'
//
// Requisitos:
// - Android Studio 2025.2.1+
// - Java 17
// - google-services.json en app/ (descargado de Firebase Console)

// ============================================================
// SIGNING CONFIG — RELEASE
// Las variables se pasan via gradle.properties o línea de comando:
//   ./gradlew bundleRelease \
//     -PRELEASE_STORE_FILE=/path/to/keystore.jks \
//     -PRELEASE_STORE_PASSWORD=*** \
//     -PRELEASE_KEY_ALIAS=goadmin \
//     -PRELEASE_KEY_PASSWORD=***
//
// O en mobile/android/gradle.properties:
//   RELEASE_STORE_FILE=...
//   RELEASE_STORE_PASSWORD=...
//   RELEASE_KEY_ALIAS=...
//   RELEASE_KEY_PASSWORD=...
// ============================================================

android {
    // Namespace del paquete — debe coincidir con applicationId
    // y con el package name configurado en Firebase Console
    namespace "io.goadmin.app"

    // Android 16 (API 36) — requerido por AndroidX 2025
    compileSdk 36

    defaultConfig {
        applicationId "io.goadmin.app"
        // Android 6.0 (API 23) — mínimo soportado por Capacitor 8
        minSdk 23
        // Android 15 (API 35) — target actual
        targetSdk 35
        versionCode 1
        versionName "1.0.0"
    }

    // ========================================================
    // SIGNING CONFIG — Release builds
    // Solo se aplica si las propiedades están definidas.
    // En debug se usa el debug keystore por defecto.
    // ========================================================
    signingConfigs {
        release {
            if (project.hasProperty('RELEASE_STORE_FILE')) {
                storeFile file(RELEASE_STORE_FILE)
                storePassword RELEASE_STORE_PASSWORD
                keyAlias RELEASE_KEY_ALIAS
                keyPassword RELEASE_KEY_PASSWORD
            }
        }
    }

    // ========================================================
    // BUILD TYPES
    // release: firma con signingConfigs.release, minifica, proguard
    // debug: configuración por defecto de Capacitor
    // ========================================================
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled true
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
        }
    }
}

// ============================================================
// FIREBASE — Google Services plugin
// Requiere:
//   1. google-services.json en mobile/android/app/
//   2. classpath 'com.google.gms:google-services:4.4.2' en
//      mobile/android/build.gradle (root) dependencies
// ============================================================
apply plugin: 'com.google.gms.google-services'
