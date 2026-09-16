# F0-REG — QA reviewer — Ronda 1 (2026-09-15)

Fase: F0-REG — Registry de proveedores, credenciales server-only, pricing/aiCost,
configuración (Proveedores e IA, Créditos), navegación CRM, deps npm, `.env.example`.
Insumos: `docs/crm-revenue-os/rondas/F0-REG-tester-r1.md` (6/10; 155 casos, 129 pasan),
`PROGRESS.md` «Fase: F0-REG — Ronda 1 — 2026-09-08», `FASE-00-FUNDACIONES.md`
§2.4, §4.1-4.2, §5, §8, §13.3, y lectura directa del código de REG. Verificaciones
propias en BD (solo `SELECT`, MCP, proyecto `jgmgphmzusbluqhuqihj`) el 2026-09-15.

Suites relanzadas por el QA: `providerRegistry`, `providerConfigContract.tester`,
`aiCostService`, `pricingService`, `f0RegTester.r1` → 121/121 verdes (9 `it.failing`
documentan huecos: seguirán verdes hasta que el builder los cierre; entonces hay que
pasarlos a `it`).

## Calificación: 6/10

| Dimensión (2 pts c/u) | Puntos | Justificación |
|---|---|---|
| 1. Funcionalidad completa | 1,4 | Registry, catálogo, placeholders, endpoints, UI y nav cumplen §4.1/§5. Faltan: `cost_amount` en columna (DB ya la entregó), presupuesto que bloquee (§8), `valid_to` en pricing, validación de `settings` contra `SETTING_FIELDS`. |
| 2. Robustez | 1,0 | NaN deja una org ilimitada; 27/49 orgs con CRM reciben 500 en vez de 402; reembolso no idempotente; `GET /credits` trunca a 5 000 filas sin avisar; rate-limit por instancia. |
| 3. Consistencia | 1,2 | Reglas de fechas incumplidas (dos sitios), `isOrgAdmin` por nombre de rol, segundo punto de cobro vivo (`withAICreditsCheck`), lógica de vigencia duplicada frente a `fn_unit_cost`. |
| 4. Resultados del tester | 1,0 | 129/155. Dos críticos de seguridad confirmados en BD por el QA (ver abajo) → tope 6/10. |
| 5. Documentación/trazabilidad | 1,5 | §13.3 y la entrada de PROGRESS son precisas y útiles. Comentarios ya obsoletos en código («sin valid_to», «no tienen cost_amount») y la cabecera de `aiCostService.ts` sigue diciendo que persiste en `metadata`. |

Suma 6,1 → **6/10 por el tope de un bug crítico de seguridad** (rubric, dimensión 4).

### Verificaciones propias del QA (BD, 2026-09-15)

- `ai_settings`: `anon` y `authenticated` tienen **todos** los privilegios de tabla
  (`SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER`). Políticas:
  `"Members can manage AI settings"` es `FOR ALL` a `{public}` con qual «es miembro».
  Confirmado el crítico 1 del tester: un miembro no admin puede hacer
  `update ai_settings set credits_remaining = 999999` desde el navegador.
- `ai_usage_logs`: mismos grants totales a `anon`/`authenticated`; política
  `"Service role can insert AI usage logs"` = `INSERT` a `{public}` con `with_check = true`.
  Confirmado el crítico 2 del tester. **Lo cierra el builder de F0-DB ronda 3**
  (`crm_v4_f00_36_usage_logs_call_recordings_rls`, ya en curso): REG no debe duplicarlo.
- `decrement_ai_credits(p_org_id, p_cost)`: `IF v_remaining < p_cost THEN RETURN false`
  sin guarda de `NULL`/negativo; `IF NOT FOUND THEN RAISE EXCEPTION`. Confirmados los
  altos 3 y 4: 49 orgs con CRM activo, **27 sin fila en `ai_settings`**;
  `credits_remaining` es `NULL`-able (hoy 0 filas NULL).
- `refund_ai_credits`: tiene la guarda «si el saldo ya supera el techo no se recorta»,
  pero el caso del tester (saldo 503, techo 500, cobro 10 → 493, reembolso 10 →
  `LEAST(503, 500)` = 500) sigue perdiendo 3 créditos: la guarda mira el saldo
  *después* del cobro, no el saldo *antes*.
- `ai_usage_logs.cost_amount`: 1 705 filas con la columna rellena (Edge Function del
  chat) y 10 con `metadata.cost_amount` (CRM). `comm_usage_logs.cost_amount` existe.
  `provider_pricing.valid_to` existe. Confirmados los altos 5 y el medio 11.
