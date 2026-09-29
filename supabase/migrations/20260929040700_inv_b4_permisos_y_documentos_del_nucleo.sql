-- Inventario B4 · Permisos y documentos del núcleo (B0), sin lógica duplicada.
--
-- B4 arrancó en paralelo con el núcleo y resolvía por su cuenta dos cosas que
-- B0 ya publicó (regla dura 7: una sola implementación):
--
-- * Permisos: fn_seriales_int_exigir y fn_seriales_permisos pasan a
--   fn_inventario_exigir_permiso / fn_inventario_permisos (acciones `ver` y
--   `garantias`; `gestionar` = `garantias`). Las pantallas reciben además las
--   demás acciones del núcleo (`trasladar`, `ajustar`, `editar_catalogo`…).
-- * Documento de un origen: fn_seriales_int_documento y
--   fn_trazabilidad_int_doc_movimiento pasan a fn_documento_de_movimiento
--   (mismo tipo, número y ruta que el kardex y `kit/inventario/EnlaceDocumento`).
--   Solo el reclamo de garantía, que el núcleo no conoce, se resuelve aquí.
--   Forma: { source, source_id, product_id, tipo, numero, ruta }.
--
-- fn_trazabilidad se reescribe con esa forma (misma firma y mismo resultado
-- para lote y serial; el documento usa los tipos del núcleo: factura_venta,
-- pedido_web…). Solo lectura: no mueve stock.

-- ── Permisos ─────────────────────────────────────────────────────────────────

create or replace function public.fn_seriales_int_exigir(p_org integer, p_gestionar boolean)
returns void
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  perform public.fn_inventario_exigir_permiso(p_org,
    case when p_gestionar then array['garantias'] else array['ver'] end);
end;
$$;

create or replace function public.fn_seriales_permisos(p_org integer)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v jsonb;
begin
  perform public.fn_assert_acceso_org(p_org);
  v := public.fn_inventario_permisos(p_org);
  return v || jsonb_build_object('gestionar', coalesce((v->>'garantias')::boolean, false));
end;
$$;

-- ── Documento de un origen ───────────────────────────────────────────────────

