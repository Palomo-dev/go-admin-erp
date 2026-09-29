-- Reversión de 20260929120100_peso_f2_producto_permisos_validacion.
-- Quita el parche de fn_pos_validar_linea_venta (definición viva), las funciones
-- nuevas, los permisos y las columnas del producto. OJO: si ya hay productos
-- por peso o medida, borrar las columnas pierde cómo se venden (exportarlos
-- antes); las ventas hechas conservan su cantidad decimal.

do $parche$
declare
  v_def text := pg_get_functiondef('public.fn_pos_validar_linea_venta(integer,uuid,jsonb,timestamp with time zone,jsonb)'::regprocedure);
  v_old text := $frag$
  -- Productos por peso o medida (20260929120100): decimales, mínimo y origen del peso.
  perform public.fn_pos_validar_pesaje(p_org, p_actor, p_item);
$frag$;
begin
  if position(v_old in v_def) > 0 then
    execute replace(v_def, v_old, E'\n');
  end if;
end;
$parche$;

drop function if exists public.pos_pesaje_contexto(integer);
drop function if exists public.fn_pos_validar_pesaje(integer, uuid, jsonb);
drop function if exists public.fn_pos_puede_pesar_a_mano(integer, uuid);
drop function if exists public.fn_producto_decimales_cantidad(text, smallint);

delete from public.role_permissions rp
 using public.permissions p
 where rp.permission_id = p.id and p.code in ('pos.peso_manual', 'pos.basculas.configurar');
delete from public.job_position_permissions jp
 using public.permissions p
 where jp.permission_id = p.id and p.code in ('pos.peso_manual', 'pos.basculas.configurar');
delete from public.permissions p where p.code in ('pos.peso_manual', 'pos.basculas.configurar');

drop index if exists public.products_org_scale_plu_uq;
alter table public.products
  drop constraint if exists products_peso_valores_check,
  drop constraint if exists products_qty_decimals_check,
  drop constraint if exists products_sale_mode_check;
alter table public.products
  drop column if exists scale_plu,
  drop column if exists require_scale,
  drop column if exists tare_required,
  drop column if exists default_tare_qty,
  drop column if exists min_sale_qty,
  drop column if exists price_ref_unit_code,
  drop column if exists price_ref_qty,
  drop column if exists qty_decimals,
  drop column if exists sale_mode;
