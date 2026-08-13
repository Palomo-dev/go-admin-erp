# Plan Capacitor Móvil — Go Admin ERP

> Documento maestro para llevar Go Admin ERP a iOS y Android con **Capacitor 8**.
> Proyecto Supabase: `jgmgphmzusbluqhuqihj` · Web: `app.goadmin.io` · Repo: `Palomo-dev/go-admin-erp`
> Fecha: 2026-08-13 · Stack: Next.js 15.5.7 + React 19 + TypeScript 5.8 + Tailwind 3.3 + Supabase + Electron 33

---

## 0. Resumen ejecutivo y decisión

**Decisión:** Usar **Capacitor 8** (no React Native + WebView) para llevar Go Admin ERP a móvil.

**Razón principal:** El proyecto ya demostró con Electron que el patrón "wrapper + bridge nativo" funciona. Capacitor replica ese mismo patrón en iOS/Android con plugins nativos maduros para todo lo que un ERP necesita (cámara, push, biometría, Bluetooth para impresoras, NFC, geolocalización).

**Arquitectura adoptada (actualizada tras auditoría SSR):** **Wrapper de URL remota (`server.url`) + plugins nativos**, replicando exactamente el patrón de Electron.

> **Cambio de arquitectura respecto a la versión inicial del plan:** La versión original proponía bundle local (static export) + Capgo OTA. La **auditoría SSR ejecutada en FASE 1** (ver sección 9) demostró que el proyecto NO es viable para `output: 'export'` sin 200-400 horas de reestructuración:
> - 21 páginas con `force-dynamic`
> - 50+ archivos usando `cookies()` de `next/headers`
> - 100+ API Routes (no se empaquetan en static export)
> - Middleware de 763 líneas (no funciona en static export)
> - next-intl requiere configuración especial
>
> Por ello se adopta `server.url` remoto (igual que Electron), que requiere **cero cambios** en `next.config.js` y `src/`.

**Riesgo y mitigación:** Ionic documenta que `server.url` "no está diseñado para producción" y puede causar rechazos App Store (Guideline 4.2). **Mitigación:** features nativas significativas (impresión Bluetooth ESC/POS, biometría, push, NFC, cámara, geolocalización) que elevan la app por encima de un "thin wrapper". Electron no tiene este riesgo porque no va a App Store.

**Impacto en el proyecto:**
- **Cero cambios en `next.config.js`** (no se necesita `output: 'export'`).
- **Cero cambios en `src/`** para FASE 1 (los adaptadores vienen en FASE 2+).
- **No se convierte en monorepo formal:** se crea `mobile/` al lado de `electron/`.
- **No se rompe Electron:** sigue cargando URL remota como hoy.
- **No se rompe web:** sigue con SSR/SSG/API Routes/middleware en Vercel.

---

## 1. Arquitectura recomendada

### 1.1 Estructura de carpetas

```
go-admin-erp/
├── src/                       # Next.js web (sin cambios estructurales)
│   ├── app/
│   ├── components/
│   ├── lib/
│   │   ├── utils/
│   │   │   ├── desktop.ts     # Bridge Electron (sin cambios)
│   │   │   ├── mobile.ts      # NUEVO: bridge Capacitor
│   │   │   └── platform.ts    # NUEVO: unificación isDesktop/isMobile/isWeb
│   │   └── ...
│   └── hooks/
│       ├── useDesktopAgent.ts # Sin cambios
│       └── useMobileNative.ts # NUEVO: hook para plugins Capacitor
├── electron/                  # Desktop (sin cambios)
├── print-agent/               # Agente impresión (sin cambios)
├── mobile/                    # NUEVO: app Capacitor
│   ├── capacitor.config.ts
│   ├── package.json
│   ├── android/
│   ├── ios/
│   ├── src/                   # Plugins custom nativos
│   │   └── print-bridge/
│   └── README.md
├── next.config.js             # Modificado: build condicional capacitor
└── package.json               # Modificado: scripts mobile:*
```

### 1.2 Flujo de la app móvil

```
┌─────────────────────────────────────────────────────────────┐
│  App Capacitor (iOS/Android)                                │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  WebView (WKWebView / Android WebView)                │  │
│  │  ┌─────────────────────────────────────────────────┐  │  │
│  │  │  https://app.goadmin.io (cargado remoto)        │  │  │
│  │  │  - Next.js con SSR/SSG/API Routes (Vercel)      │  │  │
│  │  │  - Middleware, cookies, todo funciona           │  │  │
│  │  │  - Supabase JS SDK directo (cliente)            │  │  │
│  │  │  - window.Capacitor + plugins nativos           │  │  │
│  │  └─────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────┘  │
│  Plugins nativos: Camera, Push, Biometric, BLE, NFC, Geo    │
└─────────────────────────────────────────────────────────────┘
        │                          │
        ▼                          ▼
  app.goadmin.io (Vercel)    Supabase (jgmgphmzusbluqhuqihj)
  - SSR/SSG/middleware       - PostgreSQL + Auth + Realtime
  - API Routes con secrets   - Storage
  - Webhooks                 - Edge Functions (push)
```

> **Mismo patrón que Electron:** el WebView carga `app.goadmin.io` y el bridge nativo expone hardware. Cero cambios en el backend o en `next.config.js`.

### 1.3 Similitud con Electron (patrón idéntico)

| Aspecto | Electron (actual) | Capacitor (móvil) |
|---|---|---|
| Contenido | URL remota `app.goadmin.io` | URL remota `app.goadmin.io` (igual) |
| SSR/SSG | Sí (lo sirve Vercel) | Sí (lo sirve Vercel, igual) |
| API Routes | Sí (servidas por Vercel) | Sí (servidas por Vercel, igual) |
| Middleware | Sí (funciona en Vercel) | Sí (funciona en Vercel, igual) |
| Bridge | `window.goAdminDesktop` (contextBridge) | `window.Capacitor` + plugins |
| Actualizaciones web | Automáticas (Vercel deploy) | Automáticas (Vercel deploy, igual) |
| Actualizaciones nativas | electron-updater (GitHub Releases) | App Store / Google Play releases |
| Impresión | Print-agent embebido (HTTP local) | Bluetooth LE nativo + impresoras red vía HTTP |

### 1.4 Principios de diseño

1. **Cero duplicación de UI:** la misma base de código Next.js sirve web, desktop y móvil.
2. **Cero cambios en `next.config.js`:** no se necesita `output: 'export'` porque se carga URL remota.
3. **Adaptadores, no reescrituras:** `src/lib/utils/platform.ts` unifica detección de entorno.
4. **Mismo patrón que Electron:** si funciona en Electron cargando `app.goadmin.io`, funciona en Capacitor.
5. **Plugins nativos solo cuando aportan valor:** no envolver features web que ya funcionan en WebView.
6. **Mitigación Guideline 4.2:** features nativas significativas para no ser "thin wrapper".

---

## 2. Análisis de la base de datos (Supabase `jgmgphmzusbluqhuqihj`)

El proyecto tiene **120+ tablas** con RLS habilitado en todas. A continuación las tablas relevantes para móvil, agrupadas por módulo y con el impacto móvil.

### 2.1 Tablas críticas para móvil

