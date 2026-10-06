-- Roles y permisos por organización (Figma «13. Equipo › Roles y permisos»;
-- docs/acceso/ROLES-Y-PERMISOS-ANALISIS.md §3.1 y §5, fases 0 y 1).
--
-- PENDIENTE DE APLICAR (vive en supabase/pendientes/; al aplicarla por MCP pasa a
-- supabase/migrations/ y su reversión a supabase/rollbacks/). Escrita el 2026-10-06 junto con la pantalla nueva de /app/roles; la
-- aplica el dueño por MCP (apply_migration) después de revisarla. Hasta entonces la pantalla lee
-- (lista, matriz, comparar, «¿qué puede hacer?») y toda escritura responde 503
-- `migracion_pendiente`.
--
-- Qué arregla (numeración del análisis):
--   1. Roles globales editables desde cualquier organización: la RLS de role_permissions dejaba
--      escribir a cualquier admin (rol 1/2) de CUALQUIER organización sin mirar is_system, y
--      guardar «Empleado» cambiaba a todas las organizaciones que lo usan. Ahora ni roles ni
--      role_permissions se escriben con la sesión: solo por las RPC de abajo, que exigen un rol
--      PROPIO de la organización de quien llama.
--   2. Un rol «personalizado» no tenía organización y la política INSERT («Solo admins pueden
--      crear roles») aceptaba a un admin de cualquier organización; `roles_system_protection`
--      (ALL, USING is_system = false) dejaba además a cualquier autenticado insertar, editar o
--      borrar cualquier rol no-sistema. Se sustituyen por `roles.organization_id` (NULL = sistema)
--      y lectura por pertenencia.
--   4. job_position_permissions se escribía con cualquier miembro activo: un empleado podía
--      concederse permisos editando su propio cargo. Ahora: admin o hr.positions.edit en la
--      organización del cargo.
--   7. DELETE + INSERT desde el navegador sin transacción: si fallaba el INSERT, el rol quedaba
--      sin permisos. Las RPC aplican solo la diferencia, en una transacción.
--   22. Eliminar un rol con personas: organization_members.role_id es ON DELETE CASCADE, así que
--      borrar el rol BORRABA las membresías. fn_rol_eliminar exige un rol de destino y reasigna
--      personas e invitaciones antes de borrar.
--   26. Conflicto de edición concurrente: roles.version y job_positions.updated_at.
--
-- Criterio de permiso: el mismo que fn_miembro_gestion_guarda (super admin, rol 1/2 por id o el
-- permiso resuelto por check_user_permission), nunca por el nombre del rol (regla 6).
--
-- Cambio de unicidad: `roles_name_key` (UNIQUE(name) global) impedía que dos organizaciones
-- llamaran igual a su rol. Se sustituye por dos índices únicos parciales: nombres de sistema
-- únicos entre sí y nombres propios únicos dentro de cada organización. No borra ni cambia datos.

-- ─── 1. Modelo ──────────────────────────────────────────────────────────────

alter table public.roles add column if not exists organization_id integer null
  references public.organizations(id) on delete cascade;
alter table public.roles add column if not exists version integer not null default 1;
alter table public.roles add column if not exists updated_at timestamptz not null default now();
alter table public.roles add column if not exists based_on_role_id integer null
  references public.roles(id) on delete set null;

comment on column public.roles.organization_id is
  'Organización dueña del rol. NULL = rol del sistema (solo lectura y duplicable desde las organizaciones).';
comment on column public.roles.version is
  'Control de concurrencia: fn_rol_guardar exige la versión que la pantalla leyó (conflicto si otra persona guardó antes).';
comment on column public.roles.based_on_role_id is
  'Plantilla de la que se creó el rol (informativo).';

create index if not exists idx_roles_organization_id on public.roles (organization_id);
create unique index if not exists roles_nombre_sistema_uq on public.roles (lower(name)) where organization_id is null;
create unique index if not exists roles_nombre_organizacion_uq on public.roles (organization_id, lower(name)) where organization_id is not null;
alter table public.roles drop constraint if exists roles_name_key;

