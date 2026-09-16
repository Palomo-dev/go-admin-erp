# F0-REG — Tester — Ronda 1 (2026-09-15)

Fase: F0-REG — Registry de proveedores, credenciales server-only, pricing/aiCost,
configuración (Proveedores e IA, Créditos), navegación CRM, deps npm, `.env.example`.
Contexto: `PROGRESS.md` «Fase: F0-REG — Ronda 1 — 2026-09-08»,
`FASE-00-FUNDACIONES.md` §2.4, §4.1-4.2, §5, §8, §13.3.

Alcance verificado en código: `src/lib/crm/providerCatalog.ts`,
`src/lib/services/providerRegistry.ts`, `src/lib/services/providerCredentials.server.ts`,
`src/lib/services/crm/pricingService.ts`, `src/lib/services/crm/aiCostService.ts`,
`src/lib/services/aiCreditsService.ts`, `src/app/api/crm/config/{providers,providers/test,credits}/route.ts`,
`src/components/configuracion/crm/{ProveedoresTab,ProviderCard,ProviderCredentialForm,CreditosTab}.tsx`,
`src/components/configuracion/crm/useProviderConfigs.ts`, `src/components/configuracion/panels/crm/CrmConfigTabs.tsx`,
`src/config/crmNav.ts`, `.env.example`, `package.json`. BD (solo lectura, MCP, proyecto
`jgmgphmzusbluqhuqihj`): RPCs, columnas, políticas RLS y grants de las tablas implicadas.

Suite nueva dejada en el repo: `src/lib/services/__tests__/f0RegTester.r1.test.ts`
(22 casos; 9 son `it.failing` que documentan huecos abiertos: pasan mientras el hueco
exista y fallarán cuando alguien lo corrija).

## Resumen de pruebas

- Casos ejecutados: 155 (121 automatizados en 5 suites + 34 verificaciones manuales/BD)
- Pasaron: 129 (121 verdes en jest, de los que 9 son `it.failing` = hueco confirmado; 17 manuales OK)
- Fallaron: 26 verificaciones → 17 fallos distintos (2 críticos, 6 altos, 7 medios, 2 bajos)

Comandos:

```
npx jest src/lib/services/__tests__/providerRegistry.test.ts \
         src/lib/services/__tests__/providerConfigContract.tester.test.ts \
         src/lib/services/__tests__/aiCostService.test.ts \
         src/lib/services/__tests__/pricingService.test.ts \
         src/lib/services/__tests__/f0RegTester.r1.test.ts      → 121/121
npx jest src/__tests__/guardrails.test.ts                        → 66/67 (1 rojo AJENO: `src/app/app/inicio/page.tsx` modificado en el árbol, no F0-REG)
NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit         → 3 errores, ninguno en archivos de F0-REG
```

Nota: `src/lib/services/crm/__tests__/f10ProviderReadiness.test.ts` (F10, sin trackear)
tiene 1 rojo (`pk_test_…` aceptado como clave de Stripe). Usa `isPlaceholderCredential`
del catálogo pero el fallo es de la regex de prefijo de F10, no del catálogo.

### Lo que SÍ está bien (evidencia)

- **Credenciales server-only (parte 1)**: los 14 importadores de
  `providerCredentials.server` son rutas API o servicios sin `'use client'`. Ningún
  componente cliente ni `@/lib/supabase/config` lee `provider_configs.credentials`.
  En BD, `authenticated` solo tiene grant de columna sobre
  `provider_configs.{id,organization_id,category,provider,settings,is_active,priority,created_at,updated_at}`
  — la columna `credentials` NO tiene grant → aunque un cliente hiciera `select('*')`
  Postgres lo rechaza. `v_provider_configs_safe` sin `credentials`. `GET /api/crm/config/providers`
  devuelve `credential_keys` (nombres) y nunca valores; el formulario usa `type=password`
  y no rellena valores existentes.
- **Placeholders**: los 22 valores de ejemplo de `.env.example` para las claves del registry
  se detectan como placeholder; con `.env.example` cargado tal cual, las 12 categorías
  quedan `none`/inactivas (test nuevo). Claves reales con rachas de ceros no se
  confunden con relleno.
- **Orden del cobro**: `withAiCharge` ejecuta `decrement_ai_credits` ANTES del proveedor,
  no llama al proveedor si devuelve `false` (402), reembolsa con `refund_ai_credits`
  si el proveedor lanza (también cuando lo lanzado no es `Error`), y deja fila
  `:refund_failed` con `pending_refund_credits` si el reembolso se rechaza.
