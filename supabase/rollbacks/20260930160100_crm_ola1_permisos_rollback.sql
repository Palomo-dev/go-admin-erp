-- Rollback de 20260930160100_crm_ola1_permisos.sql
--
-- Restaura las dos funciones de etapas con su cuerpo anterior (decisión por
-- role_id in (1,2,5)), borra las funciones fn_crm_* y quita los permisos y las
-- concesiones que sembró la migración.
--
-- ORDEN: antes de este rollback hay que revertir las migraciones posteriores de
-- la ola 1 que llaman a fn_crm_tiene_permiso / fn_crm_exigir_permiso
-- (20260930160600, 160700, 160800 y 160900); si no, el DROP FUNCTION falla.
--
-- Datos: las concesiones de cargos (job_position_permissions) que alguien haya
-- hecho después sobre los códigos nuevos se borran en cascada con el permiso.

create or replace function public.fn_stages_guard_outcome_flags()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
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
$function$;

create or replace function public.update_stage_without_triggers(p_stage_id uuid, p_name text, p_color text, p_description text, p_probability numeric)
returns setof stages
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
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
$function$;

drop function if exists public.fn_crm_exigir_permiso(integer, text[]);
drop function if exists public.fn_crm_tiene_permiso(integer, text);

-- Concesiones de los permisos de leads que existían antes (solo el rol 2 los
-- tenía): se quitan las que añadió la migración a los roles 1, 4 y 5.
delete from public.role_permissions rp
 using public.permissions p
 where p.id = rp.permission_id
   and p.code in ('crm.leads.view', 'crm.leads.create', 'crm.leads.convert')
   and rp.role_id in (1, 4, 5);

-- Permisos nuevos: su borrado arrastra role_permissions y
-- job_position_permissions (ON DELETE CASCADE).
delete from public.permissions
 where code in (
   'crm.opportunities.view', 'crm.opportunities.create', 'crm.opportunities.edit',
   'crm.opportunities.edit_any', 'crm.opportunities.delete', 'crm.opportunities.close',
   'crm.stages.manage', 'crm.stages.override_gate', 'crm.pipelines.manage',
   'crm.activities.edit_any', 'crm.leads.edit', 'crm.leads.assign'
 );
