# F0-SEC — Sub-partes A (secretos reales + webhook WhatsApp) y B (cierre de RPC a `anon`) — Tester — Ronda 2 (2026-09-15)

Insumos: `rondas/F0-SEC-A-builder-r2.md`, `rondas/F0-SEC-B-builder-r2.md`, `rondas/F0-SEC-qa-r1.md`,
`rondas/F0-SEC-tester-r1.md` (anexo A, anexo C). Migración **pendiente, no aplicada**:
`supabase/migrations/20260915223000_crm_v4_f00_40_cerrar_rpc_crm_anon.sql` + rollback.

Método: suites del constructor en `TZ=UTC` y `TZ=America/Bogota`; una sonda temporal de 51 casos sobre
`secrets.ts` y los verificadores (ejecutada y **borrada**; los casos con valor quedaron en tests permanentes);
17 mutaciones con restauración byte a byte verificada por md5; grep de `rpc('` en los 4 repositorios;
dry-run de la migración y del rollback **dentro de transacciones terminadas en `ROLLBACK`** por el MCP de
Supabase (proyecto `jgmgphmzusbluqhuqihj`), con impersonación de `anon`, `authenticated` (miembro y no
miembro) y `service_role`; `tsc` completo filtrado. Sin credenciales reales, sin commits, sin nada aplicado en
la base (comprobado al final: 216 funciones SECURITY DEFINER ejecutables por `anon`, sin guarda, md5 de las
dos `fn_reporte_*` iguales a los de partida, 0 sesiones «idle in transaction»). Las organizaciones se citan
por id; los usuarios usados en el dry-run no se identifican.

Nada de lo que sigue es un veredicto de aprobado/rechazado: eso lo decide el qa-reviewer.

## Resumen de pruebas
- Casos ejecutados: **376** = 219 (suites del constructor) + 51 (sonda A, borrada) + 47 (tests permanentes
  nuevos, 7 de ellos `test.failing` que documentan huecos) + 17 mutaciones + 36 comprobaciones del dry-run
  (25 migración + 3 repetidas con arnés corregido + 8 rollback) + 6 comprobaciones estáticas de B.
- Pasaron: **365**. Fallaron / hallazgos: **11** → 2 huecos de seguridad en el webhook (H1, H2), 1 regresión
  funcional que la migración B introduciría (fallo 3), 2 huecos menores del detector de relleno, 3 mutantes
  supervivientes (cubiertos ahora con tests: M11, M16, M17), 1 mutante equivalente (M04), 2 casos
  de la sonda que solo anotan comportamiento (`min: Infinity` cae al default; alias real tapa principal de relleno).
- Suites (`npx jest src/lib/security src/app/api/integrations/whatsapp src/lib/services/integrations/whatsapp src/__tests__/guardrails.test.ts`):
  `TZ=UTC` → **12 suites, 269 tests, todos verdes**; `TZ=America/Bogota` → **12 suites, 269 tests, todos verdes**
  (219 del constructor + 50 nuevos; guardarraíles 67/67).
- `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json` → 5 errores en el árbol, **0** en
  `security/|whatsapp|ws-server|bridgeTokens` (los 5 son ajenos: `FormularioEdicionProducto.tsx`,
  `f13Round3Tester.test.ts`, `deliveryIntegrationService.ts`).
- Mutaciones: **13 muertas / 17** en la primera pasada; 3 supervivientes (M11, M16, M17) mueren tras los tests
  añadidos (reejecutadas: `4 failed`, `1 failed`, `1 failed`) → **16/17**; M04 es un mutante equivalente (ver anexo B).
- Dry-run B: **OK** (36/36 como se esperaba; tabla en la sección B). Rollback: **OK**, restaura ACL y definiciones.

## Fallos encontrados

