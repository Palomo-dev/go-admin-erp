# F0-SEC — Seguridad y contexto multi-tenant — Tester — Ronda 1 (2026-09-15)

Alcance: `PROGRESS.md` «Fase: F0-SEC — Ronda 1 — 2026-09-08» y `FASE-00-FUNDACIONES.md` §4/§7.
Archivos bajo prueba: `src/lib/utils/orgContext.ts`, `src/lib/utils/orgAdmin.ts`,
`src/lib/security/{webhookSignatures,rateLimit,wsSessionToken,organizationBody}.ts`,
`src/lib/crm/enums.ts` + `db-checks.json`, rutas de escritura bajo `src/app/api/crm/**` y
`src/app/api/ai-assistant/**`, `src/__tests__/guardrails.test.ts` (casos 5, 6, 7, 16), `ws-server.ts`.

Método: suites existentes, una sonda de 36 tests unitarios escrita para esta ronda (ejecutada y
**borrada**; el código está en el anexo A para que el constructor la adopte), auditoría estática de
las 154 rutas con POST/PUT/PATCH/DELETE (script en anexo B), 6 consultas de solo lectura por el MCP
de Supabase y `tsc` filtrado. Sin credenciales de proveedor, sin llamadas reales, sin cambios en BD.
Nada de lo que sigue es un veredicto de aprobado/rechazado: eso lo decide el qa-reviewer.

## Resumen de pruebas
- Casos ejecutados: **299** = 93 tests de suites existentes + 36 tests de la sonda + 154 rutas × 1
  criterio compuesto (org de sesión **y** trato del `organization_id` ajeno) + 16 comprobaciones de BD/tsc.
- Pasaron: **171** (91 suites + 18 sonda + 46 rutas con el contrato completo + 16 BD/tsc).
- Fallaron: **128** (2 suites [ninguno de F0-SEC] + 18 sonda + 108 rutas que no cumplen el contrato
  «403 y se registra» de la regla dura 5: 102 lo ignoran en silencio y 6 devuelven 400 sin registro).

Suites (`npx jest src/__tests__/guardrails.test.ts src/lib/security src/lib/crm/__tests__/enums.test.ts`):
`Test Suites: 1 failed, 4 passed · Tests: 2 failed, 91 passed, 93 total`.
- `guardrails.test.ts`: 66/67. Casos **5, 6, 7 y 16 verdes** (5: 2/2 incl. allow-list sin obsoletos;
  6: 2/2; 7: 1/1; 16: 1/1). El rojo es «Carga de páginas tolerante… el inicio espera sucursal y
  permisos» (`src/app/inicio/page.tsx`), ajeno a F0-SEC. En una primera ejecución también cayó el
  caso 17 con `ENOENT …/crm/__tests__/zz_dbg_tester.test.ts`: otro agente creó y borró ese archivo
  mientras el guardarraíl recorría `src/`; el caso es sensible a archivos transitorios (ver F-14).
- `src/lib/security/__tests__/`: rateLimit 7/7, webhookSignatures 10/10, wsSessionToken 4/4.
- `src/lib/crm/__tests__/enums.test.ts`: verde; guardarraíl 9 confirma 25 CHECKs del fixture contra `enums.ts`.

## Fallos encontrados

### 1. [crítico] Los secretos de plataforma de `webhookSignatures.ts` y `wsSessionToken.ts` aceptan valores de relleno (fallan ABIERTOS con una clave pública)
Es el gemelo, todavía abierto, del hallazgo «Secretos de relleno aceptados como buenos — 2026-09-10»
de PROGRESS. `isPlaceholderCredential` (`src/lib/crm/providerCatalog.ts:203`) existe y ya lo usan
Documenso (`contractStateMachine.ts:142`), Stripe (`providerReadiness.ts`), `unsubscribe.ts` y
`domainStore.ts`; **ninguna función de `src/lib/security/` lo llama**.

Reproducir (sonda, anexo A, bloques P2–P5; 14 de 14 casos rojos):
- `verifyCronSecret`: con `CRON_SECRET=your-secure-random-token-here` (el literal de `.env.example:19`)
  y `Authorization: Bearer your-secure-random-token-here` → **no lanza**. Esperado: 401. Afecta a
  `withCron`, `/api/crm/jobs/run`, `health/recalculate`, `renewals/sync`, `voice-agents/campaigns/run`,
  `whatsapp/qr/dispatch-pending`.
- `verifyMetaSignature(body, sha256=HMAC(body, 'your-ws-session-secret'), 'your-ws-session-secret')` → **true**.
  Esperado: false. Afecta a `/api/integrations/whatsapp/webhook` cuando `META_APP_SECRET` es de relleno.
- `verifyResendWebhook('{}', headers, 'whsec_your-webhook-secret')` → no lanza antes de svix (con el
  paquete real, ese string base64-decodifica y es una clave HMAC válida que cualquiera conoce).
- `issueWsSessionToken({orgId:7})` con `WS_SESSION_SECRET='your-ws-session-secret-at-least-16-chars'`
  emite y `verifyWsSessionToken` devuelve `{orgId:7, exp}`. Es el punto 1 de la lista «gemelos
  localizados y NO corregidos» de PROGRESS; `src/app/api/voice/twiml/ai-agent/route.ts:118` sigue
  comprobando solo `!process.env.WS_SESSION_SECRET`.