- **BD**: `refund_ai_credits(p_org_id, p_amount)` existe (SECURITY DEFINER, EXECUTE solo
  `service_role`, `FOR UPDATE`, acotado a `ai_credits_max_rollover + purchased`).
  `ai_usage_logs.cost_amount numeric` y `comm_usage_logs.cost_amount numeric` existen.
  `comm_usage_logs` sigue con una sola política (SELECT) y escribe porque
  `aiCostService` usa `getServiceClient()` (service_role salta RLS) — coherente.
  `decrement_ai_credits`, `deduct_comm_credits`, `fn_seed_provider_configs`: EXECUTE
  solo `service_role`.
- **Pricing**: sin fila → `null`, `estimateCost` marca `priced=false`/`complete=false`
  y nunca inventa. 36 filas en `provider_pricing`, 0 duplicados (provider, sku).
- **Navegación**: las 19 entradas de `CRM_NAV_ENABLED` tienen `src/app/app/crm/<seg>/page.tsx`
  (test nuevo). Gating por `organization_modules` en `middleware.ts:checkModuleAccess`
  (consulta autenticada, redirige `module_not_activated`) y en `AppLayout` vía
  `moduleManagementService.getActiveModules`; no hay lista cableada de módulos.
- **Rutas**: org siempre de `getServerOrgContext()`; PUT y test solo admin; 400 por
  zod, 422 por proveedor/clave fuera de catálogo; `test` sanea secretos del detalle y
  limita 5/min/org.
- **Deps**: `twilio ^6.1.0`, `@twilio/voice-sdk ^2.18.4`, `resend ^6.26.0`,
  `@elevenlabs/elevenlabs-js ^2.67.0`, `@google/genai ^2.21.0`, `openai ^6.15.0`,
  `engines.node >=20` — como documenta §13.3.

## Fallos encontrados

1. **[crítico] Cualquier miembro de la org puede recargarse créditos de IA desde el navegador.**
   Pasos: con sesión de un miembro NO admin, desde la consola del navegador
   `supabase.from('ai_settings').update({ credits_remaining: 999999 }).eq('organization_id', <su org>)`.
   Evidencia BD: `ai_settings` tiene grant `UPDATE` a `authenticated` (tabla completa) y
   la política `"Members can manage AI settings"` es `FOR ALL` con qual «es miembro».
   Esperado: `credits_remaining`/`purchased_credits` solo modificables por RPC/service_role
   (la atomicidad de `decrement_ai_credits` no sirve si el saldo se edita a mano).
   Obtenido: el update pasa. Preexistente (V3), pero F0-REG construye «Créditos» encima.

2. **[crítico] `ai_usage_logs` admite INSERT de cualquiera (incluido `anon`) para cualquier org.**
   Política `"Service role can insert AI usage logs"` = `WITH CHECK (true)` sin
   restricción de rol + grants INSERT a `anon` y `authenticated`. Pasos: con la clave anon,
   `POST /rest/v1/ai_usage_logs {organization_id: <otra org>, action_type:'x', model:'m',
   credits_consumed:-100000, metadata:{cost_amount: 99999}}`. Esperado: 401/403.
   Obtenido: inserta; `GET /api/crm/config/credits` de esa org muestra
   `spent_month_usd` y `by_model` envenenados (suma `metadata.cost_amount` sin filtrar
   por origen). Preexistente, pero el dashboard nuevo lo hace visible y explotable.

3. **[alto] `units`/`credits` NaN → `p_cost` viaja como `null` y `decrement_ai_credits` deja la org ilimitada.**
   `chargeAiCredits` hace `Math.max(0, Math.round(NaN))` = `NaN`; supabase-js lo
   serializa como `null`. En la RPC, `v_remaining < NULL` es NULL (no entra en el
   `RETURN false`) y el `UPDATE ... credits_remaining = v_remaining - NULL` deja
   `credits_remaining = NULL`; a partir de ahí todo cobro pasa (`NULL < x` nunca es true).
   Verificado: `select (null::int < 5) is null` → true; hoy 0 orgs con NULL, pero la
   columna es nullable. Reproducir: `chargeAiCredits({orgId, actionType:'x', model:'m', units: Number('abc')})`
   (test `it.failing` «units NaN»). Esperado: rechazo antes del RPC (y CHECK/guard en la RPC).
   Corrección en dos capas: validar `Number.isFinite` en `chargeAiCredits`/`chargeCommCredits`
   y en la RPC `IF p_cost IS NULL OR p_cost < 0 THEN RETURN false`.

4. **[alto] 27 de 49 organizaciones con CRM activo no tienen fila en `ai_settings` → cualquier acción IA del CRM da error genérico, no 402.**
   `decrement_ai_credits` hace `RAISE EXCEPTION 'ai_settings no encontrada'`;
   `chargeAiCredits` lo convierte en `Error('decrement_ai_credits falló: …')` (500).
   `checkAICredits` (legacy) auto-crea la fila; `chargeAiCredits` no. Pasos: llamar
   `withAiCharge` para una de esas orgs (p. ej. transcribir una llamada). Esperado:
   402 con mensaje claro o auto-provisión con el cupo del plan. Obtenido: 500.
   Test `it.failing` «org sin fila ai_settings».