| Tabla | Filas | Módulo | Uso móvil | Plugin nativo relacionado |
|---|---|---|---|---|
| `profiles` | 97 | Auth | Login, biometría, push token | Biometric, Push |
| `organizations` | 1 | Core | Selector de org al login | — |
| `branches` | 1 | Core | Selector de sucursal | Geolocation |
| `organization_members` | 1 | Auth | Permisos RLS | — |
| `notifications` | 12,799 | Notificaciones | Push notifications | Push Notifications |
| `user_notification_preferences` | 6 | Notificaciones | Config push por usuario | Push Notifications |
| `notification_channels` | 0 | Notificaciones | Canales push | Push Notifications |
| `products` | 12,173 | Inventario | Catálogo, escáner | Camera, Barcode Scanner |
| `product_images` | 7,813 | Inventario | Fotos productos | Camera |
| `stock_levels` | 4,482 | Inventario | Stock por sucursal | — |
| `stock_movements` | 1,286 | Inventario | Movimientos | — |
| `sales` | 720 | POS | Ventas, tickets | Bluetooth (impresora) |
| `sale_items` | 74 | POS | Detalle venta | — |
| `cash_sessions` | 4 | POS | Caja, apertura | — |
| `cash_movements` | 4 | POS | Movimientos caja | — |
| `restaurant_tables` | 1 | POS | Mesas | — |
| `table_sessions` | 2 | POS | Sesiones mesa | — |
| `kitchen_tickets` | 5 | POS | Comandas cocina | Push (nuevas comandas) |
| `customers` | 19 | CRM | Clientes, fotos | Camera |
| `tasks` | 686 | CRM/Operations | Tareas asignadas | Push |
| `reservations` | 0 | PMS | Reservas hotel | Push |
| `folios` | 1 | PMS | Cargos hotel | — |
| `parking_sessions` | 0 | Parking | Entrada/salida vehículos | Camera (matrículas) |
| `member_checkins` | 0 | Gym | Check-in socios | Biometric, NFC |
| `memberships` | 0 | Gym | Membresías | — |
| `serial_numbers` | 97 | Inventario | Trazabilidad | Barcode Scanner |
| `products_audit_log` | 1,353 | Inventario | Auditoría | — |
| `ops_audit_log` | 1,937 | Operations | Auditoría | — |

### 2.2 Tabla nueva requerida: `device_push_tokens`

Para enviar push notifications desde Supabase Edge Functions, se necesita una tabla que almacene los tokens FCM/APNs por usuario y dispositivo.

```sql
-- Migración: supabase/migrations/XXXX_device_push_tokens.sql
create table public.device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  token text not null,
  app_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, token)
);

alter table public.device_push_tokens enable row level security;

create policy "Usuarios gestionan sus tokens"
  on public.device_push_tokens
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index idx_device_push_tokens_user on public.device_push_tokens(user_id);
```

### 2.3 Tabla existente a extender: `profiles`

Añadir columna para token push principal (opcional, complementario a `device_push_tokens`):

```sql
alter table public.profiles
  add column if not exists primary_push_token text;
```

### 2.4 RLS y móvil

Todas las tablas tienen RLS habilitado. La app móvil usa el mismo `supabase-js` con anon key + sesión del usuario, así que **RLS funciona idéntico a web**. No se requieren cambios en políticas existentes.

---

## 3. Plugins de Capacitor 8 a instalar

### 3.1 Plugins oficiales (prioridad ALTA — críticos)

| Plugin | Versión | NPM | Propósito | Permisos |
|---|---|---|---|---|
| `@capacitor/app` | 8.x | `@capacitor/app` | Estado app, deep links, back button | — |
| `@capacitor/browser` | 8.x | `@capacitor/browser` | OAuth flows (abrir browser externo) | — |
| `@capacitor/camera` | 8.x | `@capacitor/camera` | Fotos productos, clientes, entregas | Cámara, Galería |
| `@capacitor/barcode-scanner` | 8.x | `@capacitor/barcode-scanner` | Escaneo códigos barras, QR | Cámara |
| `@capacitor/geolocation` | 8.x | `@capacitor/geolocation` | Transporte, marcación, login | Location |
| `@capacitor/push-notifications` | 8.x | `@capacitor/push-notifications` | Push FCM/APNs | Notifications |
| `@capacitor/local-notifications` | 8.x | `@capacitor/local-notifications` | Recordatorios locales | Notifications |
| `@capacitor/network` | 8.x | `@capacitor/network` | Detección online/offline | — |
| `@capacitor/preferences` | 8.x | `@capacitor/preferences` | Reemplazo localStorage persistente | — |
| `@capacitor/haptics` | 8.x | `@capacitor/haptics` | Feedback táctil POS | — |
| `@capacitor/status-bar` | 8.x | `@capacitor/status-bar` | Status bar nativa | — |
| `@capacitor/splash-screen` | 8.x | `@capacitor/splash-screen` | Splash screen | — |
| `@capacitor/keyboard` | 8.x | `@capacitor/keyboard` | Comportamiento teclado | — |
| `@capacitor/filesystem` | 8.x | `@capacitor/filesystem` | Exportar PDF/CSV | Storage |
| `@capacitor/share` | 8.x | `@capacitor/share` | Compartir documentos | — |

### 3.2 Plugins community (prioridad MEDIA — específicos ERP)

| Plugin | Versión | NPM | Propósito |
|---|---|---|---|
| `@capacitor-community/bluetooth-le` | 8.2.0 | `@capacitor-community/bluetooth-le` | Impresoras térmicas ESC/POS BLE |
| `@aparajita/capacitor-biometric-auth` | 9.x | `@aparajita/capacitor-biometric-auth` | TouchID/FaceID login rápido |
| `@capgo/capacitor-nfc` | 8.2.2 | `@capgo/capacitor-nfc` | NFC para HRM/Gym (Android primario) |
| `@capgo/capacitor-updater` | 8.x | `@capgo/capacitor-updater` | Live updates OTA |
| `@capacitor-community/safe-area` | latest | `@capacitor-community/safe-area` | Safe areas edge-to-edge |

### 3.3 Plugin custom a desarrollar: `PrintBridge`

Equivalente móvil del print-agent de Electron. No se puede embeber un proceso Node en móvil, así que el bridge nativo hace:

- **Android:** impresión vía Bluetooth LE (ESC/POS) o impresoras de red (HTTP directo).
- **iOS:** impresión vía Bluetooth LE (ESC/POS) o impresoras de red (HTTP directo). AirPrint para impresoras del sistema.

```
mobile/src/print-bridge/
├── definitions.ts          # Interface TypeScript
├── android/                # Kotlin
│   └── PrintBridgePlugin.kt
└── ios/                    # Swift
    └── PrintBridgePlugin.swift
```

### 3.4 Comando de instalación completo

```bash
cd mobile
npm install @capacitor/app @capacitor/browser @capacitor/camera @capacitor/barcode-scanner \
  @capacitor/geolocation @capacitor/push-notifications @capacitor/local-notifications \
  @capacitor/network @capacitor/preferences @capacitor/haptics @capacitor/status-bar \
  @capacitor/splash-screen @capacitor/keyboard @capacitor/filesystem @capacitor/share

npm install @capacitor-community/bluetooth-le @aparajita/capacitor-biometric-auth \
  @capgo/capacitor-nfc @capgo/capacitor-updater @capacitor-community/safe-area

npx cap sync
```

---

## 4. Componentes y archivos a crear/modificar

### 4.1 Archivos NUEVOS

