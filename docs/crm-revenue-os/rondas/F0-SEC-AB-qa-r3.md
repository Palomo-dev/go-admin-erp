# F0-SEC — Sub-partes A + B (webhook de WhatsApp por cambio, asistente de reportes con sesión, detector de relleno, secretos server-only, rate limit) — QA, ronda 3

Fecha: 2026-09-16. `main` = `1c2fe2e5`, sin ramas, sin commits, sin editar código: solo lectura,
verificación y este informe. Insumos: `F0-SEC-AB-builder-r3.md`, `F0-SEC-AB-tester-r3.md` (7/10),
`F0-SEC-AB-tester-r2.md`, `F0-SEC-qa-r1.md`, los 4 `testerR3.f0sec.test.ts`. Cada hallazgo del
tester se verificó leyendo el archivo y la línea; el estado de la base se comprobó con **una**
consulta `SELECT` por el MCP (`jgmgphmzusbluqhuqihj`), sin cambios.

## Calificación: **7,8 / 10** — requiere-nueva-ronda (umbral 9,5)

| Dimensión | Peso | Nota | Por qué |
|---|---|---|---|
| Funcionalidad / contrato | 25 % | 8,0 | Todo lo que pidió r2 está cerrado y verificado (H1, H2 en su vector original, fallo 3, huecos 4-5, alias). Resta: la lista blanca del asistente de reportes sigue siendo un valor del cliente (§2) y `context.organizationId` anidado no da 403 (§3). |
| Seguridad (aislamiento por firma; permisos y plan en servidor) | 30 % | 6,5 | **H4 confirmado**: una organización con `app_secret` propio pausa la plantilla y las campañas de otra (§1). Es escritura entre tenants, aunque acotada a `templates.metadata` y `campaigns.statistics`. Más salto de plan por `modulosActivos` (regla dura 6) y webhook sin rate limit. |
| Calidad de código (punto único) | 15 % | 8,5 | `normalizeMetaId` única y compartida; `applyTemplateStatusUpdate` exige organizaciones explícitas. Pero el plan y el procesamiento **deciden la organización por datos distintos** (número vs WABA) y el plan no le entrega al servicio lo que autorizó: dos fuentes de verdad, raíz de H4. |
| Pruebas (mutaciones, TZ) | 20 % | 8,5 | 21 suites / 439 tests verdes aquí; 762 en UTC y Bogotá según el tester; 20/20 mutaciones muertas; H4 dejado como 2 `test.failing` listos para rojo→verde. Resta: un byte NUL literal en un test lo vuelve binario para git y grep (§6). |
| Documentación | 10 % | 8,5 | Informes del constructor y del tester completos y honestos. La cabecera de `webhookAuthorization.ts` documenta como regla 1 justamente el comportamiento que abre H4; una nota del tester (`fn_rate_limit_hit` no existe) ya está obsoleta. |

Media ponderada: 8,0·0,25 + 6,5·0,30 + 8,5·0,15 + 8,5·0,20 + 8,5·0,10 = **7,8**.

## Verificación ejecutada

```
npx jest src/app/api/integrations/whatsapp src/lib/services/integrations/whatsapp src/lib/security src/app/api/ai-assistant/reportes
  → Test Suites: 21 passed, 21 total · Tests: 439 passed, 439 total · 11,9 s
  (incluye los 2 `test.failing` de H4, que «pasan» porque siguen fallando)

MCP execute_sql (solo SELECT):
  fn_rate_limit_hit = 1 · rate_limit_buckets = 1 · SECURITY DEFINER ejecutables por anon = 184
  fn_reporte_crm_* ejecutables por anon = 0 · fn_reporte_crm_* con ORG_FORBIDDEN = 2
```

Conclusión del estado: la migración B (`f00_40_cerrar_rpc_crm_anon`) **está aplicada** (216 → 184; las
dos `fn_reporte_crm_*` con guarda y sin `anon`), y `fn_rate_limit_hit` **existe** (la nota 7c del tester
r3 quedó obsoleta al aplicarse `rate_limit_buckets`). Falta `RATE_LIMIT_STORE=db` en Vercel (fuera del
código; anotar en el despliegue).

