# F0-SEC — Sub-parte B: cierre de RPC del CRM a `anon` — constructor, ronda 2

Fecha: 2026-09-15. Proyecto Supabase `jgmgphmzusbluqhuqihj` (**solo lectura** por MCP:
`pg_proc`, `pg_get_functiondef`, `has_function_privilege`, `pg_trigger`, `cron.job`).
Insumos: `rondas/F0-SEC-qa-r1.md` (sub-parte B, puntos 5-9), `rondas/F0-SEC-tester-r1.md`
(fallo 2), `docs/POLITICA-MIGRACIONES.md`, `docs/hallazgos/F-11.md`, memorias «Exposición de
RPC a anon» y «Quitar qual=true destapa el coste RLS» (bloques con `lock_timeout`).

**La migración NO se aplicó.** Queda pendiente de que el orquestador la muestre al dueño.

## Qué se hizo en esta ronda

- `supabase/migrations/20260915223000_crm_v4_f00_40_cerrar_rpc_crm_anon.sql` — 32 bloques
  independientes (`begin; set local lock_timeout = '3s'; … commit;`), uno por firma:
  - **Grupo A (24 firmas) → solo `service_role`** (+ `postgres`/pg_cron como owner):
    `REVOKE EXECUTE … FROM public, anon, authenticated; GRANT … TO service_role`.
  - **Grupo B (6 firmas) → se conserva `authenticated`**: `REVOKE … FROM public, anon;
    GRANT … TO authenticated, service_role`.
  - **Grupo C (2 firmas) → `CREATE OR REPLACE` con guarda de pertenencia** + `set search_path
    = public` + revoke de `anon`: `fn_reporte_crm_funnel`, `fn_reporte_crm_ranking_vendedores`.
    Cuerpos copiados de `pg_get_functiondef` (2026-09-15); solo se antepone la guarda
    `IF NOT EXISTS (SELECT 1 FROM organization_members om WHERE om.user_id = (select auth.uid())
    AND om.organization_id = p_organization_id AND om.is_active = true) THEN RAISE EXCEPTION
    'ORG_FORBIDDEN' USING ERRCODE = '42501'`.
- `supabase/rollbacks/20260915223000_crm_v4_f00_40_cerrar_rpc_crm_anon_rollback.sql` — `GRANT`
  inverso exacto al ACL medido (PUBLIC + anon + authenticated; `fn_expire_ai_agent_actions`
  no tenía PUBLIC y así se restaura) y las dos definiciones anteriores pegadas de
  `pg_get_functiondef`.
- Sin cambios de código TypeScript: los dos llamadores de navegador de `fn_reporte_crm_*`
  (`src/lib/services/reportes/modulos/crmReports.ts`, `src/lib/services/crm/commercialMetricsService.ts`)
  pasan la organización activa con sesión de usuario, que es exactamente lo que la guarda admite.

## Feedback de la ronda anterior que se atendió

| Punto del veredicto | Estado |
|---|---|
| 5. 20 RPC a `service_role` solo | Hecho (+3 movidas desde el punto 6 y +1 gemela, ver desviaciones) |
| 6. 11 RPC: retirar solo `anon` | Hecho para 8; 3 pasan al grupo A con evidencia |
| 7. Guarda + `search_path` en las dos `fn_reporte_*` | Hecho; ya tenían `search_path=public`, se conserva |
| 8. Fuera de alcance (finanzas/auth) → `docs/hallazgos/F-11.md` | No tocado en esta ronda: F-11.md es archivo compartido del ciclo; se deja la lista aquí (sección «Fuera de alcance») para que el orquestador la anexe |
| 9. Bloque de verificación comentado al final del `.sql` | Hecho (dos consultas) |

## Tabla función → firma → llamadores → acción

