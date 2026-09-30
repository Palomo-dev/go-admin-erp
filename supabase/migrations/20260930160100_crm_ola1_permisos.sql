-- CRM ola 1 · M7 — permisos del CRM (plan docs/crm/PLAN-FIGMA-A-CODIGO.md §7.3, decisión D5).
--
-- 1. Catálogo: oportunidades, etapas, pipelines, actividades y la edición y
--    asignación de leads. Antes solo existían crm.customers.*, crm.contacts.*,
--    crm.leads.{view,create,convert} y crm.jobs.*.
-- 2. role_permissions (D5, 2026-09-29). Roles globales verificados en `roles`:
--    1 Super Admin, 2 Admin de organización, 4 Empleado, 5 Manager.
--      · 1, 2 y 5 → todos los permisos nuevos y los de leads.
--      · 4 (Empleado) → ver, crear y editar LO PROPIO: oportunidades
--        view/create/edit y leads view/create/edit/convert. Sin close,
--        delete, edit_any, override_gate, stages.manage ni pipelines.manage.
--    Un cargo (job_position_permissions) sigue teniendo precedencia: lo
--    resuelve check_user_permission.
-- 3. fn_crm_tiene_permiso / fn_crm_exigir_permiso: el punto único en SQL.
--    Atajo de administrador = espejo de ORG_ADMIN_ROLE_IDS
--    (src/lib/utils/orgAdmin.ts) e is_super_admin, igual que
--    fn_finanzas_exigir_permiso. El resto, por permiso.
-- 4. fn_stages_guard_outcome_flags y update_stage_without_triggers dejan de
--    decidir por role_id in (1,2,5): exigen crm.stages.manage.
--
-- Aditiva e idempotente. Rollback: supabase/rollbacks/20260930160100_crm_ola1_permisos_rollback.sql

-- ── 1. Catálogo ─────────────────────────────────────────────────────────────
insert into public.permissions (code, name, description, module, category)
select v.code, v.name, v.description, 'crm', v.category
  from (values
    ('crm.opportunities.view',     'Ver oportunidades',                  'Permite ver oportunidades, su detalle y su resumen financiero', 'opportunities'),
    ('crm.opportunities.create',   'Crear oportunidades',                'Permite crear oportunidades y calificar leads',                 'opportunities'),
    ('crm.opportunities.edit',     'Editar oportunidades propias',       'Permite editar y mover de etapa las oportunidades de las que es responsable o que creó', 'opportunities'),
    ('crm.opportunities.edit_any', 'Editar cualquier oportunidad',       'Permite editar, mover y reasignar oportunidades de otros responsables', 'opportunities'),
    ('crm.opportunities.delete',   'Eliminar oportunidades',             'Permite eliminar oportunidades sin documentos vinculados',       'opportunities'),
    ('crm.opportunities.close',    'Ganar o perder oportunidades',       'Permite marcar oportunidades como ganadas o perdidas',          'opportunities'),
    ('crm.stages.manage',          'Configurar etapas',                  'Permite crear, editar y reordenar etapas y marcar etapas ganadoras o perdedoras', 'stages'),
    ('crm.stages.override_gate',   'Saltar requisitos de etapa',         'Permite mover una oportunidad sin cumplir los requisitos de salida, con motivo auditado', 'stages'),
    ('crm.pipelines.manage',       'Gestionar pipelines',                'Permite crear pipelines desde plantilla, elegir el pipeline por defecto y eliminarlos', 'pipelines'),
    ('crm.activities.edit_any',    'Editar actividades de otros',        'Permite editar o eliminar actividades y notas registradas por otros usuarios', 'activities'),
    ('crm.leads.edit',             'Editar leads',                       'Permite editar y descartar los leads propios o sin responsable', 'leads'),
    ('crm.leads.assign',           'Asignar leads',                      'Permite asignar responsable a leads y editar cualquier lead',  'leads')
  ) as v(code, name, description, category)
on conflict (code) do nothing;

