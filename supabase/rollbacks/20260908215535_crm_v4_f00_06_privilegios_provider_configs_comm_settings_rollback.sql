-- ============================================================
-- ROLLBACK de 20260908215535_crm_v4_f00_06_privilegios_provider_configs_comm_settings
-- ============================================================
-- Escrito el 2026-09-15 (F0-DB ronda 3, B1): la migración se aplicó por MCP
-- sin dejar rollback; este archivo deshace su DDL en orden inverso.
-- Devuelve los grants de tabla a como estaban (ALL para authenticated en
-- provider_configs/comm_settings/channel_credentials, anon incluido) y recrea
-- las políticas de escritura de provider_configs con el patrón `calls`. Las
-- políticas exactas anteriores de comm_settings no quedaron registradas: se
-- recrean con el patrón de pertenencia sin restricción de rol admin.
--
-- SOBRE LOS DATOS: no toca datos. OJO: reabre la lectura de provider_configs.credentials y del token de Twilio a authenticated (estado inseguro anterior).
-- ============================================================

begin;
grant all on public.channel_credentials to anon;

grant all on public.comm_settings to anon, authenticated;
drop policy if exists comm_settings_update on public.comm_settings;
create policy comm_settings_update on public.comm_settings for update to authenticated
using (organization_id in (select om.organization_id from public.organization_members om where om.user_id = auth.uid() and om.is_active = true))
with check (organization_id in (select om.organization_id from public.organization_members om where om.user_id = auth.uid() and om.is_active = true));
drop policy if exists comm_settings_select on public.comm_settings;
create policy comm_settings_select on public.comm_settings for select to authenticated
using (organization_id in (select om.organization_id from public.organization_members om where om.user_id = auth.uid() and om.is_active = true));

drop view if exists public.v_provider_configs_safe;

grant all on public.provider_configs to anon, authenticated;
create policy provider_configs_insert on public.provider_configs for insert to authenticated
with check (organization_id in (select om.organization_id from public.organization_members om where om.user_id = auth.uid() and om.is_active = true));
create policy provider_configs_update on public.provider_configs for update to authenticated
using (organization_id in (select om.organization_id from public.organization_members om where om.user_id = auth.uid() and om.is_active = true))
with check (organization_id in (select om.organization_id from public.organization_members om where om.user_id = auth.uid() and om.is_active = true));
create policy provider_configs_delete on public.provider_configs for delete to authenticated
using (organization_id in (select om.organization_id from public.organization_members om where om.user_id = auth.uid() and om.is_active = true));
commit;