Evidencia de llamadores: `rg` sobre `go-admin-erp/{src,supabase/functions,electron,print-agent}`,
`goadmin-websites`, `go-admin-sellers`, `go-admin-super` (excluyendo `node_modules`, `.next`,
migraciones y docs). `ws-server/` no existe en el árbol actual. «Cadena interna» = la llama otra
función SECURITY DEFINER de `postgres` o un trigger; el REVOKE no la afecta porque se resuelve
con los privilegios del owner.

| # | Función (firma) | secdef | ACL hoy | Llamadores | Acción |
|---|---|---|---|---|---|
| 1 | `auto_close_inactive_conversations()` | sí | PUBLIC, anon, authenticated, service_role | ninguno | revocar ambos |
| 2 | `fn_agent_ensure_operational_goal(integer)` | sí | ídem | cadena interna (`fn_agent_upsert_task`, `fn_reschedule_overdue_tasks`) | revocar ambos |
| 3 | `fn_agent_upsert_task(integer,text,text,text,integer[],text,text[],text[],numeric)` | sí | ídem | cadena interna (`fn_daily_task_agent`) | revocar ambos |
| 4 | `fn_campaign_mark_bounced(uuid,uuid)` | sí | ídem | service role: `crm/email/webhookService.ts:175` | revocar ambos |
| 5 | `fn_campaign_mark_clicked(uuid,uuid)` | sí | ídem | service role: `webhookService.ts:175` | revocar ambos |
| 6 | `fn_campaign_mark_opened(uuid,uuid)` | sí | ídem | service role: `webhookService.ts:175` | revocar ambos |
| 7 | `fn_campaign_mark_replied(uuid,uuid)` | sí | ídem | service role: `crm/whatsapp/campaignEvents.ts:148` | revocar ambos |
| 8 | `fn_campaign_mark_sent(uuid,uuid)` | sí | ídem | service role: `campaignBatch.ts:368`, `webhookService.ts:175` | revocar ambos |
| 9 | `fn_consume_ai_credits_on_message()` (returns trigger) | sí | ídem | ningún trigger la usa hoy (`pg_trigger`) | revocar ambos |
| 10 | `fn_daily_task_agent()` | sí | ídem | `cron.job` 7 como `postgres` | revocar ambos |
| 11 | `fn_expire_ai_agent_actions()` | sí | anon, authenticated, service_role (sin PUBLIC) | `cron.job` 21 como `postgres` | revocar ambos |
| 12 | `fn_get_campaign_metrics(uuid)` | sí | PUBLIC, anon, authenticated, service_role | ninguno | revocar ambos |
| 13 | `fn_get_conversation_for_summary(uuid)` | sí | ídem | ninguno | revocar ambos |
| 14 | `fn_reschedule_overdue_tasks()` | sí | ídem | `cron.job` 8 como `postgres` | revocar ambos |
| 15 | `fn_reset_monthly_ai_credits()` | sí | ídem | `cron.job` 10 como `postgres` | revocar ambos |
| 16 | `fn_save_conversation_summary(uuid,text,text[],text)` | sí | ídem | ninguno | revocar ambos |
| 17 | `get_ai_tokens_usage(integer)` | sí | ídem | ninguno | revocar ambos |
| 18 | `get_conversation_stats(integer,timestamptz,timestamptz)` | sí | ídem | ninguno | revocar ambos |
| 19 | `mark_conversation_messages_as_read(uuid,bigint)` | sí | ídem | ninguno | revocar ambos |
| 20 | `refresh_mv_crm_forecast_safely()` | sí | ídem | ninguno | revocar ambos |
| 21 | `fn_agent_pick_assignee(integer,text[],text[],integer[])` | sí | ídem | cadena interna (`fn_agent_upsert_task`); **sin guarda** | **revocar ambos** (desviación 1) |
| 22 | `fn_agent_pick_member(integer,integer[])` | sí | ídem | cadena interna (`fn_agent_pick_assignee`); **sin guarda** | **revocar ambos** (desviación 1) |
| 23 | `fn_apply_conversation_tag(uuid,text,text)` | sí | ídem | trigger `trg_auto_tag_conversation` → `fn_auto_tag_conversation` (secdef, owner postgres); **sin guarda** | **revocar ambos** (desviación 1) |
| 24 | `manual_refresh_forecast()` | sí | ídem | ninguno; gemela exacta de la #20 | **revocar ambos** (desviación 2) |
| 25 | `direct_update_opportunity_bypass(uuid,uuid,text)` | sí | ídem | ninguno; guarda `auth.uid() IS NULL → false` + membresía | revocar anon |
| 26 | `direct_update_opportunity_stage(uuid,uuid)` | sí | ídem | ninguno; guarda ídem | revocar anon |
| 27 | `update_opportunity_stage(uuid,uuid,integer)` | sí | ídem | ninguno; `EXISTS(membresía)` con `auth.uid()` NULL → false | revocar anon |
| 28 | `update_opportunity_stage_safe(uuid,uuid,integer)` | sí | ídem | ninguno; guarda ídem | revocar anon |
| 29 | `update_opportunity_stage_safe(uuid,uuid,text)` | sí | ídem | ninguno; guarda ídem | revocar anon |
| 30 | `update_opportunity_stage_without_refresh(uuid,uuid)` | sí | ídem | ninguno; guarda ídem | revocar anon |
| 31 | `fn_reporte_crm_funnel(bigint,timestamptz,timestamptz)` | sí | ídem | navegador con sesión: `crmReports.ts:26,59`, `commercialMetricsService.ts:492` | **guarda** + revocar anon |
| 32 | `fn_reporte_crm_ranking_vendedores(bigint,timestamptz,timestamptz)` | sí | ídem | navegador con sesión: `crmReports.ts:101`, `commercialMetricsService.ts:246` | **guarda** + revocar anon |