- `resolveTwilioAuthToken(masterSid)` devuelve `TWILIO_MASTER_AUTH_TOKEN` tal cual (`your-master-auth-token`
  en `.env.example:118`) y `Twilio.validateRequest` valida con él.
- `src/app/api/crm/webhooks/elevenlabs/route.ts:23-26`: solo `!secret`.
- `src/lib/services/crm/bridgeTokens.ts:34`: `length >= 16` (punto 2 de la misma lista).

Estado del entorno local (`.env.local`, comprobado por longitud sin imprimir valores): CRON_SECRET,
META_APP_SECRET, WS_SESSION_SECRET, TWILIO_*_AUTH_TOKEN, RESEND_WEBHOOK_SECRET y VOICE_CALLBACK_SECRET
tienen hoy valores no-relleno; ELEVENLABS_WEBHOOK_SECRET y STRIPE_CRM_WEBHOOK_SECRET están ausentes
(fail-closed). El defecto es del código: cualquier despliegue nuevo que copie `.env.example` queda
con cron, webhook de WhatsApp y agente de voz abiertos con secretos publicados en el repositorio.
Esperado: `getSecret()`/`verifyCronSecret`/`verifyMetaSignature`/`verifyResendWebhook`/
`resolveTwilioAuthToken` rechazan (401/403/null) cualquier secreto que `isPlaceholderCredential`
marque, y `isPlaceholderCredential('changeme')` debe ser `true` (hoy es `false`, sonda P1).

### 2. [alto] `fn_reset_monthly_ai_credits()` y otras 48 RPC SECURITY DEFINER del CRM siguen con EXECUTE para `anon`
Consulta MCP (solo lectura): **388** funciones SECURITY DEFINER en `public`, **217** ejecutables por
`anon`, **49** con nombre del dominio CRM/IA/mensajería. Entre ellas, sin `auth.uid()`/membresía en
el cuerpo: `fn_reset_monthly_ai_credits()` (sin argumentos; recorre **todas** las `ai_settings` y
recalcula créditos con rollover), `fn_apply_customer_credit(uuid,uuid,numeric,uuid)`,
`fn_agent_upsert_task(p_org_id,…)`, `fn_save_conversation_summary(uuid,…)`,
`mark_conversation_messages_as_read(uuid,bigint)`, `fn_campaign_mark_*`, `get_ai_tokens_usage(org_id)`,
`refresh_mv_customer_health()`, `auto_close_inactive_conversations()`.
Reproducir: `POST {SUPABASE_URL}/rest/v1/rpc/fn_reset_monthly_ai_credits` con la anon key pública y
body `{}` → 200 y reinicio de créditos de las 83 organizaciones (no ejecutado: solo lectura).
Esperado: `REVOKE EXECUTE … FROM anon` (y de `authenticated` donde la guarda no exista), como
documenta la memoria «Exposicion de RPC a anon». Los advisors marcan además `function_search_path_mutable`
en 76 funciones del CRM (incl. `fn_reset_monthly_ai_credits`, `fn_apply_customer_credit`).

### 3. [alto] Webhook de WhatsApp: la firma se verifica con el secreto del PRIMER `phone_number_id` del payload y luego se procesan TODAS las entradas
`src/app/api/integrations/whatsapp/webhook/route.ts:76-77,84,100`: `resolveAppSecret(phoneNumberIds[0])`
toma `channel_credentials.credentials.app_secret` del canal que **el propio payload sin verificar**
declara; si valida, `processWebhookPayload(payload)` recorre `entry[*]`.
Reproducir (requiere que dos organizaciones tengan `app_secret` propio en `channel_credentials`, que
es exactamente lo que soporta la rama 1 de `resolveAppSecret`): la organización A (que conoce su
`app_secret`) construye `entry[0].changes[0].value.metadata.phone_number_id = <A>` y
`entry[1]…phone_number_id = <B>` con mensajes inventados, firma con su secreto → 200 y los mensajes
de `entry[1]` se insertan en las conversaciones de B. Esperado: verificar por cada `phone_number_id`
presente o rechazar payloads con más de un canal cuya credencial no sea la que firmó (403).

### 4. [alto] `ai_usage_logs` admite INSERT anónimo sin condición (`with_check = true`, rol `public`)
Consulta MCP: política «Service role can insert AI usage logs» `INSERT … WITH CHECK (true)` para
`{public}`, y `has_table_privilege('anon','ai_usage_logs','INSERT') = true`. Es la única política con
`qual/with_check = true` en las tablas del CRM consultadas (`activities`, `messages`, `conversations`,
`outbound_jobs`, `crm_events`, `contact_consents`, `provider_configs`, `channel_credentials`,
`comm_settings`, `calls`, `call_recordings`, `voice_agent_calls`, `ai_settings`, `comm_usage_logs`).
Reproducir: `POST /rest/v1/ai_usage_logs` con anon key y `{organization_id: <cualquiera>, credits_consumed: 999999}`
→ 201. Efecto: `GET /api/crm/config/credits` (suma `ai_usage_logs.credits_consumed` del mes, §8) y el
bloqueo al 100 % del presupuesto se envenenan para cualquier organización. Esperado: política
restringida a `service_role` (o INSERT revocado a `anon`/`authenticated`).

### 5. [alto] El contrato «body con organización ajena → 403 y se registra» solo lo cumplen 28 de 154 rutas de escritura; conviven tres semánticas
Tabla completa en el anexo C. Resumen por tratamiento del `organization_id`/`organizationId`/`orgId` ajeno:

| Tratamiento | Rutas | Ejemplos |
|---|---|---|
| **OK**: `foreignOrganizationInBody` → 403 + `console.warn` | 28 | `commissions/*`, `partners/*`, `referrals/*`, `sales-targets/*`, `onboarding/instances/*`, `health/refresh`, `health/[id]/snapshot`, `revenue/inputs`, `voices/*` |
| **OK-duplicado**: mismo 403 reimplementado inline (regla dura 7) | 3 | `objections/route.ts:49`, `objections/[id]/route.ts:18`, `objections/opportunity/[opportunityId]/route.ts:53` |
| **FALTA (400, sin registro)**: zod `noOrgInBody` → 400 `organization_id no se acepta en el body` | 15 | todas las `crm/whatsapp/**` y `crm/campaigns/**` (`withWhatsAppRoute`) |
| **FALTA (ignora)**: usa `ctx.organizationId` y descarta el del body sin 403 ni log | 102 | las 17 de `ai-assistant/**` (comentario «se ignora organizationId del body»), `activities`, `calls/**`, `contracts/**`, `demos/**`, `documents/**`, `icp/**`, `leads/**`, `meetings/**`, `proposals/**`, `sequences/**`, `stages/**`, `teams/**`, `voice-agents/**`… |
| Cron (`verifyCronSecret`, org del body acota la pasada) | 3 | `jobs/run`, `health/recalculate`, `voice-agents/campaigns/run` (+ `renewals/sync` POST) |
| Webhook firmado (org por fila/credencial) | 3 | `webhooks/{documenso,stripe,elevenlabs}` |

Las 154 rutas resuelven la organización por sesión (133 con `withOrg`/`getServerOrgContext` directo,
14 vía `withWhatsAppRoute`, que envuelve `getServerOrgContext`; el resto cron/webhook). **No hay
ninguna ruta de escritura que tome la organización del body para consultar**: la parte (a) del
contrato se cumple; la (b) no. Reproducir: `PATCH /api/crm/demos/<id>` con
`{"organization_id": 9999, "status": "done"}` y sesión de la org 7 → 200 (esperado 403 y registro).
Riesgo real: bajo por sí mismo (la escritura va a la org de la sesión), pero la regla dura 5 lo
exige y hoy un cliente mal cableado que mande la org equivocada pasa inadvertido en 117 rutas.

### 6. [alto] Guardarraíl 5 no verifica el contrato que dice verificar
`src/__tests__/guardrails.test.ts:221-326` comprueba a **nivel de archivo** que, si aparece un patrón
`body.organization_id`, también aparezca `getServerOrgContext|withOrg(`. No comprueba (b) el 403 ni
(c) que el handler que usa el body sea el mismo que tiene el contexto.
Reproducir: `src/app/api/crm/renewals/sync/route.ts` — el `POST` es cron y lee
`body.organization_id` (línea 40); el `GET` usa `getServerOrgContext`. El guardarraíl lo da por bueno
(y no está en la allow-list) porque los dos handlers viven en el mismo archivo. Basta añadir un
`export async function GET` con `getServerOrgContext` a cualquier ruta para que un `POST` que lea la
org del body pase el guardarraíl. Esperado: análisis por handler exportado, y un caso nuevo que
exija `foreignOrganizationInBody` (o el zod equivalente) en toda ruta de escritura de `crm/**` y
`ai-assistant/**`. Allow-list: 0 entradas obsoletas (test verde); las 57 entradas son deuda fuera del
CRM salvo `crm/health/recalculate` y `crm/voice-agents/campaigns/run` (cron, deberían migrar a
`withCron` y salir de la lista).

### 7. [medio] `requireOrgAdmin` decide por el NOMBRE del rol (regla dura 6)
`src/lib/utils/orgAdmin.ts:31`: `ORG_ADMIN_ROLE_NAMES.includes(member.roleName)` con
`'Super Admin' | 'Admin de organización'`. El guardarraíl 12 solo vigila el cliente del asistente.
Lo consumen `withOrg(…, {admin:true})`, `withWhatsAppRoute(…, {admin:true})`, `isOrgAdminContext` en
`campaigns`, `sequences`, `automation-rules`, `voices`, `jobs/[id]/retry`, `revenue/inputs`.
Reproducir: crear en la org 7 un rol personalizado llamado exactamente `Admin de organización` con
`role_id` ≠ 1/2 y asignarlo a un usuario sin permisos → `requireOrgAdmin` lo acepta. Esperado: solo
`is_super_admin` y `role_id`/permiso resuelto en servidor.

### 8. [medio] El límite de tasa de `twilio/verify/{send,check}` es solo en memoria por instancia; la spec prometía contador persistente
`src/app/api/integrations/twilio/verify/send/route.ts:20,50-54`: `checkRateLimits` con tres claves
(ip, user, to), `limit: 5` y **sin `persistentCount`**. `rateLimit.ts` documenta el nivel 2 en
`comm_usage_logs` y §7 de FASE-00 dice «Map en memoria por instancia + comm_usage_logs como contador
persistente: máx 3 envíos / 10 min»; §7.1 dice 5/10 min. En Vercel cada instancia fría empieza en 0:
el límite efectivo es 5 × instancias. Además `persistentCount` que lanza → **fail-open** sobre
memoria (sonda P7, documentado en el código pero no en la spec). Esperado: contador persistente
inyectado en las dos rutas y una sola cifra en la spec.