-- ─── 2. Guarda única ────────────────────────────────────────────────────────

create or replace function public.fn_roles_puede(p_organization_id integer, p_codigo text)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select auth.uid() is not null
     and exists (
       select 1 from public.organization_members om
        where om.user_id = auth.uid()
          and om.organization_id = p_organization_id
          and om.is_active
          and (coalesce(om.is_super_admin, false)
               or om.role_id in (1, 2)
               or public.check_user_permission(auth.uid(), p_organization_id, p_codigo))
     );
$$;
revoke all on function public.fn_roles_puede(integer, text) from public, anon;
grant execute on function public.fn_roles_puede(integer, text) to authenticated;

create or replace function public.fn_rol_exigir(p_organization_id integer, p_codigo text)
returns void
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if auth.uid() is null then
    raise exception 'roles: se necesita una sesión' using errcode = '42501';
  end if;
  if not public.fn_roles_puede(p_organization_id, p_codigo) then
    raise exception 'roles: no tienes permiso (%)', p_codigo using errcode = '42501';
  end if;
end;
$$;
revoke all on function public.fn_rol_exigir(integer, text) from public, anon;
grant execute on function public.fn_rol_exigir(integer, text) to authenticated;

-- Permisos válidos y sin repetir (los ids que no existen se rechazan, no se ignoran).
create or replace function public.fn_roles_permisos_validos(p_permisos integer[])
returns integer[]
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_ids integer[] := coalesce((select array_agg(distinct x) from unnest(coalesce(p_permisos, '{}')) x where x is not null), '{}');
begin
  if exists (select 1 from unnest(v_ids) x where not exists (select 1 from public.permissions p where p.id = x)) then
    raise exception 'roles: hay permisos que no existen' using errcode = '22023';
  end if;
  return v_ids;
end;
$$;
revoke all on function public.fn_roles_permisos_validos(integer[]) from public, anon;

create or replace function public.fn_roles_nombre_valido(p_nombre text)
returns text
language plpgsql
immutable
set search_path to 'public', 'pg_temp'
as $$
declare
  v text := btrim(coalesce(p_nombre, ''));
begin
  if char_length(v) < 2 or char_length(v) > 60 then
    raise exception 'roles: el nombre debe tener entre 2 y 60 caracteres' using errcode = '22023';
  end if;
  return v;
end;
$$;
revoke all on function public.fn_roles_nombre_valido(text) from public, anon;

-- ─── 3. RPC de roles ────────────────────────────────────────────────────────