Totales: revocar ambos = 24 · revocar solo anon = 6 · guarda + revocar anon = 2 · **32 firmas**.
Ninguna revocación a `authenticated` afecta a un llamador con sesión; ninguna revocación a `anon`
afecta a un llamador anónimo real (la tienda web de `goadmin-websites` no llama a ninguna).

## Desviaciones respecto a la lista exacta del veredicto (con evidencia)

1. **`fn_apply_conversation_tag`, `fn_agent_pick_assignee`, `fn_agent_pick_member` pasan del grupo
   «solo anon» al grupo «ambos».** El veredicto las puso en el grupo 6 («tienen guarda de
   pertenencia»). `pg_get_functiondef` muestra que no la tienen: `fn_apply_conversation_tag` lee
   `organization_members` solo para rellenar `created_by` (`LIMIT 1`, sin `IF`) y escribe en
   `conversation_tags`/`conversation_tag_relations` de la organización de la conversación que le
   pasen; las dos `fn_agent_pick_*` devuelven el `user_id` de un miembro activo de cualquier
   `p_org_id`. Ningún repositorio las llama con sesión; sus únicos usuarios son funciones/trigger
   SECURITY DEFINER de `postgres`, que siguen funcionando. Dejarlas a `authenticated` habría
   permitido que un usuario de la organización A etiquete conversaciones de B o enumere miembros de B.
2. **`manual_refresh_forecast()` se añade.** No estaba en la lista; la consulta de recuento por
   nombre CRM la destapó como la única función del dominio fuera de la lista. Es el gemelo exacto
   de `refresh_mv_crm_forecast_safely()` (mismo cuerpo: `REFRESH MATERIALIZED VIEW mv_crm_forecast`
   sin `CONCURRENTLY`, ACCESS EXCLUSIVE sobre la vista a demanda de `anon`). Sin llamadores.

Si el dueño prefiere ceñirse a la lista literal, los cuatro bloques están etiquetados
(«Desviación 1» / «Desviación 2») al final del grupo A y se pueden omitir sin tocar el resto.

## Decisiones de diseño relevantes

