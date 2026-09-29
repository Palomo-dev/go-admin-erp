-- Gestión de OTROS miembros por RPC (acceso v3, fase 5; docs/design/AUTH-ACCESO-V2.md §13.5).
--
-- Organización › Miembros (MembersTab) y Roles (RoleAssignment, rolesManagementService) cambiaban el
-- rol, activaban/desactivaban o retiraban miembros escribiendo organization_members desde el
-- navegador. No hay política de UPDATE ni DELETE para filas ajenas, así que RLS filtraba a 0 filas
-- sin error y la pantalla decía «actualizado» sin que cambiara nada. Estas funciones hacen el cambio
-- con las guardas en la base:
--   · quien llama es miembro activo de la organización del miembro y es admin (super admin o rol 1/2)
--     o tiene el permiso de la acción: roles.assign (rol), users.edit (estado), users.delete (retirar);
--   · nadie se cambia a sí mismo por aquí (evita quedarse sin admin);
--   · al dueño de la organización no se le cambia el rol ni el estado, ni se le retira;
--   · el rol 1 (Super Admin) y los miembros super admin solo los toca otro super admin.
-- SECURITY DEFINER: corren como postgres, así que el disparador de la propia fila no las limita.

create or replace function public.fn_miembro_gestion_guarda(p_member_id bigint, p_permiso text)
returns public.organization_members
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_objetivo public.organization_members;
  v_quien public.organization_members;
begin
  if v_uid is null then
    raise exception 'miembros: se necesita una sesión' using errcode = '42501';
  end if;

  select * into v_objetivo from public.organization_members where id = p_member_id;
  if not found then
    raise exception 'miembros: miembro no encontrado' using errcode = 'P0002';
  end if;

  select * into v_quien from public.organization_members
   where user_id = v_uid and organization_id = v_objetivo.organization_id and is_active;
  if not found then
    raise exception 'miembros: miembro no encontrado' using errcode = 'P0002';
  end if;

  if not (coalesce(v_quien.is_super_admin, false) or v_quien.role_id in (1, 2)
          or public.check_user_permission(v_uid, v_objetivo.organization_id, p_permiso)) then
    raise exception 'miembros: no tienes permiso para gestionar miembros' using errcode = '42501';
  end if;

  if v_objetivo.user_id = v_uid then
    raise exception 'miembros: no puedes cambiarte a ti mismo desde aquí' using errcode = '42501';
  end if;

  if exists (select 1 from public.organizations o
              where o.id = v_objetivo.organization_id and o.owner_user_id = v_objetivo.user_id) then
    raise exception 'miembros: el dueño de la organización no se puede modificar' using errcode = '42501';
  end if;

  if coalesce(v_objetivo.is_super_admin, false) and not coalesce(v_quien.is_super_admin, false) then
    raise exception 'miembros: solo un super admin puede modificar a otro super admin' using errcode = '42501';
  end if;

  return v_objetivo;
end;
$$;

create or replace function public.fn_miembro_cambiar_rol(p_member_id bigint, p_role_id integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_objetivo public.organization_members;
begin
  v_objetivo := public.fn_miembro_gestion_guarda(p_member_id, 'roles.assign');

  if not exists (select 1 from public.roles where id = p_role_id) then
    raise exception 'miembros: rol no válido' using errcode = '22023';
  end if;
  if p_role_id = 1 and not exists (
       select 1 from public.organization_members
        where user_id = auth.uid() and organization_id = v_objetivo.organization_id
          and is_active and is_super_admin) then
    raise exception 'miembros: solo un super admin asigna el rol Super Admin' using errcode = '42501';
  end if;

  update public.organization_members set role_id = p_role_id where id = p_member_id;
  return jsonb_build_object('id', p_member_id, 'role_id', p_role_id);
end;
$$;

create or replace function public.fn_miembro_cambiar_estado(p_member_id bigint, p_activo boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if p_activo is null then
    raise exception 'miembros: estado no válido' using errcode = '22023';
  end if;
  perform public.fn_miembro_gestion_guarda(p_member_id, 'users.edit');
  update public.organization_members set is_active = p_activo where id = p_member_id;
  return jsonb_build_object('id', p_member_id, 'is_active', p_activo);
end;
$$;

create or replace function public.fn_miembro_retirar(p_member_id bigint)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  perform public.fn_miembro_gestion_guarda(p_member_id, 'users.delete');
  delete from public.organization_members where id = p_member_id;
  return jsonb_build_object('id', p_member_id, 'retirado', true);
end;
$$;

revoke all on function public.fn_miembro_gestion_guarda(bigint, text) from public, anon, authenticated;
revoke all on function public.fn_miembro_cambiar_rol(bigint, integer) from public, anon;
revoke all on function public.fn_miembro_cambiar_estado(bigint, boolean) from public, anon;
revoke all on function public.fn_miembro_retirar(bigint) from public, anon;
grant execute on function public.fn_miembro_cambiar_rol(bigint, integer) to authenticated;
grant execute on function public.fn_miembro_cambiar_estado(bigint, boolean) to authenticated;
grant execute on function public.fn_miembro_retirar(bigint) to authenticated;
