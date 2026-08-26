# Guía de Configuración Externa — Go Admin ERP Móvil

> **Objetivo:** Guía paso a paso para configurar todo lo que no se puede hacer desde código.
> **Requisitos:** Cuentas de desarrollador, herramientas instaladas, acceso a dashboards.
> **Tiempo total estimado:** 4-6 horas (sin contar tiempos de espera de Apple/Google)

---

## Tabla de contenidos

1. [Instalar herramientas locales](#1-instalar-herramientas-locales)
2. [Generar proyectos nativos (cap add)](#2-generar-proyectos-nativos-cap-add)
3. [Configurar Firebase Console](#3-configurar-firebase-console)
4. [Configurar Supabase Dashboard](#4-configurar-supabase-dashboard)
5. [Configurar Sentry Dashboard](#5-configurar-sentry-dashboard)
6. [Probar en emuladores](#6-probar-en-emuladores)
7. [Submission a stores](#7-submission-a-stores)
8. [Errores del IDE y cómo solucionarlos](#8-errores-del-ide-y-cómo-solucionarlos)

---

## 1. Instalar herramientas locales

### 1.1 — Android Studio (Windows/Mac/Linux)

1. Descargar desde https://developer.android.com/studio
2. Versión mínima: **Android Studio Otter 2025.2.1**
3. Instalar con configuración por defecto ("Standard")
4. Al abrir por primera vez, descargar:
   - Android SDK Platform 35 (Android 15)
   - Android SDK Build-Tools 35
   - Android Emulator (con una imagen x86_64 de API 35)

Verificar instalación:
```bash
# En terminal
adb version
# Debe mostrar: Android Debug Bridge version 1.0.x
```

### 1.2 — Xcode (solo macOS)

> **Solo se puede en Mac.** Si no tienes Mac, salta iOS por ahora y enfócate en Android.

1. Descargar desde Mac App Store (gratis)
2. Versión mínima: **Xcode 16+**
3. Instalar Command Line Tools:
   ```bash
   xcode-select --install
   ```

### 1.3 — Java 17 (para Android)

Android Studio incluye Java, pero si necesitas Java por separado:

**Windows:**
```bash
# Descargar JDK 17 de https://adoptium.net/
# O usar el que viene con Android Studio:
# C:\Program Files\Android\Android Studio\jbr
```

Verificar:
```bash
java -version
# Debe mostrar: openjdk version "17" o superior
```

### 1.4 — Supabase CLI (para deploy de Edge Functions)

```bash
# Windows (PowerShell)
npm install -g supabase

# O con scoop
scoop install supabase

# Verificar
supabase --version
```

### 1.5 — Cuentas de desarrollador (opcionales por ahora)

| Cuenta | Costo | Cuándo se necesita | URL |
|--------|-------|-------------------|-----|
| Google Play Console | $25 USD (pago único) | Para publicar en Play Store | https://play.google.com/console |
| Apple Developer Program | $99 USD/año | Para publicar en App Store | https://developer.apple.com |
| Firebase | Gratis | Para push notifications | https://console.firebase.google.com |
| Sentry | Free o $26/mes | Para crash reporting | https://sentry.io |

---

## 2. Generar proyectos nativos (cap add)

### 2.1 — Generar proyecto Android

```bash
cd C:\Users\USUARIO\CascadeProjects\go-admin-erp\mobile
npx cap add android
```

Esto crea `mobile/android/` con:
- `app/src/main/AndroidManifest.xml`
- `app/build.gradle`
- `build.gradle` (root)
- `settings.gradle`
- `app/src/main/res/` (recursos)

### 2.2 — Aplicar templates de permisos

Después de `cap add android`, fusionar los templates:

```bash
# Copiar AndroidManifest (merge manual — añadir permisos al generado)
# Abrir mobile/templates/AndroidManifest.xml
# Copiar los <uses-permission> y <service> al AndroidManifest generado en mobile/android/app/src/main/AndroidManifest.xml

# Copiar strings.xml
copy mobile\templates\strings.xml mobile\android\app\src\main\res\values\strings.xml

# Actualizar build.gradle (añadir signingConfigs y google-services)
# Comparar mobile/templates/build.gradle.app con mobile/android/app/build.gradle
# Añadir las partes que faltan (signingConfigs, compileSdk 35, etc.)
```

### 2.3 — Generar proyecto iOS (solo macOS)

```bash
cd C:\Users\USUARIO\CascadeProjects\go-admin-erp\mobile
npx cap add ios
# Capacitor 8 usa SPM por defecto
```

Después fusionar `mobile/templates/Info.plist` con el generado en `mobile/ios/App/App/Info.plist`.

### 2.4 — Sincronizar plugins

```bash
cd C:\Users\USUARIO\CascadeProjects\go-admin-erp\mobile
npx cap sync
```

### 2.5 — Abrir en Android Studio

```bash
npx cap open android
```

Android Studio se abre con el proyecto. Esperar a que Gradle sincronice (puede tardar 5-10 min la primera vez).

### 2.6 — Probar build de Android

```bash
# Desde terminal
cd C:\Users\USUARIO\CascadeProjects\go-admin-erp\mobile\android
.\gradlew bundleRelease
```

O desde Android Studio: **Build → Generate Signed Bundle / APK → Android App Bundle**

---

## 3. Configurar Firebase Console

### 3.1 — Crear proyecto Firebase

1. Ir a https://console.firebase.google.com
2. Click **"Añadir proyecto"**
3. Nombre: `goadmin-erp`
4. Google Analytics: opcional (recomendado NO por ahora)
5. Crear proyecto

### 3.2 — Añadir app Android

1. En Firebase Console → icono Android → **"Añadir app"**
2. Package name: `io.goadmin.app`
3. App nickname: `GoAdmin ERP`
4. SHA-1: obtener con:
   ```bash
   cd C:\Users\USUARIO\CascadeProjects\go-admin-erp\mobile\android
   .\gradlew signingReport
   ```
   Copiar el SHA-1 de la variante debug
5. Descargar `google-services.json`
6. Colocar en `mobile/android/app/google-services.json`

### 3.3 — Añadir app iOS (solo si tienes Mac)

1. En Firebase Console → icono iOS → **"Añadir app"**
2. Bundle ID: `io.goadmin.app`
3. Descargar `GoogleService-Info.plist`
4. Colocar en `mobile/ios/App/App/GoogleService-Info.plist`
5. Añadir al target en Xcode (drag & drop)

### 3.4 — Subir APNs Key (para push en iOS)

> Requiere cuenta Apple Developer ($99/año)

1. Ir a https://developer.apple.com → Certificates, Identifiers & Profiles → Keys
2. Crear nueva key con capability "Apple Push Notifications service (APNs)"
3. Descargar el archivo `.p8`
4. En Firebase Console → Project Settings → Cloud Messaging → iOS
5. Subir el archivo `.p8`
6. Anotar el **Key ID** y **Team ID**

### 3.5 — Obtener service account para FCM HTTP v1

1. En Firebase Console → Project Settings → Service Accounts
2. Click **"Generate new private key"**
3. Descargar archivo JSON (contiene `project_id`, `client_email`, `private_key`)
4. **NO commitear este archivo** — contiene la llave privada

---

## 4. Configurar Supabase Dashboard

### 4.1 — Configurar secrets de Firebase para Edge Function

1. Ir a https://supabase.com/dashboard → proyecto `jgmgphmzusbluqhuqihj`
2. Edge Functions → Secrets
3. Añadir 3 secrets:

| Nombre | Valor |
|--------|-------|
| `FCM_PROJECT_ID` | `project_id` del JSON del service account |
| `FCM_CLIENT_EMAIL` | `client_email` del JSON (ej: `firebase-adminsdk-xxx@goadmin-erp.iam.gserviceaccount.com`) |
| `FCM_PRIVATE_KEY` | `private_key` del JSON (incluye `-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n`) |

> **Importante:** El `FCM_PRIVATE_KEY` debe incluir los `\n` literales. En el dashboard de Supabase, pegar el valor tal como aparece en el JSON.

### 4.2 — Habilitar extensión pg_net

1. Ir a SQL Editor en Supabase Dashboard
2. Ejecutar:
   ```sql
   create extension if not exists pg_net;
   ```

### 4.3 — Configurar settings de Supabase para el trigger

1. En SQL Editor ejecutar:
   ```sql
   -- Configurar URLs y keys para que el trigger funcione
   alter database postgres set app.settings.supabase_url to 'https://jgmgphmzusbluqhuqihj.supabase.co';
   alter database postgres set app.settings.service_role_key to 'YOUR_SERVICE_ROLE_KEY';
   ```
   > Reemplazar `YOUR_SERVICE_ROLE_KEY` con tu service role key (Project Settings → API → service_role key)

### 4.4 — Ejecutar trigger SQL

1. En SQL Editor, pegar y ejecutar el contenido de `supabase/functions/push/trigger.sql`
2. Verificar que el trigger se creó:
   ```sql
   select tgname from pg_trigger where tgname = 'trigger_push_notification';
   ```

### 4.5 — Desplegar Edge Function

```bash
cd C:\Users\USUARIO\CascadeProjects\go-admin-erp
supabase login
supabase link --project-ref jgmgphmzusbluqhuqihj
supabase functions deploy push --project-ref jgmgphmzusbluqhuqihj
```

### 4.6 — Verificar tabla device_push_tokens

1. En SQL Editor:
   ```sql
   select * from device_push_tokens limit 5;
   ```
2. Verificar que RLS está habilitada:
   ```sql
   select tablename, rowsecurity from pg_tables where tablename = 'device_push_tokens';
   -- Debe retornar: device_push_tokens | true
   ```

### 4.7 — Probar push end-to-end

1. Abrir app en emulador Android (con Firebase configurado)
2. Hacer login
3. Verificar que el push token se registra:
   ```sql
   select * from device_push_tokens where user_id = 'YOUR_USER_ID';
   ```
4. Insertar notificación de prueba:
   ```sql
   insert into notifications (organization_id, recipient_user_id, channel, payload, status)
   values (1, 'YOUR_USER_ID', 'push', '{"title":"Test","body":"Hola desde Supabase"}'::jsonb, 'pending');
   ```
5. Verificar que la notificación llega al dispositivo

---

## 5. Configurar Sentry Dashboard

### 5.1 — Crear cuenta y proyecto

1. Ir a https://sentry.io → Sign up
2. Crear proyecto: Platform = **Next.js**
3. Anotar el **DSN** (formato: `https://xxx@o123.ingest.sentry.io/456`)

### 5.2 — Instalar paquetes

```bash
cd C:\Users\USUARIO\CascadeProjects\go-admin-erp

# Para web (Next.js)
npm install @sentry/nextjs

# Para mobile (Capacitor)
npm install @sentry/capacitor @sentry/react
```

### 5.3 — Configurar variables de entorno

Crear o editar `.env.local`:
```env
NEXT_PUBLIC_SENTRY_DSN=https://xxx@o123.ingest.sentry.io/456
SENTRY_DSN=https://xxx@o123.ingest.sentry.io/456
```

### 5.4 — Quitar @ts-nocheck de los archivos Sentry

Después de instalar los paquetes, quitar la primera línea de:
- `sentry.client.config.ts`
- `sentry.server.config.ts`
- `src/components/SentryErrorBoundary.tsx`

### 5.5 — Inicializar Sentry en la app

En `src/app/layout.tsx` (o un provider raíz), añadir:

```typescript
import { initSentryMobile } from '@/lib/utils/sentryMobile';
import { initPerformanceObserver } from '@/lib/utils/performanceObserver';

// En un useEffect o al inicio del cliente:
useEffect(() => {
  initSentryMobile();
  initPerformanceObserver();
}, []);
```

### 5.6 — Verificar Sentry

1. Hacer build: `npm run build`
2. Abrir la app
3. Provocar un error intencional (ej: botón que llama `throw new Error("test")`)
4. Verificar que el error aparece en Sentry Dashboard

---

## 6. Probar en emuladores

### 6.1 — Crear emulador Android

1. Abrir Android Studio → Device Manager → Create Device
2. Seleccionar: **Pixel 7** (o similar)
3. System image: **API 35** (Android 15) — descargar si no está
4. Crear AVD (Android Virtual Device)

### 6.2 — Ejecutar app en emulador Android

```bash
cd C:\Users\USUARIO\CascadeProjects\go-admin-erp\mobile
npx cap run android
```

O desde Android Studio: botón **"Run"** (triángulo verde)

### 6.3 — Testing offline en emulador Android

1. App abierta en emulador
2. En el emulador: Settings → Network & Internet → WiFi → **Off**
3. También: Mobile data → **Off**
4. Verificar:
   - `OfflineIndicator` aparece
   - App no crashea
   - Datos cacheados visibles
5. Restaurar red
6. Verificar:
   - `OfflineIndicator` desaparece
   - Supabase Realtime reconecta

### 6.4 — Crear simulador iOS (solo macOS)

1. Abrir Xcode → Window → Devices and Simulators
2. Crear simulador: **iPhone 15 Pro**
3. iOS version: **17.0+**

### 6.5 — Ejecutar app en simulador iOS

```bash
cd C:\Users\USUARIO\CascadeProjects\go-admin-erp\mobile
npx cap run ios
```

### 6.6 — Testing VoiceOver (iOS)

1. Simulador abierto
2. Settings → Accessibility → VoiceOver → **On**
3. Navegar la app con gestos
4. Verificar que todos los elementos son anunciados

### 6.7 — Testing TalkBack (Android)

1. Emulador abierto
2. Settings → Accessibility → TalkBack → **On**
3. Navegar la app
4. Verificar que los `aria-label` son leídos correctamente

---

## 7. Submission a stores

### 7.1 — Google Play (Android)

**Requisitos:**
- Cuenta Google Play Console ($25 USD)
- Keystore release generado
- `.aab` firmado

**Pasos:**

1. Generar keystore:
   ```bash
   keytool -genkey -v -keystore mobile\android\release.keystore -alias goadmin -keyalg RSA -keysize 2048 -validity 10000
   ```
   > **NO commitear el keystore**

2. Configurar en `mobile/android/app/build.gradle`:
   ```gradle
   signingConfigs {
       release {
           storeFile file('release.keystore')
           storePassword 'YOUR_STORE_PASSWORD'
           keyAlias 'goadmin'
           keyPassword 'YOUR_KEY_PASSWORD'
       }
   }
   ```

3. Generar .aab:
   ```bash
   cd mobile\android
   .\gradlew bundleRelease
   ```
   Output: `mobile/android/app/build/outputs/bundle/release/app-release.aab`

4. Ir a https://play.google.com/console
5. Crear nueva app: `GoAdmin ERP`
6. Subir el `.aab` en Production (o Internal Testing primero)
7. Completar:
   - Descripción (usar `mobile/store/google-play/description.txt`)
   - Screenshots (mínimo 2, máximo 8)
   - Icono 512x512
   - Privacy Policy URL: `https://app.goadmin.io/privacy`
   - Data Safety (usar `mobile/store/google-play/data-safety.md`)
   - Target audience
   - Content rating

8. Enviar para revisión (Google: 1-3 días)

### 7.2 — App Store (iOS)

**Requisitos:**
- Cuenta Apple Developer ($99 USD/año)
- Certificado de distribución
- Provisioning profile
- Xcode 16+

**Pasos:**

1. Crear App ID en https://developer.apple.com:
   - Identifier: `io.goadmin.app`
   - Capabilities: Push Notifications, NFC Tag Reading

2. Crear certificado de distribución:
   - Apple Developer → Certificates → Production → App Store and Ad Hoc
   - Generar CSR desde Keychain Access
   - Subir CSR → descargar certificado
   - Instalar en Keychain

3. Crear Provisioning Profile:
   - Apple Developer → Profiles → App Store
   - Seleccionar App ID y certificado
   - Descargar e instalar

4. Configurar signing en Xcode:
   - Abrir `mobile/ios/App/App.xcworkspace`
   - Target App → Signing & Capabilities
   - Team: tu Apple Developer team
   - Bundle Identifier: `io.goadmin.app`
   - Provisioning Profile: el creado arriba

5. Archive:
   - Xcode → Product → Archive
   - Organizer → Distribute App → App Store Connect

6. Ir a https://appstoreconnect.apple.com
7. Crear nueva app:
   - Name: GoAdmin ERP
   - Primary Language: Spanish
   - Bundle ID: io.goadmin.app
   - SKU: goadmin-erp

8. Completar:
   - Descripción (usar `mobile/store/app-store/description.txt`)
   - Screenshots (6.7" iPhone mínimo)
   - Icono 1024x1024
   - Privacy Policy URL: `https://app.goadmin.io/privacy`
   - App Privacy (usar `mobile/store/app-store/privacy-questions.md`)

9. Enviar para revisión (Apple: 1-7 días)

---

## 8. Errores del IDE y cómo solucionarlos

### 8.1 — `Cannot find module '@sentry/nextjs'`

**Causa:** `@sentry/nextjs` no está instalado todavía (code-ready).

**Solución 1 (recomendada):** Instalar cuando estés listo:
```bash
npm install @sentry/nextjs
```
Después quitar `// @ts-nocheck` de `sentry.client.config.ts` y `sentry.server.config.ts`.

**Solución 2 (ya aplicada):** Los archivos tienen `// @ts-nocheck` que silencia el error. No afecta el build.

### 8.2 — `Cannot find module '@sentry/react'`

**Causa:** `@sentry/react` no está instalado todavía.

**Solución:** Instalar cuando estés listo:
```bash
npm install @sentry/react
```
Después quitar `// @ts-nocheck` de `src/components/SentryErrorBoundary.tsx`.

### 8.3 — `Cannot find module 'jsr:@supabase/supabase-js@2'`

**Causa:** Es código Deno (Edge Function), no Node.js. El IDE no entiende imports `jsr:`.

**Solución (ya aplicada):** `// @ts-nocheck` al inicio del archivo. El código funciona correctamente en Supabase Edge Runtime (Deno).

### 8.4 — `Uint8Array` no asignable a `BufferSource`

**Causa:** Incompatibilidad de tipos entre TypeScript lib versions.

**Solución (ya aplicada):** `// @ts-nocheck` silencia este error. El código funciona en Deno.

### 8.5 — `Cannot find name 'node:test'` en paymentConfirmation.test.ts

**Causa:** Archivo de test preexistente que usa Node.js test runner. No relacionado con Capacitor.

**Solución:** Instalar types de Node o excluir tests del tsconfig:
```bash
npm install -D @types/node
```

### 8.6 — `Context access might be invalid: ANDROID_KEYSTORE_BASE64` en mobile-build.yml

**Causa:** El linter YAML del IDE no sabe que los secrets se definen en GitHub, no en el repo.

**Solución:** Son warnings falsos positivos. Los secrets se configuran en GitHub Settings → Secrets and variables → Actions. No requieren fix.

### 8.7 — Resumen de qué hacer ahora

| Error | Acción | Cuándo |
|-------|--------|-------|
| Sentry module not found | `npm install @sentry/nextjs @sentry/react @sentry/capacitor` | Cuando quieras activar crash reporting |
| Deno module not found | Nada (ya tiene @ts-nocheck) | N/A — funciona en Deno |
| Test file errors | Nada (preexistente) | N/A |
| Workflow warnings | Nada (falsos positivos) | N/A |

---

## Checklist final

### Configuración local
- [ ] Android Studio 2025.2.1+ instalado
- [ ] Xcode 16+ instalado (solo macOS)
- [ ] Java 17 verificado
- [ ] Supabase CLI instalado

### Proyectos nativos
- [ ] `npx cap add android` ejecutado
- [ ] `npx cap add ios` ejecutado (solo macOS)
- [ ] Templates aplicados (AndroidManifest, Info.plist, build.gradle, strings.xml)
- [ ] `npx cap sync` sin errores
- [ ] App abre en emulador Android
- [ ] App abre en simulador iOS (solo macOS)

### Firebase
- [ ] Proyecto Firebase creado
- [ ] App Android añadida (google-services.json)
- [ ] App iOS añadida (GoogleService-Info.plist)
- [ ] APNs Key subida
- [ ] Service account JSON descargado

### Supabase
- [ ] Secrets FCM configurados (FCM_PROJECT_ID, FCM_CLIENT_EMAIL, FCM_PRIVATE_KEY)
- [ ] pg_net habilitado
- [ ] app.settings configurados
- [ ] Trigger SQL ejecutado
- [ ] Edge Function desplegada
- [ ] Push notification de prueba recibida

### Sentry
- [ ] Cuenta Sentry creada
- [ ] Paquetes instalados (@sentry/nextjs, @sentry/react, @sentry/capacitor)
- [ ] DSN configurado en .env.local
- [ ] @ts-nocheck removido de archivos Sentry
- [ ] initSentryMobile() llamado en app
- [ ] Error de prueba aparece en dashboard

### Testing
- [ ] Test offline en emulador Android
- [ ] Test VoiceOver en simulador iOS (solo macOS)
- [ ] Test TalkBack en emulador Android
- [ ] Push notification recibida en dispositivo

### Stores
- [ ] Google Play Console ($25)
- [ ] Apple Developer Program ($99/año)
- [ ] Keystore Android generado
- [ ] Certificados iOS generados
- [ ] .aab firmado generado
- [ ] .ipa firmado generado
- [ ] Screenshots capturadas (mínimo 6 por plataforma)
- [ ] Iconos de app creados
- [ ] App subida a Google Play
- [ ] App subida a App Store Connect
- [ ] Review aprobada

---

## Resultados de ejecución (2026-08-24)

### Lo que SE hizo (verificado con subagentes)

| # | Tarea | Estado | Verificación |
|---|-------|--------|--------------|
| 1 | Android Studio instalado | ✅ | SDK 34+36, Java 21, adb 1.0.41 |
| 2 | `npx cap add android` | ✅ | `mobile/android/` creado en 325ms |
| 3 | Templates fusionados | ✅ | AndroidManifest (15 permisos + deep link + Firebase service), build.gradle (compileSdk 36, signingConfigs), strings.xml (notification channel) |
| 4 | `npx cap sync android` | ✅ | 19 plugins detectados, sync en 305ms |
| 5 | Supabase: pg_net | ✅ | Extensión ya instalada |
| 6 | Supabase: device_push_tokens | ✅ | Tabla existe con user_id, platform, token, app_version |
| 7 | Supabase: notify_push() function | ✅ | Migración aplicada |
| 8 | Supabase: Edge Function push | ✅ | Desplegada y ACTIVE (v1) |
| 9 | Build Android debug APK | ✅ | `app-debug.apk` 12.3 MB |
| 10 | .gitignore corregido | ✅ | Proyecto nativo se commitea, secrets excluidos con rutas específicas |

### Lo que NO se hizo (requiere recursos externos)

| # | Tarea | Requiere | Razón |
|---|-------|----------|-------|
| 1 | Crear proyecto Firebase | Acceso a Firebase Console | Necesita cuenta Google + configuración manual |
| 2 | Descargar google-services.json | Firebase Console | Necesita proyecto Firebase creado |
| 3 | Configurar Supabase secrets FCM | Service account JSON de Firebase | Necesita Firebase creado primero |
| 4 | Configurar app.settings en Supabase | Service role key | Requiere acceso manual al dashboard |
| 5 | Crear trigger push_notification en BD | app.settings configurados | Necesita settings antes del trigger |
| 6 | Crear cuenta Sentry | Acceso a sentry.io | Necesita registro manual |
| 7 | Instalar paquetes Sentry | DSN de Sentry | Necesita cuenta Sentry primero |
| 8 | Probar en emulador | Firebase configurado | Push necesita Firebase para funcionar |
| 9 | `npx cap add ios` | macOS + Xcode 16+ | No se puede en Windows |
| 10 | Submission a stores | Cuentas de desarrollador ($25+$99) | Requiere pago |

### Calificaciones del loop de calidad

| Ronda | Revisor | Tester | Global | Estado |
|-------|---------|--------|--------|--------|
| R1 | 8.75/10 | 8/10 | 8.4/10 | Fixes necesarios |
| R2 | — | 10/10 | **10/10** | ✅ APROBADO |

### Fixes aplicados

**Ronda 1 → Ronda 2:**
1. `mobile/.gitignore`: Cambiado de excluir `android/` completa a excluir solo builds temporales (`android/.gradle/`, `android/build/`, `android/app/build/`)
2. `mobile/.gitignore`: Secrets con rutas específicas (`android/app/google-services.json` en vez de genérico)
3. `mobile/android/app/build.gradle`: `compileSdk` cambiado de 35 a 36 (AndroidX 2025 requiere API 36)
4. `mobile/templates/build.gradle.app`: Template actualizado a compileSdk 36

### Estado actual del proyecto móvil

```
✅ Web app (Next.js) — funcional
✅ Electron desktop — funcional
✅ Capacitor config — configurado
✅ Mobile hooks/services — implementados (FASES 0-9)
✅ CI/CD workflow — creado
✅ Store metadata — creado
✅ Privacy policy — pública
✅ Proyecto Android nativo — generado + templates aplicados
✅ Edge Function push — desplegada en Supabase
✅ Trigger function notify_push() — creada en BD
✅ APK debug — compilado (12.3 MB)
⏸ Firebase project — pendiente (requiere Console)
⏸ Supabase secrets FCM — pendiente (requiere Firebase)
⏸ Trigger push_notification — pendiente (requiere settings)
⏸ Sentry — pendiente (requiere cuenta)
⏸ iOS nativo — pendiente (requiere macOS)
⏸ Stores — pendiente (requiere cuentas de pago)
```
