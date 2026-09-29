-- Inventario B4 · Trazabilidad: un lote, un serial o un documento de
-- principio a fin (Figma «Existencias — Trazabilidad» 594:126324).
--
-- Hoy /app/inventario/reportes/trazabilidad es una lista plana de
-- stock_movements filtrada en el navegador por `note`/`source_id` (sin escapar,
-- CSV cortado a 1.000 filas): no encadena lote → ventas → clientes ni serial →
-- venta → garantía.
--
-- fn_trazabilidad(org, código, sucursal, desde, límite) reconoce, en orden:
--   1. un serial de la organización   → { tipo: 'serial', serial: fn_serial_detalle }
--   2. un lote (lots.lot_code de un producto de la organización)
--      → { tipo: 'lote', lote, kpis, recorrido, ventas: { filas, total } }
--   3. un documento: OC-n, TR-n, AJ-n, GAR-n, número de factura de venta, de
--      pedido web o de factura de compra
--      → { tipo: 'documento', documento, movimientos, seriales }
--   4. nada → { tipo: 'ninguno' }
-- La sucursal (la del selector del encabezado) acota existencias, ventas y
-- movimientos; el serial se muestra entero.
--
-- Solo lectura. DEFINER + permiso de ver inventario + REVOKE de anon y public.

