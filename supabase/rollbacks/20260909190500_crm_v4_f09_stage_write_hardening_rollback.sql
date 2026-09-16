-- ============================================================
-- ROLLBACK de 20260909190500_crm_v4_f09_stage_write_hardening
-- ============================================================
-- Escrito el 2026-09-15 (F0-DB ronda 3, B1): la migración se aplicó por MCP
-- sin dejar rollback; este archivo deshace su DDL en orden inverso.
-- Quita la guarda de is_won/is_lost (trigger + función), restaura
-- fn_log_stage_change con changed_by = null (versión anterior descrita en la
-- migración) y devuelve update_stage_without_triggers a una versión sin guarda
-- de pertenencia, sin search_path y con EXECUTE para PUBLIC/anon (el estado
-- inseguro que F9-41 cerró; el texto exacto anterior no quedó registrado).
--
-- SOBRE LOS DATOS: no toca datos. OJO: reabre F9-41 (cualquiera con la clave publicable puede editar etapas de cualquier organización).
-- ============================================================

begin;
create or replace function public.fn_log_stage_change()
returns trigger language plpgsql as $fn$
begin
  if new.stage_id is distinct from old.stage_id then
    insert into opportunity_stage_history (opportunity_id, organization_id, from_stage_id, to_stage_id, changed_by)
    values (new.id, new.organization_id, old.stage_id, new.stage_id, null);
  end if;
  return new;
end
$fn$;
alter function public.fn_log_stage_change() reset search_path;
grant execute on function public.fn_log_stage_change() to public;

drop trigger if exists trg_stages_guard_outcome_flags on public.stages;
drop function if exists public.fn_stages_guard_outcome_flags();

create or replace function public.update_stage_without_triggers(
  p_stage_id uuid, p_name text, p_color text, p_description text, p_probability numeric
) returns setof public.stages language plpgsql security definer as $fn$
declare result public.stages%rowtype;
begin
  alter table stages disable trigger refresh_forecast_on_stage_change;
  alter table stages disable trigger trg_refresh_forecast_on_stage;
  alter table stages disable trigger trg_refresh_forecast_stages;
  update stages set name = p_name, color = p_color, description = p_description, probability = p_probability, updated_at = now()
   where id = p_stage_id returning * into result;
  alter table stages enable trigger refresh_forecast_on_stage_change;
  alter table stages enable trigger trg_refresh_forecast_on_stage;
  alter table stages enable trigger trg_refresh_forecast_stages;
  return next result;
  return;
end
$fn$;
alter function public.update_stage_without_triggers(uuid, text, text, text, numeric) reset search_path;
grant execute on function public.update_stage_without_triggers(uuid, text, text, text, numeric) to public, anon, authenticated, service_role;
commit;