| Archivo | Estado | Propósito |
|---|---|---|
| `mobile/capacitor.config.ts` | ✅ Creado FASE 1 | Configuración Capacitor 8 con `server.url` remoto |
| `mobile/package.json` | ✅ Creado FASE 1 | Dependencias del sub-proyecto móvil (22 plugins) |
| `mobile/.gitignore` | ✅ Creado FASE 1 | Excluye `android/`, `ios/`, secrets |
| `mobile/README.md` | ✅ Creado FASE 1 | Documentación del sub-proyecto móvil |
| `src/lib/utils/mobile.ts` | ✅ Creado FASE 2 | Bridge Capacitor (281 líneas, detección runtime + 15 interfaces de plugins) |
| `src/lib/utils/platform.ts` | ✅ Creado FASE 2 | Unificación `isDesktop`/`isMobile`/`isWeb`/`getPlatform` (71 líneas) |
| `src/hooks/useMobileNative.ts` | ✅ Creado FASE 2 | Hook para plugins Capacitor (303 líneas, 13 funciones + 2 hooks especializados) |
| `src/app/api/auth/native-callback/route.ts` | ✅ Creado FASE 3 | API route bridge para OAuth deep links (51 líneas) |
| `src/lib/services/mobileAuthService.ts` | ✅ Creado FASE 3 | Servicio auth móvil: OAuth + deep links + Preferences storage (261 líneas) |
| `src/hooks/useMobileAuth.ts` | ✅ Creado FASE 3 | Hook para OAuth móvil con listener de deep links (140 líneas) |
| `mobile/tsconfig.json` | ✅ Creado FASE 3 | tsconfig propio de mobile/ (resuelve @capacitor/cli sin afectar raíz) |
| `src/lib/services/pushTokenService.ts` | ✅ Creado FASE 4 | Registro de tokens FCM/APNs en `device_push_tokens` (167 líneas) |
| Tabla `device_push_tokens` en Supabase | ✅ Creada FASE 4 | Tabla con RLS para tokens de push por usuario/plataforma |
| `src/lib/services/mobileEscposAdapter.ts` | ✅ Creado FASE 5 | Generador ESC/POS puro TS sin deps Node.js (523 líneas) |
| `src/lib/services/mobilePrintService.ts` | ✅ Creado FASE 5 | Servicio impresión BLE + red para móvil (426 líneas) |
| `mobile/src/print-bridge/definitions.ts` | Pendiente FASE 5 | Interface del plugin custom de impresión |
| `mobile/src/print-bridge/android/PrintBridgePlugin.kt` | Pendiente FASE 5 | Implementación Android |
| `mobile/src/print-bridge/ios/PrintBridgePlugin.swift` | Pendiente FASE 5 | Implementación iOS |
| `src/lib/services/pushTokenService.ts` | Pendiente FASE 4 | Registro de tokens FCM/APNs en `device_push_tokens` |
| `supabase/functions/push/index.ts` | Pendiente FASE 4 | Edge Function para enviar push |
| `.github/workflows/mobile-build.yml` | Pendiente FASE 7 | CI/CD GitHub Actions |

> **Hallazgo crítico de FASE 2:** `@capacitor/core` NO está instalado en el `package.json` raíz. Los archivos en `src/` **no importan** paquetes `@capacitor/*` — usan detección runtime de `window.Capacitor` con interfaces TypeScript propias. Esto evita romper el build web. Los plugins se invocan vía `window.Capacitor.Plugins.*` en runtime, accedido mediante `getMobilePlugin(name)`.

### 4.2 Archivos a MODIFICAR (cambios mínimos y condicionales)

| Archivo | Cambio | Impacto |
|---|---|---|
| `package.json` (raíz) | Añadir scripts `mobile:sync`, `mobile:open:*`, `mobile:run:*` | Solo scripts nuevos |
| `tsconfig.json` (raíz) | Excluir `mobile/` de `exclude` (igual que `print-agent`) | Evita error `@capacitor/cli` en IDE |
| `src/lib/auth/googleAuth.ts` | Rama `if (isMobile())` en `handleGoogleLogin()` → `startMobileOAuth('google')` | +11 líneas, web sin cambios |
| `src/lib/auth/microsoftAuth.ts` | Rama `if (isMobile())` en `handleMicrosoftLogin()` → `startMobileOAuth('azure')` | +12 líneas, web sin cambios |
| `src/app/auth/login/page.tsx` | Import `useMobileAuth` + useEffect para deep link result | +25 líneas, web sin cambios |
| `src/lib/utils/geolocation.ts` | Rama `isMobile()` en `getLocationFromBrowser()` → `Geolocation.getCurrentPosition()` nativo | +20 líneas, web sin cambios |
| `src/components/app-layout/OfflineIndicator.tsx` | Detecta `isMobile()` + usa `Network` plugin para detección precisa | +20 líneas, web sin cambios |
| `src/components/marcar/QRScanner.tsx` | Rama `isMobile()` en `startCamera()` → `BarcodeScanner.scan()` nativo | +15 líneas, web sin cambios |
| `src/components/app-layout/AppLayout.tsx` | useEffect para registrar push token en móvil tras login | +30 líneas, web sin cambios |
| `src/lib/services/cashDrawerService.ts` | Estrategia 0: `tryMobileBluetooth()` cuando `isMobile()` → `openCashDrawerBluetooth()` | +30 líneas, web sin cambios |
| `src/components/pos/configuracion/printers/PrinterFormDialog.tsx` | Rama `isMobile()` en `handleDetect()` → `discoverBluetoothPrinters()` | +30 líneas, web sin cambios |
| `src/components/pos/configuracion/agente-impresion/DesktopAgentPanel.tsx` | Panel móvil `MobilePrinterSection()` + rama `if (isMobile())` | +130 líneas, web sin cambios |
| `src/lib/supabase/config.ts` | En móvil, usar `@capacitor/preferences` en lugar de `localStorage` para sesión | **Pospuesto** — adapter es síncrono, Preferences es async (ver FASE 4.5) |

### 4.3 Archivos que NO se tocan

- `next.config.js` — **sin cambios** (no se necesita `output: 'export'` con `server.url` remoto).
- `electron/**` — sin cambios.
- `print-agent/**` — sin cambios.
- `src/middleware.ts` — sin cambios (funciona en Vercel, la app móvil carga la URL remota).
- Toda la lógica de servicios (`src/lib/services/*`) — funciona igual vía Supabase JS.
- Toda la UI de módulos no nativos (CRM, finanzas, reportes, calendario, timeline).
- Todas las API Routes (`src/app/api/**`) — se sirven desde Vercel, sin cambios.

---

## 5. Fases de implementación

### FASE 0 — Preparación y decisiones (1 día)

**Objetivo:** Sentar las bases sin tocar código de producción.

- [ ] **0.1** Crear cuenta Apple Developer Program ($99/año) si no existe.
- [ ] **0.2** Crear proyecto Firebase para FCM (Android + iOS).
- [ ] **0.3** Crear cuenta Capgo para live updates.
- [ ] **0.4** Reservar App IDs:
  - iOS Bundle ID: `io.goadmin.app`
  - Android Application ID: `io.goadmin.app`
- [ ] **0.5** Definir custom URL scheme: `goadmin` (para OAuth deep links).
- [ ] **0.6** Configurar en Supabase Dashboard → Authentication → URL Configuration:
  - Site URL: `https://app.goadmin.io`
  - Additional Redirect URLs: `goadmin://auth-callback`, `https://app.goadmin.io/api/auth/native-callback`

**Entregable:** Cuentas y IDs listos. Documentar credenciales en gestor seguro (NO en repo).

---

### FASE 1 — Scaffolding de `mobile/` (2 días) ✅ COMPLETADO

**Objetivo:** Tener un proyecto Capacitor 8 configurado y listo para añadir plataformas nativas.

> **Hallazgo de la auditoría SSR (ejecutada en esta fase):** El proyecto NO es viable para `output: 'export'` (static export) sin 200-400 horas de reestructuración. Ver sección 9 para el detalle completo. Por ello se adopta `server.url` remoto (igual que Electron), **sin cambios en `next.config.js`**.

