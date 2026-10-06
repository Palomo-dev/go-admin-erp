-- Reversión de 20261006140000_roles_por_organizacion_y_rpc.
--
-- Restaura las políticas, la unicidad global de roles.name y el disparador de cargos tal como
-- estaban (definiciones leídas por MCP de pg_policies / pg_proc el 2026-10-06), y borra las RPC y
-- las columnas nuevas de roles.
--
-- NO revierte datos. Si ya existen roles propios de una organización, la reversión se DETIENE:
-- quitar roles.organization_id los convertiría en roles globales visibles y editables por todas
-- las organizaciones (el problema 2 del análisis). Antes hay que eliminarlos desde la pantalla
-- (fn_rol_eliminar reasigna a sus personas) o decidir a mano qué hacer con ellos.
--
-- Se ejecuta en UNA transacción (como apply_migration): si la comprobación de abajo falla, no
-- debe quedar aplicado nada de lo que sigue. Con psql, usar `-1 -v ON_ERROR_STOP=1`.

do $$
declare
  v_propios integer := 0;
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'roles' and column_name = 'organization_id') then
    execute 'select count(*) from public.roles where organization_id is not null' into v_propios;
  end if;
  if v_propios > 0 then
    raise exception 'Hay % roles propios de organizaciones: elimínalos (o reasígnalos) antes de revertir', v_propios;
  end if;
end $$;

-- ─── Políticas originales ──────────────────────────────────────────────────

drop policy if exists roles_select_sistema_y_propios on public.roles;
drop policy if exists roles_plataforma on public.roles;
drop policy if exists roles_select_for_authenticated on public.roles;
create policy roles_select_for_authenticated on public.roles
  for select using (auth.role() = 'authenticated'::text);
drop policy if exists roles_system_protection on public.roles;
create policy roles_system_protection on public.roles
  for all using ((is_system is null) or (is_system = false));
drop policy if exists roles_manage_for_superadmins on public.roles;
create policy roles_manage_for_superadmins on public.roles
  for all using (
    (exists (select 1 from organization_members
              where organization_members.user_id = auth.uid()
                and organization_members.is_super_admin = true
                and organization_members.is_active = true))
    and ((is_system is null) or (is_system = false))
  );
drop policy if exists "Solo admins pueden crear roles" on public.roles;
create policy "Solo admins pueden crear roles" on public.roles
  for insert with check (
    exists (select 1 from organization_members
             where organization_members.user_id = auth.uid()
               and organization_members.organization_id = coalesce(organization_members.organization_id, 1)
               and (organization_members.is_super_admin = true or organization_members.role_id = 2)
               and organization_members.is_active = true)
  );

drop policy if exists role_permissions_select_roles_visibles on public.role_permissions;
drop policy if exists role_permissions_plataforma on public.role_permissions;
drop policy if exists role_permissions_select_for_authenticated on public.role_permissions;
create policy role_permissions_select_for_authenticated on public.role_permissions
  for select using (auth.role() = 'authenticated'::text);
drop policy if exists role_permissions_all_for_superadmins on public.role_permissions;
create policy role_permissions_all_for_superadmins on public.role_permissions
  for all using (
    exists (select 1 from organization_members
             where organization_members.user_id = auth.uid()
               and organization_members.is_super_admin = true
               and organization_members.is_active = true)
  );
drop policy if exists role_permissions_insert_for_org_admins on public.role_permissions;
create policy role_permissions_insert_for_org_admins on public.role_permissions
  for insert with check (
    exists (select 1 from organization_members
             where organization_members.user_id = auth.uid()
               and organization_members.role_id = any (array[1, 2])
               and organization_members.is_active = true)
  );
drop policy if exists role_permissions_update_for_org_admins on public.role_permissions;
create policy role_permissions_update_for_org_admins on public.role_permissions
  for update using (
    exists (select 1 from organization_members
             where organization_members.user_id = auth.uid()
               and organization_members.role_id = any (array[1, 2])
               and organization_members.is_active = true)
  ) with check (
    exists (select 1 from organization_members
             where organization_members.user_id = auth.uid()
               and organization_members.role_id = any (array[1, 2])
               and organization_members.is_active = true)
  );
drop policy if exists role_permissions_delete_for_org_admins on public.role_permissions;
create policy role_permissions_delete_for_org_admins on public.role_permissions
  for delete using (
    exists (select 1 from organization_members
             where organization_members.user_id = auth.uid()
               and organization_members.role_id = any (array[1, 2])
               and organization_members.is_active = true)
  );

drop policy if exists job_position_permissions_select_miembros on public.job_position_permissions;
drop policy if exists job_position_permissions_escritura_gestores on public.job_position_permissions;
drop policy if exists job_position_permissions_org_access on public.job_position_permissions;
create policy job_position_permissions_org_access on public.job_position_permissions
  for all using (
    job_position_id in (select jp.id from job_positions jp
                         where jp.organization_id in (select organization_members.organization_id
                                                        from organization_members
                                                       where organization_members.user_id = auth.uid()
                                                         and organization_members.is_active = true))
  );

-- ─── Disparador de cargos: vuelve a SECURITY INVOKER sin search_path ───────

alter function public.auto_assign_base_permissions_to_job_position() security invoker;
alter function public.auto_assign_base_permissions_to_job_position() reset search_path;

-- ─── RPC ───────────────────────────────────────────────────────────────────

-- fn_alcance_sucursal_guardar ya no la crea la migración (el alcance usa fn_miembro_asignar_sucursales).
drop function if exists public.fn_cargo_guardar_permisos(uuid, timestamptz, integer[]);
drop function if exists public.fn_rol_asignar_miembros(integer, integer, bigint[]);
drop function if exists public.fn_rol_eliminar(integer, integer);
drop function if exists public.fn_rol_guardar(integer, integer, text, text, integer[]);
drop function if exists public.fn_rol_crear(integer, text, text, integer, integer[]);
drop function if exists public.fn_roles_nombre_valido(text);
drop function if exists public.fn_roles_permisos_validos(integer[]);
drop function if exists public.fn_rol_exigir(integer, text);
drop function if exists public.fn_roles_puede(integer, text);

-- ─── Modelo ────────────────────────────────────────────────────────────────

drop index if exists public.roles_nombre_organizacion_uq;
drop index if exists public.roles_nombre_sistema_uq;
drop index if exists public.idx_roles_organization_id;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'roles_name_key' and conrelid = 'public.roles'::regclass) then
    alter table public.roles add constraint roles_name_key unique (name);
  end if;
end $$;

alter table public.roles drop column if exists based_on_role_id;
alter table public.roles drop column if exists updated_at;
alter table public.roles drop column if exists version;
alter table public.roles drop column if exists organization_id;