- **Guarda en afirmación positiva incondicional**, no `IF auth.uid() IS NOT NULL AND NOT EXISTS`:
  con `anon` (y con `service_role`) `auth.uid()` es NULL y el `EXISTS` falla cerrado. Verificado
  en solo lectura: `select exists(... om.user_id = (select auth.uid()) ...)` → `false` sin sesión.
  `organization_members.is_active` no tiene NULLs (0 de 136 activos), así que `is_active = true`
  no excluye a nadie por accidente.
- `(select auth.uid())` en vez de `auth.uid()` para que sea un InitPlan único (memoria «Quitar
  qual=true»); coincide con `pos_product_ranking` (migración `20260911000000`).
- **No hay bypass para `service_role`** en las dos `fn_reporte_*`: hoy nadie las llama desde el
  servidor. Si un route handler las necesita, resuelve la organización con `getServerOrgContext()`
  y llama con la sesión del usuario (`getServerUserClient()`), no relajando la guarda.
- **Bloques por función** con `begin/commit` propios y `set local lock_timeout = '3s'`, como pide
  la memoria del proyecto: un REVOKE sobre `pg_proc` no toma ACCESS EXCLUSIVE sobre tablas, pero
  el `CREATE OR REPLACE` sí bloquea a los llamadores en curso de esa función; 3 s acota el daño.
  Es el mismo patrón que `20260910213714_rls_bloque_a_financiero.sql` y `20260911000000`, que se
  aplicaron con `apply_migration` sin problema.
