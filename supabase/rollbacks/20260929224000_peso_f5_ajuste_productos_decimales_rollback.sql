-- Reversión de 20260929224000_peso_f5_ajuste_productos_decimales: quita las
-- claves modo_venta y decimales_cantidad de fn_ajuste_productos (definición
-- viva). El formulario vuelve a admitir 3 decimales en todos los productos.

do $parche$
declare
  v_def text := pg_get_functiondef('public.fn_ajuste_productos(integer,integer,text,integer[],integer)'::regprocedure);
  v_new text := $frag$           'unidad', btrim(q.unit_code),
           -- Peso o medida (20260929224000): decimales de la cantidad del producto.
           'modo_venta', coalesce(nullif(btrim(q.sale_mode), ''), 'unit'),
           'decimales_cantidad', public.fn_producto_decimales_cantidad(q.sale_mode, q.qty_decimals),
$frag$;
  v_old text := $frag$           'unidad', btrim(q.unit_code),
$frag$;
begin
  if position('20260929224000' in v_def) > 0 then
    execute replace(v_def, v_new, v_old);
  end if;
end;
$parche$;
