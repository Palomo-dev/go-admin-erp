# Guía operativa — CRM Revenue OS V4

> Público: el dueño de la plataforma y un operador que da de alta canales para
> una organización. No es un documento de diseño (eso está en `PLAN.md` y los
> `FASE-XX.md`) ni de arquitectura de seguridad (eso está en `FASE-00-FUNDACIONES.md`).
> Este documento responde una sola pregunta por sección: **¿qué hay que
> configurar para que este canal funcione, dónde, y cómo se comprueba?**
>
> Estado verificado el 2026-09-21 contra el código en `main` y contra la BD
> del proyecto Supabase por MCP en solo lectura. Sin nombres de organización
> cliente (regla 2 de `CLAUDE.md`).

## 0. Dos niveles de configuración

Cada canal tiene credenciales de **plataforma** (`.env` en Vercel, las paga
GoAdmin, sirven de fallback) y credenciales **por organización** (las carga el
propio cliente en `/app/configuracion?modulo=crm&tab=proveedores`, cifradas en
`provider_configs` con Vault; `getProviderCredentials` resuelve org → env).
Casi todos los canales funcionan con solo las credenciales de plataforma; una
organización que quiere su propio número/dominio/cuenta las reemplaza ahí.

La forma más rápida de comprobar que un proveedor responde, para cualquier
categoría, es la misma ruta para todos:

```
POST /api/crm/config/providers/test
Body: { "category": "voice" | "stt" | "tts" | "llm" | "email" | "whatsapp" | "sms" | "analysis", "provider"?: "twilio" | "resend" | "elevenlabs" | ... }
```

Requiere sesión de admin de la organización. Ejecuta la llamada más barata del
SDK real (p. ej. Twilio `accounts(sid).fetch()`, Resend `domains.list()`,
ElevenLabs `user.subscription.get()`, Meta `GET /{phone_number_id}`) y devuelve
`{ ok, latencyMs, detail }` sin secretos. Límite 5/min/org. Está en
`src/app/api/crm/config/providers/test/route.ts`.

---

## 1. Telefonía — Twilio (F3, F5, F16 SMS/WA alternativo)

**Qué configurar:** una cuenta Twilio con un número colombiano verificado,
una TwiML App (para el softphone del navegador) y, si la organización hará
llamadas desde el celular personal del vendedor (F5), un número adicional o el
mismo con "2 patas". Si usa la app nativa (Capacitor), además credenciales
push (`TWILIO_PUSH_CREDENTIAL_SID_IOS`/`_ANDROID`).

**Dónde en la UI:** `/app/configuracion?modulo=crm&tab=telefonia` (pestaña
Telefonía — números, caller id, grabación, consentimiento, retención, "mi
celular"). Las credenciales del proveedor (si la organización usa su propia
cuenta Twilio en vez de la de plataforma) van en
`/app/configuracion?modulo=crm&tab=proveedores`.

**Variables de entorno de plataforma (Vercel; nombres, nunca valores):**
`TWILIO_MASTER_ACCOUNT_SID`, `TWILIO_MASTER_AUTH_TOKEN`, `TWILIO_ACCOUNT_SID`,
`TWILIO_AUTH_TOKEN`, `TWILIO_API_KEY`, `TWILIO_API_SECRET`,
`TWILIO_TWIML_APP_SID`, `TWILIO_PHONE_NUMBER`, `TWILIO_WHATSAPP_NUMBER`,
`TWILIO_MESSAGING_SERVICE_SID`, `TWILIO_VERIFY_SERVICE_SID`,
`TWILIO_WEBHOOK_BASE_URL` (origen puro, sin path ni barra final — todas las
rutas de webhook se construyen a partir de esto y la firma
`X-Twilio-Signature` se valida contra la URL exacta),
`TWILIO_PUSH_CREDENTIAL_SID_IOS`, `TWILIO_PUSH_CREDENTIAL_SID_ANDROID`.

**Cómo comprobar que funciona:**
1. `POST /api/crm/config/providers/test` con `{"category":"voice","provider":"twilio"}` → `ok:true` confirma que las credenciales resuelven y la cuenta responde.
2. Llamada de prueba desde `/app/crm/llamadas` (softphone): si `TWILIO_WEBHOOK_BASE_URL` está mal, la llamada se conecta pero el TwiML de `/api/voice/twiml/outbound` no llega — se ve en los logs de Vercel como 401/403 por firma inválida.
3. Log esperado en Twilio Console → Monitor → Logs → Calls: un intento con status `completed` y un webhook a `{TWILIO_WEBHOOK_BASE_URL}/api/voice/status` con 200.

---

## 2. Voz IA — ElevenLabs (F4 STT · F6 TTS/clonación)

**Qué configurar:** una API key de ElevenLabs. Si la organización quiere
clonar la voz de un vendedor para el agente IA (F6), necesita su
consentimiento grabado (el flujo de clonación en
`/app/crm/agentes-ia` lo pide antes de llamar a ElevenLabs — ver
`src/lib/services/crm/voiceCloneScript.ts`).

