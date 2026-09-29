-- Productos por peso, fase 2: devoluciones por peso (PRODUCTOS-POR-PESO-BASCULA.md
-- §2.6 «Devoluciones», decisión 9 del dueño).
--
-- procesar_devolucion ya prorratea decimales (reintegro = total / vendido ×
-- devuelto). Se agrega, sobre su definición VIVA (dos fragmentos, cada uno una
-- sola vez):
--   1. Lee products.sale_mode y qty_decimals del producto de la línea.
--   2. La cantidad devuelta de un producto por peso o medida no trae más
--      decimales que el producto (cantidad_decimales).
--   3. Un producto POR PESO vuelve al inventario solo si la línea trae
--      «restock»: true (casilla «Reingresa»; por defecto no: producto fresco).
--      Por unidad y por medida sigue decidiendo el motivo (affects_inventory).

do $parche$
declare
  v_def text := pg_get_functiondef('public.procesar_devolucion(integer,uuid,jsonb,text,text,text,text)'::regprocedure);
  v_old1 text := $frag$    select p.id, p.name, p.track_stock, p.track_serial into v_prod from public.products p
     where p.id = v_si.product_id;
$frag$;
  v_new1 text := $frag$    select p.id, p.name, p.track_stock, p.track_serial, p.sale_mode, p.qty_decimals into v_prod from public.products p
     where p.id = v_si.product_id;
    -- Peso o medida (20260929120300): la cantidad devuelta con los decimales del producto.
    if coalesce(v_prod.sale_mode, 'unit') <> 'unit'
       and v_qty <> round(v_qty, public.fn_producto_decimales_cantidad(v_prod.sale_mode, v_prod.qty_decimals)) then
      raise exception 'cantidad_decimales' using errcode = '22023';
    end if;
$frag$;
  v_old2 text := $frag$      'affects_inventory', v_motivo.affects_inventory,
$frag$;
  v_new2 text := $frag$      -- Por peso (20260929120300): reingresa solo con la casilla «Reingresa» de la línea.
      'affects_inventory', case when coalesce(v_prod.sale_mode, 'unit') = 'weight'
                                then coalesce((v_item->>'restock')::boolean, false)
                                else v_motivo.affects_inventory end,
$frag$;
begin
  if position('20260929120300' in v_def) > 0 then
    return;  -- ya aplicado
  end if;
  if (length(v_def) - length(replace(v_def, v_old1, ''))) / length(v_old1) <> 1
     or (length(v_def) - length(replace(v_def, v_old2, ''))) / length(v_old2) <> 1 then
    raise exception 'procesar_devolucion cambió: un fragmento del parche no aparece una sola vez';
  end if;
  execute replace(replace(v_def, v_old1, v_new1), v_old2, v_new2);
end;
$parche$;
