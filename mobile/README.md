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