**Dónde en la UI:** `/app/configuracion?modulo=crm&tab=proveedores` (categorías
`stt`, `tts`, `voice`). El catálogo de voces y la clonación viven en
`/app/crm/agentes-ia` (`src/components/crm/agentes/**`).

**Variables de entorno de plataforma:** `ELEVENLABS_API_KEY`,
`ELEVENLABS_SCRIBE_MODEL`, `ELEVENLABS_MODEL`, `ELEVENLABS_WEBHOOK_SECRET`,
`ELEVENLABS_STT_WEBHOOK_ID`.

**Cómo comprobar que funciona:**
1. `POST /api/crm/config/providers/test` con `{"category":"stt","provider":"elevenlabs"}` (o `tts`) → `ok:true` y `detail` con el plan/consumo de la cuenta.
2. Transcribir una llamada real (`POST /api/crm/calls/[id]/transcribe`) y verificar que aparece en `call_transcripts` — sin la API key, la transcripción se encola pero el job pasa a `dead` y no hay costo cobrado (créditos se cobran solo después de respuesta exitosa, ver `chargeAiCredits`).
3. Webhook: `/api/crm/webhooks/elevenlabs` debe responder 200 a eventos `speech_to_text_transcription` firmados; un secreto equivocado da 401 (fail-closed).

---

## 3. Email — Resend (F7)

**Qué configurar:** un dominio verificado en Resend por organización (DNS:
SPF, DKIM, DMARC). El dominio global de plataforma (`EMAIL_GLOBAL_DOMAIN`) es
el fallback para organizaciones sin dominio propio.

**Dónde en la UI:** `/app/configuracion?modulo=crm&tab=email` (dominios + DNS
+ botón verificar, remitentes, tracking, firma). Componente:
`src/components/configuracion/crm/EmailTab.tsx`.

**Variables de entorno de plataforma:** `RESEND_API_KEY`,
`RESEND_WEBHOOK_SECRET`, `EMAIL_GLOBAL_DOMAIN`, y la clave de cifrado en
reposo de las API keys por dominio (ver bloque F7 en `.env.example`, línea
~233: AES-256-GCM).

**Cómo comprobar que funciona:**
1. `POST /api/crm/config/providers/test` con `{"category":"email","provider":"resend"}` → `ok:true` lista los dominios visibles con esa key.
2. Verificar un dominio: `POST /api/email/domains/[id]/verify` → refresca el estado DNS; si SPF/DKIM no propagó, responde `verified:false` con el detalle de qué registro falta.
3. Enviar una prueba de plantilla: `POST /api/email/templates/[id]/test-send`. Log esperado: evento `email.sent` en el webhook de Resend, visible en `email_messages` con `status='sent'`.

---

## 4. WhatsApp — Meta Cloud API (F16, canal primario)

**Qué configurar:** una WhatsApp Business Account (WABA) verificada en Meta
Business Manager, Embedded Signup para que la organización conecte su propio
número, y plantillas HSM (mensajes fuera de la ventana de 24 h) aprobadas por
Meta antes de poder enviarlas. Twilio WhatsApp (`TWILIO_WHATSAPP_NUMBER`) es
el canal alternativo si la organización no quiere pasar por Meta.

**Dónde en la UI:** `/app/configuracion?modulo=crm&tab=whatsapp` (canal,
plantillas HSM y su estado de aprobación, opt-out, ventana de 24h).
Componente: `src/components/configuracion/crm/WhatsAppTab.tsx`.

**Variables de entorno de plataforma:** `META_APP_ID`, `META_APP_SECRET`,
`META_EMBEDDED_SIGNUP_CONFIG_ID`, `WHATSAPP_VERIFY_TOKEN` (alias legado
`META_WEBHOOK_VERIFY_TOKEN`), `WHATSAPP_ACCESS_TOKEN`,
`WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_DEFAULT_COUNTRY_CODE`.

**Cómo comprobar que funciona:**
1. `POST /api/crm/config/providers/test` con `{"category":"whatsapp","provider":"meta"}` → `ok:true` con el nombre/estado verificado del número en Meta.
2. Sincronizar plantillas: `POST /api/crm/whatsapp/templates/sync` — trae el estado real de aprobación de Meta a la tabla `templates`; una plantilla en `PENDING` no se puede enviar todavía.
3. Enviar un mensaje de prueba desde `/app/crm/clientes/[id]` (compose) y confirmar en `/app/crm/campanas` o en el timeline del cliente que quedó `delivered`. El webhook `/api/integrations/whatsapp/webhook` debe responder 200 a `GET` (verificación inicial de Meta con `hub.verify_token`) y a los `POST` firmados con `X-Hub-Signature-256`.

---

## 5. Pagos — Stripe (F10, Payment Links de propuestas)

**Qué configurar:** las claves de Stripe de la plataforma; es un endpoint de
webhook **distinto** del de facturación del propio SaaS (`STRIPE_WEBHOOK_SECRET`
no sirve aquí).

**Dónde en la UI:** `/app/configuracion?modulo=crm&tab=proveedores` si la
organización usa su propia cuenta Stripe; si no, usa la de plataforma sin
configurar nada.