- Escritores legítimos de `ai_settings` desde el navegador que una migración ciega
  rompería: `src/lib/services/aiSettingsService.ts` (`@/lib/supabase/config`,
  `createSettings`/`updateSettings`/`toggleAI`) usado por
  `src/app/app/chat/ia/configuracion/page.tsx` y `src/components/chat/ia/configuracion/*`.
  Solo tocan columnas de comportamiento (`provider`, `model`, `temperature`, `is_active`,
  …), nunca el saldo. Por eso el cierre debe ser **por columna**, no por tabla.

### Fortalezas

- Credenciales server-only bien resueltas: `providerCredentials.server.ts` es el único
  lector de `provider_configs.credentials`, con `assertServerOnly()`; en BD
  `authenticated` no tiene grant sobre la columna; `GET /providers` devuelve solo
  `credential_keys`; el formulario nunca rellena valores. Cumple §2.4 salvo Vault (M6,
  decisión pendiente de DB, documentada).
- Orden de cobro correcto en `aiCostService.withAiCharge`: RPC → proveedor → reembolso
  con `refund_ai_credits`; el reembolso rechazado deja rastro (`:refund_failed` con
  `pending_refund_credits`). El comentario explica el porqué (tester F4 r3).
- Catálogo isomórfico sin env (`providerCatalog.ts`), detección de placeholders que no
  confunde claves reales, 22 valores de `.env.example` reconocidos como relleno.
- Rutas: org siempre de `getServerOrgContext()`; zod en body; 422 para proveedor/clave
  fuera de catálogo; `test` sanea secretos del detalle.
- Navegación desde una única constante (`crmNav.ts`) y gating por `organization_modules`;
  sin listas cableadas de módulos. Sin placeholders «próximamente».
- Cobertura: 121 tests en 5 suites, 22 nuevos del tester con `it.failing` que
  avisarán al cerrar cada hueco.

### Problemas encontrados (ordenados por severidad)

1. **[crítico] Saldo de IA editable por cualquier miembro desde el navegador**
   (`ai_settings`: grant `UPDATE` de tabla + política `FOR ALL` por pertenencia).
   Cierre: migración propia **`crm_v4_f00_38_ai_settings_solo_rpc`** con rollback,
   **sin aplicar** (la aplica el orquestador tras mostrarla al dueño). Ver instrucción 1.
2. **[crítico] `ai_usage_logs` acepta `INSERT` de `anon`/`authenticated` para cualquier
   org y `GET /credits` suma `metadata.cost_amount` sin filtrar.** La migración la
   escribe F0-DB r3; REG **consume** ese cierre y además deja de depender de
   `metadata.cost_amount` (instrucción 3). No duplicar el SQL.
3. **[alto] NaN → `p_cost = null` → `credits_remaining = NULL` = ilimitado.**
   `chargeAiCredits` hace `Math.round(NaN)`; `consumeAICredits` y `chargeCommCredits`
   igual. Falta `Number.isFinite` en las tres y la guarda en la RPC.
4. **[alto] 27 orgs con CRM sin fila en `ai_settings` → 500 en vez de 402.**
   `checkAICredits` (legacy) auto-provisiona con el cupo del plan; `chargeAiCredits` no.
5. **[alto] `cost_amount` existe en BD y REG no la escribe ni la lee.** Dos fuentes de
   verdad; el panel reporta 0 USD para las orgs que usan auto-respuesta. Los comentarios
   de `aiCostService.ts` (cabecera) y `pricingService.ts:83` ya son falsos.
6. **[alto] `withAICreditsCheck` (`aiCreditsService.ts`) sigue cobrando después del
   proveedor, sin comprobar importe y con `console.warn` si el RPC devuelve `false`.**
   12 llamadores (`api/ai-assistant/*`, `api/chat/ai/*`, `reportAgentService`). Es un
   segundo punto de cobro (CLAUDE.md: punto único en `chargeAiCredits`/`refundAiCredits`).
7. **[alto, fuera del código de REG] `channel_credentials` llega al navegador**
   (`facebookChannelService.ts:159`, `instagramChannelService.ts:160`,
   `whatsappChannelService.ts:190`, `integrationsService.ts:801`). Contradice §2.4.
   No lo cierra REG: registrarlo en `FASE-00` §11 como riesgo aceptado o pasarlo a SEC.
