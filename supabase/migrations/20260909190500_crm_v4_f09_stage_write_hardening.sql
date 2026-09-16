-- Aplicada el 2026-09-09 vía MCP (apply_migration) como `crm_v4_f09_stage_write_hardening`. Archivo reconstruido desde supabase_migrations.schema_migrations el 2026-09-15 (F0-DB ronda 3, B1).
-- Motivo: la migración se aplicó sin dejar su .sql en el repositorio; el cuerpo es statements[1] byte a byte (md5 bee45de29f0e6cc8354b822a53a4d0b8). No reformatear.
-- FASE-09 ronda 3 · F9-41 / F9-43
--
-- 1) `update_stage_without_triggers` era SECURITY DEFINER sin `search_path`,
--    con EXECUTE para PUBLIC y `anon`, y sin ninguna comprobacion de
--    pertenencia: cualquiera con la clave publicable podia renombrar o
--    reconfigurar CUALQUIER etapa de CUALQUIER organizacion saltandose RLS.
-- 2) Marcar una etapa como ganadora/perdedora tiene consecuencias contables
--    desde que `is_won` decide cierres y comisiones: se restringe a jefatura.
-- 3) `fn_log_stage_change` insertaba `changed_by = null` literal, asi que el
--    historial de etapas no tenia autor y el filtro por usuario del timeline
--    no devolvia nada (F9-43).

-- ── 1) RPC de edicion de etapa ──────────────────────────────────────────────
create or replace function public.update_stage_without_triggers(
  p_stage_id uuid,
  p_name text,
  p_color text,
  p_description text,
  p_probability numeric
)
returns setof public.stages
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  result public.stages%rowtype;
  v_uid  uuid := auth.uid();
  v_ok   boolean;
begin
  -- La funcion corre como su propietario y se salta RLS: la autorizacion tiene
  -- que ser explicita. `auth.uid()` nulo solo puede venir de service_role o de
  -- un trabajo interno, porque a `anon` se le revoca EXECUTE mas abajo.
  if v_uid is null then
    v_ok := true;
  else
    select exists (
      select 1
      from public.stages s
      join public.pipelines p on p.id = s.pipeline_id
      join public.organization_members m on m.organization_id = p.organization_id
      where s.id = p_stage_id
        and m.user_id = v_uid
        and coalesce(m.is_active, true)
        and (coalesce(m.is_super_admin, false) or m.role_id in (1, 2, 5))
    ) into v_ok;
  end if;

  if not coalesce(v_ok, false) then
    raise exception 'No autorizado para modificar esta etapa' using errcode = '42501';
  end if;

  -- Se conserva el comportamiento original: los triggers de forecast se
  -- desactivan durante la escritura y se vuelven a activar al terminar.
  alter table stages disable trigger refresh_forecast_on_stage_change;
  alter table stages disable trigger trg_refresh_forecast_on_stage;
  alter table stages disable trigger trg_refresh_forecast_stages;

  update stages
     set name = p_name,
         color = p_color,
         description = p_description,
         probability = p_probability,
         updated_at = now()
   where id = p_stage_id
  returning * into result;

  alter table stages enable trigger refresh_forecast_on_stage_change;
  alter table stages enable trigger trg_refresh_forecast_on_stage;
  alter table stages enable trigger trg_refresh_forecast_stages;

  if result.id is null then
    raise exception 'Etapa no encontrada' using errcode = 'P0002';
  end if;

  return next result;
  return;
end
$fn$;

revoke all on function public.update_stage_without_triggers(uuid, text, text, text, numeric) from public;
revoke all on function public.update_stage_without_triggers(uuid, text, text, text, numeric) from anon;
grant execute on function public.update_stage_without_triggers(uuid, text, text, text, numeric) to authenticated;
grant execute on function public.update_stage_without_triggers(uuid, text, text, text, numeric) to service_role;

-- ── 2) Guarda de is_won / is_lost ───────────────────────────────────────────
create or replace function public.fn_stages_guard_outcome_flags()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_uid uuid := auth.uid();
  v_org integer;
  v_ok  boolean;
begin
  -- Integridad: `fn_sync_status_from_stage` no sabe que hacer con las dos a la vez.
  if coalesce(new.is_won, false) and coalesce(new.is_lost, false) then
    raise exception 'Una etapa no puede ser ganadora y perdedora a la vez' using errcode = '23514';
  end if;

  -- Solo se controla el cambio de desenlace; nombre, color, orden y
  -- probabilidad siguen siendo edicion normal de cualquier miembro.
  if tg_op = 'UPDATE'
     and coalesce(new.is_won, false) is not distinct from coalesce(old.is_won, false)
     and coalesce(new.is_lost, false) is not distinct from coalesce(old.is_lost, false) then
    return new;
  end if;
  if tg_op = 'INSERT' and not coalesce(new.is_won, false) and not coalesce(new.is_lost, false) then
    return new;
  end if;

  -- service_role / semillas del backend (plantillas de pipeline, onboarding).
  if v_uid is null then
    return new;
  end if;

  select p.organization_id into v_org from public.pipelines p where p.id = new.pipeline_id;
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = v_org
      and m.user_id = v_uid
      and coalesce(m.is_active, true)
      and (coalesce(m.is_super_admin, false) or m.role_id in (1, 2, 5))
  ) into v_ok;

  if not coalesce(v_ok, false) then
    raise exception 'Marcar una etapa como ganadora o perdedora requiere rol de administracion o jefatura comercial'
      using errcode = '42501';
  end if;
  return new;
end
$fn$;

revoke all on function public.fn_stages_guard_outcome_flags() from public;
revoke all on function public.fn_stages_guard_outcome_flags() from anon;

drop trigger if exists trg_stages_guard_outcome_flags on public.stages;
create trigger trg_stages_guard_outcome_flags
  before insert or update on public.stages
  for each row execute function public.fn_stages_guard_outcome_flags();

-- ── 3) Autor del cambio de etapa ────────────────────────────────────────────
create or replace function public.fn_log_stage_change()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $fn$
begin
  if new.stage_id is distinct from old.stage_id then
    insert into opportunity_stage_history
      (opportunity_id, organization_id, from_stage_id, to_stage_id, changed_by)
    values (new.id, new.organization_id, old.stage_id, new.stage_id, auth.uid());
  end if;
  return new;
end
$fn$;

revoke all on function public.fn_log_stage_change() from public;
revoke all on function public.fn_log_stage_change() from anon;