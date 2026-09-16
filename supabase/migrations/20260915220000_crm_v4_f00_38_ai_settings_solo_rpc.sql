-- =============================================================================
-- crm_v4_f00_38_ai_settings_solo_rpc
-- F0-REG ronda 2 (QA r1, crítico 1): el saldo de créditos de IA ya no es
-- editable desde el navegador.
--
-- Estado verificado el 2026-09-15 (solo lectura, MCP):
--   * anon y authenticated tenían TODOS los privilegios de tabla sobre
--     public.ai_settings (SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES,
--     TRIGGER).
--   * Tres políticas a {public}: "Members can manage AI settings" (ALL, por
--     pertenencia), "Organization admins can manage AI settings" (ALL,
--     is_super_admin) y "Users can view AI settings of their organization"
--     (SELECT, por pertenencia).
--   Consecuencia: cualquier miembro podía ejecutar
--   `update ai_settings set credits_remaining = 999999` con su sesión.
--
-- Qué hace:
--   1. Revoca todo a anon.
--   2. A authenticated le deja SELECT de tabla (la UI del chat IA lee la fila
--      completa con `.select()`) y le concede INSERT/UPDATE SOLO sobre las
--      columnas de comportamiento. Las columnas de saldo (credits_remaining,
--      purchased_credits, credits_reset_at, purchased_credits_expires_at,
--      last_rollover_amount) quedan únicamente para service_role y las RPC
--      SECURITY DEFINER (decrement_ai_credits, refund_ai_credits, webhook de
--      Stripe y checkAICredits, todas con service role).
--   3. Sustituye las políticas `FOR ALL` por una de SELECT, una de INSERT y
--      una de UPDATE, las tres por pertenencia activa. Postgres no admite
--      `FOR INSERT, UPDATE` en una sola política, por eso son dos de escritura.
--
-- Escritores legítimos desde el navegador que siguen funcionando:
--   src/lib/services/aiSettingsService.ts (createSettings/updateSettings/
--   toggleAI) solo escribe organization_id + columnas de comportamiento.
--
-- Decisión pendiente del dueño (QA r1, instrucción 1): si la configuración
-- del chat IA debe ser solo de administradores, cambiar las políticas de
-- escritura para exigir `om.is_super_admin` o el rol correspondiente. Esta
-- migración NO lo asume: mantiene el alcance actual (cualquier miembro activo).
--
-- Idempotente: revoke/grant y drop policy if exists se pueden repetir.
-- Rollback: supabase/rollbacks/20260915220000_crm_v4_f00_38_ai_settings_solo_rpc_rollback.sql
-- =============================================================================

begin;

-- 1. anon: fuera.
revoke all on table public.ai_settings from anon;

-- 2. authenticated: solo SELECT de tabla + columnas de comportamiento.
revoke insert, update, delete, truncate, references, trigger on table public.ai_settings from authenticated;

grant insert (
  organization_id,
  provider,
  model,
  temperature,
  max_tokens,
  system_rules,
  tone,
  language,
  fallback_message,
  auto_response_enabled,
  auto_response_delay_seconds,
  confidence_threshold,
  max_fragments_context,
  is_active,
  metadata,
  hybrid_agent_pause_minutes,
  hybrid_respect_business_hours,
  reply_fallback_on_no_credits,
  max_respuestas_ia_por_conversacion_dia,
  vertical,
  updated_at
) on table public.ai_settings to authenticated;

grant update (
  provider,
  model,
  temperature,
  max_tokens,
  system_rules,
  tone,
  language,
  fallback_message,
  auto_response_enabled,
  auto_response_delay_seconds,
  confidence_threshold,
  max_fragments_context,
  is_active,
  metadata,
  hybrid_agent_pause_minutes,
  hybrid_respect_business_hours,
  reply_fallback_on_no_credits,
  max_respuestas_ia_por_conversacion_dia,
  vertical,
  updated_at
) on table public.ai_settings to authenticated;

-- 3. Políticas: fuera las FOR ALL a {public}; entran select/insert/update
--    a authenticated por pertenencia activa.
drop policy if exists "Members can manage AI settings" on public.ai_settings;
drop policy if exists "Organization admins can manage AI settings" on public.ai_settings;
drop policy if exists "Users can view AI settings of their organization" on public.ai_settings;

drop policy if exists ai_settings_select on public.ai_settings;
create policy ai_settings_select on public.ai_settings
  for select to authenticated
  using (
    organization_id in (
      select om.organization_id
        from public.organization_members om
       where om.user_id = (select auth.uid())
         and om.is_active
    )
  );

drop policy if exists ai_settings_insert on public.ai_settings;
create policy ai_settings_insert on public.ai_settings
  for insert to authenticated
  with check (
    organization_id in (
      select om.organization_id
        from public.organization_members om
       where om.user_id = (select auth.uid())
         and om.is_active
    )
  );

drop policy if exists ai_settings_update on public.ai_settings;
create policy ai_settings_update on public.ai_settings
  for update to authenticated
  using (
    organization_id in (
      select om.organization_id
        from public.organization_members om
       where om.user_id = (select auth.uid())
         and om.is_active
    )
  )
  with check (
    organization_id in (
      select om.organization_id
        from public.organization_members om
       where om.user_id = (select auth.uid())
         and om.is_active
    )
  );

comment on policy ai_settings_update on public.ai_settings is
  'F0-REG r2: escritura por pertenencia activa; el saldo (credits_*) queda fuera por privilegios de columna, no por política.';

commit;

-- -----------------------------------------------------------------------------
-- Verificación (SELECT, MCP) — todo debe cumplirse tras aplicar:
--   select has_column_privilege('authenticated','public.ai_settings','credits_remaining','UPDATE');  -- false
--   select has_column_privilege('authenticated','public.ai_settings','purchased_credits','UPDATE');  -- false
--   select has_column_privilege('authenticated','public.ai_settings','model','UPDATE');              -- true
--   select has_column_privilege('authenticated','public.ai_settings','credits_remaining','INSERT');  -- false
--   select has_table_privilege('anon','public.ai_settings','SELECT');                                -- false
--   select has_table_privilege('authenticated','public.ai_settings','SELECT');                       -- true
--   select policyname, cmd, roles from pg_policies where tablename = 'ai_settings';
--     -- 3 filas: ai_settings_select/insert/update a {authenticated}; ninguna con cmd = ALL.
-- En la app: /app/chat/ia/configuracion sigue guardando modelo/temperatura.
-- -----------------------------------------------------------------------------