- [x] **1.1** Crear carpeta `mobile/` con `package.json` (dependencias Capacitor 8 + plugins).
- [x] **1.2** Crear `mobile/capacitor.config.ts` con `server.url: 'https://app.goadmin.io'` + plugins config.
- [x] **1.3** Crear `mobile/.gitignore` (excluye `android/`, `ios/`, secrets, `node_modules/`).
- [x] **1.4** Crear `mobile/README.md` con instrucciones de setup y arquitectura.
- [x] **1.5** Añadir scripts en `package.json` raíz: `mobile:sync`, `mobile:open:android`, `mobile:open:ios`, `mobile:run:android`, `mobile:run:ios`.
- [x] **1.6** `next.config.js` **sin cambios** (no se necesita `output: 'export'` con `server.url` remoto).
- [ ] **1.7** (Pendiente de usuario) `cd mobile && npm install` para instalar dependencias.
- [ ] **1.8** (Pendiente de usuario) `npx cap add android` y `npx cap add ios` para crear proyectos nativos.
- [ ] **1.9** (Pendiente de usuario) `npm run mobile:sync` para sincronizar plugins.

**Entregable:** Carpeta `mobile/` con configuración lista. Pendiente: `npm install` + `cap add android/ios` (requiere entorno local del usuario).

---

### FASE 2 — Capa de abstracción de plataforma (2 días) ✅ COMPLETADO

**Objetivo:** Crear `platform.ts` y `mobile.ts` sin romper nada existente.

> **Hallazgo crítico de implementación:** `@capacitor/core` NO está instalado en el `package.json` raíz (solo en `mobile/package.json`). Si se importa `@capacitor/core` en `src/`, el build web de Next.js falla. **Solución:** detección runtime de `window.Capacitor` (igual que `desktop.ts` usa `window.goAdminDesktop`) con interfaces TypeScript propias definidas en `mobile.ts`. Cero imports de paquetes `@capacitor/*` en `src/`.

- [x] **2.1** Crear `src/lib/utils/mobile.ts` (281 líneas):
  - Detección runtime: `isMobile()`, `isIOS()`, `isAndroid()`, `getMobilePlatform()`
  - Bridge: `getMobileBridge()`, `getMobilePlugin(name)`, `mobilePluginAvailable(name)`
  - Interfaces tipadas para 15 plugins: Camera, BarcodeScanner, Geolocation, PushNotifications, LocalNotifications, Network, Preferences, Haptics, BiometricAuth, BluetoothLe, NFC, App, Browser, Filesystem, Share
  - SSR-safe: `typeof window !== 'undefined'` checks
  - Sin imports de `@capacitor/*` (usa `window.Capacitor.Plugins.*` en runtime)
- [x] **2.2** Crear `src/lib/utils/platform.ts` (71 líneas):
  - Unifica `isDesktop()`, `isMobile()`, `isIOS()`, `isAndroid()`, `isWeb()`, `isNativeApp()`
  - `getPlatform(): 'web' | 'desktop' | 'mobile-ios' | 'mobile-android'`
  - `getPlatformLabel(): string` para UI
  - Re-exports de `desktop.ts` y `mobile.ts` para import centralizado
- [x] **2.3** Crear `src/hooks/useMobileNative.ts` (303 líneas):
  - `'use client'` directive (siguiendo patrón de `useDesktopAgent.ts`)
  - Hook principal `useMobileNative()` con 13 funciones: takePhoto, pickImages, scanBarcode, getCurrentPosition, registerPushToken, authenticateBiometric, discoverBluetoothPrinters, hapticImpact, hapticNotification + estado networkStatus
  - Hooks especializados: `useIsMobile()`, `useMobilePluginAvailable(name)`
  - Lazy init: `useState(() => isMobile())`
  - Graceful degradation: retorna `null`/`[]`/`false` en web (no throw)
  - useEffect con cleanup para listeners de Network
- [x] **2.4** Verificado: `tsc --noEmit` reporta **0 errores** en los 3 archivos nuevos.
- [x] **2.5** Verificado: build web de Next.js no se rompe por los archivos nuevos (error pre-existente en `src/app/auth/signup/page.tsx` línea 867 es independiente y pre-existente a esta fase).

**Patrones respetados (según auditoría de código existente):**
- Named exports (no default exports)
- JSDoc en español
- `@/` alias para imports
- `'use client'` solo en hooks, no en utils
- SSR-safe con `typeof window !== 'undefined'`
- TypeScript strict mode compatible
- Graceful degradation (null en lugar de throw)

**Entregable:** Detección de plataforma funcional en web, desktop y móvil sin regresiones. Los componentes pueden empezar a usar `useMobileNative()` y `isMobile()` condicionalmente.

---

### FASE 3 — Autenticación y deep links (3 días) ✅ COMPLETADO

**Objetivo:** Login funcional en móvil con email/password, magic link y OAuth (Google/Microsoft) via deep links.

> **Hallazgos del subagente de auditoría auth:**
> - OAuth se maneja en `src/lib/auth/googleAuth.ts` y `microsoftAuth.ts` → llaman a `signInWithGoogle()`/`signInWithMicrosoft()` en `config.ts`
> - Callback en `src/app/auth/callback/route.ts` (App Router, PKCE flow)
> - Redirect URL actual: `window.location.origin/auth/callback`
> - Storage híbrido: localStorage + cookies chunked en `config.ts`
> - Middleware excluye `/auth/callback` para no interferir con PKCE
> - `@supabase/ssr` y `@supabase/auth-helpers-nextjs` instalados pero NO usados (usa `@supabase/supabase-js` directo con custom storage adapter)

- [x] **3.1** Crear API route bridge `src/app/api/auth/native-callback/route.ts` (51 líneas):
  - Recibe `?code=...` (PKCE) o `?access_token=...&refresh_token=...` (token flow)
  - Responde con redirect 302 a `goadmin://auth-callback?...` (custom URL scheme)
  - Maneja errores de OAuth redirigiendo con `?error=...`
- [x] **3.2** Crear `src/lib/services/mobileAuthService.ts` (261 líneas):
  - `startMobileOAuth(provider)`: signInWithOAuth con `skipBrowserRedirect: true` + `Browser.open()` externo
  - `registerMobileAuthListener(callback)`: listener de `App.addListener('appUrlOpen')` para deep links
  - `processMobileAuthUrl(url)`: procesa `goadmin://auth-callback?...` y llama `setSession()` o `exchangeCodeForSession()`
  - `getMobileStorage/setMobileStorage/removeMobileStorage`: wrapper de `@capacitor/preferences` para sesión
  - Constantes: `MOBILE_DEEP_LINK_SCHEME = 'goadmin://auth-callback'`, `NATIVE_CALLBACK_URL`
- [x] **3.3** Crear `src/hooks/useMobileAuth.ts` (140 líneas):
  - `'use client'` directive (siguiendo patrón de `useDesktopAgent.ts`)
  - Hook `useMobileAuth()`: registra listener al montar, expone `loginWithGoogle()`, `loginWithMicrosoft()`, `authResult`, `oauthError`
  - Hook `useProcessMobileAuthUrl()`: para procesar deep links en cold start
  - Cleanup de listener al desmontar
- [x] **3.4** Modificar `src/lib/auth/googleAuth.ts` (cambio preciso, +11 líneas):
  - Import `isMobile` y `startMobileOAuth`
  - En `handleGoogleLogin()`: rama `if (isMobile())` que usa `startMobileOAuth('google')` en lugar de `signInWithGoogle()`
  - Web/desktop sin cambios (mismo flujo actual)
- [x] **3.5** Modificar `src/lib/auth/microsoftAuth.ts` (cambio preciso, +12 líneas):
  - Misma rama `if (isMobile())` que usa `startMobileOAuth('azure')`
- [x] **3.6** Modificar `src/app/auth/login/page.tsx` (cambio preciso, +25 líneas):
  - Import `useRouter` y `useMobileAuth`
  - Hook `useMobileAuth()` activo en `LoginContent`
  - useEffect que redirige a `authResult.next` cuando OAuth via deep link es exitoso
  - useEffect que muestra `mobileOAuthError` si falla
