-- Logística: permisos propios y cargos «Despachador» y «Domiciliario» (2026-11-23).
--
-- Decisión del dueño: Despachador y Domiciliario son CARGOS, no roles. El rol de esas personas
-- sigue siendo «Empleado»; lo que pueden hacer en Logística sale del cargo, como en el resto del
-- ERP (`get_user_permission_codes` combina rol + cargo, y el cargo manda).
--
-- 1. Permisos `logistica.view`, `logistica.manage` y `logistica.deliver`.
-- 2. `fn_logistica_gestiona` deja de ser «cualquier cajero» (`pos.create`) y pasa a
--    `logistica.manage`. Administradores, super admin y `admin.full_access` siguen pudiendo
--    (`fn_caja_puede`). Es el único punto: lo usan la RLS de `driver_credentials`,
--    `fn_logistica_ve_todo` y las rutas `/api/logistica/domiciliarios`.
-- 3. `fn_logistica_crear_cargos(org)`: crea, si faltan, los dos cargos en el departamento
--    «Operaciones» (OPE), con sus permisos. El Domiciliario solo ve el módulo Logística y, en el
--    menú, «Mis envíos». Si la organización ya tiene el cargo (mismo código), no se toca.
-- 4. Los cargos se crean al activar el módulo `logistica` (trigger en organization_modules).
-- 5. Se activa Logística en las 6 organizaciones con domicilios web propios en los últimos
--    120 días (aprobado por el dueño el 2026-11-23; Plan Ultimate, sin límite de módulos).
--
-- La visibilidad de los datos no cambia: un miembro que no es domiciliario sigue leyendo los
-- envíos (los usan Transporte, Pedidos online y el POS). Lo que cambia es quién gestiona.

-- ── 1. Permisos ─────────────────────────────────────────────────────────────

insert into public.permissions (code, name, description, module, category)
values
  ('logistica.view', 'Ver envíos', 'Por despachar, envíos y seguimiento', 'logistica', 'logistica'),
  ('logistica.manage', 'Despachar envíos', 'Asignar domiciliarios, cambiar estados, dar de alta domiciliarios y recibir cuadres', 'logistica', 'logistica'),
  ('logistica.deliver', 'Entregar envíos', 'App del domiciliario: sus envíos, entregar y registrar novedades', 'logistica', 'logistica')
on conflict (code) do nothing;

-- ── 2. Quién gestiona ───────────────────────────────────────────────────────

create or replace function public.fn_logistica_gestiona(p_org integer)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.fn_caja_puede(p_org, 'logistica.manage');
$$;

comment on function public.fn_logistica_gestiona(integer) is
  'Logística: gestionar domiciliarios, asignar y ver todos los envíos. Permiso logistica.manage (por cargo, p. ej. Despachador), administradores, super admin o admin.full_access.';

-- ── 3. Cargos ───────────────────────────────────────────────────────────────

create or replace function public.fn_logistica_crear_cargos(p_org integer)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dept uuid;
  v_despachador uuid;
  v_domiciliario uuid;
begin
  if p_org is null then
    return;
  end if;

  select d.id into v_dept
    from public.departments d
   where d.organization_id = p_org and d.code = 'OPE'
   order by d.created_at
   limit 1;

  insert into public.job_positions (organization_id, department_id, code, name, description, level, is_active)
  values
    (p_org, v_dept, 'LOG-DESPACHO', 'Despachador', 'Prepara y despacha envíos, asigna domiciliarios y recibe cuadres', 'junior', true),
    (p_org, v_dept, 'LOG-DOMICILIO', 'Domiciliario', 'Entrega pedidos a domicilio y cobra contraentregas', 'junior', true)
  on conflict (organization_id, code) do nothing;

  select id into v_despachador from public.job_positions where organization_id = p_org and code = 'LOG-DESPACHO';
  select id into v_domiciliario from public.job_positions where organization_id = p_org and code = 'LOG-DOMICILIO';

  insert into public.job_position_permissions (job_position_id, permission_id, allowed)
  select v_despachador, p.id, true from public.permissions p
   where v_despachador is not null and p.code in ('logistica.view', 'logistica.manage')
  on conflict (job_position_id, permission_id) do nothing;

  insert into public.job_position_permissions (job_position_id, permission_id, allowed)
  select v_domiciliario, p.id, true from public.permissions p
   where v_domiciliario is not null and p.code = 'logistica.deliver'
  on conflict (job_position_id, permission_id) do nothing;

  -- El Domiciliario entra solo a Logística y ve «Mis envíos» en el menú. Si la organización ya
  -- configuró accesos para ese cargo, no se agregan filas (no se pisa su configuración).
  if v_domiciliario is not null
     and not exists (select 1 from public.job_position_module_access where job_position_id = v_domiciliario)
     and not exists (select 1 from public.job_position_page_access where job_position_id = v_domiciliario) then
    insert into public.job_position_module_access (job_position_id, module_code, can_view, can_access)
    values (v_domiciliario, 'logistica', true, true);
    insert into public.job_position_page_access (job_position_id, module_code, page_href, can_view, can_access)
    values (v_domiciliario, 'logistica', '/app/logistica/mis-envios', true, true);
  end if;
end;
$$;

revoke all on function public.fn_logistica_crear_cargos(integer) from public, anon, authenticated;
grant execute on function public.fn_logistica_crear_cargos(integer) to service_role;

comment on function public.fn_logistica_crear_cargos(integer) is
  'Crea, si faltan, los cargos Despachador (logistica.view + manage) y Domiciliario (logistica.deliver, solo Mis envíos) en Operaciones. Idempotente.';

-- ── 4. Al activar el módulo ─────────────────────────────────────────────────

create or replace function public.fn_logistica_cargos_al_activar()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.module_code = 'logistica' and coalesce(new.is_active, false)
     and (tg_op = 'INSERT' or not coalesce(old.is_active, false)) then
    perform public.fn_logistica_crear_cargos(new.organization_id);
  end if;
  return new;
end;
$$;

revoke all on function public.fn_logistica_cargos_al_activar() from public, anon, authenticated;

drop trigger if exists trg_logistica_cargos_al_activar on public.organization_modules;
create trigger trg_logistica_cargos_al_activar
  after insert or update of is_active on public.organization_modules
  for each row execute function public.fn_logistica_cargos_al_activar();

-- ── 5. Activar Logística en las 6 organizaciones aprobadas ──────────────────

insert into public.organization_modules (organization_id, module_code, is_active)
select o.id, 'logistica', true
  from public.organizations o
 where o.id in (333, 335, 337, 338, 339, 358)
on conflict (organization_id, module_code) do update
  set is_active = true, disabled_at = null, updated_at = now()
  where not public.organization_modules.is_active;

-- Organizaciones que ya tenían Logística activa (el trigger no corre para ellas): mismos cargos.
select public.fn_logistica_crear_cargos(m.organization_id)
  from public.organization_modules m
 where m.module_code = 'logistica' and m.is_active;
