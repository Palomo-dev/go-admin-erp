# Configuración de Firebase — GoAdmin ERP (Push Notifications)

> **Guía paso a paso** para configurar Firebase Cloud Messaging (FCM)
> y habilitar push notifications en GoAdmin ERP.
>
> **Prerrequisitos:** FASE P1 completada (`cap add android/ios` ejecutado
> y templates aplicados).

---

## Resumen del pipeline de push

```
DB insert (notifications, channel='push')
  → pg_net.http_post (trigger asíncrono)
    → Edge Function /functions/v1/push
      → Busca tokens en device_push_tokens
      → FCM HTTP v1 API (Android) o APNs vía Firebase (iOS)
        → Dispositivo recibe notificación
```

---

## Paso 1 — Crear proyecto en Firebase Console

1. Ir a https://console.firebase.google.com/
2. Click **"Agregar proyecto"**
3. Nombre: `goadmin-erp` (o el que prefieras)
4. Google Analytics: opcional (recomendado para métricas de push)
5. Click **"Crear proyecto"**

> Anota el **Project ID** (ej: `goadmin-erp` o `goadmin-erp-xxxxx`).
> Lo necesitarás en el Paso 5 como `FCM_PROJECT_ID`.

---

## Paso 2 — Añadir app Android

1. En Firebase Console → **Configuración del proyecto** → icono Android
2. **Package name:** `io.goadmin.app`
   - Debe coincidir con `applicationId` en `build.gradle.app`
3. **App nickname:** `GoAdmin ERP`
4. **SHA-1 de depuración:** (opcional, recomendado para testing)
   ```bash
   cd mobile/android
   ./gradlew signingReport
   ```
5. Click **"Registrar app"**
6. **Descargar `google-services.json`**
7. Colocar en: `mobile/android/app/google-services.json`
8. Verificar que en `mobile/android/build.gradle` (root) existe:
   ```gradle
   dependencies {
       classpath 'com.google.gms:google-services:4.4.2'
   }
   ```
9. Verificar que en `mobile/android/app/build.gradle` existe al final:
   ```gradle
   apply plugin: 'com.google.gms.google-services'
   ```

---

## Paso 3 — Añadir app iOS

1. En Firebase Console → **Configuración del proyecto** → icono iOS
2. **Bundle ID:** `io.goadmin.app`
   - Debe coincidir con el Bundle ID en Xcode
3. **App nickname:** `GoAdmin ERP`
4. Click **"Registrar app"**
5. **Descargar `GoogleService-Info.plist`**
6. Colocar en: `mobile/ios/App/App/GoogleService-Info.plist`
7. Abrir `mobile/ios/App/App.xcworkspace` en Xcode
8. Arrastrar `GoogleService-Info.plist` al proyecto (al target App)
   - Marcar **"Copy items if needed"**
   - Seleccionar el target correcto

---

## Paso 4 — Subir APNs Key (.p8) a Firebase

Para que Firebase envíe push notifications a iOS via APNs:

1. Ir a https://developer.apple.com/account/ → **Keys**
2. Click **"+"** para crear nueva key
3. **Name:** `Firebase GoAdmin`
4. Marcar **"Apple Push Notifications service (APNs)"**
5. Click **"Continue"** → **"Register"**
6. **Descargar el archivo .p8** (solo se descarga una vez)
7. Anotar:
   - **Key ID** (ej: `ABC123DEF4`)
   - **Team ID** (en Membership → Team ID)
8. En Firebase Console → **Configuración del proyecto** → **Cloud Messaging**
9. Tab **iOS** → **"Subir clave de autenticación APNs"**
10. Subir el archivo `.p8`
11. Ingresar **Key ID** y **Team ID**
12. Click **"Subir"**

> **Alternativa:** usar certificados APNs (.p12) en lugar de key .p8,
> pero la key .p8 es más moderna y no expira.

---

## Paso 5 — Configurar secrets en Supabase

La Edge Function `supabase/functions/push/index.ts` necesita credenciales
de Firebase para obtener access tokens de FCM HTTP v1 API.

### 5.1 Obtener service account JSON

1. Firebase Console → **Configuración del proyecto** → **Service Accounts**
2. Click **"Generar nueva clave privada"**
3. Descargar archivo JSON (ej: `goadmin-erp-firebase-adminsdk-xxxxx.json`)
4. Del JSON, extraer:
   - `project_id` → `FCM_PROJECT_ID`
   - `client_email` → `FCM_CLIENT_EMAIL`
   - `private_key` → `FCM_PRIVATE_KEY`

### 5.2 Configurar secrets en Supabase

