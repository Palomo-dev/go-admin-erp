-- POS y ventas · Una línea NUEVA de venta no puede llevar un producto eliminado
-- docs/inventario/VARIANTES-HUERFANAS.md («RPC legadas y POS», 2026-09-30)
--
-- fn_pos_validar_linea_venta comprobaba que el producto fuera de la organización,
-- pero no su estado: un sobre fabricado, un carrito abierto antes de la baja o una
-- venta sin conexión con el catálogo viejo vendían un producto eliminado (o una
-- variante de un padre eliminado).
--
-- Un solo punto (regla 7): fn_producto_exigir_vendible(org, producto, momento).
--   · producto (o su padre) con status = 'deleted' → 'producto_eliminado' (22023),
--     detalle con el nombre y el id;
--   · salvo que la línea se haya hecho ANTES de la baja (momento < baja): venta sin
--     conexión reproducida después, o línea de una mesa pedida antes de la baja.
--     La baja sale de products_audit_log (última transición a 'deleted' del producto
--     o del padre; la más temprana de las dos) y, si no hay rastro, de updated_at.
--     Sin momento o sin fecha de baja → se rechaza (falla cerrado).
--   · productos 'inactive' o 'discontinued': sin cambio (el POS ya no los ofrece y
--     el servidor no los bloqueaba).
--
-- Quién la llama (los caminos del servidor que crean líneas de venta NUEVAS):
--   · fn_pos_validar_linea_venta → pos_checkout_v1: venta de mostrador, a crédito,
--     reproducción del outbox sin conexión (momento = hora del equipo, nunca futura)
--     y cobro de una mesa (momento = sale_items.created_at de cada línea).
--     La reproducción de un sobre cuya venta YA existe no revalida (sin cambio).
--   · fn_factura_venta_guardar: solo en el alta (la edición de un borrador no
--     reescribe sale_items).
--   · assistant_register_sale / assistant_register_sales_invoice (GO Assistant).
-- No la llaman, a propósito: devoluciones y notas crédito (procesar_devolucion,
-- fn_nota_credito_emitir: operan sobre ventas ya hechas), la confirmación de un
-- pedido web (el pedido ya se hizo y se pagó en el sitio) y el cargo de folios PMS.
--
-- Se parchea la definición VIVA de cada función (fragmento que aparece una sola
-- vez), con el md5 de prosrc comprobado antes y después. Ni firma, ni permisos, ni
-- SECURITY, ni search_path cambian.
--
--   función                            md5 prosrc antes                  md5 prosrc después
--   fn_pos_validar_linea_venta         c746ceafe47ad9d2c280f3a3164d9b5f  57205fc766689e75b59b572450959797
--   fn_factura_venta_guardar           7018240f33a289a5c5600b9d4646a0dc  b4d7eabca066fd0b0d3ec218a8cafca0
--   assistant_register_sale            acd10cef219c064df062b57bc112933c  362b402609545ca209ad63f86bd222e6
--   assistant_register_sales_invoice   cf16d1953aacc29a8ddd2e7062b4a49b  24784c3215a4fcd06ccfddfc08beb16d
--   fn_producto_exigir_vendible        (nueva)                           eff8466949db9e4ab225c37644bf4296
--
-- Rollback: supabase/rollbacks/20260930234100_pos_rechaza_producto_eliminado_rollback.sql

create or replace function public.fn_producto_exigir_vendible(p_org integer, p_product integer, p_momento timestamptz)
 returns void
 language plpgsql
 stable
 security definer
 set search_path = public, pg_temp
as $function$
declare
  v_nombre       text;
  v_estado       text;
  v_padre        integer;
  v_padre_estado text;
  v_baja         timestamptz;
begin
  if p_product is null then
    return;
  end if;
  perform public.fn_assert_acceso_org(p_org);

  select p.name, coalesce(p.status, 'active'), p.parent_product_id, coalesce(pp.status, 'active')
    into v_nombre, v_estado, v_padre, v_padre_estado
    from public.products p
    left join public.products pp on pp.id = p.parent_product_id
   where p.id = p_product and p.organization_id = p_org;
  -- Producto de otra organización o inexistente: lo rechaza el llamador (producto_invalido).
  if not found or (v_estado <> 'deleted' and v_padre_estado <> 'deleted') then
    return;
  end if;

  -- Momento de la baja: la última transición a 'deleted' del producto y/o del padre
  -- (la más temprana de las dos); sin rastro en la auditoría, su updated_at.
  select min(b.momento) into v_baja
    from (values (case when v_estado = 'deleted' then p_product end),
                 (case when v_padre_estado = 'deleted' then v_padre end)) ids(id)
    cross join lateral (
      select coalesce(
        (select max(a.created_at) from public.products_audit_log a
          where a.entity_type = 'product' and a.entity_id = ids.id and a.action_type = 'update'
            and a.changes->'after'->>'status' = 'deleted'
            and coalesce(a.changes->'before'->>'status', '') <> 'deleted'),
        (select pr.updated_at from public.products pr where pr.id = ids.id)) as momento
    ) b
   where ids.id is not null;

  -- La línea se hizo antes de la baja (venta sin conexión, mesa): se respeta.
  if p_momento is not null and v_baja is not null and p_momento < v_baja then
    return;
  end if;

  raise exception 'producto_eliminado' using errcode = '22023',
    detail = case when v_estado = 'deleted'
      then format('«%s» (producto %s) está eliminado.', v_nombre, p_product)
      else format('«%s» (producto %s): su producto padre está eliminado.', v_nombre, p_product) end;
end;
$function$;

