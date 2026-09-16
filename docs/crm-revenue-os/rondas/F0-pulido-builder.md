# F0 — pulido «para el 10» de F0-SEC A+B y F0-REG — builder

Fecha: 2026-09-16. `main` = `ac249896`, sin ramas, sin commits, sin `git stash`. Insumos:
`F0-SEC-AB-qa-r4.md` (§3 bajos 1 y 3, §5 punto 2) y `F0-REG-qa-r4.md` (§«qué falta para el 10»
1 y 5, observaciones 1 y 3). Cambios pequeños, cada uno con test y con ≥ 1 mutación a mano
(11/11 muertas, archivos restaurados por md5). Sin nombres de organizaciones cliente. Cada
archivo conserva su terminador de línea (CRLF en los `.ts` de servicio, LF en los tests del
tester y en la migración 39). No se tocó `src/app/api/ai-assistant/reportes/**`,
`organizationBody.ts`, `guardrails.test.ts` ni `src/app/api/crm/**` (los edita otro builder;
sus cambios sin commitear en `organizationBody.ts`, `organizationBody.test.ts`,
`testerR2CD`/`testerR3CD` aparecen en `git diff` y no son de esta ronda).

## Resumen por punto

| # | Estado | Archivo:línea | Test |
|---|---|---|---|
| 1 Replay fuera de orden (plantillas) | **Hecho** | `src/lib/services/crm/whatsapp/webhookTemplateStatus.ts:84-101,127-146` | `webhookTemplateStatus.test.ts` (bloque «F0-pulido · replay fuera de orden», 5 casos) · `integrations/whatsapp/__tests__/testerR4.f0sec.test.ts` (el «ANOTADO» invertido + 2 casos nuevos) |
| 2 Cubo `unknown` del rate limit | **Hecho** | `src/lib/security/rateLimit.ts:31-43,57,108-134,175-179,246-258` · `src/app/api/integrations/whatsapp/webhook/route.ts:72-85` | `rateLimit.test.ts` (bloque «cubo unknown», 7 casos) · `webhook/__tests__/testerR4.f0sec.test.ts` (el «ANOTADO» invertido: 12 → 429) |
| 3 `integration_events` por rechazo | **Saltado** | — | — |
| 4 Retirar respaldos Node (39/43) | **Hecho** (aiCreditsService + aiCostService); **no** el de `aiUsageStatsService` (ver abajo) | `src/lib/services/aiCreditsService.ts:1-27,63-96,109-149` · `src/lib/services/crm/aiCostService.ts:30-31,242-246` | `aiCostService.test.ts` (4 casos reescritos a RPC-only + 1 nuevo PGRST202) · `f0RegTesterR3.test.ts` (1 invertido + bloque 2 sustituido, 5 casos) · `f0RegTester.r2.test.ts` (2 reescritos + 1 nuevo) |
| 5 `Etc/UTC` y nota POSIX | **Hecho** | `src/lib/utils/timezone.ts:44-48,79` · `supabase/migrations/20260915221000_crm_v4_f00_39_decrement_ai_credits_guardas.sql:60-72` (solo comentario) | `f0RegTesterR4.test.ts:280-290` (el «DOCUMENTADO» invertido + 10 negativos) |

## 1. Replay fuera de orden — `webhookTemplateStatus.ts`

Antes: la clave `<field>:<event>:<time>` solo se comparaba con `metadata.last_webhook_event`, así
que `PAUSED@t1 → APPROVED@t2 → PAUSED@t1` (cuerpo firmado capturado) volvía a pausar campañas.

Ahora (`:127-146`): se lee `entry.time` de la clave con `templateEventTime(eventKey)` (`:84`,
puro, el llamador `whatsappCloudService.ts:455` no cambia) y se guarda el último aplicado **por
campo** en `metadata.last_webhook_time` (status) / `metadata.last_quality_webhook_time`
(quality) (`lastWebhookTimeKey`, `:93`). Un evento con `time < último aplicado` se ignora con
`console.warn('… replay fuera de orden', { templateId, organizationId, field, event, eventTime,
lastApplied })` y `continue` (`:134-144`): ni `update` ni campañas. Un `time` igual con otra
clave se aplica (dos cambios del mismo lote de Meta comparten `entry.time`); la misma clave
sigue saltándose (idempotencia de r4 intacta); sin `entry.time` no hay clave, no se compara y
no se escribe el tiempo; un `last_webhook_time` basura (`'ayer'`, `-1`, objeto) no bloquea y se
sobreescribe. La monotonía es por campo: un `quality_update@t1` tardío no queda bloqueado por un
`status_update@t2` ni al revés.

