# F0-SEC — sub-partes A + B: webhook de WhatsApp por cambio, asistente de reportes con sesión y detector de relleno — constructor, ronda 3

Fecha: 2026-09-15. Insumos: `rondas/F0-SEC-AB-tester-r2.md` (fallos 1-6, anexo A),
`docs/HANDOFF-2026-09-15.md` §1 (fila «Builder F0-SEC-AB r3»: ronda interrumpida a medias y
**reanudada** aquí; se inspeccionó lo que ya estaba en el árbol y se completó, sin rehacer).
Sin cambios en la base de datos (la migración `20260915223000_crm_v4_f00_40_cerrar_rpc_crm_anon`
sigue **pendiente, no aplicada**), sin credenciales reales, sin commits. Organizaciones de los
tests ficticias (7, 8, 9). Sin tocar `orgContext.ts` ni rutas de F10–F13.

## Qué se hizo en esta ronda

### 1. Webhook de WhatsApp: autorización POR CAMBIO, no por entrada (cierra H1 y H2)
`src/lib/services/integrations/whatsapp/webhookAuthorization.ts`
- La unidad de resolución y de descarte pasa de `entry` a `entry[*].changes[*]`. Cada
  `change` se resuelve por su `phone_number_id` o, si no lo trae, por el WABA `entry.id`;
  con ámbito `channel`, los cambios que no resuelven al secreto firmante se **descartan uno a
  uno** (regla 3) aunque compartan entrada con cambios legítimos. Una entrada que se queda sin
  cambios se descarta entera. Motivos tipados: `malformed_change`, `invalid_phone_number_id`,
  `unknown_phone_number`, `missing_waba`, `unknown_waba` (`plan.droppedChanges`).
- **`normalizeMetaId(raw)`** (exportada): string no vacío → recortado; entero seguro no
  negativo → su decimal (exactamente lo que PostgREST interpolaría en `eq.<valor>`); todo lo
  demás (`1.5`, `-1`, `2^53`, objeto, booleano, bigint…) → `null`. Un `123` numérico ahora
  **se consulta** como `"123"` y cuenta para el ámbito (así `{pn-a, 123 (B)}` → 403
  `mixed_channels`); un tipo inutilizable no se consulta y la `change` se descarta. Las
  entradas que devuelve el plan ya llevan `id` y `phone_number_id` normalizados a string.
- `src/app/api/integrations/whatsapp/webhook/route.ts`: el aviso de descarte es por cambio y
  registra `droppedChanges` + `droppedEntryIndexes` (un intento de inyección entre
  organizaciones queda en el log).

### 2. Segunda línea de defensa en el procesamiento
`src/lib/services/integrations/whatsapp/whatsappCloudService.ts` y
`src/lib/services/crm/whatsapp/webhookTemplateStatus.ts`
- `processWebhookPayload` normaliza `entry.id` y `phone_number_id` con la **misma**
  `normalizeMetaId`: plan y procesamiento nunca discrepan sobre qué canal es.
- `applyTemplateStatusUpdate(update, wabaId, service, organizationIds)` — **4.º argumento
  nuevo y obligatorio**: la búsqueda por `meta_template_id` (y por nombre) se restringe
  siempre con `.in('organization_id', orgIds)`; sin organizaciones válidas no consulta nada
  (fail-closed). El servicio resuelve las organizaciones dueñas del WABA de la entrada
  (`findChannelsByBusinessAccountId`, una vez por entrada) y, si no hay ninguna, descarta la
  actualización con aviso. Una plantilla de B con la firma de A ya no se pausa.

