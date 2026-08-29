# Go Admin Mobile (Capacitor 8)

App móvil iOS/Android de Go Admin ERP construida con **Capacitor 8**.

## Arquitectura

```
go-admin-erp/
├── src/                  # Next.js web (código fuente, sin cambios)
├── electron/             # App de escritorio (Electron, sin cambios)
├── print-agent/          # Agente de impresión standalone (sin cambios)
└── mobile/               # Esta carpeta — app móvil Capacitor
    ├── capacitor.config.ts   # Config: server.url remoto + plugins nativos
    ├── package.json
    ├── android/              # Proyecto Android (generado por `cap add android`)
    └── ios/                  # Proyecto iOS (generado por `cap add ios`)
```

**Patrón:** Wrapper de URL remota (`https://app.goadmin.io`) + plugins nativos.
**Mismo enfoque que Electron**: el WebView carga la web de producción y Capacitor expone APIs nativas via plugins.

### Por qué `server.url` remoto y no static export

La auditoría SSR (ver `docs/PLAN_CAPACITOR_MOVIL.md` sección 9) demostró que el proyecto **no es viable** para `output: 'export'` sin 200-400 horas de reestructuración:

- 21 páginas con `force-dynamic`
- 50+ archivos usando `cookies()` de `next/headers`
- 100+ API Routes (no se empaquetan en static export)
- Middleware de 763 líneas (no funciona en static export)
- next-intl requiere configuración especial para static export

El patrón `server.url` remoto replica exactamente lo que Electron ya hace con éxito: carga `app.goadmin.io` en el WebView y expone un bridge nativo.

### Riesgo y mitigación (Apple Guideline 4.2)

Apple puede rechazar apps que son "thin wrappers" de websites. **Mitigación:** features nativas significativas que elevan la app por encima de un mero wrapper:

- Impresión Bluetooth ESC/POS (impresoras térmicas POS)
- Biometría (Touch ID / Face ID) para login rápido
- Push notifications (FCM/APNs)
- Escáner de códigos de barras con cámara
- Geolocalización para transporte y marcación
- NFC para check-in HRM/Gym (Android)

## Prerequisitos

- Node.js 20+
- Android Studio (para Android)
- Xcode 26+ (para iOS, solo macOS)
- Cuenta Apple Developer Program ($99/año)
- Proyecto Firebase (FCM)

## Setup inicial

### 1. Instalar dependencias

```bash
cd mobile
npm install
```

### 2. Añadir plataformas nativas (solo primera vez)

```bash
npx cap add android
npx cap add ios
```

### 3. Sincronizar plugins nativos

```bash
# Desde la raíz
npm run mobile:sync
```

> **Nota:** No hay `mobile:build` porque la web se sirve remota desde `app.goadmin.io`.
> Solo se sincronizan los plugins nativos con `cap sync`.

### 4. Abrir en IDE nativo

```bash
npm run mobile:open:android   # Abre Android Studio
npm run mobile:open:ios       # Abre Xcode (solo macOS)
```

### 5. Ejecutar en dispositivo

```bash
npm run mobile:run:android    # Deploy a dispositivo/emulador Android
npm run mobile:run:ios        # Deploy a dispositivo/simulador iOS
```

## Generar APK instalable (para testing manual)

### APK debug (firmado con debug keystore — rápido para testing)

```bash
cd mobile
npm run build:android:debug
# APK generado en: android/app/build/outputs/apk/debug/app-debug.apk
```

### APK release (firmado con debug keystore si no hay release keystore)

```bash
cd mobile
npm run build:android:apk
# APK generado en: android/app/build/outputs/apk/release/app-release.apk
```

> **Nota:** Sin keystore de release configurado, el APK de release se firma con
> el debug keystore. Esto permite instalarlo en dispositivos para testing, pero
> **NO es válido para Google Play Store**. Para Play Store, configura un keystore
> de release (ver `mobile/store/signing/android-keystore.md`).

### APK release firmado (para distribución)

```bash
cd mobile
# Requiere keystore en android/app/release.keystore
export ANDROID_STORE_PASSWORD="tu_password"
export ANDROID_KEY_PASSWORD="tu_password"
npm run build:android:apk:signed
```

### Cómo transferir el APK al celular SIN corromperlo

> **NUNCA envíes el APK por WhatsApp o Telegram.** Estas apps comprimen y
> modifican el binario del APK, cambiando su extensión (`.apk` → `.apk.doc`)
> y corrompiendo los headers. El celular muestra "No se instaló la app".

**Métodos seguros:**

1. **USB (recomendado):** Copia el APK por cable al celular
2. **Google Drive / Dropbox:** Sube el APK y descárgalo en el celular
3. **Servidor web:** Sube el APK a un URL y descárgalo desde el navegador del celular
4. **ADB (avanzado):** `adb install app-debug.apk` (instala directamente sin transferir)
5. **Si debes usar WhatsApp:** Primero comprime el APK en un `.zip` y envía el ZIP

### Pasos para instalar el APK en el celular

1. Transfiere el APK por un método seguro (ver arriba)
2. En el celular: **Ajustes → Seguridad → Orígenes desconocidos** (activar)
3. Abre el archivo `.apk` desde el administrador de archivos
4. Toca **Instalar**
5. Si Google Play Protect bloquea la instalación, toca **Instalar de todos modos**

## Scripts disponibles (desde raíz del proyecto)

| Script | Descripción |
|---|---|
| `npm run mobile:sync` | Sincroniza plugins a proyectos android/ e ios/ |
| `npm run mobile:open:android` | Abre Android Studio |
| `npm run mobile:open:ios` | Abre Xcode |
| `npm run mobile:run:android` | Deploy a dispositivo Android |
| `npm run mobile:run:ios` | Deploy a dispositivo iOS |

## Configuración Firebase (FCM) para push notifications

### Android
1. Crear proyecto en [Firebase Console](https://console.firebase.google.com)
2. Añadir app Android con package name `io.goadmin.app`
3. Descargar `google-services.json` y colocarlo en `mobile/android/app/`
4. El archivo está en `.gitignore` (no se commitea)

### iOS
1. En el mismo proyecto Firebase, añadir app iOS con Bundle ID `io.goadmin.app`
2. Descargar `GoogleService-Info.plist` y colocarlo en `mobile/ios/App/App/`
3. Subir APNs Key (.p8) desde Apple Developer a Firebase → Project Settings → Cloud Messaging

## Permisos nativos

Los permisos se configuran en:
- **iOS:** `mobile/ios/App/App/Info.plist` (ver `docs/PLAN_CAPACITOR_MOVIL.md` sección 10)
- **Android:** `mobile/android/app/src/main/AndroidManifest.xml` (ver plan sección 10)

## Custom URL Scheme

- Scheme: `goadmin`
- Uso: OAuth redirects (Supabase Auth, Google Sign In)
- Callback: `goadmin://auth-callback?access_token=...&refresh_token=...`

## Limitaciones conocidas

- **Service Workers** no funcionan en iOS WKWebView → la web debe manejar offline con IndexedDB
- **localStorage** puede limpiarse en iOS → migrar a `@capacitor/preferences` en componentes móviles
- **USB impresoras** no accesibles en móvil → solo Bluetooth LE y red
- **server.url en producción** documentado como "no recomendado" por Ionic → mitigar con features nativas

## Documentación completa

Ver [`docs/PLAN_CAPACITOR_MOVIL.md`](../docs/PLAN_CAPACITOR_MOVIL.md) para el plan maestro con todas las fases y la auditoría SSR completa.