8. **[medio] `getProviderCredentials` devuelve el fallback env del primer proveedor por
   `priority` aunque otro proveedor de la misma categoría tenga clave propia de la org.**
   §2.4: «fila propia de la org → fallback env».
9. **[medio] `settings` no se validan contra `SETTING_FIELDS`** (`z.record(z.unknown())`,
   sin límite de tamaño); un modelo inventado se guarda y falla después en el proveedor.
10. **[medio] `refundAiCredits` no es idempotente por `logId`** (reintento tras timeout =
    doble abono) y `refund_ai_credits` recorta al techo mirando el saldo posterior al cobro.
11. **[medio] `GET /credits` trae hasta 5 000 filas por tabla y agrega en Node.** Hallazgo
    propio: una org con auto-respuesta activa supera 5 000 filas/mes y el total queda
    truncado en silencio. Agregar en SQL (RPC `fn_ai_usage_month(p_org, p_since)` o
    vista) en vez de paginar en memoria.
12. **[medio] Fechas:** `pricingService.ts:70` `toISOString().slice(0, 10)` (patrón
    prohibido), `credits/route.ts:90` `created_at.slice(0, 10)` sobre `timestamptz`
    (regla 2) y el inicio de mes en UTC en vez del timezone de la org (reglas 3 y 6).
13. **[medio] `monthly_budget_usd` no bloquea nada** (§8: aviso 80 %, bloqueo 100 %,
    `JobFatalError('budget_exceeded')`). Hoy solo hay aviso en `CreditosTab`.
14. **[medio] `POST /providers/test` con `source: 'env'` revela datos de la cuenta de la
    plataforma** (friendlyName/status de Twilio, nº de dominios Resend, plan y consumo
    ElevenLabs, `verified_name` Meta) a un admin de tenant. Rate-limit por instancia.
15. **[medio] `isOrgAdmin` resuelve por nombre de rol** (`rbac.ts:7`; regla 6).
    Preexistente, pero es la única guarda de PUT y test.
16. **[medio] `pricingService` ignora `valid_to`** y duplica la regla de vigencia de
    `fn_unit_cost` (regla 7). Hoy 0 filas con `valid_to`: riesgo latente.
17. **[bajo] `GET /providers` siembra `provider_configs` como efecto lateral** para
    cualquier miembro. Un GET no debería escribir.
18. **[bajo] Bordes:** `isPlaceholderCredential('0000')`/`'xxxx'` pasan como reales;
    un error transitorio de BD en `getUnitCost` se cachea 5 min como `null`;
    `by_model.calls` cuenta las filas `:refund_failed` (`credits_consumed = 0`) como llamadas.

### Instrucciones para el builder (prioridad = orden)

**1. Migración `crm_v4_f00_38_ai_settings_solo_rpc` — escribir, NO aplicar.**
Archivos: `supabase/migrations/2026091XHHMMSS_crm_v4_f00_38_ai_settings_solo_rpc.sql` y
`supabase/rollbacks/…_rollback.sql` (mismo commit; sin credenciales ni nombres de
clientes). Contenido:
- `revoke all on public.ai_settings from anon;`
- `revoke insert, update, delete, truncate, references, trigger on public.ai_settings from authenticated;`
- `grant insert (organization_id, provider, model, temperature, max_tokens, system_rules,
  tone, language, fallback_message, auto_response_enabled, auto_response_delay_seconds,
  confidence_threshold, max_fragments_context, is_active, metadata,
  hybrid_agent_pause_minutes, hybrid_respect_business_hours, reply_fallback_on_no_credits,
  max_respuestas_ia_por_conversacion_dia, vertical, updated_at) on public.ai_settings to authenticated;`
- `grant update (misma lista sin organization_id) on public.ai_settings to authenticated;`
- Las columnas de saldo (`credits_remaining`, `purchased_credits`, `credits_reset_at`,
  `purchased_credits_expires_at`, `last_rollover_amount`) quedan **solo** para
  `service_role` y las RPC `SECURITY DEFINER` (`decrement_ai_credits`,
  `refund_ai_credits`, `stripe/webhook`, `checkAICredits`, todas con service role: verificado).
- Política: sustituir `"Members can manage AI settings"` (`FOR ALL`) por
  `ai_settings_select` (`for select to authenticated using (organization_id in (select
  organization_id from organization_members where user_id = (select auth.uid()) and is_active))`)
  y `ai_settings_write` (`for insert/update to authenticated` con la misma pertenencia).
  Si el dueño quiere que la configuración del chat IA sea solo de administradores,
  se decide al mostrar la migración; no lo asumas.