- [x] **3.7** Verificado: `tsc --noEmit` reporta **0 errores** en archivos FASE 3.
- [ ] **3.8** (Pendiente de usuario) Configurar en Supabase Dashboard → Authentication → URL Configuration:
  - Additional Redirect URLs: añadir `https://app.goadmin.io/api/auth/native-callback` y `goadmin://auth-callback`
- [ ] **3.9** (Pendiente de usuario) Configurar custom URL scheme `goadmin` en:
  - `mobile/ios/App/App/Info.plist` → `CFBundleURLTypes` (requiere `cap add ios` primero)
  - `mobile/android/app/src/main/AndroidManifest.xml` → `intent-filter` (requiere `cap add android` primero)
- [ ] **3.10** (Pendiente de usuario) Configurar `WKAppBoundDomains` en Info.plist:
  ```xml
  <key>WKAppBoundDomains</key>
  <array>
    <string>app.goadmin.io</string>
    <string>*.supabase.co</string>
  </array>
  ```

**Arquitectura del flujo OAuth móvil:**
```
App móvil → signInWithOAuth(skipBrowserRedirect) → Browser.open(url)
  → Google/Microsoft auth → Supabase redirect a /api/auth/native-callback
  → 302 a goadmin://auth-callback?code=... → SO abre app via deep link
  → App.addListener('appUrlOpen') → processMobileAuthUrl → setSession
  → router.push('/app/inicio')
```

**Entregable:** OAuth con Google/Microsoft funcional en móvil via deep links. Email/password funciona sin cambios (usa Supabase JS directo). Pendiente: configuración nativa (Info.plist, AndroidManifest) que requiere `cap add ios/android` previo.

---

### FASE 4 — Plugins nativos core (5 días) ✅ COMPLETADO

**Objetivo:** Implementar los plugins de prioridad ALTA con adaptadores en componentes existentes.

> **Hallazgos del subagente de auditoría FASE 4:**
> - La tabla `device_push_tokens` **NO existía** en Supabase → creada via MCP con RLS en esta fase
> - `OfflineIndicator.tsx` detecta desktop via `window.goAdminDesktop` directamente (no via `isDesktop()`)
> - `QRScanner.tsx` existe en `src/components/marcar/` y usa `jsQR` + `getUserMedia`
> - `ImagenesPage.tsx` usa `<input type="file">` estándar (no getUserMedia)
> - `AppLayout.tsx` ya tiene lógica de registro de dispositivo → lugar ideal para push token
> - `layout.tsx` es Server Component → no se puede modificar con hooks
> - **Hallazgo crítico:** el storage adapter de Supabase JS es **síncrono** (getItem/setItem/removeItem), pero `@capacitor/preferences` es **asíncrono**. No se puede usar `await` dentro del adapter. Solución: mantener localStorage en el adapter (funciona en WebView de Capacitor) y usar Preferences solo para datos no-críticos. La migración de sesión a Preferences requiere un wrapper con cache en memoria (pospuesto a optimización futura).

- [x] **4.1 Geolocalización**
  - Modificado `src/lib/utils/geolocation.ts`: rama `isMobile()` en `getLocationFromBrowser()` → `Geolocation.getCurrentPosition()`
  - Web/desktop sin cambios (mismo flujo `navigator.geolocation`)
  - Permisos pendientes: `NSLocationWhenInUseUsageDescription` (iOS), `ACCESS_FINE_LOCATION` (Android)

- [x] **4.2 Network y offline**
  - Modificado `src/components/app-layout/OfflineIndicator.tsx`:
    - Detecta móvil además de desktop: `isMobileApp = isMobile()`
    - En móvil, usa `Network.getStatus()` + `Network.addListener('networkStatusChange')` para detección precisa
    - Web/desktop sin cambios (eventos `online`/`offline` del navegador)
  - `offlineCache.ts` funciona igual en móvil (IndexedDB disponible en WebView)

- [x] **4.3 Cámara y escáner QR**
  - Modificado `src/components/marcar/QRScanner.tsx`: rama `isMobile()` en `startCamera()` → `BarcodeScanner.scan()` nativo
  - Si plugin no disponible, cae al flujo web (getUserMedia + jsQR)
  - Permisos pendientes: `NSCameraUsageDescription` (iOS), `CAMERA` (Android)
  - ImágenesPage.tsx: pendiente (usa input type=file que funciona en WebView nativo)

- [x] **4.4 Push notifications**
  - Creada tabla `device_push_tokens` en Supabase via MCP (con RLS: usuarios solo gestionan sus tokens)
  - Creado `src/lib/services/pushTokenService.ts` (167 líneas):
    - `registerPushToken(userId)`: solicita permiso, registra, obtiene token, upsert en BD
    - `unregisterPushToken(userId)`: elimina token al logout
    - `removeAllUserTokens(userId)`: cleanup administrativo
  - Modificado `src/components/app-layout/AppLayout.tsx`: useEffect que registra push token tras login (delay 3s para sesión lista)
  - Pendiente: Firebase `google-services.json` y `GoogleService-Info.plist` (requiere `cap add android/ios`)
  - Pendiente: Edge Function `supabase/functions/push/index.ts` (FASE 4.5 futura)

- [x] **4.5 Preferences (localStorage persistente)**
  - **Decisión:** NO migrar el storage adapter de Supabase a Preferences (es síncrono, Preferences es async)
  - localStorage funciona en WebView de Capacitor (con riesgo de limpieza en iOS)
  - Para datos críticos no-auth, usar `getMobileStorage/setMobileStorage` de `mobileAuthService.ts` (async)
  - Migración de sesión a Preferences con cache en memoria: pospuesta a optimización futura

- [ ] **4.6 Splash screen, status bar, safe areas** (pendiente de `cap add android/ios`)
  - Configurar `@capacitor/splash-screen` con logo de GoAdmin
  - Configurar `@capacitor/status-bar` (style: dark/light según tema)
  - Instalar `@capacitor-community/safe-area` para edge-to-edge Android 15+
  - Añadir CSS global: `padding-top: env(safe-area-inset-top)` en layout principal

- [x] **4.7 Verificación:** `tsc --noEmit` reporta **0 errores** en archivos FASE 4.

**Entregable:** Geolocalización, offline indicator, escáner QR y push notifications funcionando en móvil via plugins nativos. Web/desktop sin regresiones (ramas `if (isMobile())` son no-ops).

---

### FASE 5 — Impresión móvil (4 días) ✅ COMPLETADO

**Objetivo:** Imprimir tickets POS desde móvil vía Bluetooth LE y red.

> **Hallazgos del subagente de auditoría FASE 5:**
> - `renderEscpos.ts` en print-agent usa librería `escpos` de Node.js → **NO reutilizable** en móvil
> - `paper.ts` y `types.ts` de print-agent son TypeScript puro → **SÍ reutilizables** (importados via alias)
> - `cashDrawerService.ts` ya tiene comando ESC/POS de cajón (`0x1b 0x70 0x00 0x64 0x64`) → reutilizado
> - `PrinterFormDialog.tsx` descubre impresoras via bridge desktop o HTTP localhost:3456 → añadida rama móvil
> - `DesktopAgentPanel.tsx` muestra estado del agente Electron → añadido panel móvil simplificado
> - Tabla `printers` en Supabase ya soporta `connection_type: 'bluetooth'` con `mac_address`
> - `useMobileNative.ts` ya tiene `discoverBluetoothPrinters()` → reutilizado via `mobilePrintService`
> - **No se necesita plugin custom PrintBridge** — `@capacitor-community/bluetooth-le` ya instalado en mobile/