## Hallazgos verificados (archivo:línea)

### 1. [alto · obligatorio] H4 — la plantilla de B se pausa con la firma de A (traza plan → procesamiento)
Confirmado paso a paso:
1. `webhookAuthorization.ts:149-157` (`describeChange`): si `value.metadata.phone_number_id` viene, la
   `change` se describe por número **sea cual sea `field`**. Un `message_template_status_update` real de
   Meta no trae `metadata`, pero nada lo impide.
2. `:223-230`: resuelve `pn-a` → ámbito `channel:<secreto de A>`, `organizationIds = {7}`; el WABA de la
   entrada (`waba-b`) **ni se consulta** (la rama `:231-241` solo corre sin número).
3. `:257` union = 1 → no hay `mixed_channels`; `:305-309` la `change` se conserva (`scopes.size > 0`),
   `droppedChanges = []`; `:278` la entrada se reconstruye con `id: normalizeMetaId(entry.id)` = `'waba-b'`.
4. `route.ts:96` la firma de A valida; `:125` el servicio recibe **solo** `plan.entries` (ni `scope` ni
   `organizationIds`).
5. `whatsappCloudService.ts:405-416`: para los `field` de plantilla, las organizaciones se resuelven por
   `findChannelsByBusinessAccountId('waba-b')` → `[8]`; el `phone_number_id` inyectado no se mira.
6. `:421` → `applyTemplateStatusUpdate(update, 'waba-b', supabase, [8])`; `webhookTemplateStatus.ts:58-59`
   busca la plantilla de la org 8 por `meta_template_id`, `:74` la marca `DISABLED`, `:82-83`
   `pauseCampaignsUsingTemplate(8, …)` pausa las campañas `sending`/`scheduled` de B.

El «segundo muro» de r3 (organizaciones explícitas) se alimenta de `entry.id`, un dato que el plan no
verificó cuando la `change` resolvió por número. Los tests del tester reproducen exactamente esto
(`webhook/__tests__/testerR3.f0sec.test.ts:211-226`, `services/…/testerR3.f0sec.test.ts:98`).

Alcance real: escritura en `templates.metadata` (`status`, `paused_reason`) y `campaigns.statistics`
(`state = 'paused'`) de otra organización; no lee ni inserta mensajes. Requiere que el atacante sea una
organización con `app_secret` propio y conozca el `meta_template_id` (o nombre + idioma) de la víctima.

### 2. [medio · obligatorio] `modulosActivos` del body es la lista blanca del asistente de reportes
Confirmado. `reportes/route.ts:29,35,65` lee `modulosActivos` del body y lo pasa tal cual;
`reportAgentService.ts:214-218` lo usa para decidir qué `reportId` puede ejecutar el modelo. Un miembro
de la org 7 sin `hrm` en su plan envía `modulosActivos: ['hrm']` y ejecuta `hrm-nomina` sobre
`payroll_periods` con su sesión. RLS acota a su organización (no es cruce de tenants), pero es un salto
de plan decidido por el cliente: regla dura 6. Ya existe el punto único para resolverlo en servidor:
`moduleManagementService.getActiveModules(organizationId, supabaseClient)` (`moduleManagementService.ts:449`),
que admite el cliente de sesión y devuelve los módulos core + los pagados activos.

### 3. [bajo · opcional] `context.organizationId` anidado: seguro pero sin 403 ni registro
Confirmado. `readOrgBody` solo mira claves de nivel raíz (`organizationBody.ts:87-101`); la ruta
sobrescribe `context.organizationId` con el de la sesión (`route.ts:37-40`). Efecto seguro; contrato
«403 y se registra» no cumplido para ese campo. La sobrecarga síncrona `readOrgBody(ctx, body.context)`
(`organizationBody.ts:187`) lo resuelve en una línea.