### 1. [crítico] Webhook de WhatsApp: la autorización es POR ENTRADA pero el procesamiento es POR CAMBIO — un `phone_number_id` NUMÉRICO de B dentro de la entrada de A reabre la inyección entre organizaciones (H1)
`webhookAuthorization.ts:98` (`describeEntry`) solo cuenta ids con `typeof id === 'string'`; un `123` numérico
ni se consulta ni suma a `MAX_LOOKUPS` ni añade ámbito. La entrada se conserva porque su otra `change` resolvió a
A (`kept = resolutions.filter(r => r.scopes.size > 0)`, línea 183) y se entrega ENTERA a
`processWebhookPayload`, que por cada `change` hace `findChannelByPhoneNumberId(phoneNumberId)`
(`whatsappCloudService.ts:410`) → `.filter('credentials->>phone_number_id', 'eq', 123)`; postgrest-js interpola
el valor en la URL (`eq.123`, `PostgrestFilterBuilder.js:376`), así que **encuentra el canal de B** y
`processIncomingMessage` inserta en las conversaciones de B con la firma de A.
Reproducir (test real con HMAC calculado, `webhook/__tests__/testerR2.f0sec.test.ts` › H1, `test.failing`):
A firma `entry[0] = { id: 'waba-zz', changes: [messages(pn-a), messages(123 /* number */)] }` → **200** y la
`change` del 123 llega al procesamiento (con `"123"` string sí da 403 `mixed_channels`: control verde).
Evidencia del servicio (`webhookCoercion.testerR2.test.ts`): `findChannelByPhoneNumberId(123)` y `('123')`
generan filtros idénticos y resuelven `{ ch-b, org 8 }`.
Esperado: normalizar/rechazar tipos en `describeEntry` (todo `phone_number_id` que no sea string no vacío →
la `change` se descarta o el payload se rechaza), y que el filtrado de la regla 3 sea por `change`, no por entrada.

### 2. [alto] La misma granularidad deja pasar una `message_template_status_update` con el `meta_template_id` de B dentro de la entrada de A (H2)
Con `entry.id` desconocido (o ausente), la plantilla no añade ámbito, pero la entrada se conserva por el mensaje
de A. `applyTemplateStatusUpdate` (`webhookTemplateStatus.ts:45`) busca por `metadata->>meta_template_id` en
**todas** las organizaciones (el filtro por `waba_id` solo aplica cuando no hay id y se busca por nombre) →
actualiza la plantilla de B a `DISABLED`/`PAUSED` y `pauseCampaignsUsingTemplate` pausa sus campañas.
Es exactamente el caso que el constructor dice haber cerrado con la regla 3, pero su test («plantilla de un
WABA desconocido se DESCARTA») solo cubre la plantilla en una entrada **separada** (control verde aquí también).
Reproducir: `testerR2.f0sec.test.ts` › H2 (2 `test.failing`: `entry.id` desconocido y sin `entry.id`) y
`webhookCoercion.testerR2.test.ts` › «applyTemplateStatusUpdate por meta_template_id no filtra por organización»
(con un doble de tabla: la plantilla de la org 8 queda `DISABLED`). Esperado: descartar por `change` las
plantillas cuyo WABA no resolvió al ámbito firmante, o exigir en `applyTemplateStatusUpdate` el `organization_id`
del canal resuelto.

### 3. [alto] La migración B rompe el asistente de reportes: `POST /api/ai-assistant/reportes` ejecuta `fn_reporte_crm_*` como `anon` desde el servidor
El constructor listó solo los dos llamadores directos (`crmReports.ts`, `commercialMetricsService.ts`) y los dio
por «navegador con sesión». Pero `src/app/api/ai-assistant/reportes/route.ts` → `reportAgentService.sendMessage`
→ `ejecutarReporte` (`reportesEngine.ts:14`) → `crmReports.fetch` → `supabase.rpc('fn_reporte_crm_funnel')` con
el cliente de `@/lib/supabase/config` (anon key; en servidor no hay `document.cookie` → sin sesión). Hoy ese
camino funciona **porque `anon` puede ejecutarla** (que es justamente el fallo que B corrige); tras la migración
devuelve `42501 permission denied for function` y el asistente contesta «No pude ejecutar el reporte Funnel de
Ventas / Ranking de Vendedores» (`reportAgentService.ts:238`). La página `app/reportes` (cliente, con sesión) sí
seguirá funcionando. No es un defecto de la migración sino de ese camino (viola la convención «`config` → solo
navegador»), pero el orquestador debe corregirlo (pasar `getServerUserClient()`/un cliente inyectado al motor
de reportes) **en el mismo despliegue** o aceptar la rotura. Verificado en el dry-run: `authenticated` sin JWT y
`service_role` → `ORG_FORBIDDEN` (C06, C07): tampoco vale «cambiar a service role».

### 4. [bajo] `isPlaceholderCredential` acepta base64 de bytes repetidos con `=` de relleno
`isFillerCredential` exige que todo el cuerpo sea el mismo carácter; `AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=`
(base64 de 32 ceros, 44 chars) → `null` (aceptado) mientras que sin `=` → `placeholder`. Con `CRON_SECRET` así,
`verifyCronSecret` **no** lanza (sonda). Es un valor que aparece en documentación como ejemplo de secreto.
Test `security/__tests__/testerR2.f0sec.test.ts` › `test.failing` «base64 … con "=" de relleno».
Esperado: quitar `=`/`==` finales antes de la comprobación de repetición.