Mutaciones: `<` → `<=` (muerta: el caso «mismo time, otra clave» cae); no guardar el tiempo
(muerta, 5 tests); una sola columna para los dos campos (muerta: el caso «por campo» cae).

## 2. Cubo `unknown` — `rateLimit.ts` + cabecera del webhook

`RateLimitOptions.unknownClientLimit?: number` (`:57`). `effectiveLimit(key, opts)` (`:122`):
para una clave terminada en `:unknown` (todas las claves por IP son `<ruta>:ip:<ip>`, y
`getClientIp` devuelve `UNKNOWN_CLIENT_IP = 'unknown'`) rige `unknownClientLimit` si es entero,
`> 0` y `≤ limit`; si no, `max(1, floor(limit / 10))`. Nunca más laxo que `limit`. Aplica al
camino en memoria y al `store` persistente (`:175-179`: el límite proyectado es el efectivo).
`console.warn` una sola vez por proceso (`warnUnknownBucketOnce`, `:129`; `_resetRateLimits` lo
reinicia). Un límite inválido sigue bloqueado (fail-closed) antes de llegar aquí. Es un
«fail-closed razonable», no un bloqueo total: en local y en tests no hay proxy y las rutas
tienen que responder. Efecto en los 7 llamadores por IP sin tocarlos: `invite/*` (5 → 1 en el
cubo `unknown`), `twilio/verify/*`, `auth/verify`, webhook de WhatsApp (120 → 12, explícito).

Cabecera de `webhook/route.ts:72-85`: documenta los dos límites conocidos — cubo por IP de
egreso de Meta compartido entre organizaciones (el 429 va antes de la firma; un tercero solo
agota el cubo si comparte la IP; vigilar el `console.warn` y, si salta con tráfico legítimo,
subir `limit` o `RATE_LIMIT_STORE=db`, no quitarlo) y cubo `unknown` sin cabecera de IP (en
Vercel siempre viene; si el aviso `[rateLimit] petición sin cabecera de IP` aparece en
producción, el proxy está mal).

Tests ajustados por el cambio de contrato (comparten cubo `unknown` sin querer): `testerR2.f0sec`
y `multiOrg.f0sec` del webhook (`_resetRateLimits()` en `beforeEach`), `invite/resend/resend.test`
(IP propia por llamada en el test del nombre de la organización). De paso, limpios de ESLint
(5 errores preexistentes: `_payload`/`_args` sin usar y `any` en el doble; `Row` pasa a
`Record<string, unknown>` con `String(value)` en `evalTerm`).

Mutaciones: `isUnknownClientKey` ignorado (muerta, 7 tests); aceptar `unknownClientLimit > limit`
(muerta); avisar cada vez (muerta); `unknownClientLimit: 60` en la ruta (muerta).

## 3. `integration_events` por rechazo — saltado

Verificado por MCP (SOLO SELECT): la tabla `integration_events` existe (`id, connection_id NOT
NULL uuid, source, direction, event_type NOT NULL, external_event_id, payload, status,
processed_at, error_message, created_at, correlation_id, event_time, organization_id NULL`).
Pero **no se usa desde este servicio**: `grep integration_events` en
`src/lib/services/integrations/whatsapp/**` y `webhook/route.ts` → 0 (la usan los webhooks de
pagos, Meta/TikTok product-sync, SendGrid y `qrShared/webhookSecurity.ts`). La condición del
encargo era «existe **y** ya se usa desde este servicio»; además `connection_id` es NOT NULL y
un rechazo `invalid_signature` / `rate_limited` / `mixed_channels` no tiene conexión resuelta.
Queda como estaba: deuda anotada desde qa r1 (necesita decidir a qué `connection_id` atribuir
un rechazo sin canal, o una tabla/columna nueva → migración, fuera de un pulido).