### 9. [medio] `resolveOrgFromExternal` para `phone` y `domain` no es determinista porque los índices únicos son por organización
Consulta MCP: `phone_numbers` UNIQUE `(organization_id, e164)`, `email_domains` UNIQUE
`(organization_id, domain)`, `email_messages.provider_message_id` y `comm_settings.twilio_subaccount_sid`
sin UNIQUE. `orgContext.ts:290-296` hace `.eq(column, identifier).limit(1).maybeSingle()` sin `order`:
si dos organizaciones registran el mismo E.164 o dominio, la org resuelta es arbitraria (el «primera
org activa» que F0 quería eliminar, en versión no determinista). Hoy solo se llama con `call_sid`
(`voice/twiml/outbound/route.ts:218`, cruzado con `accountSidMatchesOrg`), así que el riesgo es
latente para F3/F7/F16. Esperado: exigir unicidad global (índice) o lanzar `ORG_AMBIGUOUS` si hay >1.

### 10. [medio] `wsSessionToken`: sin tope de TTL, sin nonce (reutilizable), acepta `orgId` 0 o negativo
Sonda P6: `issueWsSessionToken({orgId:7}, 365*24*3600)` se verifica (esperado: tope, p. ej. 1 h);
el mismo token verifica N veces dentro del TTL (el handshake completo `?st=`+`X-Twilio-Signature`
capturado se puede repetir 10 min; falta `jti` o consumo único en el ws-server);
`issueWsSessionToken({orgId:0})` y `({orgId:-1})` se verifican (esperado: `orgId` entero > 0).
`exp < now` es estricto: un token con `exp == now` sigue siendo válido (aceptable, anotado).

### 11. [medio] `verifyMetaSignature` y `verifyCronSecret`: el secreto es un `string` sin longitud mínima
Un `META_APP_SECRET=a` o `CRON_SECRET=1` valida. `contractStateMachine.ts:142` exige 16; aquí nada.
Esperado: longitud mínima común (≥16) en un helper único `requireRealSecret(name)`.

### 12. [bajo] `rateLimit.ts`: `windowMs: 0` nunca bloquea; `checkRateLimits` consume hits de claves anteriores cuando una posterior bloquea
Sonda P7: con `windowMs: 0` cada hit abre ventana nueva y `limit` nunca se alcanza (esperado:
rechazar `windowMs <= 0` o tratarlo como bloqueo). `checkRateLimits([ip, user, to])` incrementa `ip`
y `user` aunque `to` bloquee: una ráfaga a un número bloqueado agota también el cupo del usuario para
otros números (esperado: comprobar todas y solo entonces registrar, o revertir). `limit` 0/negativo/NaN
sí bloquean (correcto). `getClientIp` sin cabeceras devuelve `'unknown'`: todos los clientes sin proxy
comparten cubo (documentar).

### 13. [bajo] `src/lib/security/organizationBody.ts` está sin versionar (`??` en `git status`)
28 rutas lo importan; un `git stash`/checkout limpio rompe la compilación de esas rutas. Debe entrar
en el mismo commit que sus consumidores.

### 14. [bajo] Guardarraíl 17 (y cualquiera que use `walkDir`) cae con `ENOENT` si otro proceso borra un archivo durante el recorrido
Observado en la primera ejecución (`zz_dbg_tester.test.ts` de otro agente). Esperado: `readFile`
tolerante a `ENOENT` (saltar) o listar y leer en el mismo paso.

### 15. [bajo] Documentación §7 vs §7.1 vs código
§7: «máx 3 envíos / 10 min»; §7.1 y código: 5. §7.1 marca `email/webhook` y `sendgrid/webhook`
como pendientes de REG; `email/webhook` sigue en la allow-list del guardarraíl 7 con nota «F7 lo migra
a verifyResendWebhook» (F7 está aprobada). `verifyElevenLabsWebhook` no existe en `webhookSignatures.ts`
(la ruta usa el SDK directamente, fuera del helper único y del guardarraíl 7, que no cubre `crm/webhooks/`).

## Cobertura no probada / riesgos pendientes
- No se ejecutó ninguna ruta con sesión real (sin credenciales): la tabla del anexo C es estática.
  Un test de integración con `getServerOrgContext` doblado sobre 3-4 rutas representativas cerraría
  el hueco; no existe hoy.
- No se probó el handshake real del ws-server (`authenticateUpgrade`) ni con Twilio ni con un cliente
  `ws`; solo revisión de código. `getTwilioAuthTokenForOrg` cae al token master si la org no tiene
  subcuenta: cualquier org sin subcuenta comparte verificación (esperable, pero sin test).
- `verifyResendWebhook` sigue probado con svix doblado; el test con el paquete real vive en
  `email/__tests__/svixReal.test.ts` (F7) y no se ejecutó aquí.
- `middleware.ts`: no se verificó en vivo que `email/webhook` y `sendgrid/webhook` ya no reciban 307.
- Advisors globales fuera del CRM (para el dueño): Postgres `15.8.1.079` con parches pendientes,
  OTP de correo > 1 h, protección de contraseñas filtradas desactivada, 4 extensiones en `public`,
  `mv_customer_health` y `mv_crm_forecast` expuestas por la API (`materialized_view_in_api`).
