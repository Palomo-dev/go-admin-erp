-- ============================================================
-- ROLLBACK de 20260910063313_crm_v4_f05_bridges_call_link
-- ============================================================
-- Escrito el 2026-09-15 (F0-DB ronda 3, B1): la migración se aplicó por MCP
-- sin dejar rollback; este archivo deshace su DDL en orden inverso.
-- Quita columnas, índices, trigger y función de F5 §3.1, saca
-- mobile_call_bridges de realtime y restaura mcb_update al patrón de
-- pertenencia por organización (la política exacta anterior no quedó
-- registrada; se reconstruye según la descripción de la migración).
--
-- SOBRE LOS DATOS: restaura la estructura, no los datos (enlace bridge↔call, cancelaciones y ajustes por org se pierden). OJO: cualquier miembro vuelve a poder cortar la llamada de otro.
-- ============================================================

begin;
do $do$ begin
  if exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='mobile_call_bridges') then
    alter publication supabase_realtime drop table public.mobile_call_bridges;
  end if;
end $do$;
alter table public.comm_settings drop constraint if exists comm_settings_voice_bridge_agent_timeout_check;
alter table public.comm_settings
  drop column if exists voice_bridge_agent_timeout, drop column if exists voice_bridge_confirm_digit, drop column if exists voice_mobile_ivr_enabled;
drop trigger if exists trg_mcb_touch on public.mobile_call_bridges;
drop function if exists public.fn_touch_updated_at();
drop policy if exists mcb_update on public.mobile_call_bridges;
create policy mcb_update on public.mobile_call_bridges for update
  using (organization_id in (select om.organization_id from public.organization_members om where om.user_id = auth.uid() and om.is_active = true))
  with check (organization_id in (select om.organization_id from public.organization_members om where om.user_id = auth.uid() and om.is_active = true));
drop index if exists public.idx_bridges_org_active;
drop index if exists public.idx_bridges_agent_leg;
drop index if exists public.idx_bridges_call;
alter table public.mobile_call_bridges
  drop column if exists last_error, drop column if exists cancel_requested_at, drop column if exists call_id;
commit;