## 4. Retirar respaldos Node — `aiCreditsService.ts` / `aiCostService.ts`

Verificado por MCP (SOLO SELECT) el 2026-09-16: `fn_provision_ai_settings`, `fn_ai_plan_quota` y
`fn_resolve_timezone` están en `pg_proc`. Retirados: `ensureAiSettingsFallback` (insert + `update
… is('credits_reset_at', null)` + reintentos), `planQuotaFallback` (consulta a `subscriptions` +
regla del cupo en Node), `customConfigCredits`, `SubscriptionQuotaRow`, `isMissingFunction`,
`provisionViaRpc`, `toEnsured`, `AiSettingsRow`. `aiCreditsService.ts` pasa de 465 a 337 líneas.

- `ensureAiSettings` (`:134-149`): solo la RPC. Error (incluida «función ausente») → `Error`
  con el mensaje de la RPC; respuesta sin `credits_remaining` numérico → `Error`. `chargeAiCredits`
  ya lo captura y responde 402 (`aiCostService.ts:247-254`, sin cambios de código).
- `getAIFeaturesForOrganization` (`:84-96`, la usa `checkAICredits`): solo `fn_ai_plan_quota`.
  RPC con error o sin `monthly` numérico → `NO_QUOTA` (0 créditos, defaults) + `console.error`.
  Es la misma decisión que tomaba el respaldo cuando **su** consulta fallaba («sin cupo conocido
  no se regala saldo»), no una segunda regla.
- **¿Cubría transitorios?** No. El respaldo solo se activaba con `PGRST202`/`42883`/«could not
  find the function» (`isMissingFunction`); cualquier otro error de la RPC ya lanzaba (tester r3
  lo exigía: «42501 → 402 y NUNCA respaldo»). Y un fallo de red en la RPC habría fallado igual
  en el `select`/`insert` del respaldo (misma conexión). Nada que conservar.
- `aiCostService.ts`: solo comentarios (`:30-31`, `:242-246`).
- **No retirado: `aiUsageFallback` / `commUsageFallback` en `aiUsageStatsService.ts`.** No estaba
  en el encargo (que nombra `aiCostService.ts` / `aiCreditsService.ts`) y su contrato (`truncated`,
  `source: 'rpc' | 'fallback'`, `FALLBACK_ROW_LIMIT`) lo consume `src/app/api/crm/config/credits/route.ts:76,86`
  y `f0RegTester.r2.routes.test.ts`, en `src/app/api/crm/**`, que otro builder edita ahora.
  Coste cuando se haga: quitar los dos fallbacks + `isMissingFunctionError` + 3 tests de
  `aiUsageStats.test.ts` y decidir si `truncated`/`source` se quedan (siempre `false`/`'rpc'`) o se
  retiran del JSON del panel Créditos. Tarde corta; conviene en la misma ronda que toque esa ruta.

Tests: los que simulaban «migración 43 ausente → respaldo» (7 en `f0RegTesterR3`, 3 en
`aiCostService.test`, 2 en `f0RegTester.r2`) se reescribieron a RPC-only: el doble hace en `row`
lo que la RPC hace en SQL, y leer `subscriptions`/`plans` o escribir `ai_settings` desde Node
**lanza**. Nuevos: RPC ausente (PGRST202 y 42883) → `ensureAiSettings` lanza y el cobro da 402
con exactamente `['decrement_ai_credits', 'fn_provision_ai_settings']`; basura de la RPC →
lanza (5 formas); negativo → 0; concurrencia: la RPC es atómica y Node no escribe.

Mutaciones: RPC ausente → devolver 0 en silencio (muerta, 5 tests); basura → 0 (muerta, 2).

## 5. `Etc/UTC` y nota POSIX