5. **[alto] La columna `cost_amount` existe pero `aiCostService` no la escribe, y `GET /credits` no la lee.**
   Estado real: `ai_usage_logs` tiene 1 702 filas con `cost_amount` en columna
   (113 225 filas de `auto_response`, escritas por la Edge Function del chat) y solo 10
   con `metadata.cost_amount` (CRM); `comm_usage_logs`: 0 en columna, 3 en metadata.
   `GET /api/crm/config/credits` suma únicamente `metadata.cost_amount` → el gasto del
   mes de las orgs que usan auto-respuesta se reporta como 0 USD. Dos fuentes de verdad.
   Esperado: escribir la columna (y mantener metadata si se quiere) y que el endpoint
   lea `COALESCE(cost_amount, metadata->>'cost_amount')`. Test `it.failing`
   «columna real ai_usage_logs.cost_amount».

6. **[alto] `channel_credentials` (tokens de WhatsApp/Facebook/Instagram) se leen desde el navegador.**
   `facebookChannelService.ts:159`, `instagramChannelService.ts:160`,
   `whatsappChannelService.ts:190` hacen `.select('credentials')` con
   `@/lib/supabase/config`; `integrationsService.ts:801` trae
   `credentials:channel_credentials(...)`; los consumen `WhatsAppCredentialsCard`,
   `FacebookCredentialsCard`, `InstagramCredentialsCard` (`'use client'`). RLS lo limita a
   `organization_members.is_super_admin = true`, pero el token llega al navegador de ese
   usuario. Preexistente (módulo chat, 2026-01/08), fuera del código de F0-REG, pero
   contradice §2.4 «Browser → permiso denegado sobre la columna credentials». Decidir si
   es aceptado (y documentarlo) o mover a un endpoint server-only con máscara.

7. **[alto] `aiCreditsService.withAICreditsCheck` sigue cobrando DESPUÉS del proveedor y sin comprobar el importe.**
   `checkAICredits` solo mira `credits_remaining > 0`; ejecuta `fn()` y luego
   `consumeAICredits(estimated)`; si el RPC devuelve `false` solo hace `console.warn` →
   generación gratis. 12 llamadores (`api/ai-assistant/*`, `api/chat/ai/*`). Segundo
   punto de cobro pese a la regla de CLAUDE.md («punto único en chargeAiCredits/refundAiCredits»).
   Fuera del código nuevo de REG, pero REG lo «reescribió sobre el RPC» sin corregir el orden.

8. **[medio] La clave propia de la org pierde frente al fallback env de otro proveedor con menor `priority`.**
   `getProviderCredentials` recorre filas por `priority` y, en la primera fila sin
   credenciales propias, devuelve el fallback env de ESE proveedor sin mirar el resto.
   Caso: seed `llm:google` (priority 10, sin claves) + fila `llm:openai` (priority 20,
   `OPENAI_API_KEY` propia) + `GOOGLE_AI_API_KEY` de plataforma → devuelve google/env.
   §2.4 dice «fila propia de la org (credenciales reales) → fallback env». Test
   `it.failing` «prioridad entre proveedores».

9. **[medio] `settings` no se validan contra `SETTING_FIELDS`.** `PUT providers` acepta
   `settings: { conversation_model: 'gpt-99-inventado', monthly_budget_usd: 'mucho' }`
   (zod `z.record(z.unknown())`), se guarda y `defaultSettings` lo sobreescribe con el
   valor inválido → la llamada al proveedor falla después, no en el guardado. Tamaño
   del JSON sin límite. Tests `it.failing` «settings no se validan» y el de tipo.

10. **[medio] `refundAiCredits` no es idempotente.** Dos llamadas con el mismo `logId`
    abonan dos veces (no hay dedupe por `refunded_log_id` ni en la RPC). Un reintento
    del job de transcripción/análisis tras un timeout de red puede reembolsar dos veces.
    Test `it.failing` «dos reembolsos del mismo logId». Además `refund_ai_credits` pierde
    créditos cuando el saldo estaba por encima del techo `rollover+purchased` (p. ej.
    saldo 503 con techo 500, cobro 10 → 493, reembolso 10 → LEAST(503, 500) = 500: se
    pierden 3). Realista tras el reset mensual con rollover.

11. **[medio] `provider_pricing` ya tiene `valid_to` y `pricingService` lo ignora.**
    El comentario «schema real sin valid_to» quedó obsoleto: la tabla tiene la columna y
    `fn_unit_cost` sí la aplica (`valid_to IS NULL OR valid_to >= p_at`). Hoy 0 filas con
    `valid_to`, así que no hay precio erróneo aún; en cuanto DB cierre una tarifa, el
    servicio seguirá cobrándola. Lógica duplicada frente a `fn_unit_cost` (regla 7).
    Test `it.failing` «valid_to».