- Fallo 2: no se listaron las 217 funciones completas ni se comprobó guarda por guarda; solo 17.
- `tsc` filtrado: ver anexo D.

## Calificación de robustez (1-10, opinión técnica del tester)
**5/10** — La base está bien hecha: toda ruta de escritura del CRM resuelve la organización por
sesión, las firmas Twilio/Meta/Resend/Documenso/Stripe fallan cerradas sin cabecera o sin secreto, los
guardarraíles 5/6/7/16 están verdes, `enums.ts` coincide con 25 CHECKs reales y `resolveOrgFromExternal`
ya no crashea. Pero el hallazgo de secretos de relleno documentado el 2026-09-10 sigue abierto en
**toda** la capa `src/lib/security/` (14/14 casos rojos), lo que convierte el «fail-closed» en
«fail-open con clave publicada» para cron, WhatsApp, Resend, Twilio y el agente de voz; el webhook de
WhatsApp permite inyección entre organizaciones con un secreto propio; 49 RPC SECURITY DEFINER del CRM
(una de ellas reinicia los créditos de IA de todas las organizaciones) y el INSERT de `ai_usage_logs`
siguen abiertos a `anon`; y el contrato 403 de la regla dura 5 solo lo cumplen 31 de 154 rutas mientras
el guardarraíl que debería vigilarlo no mira eso.

---

## Anexo A — Sonda de tests (ejecutada y borrada; 36 casos, 18 rojos)
Archivo sugerido: `src/lib/security/__tests__/placeholderSecrets.test.ts` (los bloques P2–P5 son la
prueba «rojo antes, verde después» del fallo 1; P6/P7 documentan los bordes de los fallos 10 y 12).

```ts
/// <reference types="jest" />
import crypto from 'crypto';
jest.mock('svix', () => ({ Webhook: class { constructor(public secret: string) {} verify(): void {} } }));
jest.mock('@/lib/supabase/server-service', () => ({
  getServiceClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) }) }),
}));
import { verifyCronSecret, verifyMetaSignature, verifyResendWebhook, WebhookError } from '../webhookSignatures';
import { issueWsSessionToken, verifyWsSessionToken } from '../wsSessionToken';
import { checkRateLimit, checkRateLimits, getClientIp, _resetRateLimits } from '../rateLimit';
import { foreignOrganizationInBody } from '../organizationBody';
import { isPlaceholderCredential } from '@/lib/crm/providerCatalog';

const PLACEHOLDERS = ['your-secure-random-token-here', 'your-ws-session-secret', 'changeme', 'whsec_your-webhook-secret', 'your-ws-session-secret-at-least-16-chars'];

describe('P1 detector', () => {
  test.each(PLACEHOLDERS)('%s es relleno', (v) => expect(isPlaceholderCredential(v)).toBe(true)); // ROJO: changeme
});
describe('P2 verifyCronSecret con relleno', () => {
  const prev = process.env.CRON_SECRET; afterAll(() => { process.env.CRON_SECRET = prev; });
  test.each(PLACEHOLDERS)('CRON_SECRET=%s → 401', (v) => {                                     // ROJO ×5
    process.env.CRON_SECRET = v;
    const req = new Request('https://x.test/api/crm/jobs/run', { headers: { authorization: `Bearer ${v}` } });
    expect(() => verifyCronSecret(req)).toThrow(WebhookError);
  });
});
describe('P3 verifyMetaSignature con relleno', () => {
  test.each(PLACEHOLDERS)('appSecret=%s → false', (v) => {                                     // ROJO ×5
    const body = '{"object":"whatsapp_business_account"}';
    const sig = `sha256=${crypto.createHmac('sha256', v).update(body).digest('hex')}`;
    expect(verifyMetaSignature(body, sig, v)).toBe(false);
  });
});
describe('P4 verifyResendWebhook con relleno', () => {
  test('whsec_your-webhook-secret → 401 antes de svix', () => {                                 // ROJO
    expect(() => verifyResendWebhook('{}', { 'svix-id': 'a', 'svix-timestamp': '1', 'svix-signature': 'v1,x' }, 'whsec_your-webhook-secret')).toThrow(WebhookError);
  });
});
describe('P5 wsSessionToken con relleno', () => {
  const prev = process.env.WS_SESSION_SECRET; afterAll(() => { process.env.WS_SESSION_SECRET = prev; });
  test.each(['your-ws-session-secret', 'your-ws-session-secret-at-least-16-chars', 'changeme'])('secreto=%s', (v) => { // ROJO ×3
    process.env.WS_SESSION_SECRET = v;
    let token: string | null = null;
    try { token = issueWsSessionToken({ orgId: 7 }); } catch { token = null; }
    if (token) expect(verifyWsSessionToken(token)).toBeNull(); else expect(token).toBeNull();
  });
});
describe('P6 wsSessionToken bordes', () => {
  beforeAll(() => { process.env.WS_SESSION_SECRET = crypto.randomBytes(32).toString('hex'); });
  test('replay N veces dentro del TTL', () => { const t = issueWsSessionToken({ orgId: 7 }); for (let i = 0; i < 3; i++) expect(verifyWsSessionToken(t)).not.toBeNull(); }); // verde (documenta)
  test('ttl 0: exp == now sigue válido', () => expect(verifyWsSessionToken(issueWsSessionToken({ orgId: 7 }, 0))).not.toBeNull());
  test('ttl negativo → null', () => expect(verifyWsSessionToken(issueWsSessionToken({ orgId: 7 }, -2))).toBeNull());
  test('orgId string firmado → null', () => {
    const secret = process.env.WS_SESSION_SECRET as string;
    const payload = Buffer.from(JSON.stringify({ orgId: '7', exp: Math.floor(Date.now() / 1000) + 60 })).toString('base64url');
    expect(verifyWsSessionToken(`${payload}.${crypto.createHmac('sha256', secret).update(payload).digest('base64url')}`)).toBeNull();
  });
  test('orgId 0 / -1 → null', () => { expect(verifyWsSessionToken(issueWsSessionToken({ orgId: 0 }))).toBeNull(); expect(verifyWsSessionToken(issueWsSessionToken({ orgId: -1 }))).toBeNull(); }); // ROJO
  test('ttl 1 año → null (tope)', () => expect(verifyWsSessionToken(issueWsSessionToken({ orgId: 7 }, 365 * 24 * 3600))).toBeNull()); // ROJO
  test('vacío / sin punto → null', () => { for (const t of ['', 'abc', '.', 'a.']) expect(verifyWsSessionToken(t)).toBeNull(); });
});
describe('P7 rateLimit bordes', () => {
  beforeEach(() => _resetRateLimits());
  test('persistentCount lanza → fail-open', async () => expect((await checkRateLimit('k1', { limit: 1, persistentCount: async () => { throw new Error('db'); } })).allowed).toBe(true));
  test('persistentCount 100 → bloquea', async () => expect((await checkRateLimit('k2', { limit: 5, persistentCount: async () => 100 })).allowed).toBe(false));
  test('limit 0 / -1 / NaN → bloquea', async () => { for (const l of [0, -1, Number.NaN]) expect((await checkRateLimit('k' + l, { limit: l })).allowed).toBe(false); });
  test('windowMs 0 → bloquea al segundo hit', async () => { const o = { limit: 1, windowMs: 0 }; await checkRateLimit('k6', o); expect((await checkRateLimit('k6', o)).allowed).toBe(false); }); // ROJO
  test('checkRateLimits consume claves previas', async () => {
    await checkRateLimit('b', { limit: 1 });
    const r = await checkRateLimits([{ key: 'a', opts: { limit: 1 } }, { key: 'b', opts: { limit: 1 } }]);
    expect(r.blockedKey).toBe('b');
    expect((await checkRateLimit('a', { limit: 1 })).allowed).toBe(false); // 'a' ya gastó su hit
  });
  test('getClientIp', () => {
    expect(getClientIp(new Request('https://x.test', { headers: { 'x-forwarded-for': ' 1.2.3.4 , 5.6.7.8' } }))).toBe('1.2.3.4');
    expect(getClientIp(new Request('https://x.test'))).toBe('unknown');
  });
});
describe('P8 foreignOrganizationInBody', () => {
  test('ajeno / igual / ausente', () => {
    expect(foreignOrganizationInBody(8, 7)).toBe(8); expect(foreignOrganizationInBody('8', 7)).toBe('8');
    for (const v of [7, '7', undefined, '  ', '7.0', ' 7 ', [7], '0x7']) expect(foreignOrganizationInBody(v, 7)).toBeNull();
    expect(foreignOrganizationInBody({}, 7)).toEqual({});
  });
});
```

