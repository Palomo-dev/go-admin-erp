-- Reversión de 20260929120300_peso_f2_devolucion_reingresa: devuelve los dos
-- fragmentos de procesar_devolucion (definición viva) a su forma anterior.
-- Las devoluciones ya hechas no cambian.

do $parche$
declare
  v_def text := pg_get_functiondef('public.procesar_devolucion(integer,uuid,jsonb,text,text,text,text)'::regprocedure);
  v_new1 text := $frag$    select p.id, p.name, p.track_stock, p.track_serial, p.sale_mode, p.qty_decimals into v_prod from public.products p
     where p.id = v_si.product_id;
    -- Peso o medida (20260929120300): la cantidad devuelta con los decimales del producto.
    if coalesce(v_prod.sale_mode, 'unit') <> 'unit'
       and v_qty <> round(v_qty, public.fn_producto_decimales_cantidad(v_prod.sale_mode, v_prod.qty_decimals)) then
      raise exception 'cantidad_decimales' using errcode = '22023';
    end if;
$frag$;
  v_old1 text := $frag$    select p.id, p.name, p.track_stock, p.track_serial into v_prod from public.products p
     where p.id = v_si.product_id;
$frag$;
  v_new2 text := $frag$      -- Por peso (20260929120300): reingresa solo con la casilla «Reingresa» de la línea.
      'affects_inventory', case when coalesce(v_prod.sale_mode, 'unit') = 'weight'
                                then coalesce((v_item->>'restock')::boolean, false)
                                else v_motivo.affects_inventory end,
$frag$;
  v_old2 text := $frag$      'affects_inventory', v_motivo.affects_inventory,
$frag$;
begin
  if position('20260929120300' in v_def) > 0 then
    execute replace(replace(v_def, v_new1, v_old1), v_new2, v_old2);
  end if;
end;
$parche$;