-- Crear un rol propio (en blanco, desde una plantilla o duplicando un rol del sistema).
-- p_permisos NULL = copiar los de la plantilla.
create or replace function public.fn_rol_crear(
  p_organization_id integer,
  p_nombre text,
  p_descripcion text,
  p_plantilla_id integer,
  p_permisos integer[]
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_nombre text;
  v_plantilla public.roles;
  v_permisos integer[];
  v_id integer;
begin
  perform public.fn_rol_exigir(p_organization_id, 'roles.create');
  v_nombre := public.fn_roles_nombre_valido(p_nombre);

  if exists (select 1 from public.roles r
              where lower(r.name) = lower(v_nombre)
                and (r.organization_id is null or r.organization_id = p_organization_id)) then
    raise exception 'roles: ya existe un rol con ese nombre' using errcode = '23505';
  end if;

  if p_plantilla_id is not null then
    select * into v_plantilla from public.roles where id = p_plantilla_id;
    if not found or (v_plantilla.organization_id is not null and v_plantilla.organization_id <> p_organization_id) then
      raise exception 'roles: plantilla no encontrada' using errcode = 'P0002';
    end if;
    -- Super Admin y Admin de organización (ids 1 y 2, el criterio de admin del repo) no son
    -- plantillas: su poder sale del id del rol, no de sus permisos, y una copia no lo tendría.
    if v_plantilla.organization_id is null and v_plantilla.id in (1, 2) then
      raise exception 'roles: ese rol no se puede usar como plantilla' using errcode = '22023';
    end if;
  end if;

  if p_permisos is null then
    v_permisos := coalesce((select array_agg(rp.permission_id) from public.role_permissions rp
                             where rp.role_id = p_plantilla_id and rp.allowed), '{}');
  else
    v_permisos := public.fn_roles_permisos_validos(p_permisos);
  end if;

  insert into public.roles (name, description, is_system, organization_id, based_on_role_id, version, updated_at)
  values (v_nombre, nullif(btrim(coalesce(p_descripcion, '')), ''), false, p_organization_id, p_plantilla_id, 1, now())
  returning id into v_id;

  insert into public.role_permissions (role_id, permission_id, allowed)
  select v_id, x, true from unnest(v_permisos) x;

  return jsonb_build_object('id', v_id, 'version', 1, 'permisos', coalesce(array_length(v_permisos, 1), 0));
end;
$$;
revoke all on function public.fn_rol_crear(integer, text, text, integer, integer[]) from public, anon;
grant execute on function public.fn_rol_crear(integer, text, text, integer, integer[]) to authenticated;

-- Guardar nombre, descripción y permisos de un rol PROPIO con control de versión.
-- 40001 = otra persona guardó después de que la pantalla leyera p_version.
create or replace function public.fn_rol_guardar(
  p_role_id integer,
  p_version integer,
  p_nombre text,
  p_descripcion text,
  p_permisos integer[]
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_rol public.roles;
  v_nombre text;
  v_permisos integer[];
  v_quitados integer;
  v_anadidos integer;
begin
  select * into v_rol from public.roles where id = p_role_id for update;
  if not found then
    raise exception 'roles: rol no encontrado' using errcode = 'P0002';
  end if;
  if v_rol.organization_id is null or coalesce(v_rol.is_system, false) then
    raise exception 'roles: los roles del sistema no se editan; duplícalo como rol propio' using errcode = '42501';
  end if;
  perform public.fn_rol_exigir(v_rol.organization_id, 'roles.edit');

  if p_version is null or v_rol.version <> p_version then
    raise exception 'roles: otra persona guardó este rol mientras lo editabas'
      using errcode = '40001', detail = v_rol.version::text;
  end if;

  v_nombre := public.fn_roles_nombre_valido(coalesce(p_nombre, v_rol.name));
  if lower(v_nombre) <> lower(v_rol.name) and exists (
       select 1 from public.roles r
        where r.id <> v_rol.id and lower(r.name) = lower(v_nombre)
          and (r.organization_id is null or r.organization_id = v_rol.organization_id)) then
    raise exception 'roles: ya existe un rol con ese nombre' using errcode = '23505';
  end if;

  v_permisos := public.fn_roles_permisos_validos(p_permisos);

  -- Solo la diferencia: el registro de auditoría (log_role_changes) deja una fila por cambio
  -- real, no 150 bajas y 150 altas por cada guardado.
  delete from public.role_permissions rp
   where rp.role_id = v_rol.id and not (rp.permission_id = any (v_permisos));
  get diagnostics v_quitados = row_count;

  update public.role_permissions rp set allowed = true
   where rp.role_id = v_rol.id and rp.permission_id = any (v_permisos) and not rp.allowed;

  insert into public.role_permissions (role_id, permission_id, allowed)
  select v_rol.id, x, true from unnest(v_permisos) x
   where not exists (select 1 from public.role_permissions rp where rp.role_id = v_rol.id and rp.permission_id = x);
  get diagnostics v_anadidos = row_count;

  update public.roles
     set name = v_nombre,
         description = case when p_descripcion is null then description else nullif(btrim(p_descripcion), '') end,
         version = version + 1,
         updated_at = now()
   where id = v_rol.id
  returning * into v_rol;

  return jsonb_build_object('id', v_rol.id, 'version', v_rol.version, 'updated_at', v_rol.updated_at,
                            'anadidos', v_anadidos, 'quitados', v_quitados);
end;
$$;
revoke all on function public.fn_rol_guardar(integer, integer, text, text, integer[]) from public, anon;
grant execute on function public.fn_rol_guardar(integer, integer, text, text, integer[]) to authenticated;

-- Eliminar un rol PROPIO. Si alguien lo tiene (o una invitación pendiente lo usa), exige un rol de
-- destino y reasigna antes de borrar: organization_members.role_id es ON DELETE CASCADE y sin esto
-- se borraban las membresías.
create or replace function public.fn_rol_eliminar(p_role_id integer, p_rol_destino integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_rol public.roles;
  v_destino public.roles;
  v_miembros integer;
  v_invitaciones integer;
  v_ajenos integer;
begin
  select * into v_rol from public.roles where id = p_role_id for update;
  if not found then
    raise exception 'roles: rol no encontrado' using errcode = 'P0002';
  end if;
  if v_rol.organization_id is null or coalesce(v_rol.is_system, false) then
    raise exception 'roles: los roles del sistema no se eliminan' using errcode = '42501';
  end if;
  perform public.fn_rol_exigir(v_rol.organization_id, 'roles.delete');

  select count(*) into v_ajenos from public.organization_members
   where role_id = v_rol.id and organization_id <> v_rol.organization_id;
  if v_ajenos > 0 then
    raise exception 'roles: el rol lo usan personas de otra organización' using errcode = '42501';
  end if;

  select count(*) into v_miembros from public.organization_members where role_id = v_rol.id;
  select count(*) into v_invitaciones from public.invitations
   where role_id = v_rol.id and organization_id = v_rol.organization_id;

  if v_miembros + v_invitaciones > 0 then
    if p_rol_destino is null then
      raise exception 'roles: el rol tiene personas; elige a qué rol pasan' using errcode = '22023';
    end if;
    perform public.fn_rol_exigir(v_rol.organization_id, 'roles.assign');
    select * into v_destino from public.roles where id = p_rol_destino;
    if not found or v_destino.id = v_rol.id
       or (v_destino.organization_id is not null and v_destino.organization_id <> v_rol.organization_id) then
      raise exception 'roles: rol de destino no válido' using errcode = '22023';
    end if;
    if v_destino.organization_id is null and v_destino.id = 1 and not exists (
         select 1 from public.organization_members
          where user_id = auth.uid() and organization_id = v_rol.organization_id and is_active and is_super_admin) then
      raise exception 'roles: solo un super admin asigna el rol Super Admin' using errcode = '42501';
    end if;

    update public.organization_members set role_id = v_destino.id
     where role_id = v_rol.id and organization_id = v_rol.organization_id;
    update public.invitations set role_id = v_destino.id
     where role_id = v_rol.id and organization_id = v_rol.organization_id;
  end if;

  delete from public.role_permissions where role_id = v_rol.id;
  delete from public.roles where id = v_rol.id;

  return jsonb_build_object('id', v_rol.id, 'reasignados', v_miembros, 'invitaciones', v_invitaciones,
                            'destino', v_destino.id);
end;
$$;
revoke all on function public.fn_rol_eliminar(integer, integer) from public, anon;
grant execute on function public.fn_rol_eliminar(integer, integer) to authenticated;

-- Asignar un rol a varias personas en una sola transacción. Cada cambio pasa por
-- fn_miembro_cambiar_rol (roles.assign, nunca a uno mismo ni al dueño, Super Admin solo por
-- otro super admin). Si uno falla, no cambia ninguno y el error dice cuál (DETAIL = id).
create or replace function public.fn_rol_asignar_miembros(
  p_organization_id integer,
  p_role_id integer,
  p_member_ids bigint[]
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_rol public.roles;
  v_id bigint;
  v_estado text;
  v_mensaje text;
  v_total integer := 0;
begin
  perform public.fn_rol_exigir(p_organization_id, 'roles.assign');
  select * into v_rol from public.roles where id = p_role_id;
  if not found or (v_rol.organization_id is not null and v_rol.organization_id <> p_organization_id) then
    raise exception 'roles: rol no encontrado' using errcode = 'P0002';
  end if;
  if coalesce(array_length(p_member_ids, 1), 0) = 0 then
    raise exception 'roles: elige al menos una persona' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(p_member_ids) m
              where not exists (select 1 from public.organization_members om
                                 where om.id = m and om.organization_id = p_organization_id)) then
    raise exception 'roles: hay personas que no son de esta organización' using errcode = '42501';
  end if;

  foreach v_id in array (select array_agg(distinct x) from unnest(p_member_ids) x) loop
    begin
      perform public.fn_miembro_cambiar_rol(v_id, p_role_id);
      v_total := v_total + 1;
    exception when others then
      get stacked diagnostics v_estado = returned_sqlstate, v_mensaje = message_text;
      raise exception '%', replace(v_mensaje, 'miembros: ', 'roles: ')
        using errcode = v_estado, detail = v_id::text;
    end;
  end loop;

  return jsonb_build_object('role_id', p_role_id, 'asignados', v_total);
end;
$$;
revoke all on function public.fn_rol_asignar_miembros(integer, integer, bigint[]) from public, anon;
grant execute on function public.fn_rol_asignar_miembros(integer, integer, bigint[]) to authenticated;

-- ─── 4. Cargos ──────────────────────────────────────────────────────────────

-- Permisos que SUMA un cargo, con control de concurrencia por job_positions.updated_at.
-- Las filas allowed = false (hoy 0) se respetan: la pantalla solo gestiona lo que el cargo suma.
create or replace function public.fn_cargo_guardar_permisos(
  p_job_position_id uuid,
  p_updated_at timestamptz,
  p_permisos integer[]
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_cargo public.job_positions;
  v_permisos integer[];
  v_quitados integer;
  v_anadidos integer;
begin
  select * into v_cargo from public.job_positions where id = p_job_position_id for update;
  if not found then
    raise exception 'roles: cargo no encontrado' using errcode = 'P0002';
  end if;
  perform public.fn_rol_exigir(v_cargo.organization_id, 'hr.positions.edit');

  if p_updated_at is null or v_cargo.updated_at is distinct from p_updated_at then
    raise exception 'roles: otra persona guardó este cargo mientras lo editabas'
      using errcode = '40001', detail = coalesce(v_cargo.updated_at::text, '');
  end if;

  v_permisos := public.fn_roles_permisos_validos(p_permisos);

  delete from public.job_position_permissions jpp
   where jpp.job_position_id = v_cargo.id and jpp.allowed and not (jpp.permission_id = any (v_permisos));
  get diagnostics v_quitados = row_count;

  insert into public.job_position_permissions (job_position_id, permission_id, allowed)
  select v_cargo.id, x, true from unnest(v_permisos) x
  on conflict (job_position_id, permission_id) do nothing;
  get diagnostics v_anadidos = row_count;

  update public.job_positions set updated_at = now() where id = v_cargo.id returning * into v_cargo;

  return jsonb_build_object('id', v_cargo.id, 'updated_at', v_cargo.updated_at,
                            'anadidos', v_anadidos, 'quitados', v_quitados);
end;
$$;
revoke all on function public.fn_cargo_guardar_permisos(uuid, timestamptz, integer[]) from public, anon;
grant execute on function public.fn_cargo_guardar_permisos(uuid, timestamptz, integer[]) to authenticated;

-- ─── 5. Alcance por sucursal de una persona ────────────────────────────────

-- Sin función propia: Roles y permisos llama a fn_miembro_asignar_sucursales (migración
-- 20261006040701, aplicada), la misma que Organización › Miembros. «Todas» es explícito
-- (p_todas = true) y una lista vacía es un error, nunca «todas». (Antes había aquí una
-- fn_alcance_sucursal_guardar que repetía esa lógica y trataba la lista vacía como «todas».)

-- ─── 6. RLS ─────────────────────────────────────────────────────────────────

-- roles: lectura de los del sistema y los de mis organizaciones; escritura solo por RPC
-- (y la plataforma, como en permissions).
drop policy if exists "Solo admins pueden crear roles" on public.roles;
drop policy if exists roles_manage_for_superadmins on public.roles;
drop policy if exists roles_system_protection on public.roles;
drop policy if exists roles_select_for_authenticated on public.roles;
drop policy if exists roles_select_sistema_y_propios on public.roles;
create policy roles_select_sistema_y_propios on public.roles
  for select to authenticated
  using (
    organization_id is null
    or organization_id in (select om.organization_id from public.organization_members om
                            where om.user_id = (select auth.uid()) and om.is_active)
  );
drop policy if exists roles_plataforma on public.roles;
create policy roles_plataforma on public.roles
  for all to authenticated
  using ((select public.fn_is_platform_admin()))
  with check ((select public.fn_is_platform_admin()));

-- role_permissions: lectura de los roles visibles; escritura solo por RPC (y plataforma).
drop policy if exists role_permissions_all_for_superadmins on public.role_permissions;
drop policy if exists role_permissions_delete_for_org_admins on public.role_permissions;
drop policy if exists role_permissions_insert_for_org_admins on public.role_permissions;
drop policy if exists role_permissions_update_for_org_admins on public.role_permissions;
drop policy if exists role_permissions_select_for_authenticated on public.role_permissions;
drop policy if exists role_permissions_select_roles_visibles on public.role_permissions;
create policy role_permissions_select_roles_visibles on public.role_permissions
  for select to authenticated
  using (
    exists (select 1 from public.roles r
             where r.id = role_permissions.role_id
               and (r.organization_id is null
                    or r.organization_id in (select om.organization_id from public.organization_members om
                                              where om.user_id = (select auth.uid()) and om.is_active)))
  );
drop policy if exists role_permissions_plataforma on public.role_permissions;
create policy role_permissions_plataforma on public.role_permissions
  for all to authenticated
  using ((select public.fn_is_platform_admin()))
  with check ((select public.fn_is_platform_admin()));

-- job_position_permissions: leer, cualquier miembro activo de la organización del cargo;
-- escribir, admin o hr.positions.edit en esa organización.
drop policy if exists job_position_permissions_org_access on public.job_position_permissions;
drop policy if exists job_position_permissions_select_miembros on public.job_position_permissions;
create policy job_position_permissions_select_miembros on public.job_position_permissions
  for select to authenticated
  using (
    exists (select 1 from public.job_positions jp
              join public.organization_members om on om.organization_id = jp.organization_id
             where jp.id = job_position_permissions.job_position_id
               and om.user_id = (select auth.uid()) and om.is_active)
  );
drop policy if exists job_position_permissions_escritura_gestores on public.job_position_permissions;
create policy job_position_permissions_escritura_gestores on public.job_position_permissions
  for all to authenticated
  using (
    exists (select 1 from public.job_positions jp
             where jp.id = job_position_permissions.job_position_id
               and public.fn_roles_puede(jp.organization_id, 'hr.positions.edit'))
  )
  with check (
    exists (select 1 from public.job_positions jp
             where jp.id = job_position_permissions.job_position_id
               and public.fn_roles_puede(jp.organization_id, 'hr.positions.edit'))
  );

-- El disparador que da los permisos base a un cargo nuevo corría con la sesión de quien crea el
-- cargo; con la política de escritura nueva fallaría para quien crea cargos sin
-- hr.positions.edit. Pasa a SECURITY DEFINER (solo inserta calendar.view y notifications.view).
alter function public.auto_assign_base_permissions_to_job_position() security definer;
alter function public.auto_assign_base_permissions_to_job_position() set search_path to 'public', 'pg_temp';