### 5. [bajo] Otros bordes del detector (anotados, sin test)
`undefinedundefined` / `undefined-undefined` (18-19 chars) → aceptados; `1234changeme5678` → aceptado;
`abc-your-secure-random-token-here-with-a-long-tail-1234567` (`your-` en medio y ≥ 48) → aceptado;
`abcdefgh-todo-1234567` → **rechazado** (falso positivo conservador: `word` tras ≤ 8 letras). `min: Infinity`
cae al default 16 (no a «rechazar todo»). `readRealSecret` con principal de relleno y alias real devuelve el
alias (razonable, pero el registro dice `placeholder` de la principal y no menciona que se usó el alias).

### 6. [bajo] Dos huecos de cobertura destapados por mutación (ya cerrados con tests nuevos)
- M11: `WS_SESSION_SECRET_MIN_LENGTH` 32 → 16 sobrevivía a las 107 pruebas de `security/`: ningún test exigía
  que un secreto real de 16..31 chars se rechace. Ahora `testerR2.f0sec.test.ts` (16/24/31 → null, 32 → ok).
- M16: `if (!signature)` → `if (false)` en la ruta sobrevivía: sin cabecera el 403 llegaba igual vía
  `verifyMetaSignature`, pero **después** de consultar canales (coste en BD sin firma). Ahora se exige
  `lookups = []`.

## Sub-parte B — revisión y dry-run

Estático: las 32 firmas existen en `pg_proc` con la firma exacta, `prosecdef = true`, owner `postgres`, y hoy
tienen EXECUTE para `anon` y `authenticated` (32/32); solo hay 2 sobrecargas de `fn_reporte_*` (una cada una) y
2 de `update_opportunity_stage_safe` (ambas en la migración). Las dos definiciones del rollback son
**byte-idénticas** a `pg_get_functiondef` (md5 `bc71c2cf…` y `ed1e71c4…`). 32 `begin`/32 `commit`/32
`lock_timeout` en la migración; 32/32/32 en el rollback; UTF-8 sin BOM; sin credenciales ni nombres de
organización. Los 4 `cron.job` (7, 8, 10, 21) corren como `postgres` y activos. Llamadores `rpc('` en
`go-admin-erp/{src,supabase/functions,ws-server.ts,electron,print-agent}`, `goadmin-websites`,
`go-admin-sellers`, `go-admin-super` (sin tests): solo `fn_campaign_mark_{sent,opened,clicked,bounced,replied}`
(service role) y `fn_reporte_crm_*` (2 archivos, cliente de navegador — pero ver fallo 3 para el camino de
servidor que el grep directo no muestra). Coincide con la tabla del constructor.

Dry-run (una sola transacción: migración sin sus `begin/commit` + bloque `DO` con sub-bloques `EXCEPTION` +
`SELECT` de la tabla temporal + `ROLLBACK`; org 135 = la de más oportunidades; un miembro activo de esa org y
un usuario activo de otra):