### 3. Asistente de reportes con el cliente de SESIÓN (cierra el fallo 3 antes de aplicar B)
`src/app/api/ai-assistant/reportes/route.ts`, `reportAgentService.ts`, `reportesEngine.ts`,
`types.ts` y los **19** módulos de `src/lib/services/reportes/modulos/`
- `ReportDefinition.fetch(orgId, periodo, branchId?, client?: ReportesClient)`; cada `fetch`
  hace `const db = client ?? browserSupabase`. La página `app/reportes` (navegador, con
  sesión) no cambia; el route handler pasa `ctx.supabase` de `getServerOrgContext()` así que
  `fn_reporte_crm_*` corre como `authenticated` miembro, nunca como `anon` ni service role
  (las `fn_reporte_*` rechazan al service role a propósito: C07 del dry-run).
- Test `reportes/__tests__/reportesSessionClient.f0secR3.test.ts`: la ruta entrega el cliente
  de sesión, la RPC corre con la organización de la sesión (no la del body), el cliente
  browser no se toca, y un guardarraíl estático exige que los 19 módulos acepten `client` y
  ninguno use `supabase` a pelo dentro de `fetch`.
- `catch (error: any)` → `unknown` con `instanceof Error` (archivo tocado, lint limpio).

### 4. Detector de relleno (huecos 4 y 5) y aviso de alias (sonda)
`src/lib/crm/providerCatalog.ts`, `src/lib/security/secrets.ts`
- Hueco 4: `isFillerCredential` quita `=`/`==` finales antes de comprobar uniformidad:
  `AAAA…A=` (base64 de 32 ceros) → relleno; `verifyCronSecret` con ese valor ya lanza.
- Hueco 5: `PLACEHOLDER_ANYWHERE` (`changeme`, `replace-me`, `cambia-esto`… en cualquier
  posición: `1234changeme5678` → relleno) y `PLACEHOLDER_WORDS_ONLY` (valor compuesto SOLO
  por palabras de relleno pegadas o separadas por `-_.`: `undefinedundefined`,
  `undefined-undefined`, `null_null`, `testtesttesttest` → relleno). `sk_test_…` sigue
  valiendo (el prefijo de proveedor se quita antes).
- `readRealSecret`: si la principal es relleno/corta y se usa un alias, avisa **una vez** por
  proceso (`reportAliasOnce`), sin imprimir el valor; principal ausente + alias → sin aviso.
- Decisiones conservadas con test: `abc-your-…` ≥ 48 chars se acepta; `abcdefgh-todo-1234567`
  se rechaza (falso positivo conservador); `min: Infinity` cae al default 16.

### 5. Tests (lo que faltaba al interrumpirse la ronda)
- **Deuda del handoff**: `src/lib/services/crm/whatsapp/__tests__/webhookTemplateStatus.test.ts`
  actualizado a la firma de 4 argumentos; comprueba además que el `select` lleva
  `.in('organization_id', [7])` y añade el caso «sin organizaciones → 0 consultas».
- `src/lib/security/__tests__/builderR3.f0sec.test.ts` (23 casos): huecos 4 y 5 y el aviso de
  alias. Corregida una aserción que contradecía la propia regla (`testtesttesttest` es solo
  relleno repetido: mismo trato que `changemechangeme`).
- `src/lib/services/integrations/whatsapp/__tests__/webhookProcessing.f0secR3.test.ts`
  (26 casos): H2 en el servicio (WABA conocido → organizaciones del WABA sin duplicados;
  desconocido/sin id/tipo inválido → ni se llama a `applyTemplateStatusUpdate`; numérico se
  consulta como string y una sola vez), H1 en el servicio (número → string; objeto/booleano →
  no se consulta) y tabla de 21 casos de `normalizeMetaId`.
- Los `test.failing` del tester r2 (H1 ×2, H2 ×2, hueco 4, coerción ×2) están convertidos en
  `test` y en verde: `webhook/__tests__/testerR2.f0sec.test.ts`,
  `whatsapp/__tests__/webhookCoercion.testerR2.test.ts`, `security/__tests__/testerR2.f0sec.test.ts`.
- `webhook/__tests__/multiOrg.f0sec.test.ts`: el aviso pasa a `droppedChanges` por cambio.

