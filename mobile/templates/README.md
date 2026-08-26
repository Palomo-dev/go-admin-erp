# Templates de Configuración Nativa — GoAdmin ERP (Capacitor)

> **FASE P1** del plan de pendientes Capacitor.
> Estos son **templates** que se copian después de ejecutar `cap add android/ios`.
> **NO ejecutar `cap add` sin SDK instalado** (requiere Android Studio / Xcode).

---

## Archivos incluidos

| Template | Destino después de `cap add` | Plataforma |
|----------|------------------------------|------------|
| `AndroidManifest.xml` | `mobile/android/app/src/main/AndroidManifest.xml` | Android |
| `build.gradle.app` | `mobile/android/app/build.gradle` | Android |
| `strings.xml` | `mobile/android/app/src/main/res/values/strings.xml` | Android |
| `Info.plist` | `mobile/ios/App/App/Info.plist` | iOS |

---

## Flujo de uso

### 1. Generar proyecto Android nativo

```bash
cd C:\Users\USUARIO\CascadeProjects\go-admin-erp\mobile
npx cap add android
```

Esto crea `mobile/android/` con:
- `app/src/main/AndroidManifest.xml`
- `app/build.gradle`
- `build.gradle` (root)
- `settings.gradle`
- `app/src/main/res/values/strings.xml`
- `app/src/main/res/drawable/` (iconos)

### 2. Aplicar templates Android

#### AndroidManifest.xml
Copiar `templates/AndroidManifest.xml` a `mobile/android/app/src/main/AndroidManifest.xml`.

> **MERGE:** Capacitor genera su propio manifest con referencias a actividades
> y servicios de plugins. Conserva esos elementos y añade:
> - Permisos `<uses-permission>` del template
> - `<intent-filter>` de deep link `goadmin://` en MainActivity
> - `<service>` de Firebase Messaging dentro de `<application>`

#### build.gradle
Copiar `templates/build.gradle.app` a `mobile/android/app/build.gradle`.

> **MERGE:** Conserva las dependencias de plugins de Capacitor
> (bloque `dependencies { }`) y aplica:
> - `namespace "io.goadmin.app"`
> - `compileSdk 35`, `minSdk 23`, `targetSdk 35`
> - `signingConfigs.release` con variables de entorno
> - `buildTypes.release` con `signingConfig`
> - `apply plugin: 'com.google.gms.google-services'`

#### strings.xml
Copiar `templates/strings.xml` a `mobile/android/app/src/main/res/values/strings.xml`.

> **MERGE:** Conserva strings existentes y actualiza:
> - `app_name` → `GoAdmin ERP`
> - `default_notification_channel_id` → `goadmin_default`

### 3. Generar proyecto iOS nativo

> **Requisito:** macOS con Xcode 16+

```bash
cd C:\Users\USUARIO\CascadeProjects\go-admin-erp\mobile
npx cap add ios
# Capacitor 8 usa SPM por default. Para CocoaPods:
# npx cap add ios --packagemanager CocoaPods
```

### 4. Aplicar templates iOS

#### Info.plist
Copiar `templates/Info.plist` a `mobile/ios/App/App/Info.plist`.

> **MERGE:** Conserva las claves existentes (CFBundleIdentifier,
> CFBundleShortVersionString, etc.) y añade:
> - Claves `NS*UsageDescription` (permisos de privacidad)
> - `UIBackgroundModes` con `remote-notification`
> - `CFBundleURLTypes` con scheme `goadmin`

### 5. Sincronizar y probar

```bash
# Sincronizar plugins con nativo
npm run mobile:sync

# Abrir en Android Studio
npm run mobile:open:android

# Abrir en Xcode (macOS)
npm run mobile:open:ios

# Probar en emulador Android
npm run mobile:run:android

# Probar en simulador iOS (macOS)
npm run mobile:run:ios
```

---

## Requisitos

| Herramienta | Versión mínima | Notas |
|-------------|----------------|-------|
| Android Studio | 2025.2.1+ | Incluye Android SDK 35 |
| Xcode | 16+ | Solo macOS |
| Java | 17 | Requerido por Android Gradle Plugin 8+ |
| Node.js | 20+ | Para Capacitor CLI |
| Capacitor | 8+ | `@capacitor/core` |

---

## Configuración de Firebase

Para push notifications, ver [`firebase-setup.md`](./firebase-setup.md) para
la guía paso a paso de configuración de Firebase Console y Supabase.

---

## Referencias

- Plan principal: `docs/PLAN_CAPACITOR_MOVIL.md`
- Plan de pendientes: `docs/PLAN_CAPACITOR_MOVIL_PENDIENTES.md` (sección P1)
- CI/CD: `.github/workflows/mobile-build.yml`
- Store metadata: `mobile/store/`