| # | Caso | Esperado | Obtenido |
|---|---|---|---|
| C01 | `anon` → `fn_reporte_crm_funnel(135, …)` | 42501 permiso | `42501 permission denied for function fn_reporte_crm_funnel` |
| C02 | `authenticated` miembro (JWT `sub`) → funnel | jsonb | OK: `keys=forecast,por_etapa,total_pipeline etapas=1` |
| C03 | `authenticated` miembro → ranking | jsonb | OK: `ranking n=0` |
| C04 | `authenticated` NO miembro → funnel | 42501 ORG_FORBIDDEN | `42501 ORG_FORBIDDEN` |
| C05 | `authenticated` NO miembro → ranking | 42501 ORG_FORBIDDEN | `42501 ORG_FORBIDDEN` |
| C06 | `authenticated` sin JWT (uid NULL) → funnel | 42501 | `42501 ORG_FORBIDDEN` |
| C07 | `service_role` → funnel (documentado: rechaza) | 42501 | `42501 ORG_FORBIDDEN` |
| C08 | `anon` → `get_ai_tokens_usage(135)` | 42501 | `permission denied for function get_ai_tokens_usage` |
| C09 | `authenticated` miembro → `get_conversation_stats` | 42501 | `permission denied for function get_conversation_stats` |
| C10 | `authenticated` → `fn_get_campaign_metrics` | 42501 | `permission denied …` |
| C11 | `anon` → `update_opportunity_stage_without_refresh` (grupo B) | 42501 | `permission denied …` |
| C12 | `service_role` → `get_ai_tokens_usage(135)` | ejecuta | OK (`4518`) |
| C13 | `anon` → `fn_reset_monthly_ai_credits()` | 42501 | `permission denied …` |
| C14 | `authenticated` → `fn_apply_conversation_tag` (desviación 1) | 42501 | `permission denied …` |
| C15 | `authenticated` → `fn_agent_pick_member(135, {})` (desviación 1) | 42501 | `permission denied …` |
| C16 | `has_function_privilege('anon')` entre las 32 | 0 | 0 |
| C17 | `authenticated` con EXECUTE en grupo A (24) | 0 | 0 |
| C18 | `authenticated` con EXECUTE en grupo B+C (8) | 8 | 8 |
| C19 | `service_role` con EXECUTE en las 32 | 32 | 32 |
| C20 | `PUBLIC` con EXECUTE en las 32 | 0 | 0 |
| C21 | SECURITY DEFINER ejecutables por `anon` en `public` | 184 | 184 |
| C22 | de ellas con nombre CRM-like | 0 | 0 |
| C23 | `fn_reporte_*` con `ORG_FORBIDDEN` + secdef + `search_path=public` | 2 | 2 |
| C24 | sobrecargas de `fn_reporte_*` | 2 | 2 |
| C25 | consulta de verificación del informe del constructor | 0 filas | 0 |
| R01 | tras rollback: `anon`+`authenticated` EXECUTE en las 32 | 32 | 32 |
| R02 | tras rollback: `PUBLIC` EXECUTE | 31 (`fn_expire_ai_agent_actions` no lo tenía) | 31 |
| R03 | tras rollback: SECURITY DEFINER ejecutables por `anon` | 216 | 216 |
| R04 | tras rollback: `fn_reporte_*` con guarda | 0 | 0 |
| R05 | tras rollback: md5 de las definiciones | = originales | difieren en 1 byte **por mi arnés** (quité líneas en blanco al pegar); el archivo de rollback en disco sí es byte-idéntico (md5 local = md5 BD) |
| R06 | tras rollback: `anon` → funnel | ejecuta (estado previo) | OK |
| R07 | tras rollback: `authenticated` → `fn_agent_pick_member` | ejecuta (estado previo) | OK |

C02/C03/C12 se repitieron en una segunda transacción porque en la primera el `INSERT` en la tabla temporal corrió
todavía bajo el rol impersonado (error del arnés, no de la función). Estado de la BD al terminar: 216 / sin guarda
/ md5 originales / 0 «idle in transaction».

Observaciones de B (no fallos): (a) el `CREATE OR REPLACE` del grupo C conserva el ACL previo (incluido `anon`)
hasta el `REVOKE` del mismo bloque — correcto, pero el orden importa si alguien parte el bloque; (b) las 6
funciones de etapa de oportunidad siguen ejecutables por cualquier `authenticated` con guarda propia, sin llamador:
candidatas a `DROP` como dice el constructor; (c) el dry-run confirma que **no hay bypass de `service_role`** en las
`fn_reporte_*` (C07), coherente con la decisión documentada y con el fallo 3.

## Cobertura no probada / riesgos pendientes
- No se ejecutó el webhook real contra Meta ni `processWebhookPayload` con Supabase: H1/H2 se prueban en la ruta
  con HMAC real y el servicio doblado, y en el servicio con dobles de PostgREST/tabla. La coerción numérica se
  demuestra sobre `postgrest-js` real (`filter` interpola `${operator}.${value}`), no contra la base.
- No se probó `verifyResendWebhook` con el paquete `svix` real (doblado, como en las suites del constructor).
- No se probó el handshake real del ws-server ni `authenticateUpgrade`.
- Los `.env.example` de los tres repos hermanos no existen; solo se custodió el de `go-admin-erp`
  (`OPENAI_MAX_TOKENS=4096` es el único «no relleno» y no es un secreto: falso positivo de mi regex, no del test).
- `apply_migration` envuelve o no en transacción: los `begin/commit` internos de la migración se aplicarían tal
  cual; el patrón ya se usó en `20260910213714` y `20260911000000`, no lo reverifiqué.