-- ── 2. role_permissions ─────────────────────────────────────────────────────
with concesiones(role_id, code) as (
  select r.role_id, c.code
    from (values (1), (2), (5)) as r(role_id)
   cross join (values
     ('crm.opportunities.view'), ('crm.opportunities.create'), ('crm.opportunities.edit'),
     ('crm.opportunities.edit_any'), ('crm.opportunities.delete'), ('crm.opportunities.close'),
     ('crm.stages.manage'), ('crm.stages.override_gate'), ('crm.pipelines.manage'),
     ('crm.activities.edit_any'), ('crm.leads.edit'), ('crm.leads.assign'),
     ('crm.leads.view'), ('crm.leads.create'), ('crm.leads.convert')
   ) as c(code)
  union all
  select 4, c.code
    from (values
      ('crm.opportunities.view'), ('crm.opportunities.create'), ('crm.opportunities.edit'),
      ('crm.leads.view'), ('crm.leads.create'), ('crm.leads.edit'), ('crm.leads.convert')
    ) as c(code)
)
insert into public.role_permissions (role_id, permission_id, allowed)
select c.role_id, p.id, true
  from concesiones c
  join public.permissions p on p.code = c.code
 where not exists (
   select 1 from public.role_permissions rp
    where rp.role_id = c.role_id and rp.permission_id = p.id
 );

-- ── 3. Punto único de permisos del CRM en SQL ───────────────────────────────
create or replace function public.fn_crm_tiene_permiso(p_org integer, p_code text)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    -- Sin usuario: service role o trabajo interno. anon y authenticated sin
    -- sesión nunca tienen permiso.
    return coalesce(auth.role(), '') not in ('anon', 'authenticated');
  end if;
  if p_org is null then
    return false;
  end if;
  -- Atajo de administrador: espejo de isOrgAdminLike (src/lib/utils/orgAdmin.ts).
  if exists (select 1 from public.organization_members om
              where om.user_id = v_uid and om.organization_id = p_org and om.is_active
                and (coalesce(om.is_super_admin, false) or om.role_id in (1, 2))) then
    return true;
  end if;
  return coalesce(public.check_user_permission(v_uid, p_org, p_code), false);
end;
$$;

comment on function public.fn_crm_tiene_permiso(integer, text) is
  'CRM ola 1 (M7): ¿el usuario de la sesión tiene el permiso en la organización? Admin (super admin o rol 1/2, espejo de orgAdmin.ts) o check_user_permission (rol + cargo). Sin sesión: solo service role.';

create or replace function public.fn_crm_exigir_permiso(p_org integer, p_codigos text[])
returns void
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_codigo text;
begin
  perform public.fn_assert_acceso_org(p_org);
  if auth.uid() is null then
    return;  -- solo el service role llega aquí (fn_assert_acceso_org rechaza anon)
  end if;
  foreach v_codigo in array coalesce(p_codigos, array[]::text[]) loop
    if public.fn_crm_tiene_permiso(p_org, v_codigo) then
      return;
    end if;
  end loop;
  raise exception 'sin_permiso' using errcode = '42501',
    detail = jsonb_build_object('permisos', p_codigos)::text;
end;
$$;

comment on function public.fn_crm_exigir_permiso(integer, text[]) is
  'CRM ola 1 (M7): acceso a la organización + al menos uno de los permisos, o 42501 sin_permiso.';

revoke all on function public.fn_crm_tiene_permiso(integer, text) from public, anon;
revoke all on function public.fn_crm_exigir_permiso(integer, text[]) from public, anon;
grant execute on function public.fn_crm_tiene_permiso(integer, text) to authenticated, service_role;
grant execute on function public.fn_crm_exigir_permiso(integer, text[]) to authenticated, service_role;

-- ── 4. Etapas: de role_id in (1,2,5) a crm.stages.manage ───────────────────
create or replace function public.fn_stages_guard_outcome_flags()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_org integer;
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
  -- CRM ola 1 (M7): por permiso, no por id de rol.
  if not public.fn_crm_tiene_permiso(v_org, 'crm.stages.manage') then
    raise exception 'Marcar una etapa como ganadora o perdedora requiere el permiso crm.stages.manage'
      using errcode = '42501';
  end if;
  return new;
end
$$;

create or replace function public.update_stage_without_triggers(p_stage_id uuid, p_name text, p_color text, p_description text, p_probability numeric)
returns setof stages
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  result public.stages%rowtype;
  v_uid  uuid := auth.uid();
  v_org  integer;
  v_ok   boolean;
begin
  -- La funcion corre como su propietario y se salta RLS: la autorizacion tiene
  -- que ser explicita. `auth.uid()` nulo solo puede venir de service_role o de
  -- un trabajo interno, porque a `anon` se le revoca EXECUTE.
  if v_uid is null then
    v_ok := true;
  else
    select p.organization_id into v_org
      from public.stages s
      join public.pipelines p on p.id = s.pipeline_id
     where s.id = p_stage_id;
    -- CRM ola 1 (M7): por permiso (crm.stages.manage), no por id de rol.
    v_ok := v_org is not null and public.fn_crm_tiene_permiso(v_org, 'crm.stages.manage');
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
$$;
