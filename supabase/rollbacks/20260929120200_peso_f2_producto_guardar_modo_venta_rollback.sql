-- Reversión de 20260929120200_peso_f2_producto_guardar_modo_venta: quita el
-- bloque de fn_producto_guardar (definición viva) y borra la función interna.
-- Los productos ya guardados por peso o medida conservan sus columnas.

do $parche$
declare
  v_def text := pg_get_functiondef('public.fn_producto_guardar(integer,jsonb)'::regprocedure);
  v_old text := $frag$  -- Cómo se vende (20260929120200, productos por peso o medida): mismo paso del guardado.
  if v_pr ? 'sale_mode' then
    perform public.fn_producto_int_modo_venta(p_organization_id, v_id, v_pr, v_tiene_var);
  end if;

$frag$;
begin
  if position(v_old in v_def) > 0 then
    execute replace(v_def, v_old, '');
  end if;
end;
$parche$;

drop function if exists public.fn_producto_int_modo_venta(integer, integer, jsonb, boolean);