revoke all on function public.fn_producto_exigir_vendible(integer, integer, timestamptz) from public, anon;
-- authenticated: la llaman assistant_register_sale(_invoice), que son SECURITY INVOKER.
grant execute on function public.fn_producto_exigir_vendible(integer, integer, timestamptz) to authenticated, service_role;

comment on function public.fn_producto_exigir_vendible(integer, integer, timestamptz) is
  'Punto único: una línea nueva de venta no lleva un producto eliminado (ni una variante de un padre eliminado) → producto_eliminado (22023). Pasa si p_momento es anterior a la baja (venta sin conexión, mesa). Exige acceso a la organización.';

-- fn_pos_validar_linea_venta — POS: mostrador, crédito, sin conexión y mesas (pos_checkout_v1)
do $parche$
declare
  v_oid oid := 'public.fn_pos_validar_linea_venta(integer,uuid,jsonb,timestamp with time zone,jsonb)'::regprocedure;
  v_md5 text;
  v_def text;
  v_old text := $frag$  -- Productos por peso o medida (20260929120100): decimales, mínimo y origen del peso.
  perform public.fn_pos_validar_pesaje(p_org, p_actor, p_item);
$frag$;
  v_new text := $frag$  -- Producto eliminado (20260930234100): no se vende, salvo que la línea sea
  -- anterior a la baja (venta sin conexión: hora del equipo; mesa: hora de la línea).
  perform public.fn_producto_exigir_vendible(p_org, v_product, p_created_at);
  -- Productos por peso o medida (20260929120100): decimales, mínimo y origen del peso.
  perform public.fn_pos_validar_pesaje(p_org, p_actor, p_item);
$frag$;
begin
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 = '57205fc766689e75b59b572450959797' then
    return;  -- ya aplicado
  end if;
  if v_md5 <> 'c746ceafe47ad9d2c280f3a3164d9b5f' then
    raise exception 'fn_pos_validar_linea_venta cambió (md5 %): revisar a mano', v_md5;
  end if;
  v_def := pg_get_functiondef(v_oid);
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'fn_pos_validar_linea_venta: el fragmento no aparece una sola vez';
  end if;
  execute replace(v_def, v_old, v_new);
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 <> '57205fc766689e75b59b572450959797' then
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
$frag$;
  v_new text := $frag$    if v_producto is not null and not exists (select 1 from public.products p where p.id = v_producto and p.organization_id = p_org) then
      raise exception 'producto_invalido' using errcode = '22023';
    end if;
    -- Producto eliminado (20260930234100): una factura NUEVA no lo vende.
    if p_invoice_id is null then
      perform public.fn_producto_exigir_vendible(p_org, v_producto, now());
    end if;
$frag$;
begin
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 = 'b4d7eabca066fd0b0d3ec218a8cafca0' then
    return;  -- ya aplicado
  end if;
  if v_md5 <> '7018240f33a289a5c5600b9d4646a0dc' then
    raise exception 'fn_factura_venta_guardar cambió (md5 %): revisar a mano', v_md5;
  end if;
  v_def := pg_get_functiondef(v_oid);
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'fn_factura_venta_guardar: el fragmento no aparece una sola vez';
  end if;
  execute replace(v_def, v_old, v_new);
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 <> 'b4d7eabca066fd0b0d3ec218a8cafca0' then
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
$frag$;
  v_new text := $frag$    if v_name is null then
      raise exception 'PRODUCT_NOT_IN_ORG' using errcode = 'P0002';
    end if;
    -- Producto eliminado (20260930234100).
    perform public.fn_producto_exigir_vendible(p_organization_id, v_product_id, now());
$frag$;
begin
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 = '362b402609545ca209ad63f86bd222e6' then
    return;  -- ya aplicado
  end if;
  if v_md5 <> 'acd10cef219c064df062b57bc112933c' then
    raise exception 'assistant_register_sale cambió (md5 %): revisar a mano', v_md5;
  end if;
  v_def := pg_get_functiondef(v_oid);
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'assistant_register_sale: el fragmento no aparece una sola vez';
  end if;
  execute replace(v_def, v_old, v_new);
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 <> '362b402609545ca209ad63f86bd222e6' then
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
$frag$;
  v_new text := $frag$      if v_name is null then
        raise exception 'PRODUCT_NOT_IN_ORG' using errcode = 'P0002';
      end if;
      -- Producto eliminado (20260930234100).
      perform public.fn_producto_exigir_vendible(p_organization_id, v_product_id, now());
$frag$;
begin
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 = '24784c3215a4fcd06ccfddfc08beb16d' then
    return;  -- ya aplicado
  end if;
  if v_md5 <> 'cf16d1953aacc29a8ddd2e7062b4a49b' then
    raise exception 'assistant_register_sales_invoice cambió (md5 %): revisar a mano', v_md5;
  end if;
  v_def := pg_get_functiondef(v_oid);
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'assistant_register_sales_invoice: el fragmento no aparece una sola vez';
  end if;
  execute replace(v_def, v_old, v_new);
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 <> '24784c3215a4fcd06ccfddfc08beb16d' then
    raise exception 'assistant_register_sales_invoice: md5 final inesperado (%)', v_md5;
  end if;
end;
$parche$;

comment on function public.fn_pos_validar_linea_venta(integer, uuid, jsonb, timestamptz, jsonb) is
  'Valida una línea nueva de pos_checkout_v1: producto de la organización y no eliminado (fn_producto_exigir_vendible), precio vigente + modificadores, descuento <= línea, total e impuesto coherentes. Errores: producto_invalido, producto_eliminado, descuento_excede_linea, modificador_invalido, precio_no_vigente, precio_no_coincide, linea_incoherente.';
