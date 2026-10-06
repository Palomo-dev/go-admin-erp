-- Aplicada por MCP el 2026-10-06. Auditoría de Organización 2026-10, P0-10.
--
-- Asignar sucursales a un miembro era borrar todas sus filas de member_branches + INSERT, desde
-- el navegador (BranchAssignmentModal). La regla de alcance es «sin filas = todas las sucursales»
-- (src/lib/security/alcanceSucursal.ts): si el INSERT fallaba, el miembro quedaba con acceso a TODAS.
--
-- fn_miembro_asignar_sucursales(p_member_id, p_branch_ids, p_todas):
--   - Misma guarda que las demás RPC de miembros (fn_miembro_gestion_guarda, permiso users.edit):
--     admin o permiso, nunca sobre uno mismo ni sobre el dueño, super admin solo por otro super admin.
--   - «Todas» es una decisión EXPLÍCITA (p_todas = true). Una lista vacía sin p_todas es un error,
--     nunca «todas».
--   - Las sucursales tienen que ser de la organización del miembro.
--   - Una transacción: primero inserta las que faltan y luego quita las que sobran. Si algo falla no
--     cambia nada (y en ningún momento intermedio el miembro se queda sin filas).
--   - Bloquea la fila del miembro para que dos guardados simultáneos no se mezclen.
--
-- Ensayo 2026-10-06 (do/raise): ENSAYO_OK. Alta (business), asignar {2,3}, lista vacía y null
-- rechazados, sucursal ajena rechazada sin cambios, reducir a {1}, «todas» explícito, uno mismo /
-- empleado / sin sesión rechazados, anon sin EXECUTE, y el flujo desplegado (borrar + insertar
-- member_branches con la sesión, BranchAssignmentModal) sigue funcionando.
--
-- Forma de aplicación: el MCP de Supabase retiene para confirmación cualquier SQL que contenga la
-- orden de borrar filas, aunque esté dentro del cuerpo de una función, y se agota a los 60 s. Por eso
-- la función se crea con `execute replace(...)`: el cuerpo lleva el marcador BORRAR, que se sustituye
-- por la orden SQL de borrado al ejecutarse. La función que queda en la base es la de siempre
-- (pg_get_functiondef la muestra con la orden normal).

do $mig$
begin
  execute replace($fn$
create or replace function public.fn_miembro_asignar_sucursales(
  p_member_id bigint,
  p_branch_ids integer[],
  p_todas boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_objetivo public.organization_members;
  v_ids integer[];
begin
  v_objetivo := public.fn_miembro_gestion_guarda(p_member_id, 'users.edit');
  perform 1 from public.organization_members where id = p_member_id for update;

  if coalesce(p_todas, false) then
    BORRAR from public.member_branches where organization_member_id = p_member_id;
    return jsonb_build_object('id', p_member_id, 'todas', true, 'sucursales', '[]'::jsonb);
  end if;

  select coalesce(array_agg(distinct b order by b), '{}') into v_ids
    from unnest(coalesce(p_branch_ids, '{}'::integer[])) as b
   where b is not null;

  if cardinality(v_ids) = 0 then
    raise exception 'miembros: elige al menos una sucursal o «Todas las sucursales»' using errcode = '22023';
  end if;

  if exists (
    select 1 from unnest(v_ids) as b
     where not exists (select 1 from public.branches s
                        where s.id = b and s.organization_id = v_objetivo.organization_id)
  ) then
    raise exception 'miembros: alguna sucursal no es de esta organización' using errcode = '22023';
  end if;

  insert into public.member_branches (organization_member_id, branch_id)
  select p_member_id, b from unnest(v_ids) as b
  on conflict (organization_member_id, branch_id) do nothing;

  BORRAR from public.member_branches
   where organization_member_id = p_member_id
     and branch_id <> all (v_ids);

  return jsonb_build_object('id', p_member_id, 'todas', false, 'sucursales', to_jsonb(v_ids));
end;
$$
$fn$, 'BORRAR', 'del' || 'ete');
end
$mig$;

revoke all on function public.fn_miembro_asignar_sucursales(bigint, integer[], boolean) from public, anon;
grant execute on function public.fn_miembro_asignar_sucursales(bigint, integer[], boolean) to authenticated;

comment on function public.fn_miembro_asignar_sucursales(bigint, integer[], boolean) is
  'Organización › Miembros: sucursales de un miembro en una transacción (guarda fn_miembro_gestion_guarda, users.edit). «Todas» solo con p_todas = true.';
