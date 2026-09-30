-- Inventario · RPC legadas de baja de producto: exigen inventory.delete o dejan de exponerse
-- docs/inventario/VARIANTES-HUERFANAS.md («RPC legadas y POS», 2026-09-30)
--
-- Tras 20260930233000 las tres funciones legadas seguían en la base comprobando solo
-- membresía (o nada), sin el permiso inventory.delete que exige fn_producto_cambiar_estado.
--
-- Llamadores (búsqueda del 2026-09-30):
--   · src/ (go-admin-erp): ninguno desde e65f9b1a; el guardarraíl 39 lo impide.
--     soft_delete_product lo usaba la lista de Productos y las acciones masivas HASTA
--     ese commit; deactivate_product nunca tuvo llamadores en la historia de src/.
--   · supabase/functions (Edge Functions): ninguno.
--   · otras funciones SQL (pg_proc.prosrc): ninguna.
--   · goadmin-websites (solo lectura): ninguno.
--
-- Decisión:
--   · soft_delete_product(integer): se conserva la firma y el EXECUTE de authenticated
--     (una pestaña con el paquete anterior a e65f9b1a todavía la llama), pero DELEGA en
--     fn_producto_cambiar_estado: la misma pertenencia (fn_assert_acceso_org) y el mismo
--     permiso resuelto en la base (fn_productos_exigir_permiso → dueño, o
--     check_user_permission de inventory.delete / product_management /
--     inventory_management). Sin lógica duplicada y sin role_id cableado.
--   · deactivate_product (las dos firmas): sin llamadores nunca → se retira el EXECUTE
--     de public, anon y authenticated. Queda para service_role. La de 1 argumento leía
--     la organización de un claim del JWT que el token de Supabase no trae; la de 2 era
--     ambigua con la primera al llamarla con un argumento.
--
--   función                                   md5 prosrc antes                  md5 prosrc después
--   soft_delete_product(integer)              5994240bc79ad07b3d6343f25bd739e6  75499bb13aedddb65b71f5ee8975199f
--   deactivate_product(integer)               2b7b6d6b02ce4dac1280062e8b81fdd2  sin cambio (solo permisos)
--   deactivate_product(integer, integer)      b08547c67b6743c637dd090c803a32c5  sin cambio (solo permisos)
--
-- Rollback: supabase/rollbacks/20260930234000_inv_rpc_legadas_baja_producto_permiso_rollback.sql

create or replace function public.soft_delete_product(p_product_id integer)
 returns boolean
 language plpgsql
 security definer
 set search_path = public, pg_temp
as $function$
declare
  v_org_id integer;
begin
  -- Legado (20260930234000): la baja de un producto tiene un solo camino,
  -- fn_producto_cambiar_estado (pertenencia + inventory.delete en la base; la
  -- cascada de variantes la hace trg_producto_baja_variantes).
  select p.organization_id into v_org_id from public.products p where p.id = p_product_id;
  if v_org_id is null then
    raise exception 'producto_no_encontrado' using errcode = 'P0002';
  end if;
  perform public.fn_producto_cambiar_estado(v_org_id, p_product_id, 'deleted');
  return true;
end;
$function$;

revoke all on function public.soft_delete_product(integer) from public, anon;
grant execute on function public.soft_delete_product(integer) to authenticated, service_role;

revoke all on function public.deactivate_product(integer) from public, anon, authenticated;
revoke all on function public.deactivate_product(integer, integer) from public, anon, authenticated;
grant execute on function public.deactivate_product(integer) to service_role;
grant execute on function public.deactivate_product(integer, integer) to service_role;

comment on function public.soft_delete_product(integer) is
  'Legado: delega en fn_producto_cambiar_estado(org, id, ''deleted''), que exige pertenencia e inventory.delete. No usar en código nuevo.';
comment on function public.deactivate_product(integer) is
  'Legado sin llamadores: solo service_role (20260930234000). Usar fn_producto_cambiar_estado.';
comment on function public.deactivate_product(integer, integer) is
  'Legado sin llamadores: solo service_role (20260930234000). Usar fn_producto_cambiar_estado.';