Resultado obtenido: `Tests: 18 failed, 18 passed, 36 total`. Rojos: P1×1 (`changeme`), P2×5, P3×5,
P4×1, P5×3, P6×2 (orgId 0/-1; TTL sin tope), P7×1 (`windowMs: 0`).

## Anexo B — Script de auditoría estática de rutas
```js
// node audit_routes.js > routes.tsv   (ejecutado desde el scratchpad; no forma parte del repo)
const fs = require('fs'); const path = require('path');
const ROOT = '<repo>/src/app/api';
function walk(d, out=[]) { for (const e of fs.readdirSync(d, {withFileTypes:true})) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p, out); else if (e.name==='route.ts') out.push(p);} return out; }
function strip(s){ return s.replace(/\/\*[\s\S]*?\*\//g,'').replace(/(^|[^:'"`])\/\/.*$/gm,'$1'); }
for (const f of [...walk(ROOT+'/crm'), ...walk(ROOT+'/ai-assistant')].sort()) {
  const c = strip(fs.readFileSync(f,'utf8'));
  const methods = [...new Set([...c.matchAll(/export\s+(?:const|async\s+function|function)\s+(GET|POST|PUT|PATCH|DELETE)\b/g)].map(m=>m[1]))];
  if (!methods.some(m=>m!=='GET')) continue;
  const org = /withOrg\(|getServerOrgContext\(|getServerOrgContextFor\(|withWhatsAppRoute\(/.test(c);
  const foreign = /foreignOrganizationInBody/.test(c);
  const zod = /parseWith\(/.test(c) && /withWhatsAppRoute/.test(c);
  const inline = /Number\(body\.organization_id\)\s*!==\s*ctx\.organizationId/.test(c);
  const cron = /withCron|verifyCronSecret/.test(c);
  console.log([path.relative(ROOT,f).split(path.sep).join('/'), methods.join(','), org?'SI':'NO', foreign?'403':zod?'400-zod':inline?'403-inline':cron?'cron':'ignora'].join('\t'));
}
```

## Anexo C — Tabla ruta → estado (154 rutas de escritura)
Leyenda: **org** = organización de la sesión (`withOrg`/`getServerOrgContext`/`withWhatsAppRoute`);
**ajeno** = trato del `organization_id` ajeno en body/query. OK = 403 con registro. FALTA(400) = zod.
FALTA(ignora) = se descarta sin 403 ni registro.

| Ruta (`src/app/api/`) | Métodos | org | ajeno |
|---|---|---|---|
| ai-assistant/attachments | POST | SI | FALTA(ignora) |
| ai-assistant/chat | POST | SI | FALTA(ignora) |
| ai-assistant/conversations/[id] | DELETE | SI | FALTA(ignora) |
| ai-assistant/dynamic-options | POST | SI | FALTA(ignora) |
| ai-assistant/execute-action | POST | SI | FALTA(ignora) — 403 sí para acción ajena (`action.organization_id`) |
| ai-assistant/generate-image | POST | SI | FALTA(ignora) |
| ai-assistant/improve-text | POST | SI | FALTA(ignora) |
| ai-assistant/pm-assist | POST | SI | FALTA(ignora) |
| ai-assistant/pm-planner | POST | SI | FALTA(ignora) |
| ai-assistant/reject-action | POST | SI | FALTA(ignora) |
| ai-assistant/reportes | POST | SI | FALTA(ignora) |
| ai-assistant/seo-keywords | POST | SI | FALTA(ignora) |
| ai-assistant/stream | POST | SI | FALTA(ignora) |
| ai-assistant/suggestions | POST | SI | FALTA(ignora) |
| ai-assistant/transcribe | POST | SI | FALTA(ignora) |
| ai-assistant/tts | POST | SI | FALTA(ignora) |
| ai-assistant/undo-action | POST | SI | FALTA(ignora) |
| crm/activities | POST | SI | FALTA(ignora) |
| crm/automation-rules, /[id], /[id]/trigger | POST,PATCH,DELETE | SI (admin) | FALTA(ignora) |
| crm/call-tags, /[id] | POST,PATCH,DELETE | SI | FALTA(ignora) |
| crm/calls, /manual, /[id], /[id]/{analyze,link,tags,transcribe}, /[id]/analysis/apply | POST,PATCH | SI | FALTA(ignora) |
| crm/campaigns, /[id], /[id]/{cancel,launch,materialize,pause,resume} | POST,PATCH,DELETE | SI (withWhatsAppRoute, admin) | FALTA(400-zod) |
| crm/commissions/[id]/{clawback,pay,reject}, /bulk-pay | POST | SI | **OK** |
| crm/config/providers, /test | PUT,POST | SI | FALTA(ignora) |
| crm/contracts, /[id] | POST,PATCH | SI | FALTA(ignora) |
| crm/demos, /[id] | POST,PATCH | SI | FALTA(ignora) |
| crm/discovery/[opportunityId], /templates, /templates/[id] | PUT,POST,PATCH,DELETE | SI | FALTA(ignora) |
| crm/documents, /[id] | POST,PATCH,DELETE | SI | FALTA(ignora) |
| crm/health/[customerId] | POST | SI | FALTA(ignora) |
| crm/health/[customerId]/snapshot, /refresh | POST | SI | **OK** |
| crm/health/recalculate | POST | cron | n/a (org acota; en allow-list g5) |
| crm/ia/{discovery-summary,draft-email,next-action} | POST | SI | FALTA(ignora) |
| crm/icp, /[id], /[id]/evaluate, /[id]/criteria, /[id]/criteria/[criterionId] | POST,PATCH,DELETE | SI | FALTA(ignora) |
| crm/jobs/[id]/retry | POST | SI (admin) | FALTA(ignora) |
| crm/jobs/run | POST | cron | n/a |
| crm/leads, /[id]/convert | POST | SI | FALTA(ignora) |
| crm/me/comm-preferences | PATCH | SI | FALTA(ignora) |
| crm/meetings, /[id] | POST,PATCH | SI | FALTA(ignora) |
| crm/notes | POST | SI | FALTA(ignora) |
| crm/objections, /[id], /opportunity/[opportunityId] | POST,PATCH,DELETE | SI | OK-inline (403 duplicado, no usa el helper) |
| crm/onboarding/instances, /[id], /[id]/steps/[stepId] | POST,PATCH | SI | **OK** |
| crm/onboarding/templates | POST | SI | FALTA(ignora) |
| crm/opportunities/[id]/stage | PATCH | SI | FALTA(ignora) |
| crm/partners, /[id], /[id]/deals, /[id]/deals/[dealId], /tiers, /tiers/[id] | POST,PATCH,DELETE | SI | **OK** |
| crm/payments/link, /register | POST | SI | FALTA(ignora) |
| crm/phone-numbers, /[id], /import | POST,PATCH,DELETE | SI | FALTA(ignora) |
| crm/pipeline-templates/[id]/import | POST | SI | FALTA(ignora) |
| crm/proposals, /[id], /[id]/sent | POST,PATCH | SI | FALTA(ignora) |
| crm/referrals, /[id], /[id]/{convert,reward,status}, /programs, /programs/[id] | POST,PATCH,DELETE | SI | **OK** |
| crm/renewals/sync | POST | cron (GET usa sesión) | n/a — engaña al guardarraíl 5 (fallo 6) |
| crm/revenue/inputs | PUT | SI (admin) | **OK** |
| crm/roi, /templates, /templates/[id] | POST,PATCH,DELETE | SI | FALTA(ignora) |
| crm/roles, /[id] | POST,PATCH,DELETE | SI | FALTA(ignora) |
| crm/sales-targets, /[id] | POST,PATCH,DELETE | SI | **OK** |
| crm/scoring/config | PUT | SI | FALTA(ignora) |
| crm/sequences, /[id], /[id]/enroll, /[id]/enrollments | POST,PATCH,DELETE | SI (admin) | FALTA(ignora) |
| crm/settings/telephony, /consent-preview | PATCH,POST | SI | FALTA(ignora) |
| crm/stage-agents | POST,DELETE | SI (admin) | FALTA(ignora) |
| crm/stages, /[id], /[id]/gate | POST,PUT,PATCH,DELETE | SI | FALTA(ignora) |
| crm/tasks | POST | SI | FALTA(ignora) |
| crm/teams, /[id], /[id]/members, /[id]/members/[memberId] | POST,PATCH,DELETE | SI | FALTA(ignora) |
| crm/territories, /[id] | POST,PATCH,DELETE | SI | FALTA(ignora) |
| crm/transcribe | POST | SI | FALTA(ignora) |
| crm/verticales, /[id], /import-template | POST,PATCH,DELETE | SI | FALTA(ignora) |
| crm/voice-agents, /[id], /[id]/dispatch, /campaigns, /campaigns/[id] | POST,PATCH,DELETE | SI | FALTA(ignora) |
| crm/voice-agents/campaigns/run | POST | cron | n/a (en allow-list g5) |
| crm/voices, /clone, /library | POST,PATCH,DELETE | SI (admin) | **OK** |
| crm/webhooks/documenso | POST | firma (org por `contract_signatures`) | n/a — placeholder-aware |
| crm/webhooks/elevenlabs | POST | firma SDK (`ELEVENLABS_WEBHOOK_SECRET`) | n/a — NO placeholder-aware (fallo 1) |
| crm/webhooks/stripe | POST | firma (`constructEvent`, plataforma → org) | n/a — placeholder-aware |
| crm/whatsapp/send, /reply, /settings, /templates, /templates/[id], /[id]/{preview,submit}, /templates/sync | POST,PUT,PATCH,DELETE | SI (withWhatsAppRoute) | FALTA(400-zod) |

Totales: 154 rutas · org por sesión 154/154 · ajeno→403 con registro 28 · 403 duplicado 3 ·
400 sin registro 15 · ignora 102 · cron 3 · webhook 3.

Cruce con la allow-list del guardarraíl 5 (57 entradas): 0 obsoletas (test verde). Entradas del CRM:
`crm/health/recalculate` y `crm/voice-agents/campaigns/run` (cron; deberían migrar a `withCron` y
salir). Faltante: ninguna en sentido estricto porque el guardarraíl no detecta `renewals/sync`
(fallo 6).

## Anexo D — Consultas de BD (solo lectura, MCP `jgmgphmzusbluqhuqihj`) y tsc
1. Funciones SECURITY DEFINER en `public`: 388; con EXECUTE `anon`: 217; nombre CRM-like: 49
   (lista en fallo 2). Las 11 RPC de F0 (`fn_enqueue_job`, `fn_claim_jobs`, `fn_complete_job`,
   `fn_fail_job`, `fn_release_job`, `fn_crm_cron_post`, `decrement_ai_credits`, `refund_ai_credits`,
   `deduct_comm_credits`) **sí** están cerradas a `anon` y `authenticated`; `fn_can_contact` y
   `fn_crm_seed_defaults` abiertas a `authenticated` (esperable).
2. Políticas con `qual = true` / `with_check = true` en 15 tablas del CRM: **1**
   (`ai_usage_logs` INSERT, fallo 4). `activities`, `messages`, `conversations` tienen políticas para
   `{public}` con `anon_select = true` a nivel de GRANT (la política los filtra por membresía; no se
   evaluó el `qual` de cada una).
3. `crm_events`, `outbound_jobs`, `provider_configs`: solo SELECT `authenticated`; INSERT/UPDATE
   revocados a `authenticated` (correcto: escrituras vía RPC/service role).
4. Índices únicos: `phone_numbers (organization_id, e164)`, `email_domains (organization_id, domain)`,
   `calls (organization_id, provider_call_sid)`; `comm_settings.twilio_subaccount_sid` y
   `email_messages.provider_message_id` sin único (fallo 9).
5. Advisors `security`: 9 categorías; ninguna ERROR; WARN: `anon_security_definer_function_executable`
   217, `authenticated_…` 239, `function_search_path_mutable` 434 (76 CRM), `materialized_view_in_api`
   10 (2 CRM), `extension_in_public` 4, `auth_otp_long_expiry`, `auth_leaked_password_protection`,
   `vulnerable_postgres_version`; INFO `rls_enabled_no_policy` 7 (0 CRM).
6. `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json | grep -E "orgContext|security/|enums"`:
   **0 líneas** (ningún error en `orgContext.ts`, `orgAdmin.ts`, `src/lib/security/**`, `enums.ts`
   ni `ws-server.ts`). No es un falso cero por OOM: la misma pasada cuenta **6 `error TS`** en todo el
   repo (2 en `FormularioEdicionProducto.tsx`, 3 en tests `f10Round2Tester`/`f13Round3Tester`, 1 en
   `deliveryIntegrationService.ts`), ninguno de F0-SEC.