- Rollback: `grant all on public.ai_settings to anon, authenticated;` + recrear la
  política `FOR ALL` original (texto exacto en `pg_policies`).
- Comprobación (SELECT, MCP): `has_column_privilege('authenticated','public.ai_settings','credits_remaining','UPDATE')`
  = false; `…('model','UPDATE')` = true; `has_table_privilege('anon','public.ai_settings','SELECT')`
  = false; `pg_policies` de `ai_settings` sin `cmd = ALL` para `{public}`. Y en la app:
  `/app/chat/ia/configuracion` sigue guardando modelo/temperatura (usa columnas permitidas).

**2. Guardas de importe (código + RPC).**
- `src/lib/services/crm/aiCostService.ts` `chargeAiCredits`/`chargeCommCredits` y
  `src/lib/services/aiCreditsService.ts` `consumeAICredits`: si `!Number.isFinite(credits)`
  o `credits < 0` → `throw new RangeError('importe inválido')` **antes** del RPC (nunca
  `p_cost: null`). Pasar a `it` el `it.failing` «units NaN».
- Migración `crm_v4_f00_39_decrement_ai_credits_guardas` (sin aplicar, con rollback):
  `CREATE OR REPLACE` de `decrement_ai_credits` conservando firma/SECDEF/`search_path`/ACL:
  `IF p_cost IS NULL OR p_cost < 0 THEN RETURN false; END IF;` y
  `IF NOT FOUND THEN RETURN false;` (402, no excepción). Comprobación:
  `select decrement_ai_credits(<org de prueba>, null)` = false;
  `select credits_remaining is not null from ai_settings where organization_id = <org>`.

**3. Auto-provisión y `cost_amount` real.**
- Extraer de `checkAICredits` la creación de la fila (`getAIFeaturesForOrganization` +
  insert) a `ensureAiSettings(orgId)` exportada de `aiCreditsService.ts`, y llamarla en
  `chargeAiCredits` cuando el RPC devuelva `false` **y** no exista fila (una sola
  consulta `maybeSingle` sobre `ai_settings`), reintentando el RPC una vez. Sin fila y
  sin cupo → `InsufficientCreditsError` (402). Pasar a `it` «org sin fila ai_settings».
- `chargeAiCredits`, `refundAiCredits`, `recordFailedRefund`, `chargeCommCredits`:
  escribir `cost_amount` en la **columna** (mantener `metadata.cost_amount` una ronda
  por compatibilidad del panel). `GET /credits`: `coalesce(cost_amount, (metadata->>'cost_amount')::numeric)`.
  Pasar a `it` «columna real ai_usage_logs.cost_amount». Actualizar la cabecera de
  `aiCostService.ts` y el comentario de `pricingService.ts:83`.
- Consumir la migración de F0-DB r3 (`crm_v4_f00_36…`): tras aplicarla, relanzar
  `aiCostService.test.ts` y una transcripción real para confirmar que los inserts con
  service role siguen entrando. No escribir SQL para `ai_usage_logs`.

**4. Un solo punto de cobro.** `aiCreditsService.withAICreditsCheck(orgId, estimated, fn)`
pasa a delegar en `withAiCharge({orgId, actionType, model, credits: estimated}, fn)`
(cobro antes, reembolso en fallo, 402 tipado). Mantener la firma para no tocar los 12
llamadores en esta ronda; marcar `@deprecated` y añadir al guardrail
(`src/__tests__/guardrails.test.ts`) que ningún archivo nuevo importe `consumeAICredits`
directamente. Comprobación: `npx jest src/__tests__/guardrails.test.ts` y
`src/__tests__/services/goAssistantF0.test.ts` verdes.

**5. `GET /credits` agregando en SQL y con fechas correctas.**
RPC `fn_ai_usage_month(p_org integer, p_since timestamptz)` (SECDEF, EXECUTE solo
`service_role`) que devuelva `by_model`, `by_day` (día calculado con
`(created_at at time zone p_tz)::date`, `p_tz` desde `getOrganizationTimezone(orgId)`)
y totales con `coalesce(cost_amount, …)`; misma para `comm_usage_logs`. Inicio de mes con
`todayInTz`/`toPlainDate` de `src/lib/utils/dateDisplay.ts`, nunca `setUTCDate(1)`.
`pricingService.todayIso()` → `todayInTz('UTC')` o, mejor, pasar `now()` a la BD y
filtrar `valid_from <= now() and (valid_to is null or valid_to >= now())` (cierra el
punto 16 y elimina la duplicación con `fn_unit_cost`). Pasar a `it` «valid_to».
Comprobación: `npm run test:tz-all` verde; `by_day` de una org en Bogotá no desplaza días.