-- Documento de un movimiento de kardex (origen → tabla del documento).
create or replace function public.fn_trazabilidad_int_doc_movimiento(p_org integer, p_source text, p_source_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_tabla text;
begin
  v_tabla := case
    when p_source in ('sale', 'mesa_sale') then 'sales'
    when p_source in ('invoice_sale', 'invoice_void', 'credit_note', 'credit_note_void') then 'invoice_sales'
    when p_source in ('web_order', 'web_sale', 'web_refund') then 'web_orders'
    when p_source = 'purchase_order' then 'purchase_orders'
    when p_source in ('purchase_invoice', 'purchase_void') then 'invoice_purchase'
    when p_source = 'purchase' then case when p_source_id ~ '^\d+$' then 'purchase_orders' else 'invoice_purchase' end
    when p_source = 'adjustment' then 'inventory_adjustments'
    when p_source in ('transfer', 'transfer_out', 'transfer_in') then 'inventory_transfers'
    else null end;
  return public.fn_seriales_int_documento(p_org, v_tabla, p_source_id);
end;
$$;

-- Cliente de un documento de venta (venta, factura o pedido web).
create or replace function public.fn_trazabilidad_int_cliente(p_org integer, p_doc jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_cliente uuid;
  v_nombre text;
begin
  if p_doc is null then
    return null;
  end if;
  if p_doc->>'tipo' = 'venta' then
    select s.customer_id into v_cliente from public.sales s where s.id = (p_doc->>'ref')::uuid;
  elsif p_doc->>'tipo' = 'factura' then
    select i.customer_id into v_cliente from public.invoice_sales i where i.id = (p_doc->>'ref')::uuid;
  elsif p_doc->>'tipo' = 'pedido' then
    select wo.customer_id, wo.customer_name into v_cliente, v_nombre from public.web_orders wo where wo.id = (p_doc->>'ref')::uuid;
  end if;
  if v_cliente is not null then
    return (select jsonb_build_object('id', c.id, 'nombre', c.full_name)
              from public.customers c where c.id = v_cliente and c.organization_id = p_org);
  end if;
  if v_nombre is not null then
    return jsonb_build_object('id', null, 'nombre', v_nombre);
  end if;
  return null;
end;
$$;

create or replace function public.fn_trazabilidad(
  p_org integer, p_codigo text, p_sucursal integer default null,
  p_desde integer default 0, p_limite integer default 10)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_codigo text := btrim(coalesce(p_codigo, ''));
  v_desde integer := greatest(coalesce(p_desde, 0), 0);
  v_limite integer := least(greatest(coalesce(p_limite, 10), 1), 5000);
  v_serial integer;
  v_lote record;
  v_otros integer;
  v_costos boolean;
  v_doc jsonb;
  v_fuentes text[];
  v_ids text[];
  v_ventas_src constant text[] := array['sale', 'mesa_sale', 'invoice_sale', 'web_order', 'web_sale', 'folio_item', 'room_consumption'];
  v_compra_src constant text[] := array['purchase', 'purchase_order', 'purchase_invoice', 'initial'];
  v_merma_src constant text[] := array['adjustment', 'loss'];
  v_res jsonb;
begin
  perform public.fn_seriales_int_exigir(p_org, false);
  if p_sucursal is not null then
    if not exists (select 1 from public.branches b where b.id = p_sucursal and b.organization_id = p_org) then
      raise exception 'sucursal_invalida' using errcode = '22023';
    end if;
    perform public.fn_fc_acceso_sucursal(p_sucursal);
  end if;
  if v_codigo = '' or length(v_codigo) > 120 then
    return jsonb_build_object('tipo', 'ninguno', 'codigo', v_codigo);
  end if;
  v_costos := public.fn_receta_int_puede_ver_costos(p_org);

  -- 1. Serial
  select sn.id into v_serial
    from public.serial_numbers sn
   where sn.organization_id = p_org and lower(sn.serial) = lower(v_codigo)
   order by (sn.serial = v_codigo) desc, sn.id
   limit 1;
  if v_serial is not null then
    return jsonb_build_object('tipo', 'serial', 'codigo', v_codigo,
                              'serial', public.fn_serial_detalle(p_org, v_serial));
  end if;

  -- 2. Lote
  select l.id, l.lot_code, l.expiry_date, l.supplier_id, l.created_at, p.id as producto_id, p.uuid as producto_uuid,
         p.name as producto, p.sku
    into v_lote
    from public.lots l
    join public.products p on p.id = l.product_id
   where p.organization_id = p_org and lower(l.lot_code) = lower(v_codigo)
   order by (l.lot_code = v_codigo) desc, l.created_at desc, l.id desc
   limit 1;
  if v_lote.id is not null then
    select count(*) - 1 into v_otros
      from public.lots l join public.products p on p.id = l.product_id
     where p.organization_id = p_org and lower(l.lot_code) = lower(v_codigo);

    with mov as (
      select m.*, public.fn_trazabilidad_int_doc_movimiento(p_org, m.source, m.source_id) as doc,
             (select b.name from public.branches b where b.id = m.branch_id and b.organization_id = p_org) as sucursal
        from public.stock_movements m
       where m.organization_id = p_org and m.lot_id = v_lote.id
         and (p_sucursal is null or m.branch_id = p_sucursal)
    ), ventas as (
      select mv.*, public.fn_trazabilidad_int_cliente(p_org, mv.doc) as cliente
        from mov mv
       where mv.direction = 'out' and mv.source = any (v_ventas_src)
    )
    select jsonb_build_object(
      'tipo', 'lote',
      'codigo', v_codigo,
      'otros_lotes', greatest(v_otros, 0),
      'lote', jsonb_build_object(
         'id', v_lote.id, 'codigo', v_lote.lot_code, 'vence', v_lote.expiry_date, 'creado', v_lote.created_at,
         'producto', jsonb_build_object('id', v_lote.producto_id, 'uuid', v_lote.producto_uuid,
                                        'nombre', v_lote.producto, 'sku', v_lote.sku),
         'proveedor', (select jsonb_build_object('id', s.id, 'uuid', s.uuid, 'nombre', s.name)
                         from public.suppliers s where s.id = v_lote.supplier_id and s.organization_id = p_org)),
      'kpis', jsonb_build_object(
         'recibidas', coalesce((select sum(qty) from mov where direction = 'in' and source = any (v_compra_src)), 0),
         'costo_unitario', case when v_costos then
                             (select unit_cost from mov where direction = 'in' and source = any (v_compra_src)
                               order by created_at, id limit 1) end,
         'recepcion', (select doc from mov where direction = 'in' and source = any (v_compra_src) and doc is not null
                        order by created_at, id limit 1),
         'recibido_el', (select min(created_at) from mov where direction = 'in' and source = any (v_compra_src)),
         'vendidas', coalesce((select sum(qty) from ventas), 0),
         'clientes', (select count(distinct coalesce(cliente->>'id', cliente->>'nombre')) from ventas where cliente is not null),
         'primera_venta', (select min(created_at) from ventas),
         'ultima_venta', (select max(created_at) from ventas),
         'ventas', (select count(*) from ventas),
         'existencias', coalesce((select sum(sl.qty_on_hand) from public.stock_levels sl
                                   join public.branches b on b.id = sl.branch_id and b.organization_id = p_org
                                  where sl.lot_id = v_lote.id and (p_sucursal is null or sl.branch_id = p_sucursal)), 0),
         'existencias_por_sucursal', (select coalesce(jsonb_agg(jsonb_build_object('sucursal', b.name, 'cantidad', sl.qty_on_hand)
                                                                  order by sl.qty_on_hand desc), '[]'::jsonb)
                                        from public.stock_levels sl
                                        join public.branches b on b.id = sl.branch_id and b.organization_id = p_org
                                       where sl.lot_id = v_lote.id and sl.qty_on_hand <> 0
                                         and (p_sucursal is null or sl.branch_id = p_sucursal)),
         'mermas', coalesce((select sum(qty) from mov where direction = 'out' and source = any (v_merma_src)), 0),
         'mermas_documentos', (select coalesce(jsonb_agg(distinct doc), '[]'::jsonb) from mov
                                where direction = 'out' and source = any (v_merma_src) and doc is not null)),
      'recorrido', (select coalesce(jsonb_agg(paso order by fecha, orden), '[]'::jsonb) from (
          select mv.created_at as fecha, mv.id as orden,
                 jsonb_build_object('tipo', case when mv.source = any (v_compra_src) then 'recibido'
                                                 when mv.source in ('transfer', 'transfer_out') then 'trasladado'
                                                 when mv.source = 'transfer_in' then 'traslado_recibido'
                                                 when mv.source = any (v_merma_src) then 'ajuste'
                                                 else 'movimiento' end,
                                    'origen', mv.source, 'direccion', mv.direction, 'cantidad', mv.qty,
                                    'fecha', mv.created_at, 'sucursal', mv.sucursal, 'documento', mv.doc,
                                    'usuario', public.fn_seriales_int_nombre_usuario(mv.updated_by),
                                    'nota', mv.note) as paso
            from mov mv
           where not (mv.direction = 'out' and mv.source = any (v_ventas_src))
          union all
          select min(v.created_at), max(v.id),
                 jsonb_build_object('tipo', 'vendido', 'cantidad', sum(v.qty), 'ventas', count(*),
                                    'clientes', count(distinct coalesce(v.cliente->>'id', v.cliente->>'nombre')),
                                    'sucursales', count(distinct v.branch_id),
                                    'desde', min(v.created_at), 'hasta', max(v.created_at))
            from ventas v
          having count(*) > 0) pasos),
      'ventas', jsonb_build_object(
         'total', (select count(*) from ventas),
         'filas', (select coalesce(jsonb_agg(fila order by fecha desc, orden desc), '[]'::jsonb) from (
             select v.created_at as fecha, v.id as orden,
                    jsonb_build_object('id', v.id, 'fecha', v.created_at, 'documento', v.doc, 'cliente', v.cliente,
                                       'sucursal', v.sucursal, 'cantidad', v.qty,
                                       'vendedor', public.fn_seriales_int_nombre_usuario(v.updated_by)) as fila
               from ventas v
              order by v.created_at desc, v.id desc
             offset v_desde limit v_limite) f)),
      'hoy', public.fn_seriales_int_hoy(p_org))
    into v_res;
    return v_res;
  end if;

  -- 3. Documento
  if v_codigo ~* '^OC-\d+$' then
    v_doc := public.fn_seriales_int_documento(p_org, 'purchase_orders', substring(v_codigo from '(\d+)$'));
  elsif v_codigo ~* '^TR-\d+$' then
    v_doc := public.fn_seriales_int_documento(p_org, 'inventory_transfers', substring(v_codigo from '(\d+)$'));
  elsif v_codigo ~* '^AJ-\d+$' then
    v_doc := public.fn_seriales_int_documento(p_org, 'inventory_adjustments', substring(v_codigo from '(\d+)$'));
  elsif v_codigo ~* '^GAR-\d+$' then
    v_doc := (select public.fn_seriales_int_documento(p_org, 'warranty_claims', w.id::text)
                from public.warranty_claims w
               where w.organization_id = p_org and upper(w.code) = upper(v_codigo) limit 1);
  end if;
  if v_doc is null then
    v_doc := (select public.fn_seriales_int_documento(p_org, 'invoice_sales', i.id::text)
                from public.invoice_sales i
               where i.organization_id = p_org and lower(i.number) = lower(v_codigo)
               order by i.created_at desc limit 1);
  end if;
  if v_doc is null then
    v_doc := (select public.fn_seriales_int_documento(p_org, 'web_orders', wo.id::text)
                from public.web_orders wo
               where wo.organization_id = p_org and lower(wo.order_number) = lower(v_codigo)
               order by wo.created_at desc limit 1);
  end if;
  if v_doc is null then
    v_doc := (select public.fn_seriales_int_documento(p_org, 'invoice_purchase', ip.id::text)
                from public.invoice_purchase ip
               where ip.organization_id = p_org and lower(ip.number_ext) = lower(v_codigo)
               order by ip.created_at desc limit 1);
  end if;
  if v_doc is null then
    return jsonb_build_object('tipo', 'ninguno', 'codigo', v_codigo);
  end if;

  -- Orígenes de kardex y de eventos de serial que apuntan a este documento.
  case v_doc->>'tipo'
    when 'orden_compra' then
      v_fuentes := array['purchase_order', 'purchase'];
      v_ids := array[substring(v_doc->>'numero' from '(\d+)$')];
    when 'traslado' then
      v_fuentes := array['transfer', 'transfer_out', 'transfer_in'];
      v_ids := array[v_doc->>'ref'];
    when 'ajuste' then
      v_fuentes := array['adjustment'];
      v_ids := array[v_doc->>'ref'];
    when 'factura' then
      v_fuentes := array['invoice_sale', 'invoice_void', 'credit_note', 'sale', 'mesa_sale'];
      v_ids := array_remove(array[v_doc->>'ref', v_doc->>'venta'], null);
    when 'pedido' then
      v_fuentes := array['web_order', 'web_sale', 'web_refund'];
      v_ids := array[v_doc->>'ref'];
    when 'factura_compra' then
      v_fuentes := array['purchase_invoice', 'purchase_void', 'purchase'];
      v_ids := array[v_doc->>'ref'];
    else
      v_fuentes := array[]::text[];
      v_ids := array[]::text[];
  end case;

  return jsonb_build_object(
    'tipo', 'documento',
    'codigo', v_codigo,
    'documento', v_doc || jsonb_build_object('cliente', public.fn_trazabilidad_int_cliente(p_org, v_doc)),
    'movimientos', (select coalesce(jsonb_agg(jsonb_build_object(
                             'id', m.id, 'fecha', m.created_at, 'origen', m.source, 'direccion', m.direction,
                             'cantidad', m.qty, 'costo_unitario', case when v_costos then m.unit_cost end,
                             'producto', jsonb_build_object('id', p.id, 'uuid', p.uuid, 'nombre', p.name, 'sku', p.sku),
                             'lote', (select l.lot_code from public.lots l where l.id = m.lot_id),
                             'sucursal', (select b.name from public.branches b where b.id = m.branch_id and b.organization_id = p_org))
                           order by m.created_at, m.id), '[]'::jsonb)
                      from (select * from public.stock_movements sm
                             where sm.organization_id = p_org
                               and sm.source = any (v_fuentes) and sm.source_id = any (v_ids)
                               and (p_sucursal is null or sm.branch_id = p_sucursal)
                             order by sm.created_at, sm.id
                             limit 500) m
                      join public.products p on p.id = m.product_id),
    'seriales', (select coalesce(jsonb_agg(jsonb_build_object('id', sn.id, 'serial', sn.serial, 'estado', sn.status,
                                                                'producto', p.name)
                                             order by sn.serial), '[]'::jsonb)
                   from public.serial_numbers sn
                   join public.products p on p.id = sn.product_id
                  where sn.organization_id = p_org
                    and sn.id in (select e.serial_number_id from public.serial_tracking_events e
                                   where e.organization_id = p_org
                                     and e.source_id = any (v_ids)
                                     and e.source_table in ('purchase_orders', 'invoice_purchase', 'sales', 'invoice_sales',
                                                            'web_orders', 'inventory_transfers', 'inventory_adjustments',
                                                            'warranty_claims')
                                  union
                                  select w.serial_number_id from public.warranty_claims w
                                   where v_doc->>'tipo' = 'garantia' and w.id::text = v_doc->>'ref'
                                  union
                                  select w.replacement_serial_id from public.warranty_claims w
                                   where v_doc->>'tipo' = 'garantia' and w.id::text = v_doc->>'ref'
                                     and w.replacement_serial_id is not null)),
    'hoy', public.fn_seriales_int_hoy(p_org));
end;
$$;

revoke all on function public.fn_trazabilidad_int_doc_movimiento(integer, text, text) from public, anon, authenticated;
revoke all on function public.fn_trazabilidad_int_cliente(integer, jsonb) from public, anon, authenticated;
grant execute on function public.fn_trazabilidad_int_doc_movimiento(integer, text, text) to service_role;
grant execute on function public.fn_trazabilidad_int_cliente(integer, jsonb) to service_role;

revoke all on function public.fn_trazabilidad(integer, text, integer, integer, integer) from public, anon;
grant execute on function public.fn_trazabilidad(integer, text, integer, integer, integer) to authenticated, service_role;
