-- Inventario B4 · Seriales: listado y detalle en el servidor, con permisos.
--
-- Hoy /app/inventario/seriales lee serial_numbers desde el navegador (1.200
-- líneas de serialTrackingService), sin permiso, cuenta KPI en el cliente y el
-- detalle pide relaciones por nombres que no existen. Estas funciones dan a
-- las pantallas nuevas (route handlers /api/inventario/seriales/**) todo lo que
-- dibuja Figma («Existencias — Seriales» 590:319444) en una sola lectura:
--
-- * fn_seriales_permisos(org)            → { ver, gestionar, costos }
-- * fn_seriales_listado(org, filtros)    → { filas, total, kpis }
-- * fn_serial_detalle(org, id)           → serial, origen, venta, garantía,
--                                          reclamos y eventos con su documento
--
-- Permisos (sin permisos nuevos; los de productos/inventario que ya existen):
--   ver       = inventory.view · inventory.edit · inventory.adjust ·
--               inventory_management · product_management (o dueño)
--   gestionar = inventory.edit · inventory.adjust · inventory_management ·
--               product_management (o dueño) — reclamos y cambios de estado
--   costos    = fn_receta_int_puede_ver_costos (inventory.costs.view o dueño)
-- Cuando B0 publique fn_inventario_permisos, estas funciones pasan a usarla.
--
-- Solo lectura: no mueve stock ni cambia filas. DEFINER + fn_assert_acceso_org
-- (vía fn_productos_exigir_permiso) + REVOKE de anon y public.

-- ── Ayudantes internos (sin EXECUTE para authenticated) ──────────────────────

create or replace function public.fn_seriales_int_exigir(p_org integer, p_gestionar boolean)
returns void
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if p_gestionar then
    perform public.fn_productos_exigir_permiso(p_org,
      array['inventory.edit', 'inventory.adjust', 'inventory_management', 'product_management']);
  else
    perform public.fn_productos_exigir_permiso(p_org,
      array['inventory.view', 'inventory.edit', 'inventory.adjust', 'inventory_management', 'product_management']);
  end if;
end;
$$;

-- Día calendario de la organización (nunca CURRENT_DATE: es el del servidor).
create or replace function public.fn_seriales_int_hoy(p_org integer)
returns date
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select (now() at time zone public.fn_timezone_for(p_org, null))::date;
$$;

create or replace function public.fn_seriales_int_nombre_usuario(p_uid uuid)
returns text
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select nullif(btrim(coalesce(pr.first_name, '') || ' ' || coalesce(pr.last_name, '')), '')
    from public.profiles pr
   where pr.id = p_uid;
$$;

-- Documento legible de un origen (tabla + id) dentro de la organización:
-- { tipo, numero, ref, fecha }. `ref` es lo que usa la ruta del documento
-- (uuid de la OC, de la factura, de la venta…). null si no se reconoce o si el
-- documento es de otra organización.
create or replace function public.fn_seriales_int_documento(p_org integer, p_tabla text, p_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v jsonb;
  v_uuid constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
begin
  if p_tabla is null or p_id is null or btrim(p_id) = '' then
    return null;
  end if;

  if p_tabla = 'sales' and p_id ~ v_uuid then
    select jsonb_build_object(
             'tipo', 'venta', 'ref', s.id::text, 'fecha', s.sale_date,
             'numero', (select i.number from public.invoice_sales i
                         where i.sale_id = s.id and coalesce(i.document_type, 'invoice') <> 'credit_note'
                         order by (i.status in ('void', 'voided', 'cancelled')), i.created_at desc
                         limit 1))
      into v
      from public.sales s
     where s.id = p_id::uuid and s.organization_id = p_org;
  elsif p_tabla = 'invoice_sales' and p_id ~ v_uuid then
    select jsonb_build_object('tipo', 'factura', 'ref', i.id::text, 'numero', i.number, 'fecha', i.issue_date,
                              'venta', i.sale_id::text)
      into v
      from public.invoice_sales i
     where i.id = p_id::uuid and i.organization_id = p_org;
  elsif p_tabla = 'purchase_orders' and p_id ~ '^\d+$' then
    select jsonb_build_object('tipo', 'orden_compra', 'ref', po.uuid::text, 'numero', 'OC-' || po.id, 'fecha', po.created_at)
      into v
      from public.purchase_orders po
     where po.id = p_id::integer and po.organization_id = p_org;
  elsif p_tabla = 'invoice_purchase' and p_id ~ v_uuid then
    select jsonb_build_object('tipo', 'factura_compra', 'ref', ip.id::text, 'numero', ip.number_ext, 'fecha', ip.issue_date)
      into v
      from public.invoice_purchase ip
     where ip.id = p_id::uuid and ip.organization_id = p_org;
  elsif p_tabla in ('inventory_transfers', 'transfer', 'transfers') and p_id ~ '^\d+$' then
    select jsonb_build_object('tipo', 'traslado', 'ref', t.id::text, 'numero', 'TR-' || t.id, 'fecha', t.created_at)
      into v
      from public.inventory_transfers t
     where t.id = p_id::integer and t.organization_id = p_org;
  elsif p_tabla in ('inventory_adjustments', 'adjustment', 'adjustments') and p_id ~ '^\d+$' then
    select jsonb_build_object('tipo', 'ajuste', 'ref', a.id::text, 'numero', 'AJ-' || a.id, 'fecha', a.created_at)
      into v
      from public.inventory_adjustments a
     where a.id = p_id::integer and a.organization_id = p_org;
  elsif p_tabla = 'warranty_claims' and p_id ~ v_uuid then
    select jsonb_build_object('tipo', 'garantia', 'ref', w.id::text, 'numero', w.code, 'fecha', w.claim_date)
      into v
      from public.warranty_claims w
     where w.id = p_id::uuid and w.organization_id = p_org;
  elsif p_tabla = 'web_orders' and p_id ~ v_uuid then
    select jsonb_build_object('tipo', 'pedido', 'ref', wo.id::text, 'numero', wo.order_number, 'fecha', wo.created_at)
      into v
      from public.web_orders wo
     where wo.id = p_id::uuid and wo.organization_id = p_org;
  end if;

  return v;
end;
$$;

-- Venta de un serial: la venta (sales) y su factura, con la sucursal de la
-- VENTA (no la actual del serial: el hallazgo «Sucursal venta muestra la
-- actual»).
create or replace function public.fn_seriales_int_venta(p_org integer, p_sale_id text, p_invoice_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_venta jsonb;
  v_factura jsonb;
  v_sucursal integer;
begin
  v_venta := public.fn_seriales_int_documento(p_org, 'sales', p_sale_id);
  if p_invoice_id is not null then
    v_factura := public.fn_seriales_int_documento(p_org, 'invoice_sales', p_invoice_id::text);
  end if;
  if v_venta is null and v_factura is null then
    return null;
  end if;

  if v_venta is not null then
    select s.branch_id into v_sucursal from public.sales s where s.id = (v_venta->>'ref')::uuid;
  elsif v_factura is not null then
    select i.branch_id into v_sucursal from public.invoice_sales i where i.id = p_invoice_id;
  end if;

  return jsonb_build_object(
    'venta_id', v_venta->>'ref',
    'factura_id', coalesce(v_factura->>'ref',
                           (select i.id::text from public.invoice_sales i
                             where v_venta is not null and i.sale_id = (v_venta->>'ref')::uuid
                               and coalesce(i.document_type, 'invoice') <> 'credit_note'
                             order by (i.status in ('void', 'voided', 'cancelled')), i.created_at desc limit 1)),
    'numero', coalesce(v_factura->>'numero', v_venta->>'numero'),
    'fecha', coalesce(v_venta->'fecha', v_factura->'fecha'),
    'sucursal', (select jsonb_build_object('id', b.id, 'nombre', b.name)
                   from public.branches b where b.id = v_sucursal and b.organization_id = p_org));
end;
$$;

-- Eventos de un serial, del más antiguo al más reciente, con su documento.
create or replace function public.fn_seriales_int_eventos(p_org integer, p_serial_id integer)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', e.id,
           'tipo', e.event_type,
           'fecha', e.event_date,
           'de_estado', e.from_status,
           'a_estado', e.to_status,
           'de_sucursal', (select b.name from public.branches b where b.id = e.from_branch_id and b.organization_id = p_org),
           'a_sucursal', (select b.name from public.branches b where b.id = e.to_branch_id and b.organization_id = p_org),
           'cliente', (select jsonb_build_object('id', c.id, 'nombre', c.full_name)
                         from public.customers c where c.id = e.customer_id and c.organization_id = p_org),
           'usuario', public.fn_seriales_int_nombre_usuario(e.performed_by),
           'documento', public.fn_seriales_int_documento(p_org, e.source_table, e.source_id),
           'notas', e.notes,
           'metadata', e.metadata)
         order by e.event_date, e.id), '[]'::jsonb)
    from public.serial_tracking_events e
   where e.serial_number_id = p_serial_id
     and e.organization_id = p_org;
$$;

-- ── Permisos para la interfaz (la RPC de cada acción vuelve a exigir) ──────────

create or replace function public.fn_seriales_permisos(p_org integer)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_duenio boolean;
  v_gestionar boolean;
begin
  perform public.fn_assert_acceso_org(p_org);
  if v_uid is null then
    return jsonb_build_object('ver', true, 'gestionar', true, 'costos', true);
  end if;
  select exists (select 1 from public.organizations o where o.id = p_org and o.owner_user_id = v_uid) into v_duenio;
  v_gestionar := v_duenio
    or public.check_user_permission(v_uid, p_org, 'inventory.edit')
    or public.check_user_permission(v_uid, p_org, 'inventory.adjust')
    or public.check_user_permission(v_uid, p_org, 'inventory_management')
    or public.check_user_permission(v_uid, p_org, 'product_management');
  return jsonb_build_object(
    'ver', v_gestionar or public.check_user_permission(v_uid, p_org, 'inventory.view'),
    'gestionar', v_gestionar,
    'costos', public.fn_receta_int_puede_ver_costos(p_org));
end;
$$;

-- ── Listado ───────────────────────────────────────────────────────────────────
-- p_filtros: { busqueda, estados: text[], sucursal, producto, garantia
--   (vigente · por_vencer · vencida · sin_iniciar · corriendo_en_bodega),
--   orden (serial · recibido · venta), direccion (asc · desc), desde, limite }
-- Los KPI respetan la sucursal y nada más (son el resumen de la pantalla).

create or replace function public.fn_seriales_listado(p_org integer, p_filtros jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_f jsonb := coalesce(p_filtros, '{}'::jsonb);
  v_busqueda text := nullif(btrim(coalesce(v_f->>'busqueda', '')), '');
  v_estados text[];
  v_sucursal integer := case when coalesce(v_f->>'sucursal', '') ~ '^\d+$' then (v_f->>'sucursal')::integer end;
  v_producto integer := case when coalesce(v_f->>'producto', '') ~ '^\d+$' then (v_f->>'producto')::integer end;
  v_garantia text := nullif(v_f->>'garantia', '');
  v_orden text := coalesce(nullif(v_f->>'orden', ''), 'recibido');
  v_asc boolean := lower(coalesce(v_f->>'direccion', 'desc')) = 'asc';
  v_desde integer := greatest(case when coalesce(v_f->>'desde', '') ~ '^\d+$' then (v_f->>'desde')::integer else 0 end, 0);
  v_limite integer := least(greatest(case when coalesce(v_f->>'limite', '') ~ '^\d+$' then (v_f->>'limite')::integer else 25 end, 1), 5000);
  v_patron text;
  v_hoy date;
  v_costos boolean;
  v_total integer;
  v_ids integer[];
  v_filas jsonb;
  v_kpis jsonb;
begin
  perform public.fn_seriales_int_exigir(p_org, false);
  if v_sucursal is not null then
    if not exists (select 1 from public.branches b where b.id = v_sucursal and b.organization_id = p_org) then
      raise exception 'sucursal_invalida' using errcode = '22023';
    end if;
    perform public.fn_fc_acceso_sucursal(v_sucursal);
  end if;
  if jsonb_typeof(v_f->'estados') = 'array' then
    select array_agg(x) into v_estados from jsonb_array_elements_text(v_f->'estados') x;
  end if;

  v_hoy := public.fn_seriales_int_hoy(p_org);
  v_costos := public.fn_receta_int_puede_ver_costos(p_org);
  v_patron := '%' || replace(replace(replace(coalesce(v_busqueda, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';

  with base as (
    select sn.id, sn.serial, sn.received_date, sn.created_at, sn.sale_date
      from public.serial_numbers sn
      join public.products p on p.id = sn.product_id
      left join public.customers c on c.id = sn.sold_to_customer_id
     where sn.organization_id = p_org
       and (v_sucursal is null or coalesce(sn.current_branch_id, sn.branch_id) = v_sucursal)
       and (v_producto is null or sn.product_id = v_producto)
       and (v_estados is null or sn.status = any (v_estados))
       and (v_busqueda is null
            or sn.serial ilike v_patron
            or p.name ilike v_patron
            or p.sku ilike v_patron
            or c.full_name ilike v_patron)
       and (v_garantia is null
            or (v_garantia = 'vigente' and sn.warranty_end >= v_hoy)
            or (v_garantia = 'por_vencer' and sn.warranty_end between v_hoy and v_hoy + 30)
            or (v_garantia = 'vencida' and sn.warranty_end < v_hoy)
            or (v_garantia = 'sin_iniciar' and sn.warranty_end is null
                and coalesce(sn.warranty_months, p.warranty_months, 0) > 0)
            or (v_garantia = 'corriendo_en_bodega' and sn.status in ('in_stock', 'reserved', 'in_transit')
                and sn.warranty_end is not null))
  ), pagina as (
    select b.id
      from base b
     order by
       case when v_orden = 'serial' and v_asc then b.serial end asc,
       case when v_orden = 'serial' and not v_asc then b.serial end desc,
       case when v_orden = 'venta' and v_asc then b.sale_date end asc nulls last,
       case when v_orden = 'venta' and not v_asc then b.sale_date end desc nulls last,
       case when v_orden not in ('serial', 'venta') and v_asc then coalesce(b.received_date, b.created_at) end asc,
       case when v_orden not in ('serial', 'venta') and not v_asc then coalesce(b.received_date, b.created_at) end desc,
       b.id desc
     offset v_desde limit v_limite
  )
  select (select count(*) from base), (select array_agg(id) from pagina)
    into v_total, v_ids;

  select coalesce(jsonb_agg(fila order by ord), '[]'::jsonb)
    into v_filas
    from (
      select array_position(v_ids, sn.id) as ord,
             jsonb_build_object(
               'id', sn.id,
               'serial', sn.serial,
               'estado', sn.status,
               'producto', jsonb_build_object('id', p.id, 'uuid', p.uuid, 'nombre', p.name, 'sku', p.sku),
               'sucursal', (select jsonb_build_object('id', b.id, 'nombre', b.name) from public.branches b
                             where b.id = coalesce(sn.current_branch_id, sn.branch_id) and b.organization_id = p_org),
               'recibido', sn.received_date,
               'origen', coalesce(
                  public.fn_seriales_int_documento(p_org, 'purchase_orders', sn.purchase_order_id::text),
                  public.fn_seriales_int_documento(p_org, 'invoice_purchase', sn.purchase_invoice_id::text)),
               'proveedor', (select jsonb_build_object('id', s.id, 'uuid', s.uuid, 'nombre', s.name)
                               from public.suppliers s where s.id = sn.supplier_id and s.organization_id = p_org),
               'costo', case when v_costos then sn.cost_at_purchase end,
               'venta', public.fn_seriales_int_venta(p_org, sn.sale_id, sn.invoice_sale_id),
               'fecha_venta', sn.sale_date,
               'vendedor', public.fn_seriales_int_nombre_usuario(sn.sold_by_user_id),
               'cliente', (select jsonb_build_object('id', c.id, 'nombre', c.full_name)
                             from public.customers c where c.id = sn.sold_to_customer_id and c.organization_id = p_org),
               'garantia', jsonb_build_object('meses', coalesce(sn.warranty_months, p.warranty_months),
                                              'inicio', sn.warranty_start, 'fin', sn.warranty_end),
               'reclamo', (select jsonb_build_object('id', w.id, 'codigo', w.code, 'estado', w.status,
                                                     'rma', w.supplier_rma_number)
                             from public.warranty_claims w
                            where w.serial_number_id = sn.id and w.organization_id = p_org
                            order by (w.status in ('pending', 'approved', 'in_process')) desc, w.claim_date desc
                            limit 1),
               'ultimo_evento', (select jsonb_build_object(
                                          'tipo', e.event_type, 'fecha', e.event_date,
                                          'a_sucursal', (select b.name from public.branches b
                                                          where b.id = e.to_branch_id and b.organization_id = p_org),
                                          'documento', public.fn_seriales_int_documento(p_org, e.source_table, e.source_id))
                                   from public.serial_tracking_events e
                                  where e.serial_number_id = sn.id and e.organization_id = p_org
                                    and e.event_type <> 'warranty_reset'
                                  order by e.event_date desc, e.id desc
                                  limit 1)
             ) as fila
        from public.serial_numbers sn
        join public.products p on p.id = sn.product_id
       where sn.id = any (coalesce(v_ids, '{}'::integer[]))
    ) x;

  select jsonb_build_object(
           'en_stock', count(*) filter (where sn.status = 'in_stock'),
           'sucursales_en_stock', count(distinct coalesce(sn.current_branch_id, sn.branch_id)) filter (where sn.status = 'in_stock'),
           'vendidos', count(*) filter (where sn.status = 'sold'),
           'vendidos_con_venta', count(*) filter (where sn.status = 'sold' and (sn.sale_id is not null or sn.invoice_sale_id is not null)),
           'vendidos_con_cliente', count(*) filter (where sn.status = 'sold' and sn.sold_to_customer_id is not null),
           'garantia_vigente', count(*) filter (where sn.warranty_end >= v_hoy),
           'garantia_vence_30', count(*) filter (where sn.warranty_end between v_hoy and v_hoy + 30),
           'en_reclamo', count(*) filter (where sn.status in ('warranty_claim', 'rma', 'repair', 'warranty')),
           'reclamos_abiertos', (select count(*) from public.warranty_claims w
                                  where w.organization_id = p_org and w.status in ('pending', 'approved', 'in_process')),
           'corriendo_en_bodega', count(*) filter (where sn.status in ('in_stock', 'reserved', 'in_transit')
                                                   and sn.warranty_end is not null),
           'total', count(*))
    into v_kpis
    from public.serial_numbers sn
   where sn.organization_id = p_org
     and (v_sucursal is null or coalesce(sn.current_branch_id, sn.branch_id) = v_sucursal);

  return jsonb_build_object('filas', v_filas, 'total', coalesce(v_total, 0), 'kpis', v_kpis, 'hoy', v_hoy);
end;
$$;

-- ── Detalle ───────────────────────────────────────────────────────────────────

create or replace function public.fn_serial_detalle(p_org integer, p_id integer)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_sn public.serial_numbers%rowtype;
  v_p public.products%rowtype;
  v_costos boolean;
begin
  perform public.fn_seriales_int_exigir(p_org, false);
  select * into v_sn from public.serial_numbers where id = p_id and organization_id = p_org;
  if not found then
    raise exception 'serial_no_encontrado' using errcode = 'P0002';
  end if;
  select * into v_p from public.products where id = v_sn.product_id;
  v_costos := public.fn_receta_int_puede_ver_costos(p_org);

  return jsonb_build_object(
    'id', v_sn.id,
    'serial', v_sn.serial,
    'estado', v_sn.status,
    'notas', v_sn.notes,
    'producto', jsonb_build_object('id', v_p.id, 'uuid', v_p.uuid, 'nombre', v_p.name, 'sku', v_p.sku),
    'proveedor', (select jsonb_build_object('id', s.id, 'uuid', s.uuid, 'nombre', s.name)
                    from public.suppliers s where s.id = v_sn.supplier_id and s.organization_id = p_org),
    'origen', coalesce(
       public.fn_seriales_int_documento(p_org, 'purchase_orders', v_sn.purchase_order_id::text),
       public.fn_seriales_int_documento(p_org, 'invoice_purchase', v_sn.purchase_invoice_id::text)),
    'recibido', v_sn.received_date,
    'recibido_en', (select jsonb_build_object('id', b.id, 'nombre', b.name) from public.branches b
                     where b.id = v_sn.branch_id and b.organization_id = p_org),
    'sucursal', (select jsonb_build_object('id', b.id, 'nombre', b.name) from public.branches b
                  where b.id = coalesce(v_sn.current_branch_id, v_sn.branch_id) and b.organization_id = p_org),
    'costo', case when v_costos then v_sn.cost_at_purchase end,
    'lote', (select jsonb_build_object('id', l.id, 'codigo', l.lot_code, 'vence', l.expiry_date)
               from public.lots l where l.id = v_sn.lot_id and l.product_id = v_sn.product_id),
    'venta', public.fn_seriales_int_venta(p_org, v_sn.sale_id, v_sn.invoice_sale_id),
    'fecha_venta', v_sn.sale_date,
    'canal', v_sn.sale_channel,
    'precio_venta', v_sn.price_at_sale,
    'vendedor', public.fn_seriales_int_nombre_usuario(v_sn.sold_by_user_id),
    'cliente', (select jsonb_build_object('id', c.id, 'nombre', c.full_name)
                  from public.customers c where c.id = v_sn.sold_to_customer_id and c.organization_id = p_org),
    'garantia', jsonb_build_object('meses', coalesce(v_sn.warranty_months, v_p.warranty_months),
                                   'inicio', v_sn.warranty_start, 'fin', v_sn.warranty_end),
    'reclamos', (select coalesce(jsonb_agg(jsonb_build_object(
                          'id', w.id, 'codigo', w.code, 'estado', w.status, 'fecha', w.claim_date,
                          'motivo', w.claim_reason, 'rma', w.supplier_rma_number, 'resolucion', w.resolution_type)
                        order by w.claim_date desc), '[]'::jsonb)
                   from public.warranty_claims w
                  where w.serial_number_id = v_sn.id and w.organization_id = p_org),
    'eventos', public.fn_seriales_int_eventos(p_org, v_sn.id),
    'hoy', public.fn_seriales_int_hoy(p_org),
    'permisos', public.fn_seriales_permisos(p_org));
end;
$$;

-- ── Privilegios ───────────────────────────────────────────────────────────────

revoke all on function public.fn_seriales_int_exigir(integer, boolean) from public, anon, authenticated;
revoke all on function public.fn_seriales_int_hoy(integer) from public, anon, authenticated;
revoke all on function public.fn_seriales_int_nombre_usuario(uuid) from public, anon, authenticated;
revoke all on function public.fn_seriales_int_documento(integer, text, text) from public, anon, authenticated;
revoke all on function public.fn_seriales_int_venta(integer, text, uuid) from public, anon, authenticated;
revoke all on function public.fn_seriales_int_eventos(integer, integer) from public, anon, authenticated;
grant execute on function public.fn_seriales_int_exigir(integer, boolean) to service_role;
grant execute on function public.fn_seriales_int_hoy(integer) to service_role;
grant execute on function public.fn_seriales_int_nombre_usuario(uuid) to service_role;
grant execute on function public.fn_seriales_int_documento(integer, text, text) to service_role;
grant execute on function public.fn_seriales_int_venta(integer, text, uuid) to service_role;
grant execute on function public.fn_seriales_int_eventos(integer, integer) to service_role;

revoke all on function public.fn_seriales_permisos(integer) from public, anon;
revoke all on function public.fn_seriales_listado(integer, jsonb) from public, anon;
revoke all on function public.fn_serial_detalle(integer, integer) from public, anon;
grant execute on function public.fn_seriales_permisos(integer) to authenticated, service_role;
grant execute on function public.fn_seriales_listado(integer, jsonb) to authenticated, service_role;
grant execute on function public.fn_serial_detalle(integer, integer) to authenticated, service_role;