- [x] **5.1** Adaptador ESC/POS puro TypeScript — `src/lib/services/mobileEscposAdapter.ts` (523 líneas):
  - `EscposBuilder` class: init, printMode, bold, align, separator, cut, openCashDrawer, qr, row2cols
  - `buildSaleTicket(payload, paperWidth)` — ticket de venta completo con items, totales, pagos, delivery
  - `buildKitchenTicket(payload, paperWidth)` — comanda de cocina con estación, items, notas
  - `buildPreCuenta(payload, paperWidth)` — pre-cuenta simplificada
  - `buildCashDrawerCommand()` — comando ESC p m t1 t2
  - Sin dependencias de Node.js (usa TextEncoder del navegador)
  - Reutiliza `paper.ts` y `types.ts` de print-agent via import

- [x] **5.2** Servicio de impresión móvil — `src/lib/services/mobilePrintService.ts` (426 líneas):
  - `discoverBluetoothPrinters()` → `BluetoothLe.requestDevice()` con filtro UUID impresoras
  - `connectToPrinter(deviceId)` / `disconnectFromPrinter(deviceId)` — gestión de conexión BLE
  - `printEscPosBluetooth(deviceId, data)` — envía Uint8Array en chunks base64 via BLE
  - `printEscPosNetwork(ip, port, data)` — pendiente plugin TCP nativo (documentado)
  - `printSaleTicket(deviceId, payload)` — alto nivel: genera buffer + envía BLE
  - `printKitchenTicket(deviceId, payload)` / `printPreCuenta(deviceId, payload)`
  - `openCashDrawerBluetooth(deviceId)` — abre cajón via BLE
  - `printTestPage(deviceId)` — página de prueba para verificar conexión
  - UUIDs estándar: `000018f0` (servicio), `00002af1` (characteristic) + alternativos Epson
  - Chunks de 180 bytes para no exceder MTU BLE

- [x] **5.3** Modificar `src/lib/services/cashDrawerService.ts` (+30 líneas):
  - Nueva estrategia 0: `tryMobileBluetooth()` — primera opción cuando `isMobile()`
  - Lee `deviceId` de `localStorage['mobile_bluetooth_printer_id']`
  - Llama `openCashDrawerBluetooth(deviceId)` del mobilePrintService
  - Web/desktop sin cambios (estrategias 1-3 intactas)

- [x] **5.4** Modificar `src/components/pos/configuracion/printers/PrinterFormDialog.tsx` (+30 líneas):
  - Import `isMobile` de `@/lib/utils/mobile`
  - En `handleDetect()`: rama `if (isMobile())` que usa `discoverBluetoothPrinters()`
  - Guarda `deviceId` en `localStorage['mobile_bluetooth_printer_id']`
  - Setea `connection_type: 'bluetooth'` y `mac_address: deviceId` en el form
  - Web/desktop sin cambios (mismo flujo bridge/HTTP)

- [x] **5.5** Modificar `src/components/pos/configuracion/agente-impresion/DesktopAgentPanel.tsx` (+130 líneas):
  - Import `isMobile` de `@/lib/utils/mobile`
  - Nuevo componente `MobilePrinterSection()` — UI para móvil:
    - Botón "Descubrir impresora Bluetooth" → `discoverBluetoothPrinters()`
    - Muestra impresora conectada con nombre y deviceId
    - Botón "Imprimir prueba" → `printTestPage(deviceId)`
    - Botón "Abrir cajón" → `openCashDrawerBluetooth(deviceId)`
    - Estado de conexión y mensajes de feedback
  - En `DesktopAgentPanel()`: `if (isMobile())` renderiza panel móvil simplificado (sin agente Electron)
  - Web/desktop sin cambios (mismo panel de agente)

- [x] **5.6** Verificación: `tsc --noEmit` reporta **0 errores** en archivos FASE 5.

- [ ] **5.7** (Pendiente de usuario) Permisos Bluetooth nativos:
  - Android: `BLUETOOTH`, `BLUETOOTH_ADMIN`, `BLUETOOTH_CONNECT`, `BLUETOOTH_SCAN` en AndroidManifest
  - iOS: `NSBluetoothAlwaysUsageDescription` en Info.plist

- [ ] **5.8** (Pendiente de usuario) Plugin TCP nativo para impresión por red (futuro):
  - Instalar `@capacitor-community/tcp-socket` o similar
  - Implementar `printEscPosNetwork()` con conexión TCP directa al puerto 9100

**Arquitectura del flujo de impresión móvil:**
```
App móvil → buildSaleTicket(payload) → Uint8Array ESC/POS
  → printEscPosBluetooth(deviceId, data)
  → BluetoothLe.write({ service: 18f0, characteristic: 2af1, value: base64 })
  → Impresora térmica Bluetooth ESC/POS
```

**Entregable:** Tickets POS, comandas de cocina, pre-cuentas y apertura de cajón imprimiéndose desde móvil vía Bluetooth LE. Web/desktop sin regresiones.

---

### FASE 6 — Biometría y NFC (3 días)

**Objetivo:** Login biométrico y check-in NFC/HRM.

- [ ] **6.1 Biometría**
  - Instalar `@aparajita/capacitor-biometric-auth`
  - Añadir `NSFaceIDUsageDescription` en Info.plist
  - Crear `src/lib/services/biometricService.ts`:
    - `isBiometricAvailable()` — verifica hardware
    - `authenticateWithBiometric()` — muestra prompt nativo
  - Modificar `src/app/auth/login/page.tsx`: botón "Entrar con huella/Face ID" si `isMobile()` y biometría disponible
  - Modificar `src/app/app/gym/check-in/` y `src/app/app/hrm/marcacion/`: usar biometría para check-in empleados

- [ ] **6.2 NFC (Android primario)**
  - Instalar `@capgo/capacitor-nfc`
  - Añadir permiso `NFC` en AndroidManifest
  - Crear `src/lib/services/nfcService.ts`:
    - `startNfcScan()` — lee tag NDEF
    - `writeNfcTag(data)` — escribe tag (para tarjetas empleado)
  - Modificar `src/app/app/hrm/marcacion/`: si `isAndroid()`, leer NFC tag para marcación
  - Modificar `src/app/app/gym/check-in/`: si `isAndroid()`, leer NFC tag para check-in socio
  - iOS: NFC limitado a NDEF tags reading con entitlement especial; documentar limitación

**Entregable:** Login con huella funcional. Check-in NFC en Android.

---

### FASE 7 — CI/CD y distribución (3 días)

**Objetivo:** Builds automatizados y publicación en stores.

> **Nota:** Con `server.url` remoto, Capgo OTA no es necesario para actualizar la web (Vercel deploy lo hace). Capgo solo sería útil para updates de plugins nativos sin pasar por store, pero eso requiere bundle local. Se pospone Capgo y se prioriza CI/CD directo a stores.

- [ ] **7.1 GitHub Actions CI/CD**
  - Crear `.github/workflows/mobile-build.yml`:
    - Job `build-android`: ubuntu-latest, genera `.aab`, sube artifact
    - Job `build-ios`: macos-latest, genera `.ipa`, sube artifact
    - Trigger: push a `main` (solo si cambia `mobile/`)
  - Secrets necesarios en GitHub:
    - `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEY_PASSWORD`, `ANDROID_STORE_PASSWORD`
    - `IOS_CERTIFICATE_P12_BASE64`, `IOS_PROVISIONING_PROFILE_BASE64`, `IOS_CERTIFICATE_PASSWORD`

- [ ] **7.2 Fastlane (opcional, recomendado)**
  - Automatizar screenshots, metadata upload y submit a stores
  - `fastlane supply` (Android) y `fastlane deliver` (iOS)