- Las 6 funciones de etapa de oportunidad (#25-30) no tienen llamador en ningún repositorio y son
  cinco variantes del mismo UPDATE. Se conservan a `authenticated` como pide el veredicto (tienen
  guarda); son candidatas a `DROP` en una fase de limpieza, fuera de esta.

## Verificación

Hecha (solo lectura, antes de escribir):
- 31 firmas del veredicto existen con la firma exacta; `prosecdef = true`; owner `postgres`.
- ACL de las 32: `{=X/postgres, postgres=X, anon=X, authenticated=X, service_role=X}` salvo
  `fn_expire_ai_agent_actions` (sin `=X`).
- Los 4 jobs de `cron.job` que las invocan (7, 8, 10, 21) corren con `username = postgres`.
- Recuento base: **216** funciones SECURITY DEFINER ejecutables por `anon` en `public` (387 en
  total); 32 con nombre del dominio CRM/IA/mensajería, las 32 de esta migración.
- `.sql` sin credenciales ni nombres de organización (grep de `eyJ…`, `whsec_`, `sk_`, `secret`,
  `password`, `supabase.co`: 0 coincidencias); UTF-8 sin BOM; 32 `begin` / 32 `commit` / 32
  `revoke` / 32 `grant` en la migración; 32/32/0/32 en el rollback.

Pendiente para el orquestador (no ejecutado por la restricción de solo lectura):
1. Dry-run del grupo C dentro de `begin; … rollback;` impersonando (miembro activo → jsonb;
   usuario de otra organización → 42501 `ORG_FORBIDDEN`; `anon` → 42501 permission denied).
2. Aplicar con `apply_migration` (nombre `crm_v4_f00_40_cerrar_rpc_crm_anon`).
3. Correr la consulta de verificación:

```sql
-- Esperado: 0 filas (ninguna de las 32 con EXECUTE para anon; ninguna del grupo A con
-- EXECUTE para authenticated).
select p.proname, pg_get_function_identity_arguments(p.oid) as args,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
  and p.proname in (
    'auto_close_inactive_conversations','fn_agent_ensure_operational_goal',
    'fn_agent_upsert_task','fn_campaign_mark_bounced','fn_campaign_mark_clicked',
    'fn_campaign_mark_opened','fn_campaign_mark_replied','fn_campaign_mark_sent',
    'fn_consume_ai_credits_on_message','fn_daily_task_agent',
    'fn_expire_ai_agent_actions','fn_get_campaign_metrics',
    'fn_get_conversation_for_summary','fn_reschedule_overdue_tasks',
    'fn_reset_monthly_ai_credits','fn_save_conversation_summary',
    'get_ai_tokens_usage','get_conversation_stats',
    'mark_conversation_messages_as_read','refresh_mv_crm_forecast_safely',
    'manual_refresh_forecast','fn_agent_pick_assignee','fn_agent_pick_member',
    'fn_apply_conversation_tag',
    'direct_update_opportunity_bypass','direct_update_opportunity_stage',
    'update_opportunity_stage','update_opportunity_stage_safe',
    'update_opportunity_stage_without_refresh',
    'fn_reporte_crm_funnel','fn_reporte_crm_ranking_vendedores')
  and (
    has_function_privilege('anon', p.oid, 'EXECUTE')
    or (has_function_privilege('authenticated', p.oid, 'EXECUTE')
        and p.proname not in (
          'direct_update_opportunity_bypass','direct_update_opportunity_stage',
          'update_opportunity_stage','update_opportunity_stage_safe',
          'update_opportunity_stage_without_refresh',
          'fn_reporte_crm_funnel','fn_reporte_crm_ranking_vendedores'))
  );

-- Esperado: true, true
select p.proname, pg_get_functiondef(p.oid) like '%ORG_FORBIDDEN%' as con_guarda
from pg_proc p where p.pronamespace = 'public'::regnamespace
  and p.proname in ('fn_reporte_crm_funnel','fn_reporte_crm_ranking_vendedores');

-- Esperado: 184 (216 − 32) y 0 con nombre CRM-like
select count(*) filter (where has_function_privilege('anon', p.oid, 'execute')) as anon_exec,
       count(*) filter (where has_function_privilege('anon', p.oid, 'execute')
         and p.proname ~ '(crm|campaign|conversation|opportunit|ai_|_ai|agent|lead|pipeline|forecast|whatsapp|message|task)') as anon_exec_crm_like
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef;
```

4. Prueba funcional mínima tras aplicar: abrir Reportes → CRM → «Funnel de Ventas» y el ranking
   de vendedores con un usuario miembro (deben cargar); `POST /rest/v1/rpc/fn_reporte_crm_funnel`
   con la anon key → 401/403 (`permission denied for function`).
5. Los cron 7/8/10/21 siguen ejecutándose (comprobar `cron.job_run_details` del día siguiente).

## Fuera de alcance (para anexar a `docs/hallazgos/F-11.md`, punto 8 del veredicto)

Detectadas por la misma consulta, no migradas aquí por no ser del CRM: `fn_apply_customer_credit(uuid,uuid,numeric,uuid)`
(finanzas, sin guarda, llamada desde navegador), `confirm_purchase_invoice`, `issue_invoice`,
`process_credit_note`, `fn_void_purchase_invoice`, `fn_invoice_*`, `get_invoice_payments`,
`check_email_exists`, `get_auth_provider_by_email`. Avance previsto de F-11 tras aplicar esta
migración: 216 → 184 funciones SECURITY DEFINER ejecutables por `anon`.

## Archivos de la ronda

- `supabase/migrations/20260915223000_crm_v4_f00_40_cerrar_rpc_crm_anon.sql` (nuevo, **sin aplicar**;
  timestamp `223000` porque `220000` ya lo ocupa `crm_v4_f00_38_ai_settings_solo_rpc` de F0-REG en el
  mismo árbol y dos versiones iguales chocarían en `supabase_migrations`)
- `supabase/rollbacks/20260915223000_crm_v4_f00_40_cerrar_rpc_crm_anon_rollback.sql` (nuevo)
- `docs/crm-revenue-os/rondas/F0-SEC-B-builder-r2.md` (este informe)

Sin cambios en `src/`; `npx jest` / `tsc` / `next build` no aplican a esta sub-parte (solo SQL y docs).