## Feedback de la ronda anterior que se atendió
- [crítico] H1 `phone_number_id` numérico → `normalizeMetaId` compartida por plan y
  procesamiento; el número se consulta como string y cuenta para el ámbito; tipos raros se
  descartan por `change`. Tests: testerR2 (ruta y servicio) + `webhookProcessing.f0secR3`.
- [alto] H2 plantilla de B en la entrada de A → descarte por `change` en el plan y
  `applyTemplateStatusUpdate` restringida a las organizaciones del WABA firmante (fail-closed).
- [alto] Fallo 3, `POST /api/ai-assistant/reportes` como `anon` → cliente de sesión inyectado
  hasta `fetch` en los 19 módulos; guardarraíl estático. **La migración B se puede aplicar en
  el mismo despliegue que este cambio** sin romper el asistente.
- [bajo] Hueco 4 base64 con `=` → cerrado. [bajo] Hueco 5 → cerrado en sus casos
  «compuesto solo de relleno» y «marca en cualquier posición»; los dos bordes que se conservan
  quedan documentados con test. Alias: ahora se avisa.
- [bajo] Hueco 6 (M11, M16) ya lo cerró el tester con tests; sin cambios de código.

## Decisiones de diseño relevantes
- Por cambio y no por entrada porque `processWebhookPayload` itera `changes[*]`: la unidad de
  autorización tiene que coincidir con la unidad de procesamiento, o el filtro es cosmético.
- Una sola función de normalización de ids, exportada y usada en los dos sitios: evita que el
  plan y PostgREST «vean» valores distintos (raíz de H1).
- Bajo ámbito `global` se conserva todo lo que tenga forma de cambio (el procesamiento ya
  ignora números desconocidos y ahora también WABAs sin canal): no hay organización dueña del
  secreto a la que proteger de sus propias inyecciones.
- `applyTemplateStatusUpdate` exige organizaciones explícitas en vez de confiar en la unicidad
  de `meta_template_id`: es la regla dura 5 aplicada a un webhook.
- Los reportes reciben el cliente por parámetro (opcional, con fallback al browser) en vez de
  detectar el entorno: la página cliente no cambia y el servidor nunca puede olvidarse
  «en silencio» porque el test estático lo vigila.

## Verificación
- `npx jest src/lib/security src/app/api/integrations/whatsapp src/lib/services/integrations/whatsapp src/lib/services/crm/whatsapp src/app/api/ai-assistant src/__tests__/guardrails.test.ts`
  → `TZ=UTC`: **31 suites, 591 tests, todos verdes**; `TZ=America/Bogota`: **31 suites, 591
  tests, todos verdes** (guardrails incluido, sin editarlo).
- `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json` → 5 errores en el
  árbol, **0** en `security/|whatsapp|ai-assistant/reportes|crmReports|reportes/` (los 5 son
  los mismos ajenos que vio el tester r2: `FormularioEdicionProducto.tsx`,
  `f13Round3Tester.test.ts`, `deliveryIntegrationService.ts`). El TS2554 de la deuda ya no está.
- `npx eslint` limpio en los archivos tocados en esta reanudación.

## Pendientes que dejo explícitamente para revisión
- La migración B sigue sin aplicar: ahora sí se puede aplicar junto con este despliegue.
  Requiere la autorización habitual (MCP) y no la hago desde el constructor.
- `wsSessionToken`, `rateLimit.ts`/`rateLimitStore.ts`, `organizationBody.ts` y las rutas
  `api/crm/whatsapp/**` que aparecen modificadas en el árbol son obra de F0-SEC-CD (otro
  agente), no de esta ronda; solo se verificó que compilan y pasan con el resto.
- `orgId = 2^53+2` en `wsSessionToken` (anotado por el tester, sin impacto) no se tocó: el
  archivo está en manos de F0-SEC-CD.
- `commercialMetricsService.ts` sigue usando el cliente browser; su único consumidor es
  `MetricasView.tsx` (componente cliente), así que no le afecta la migración B. Si algún día
  se llama desde servidor, necesitará el mismo tratamiento que los reportes.