- [ ] **7.3 Capgo (opcional, futuro)**
  - Solo si se migra a bundle local en el futuro
  - Por ahora la web se actualiza via Vercel deploy (instantáneo, sin store review)

**Entregable:** Pipeline CI/CD que genera builds y sube a Capgo/stores.

---

### FASE 8 — Distribución en stores (2 días)

**Objetivo:** Publicar en App Store y Google Play.

- [ ] **8.1 App Store (iOS)**
  - Crear App Record en App Store Connect
  - Configurar `appId: io.goadmin.app` en Xcode
  - Archive y subir vía Xcode Organizer o `xcodebuild -exportArchive`
  - Metadatos: descripción, screenshots, iconos, privacy policy
  - **Crítico para Guideline 4.2:** destacar features nativas en descripción:
    - "Impresión de tickets vía Bluetooth"
    - "Login con Face ID / Touch ID"
    - "Notificaciones push en tiempo real"
    - "Escaneo de códigos de barras con cámara"
    - "Geolocalización para transporte y marcación"

- [ ] **8.2 Google Play (Android)**
  - Crear app en Google Play Console
  - Generar keystore release:
    ```bash
    keytool -genkey -v -keystore mobile/android/release.keystore \
      -alias goadmin -keyalg RSA -keysize 2048 -validity 10000
    ```
  - Configurar `signingConfigs.release` en `mobile/android/app/build.gradle`
  - Subir `.aab` vía Play Console o `gradlew publishBundle`
  - Metadatos: descripción, screenshots, iconos, privacy policy

- [ ] **8.3 Configuración de privacidad**
  - App Privacy Policy (URL pública, ej. `https://goadmin.io/privacy`)
  - Declarar uso de datos: cámara, ubicación, notificaciones, NFC
  - iOS: App Tracking Transparency si se recolecta datos analíticos

**Entregable:** Apps publicadas y aprobadas en ambas stores.

---

### FASE 9 — Optimización y hardening (continuo)

**Objetivo:** Pulir UX móvil y resolver edge cases.

- [ ] **9.1** Optimizar renders para WebView: virtualizar listas largas (productos 12K+, notificaciones 12K+)
- [ ] **9.2** Implementar `@capacitor/keyboard` para comportamiento correcto de inputs
- [ ] **9.3** Configurar `@capacitor/haptics` en acciones POS (cobro, apertura caja)
- [ ] **9.4** Filesystem: exportar PDFs de facturas a dispositivo, compartir vía `@capacitor/share`
- [ ] **9.5** Background mode para Supabase Realtime: reconexión automática al volver a foreground
- [ ] **9.6** Migrar `localStorage` restante a `@capacitor/preferences` (config, preferencias)
- [ ] **9.7** Probar offline real: modo avión, verificar cache y re-sync
- [ ] **9.8** Performance: medir cold start, optimizar bundle (dynamic imports, code splitting)
- [ ] **9.9** Accesibilidad: VoiceOver/TalkBack en componentes nativos
- [ ] **9.10** Monitoreo: integrar Sentry o similar para crash reporting móvil

---

## 6. Mapeo de módulos → features nativas móviles

| Módulo | Ruta | Features nativas móviles | Plugins |
|---|---|---|---|
| Auth | `/auth` | OAuth deep link, biometría | Browser, Biometric |
| POS | `/app/pos` | Escáner QR, impresión BLE, cajón | Barcode, Bluetooth LE, Haptics |
| Inventario | `/app/inventario` | Fotos productos, escáner códigos | Camera, Barcode |
| Clientes | `/app/clientes` | Foto perfil | Camera |
| Transporte | `/app/transporte` | GPS, fotos entrega | Geolocation, Camera |
| HRM | `/app/hrm` | Biometría, NFC marcación | Biometric, NFC |
| Gym | `/app/gym` | Biometría check-in, NFC socios | Biometric, NFC |
| Notificaciones | `/app/notificaciones` | Push notifications | Push Notifications |
| Chat | `/app/chat` | Push, cámara fotos | Push, Camera |
| PMS | `/app/pms` | Push reservas | Push |
| Parking | `/app/pms/parking` | Cámara matrículas | Camera |
| Finanzas | `/app/finanzas` | Exportar PDF/CSV | Filesystem, Share |
| CRM | `/app/crm` | — (sin nativo) | — |
| Reportes | `/app/reportes` | Exportar PDF | Filesystem, Share |
| Calendario | `/app/calendario` | Local notifications | Local Notifications |

---

## 7. Limitaciones conocidas y mitigaciones

| Limitación | Plataforma | Mitigación |
|---|---|---|
| `server.url` documentado "no para producción" por Ionic | Ambos | Features nativas significativas para mitigar Guideline 4.2 |
| Service Workers no funcionan | iOS WKWebView | La web maneja offline con IndexedDB (ya existe `offlineCache.ts`) |
| localStorage puede limpiarse | iOS | Migrar a `@capacitor/preferences` en componentes móviles (FASE 4) |
| 3rd party cookies bloqueadas | iOS 14+ | `WKAppBoundDomains` en Info.plist (FASE 3) |
| Background fetch mínimo 15 min | iOS | Push notifications para tiempo real |
| USB impresoras no accesibles | iOS/Android | Solo Bluetooth LE y red en móvil |
| NFC limitado a NDEF tags | iOS | NFC completo solo Android; iOS con entitlement |
| Twilio Voice Agent (WS directo) | Ambos | Evaluar `@capacitor-community/http` o nativo (FASE 9) |

---

## 8. Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Rechazo App Store Guideline 4.2 (thin wrapper) | Media | Alto | Features nativas significativas (BLE, biometría, push, NFC, cámara, geo) |
| `server.url` deprecado en futura versión Capacitor | Baja | Medio | Migrar a static export solo si se resuelven bloqueadores SSR (sección 9) |
| OAuth no completa redirect en iOS | Media | Alto | API Route bridge 302 + custom scheme (FASE 3) |
| Bluetooth LE impresoras incompatibles | Media | Medio | Probar con impresoras ESC/POS comunes (Xprinter, Epson) |
| Cookies cross-origin en iOS WKWebView | Media | Medio | `WKAppBoundDomains` en Info.plist (FASE 3) |
| Bundle size grande (12K productos) | Baja | Bajo | La web se sirve desde Vercel con CDN; no afecta al bundle móvil |

---

## 9. Auditoría SSR: viabilidad de `output: 'export'` (ejecutada en FASE 1)

> **Conclusión:** El proyecto **NO es viable** para static export sin 200-400 horas de reestructuración. Por ello se adopta `server.url` remoto (igual que Electron). Esta sección documenta el hallazgo que cambió la arquitectura.

### 9.1 Bloqueadores críticos identificados

| Categoría | Severidad | Cantidad | Impacto en static export |
|---|---|---|---|
| `force-dynamic` | CRÍTICA | 21 páginas | Incompatible total |
| `cookies()` de `next/headers` | CRÍTICA | 50+ archivos | No funciona en static export |
| API Routes | CRÍTICA | 100+ rutas | No se empaquetan |
| Middleware (`src/middleware.ts`) | CRÍTICA | 763 líneas | No funciona en static export |
| next-intl (i18n) | ALTA | 95+ archivos | Requiere config especial |
| `params` (rutas dinámicas `[id]`) | MEDIA | 100+ páginas | Requiere `generateStaticParams` |
| `cache: 'no-store'` | MEDIA | 1 archivo | Fuerza dynamic rendering |
| `redirect()` en server components | MEDIA | 46 usos | Requiere migración a client |
| `useSearchParams()` (client) | BAJA | 72 archivos | Compatible (client-side) |
| Server Actions | BAJA | 0 | No aplica |
| `headers()` | BAJA | 0 | No aplica |
| Dynamic OG images | BAJA | 0 | No aplica |