**Variables de entorno de plataforma:** `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`,
`STRIPE_SECRET_KEY`, `STRIPE_CRM_WEBHOOK_SECRET` (sin un valor real
`whsec_…`, `/api/crm/webhooks/stripe` rechaza todo con 401 — fallo cerrado a
propósito).

**Cómo comprobar que funciona:**
1. Generar un Payment Link desde una propuesta (`POST /api/crm/payments/link`) y pagarlo en modo test.
2. Log esperado: `POST /api/crm/webhooks/stripe` responde 200, y el pago aparece registrado por `paymentService` con idempotencia `stripe:<event.id>` (no se duplica si Stripe reintenta el webhook).

---

## 6. Firma electrónica — Documenso (F10, opcional)

**Qué configurar:** solo si la organización quiere firma electrónica de
contratos; si no está configurado, el flujo de F10 sigue funcionando sin esa
pieza (queda como paso manual).

**Variables de entorno de plataforma:** `DOCUMENSO_API_KEY`,
`DOCUMENSO_WEBHOOK_SECRET` (sin valor real, `/api/crm/webhooks/documenso`
rechaza todo — fallo cerrado), `DOCUMENSO_API_URL` (vacío = instancia pública
`https://app.documenso.com/api/v1`; con valor propio apunta a una instancia
autoalojada).

**Cómo comprobar que funciona:** enviar un contrato a firma desde
`/app/crm/propuestas/[id]` y verificar que `/api/crm/webhooks/documenso`
recibe el evento de firma completada y actualiza `contract_signatures` (hoy
en 0 filas en producción — ver `ANEXO-A-INVENTARIO-ACTUAL.md` §10, nadie lo ha
usado todavía).

---

## 7. Crons

**Scheduler primario: Vercel Cron** (`vercel.json`), todos apuntando a
`/api/crm/jobs/run` con `Authorization: Bearer CRON_SECRET`:

| Cadencia | Propósito |
|---|---|
| `*/2 * * * *` | Drenaje general de `outbound_jobs` / `crm_events` |
| `*/5 * * * *` | Lotes de campañas (`campaign_batch`) |
| `30 8 * * *` | Mantenimiento diario: limpieza de grabaciones, `health_recalculate`, `renewals_sync` |

**Respaldo: pg_cron**, verificado por MCP en solo lectura
(`select jobname, schedule, active from cron.job`) el 2026-09-21 — tres jobs
espejo, **todos `active = false` a propósito**:

| jobname | schedule | active |
|---|---|---|
| `crm-jobs-every-minute` | `*/2 * * * *` | false |
| `crm-campaigns-5min` | `*/5 * * * *` | false |
| `crm-daily-maintenance` | `30 8 * * *` | false |

La decisión está documentada en
`supabase/migrations/20260915233000_crm_v4_f00_41_pg_cron_alineado_con_vercel.sql`:
Vercel Cron es el primario, pg_cron queda como respaldo apagado y alineado en
cadencia para que, si algún día el dueño lo enciende
(`cron.alter_job(jobid, active => true)`), no haya doble ejecución con
cadencias distintas. **No lo actives sin apagar antes el cron de Vercel
equivalente.**

Otros jobs de pg_cron activos que NO son del CRM (para no confundirlos si se
lee la lista completa): `check-periodic-notifications`, `cleanup-temporary-members`,
`daily-exchange-rates-update`, `daily-task-agent`, `go-assistant-expire-actions`
(ese es del otro producto de IA, ver CLAUDE.md), `investor-matviews-daily`,
`investor-snapshot-monthly`, `mantener-datos-reales-diarios`,
`refrescar-vocabulario-catalogo`, `reschedule-overdue-tasks`,
`reset-monthly-ai-credits`.

**Cómo comprobar que el drenaje funciona:** `/app/configuracion?modulo=crm`
→ panel de jobs (`src/components/crm/config/JobsMonitor.tsx` y
`JobsTable.tsx`) muestra jobs `pending/processing/done/dead` en vivo. Un job
que se queda en `dead` tras reintentos se puede reintentar a mano con
`POST /api/crm/jobs/[id]/retry`. Log esperado en Vercel: una invocación de
`/api/crm/jobs/run` cada 2 minutos con 200 y un cuerpo `{ processed: N }`.

---

## 8. Créditos IA (todos los canales de IA)

El saldo se comprueba **antes** de llamar al proveedor y se cobra
**después** de que la respuesta llegue (nunca se cobra una generación
fallida) — `chargeAiCredits`/`refundAiCredits` en
`src/lib/services/crm/aiCostService.ts`, atómico vía la RPC
`decrement_ai_credits`. Se ve en
`/app/configuracion?modulo=crm&tab=creditos`. Si una organización se queda
sin crédito, el envío de WhatsApp/email/llamada de agente IA falla con un
mensaje explícito enlazando a esa pestaña (ver por ejemplo
`src/components/crm/whatsapp/ComposeWhatsAppDialog.tsx`), no falla en
silencio.