### 4. [bajo · obligatorio] Webhook sin rate limit: hasta 25 consultas (+25 de credenciales) por petición sin firma válida
Confirmado. `route.ts:89` planifica antes de verificar (inevitable: el secreto sale del payload) y la
ruta no importa `checkRateLimit`/`checkRateLimits` (sí lo hacen `crm/whatsapp/send/route.ts:22`,
`ai-assistant/chat/route.ts:36` y otras 12). Con `fn_rate_limit_hit` ya en la base, el coste de añadirlo
es una línea con `getClientIp`.

### 5. [bajo · opcional] Replay de un `message_template_status_update` firmado
Confirmado: `applyTemplateStatusUpdate` no comprueba idempotencia (`webhookTemplateStatus.ts:66-86`); un
PAUSED capturado se re-aplica N veces. Requiere capturar un cuerpo firmado (TLS), así que bajo.

### 6. [bajo · obligatorio] Byte NUL literal en un test: el archivo es binario para git y grep
`src/lib/services/integrations/whatsapp/__tests__/testerR3.f0sec.test.ts:152` contiene `'pn-a<NUL>'`
como byte 0x00 real (offset 9337), no como `\u0000`. `file` lo reporta como `data`, `grep` lo trata como
binario (`Binary file … matches`) y `git diff` mostrará «Binary files differ» en cualquier cambio futuro.
Es la misma clase de problema que dejó `PROGRESS.md` inutilizable el 2026-09-10 (CLAUDE.md §Ciclo /loop).
Jest lo ejecuta sin problema, pero el repositorio no debe llevar bytes de control en fuentes.

### 7. [bajo · opcional] Bordes del detector de relleno (tester §6) y `getClientIp` primer salto (tester §7a)
Verificados y aceptados tal cual: `undefined:undefined`, `[object Object][object Object]`, `NaN…` no
aparecen en ninguna documentación real; `x-forwarded-for` primer salto es correcto en Vercel (sobrescribe).
Se anotan, no bloquean.

## Fortalezas (no repetir en r4)
- Unidad de autorización = unidad de procesamiento (`changes[*]`), con motivos tipados y registro de
  descartes; `normalizeMetaId` única (H1 cerrado en 10 tipos raros, 2^53+1 y 1e400 incluidos).
- `applyTemplateStatusUpdate` con `.in('organization_id', …)` y fail-closed (M09/M10 muertas).
- Asistente de reportes con cliente de sesión hasta `fetch` en los 19 módulos, con guardarraíl estático;
  la migración B ya aplicada no lo rompe (test «RPC 42501 → 200 con aviso»).
- Detector de relleno: `=`/`==` finales, `PLACEHOLDER_ANYWHERE`, `PLACEHOLDER_WORDS_ONLY`, sin falsos
  positivos en 14 formas realistas; aviso de alias una vez sin imprimir el valor.
- 20/20 mutaciones muertas, suites idénticas en UTC y Bogotá.

## Instrucciones para el builder r4

**Obligatorias (bloquean el 9,5):**

1. **H4 — cerrar los dos lados** (`webhookAuthorization.ts`, `whatsappCloudService.ts`, `route.ts`):
   a. En el plan: las `change` cuyo `field` empiece por `message_template_` se resuelven **siempre** por el
      WABA (`entry.id`) y nunca por `metadata.phone_number_id`; si traen número, se ignora (o se descarta la
      `change` con motivo nuevo `phone_number_on_template_change` — preferible: es una anomalía que merece
      log). Además, regla general: si una `change` resuelve por número **y** `entry.id` viene y resuelve a
      un ámbito distinto, descartar la `change` (`reason: 'entry_waba_mismatch'`). Actualizar la cabecera
      (regla 1) para que documente esto.
   b. En el procesamiento: `processWebhookPayload(payload, opts?: { authorizedOrganizationIds?: number[] })`.
      La ruta pasa `plan.scope === 'channel' ? plan.organizationIds : undefined`. Para plantillas,
      `applyTemplateStatusUpdate` recibe `wabaOrgs ∩ authorized` (o `wabaOrgs` si `authorized` es
      `undefined`, ámbito global). Para `messages`, si `channelInfo.organizationId ∉ authorized` → `continue`
      con `console.warn`. Así el servicio nunca vuelve a decidir la organización por un dato que el plan
      no autorizó, sea cual sea el `field` que Meta añada mañana.
   c. Tests: quitar `.failing` de `webhook/__tests__/testerR3.f0sec.test.ts:211` y
      `services/…/testerR3.f0sec.test.ts:98` (deben pasar en verde); reescribir el test «evidencia del hueco»
      (`:219-226`) para el nuevo comportamiento (403 o descarte registrado); añadir en
      `webhookProcessing.f0secR3.test.ts` un caso «`authorizedOrganizationIds = [7]` + WABA de [8] →
      `applyTemplateStatusUpdate` no se llama» y otro «ámbito global → sin intersección». Mutación
      esperada muerta: quitar la intersección.