create or replace function public.fn_seriales_int_documento(p_org integer, p_tabla text, p_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v jsonb;
  v_source text;
begin
  if p_tabla is null or p_id is null or btrim(p_id) = '' then
    return null;
  end if;

  if p_tabla = 'warranty_claims' then
    if p_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return null;
    end if;
    select jsonb_build_object('source', 'warranty_claim', 'source_id', w.id::text, 'product_id', null,
                              'tipo', 'garantia', 'numero', w.code, 'ruta', '/app/inventario/garantias/' || w.id)
      into v
      from public.warranty_claims w
     where w.id = p_id::uuid and w.organization_id = p_org;
    return v;
  end if;

  -- Tabla del evento del serial → origen del kardex que entiende el núcleo.
  v_source := case p_tabla
    when 'sales' then 'sale'
    when 'invoice_sales' then 'invoice_sale'
    when 'purchase_orders' then 'purchase_order'
    when 'invoice_purchase' then 'purchase_invoice'
    when 'inventory_transfers' then 'transfer'
    when 'transfers' then 'transfer'
    when 'transfer' then 'transfer'
    when 'inventory_adjustments' then 'adjustment'
    when 'adjustments' then 'adjustment'
    when 'adjustment' then 'adjustment'
    when 'web_orders' then 'web_order'
    else null end;
  if v_source is null then
    return null;
  end if;

  v := public.fn_documento_de_movimiento(p_org, v_source, p_id, null);
  if v is null or (v->>'numero' is null and v->>'ruta' is null) then
    return null;
  end if;
  return v;
end;
$$;

-- Venta de un serial: la venta y su factura, con la sucursal de la VENTA.
create or replace function public.fn_seriales_int_venta(p_org integer, p_sale_id text, p_invoice_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_sale uuid;
  v_fecha timestamptz;
  v_sucursal integer;
  v_factura uuid := null;
  v_documento jsonb;
begin
  if p_sale_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select s.id, s.sale_date, s.branch_id into v_sale, v_fecha, v_sucursal
      from public.sales s
     where s.id = p_sale_id::uuid and s.organization_id = p_org;
  end if;

  if p_invoice_id is not null then
    select i.id, coalesce(v_fecha, i.issue_date), coalesce(v_sucursal, i.branch_id)
      into v_factura, v_fecha, v_sucursal
      from public.invoice_sales i
     where i.id = p_invoice_id and i.organization_id = p_org;
  elsif v_sale is not null then
    select i.id into v_factura
      from public.invoice_sales i
     where i.sale_id = v_sale and i.organization_id = p_org
       and coalesce(i.document_type, 'invoice') <> 'credit_note'
     order by (i.status in ('void', 'voided', 'cancelled')), i.created_at desc
     limit 1;
  end if;

  if v_sale is null and v_factura is null then
    return null;
  end if;

  v_documento := case
    when v_sale is not null then public.fn_seriales_int_documento(p_org, 'sales', v_sale::text)
    else public.fn_seriales_int_documento(p_org, 'invoice_sales', v_factura::text) end;

  return jsonb_build_object(
    'venta_id', v_sale::text,
    'factura_id', v_factura::text,
    'numero', v_documento->>'numero',
    'fecha', v_fecha,
    'documento', v_documento,
    'sucursal', (select jsonb_build_object('id', b.id, 'nombre', b.name)
                   from public.branches b where b.id = v_sucursal and b.organization_id = p_org));
end;
$$;

create or replace function public.fn_trazabilidad_int_doc_movimiento(p_org integer, p_source text, p_source_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v jsonb;
begin
  if p_source is null or p_source_id is null then
    return null;
  end if;
  v := public.fn_documento_de_movimiento(p_org, p_source, p_source_id, null);
  if v is null or (v->>'numero' is null and v->>'ruta' is null) then
    return null;
  end if;
  return v;
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
  v_id text := p_doc->>'source_id';
  v_cliente uuid;
  v_nombre text;
begin
  if p_doc is null or v_id is null
     or v_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;
  if p_doc->>'tipo' = 'venta' then
    select s.customer_id into v_cliente from public.sales s where s.id = v_id::uuid and s.organization_id = p_org;
  elsif p_doc->>'tipo' = 'factura_venta' then
    select i.customer_id into v_cliente from public.invoice_sales i where i.id = v_id::uuid and i.organization_id = p_org;
  elsif p_doc->>'tipo' = 'pedido_web' then
    select wo.customer_id, wo.customer_name into v_cliente, v_nombre
      from public.web_orders wo where wo.id = v_id::uuid and wo.organization_id = p_org;
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

-- ── Trazabilidad ─────────────────────────────────────────────────────────────

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
  v_fecha timestamptz;
  v_fuentes text[];
  v_ids text[];
  v_tablas text[];
  v_ventas_src constant text[] := array['sale', 'mesa_sale', 'invoice_sale', 'web_order', 'web_sale', 'folio_item', 'room_consumption'];
  v_compra_src constant text[] := array['purchase', 'purchase_order', 'purchase_invoice', 'initial'];
  v_merma_src constant text[] := array['adjustment', 'loss'];
  v_res jsonb;
  v_uuid constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
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
                                    'usuario', public.fn_seriales_int_nombre_usuario(coalesce(mv.created_by, mv.updated_by)),
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
                                       'vendedor', public.fn_seriales_int_nombre_usuario(coalesce(v.created_by, v.updated_by))) as fila
               from ventas v
              order by v.created_at desc, v.id desc
             offset v_desde limit v_limite) f)),
      'hoy', public.fn_seriales_int_hoy(p_org))
    into v_res;
    return v_res;
  end if;

  -- 3. Documento: el número que la gente escribe → orígenes del kardex y tablas de los eventos del serial.
  if v_codigo ~* '^OC-\d+$' then
    select jsonb_build_array(po.id::text, po.uuid::text), po.created_at into v_doc, v_fecha
      from public.purchase_orders po
     where po.organization_id = p_org and po.id = substring(v_codigo from '(\d+)$')::bigint;
    v_fuentes := array['purchase_order', 'purchase'];
    v_tablas := array['purchase_orders'];
  elsif v_codigo ~* '^TR-\d+$' then
    select jsonb_build_array(t.id::text), t.created_at into v_doc, v_fecha
      from public.inventory_transfers t
     where t.organization_id = p_org and t.id = substring(v_codigo from '(\d+)$')::bigint;
    v_fuentes := array['transfer', 'transfer_out', 'transfer_in'];
    v_tablas := array['inventory_transfers'];
  elsif v_codigo ~* '^AJ-\d+$' then
    select jsonb_build_array(a.id::text), a.created_at into v_doc, v_fecha
      from public.inventory_adjustments a
     where a.organization_id = p_org and a.id = substring(v_codigo from '(\d+)$')::bigint;
    v_fuentes := array['adjustment'];
    v_tablas := array['inventory_adjustments'];
  elsif v_codigo ~* '^GAR-\d+$' then
    select jsonb_build_array(w.id::text), w.claim_date into v_doc, v_fecha
      from public.warranty_claims w
     where w.organization_id = p_org and upper(w.code) = upper(v_codigo)
     limit 1;
    v_fuentes := array[]::text[];
    v_tablas := array['warranty_claims'];
  end if;
  if v_doc is null then
    select jsonb_build_array(i.id::text, i.sale_id::text), i.issue_date into v_doc, v_fecha
      from public.invoice_sales i
     where i.organization_id = p_org and lower(i.number) = lower(v_codigo)
     order by i.created_at desc limit 1;
    v_fuentes := array['invoice_sale', 'invoice_void', 'credit_note', 'sale', 'mesa_sale'];
    v_tablas := array['invoice_sales', 'sales'];
  end if;
  if v_doc is null then
    select jsonb_build_array(wo.id::text), wo.created_at into v_doc, v_fecha
      from public.web_orders wo
     where wo.organization_id = p_org and lower(wo.order_number) = lower(v_codigo)
     order by wo.created_at desc limit 1;
    v_fuentes := array['web_order', 'web_sale', 'web_refund'];
    v_tablas := array['web_orders'];
  end if;
  if v_doc is null then
    select jsonb_build_array(ip.id::text), ip.issue_date into v_doc, v_fecha
      from public.invoice_purchase ip
     where ip.organization_id = p_org and lower(ip.number_ext) = lower(v_codigo)
     order by ip.created_at desc limit 1;
    v_fuentes := array['purchase_invoice', 'purchase_void', 'purchase'];
    v_tablas := array['invoice_purchase'];
  end if;
  if v_doc is null then
    return jsonb_build_object('tipo', 'ninguno', 'codigo', v_codigo);
  end if;

  select array_agg(x) into v_ids from jsonb_array_elements_text(v_doc) x where x is not null;

  -- El documento principal con la forma del núcleo (tipo, número y ruta).
  v_doc := public.fn_seriales_int_documento(p_org, v_tablas[1], v_ids[1]);

  return jsonb_build_object(
    'tipo', 'documento',
    'codigo', v_codigo,
    'documento', coalesce(v_doc, '{}'::jsonb)
                 || jsonb_build_object('fecha', v_fecha, 'cliente', public.fn_trazabilidad_int_cliente(p_org, v_doc)),
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
                                     and e.source_table = any (v_tablas)
                                     and e.source_id = any (v_ids)
                                  union
                                  select w.serial_number_id from public.warranty_claims w
                                   where 'warranty_claims' = any (v_tablas) and w.organization_id = p_org
                                     and w.id::text = any (v_ids)
                                  union
                                  select w.replacement_serial_id from public.warranty_claims w
                                   where 'warranty_claims' = any (v_tablas) and w.organization_id = p_org
                                     and w.id::text = any (v_ids) and w.replacement_serial_id is not null)),
    'hoy', public.fn_seriales_int_hoy(p_org));
end;
$$;

revoke all on function public.fn_seriales_int_exigir(integer, boolean) from public, anon, authenticated;
revoke all on function public.fn_seriales_int_documento(integer, text, text) from public, anon, authenticated;
revoke all on function public.fn_seriales_int_venta(integer, text, uuid) from public, anon, authenticated;
revoke all on function public.fn_trazabilidad_int_doc_movimiento(integer, text, text) from public, anon, authenticated;
revoke all on function public.fn_trazabilidad_int_cliente(integer, jsonb) from public, anon, authenticated;
revoke all on function public.fn_seriales_permisos(integer) from public, anon;
revoke all on function public.fn_trazabilidad(integer, text, integer, integer, integer) from public, anon;
grant execute on function public.fn_seriales_permisos(integer) to authenticated, service_role;
grant execute on function public.fn_trazabilidad(integer, text, integer, integer, integer) to authenticated, service_role;