12. **[medio] Reglas de fechas incumplidas.** `pricingService.ts:70`
    `new Date().toISOString().slice(0, 10)` (equivalente al patrón prohibido
    `toISOString().split('T')[0]`); `config/credits/route.ts:90` `r.created_at.slice(0, 10)`
    sobre un `timestamptz` de BD (regla 2) y el inicio de mes en UTC (`setUTCDate(1)`)
    en vez del timezone de la organización (reglas 3 y 6). Para una org en Bogotá, los
    consumos entre 19:00 y 24:00 del último día caen en el mes siguiente y `by_day`
    desplaza días.

13. **[medio] `monthly_budget_usd` no bloquea nada.** §8 promete «aviso al 80 % y
    bloqueo al 100 %» y `JobFatalError('budget_exceeded')`; solo existe el aviso en
    `CreditosTab` (`pct >= 80`). `grep budget_exceeded src` → 0 resultados; ningún
    cobro consulta el presupuesto.

14. **[medio] `POST /providers/test` permite a un admin de tenant sondear las credenciales de la plataforma.**
    Con `source: 'env'` ejecuta la prueba con las claves globales y devuelve
    `friendlyName`/`status` de la cuenta Twilio de la plataforma, nº de dominios de la
    cuenta Resend, plan y consumo de caracteres de ElevenLabs, `verified_name` de Meta.
    Esperado: con `source='env'` responder solo `{ok, source:'env'}` sin detalle de la
    cuenta. Además el rate-limit es por instancia (Map en memoria): en Vercel cada
    lambda tiene su propio contador.

15. **[medio] `isOrgAdmin` resuelve por nombre de rol.** `rbac.ts:7`
    `ORG_ADMIN_ROLE_NAMES.includes(ctx.roleName)`: regla 6 de CLAUDE.md («nunca a partir
    del nombre de un rol»). Un rol renombrado o creado con ese nombre en otra org gana
    admin. Preexistente, pero es la única guarda de PUT/test.

16. **[bajo] `GET /providers` siembra `provider_configs` como efecto lateral** para
    cualquier miembro (no solo admin) y sin idempotencia explícita en el cliente
    (`fn_seed_provider_configs` sí es `ON CONFLICT DO NOTHING`). Un GET no debería escribir.

17. **[bajo] Bordes de placeholder y cache.** `isPlaceholderCredential('0000')`/`'xxxx'`
    (relleno < 6 chars) cuentan como clave real (test `it.failing`). Un error transitorio
    de BD en `getUnitCost` se cachea como `null` durante 5 min → `cost_amount: null` en
    los logs de ese intervalo (test documentado).

## Cobertura no probada / riesgos pendientes

- No se ejecutó el flujo en navegador (dev server con sesión) ni `POST /providers/test`
  contra proveedores reales; se verificó por lectura de código + tests con fakes.
- No se probaron los SDK reales (`twilio`, `resend`, `@elevenlabs/elevenlabs-js`,
  `@google/genai`) más allá de que las importaciones dinámicas del endpoint compilan.
- Concurrencia real de `decrement_ai_credits` (FOR UPDATE) no se probó con dos
  transacciones; se confía en la definición.
- `ws-server.Dockerfile` no se construyó.
- `next build` no se ejecutó (fuera del presupuesto de esta ronda; `tsc` limpio en REG).
- Vault (M6) sigue sin aplicarse: `provider_configs.credentials` en claro, 0 filas con
  credenciales propias hoy (32 orgs sembradas), así que el riesgo es futuro.
- `deduct_comm_credits` acepta importes negativos como reembolso (lo usa
  `voice/ai-agent/status`); `aiCostService` no ofrece `refundCommCredits` — cada
  consumidor reimplementa el reembolso (regla 7). No probado en esta ronda.

## Calificación de robustez

**6/10** — El núcleo que REG construyó (catálogo, placeholders, lectura server-only de
`provider_configs`, orden cobro→proveedor→reembolso, endpoints con org de sesión) está
bien hecho y con buena cobertura (99 tests previos + 22 nuevos, todos verdes). Lo que
baja la nota es la integridad del saldo sobre el que se apoya: dos agujeros de RLS
preexistentes que la pestaña «Créditos» hace explotables (F1, F2), un NaN que deja una
org ilimitada (F3), 27 orgs con CRM que hoy reciben 500 en vez de 402 (F4) y una columna
`cost_amount` que DB ya entregó y el código sigue sin usar, con un dashboard que por eso
reporta 0 USD para 113 k filas (F5). Ninguno requiere rediseño; todos tienen pasos
reproducibles y tests `it.failing` que avisarán cuando se corrijan.