```bash
# Via Supabase CLI
supabase secrets set FCM_PROJECT_ID=your-firebase-project-id
supabase secrets set FCM_CLIENT_EMAIL=firebase-adminsdk-xxxx@your-project.iam.gserviceaccount.com
supabase secrets set FCM_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n"
```

O via Supabase Dashboard:
1. Ir a https://supabase.com/dashboard/project/jgmgphmzusbluqhuqihj
2. **Edge Functions** → **Secrets**
3. Añadir las 3 variables:
   - `FCM_PROJECT_ID`
   - `FCM_CLIENT_EMAIL`
   - `FCM_PRIVATE_KEY`

> **IMPORTANTE:** El `FCM_PRIVATE_KEY` debe incluir los `\n` literales
> del PEM. La Edge Function los reemplaza con `.replace(/\\n/g, "\n")`.

---

## Paso 6 — Habilitar extensión pg_net en Supabase

La extensión `pg_net` permite hacer HTTP requests desde PostgreSQL
(triggers asíncronos a la Edge Function).

```sql
-- Habilitar pg_net
create extension if not exists pg_net;

-- Verificar
select * from pg_extension where extname = 'pg_net';
```

Ejecutar en:
1. Supabase Dashboard → **SQL Editor**
2. O via `supabase db execute`

---

## Paso 7 — Ejecutar trigger SQL

Crear el trigger que dispara la Edge Function cuando se inserta
una notificación con `channel = 'push'`:

```sql
-- Habilitar pg_net si no está habilitado
create extension if not exists pg_net;

-- Función que dispara la edge function
create or replace function public.notify_push()
returns trigger language plpgsql security definer as $$
begin
  if new.channel = 'push' and new.recipient_user_id is not null then
    perform net.http_post(
      url := current_setting('app.settings.supabase_url')
             || '/functions/v1/push',
      body := json_build_object(
        'type', 'INSERT',
        'table', 'notifications',
        'record', row_to_json(new),
        'old_record', null
      )::jsonb,
      headers := json_build_object(
        'Content-Type', 'application/json'
      )::jsonb
    );
  end if;
  return new;
end;
$$;

-- Trigger AFTER INSERT en notifications
create trigger push_notification_trigger
after insert on public.notifications
for each row execute function public.notify_push();

-- Configurar la URL de Supabase (setting global)
-- Reemplazar con tu URL de proyecto
alter database postgres set app.settings.supabase_url = 'https://jgmgphmzusbluqhuqihj.supabase.co';
```

Ejecutar en Supabase Dashboard → **SQL Editor**.

> **Alternativa:** En lugar del trigger SQL, usar Database Webhooks
> desde el Dashboard:
> 1. **Database** → **Webhooks** → **"Create a new webhook"**
> 2. **Nombre:** `push-notification-trigger`
> 3. **Tabla:** `notifications`
> 4. **Eventos:** `INSERT`
> 5. **Filtro:** `body->>'channel' = 'push'`
> 6. **URL:** `https://jgmgphmzusbluqhuqihj.supabase.co/functions/v1/push`
> 7. **Método:** `POST`
> 8. **Headers:** `{ "Content-Type": "application/json" }`

---

## Verificación

### Checklist

- [ ] Proyecto Firebase creado
- [ ] App Android registrada (`io.goadmin.app`)
- [ ] `google-services.json` en `mobile/android/app/`
- [ ] App iOS registrada (`io.goadmin.app`)
- [ ] `GoogleService-Info.plist` en `mobile/ios/App/App/`
- [ ] APNs Key (.p8) subida a Firebase
- [ ] Secrets en Supabase: `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY`
- [ ] `pg_net` habilitado en Supabase
- [ ] Trigger SQL ejecutado (o webhook configurado)
- [ ] Edge Function `push` desplegada
- [ ] Push de prueba enviada desde Firebase Console → **Cloud Messaging** → **"Enviar mensaje de prueba"**

### Probar push desde Firebase Console

1. Firebase Console → **Cloud Messaging**
2. Click **"Enviar mensaje de prueba"**
3. Ingresar el FCM token del dispositivo (visible en logs del app)
4. Click **"Enviar"**
5. Verificar que la notificación llega al dispositivo

---

## Referencias

- Edge Function: `supabase/functions/push/index.ts`
- Plan de pendientes: `docs/PLAN_CAPACITOR_MOVIL_PENDIENTES.md` (sección P2)
- Firebase Console: https://console.firebase.google.com/
- Supabase Dashboard: https://supabase.com/dashboard/project/jgmgphmzusbluqhuqihj
