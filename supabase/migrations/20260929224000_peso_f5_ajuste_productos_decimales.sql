-- Productos por peso: ajustes de inventario con los decimales de cada producto
-- (PRODUCTOS-POR-PESO-BASCULA.md §9).
--
-- fn_ajuste_productos (buscador y recarga de líneas del formulario de ajuste)
-- devolvía la unidad pero no «cómo se vende». Se agregan dos claves al objeto
-- de cada producto, sobre la definición VIVA y en un solo fragmento:
--   modo_venta          products.sale_mode ('unit' si viene vacío)
--   decimales_cantidad  fn_producto_decimales_cantidad(sale_mode, qty_decimals)
--                       (0 por unidad, 3 por peso, 2 por medida)
-- El formulario deja escribir 12,400 kg y 3 unidades, no 0,5 unidades.
-- Aditivo: ninguna clave existente cambia; ningún dato se modifica.

do $parche$
declare
  v_def text := pg_get_functiondef('public.fn_ajuste_productos(integer,integer,text,integer[],integer)'::regprocedure);
  v_old text := $frag$           'unidad', btrim(q.unit_code),
$frag$;
  v_new text := $frag$           'unidad', btrim(q.unit_code),
           -- Peso o medida (20260929224000): decimales de la cantidad del producto.
           'modo_venta', coalesce(nullif(btrim(q.sale_mode), ''), 'unit'),
           'decimales_cantidad', public.fn_producto_decimales_cantidad(q.sale_mode, q.qty_decimals),
$frag$;
begin
  if position('20260929224000' in v_def) > 0 then
    return;  -- ya aplicado
  end if;
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'fn_ajuste_productos cambió: el fragmento esperado no aparece una sola vez';
  end if;
  execute replace(v_def, v_old, v_new);
end;
$parche$;