`timezone.ts:79`: `if (tz === 'UTC' || tz === 'Etc/UTC') return true;` (+ JSDoc `:44-48`). Solo ese
enlace: `Etc/GMT`, `Etc/GMT±N`, `Etc/Universal`, `etc/utc`, con espacios o `\n` siguen en `false`
(el signo de `Etc/GMT±N` es POSIX, invertido). Mutaciones: quitar `Etc/UTC` (muerta); aceptar
todo `Etc/*` (muerta, 2 tests).

Migración 39, cabecera `:60-72` (solo comentario; la migración ya está aplicada y **no se
reaplicó**; el `.sql` en el árbol sigue siendo el que está en producción salvo este comentario,
que no cambia ninguna sentencia): «LÍMITE CONOCIDO»: en POSIX `at time zone '+05:30'` /
`'UTC+5'` son 5 h al oeste y `Etc/GMT+5` es UTC−5; hoy inalcanzable (trigger 44 +
`isSupportedTimeZone`); si `p_tz` llegara de otra fuente, `if v !~ '^[A-Za-z]' then return 'UTC'`
antes del `perform`.

## Verificación

```
TZ=UTC            npx jest src/lib/services/integrations/whatsapp src/app/api/integrations/whatsapp
                    src/lib/security/__tests__/rateLimit src/__tests__/services/f0Reg src/lib/services/crm/__tests__
                    src/lib/utils src/lib/services/crm/whatsapp src/lib/services/__tests__/aiCostService
                    src/lib/services/__tests__/f0RegTester src/app/api/auth src/app/auth src/app/api/integrations/twilio
  → Test Suites: 145 passed · Tests: 2989 passed
TZ=America/Bogota (mismo comando) → 145 / 2989 passed
npx jest src/__tests__/guardrails → 85/85 (caso 21 de bytes de control incluido)
npx eslint <17 archivos tocados> → 0 problemas
tsc (node --max-old-space-size=8192, tsconfig.json) → exit 0, 0 errores en todo el proyecto (segunda pasada;
  la primera dio 2 en resend.test.ts por el `Row` tipado que introduje — corregidos con String(value) — y 4 ajenos
  en crm/leads, f12MiscCustomerSearch y f13Round2Tester que el otro builder cerró entre pasadas)
Mutaciones: 11 aplicadas / 11 muertas; md5sum -c de los 5 fuentes → OK tras restaurar
```

Baseline antes de tocar nada (misma selección, TZ=UTC): 2 fallos en `f0RegTesterR4.test.ts:235-242`
(`it.failing` del hueco de la query en `readOrgBody`, que el otro builder estaba cerrando en
`organizationBody.ts`); al final de esta ronda pasan porque ese cambio ya está en el árbol. No es
de esta ronda.

## Anexo — archivos tocados (22 en `git diff --stat`, 18 de esta ronda)

Fuente: `webhookTemplateStatus.ts`, `rateLimit.ts`, `whatsapp/webhook/route.ts`,
`aiCreditsService.ts`, `aiCostService.ts` (comentarios), `utils/timezone.ts`, migración 39
(comentario). Tests: `crm/whatsapp/__tests__/webhookTemplateStatus.test.ts`,
`integrations/whatsapp/__tests__/testerR4.f0sec.test.ts`, `webhook/__tests__/testerR4.f0sec.test.ts`,
`webhook/__tests__/testerR2.f0sec.test.ts`, `webhook/__tests__/multiOrg.f0sec.test.ts`,
`invite/resend/__tests__/resend.test.ts`, `security/__tests__/rateLimit.test.ts`,
`services/__tests__/aiCostService.test.ts`, `services/__tests__/f0RegTester.r2.test.ts`,
`__tests__/services/f0RegTesterR3.test.ts`, `__tests__/services/f0RegTesterR4.test.ts`.
Del otro builder (no tocados aquí): `organizationBody.ts`, `organizationBody.test.ts`,
`testerR2CD.f0sec.test.ts`, `testerR3CD.f0sec.test.ts`.

Pendientes que deja esta ronda (ninguno bloquea): `integration_events` por rechazo (punto 3,
requiere decisión de esquema); respaldo de `aiUsageStatsService` (punto 4, con la ruta de
créditos); `next build` con el dev server parado (arrastrado desde F0-REG r1).