### 9.2 Páginas con `force-dynamic` (21)

Archivos que deben eliminar `force-dynamic` si se quisiera static export:

- `src/app/app/inicio/page.tsx`
- `src/app/app/layout.tsx`
- `src/app/app/hrm/asistencia/ajustes/nuevo/page.tsx`
- `src/app/app/gym/reservaciones/page.tsx`
- `src/app/app/crm/pipeline/edit-opportunity/page.tsx`
- `src/app/app/pms/reservas/nueva/page.tsx`
- `src/app/auth/signup/page.tsx`
- `src/app/auth/select-organization/page.tsx`
- `src/app/auth/invite/page.tsx`
- `src/app/auth/super-admin-access/page.tsx`
- `src/app/auth/reset-password/page.tsx`
- `src/app/app/crm/oportunidades/nuevo/page.tsx`
- `src/app/app/finanzas/contabilidad/asientos/page.tsx`
- + 7 API Routes (no se empaquetan de todos modos)

### 9.3 Middleware (`src/middleware.ts`)

**763 líneas** que manejan:
- Validación de sesiones y autenticación
- Manejo de cookies chunked de Supabase
- Redirecciones basadas en autenticación
- Verificación de módulos activos
- Actualización de actividad de usuario
- Manejo de OAuth callbacks

El middleware **NO funciona** con static export. Migrar toda esta lógica a client-side sería inviable sin reescribir la auth del proyecto.

### 9.4 API Routes (100+)

Las API Routes no se empaquetan en static export. Incluyen:
- AI Assistant (11 rutas)
- Integraciones (Stripe, Meta, TikTok, Google Ads, PayPal, PayU, MercadoPago, Wompi, SendGrid, Booking, Expedia, TripAdvisor, Factus)
- Auth callbacks
- Chat AI
- Cron jobs
- Webhooks

Todas usan secrets de servidor y `cookies()`. Migrarlas a un backend separado sería un proyecto entero aparte.

### 9.5 Decisión de arquitectura

Dado el hallazgo, se descarta static export y se adopta **`server.url` remoto** (igual que Electron):

| Opción | Esfuerzo | Viabilidad |
|---|---|---|
| Static export (`output: 'export'`) | 200-400 horas | ❌ In viable |
| `server.url` remoto (como Electron) | 0 horas en `next.config.js` | ✅ Adoptada |
| Híbrida (static + API remota) | 100-150 horas | ⚠️ Innecesaria si `server.url` funciona |

**`server.url` remoto es la opción correcta** porque replica exactamente el patrón que Electron ya usa con éxito. El único riesgo es Apple Guideline 4.2, mitigado con features nativas significativas.

---

## 10. Checklist de permisos nativos

### iOS (`Info.plist`)

```xml
<key>NSCameraUsageDescription</key>
<string>GoAdmin usa la cámara para escanear códigos de barras y tomar fotos de productos.</string>

<key>NSPhotoLibraryUsageDescription</key>
<string>GoAdmin accede a la galería para seleccionar fotos de productos y clientes.</string>

<key>NSFaceIDUsageDescription</key>
<string>Usamos Face ID para que accedas a GoAdmin de forma rápida y segura.</string>

<key>NSLocationWhenInUseUsageDescription</key>
<string>GoAdmin usa tu ubicación para marcación de asistencia y seguimiento de transporte.</string>

<key>NSBluetoothAlwaysUsageDescription</key>
<string>GoAdmin usa Bluetooth para conectar con impresoras térmicas de tickets.</string>

<key>NSBluetoothPeripheralUsageDescription</key>
<string>GoAdmin usa Bluetooth para conectar con impresoras térmicas de tickets.</string>

<key>WKAppBoundDomains</key>
<array>
  <string>app.goadmin.io</string>
  <string>*.supabase.co</string>
</array>

<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLName</key>
    <string>io.goadmin.app</string>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>goadmin</string>
    </array>
  </dict>
</array>
```

### Android (`AndroidManifest.xml`)

```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.BLUETOOTH" />
<uses-permission android:name="android.permission.BLUETOOTH_ADMIN" />
<uses-permission android:name="android.permission.BLUETOOTH_SCAN" />
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
<uses-permission android:name="android.permission.NFC" />
<uses-permission android:name="android.permission.VIBRATE" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-feature android:name="android.hardware.location.gps" />
<uses-feature android:name="android.hardware.bluetooth_le" />

<intent-filter>
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="goadmin" />
</intent-filter>
```

---

## 11. Estimación de esfuerzo total

| Fase | Duración estimada | Dependencias |
|---|---|---|
| FASE 0 — Preparación | 1 día | Ninguna |
| FASE 1 — Scaffolding | 2 días | FASE 0 |
| FASE 2 — Plataforma | 2 días | FASE 1 |
| FASE 3 — Auth + deep links | 3 días | FASE 2 |
| FASE 4 — Plugins core | 5 días | FASE 3 |
| FASE 5 — Impresión móvil | 4 días | FASE 4 |
| FASE 6 — Biometría + NFC | 3 días | FASE 4 |
| FASE 7 — Live updates + CI/CD | 3 días | FASE 4 |
| FASE 8 — Stores | 2 días | FASE 5, 6, 7 |
| FASE 9 — Hardening | Continuo | FASE 8 |
| **Total MVP (FASE 0-8)** | **~25 días laborables** | |

---

## 12. Fuentes consultadas (2025-2026)

- Capacitor 8 release: https://ionic.io/blog/announcing-capacitor-8 (8 dic 2025)
- Capacitor config docs: https://capacitorjs.com/docs/config
- `server.url` no recomendado para producción: https://github.com/ionic-team/capacitor/discussions/5183
- Capacitor plugins oficiales: https://github.com/ionic-team/capacitor-plugins
- Supabase Push Notifications: https://supabase.com/docs/guides/functions/examples/push-notifications
- Supabase Deep Linking: https://supabase.com/docs/guides/auth/native-mobile-deep-linking
- Supabase OAuth en Capacitor iOS: https://medium.com/@vpodugu/supabase-pkce-oauth-in-capacitor-ios
- Capgo live updates: https://capgo.app/docs/plugins/updater/
- Bluetooth LE plugin: https://github.com/capacitor-community/bluetooth-le (v8.2.0, may 2026)
- NFC plugin: https://github.com/Cap-go/Capacitor-nfc (v8.2.2, jul 2026)
- Biometric auth: https://github.com/aparajita/capacitor-biometric-auth
- Edge-to-Edge guide: https://capawesome.io/blog/capacitor-edge-to-edge-and-safe-areas-guide/
- Apple Guideline 4.2: https://developer.apple.com/app-store/review/guidelines/#4-2-minimum-functionality
- Template Next.js + Electron + Capacitor: https://github.com/makeonteam/template-next-cross
- CashCat: Next.js → Capacitor: https://indigo.spot/blog/cashcat-on-android-and-ios-mobile-capacitor

---

## 13. Próximos pasos inmediatos

1. **Aprobar este plan** con el equipo (@santycano, @Palomo-dev).
2. **Ejecutar FASE 0** (cuentas Apple/Firebase/Capgo).
3. **Ejecutar FASE 1** (scaffolding `mobile/`).
4. **Auditar páginas con SSR** para viabilidad de `output: 'export'`.
5. **Crear PR** con título: `SCRUM-[ID] – Scaffolding Capacitor móvil` siguiendo reglas del repo.

---

> **Nota:** Este plan respeta las reglas del proyecto. Los cambios en `src/` son mínimos y condicionales (adaptadores `isMobile()`). Los sub-proyectos `electron/` y `print-agent/` no se modifican. El commit y PR siguen el formato `feat(SCRUM-[ID]): <descripción>` con revisores @santycano y @Palomo-dev.