**6. Reembolso idempotente y sin pérdida.** `refundAiCredits`: si viene `logId`,
`select id from ai_usage_logs where organization_id = $org and metadata->>'refunded_log_id' = $logId and action_type like '%:refund'` → si existe, devolver `true` sin abonar.
Y en `crm_v4_f00_39` (misma migración del punto 2) `refund_ai_credits` con
`p_previous integer default null`: si el saldo previo al cobro superaba el techo, no
recortar por debajo de `LEAST(p_previous, v_target)`. Pasar a `it` «dos reembolsos del mismo logId».

**7. Prioridad org > env entre proveedores.** `getProviderCredentials`: primera pasada
sobre las filas activas buscando `source: 'org'`; solo si ninguna tiene credenciales
propias, segunda pasada con fallback env por `priority`. Pasar a `it` «prioridad entre proveedores».

**8. Validar `settings`.** En `upsertProviderConfig`, antes del merge: cada clave debe
existir en `SETTING_FIELDS['${category}:${provider}']`; `select` → valor en `options`;
`number` → `Number.isFinite` y dentro de `[min, max]`; `boolean` → booleano; texto ≤ 500
chars; claves desconocidas → 422. Límite del JSON: ≤ 4 KB. Pasar a `it` los dos
`it.failing` de settings.

**9. `POST /providers/test`.** Con `cfg.source === 'env'` responder
`{ ok, source: 'env', latencyMs }` sin `detail` de la cuenta. Rate-limit con
`checkRateLimit` de `src/lib/security/rateLimit.ts` inyectando `persistentCount` (o
documentar en §11 que es por instancia hasta que exista almacén compartido).

**10. Presupuesto (§8).** En `chargeAiCredits`, si `getProviderSettings(orgId,'llm').settings.monthly_budget_usd`
existe: sumar `cost_amount` del mes (RPC del punto 5) y, si `spent + estimado > presupuesto`,
lanzar `BudgetExceededError` (402, `code: 'budget_exceeded'`); el runner de jobs la
mapea a `JobFatalError('budget_exceeded')`. Test nuevo en `aiCostService.test.ts`.

**11. `isOrgAdmin` sin nombre de rol.** `rbac.ts`: quedarse con `ORG_ADMIN_ROLE_IDS`
y `ctx.isSuperAdmin`; eliminar `ORG_ADMIN_ROLE_NAMES`. Verificar con
`select id, name from roles where id in (1,2)` que los ids siguen siendo los de admin.

**12. Menores.** `GET /providers`: siembra solo si `isOrgAdmin(ctx)`, el resto ve filas
virtuales. `isPlaceholderCredential`: rachas de un solo carácter repetido de ≥ 4 chars
= placeholder. `getUnitCost`: no cachear cuando `error` (dejar `value` sin `cache.set`).
`by_model.calls`: contar solo `credits_consumed > 0`. Registrar el punto 7
(`channel_credentials` en navegador) en `FASE-00` §11 con decisión explícita.

**Al cerrar la ronda:** pasar todos los `it.failing` resueltos a `it`; `npx jest`,
`NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json`,
`npx next build`; nueva entrada en `PROGRESS.md` (añadir, no reescribir) y actualizar
§13.3 con los archivos y migraciones reales (38, 39 sin aplicar hasta que el orquestador
las muestre al dueño).

### Qué falta para el 10 (además de lo anterior)

- Vault (M6) para `provider_configs.credentials` o decisión documentada de no usarlo.
- Prueba de concurrencia real de `decrement_ai_credits` (dos transacciones) y del
  flujo en navegador con sesión (el tester no lo ejecutó).
- `refundCommCredits` en `aiCostService` para que `voice/ai-agent/status` deje de
  reimplementar el reembolso con importe negativo en `deduct_comm_credits`.
- Auditoría de saldo: tabla o vista que reconcilie `credits_remaining` con la suma de
  `ai_usage_logs.credits_consumed` desde el último reset, para detectar deriva.

### Veredicto

requiere-nueva-ronda