2. **`modulosActivos` en servidor** (`reportes/route.ts`, `reportAgentService.ts`):
   en la ruta, `const activos = (await moduleManagementService.getActiveModules(ctx.organizationId, ctx.supabase)).map(m => m.code)`;
   si el body trae `modulosActivos`, usar la intersección (nunca la unión); dejar de exigirlo en el 400.
   Test en `reportes/__tests__/`: sesión de la org 7 sin `hrm`, body `['hrm']`, el modelo pide
   `hrm-nomina` → «no está disponible» y `payroll_periods` no se consulta. Quitar el caso contrario del
   tester («viene del body», 2 tests) o invertir su expectativa. `context.userRole` del body: sustituir por
   el rol de `ctx` si el prompt lo necesita.

3. **Rate limit en el webhook** (`route.ts`): antes de `planWebhookAuthorization`,
   `checkRateLimit(`wa_webhook:ip:${getClientIp(request)}`, { limit: 120, windowMs: 60_000 })` → 429 si
   bloquea (Meta reintenta con backoff; 120/min por IP cubre de sobra un WABA activo). Bajar
   `MAX_LOOKUPS` a 10. Test: 121.ª petición → 429 sin `findChannelByPhoneNumberId`.

4. **Byte NUL en el test** (`services/…/testerR3.f0sec.test.ts:152`): sustituir el byte 0x00 por la
   secuencia `\u0000` en la cadena. Comprobar con `file` (debe decir «text») y `git diff` textual. Añadir
   al guardarraíl (o a `src/__tests__/`) un caso «ningún `.ts` bajo `src/` contiene bytes de control
   < 0x20 salvo `\t`, `\n`, `\r`» para que no vuelva a entrar (CLAUDE.md §Ciclo /loop).

**Opcionales (suben nota, no bloquean):**

5. `readOrgBody(ctx, body.context)` en `reportes/route.ts` tras leer el body (§3) → 403 + `console.warn`
   con test.
6. Idempotencia de plantillas: en `applyTemplateStatusUpdate`, saltar filas cuyo
   `metadata.last_webhook_event === `${event}:${entry.time ?? ''}`` cuando `entry.time` venga; test de replay
   con el mismo cuerpo dos veces → segunda `updated: 0`.
7. Docs: `FASE-00-FUNDACIONES.md` §7.1 y `docs/hallazgos/F-11.md`: registrar 216 → 184 tras la migración
   B y que `fn_rate_limit_hit` existe; anotar `RATE_LIMIT_STORE=db` como pendiente de Vercel.

## Qué falta para el 10 (además de lo anterior)
- `integration_events` por cada rechazo del webhook (`mixed_channels`, `invalid_signature`, descartes) con
  `request_id`, y un test que lo compruebe (ya pedido en qa-r1 «Qué falta para el 10»).
- Vault para `channel_credentials.credentials.app_secret` (hoy en claro; F16/REG).

## Veredicto
requiere-nueva-ronda (7,8 < 9,5). Obligatorios 1–4; el r4 debe dejar los dos `test.failing` de H4 en
verde sin `.failing` y sin tocar ningún otro archivo de F0-SEC-CD (`orgContext.ts`, `organizationBody.ts`,
`rateLimit*.ts`, `wsSessionToken.ts`).
