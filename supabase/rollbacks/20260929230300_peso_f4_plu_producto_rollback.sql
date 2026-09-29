-- Reversión de 20260929230300_peso_f4_plu_producto: fn_producto_int_modo_venta
-- vuelve a no escribir scale_plu (definición viva: se deshacen solo los dos
-- reemplazos) y se borra fn_producto_int_plu. Los PLU ya guardados se conservan.

do $parche$
declare
  v_def text := pg_get_functiondef('public.fn_producto_int_modo_venta(integer,integer,jsonb,boolean)'::regprocedure);
  v_n1  text := 'tare_required = false, require_scale = false, scale_plu = null
     where id = p_product_id
       and (sale_mode <> ''unit'' or qty_decimals <> 0 or price_ref_qty is not null or min_sale_qty is not null
            or default_tare_qty is not null or tare_required or require_scale or scale_plu is not null);';
  v_a1  text := 'tare_required = false, require_scale = false
     where id = p_product_id
       and (sale_mode <> ''unit'' or qty_decimals <> 0 or price_ref_qty is not null or min_sale_qty is not null
            or default_tare_qty is not null or tare_required or require_scale);';
  v_n2  text := '

  -- PLU de balanza (20260929230300): solo si el payload lo trae.
  if p_pr ? ''scale_plu'' then
    perform public.fn_producto_int_plu(p_org, p_product_id, p_pr->''scale_plu'');
  end if;';
begin
  if position('fn_producto_int_plu' in v_def) > 0 then
    execute replace(replace(v_def, v_n1, v_a1), v_n2, '');
  end if;
end;
$parche$;

drop function if exists public.fn_producto_int_plu(integer, integer, jsonb);