- El árbol cambió durante la ronda (otro agente edita `organizationBody.ts`; se hizo el commit `47fbc8c5`):
  las suites se corrieron sobre el estado final del árbol, no sobre un snapshot.

## Calificación de robustez (1-10, opinión técnica del tester)
**6/10** — La capa `secrets.ts` es sólida: 51 casos de borde y 16/17 mutaciones muertas (los 3 supervivientes
iniciales eran huecos de cobertura, no de código; el restante es equivalente), todos los verificadores fallan cerrados con 15 chars, `undefined`,
relleno con sufijo/prefijo, huecos de plantilla y espacios; el `.env.example` queda custodiado por test. La
migración B es correcta, reversible y verificada con impersonación en la base (36/36) y su rollback restaura
todo byte a byte. Pero el webhook de WhatsApp, que era el crítico 4 de la ronda 1, sigue abierto por dos vías
(H1 coerción numérica → mensajes en B; H2 plantillas de B pausadas) porque la regla 3 filtra por entrada y no por
`change`; y la migración B, tal como está, tumba el asistente de reportes (fallo 3) porque un route handler usa el
cliente de navegador sin sesión y hoy sobrevive gracias al agujero que B cierra.

## Archivos de la ronda
- `src/lib/security/__tests__/testerR2.f0sec.test.ts` (nuevo, 31 casos; 1 `test.failing`)
- `src/app/api/integrations/whatsapp/webhook/__tests__/testerR2.f0sec.test.ts` (nuevo, 11 casos; 4 `test.failing`)
- `src/lib/services/integrations/whatsapp/__tests__/webhookCoercion.testerR2.test.ts` (nuevo, 5 casos; 2 `test.failing`)
- `docs/crm-revenue-os/rondas/F0-SEC-AB-tester-r2.md` (este informe)
- Borrados: `src/lib/security/__tests__/zz_tester_r2_probe.test.ts` (sonda). Los scripts del dry-run y de
  mutación viven en el scratchpad de la sesión, fuera del repositorio.

Nota sobre `test.failing`: jest 30 los marca verdes mientras fallan; cuando el constructor cierre H1/H2/base64,
jest los marcará «passing unexpectedly» y hay que quitar el `.failing`. Es la prueba «rojo antes, verde después».

---

## Anexo A — Sonda de bordes de `secrets.ts` (51 casos, ejecutada y borrada)
`secretProblem`: 15 chars → `too_short`; 16 → ok; `'abcdefghijklmno '` → `too_short`; `' abcdefghijklmnop'` → ok
(se devuelve sin recortar); `'aaaa bbbb cccc dd'` → ok; 16 espacios / `'\t\n'` → `missing`; `undefined`/`null`
→ `placeholder`; `NaN`/`true`/`[object Object]` → `too_short`; `undefinedundefined` → ok (hueco 5);
`AAAA…A=` (44) → ok (hueco 4); `AAAA…A` (44) → `placeholder`; `YWFh…` (base64 de `a`×21) → ok;
`whsec_AAAA…` → `placeholder`; `your-secure-random-token-here-1`, `xyour-…`, `your-…` de 70 chars →
`placeholder`; `abc-your-…-1234567` (≥ 48) → ok (hueco 5); `changeme-2026-09-15`, `changemechangeme`,
`'  changeme  '`, `CHANGEME`, `genera-uno-con-openssl-rand-hex-32`, `<meta-app-secret-…>`, `${CRON_SECRET}`,
`{{ secret }}`, `x`×16, `0`×16 → `placeholder`; `1234changeme5678`, `secretsecretsecret`, `testtesttesttest`,
`xxxxxxxxxxxxxxx1`, `0123456789abcdef`, `sk_test_51H…` → ok; `abcdefgh-todo-1234567` → `placeholder`.
`min`: `Infinity` → default 16; `1e9` → todo `too_short`; `-5` → default; `15.9` → 15.
Tipos: number/array/objeto con `toString` → `missing`.
Verificadores: `verifyCronSecret` con 15 chars / `undefined` / `your-…-1` / `changeme-…` →
`cron_secret_not_configured` (con `AAAA…A=` → **no lanza**, hueco 4). `verifyMetaSignature` con HMAC correcto y
secreto de 15 / `undefined` / relleno+sufijo → `false`; con `' abcdefghijklmnop'` → `true`.
`verifyResendWebhook` con `whsec_abcdefghi` / `undefined` / `whsec_undefined` / `whsec_your-…-1` /
`whsec_AAAA…` → `resend_webhook_secret_missing` antes de svix. `resolveTwilioAuthToken`: master 15 chars /
`undefined` / `your-…-1` → null; legacy `changeme` → null; subcuenta con `'undefined'` en `comm_settings` → null.
`verifyTwilioRequest` con token 15 / `undefined` / `your-master-auth-token` / `''` → `twilio_auth_token_missing`;
`verifyTwilioUrlSignature` ídem → `false`. `wsSessionToken`: 31 chars reales → no lee/emite/verifica; token
emitido con secreto real y verificado con relleno → null; ttl 3600 → ok, 3601 → null, `NaN` → null; `orgId`
1.5 → null; `2^53+2` → **se acepta** (entero según `Number.isInteger`; anotado, sin impacto); payload o firma
alterados / sin punto → null. `rateLimit` `windowMs` 0/-1/NaN/Infinity → bloquea, 0.5 → permite; `limit: NaN`
→ bloquea. `bridgeTokens` con `genera-uno-…` / 15 chars / `undefined` → no configurado, `sign` lanza, `verify`
false. Alias: `META_APP_SECRET` relleno + `WHATSAPP_APP_SECRET` real → devuelve el alias.

