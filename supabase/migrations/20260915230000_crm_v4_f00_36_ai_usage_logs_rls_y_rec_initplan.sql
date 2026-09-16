-- =============================================================================
-- crm_v4_f00_36_ai_usage_logs_rls_y_rec_initplan
-- F0-DB ronda 3 (QA r2: problemas 2, 3 y 9).
--
-- PROBLEMA 2 (alto): `ai_usage_logs` aceptaba INSERT desde `anon` y `authenticated`
-- para CUALQUIER organización. Evidencia: política "Service role can insert AI
-- usage logs" con roles={public} y with_check=true, más grants de tabla
-- arwdDxt a anon/authenticated. Con la clave anónima pública se podía insertar
-- una fila con `organization_id` ajeno y `cost_amount` (columna de F0-17), y
-- esa fila entraba en el panel de créditos (GET /api/crm/config/credits).
-- `comm_usage_logs` no tenía política de INSERT (grants inertes bajo RLS),
-- pero los grants sobraban igual.
--
-- QUIÉN ESCRIBE (verificado en el repo antes de revocar, rastreando cada cliente
-- inyectado hasta la ruta/handler; los 13 INSERT y 2 UPDATE usan service_role,
-- que salta RLS y no depende de grants):
--   aiCreditsService.ts:305 (createClient con SUPABASE_SERVICE_ROLE_KEY)
--   aiCostService.ts:352,412 (resolveClient -> getServiceClient)
--   transcriptionService.ts:1035 <- jobs/handlers/transcribe (runner, service)
--   callCreditsService.ts:177 <- api/voice/dial-complete y api/voice/status (getServiceClient)
--   whatsapp/outboundService.ts:241 (param `service` = getServiceClient)
--   twilioService.ts:178 (getServiceClient)
--   twilioWebhook.ts:196,277 <- api/integrations/twilio/webhook (service)
--   conversationRelayHandler.ts:301 (getServiceSupabase)
--   voiceAgentTools.ts:399 (supabase inyectado = getServiceSupabase)
--   ai-auto-response/index.ts:1609 (Edge Function con SERVICE_ROLE_KEY)
-- Por eso la política de INSERT para authenticated puede desaparecer sin crear
-- otra: ningún escritor corre con sesión de usuario. `chargeAiCredits` /
-- `refundAiCredits` (aiCostService) no se ven afectados.
--
-- QUIÉN LEE con sesión: aiUsageStatsService.ts y credits/route.ts (SELECT bajo
-- RLS por pertenencia). Se conserva la lectura para `authenticated`; la
-- política pasa a `TO authenticated`, con `(select auth.uid())` (initplan) y
-- `om.is_active = true` (patrón F0, crm_v4_f00_03/13).
--
-- PROBLEMA 3 (medio): `call_recordings.rec_select/insert/update/delete` con
-- `auth.uid()` sin subselect (advisor auth_rls_initplan). Mismo patrón que
-- crm_v4_f00_13: ALTER POLICY ... USING/WITH CHECK con `(select auth.uid())`.
-- La tabla la tocó F0-01 (updated_at) y su bucket lo creó F0-02. Se retira
-- además el grant de tabla a `anon` (las 4 políticas ya eran TO authenticated,
-- así que anon no tenía acceso efectivo; el grant era ruido).
--
-- Idempotente: DROP POLICY IF EXISTS / CREATE POLICY; REVOKE repetible; ALTER
-- POLICY es idempotente por definición (mismo cuerpo).
-- Rollback: supabase/rollbacks/20260915230000_crm_v4_f00_36_ai_usage_logs_rls_y_rec_initplan_rollback.sql
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) Escritura en *_usage_logs: solo service_role (salta RLS). anon fuera del todo.
-- ---------------------------------------------------------------------------
revoke insert, update, delete, truncate, references, trigger
  on public.ai_usage_logs, public.comm_usage_logs
  from anon, authenticated;
revoke select on public.ai_usage_logs, public.comm_usage_logs from anon;

drop policy if exists "Service role can insert AI usage logs" on public.ai_usage_logs;

-- ---------------------------------------------------------------------------
-- 2) Lectura por pertenencia activa, rol explícito e initplan.
-- ---------------------------------------------------------------------------
drop policy if exists "Members can view AI usage logs of their organization" on public.ai_usage_logs;
drop policy if exists ai_usage_logs_select on public.ai_usage_logs;
create policy ai_usage_logs_select on public.ai_usage_logs
  for select to authenticated
  using (organization_id in (
    select om.organization_id
      from public.organization_members om
     where om.user_id = (select auth.uid())
       and om.is_active = true));

drop policy if exists comm_usage_logs_select on public.comm_usage_logs;
create policy comm_usage_logs_select on public.comm_usage_logs
  for select to authenticated
  using (organization_id in (
    select om.organization_id
      from public.organization_members om
     where om.user_id = (select auth.uid())
       and om.is_active = true));

-- ---------------------------------------------------------------------------
-- 3) call_recordings: (select auth.uid()) en las 4 políticas rec_* + sin anon.
-- ---------------------------------------------------------------------------
alter policy rec_select on public.call_recordings
  using (organization_id in (
    select om.organization_id from public.organization_members om
     where om.user_id = (select auth.uid()) and om.is_active = true));

alter policy rec_insert on public.call_recordings
  with check (organization_id in (
    select om.organization_id from public.organization_members om
     where om.user_id = (select auth.uid()) and om.is_active = true));

alter policy rec_update on public.call_recordings
  using (organization_id in (
    select om.organization_id from public.organization_members om
     where om.user_id = (select auth.uid()) and om.is_active = true))
  with check (organization_id in (
    select om.organization_id from public.organization_members om
     where om.user_id = (select auth.uid()) and om.is_active = true));

alter policy rec_delete on public.call_recordings
  using (organization_id in (
    select om.organization_id from public.organization_members om
     where om.user_id = (select auth.uid()) and om.is_active = true));

revoke all on public.call_recordings from anon;

commit;

-- Verificación (solo lectura, tras aplicar):
--   select policyname, roles, qual, with_check from pg_policies
--    where tablename in ('ai_usage_logs','comm_usage_logs','call_recordings');
--   -> 0 con 'auth.uid()' sin '(select', 0 con roles={public}, 0 con with_check=true
--   select has_table_privilege('anon','public.ai_usage_logs','INSERT'),
--          has_table_privilege('anon','public.ai_usage_logs','SELECT'),
--          has_table_privilege('authenticated','public.ai_usage_logs','INSERT');
--   -> false, false, false
