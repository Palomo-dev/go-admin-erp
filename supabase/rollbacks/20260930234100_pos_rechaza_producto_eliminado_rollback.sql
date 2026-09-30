-- Reversión de 20260930234100_pos_rechaza_producto_eliminado.
-- Devuelve fn_pos_validar_linea_venta, fn_factura_venta_guardar,
-- assistant_register_sale y assistant_register_sales_invoice a su definición exacta
-- anterior (quita el fragmento y comprueba el md5 de prosrc original), restaura el
-- comentario de fn_pos_validar_linea_venta y borra fn_producto_exigir_vendible.
-- Si alguna función cambió después del parche, se detiene (revertir a mano con la
-- definición de supabase_migrations.schema_migrations). No toca datos.
-- ADVERTENCIA: el POS, la factura de venta y GO Assistant vuelven a aceptar
-- productos eliminados.

-- fn_pos_validar_linea_venta — POS: mostrador, crédito, sin conexión y mesas (pos_checkout_v1)
do $parche$
declare
  v_oid oid := 'public.fn_pos_validar_linea_venta(integer,uuid,jsonb,timestamp with time zone,jsonb)'::regprocedure;
  v_md5 text;
  v_def text;
  v_old text := $frag$  -- Producto eliminado (20260930234100): no se vende, salvo que la línea sea
  -- anterior a la baja (venta sin conexión: hora del equipo; mesa: hora de la línea).
  perform public.fn_producto_exigir_vendible(p_org, v_product, p_created_at);
  -- Productos por peso o medida (20260929120100): decimales, mínimo y origen del peso.
  perform public.fn_pos_validar_pesaje(p_org, p_actor, p_item);
$frag$;
  v_new text := $frag$  -- Productos por peso o medida (20260929120100): decimales, mínimo y origen del peso.
  perform public.fn_pos_validar_pesaje(p_org, p_actor, p_item);
$frag$;
begin
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 = 'c746ceafe47ad9d2c280f3a3164d9b5f' then
    return;  -- ya revertido
  end if;
  if v_md5 <> '57205fc766689e75b59b572450959797' then
    raise exception 'fn_pos_validar_linea_venta cambió (md5 %): revisar a mano', v_md5;
  end if;
  v_def := pg_get_functiondef(v_oid);
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'fn_pos_validar_linea_venta: el fragmento no aparece una sola vez';
  end if;
  execute replace(v_def, v_old, v_new);
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 <> 'c746ceafe47ad9d2c280f3a3164d9b5f' then
    raise exception 'fn_pos_validar_linea_venta: md5 final inesperado (%)', v_md5;
  end if;
end;
$parche$;

-- fn_factura_venta_guardar — factura de venta (finanzas): solo el alta crea sale_items
do $parche$
declare
  v_oid oid := 'public.fn_factura_venta_guardar(integer,uuid,jsonb)'::regprocedure;
  v_md5 text;
  v_def text;
  v_old text := $frag$    if v_producto is not null and not exists (select 1 from public.products p where p.id = v_producto and p.organization_id = p_org) then
      raise exception 'producto_invalido' using errcode = '22023';
    end if;
    -- Producto eliminado (20260930234100): una factura NUEVA no lo vende.
    if p_invoice_id is null then
      perform public.fn_producto_exigir_vendible(p_org, v_producto, now());
    end if;
$frag$;
  v_new text := $frag$    if v_producto is not null and not exists (select 1 from public.products p where p.id = v_producto and p.organization_id = p_org) then
      raise exception 'producto_invalido' using errcode = '22023';
    end if;
$frag$;
begin
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 = '7018240f33a289a5c5600b9d4646a0dc' then
    return;  -- ya revertido
  end if;
  if v_md5 <> 'b4d7eabca066fd0b0d3ec218a8cafca0' then
    raise exception 'fn_factura_venta_guardar cambió (md5 %): revisar a mano', v_md5;
  end if;
  v_def := pg_get_functiondef(v_oid);
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'fn_factura_venta_guardar: el fragmento no aparece una sola vez';
  end if;
  execute replace(v_def, v_old, v_new);
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 <> '7018240f33a289a5c5600b9d4646a0dc' then
    raise exception 'fn_factura_venta_guardar: md5 final inesperado (%)', v_md5;
  end if;
end;
$parche$;

-- assistant_register_sale — GO Assistant: registrar una venta
do $parche$
declare
  v_oid oid := 'public.assistant_register_sale(integer,integer,uuid,jsonb)'::regprocedure;
  v_md5 text;
  v_def text;
  v_old text := $frag$    if v_name is null then
      raise exception 'PRODUCT_NOT_IN_ORG' using errcode = 'P0002';
    end if;
    -- Producto eliminado (20260930234100).
    perform public.fn_producto_exigir_vendible(p_organization_id, v_product_id, now());
$frag$;
  v_new text := $frag$    if v_name is null then
      raise exception 'PRODUCT_NOT_IN_ORG' using errcode = 'P0002';
    end if;
$frag$;
begin
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 = 'acd10cef219c064df062b57bc112933c' then
    return;  -- ya revertido
  end if;
  if v_md5 <> '362b402609545ca209ad63f86bd222e6' then
    raise exception 'assistant_register_sale cambió (md5 %): revisar a mano', v_md5;
  end if;
  v_def := pg_get_functiondef(v_oid);
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'assistant_register_sale: el fragmento no aparece una sola vez';
  end if;
  execute replace(v_def, v_old, v_new);
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 <> 'acd10cef219c064df062b57bc112933c' then
    raise exception 'assistant_register_sale: md5 final inesperado (%)', v_md5;
  end if;
end;
$parche$;

-- assistant_register_sales_invoice — GO Assistant: venta + factura de venta
do $parche$
declare
  v_oid oid := 'public.assistant_register_sales_invoice(integer,integer,uuid,jsonb)'::regprocedure;
  v_md5 text;
  v_def text;
  v_old text := $frag$      if v_name is null then
        raise exception 'PRODUCT_NOT_IN_ORG' using errcode = 'P0002';
      end if;
      -- Producto eliminado (20260930234100).
      perform public.fn_producto_exigir_vendible(p_organization_id, v_product_id, now());
$frag$;
  v_new text := $frag$      if v_name is null then
        raise exception 'PRODUCT_NOT_IN_ORG' using errcode = 'P0002';
      end if;
$frag$;
begin
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 = 'cf16d1953aacc29a8ddd2e7062b4a49b' then
    return;  -- ya revertido
  end if;
  if v_md5 <> '24784c3215a4fcd06ccfddfc08beb16d' then
    raise exception 'assistant_register_sales_invoice cambió (md5 %): revisar a mano', v_md5;
  end if;
  v_def := pg_get_functiondef(v_oid);
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'assistant_register_sales_invoice: el fragmento no aparece una sola vez';
  end if;
  execute replace(v_def, v_old, v_new);
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 <> 'cf16d1953aacc29a8ddd2e7062b4a49b' then
    raise exception 'assistant_register_sales_invoice: md5 final inesperado (%)', v_md5;
  end if;
end;
$parche$;

comment on function public.fn_pos_validar_linea_venta(integer, uuid, jsonb, timestamptz, jsonb) is
  'Valida una línea nueva de pos_checkout_v1: producto de la organización, precio vigente + modificadores, descuento <= línea, total e impuesto coherentes. Errores: producto_invalido, descuento_excede_linea, modificador_invalido, precio_no_vigente, precio_no_coincide, linea_incoherente.';

drop function if exists public.fn_producto_exigir_vendible(integer, integer, timestamptz);