## Anexo B — Mutaciones (restauración byte a byte verificada por md5 en las 17)
| # | Archivo · mutación | Resultado | Test que la mata |
|---|---|---|---|
| M01 | `secrets.ts` · `length < effectiveMin` → `< 1` | muerta (8) | `missing / placeholder / too_short / null` |
| M02 | `secrets.ts` · quitar `isPlaceholderCredential` | muerta (16) | ídem |
| M03 | `secrets.ts` · permitir `min <= 0` | muerta (1) | `un min <= 0 no desactiva la comprobación` |
| M04 | `providerCatalog.ts` · quitar `'changeme'` de `PLACEHOLDER_WORDS` | **sobrevive — equivalente** (`PLACEHOLDER_PREFIXES` tiene `changeme`) | — |
| M05 | `providerCatalog.ts` · quitar `includes('your-') && < 48` | muerta (1) | `todos los valores secretos de .env.example son relleno` |
| M06 | `webhookSignatures.ts` · `!isRealSecret(appSecret)` → `!appSecret` | muerta (6) | P3 / relleno Meta |
| M07 | `webhookSignatures.ts` · `process.env.CRON_SECRET \|\| requireRealSecret` | muerta (6) | `CRON_SECRET de relleno o corto → 401` |
| M08 | `webhookSignatures.ts` · Resend sin `assertRealSecret` | muerta (1) | `whsec_your-webhook-secret → 401 antes de svix` |
| M09 | `wsSessionToken.ts` · quitar tope `MAX_TTL` | muerta (1) | `ttl 1 año → null (tope)` |
| M10 | `wsSessionToken.ts` · `orgId <= 0` → `< 0` | muerta (1) | `orgId 0 / -1 → null` |
| M11 | `wsSessionToken.ts` · mínimo 32 → 16 | **sobrevivía** → muerta (4) con `testerR2.f0sec.test.ts` | `secreto real de 16/24/31 caracteres → …` |
| M12 | `rateLimit.ts` · `windowMs <= 0` → `< 0` | muerta (1) | `windowMs 0 → bloquea al segundo hit` |
| M13 | `webhookSignatures.ts` · `realSubaccountToken` sin `isRealSecret` | muerta (1) | `resolveTwilioAuthToken: … subcuenta de relleno/corto → null` |
| M14 | `webhookAuthorization.ts` · `union.size > 1` → `> 2` | muerta (6) | `ATAQUE: entry[0] de A + entry[1] de B → 403 mixed_channels` |
| M15 | `webhookAuthorization.ts` · no descartar (`kept = resolutions`) | muerta (3) | `A + número desconocido → … DESCARTADA` |
| M16 | `route.ts` · `if (!signature)` → `if (false)` | **sobrevivía** → muerta (1) con `sin X-Hub-Signature-256 → 403 ANTES de consultar` | — |
| M17 | `route.ts` · `readRealSecret('META_APP_SECRET', alias)` → `process.env.META_APP_SECRET` | **sobrevivía** (el relleno lo rechaza igualmente `isRealSecret(globalSecret)` en el plan; lo que faltaba era el alias `WHATSAPP_APP_SECRET`) → muerta (1) con el test del alias | `WHATSAPP_APP_SECRET (alias legacy) vale como secreto global` |
