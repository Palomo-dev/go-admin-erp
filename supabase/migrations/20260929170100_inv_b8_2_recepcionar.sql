-- Inventario B8 · Recepción de órdenes de compra en UNA transacción
-- (INVENTARIO-PLAN.md §5.9, P6: permiso `recibir` = inventory.create o
-- inventory_management).
--
-- Antes (purchaseOrderService.receiveItems / receiveItemsWithSerials, en el
-- navegador): received_quantity por UPDATE directo línea por línea; el stock en
-- otra llamada cuyo fallo «no bloqueaba la recepción» (la OC quedaba recibida sin
-- mercancía); seriales uno a uno con los errores en la consola; sin lote ni
-- vencimiento; la factura automática, otro paso aparte que también podía fallar
-- en silencio.
--
-- Ahora fn_oc_recepcionar(p_org, p_po_uuid, p_lineas, p_clave_idempotencia,
-- p_notas) hace todo o nada:
-- * cantidades por línea con guarda de sobre-recepción (recibido + ahora ≤ pedido);
-- * lotes con vencimiento (existentes o nuevos por fn_lote_guardar de B1);
--   obligatorios si el producto maneja lotes (products.track_lots);
-- * seriales únicos por organización (P8), obligatorios si el producto los
--   controla; se crean «en tránsito» y la primitiva los deja in_stock con su
--   evento `received`. Solo guardan el plazo de garantía (warranty_months): la
--   garantía arranca al vender (disparador de B4);
-- * el kardex SOLO por fn_kardex_entrada_compra_int → fn_inv_int_mover: bloqueo,
--   costo del proveedor (el de la línea de la OC) → promedio ponderado, vigencia
--   en product_costs y lote;
-- * estado de la OC (partial/received) y, al completarla, la factura de compra y
--   su CxP con fn_factura_compra_desde_oc (misma transacción; si falla, no queda
--   nada recibido);
-- * documento de recepción (purchase_receipts / purchase_receipt_items) con la
--   diferencia con la orden, e idempotencia por clave.
--
-- Cambios sobre funciones existentes (parche sobre la definición viva con md5
-- comprobado; la anterior queda en private.respaldo_funciones para el rollback):
-- * fn_kardex_entrada_compra_int: una línea puede traer `serial_ids`; se pasan a
--   la primitiva como opción `seriales` (valida cantidad = seriales, los deja
--   in_stock en la sucursal con el lote y registra el evento). Sin `serial_ids`,
--   idéntica.
-- * fn_factura_compra_desde_oc: el cuerpo pasa a fn_fc_int_desde_oc (sin
--   EXECUTE para authenticated); la pública exige el mismo permiso que antes y
--   la llama. Así la recepción, que ya exigió `recibir`, genera la factura sin
--   una segunda regla de permisos y sin copiar su lógica (regla dura 7).

-- ── 0. Respaldo y comprobación de las definiciones vivas ─────────────────────
create table if not exists private.respaldo_funciones (
  migracion text not null,
  firma text not null,
  definicion text not null,
  md5 text not null,
  guardado_en timestamptz not null default now(),
  primary key (migracion, firma)
);
revoke all on table private.respaldo_funciones from anon, authenticated, public;

do $$
declare
  v_esperado constant jsonb := jsonb_build_object(
    'fn_kardex_entrada_compra_int(integer,integer,text,text,jsonb,uuid,integer,boolean)', 'a586bedad227f2eb1efdbb089847d579',
    'fn_factura_compra_desde_oc(uuid)', '5c728c77e4006bf9f0852706b86eb259');
  v_firma text;
  v_def text;
begin
  for v_firma in select jsonb_object_keys(v_esperado) loop
    v_def := pg_get_functiondef(('public.' || v_firma)::regprocedure);
    if position('serial_ids' in v_def) > 0 or position('fn_fc_int_desde_oc' in v_def) > 0 then
      continue; -- ya aplicada
    end if;
    if md5(v_def) <> v_esperado->>v_firma then
      raise exception 'La definición viva de % cambió desde que se escribió esta migración (md5 %). Releer y rehacer el parche.',
        v_firma, md5(v_def);
    end if;
    insert into private.respaldo_funciones (migracion, firma, definicion, md5)
    values ('20260929170100_inv_b8_2', v_firma, v_def, md5(v_def))
    on conflict (migracion, firma) do nothing;
  end loop;
end $$;

-- ── 1. fn_kardex_entrada_compra_int: seriales por línea ──────────────────────
do $$
declare
  v_def text := pg_get_functiondef('public.fn_kardex_entrada_compra_int(integer,integer,text,text,jsonb,uuid,integer,boolean)'::regprocedure);
  v_marca constant text := 'jsonb_build_object(''recalcular_costo'', true));';
  v_nuevo constant text := 'jsonb_build_object(''recalcular_costo'', true)
                                   -- B8: seriales de la línea (serial_numbers.id), si llegan.
                                   || case when jsonb_typeof(v_linea->''serial_ids'') = ''array''
                                                and jsonb_array_length(v_linea->''serial_ids'') > 0
                                           then jsonb_build_object(''seriales'', v_linea->''serial_ids'')
                                           else ''{}''::jsonb end);';
begin
  if position('serial_ids' in v_def) > 0 then
    return;
  end if;
  if (length(v_def) - length(replace(v_def, v_marca, ''))) / length(v_marca) <> 1 then
    raise exception 'fn_kardex_entrada_compra_int: el marcador no aparece exactamente una vez';
  end if;
  execute replace(v_def, v_marca, v_nuevo);
end $$;

revoke all on function public.fn_kardex_entrada_compra_int(integer, integer, text, text, jsonb, uuid, integer, boolean)
  from public, anon, authenticated;

-- ── 2. Factura desde la OC: interna + pública con el mismo permiso ──────────
create or replace function public.fn_fc_int_desde_oc(p_po_uuid uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_po record;
  v_existente uuid;
  v_dias integer;
  v_lineas jsonb;
  v_numero text;
  v_g jsonb;
  v_c jsonb;
  v_id uuid;
begin
  select po.id, po.organization_id, po.branch_id, po.supplier_id, po.notes into v_po
    from public.purchase_orders po where po.uuid = p_po_uuid;
  if v_po.id is null then
    raise exception 'ORDEN_NO_ENCONTRADA' using errcode = 'P0002';
  end if;
  perform public.fn_assert_acceso_org(v_po.organization_id);
  perform public.fn_fc_acceso_sucursal(v_po.branch_id);

  perform pg_advisory_xact_lock(hashtextextended('factura_desde_oc:' || v_po.id, 0));
  select id into v_existente from public.invoice_purchase
   where organization_id = v_po.organization_id and po_id = v_po.id and status <> 'void'
   order by created_at limit 1;
  if v_existente is not null then
    return jsonb_build_object('invoice_id', v_existente, 'ya_existia', true);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'product_id', poi.product_id,
           'description', coalesce(p.name, 'Producto'),
           'qty', poi.received_quantity,
           'unit_price', poi.unit_cost,
           'tax_rate', 0,
           'discount_amount', 0,
           'serial_numbers', to_jsonb(coalesce(poi.serials_received, '{}'::text[]))) order by poi.id), '[]'::jsonb)
    into v_lineas
    from public.purchase_order_items poi
    left join public.products p on p.id = poi.product_id
   where poi.purchase_order_id = v_po.id and coalesce(poi.received_quantity, 0) > 0;
  if jsonb_array_length(v_lineas) = 0 then
    raise exception 'ORDEN_SIN_RECEPCION' using errcode = '22023';
  end if;

  -- Los seriales de la OC ya existen (con `purchase_order_id`): no se duplican,
  -- se enlazan a la factura después.
  v_lineas := (select jsonb_agg(l - 'serial_numbers') from jsonb_array_elements(v_lineas) l);

  select coalesce(s.credit_days, 30) into v_dias from public.suppliers s where s.id = v_po.supplier_id;
  v_numero := public.fn_siguiente_numero_compra(v_po.organization_id);

  v_g := public.fn_fc_guardar_int(v_po.organization_id, jsonb_build_object(
    'branch_id', v_po.branch_id,
    'supplier_id', v_po.supplier_id,
    'po_id', v_po.id,
    'number_ext', v_numero,
    'issue_date', now(),
    'due_date', now() + make_interval(days => v_dias),
    'payment_terms', v_dias,
    'tax_included', false,
    'notes', btrim('Generada desde la orden de compra OC-' || v_po.id || '. ' || coalesce(v_po.notes, '')),
    'lines', v_lineas
  ), auth.uid());
  v_id := (v_g->>'id')::uuid;

  -- La mercancía ya entró con la recepción de la OC: se confirma sin kardex.
  v_c := public.fn_fc_confirmar_int(v_id, false, false, auth.uid());
  update public.invoice_purchase set stock_received_at = now() where id = v_id;
  update public.serial_numbers set purchase_invoice_id = v_id
   where purchase_order_id = v_po.id and purchase_invoice_id is null and organization_id = v_po.organization_id;

  return jsonb_build_object('invoice_id', v_id, 'number_ext', v_numero, 'ya_existia', false,
                            'accounts_payable_id', v_c->'accounts_payable_id');
end;
$function$;

comment on function public.fn_fc_int_desde_oc(uuid) is
  'Factura de compra (y CxP) desde una OC recibida, sin kardex. Interna: la llaman fn_factura_compra_desde_oc (con su permiso) y fn_oc_recepcionar (con `recibir`).';

revoke all on function public.fn_fc_int_desde_oc(uuid) from public, anon, authenticated;

create or replace function public.fn_factura_compra_desde_oc(p_po_uuid uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_org integer;
begin
  select po.organization_id into v_org from public.purchase_orders po where po.uuid = p_po_uuid;
  if v_org is null then
    raise exception 'ORDEN_NO_ENCONTRADA' using errcode = 'P0002';
  end if;
  perform public.fn_finanzas_exigir_permiso(v_org, array['finance.create', 'inventory.create']);
  return public.fn_fc_int_desde_oc(p_po_uuid);
end;
$function$;

revoke all on function public.fn_factura_compra_desde_oc(uuid) from public, anon;
grant execute on function public.fn_factura_compra_desde_oc(uuid) to authenticated;

-- ── 3. fn_oc_recepcionar ─────────────────────────────────────────────────────
create or replace function public.fn_oc_recepcionar(
  p_org integer,
  p_po_uuid uuid,
  p_lineas jsonb,
  p_clave_idempotencia text,
  p_notas text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_clave text := nullif(btrim(coalesce(p_clave_idempotencia, '')), '');
  v_po public.purchase_orders%rowtype;
  v_previa public.purchase_receipts%rowtype;
  v_recepcion_id bigint;
  v_codigo text;
  v_n integer;
  v_l jsonb;
  v_item record;
  v_item_id integer;
  v_vistos integer[] := '{}';
  v_qty numeric;
  v_antes numeric;
  v_exige_serial boolean;
  v_seriales text[];
  v_todos text[] := '{}';
  v_repetido text;
  v_lotes jsonb;
  v_lote jsonb;
  v_suma numeric;
  v_trozos jsonb;
  v_trozo jsonb;
  v_trozo_qty numeric;
  v_lot_id integer;
  v_lot_code text;
  v_lot_exp date;
  v_lote_fila public.lots%rowtype;
  v_g jsonb;
  v_pos integer;
  v_ser_trozo text[];
  v_ser_ids integer[];
  v_k jsonb;
  v_mov integer;
  v_lineas_res jsonb := '[]'::jsonb;
  v_lotes_res jsonb;
  v_ser_res jsonb;
  v_movs jsonb;
  v_saltadas jsonb := '[]'::jsonb;
  v_completa boolean;
  v_estado text;
  v_factura jsonb;
  v_pendientes jsonb;
  v_res jsonb;
begin
  perform public.fn_inventario_exigir_permiso(p_org, array['recibir']);

  if v_clave is null or length(v_clave) < 8 or length(v_clave) > 120 then
    raise exception 'clave_invalida' using errcode = '22023';
  end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'sin_lineas' using errcode = '22023';
  end if;
  if jsonb_array_length(p_lineas) > 500 then
    raise exception 'demasiadas_lineas' using errcode = '22023';
  end if;

  -- La orden, bloqueada: dos recepciones simultáneas de la misma OC se serializan.
  select * into v_po from public.purchase_orders po
   where po.uuid = p_po_uuid and po.organization_id = p_org
   for update;
  if v_po.id is null then
    raise exception 'orden_no_encontrada' using errcode = 'P0002';
  end if;
  perform public.fn_fc_acceso_sucursal(v_po.branch_id);

  -- Idempotencia: la misma clave devuelve la misma recepción, sin mover nada.
  perform pg_advisory_xact_lock(hashtextextended('oc_recepcion:' || p_org || ':' || v_clave, 0));
  select * into v_previa from public.purchase_receipts r
   where r.organization_id = p_org and r.idempotency_key = v_clave;
  if v_previa.id is not null then
    if v_previa.purchase_order_id <> v_po.id then
      raise exception 'clave_reutilizada' using errcode = '22023';
    end if;
    return v_previa.resultado || jsonb_build_object('ya_procesada', true);
  end if;

  if v_po.status not in ('sent', 'partial') then
    raise exception 'orden_no_recibible' using errcode = '22023', detail = v_po.status;
  end if;

  -- Documento de recepción (REC-0001 por organización).
  perform pg_advisory_xact_lock(hashtextextended('oc_recepcion_codigo:' || p_org, 0));
  select coalesce(max(substring(r.code from '^REC-([0-9]{1,9})$')::integer), 0) + 1 into v_n
    from public.purchase_receipts r where r.organization_id = p_org;
  v_codigo := 'REC-' || lpad(v_n::text, 4, '0');
  insert into public.purchase_receipts (organization_id, purchase_order_id, branch_id, code, idempotency_key, notes, received_by)
  values (p_org, v_po.id, v_po.branch_id, v_codigo, v_clave, left(nullif(btrim(coalesce(p_notas, '')), ''), 1000), v_uid)
  returning id into v_recepcion_id;

  for v_l in select * from jsonb_array_elements(p_lineas) loop
    if coalesce(v_l->>'po_item_id', '') !~ '^\d{1,9}$' then
      raise exception 'linea_invalida' using errcode = '22023';
    end if;
    v_item_id := (v_l->>'po_item_id')::integer;
    if v_item_id = any(v_vistos) then
      raise exception 'linea_repetida' using errcode = '22023', detail = v_item_id::text;
    end if;
    v_vistos := v_vistos || v_item_id;

    select poi.id, poi.product_id, poi.quantity, poi.received_quantity, poi.unit_cost,
           coalesce(poi.requires_serial, false) as requires_serial,
           p.name, p.track_stock, coalesce(p.track_serial, false) as track_serial,
           coalesce(p.track_lots, false) as track_lots, p.warranty_months
      into v_item
      from public.purchase_order_items poi
      join public.products p on p.id = poi.product_id
     where poi.id = v_item_id and poi.purchase_order_id = v_po.id
     for update of poi;
    if v_item.id is null then
      raise exception 'linea_no_es_de_la_orden' using errcode = '22023', detail = v_item_id::text;
    end if;
    if nullif(v_l->>'product_id', '') is not null and (v_l->>'product_id') <> v_item.product_id::text then
      raise exception 'producto_no_coincide' using errcode = '22023', detail = v_item_id::text;
    end if;
    -- P1: el stock vive en las variantes; un padre con variantes no se recibe.
    if exists (select 1 from public.products c where c.parent_product_id = v_item.product_id) then
      raise exception 'producto_con_variantes' using errcode = '22023', detail = v_item_id::text;
    end if;

    begin
      v_qty := round(nullif(v_l->>'qty', '')::numeric, 3);
    exception when others then
      v_qty := null;
    end;
    if v_qty is null or v_qty <= 0 then
      raise exception 'cantidad_invalida' using errcode = '22023', detail = v_item_id::text;
    end if;
    v_antes := coalesce(v_item.received_quantity, 0);
    if v_antes + v_qty > v_item.quantity then
      raise exception 'sobre_recepcion' using errcode = '23514',
        detail = jsonb_build_object('po_item_id', v_item_id, 'producto', v_item.name, 'pedido', v_item.quantity,
                                    'recibido', v_antes, 'solicitado', v_qty,
                                    'pendiente', greatest(v_item.quantity - v_antes, 0))::text;
    end if;

    -- Seriales: limpios, sin repetir en la petición ni en la organización (P8).
    select coalesce(array_agg(s order by o), '{}') into v_seriales
      from (select btrim(x) s, min(o) o
              from jsonb_array_elements_text(case when jsonb_typeof(v_l->'seriales') = 'array'
                                                  then v_l->'seriales' else '[]'::jsonb end) with ordinality t(x, o)
             where btrim(x) <> '' group by btrim(x)) q;
    if jsonb_typeof(v_l->'seriales') = 'array'
       and cardinality(v_seriales) <> (select count(*) from jsonb_array_elements_text(v_l->'seriales') x where btrim(x) <> '') then
      raise exception 'serial_repetido' using errcode = '23505',
        detail = (select btrim(x) from jsonb_array_elements_text(v_l->'seriales') x where btrim(x) <> ''
                   group by btrim(x) having count(*) > 1 limit 1);
    end if;
    v_exige_serial := v_item.track_serial or v_item.requires_serial;
    if cardinality(v_seriales) > 0 or v_exige_serial then
      if v_qty <> trunc(v_qty) then
        raise exception 'cantidad_serial_entera' using errcode = '22023', detail = v_item_id::text;
      end if;
      if cardinality(v_seriales) <> v_qty then
        raise exception 'seriales_no_cuadran' using errcode = '22023',
          detail = jsonb_build_object('po_item_id', v_item_id, 'producto', v_item.name,
                                      'cantidad', v_qty, 'seriales', cardinality(v_seriales))::text;
      end if;
      if v_item.track_stock is not true then
        raise exception 'producto_sin_control_de_stock' using errcode = '22023', detail = v_item_id::text;
      end if;
    end if;
    select x into v_repetido from unnest(v_seriales) x where x = any(v_todos) limit 1;
    if v_repetido is null then
      select s.serial into v_repetido from public.serial_numbers s
       where s.organization_id = p_org and s.serial = any(v_seriales) limit 1;
    end if;
    if v_repetido is not null then
      raise exception 'serial_repetido' using errcode = '23505', detail = v_repetido;
    end if;
    v_todos := v_todos || v_seriales;

    -- Lotes: el reparto debe cuadrar con la cantidad; obligatorio si el producto los maneja.
    v_lotes := case when jsonb_typeof(v_l->'lotes') = 'array' then v_l->'lotes' else '[]'::jsonb end;
    if jsonb_array_length(v_lotes) = 0 then
      if v_item.track_lots then
        raise exception 'lote_requerido' using errcode = '22023', detail = v_item_id::text;
      end if;
      v_trozos := jsonb_build_array(jsonb_build_object('qty', v_qty));
    else
      select coalesce(sum(round(nullif(x->>'qty', '')::numeric, 3)), 0) into v_suma from jsonb_array_elements(v_lotes) x;
      if v_suma <> v_qty or exists (select 1 from jsonb_array_elements(v_lotes) x
                                     where coalesce(round(nullif(x->>'qty', '')::numeric, 3), 0) <= 0) then
        raise exception 'lotes_no_cuadran' using errcode = '22023',
          detail = jsonb_build_object('po_item_id', v_item_id, 'cantidad', v_qty, 'lotes', v_suma)::text;
      end if;
      v_trozos := v_lotes;
    end if;

    v_lotes_res := '[]'::jsonb;
    v_ser_res := '[]'::jsonb;
    v_movs := '[]'::jsonb;
    v_pos := 1;

    for v_trozo in select * from jsonb_array_elements(v_trozos) loop
      v_trozo_qty := round((v_trozo->>'qty')::numeric, 3);
      v_lot_id := null;
      v_lot_code := null;
      v_lot_exp := null;

      if jsonb_array_length(v_lotes) > 0 then
        if nullif(v_trozo->>'expiry_date', '') is not null then
          if v_trozo->>'expiry_date' !~ '^\d{4}-\d{2}-\d{2}$' then
            raise exception 'fecha_invalida' using errcode = '22023', detail = v_item_id::text;
          end if;
          v_lot_exp := (v_trozo->>'expiry_date')::date;
        end if;

        if coalesce(v_trozo->>'lot_id', '') ~ '^\d{1,9}$' then
          select * into v_lote_fila from public.lots l
           where l.id = (v_trozo->>'lot_id')::integer and l.organization_id = p_org and l.product_id = v_item.product_id;
          if v_lote_fila.id is null then
            raise exception 'lote_invalido' using errcode = '22023', detail = (v_trozo->>'lot_id');
          end if;
        else
          v_lot_code := left(nullif(btrim(coalesce(v_trozo->>'lot_code', '')), ''), 60);
          v_lote_fila := null;
          if v_lot_code is not null then
            select * into v_lote_fila from public.lots l
             where l.organization_id = p_org and l.product_id = v_item.product_id and l.lot_code = v_lot_code
             for update;
          end if;
          if v_lote_fila.id is null then
            -- Lote nuevo por la función de B1 (sin código propone L-AAAAMMDD).
            v_g := public.fn_lote_guardar(p_org, jsonb_build_object(
              'product_id', v_item.product_id, 'lot_code', v_lot_code, 'expiry_date', v_lot_exp,
              'supplier_id', v_po.supplier_id, 'branch_id', v_po.branch_id));
            select * into v_lote_fila from public.lots l where l.id = (v_g->>'lot_id')::integer;
          end if;
        end if;

        -- Mismo lote con otro vencimiento: error legible. Sin vencimiento previo, se completa.
        if v_lot_exp is not null then
          if v_lote_fila.expiry_date is null then
            update public.lots set expiry_date = v_lot_exp, updated_at = now() where id = v_lote_fila.id;
            v_lote_fila.expiry_date := v_lot_exp;
          elsif v_lote_fila.expiry_date <> v_lot_exp then
            raise exception 'lote_vencimiento_distinto' using errcode = '22023',
              detail = jsonb_build_object('lot_code', v_lote_fila.lot_code, 'vence', v_lote_fila.expiry_date,
                                          'recibido', v_lot_exp)::text;
          end if;
        end if;
        v_lot_id := v_lote_fila.id;
        v_lotes_res := v_lotes_res || jsonb_build_object('lot_id', v_lote_fila.id, 'lot_code', v_lote_fila.lot_code,
                                                         'expiry_date', v_lote_fila.expiry_date, 'qty', v_trozo_qty);
      end if;

      -- Seriales de este trozo (en orden) → filas «en tránsito»; la primitiva las deja in_stock.
      v_ser_ids := '{}';
      if cardinality(v_seriales) > 0 then
        if v_trozo_qty <> trunc(v_trozo_qty) then
          raise exception 'cantidad_serial_entera' using errcode = '22023', detail = v_item_id::text;
        end if;
        v_ser_trozo := v_seriales[v_pos : v_pos + v_trozo_qty::integer - 1];
        v_pos := v_pos + v_trozo_qty::integer;
        begin
          with nuevos as (
            insert into public.serial_numbers (
              product_id, serial, status, organization_id, branch_id, lot_id, supplier_id, purchase_order_id,
              cost_at_purchase, received_date, warranty_months, updated_by)
            select v_item.product_id, s, 'in_transit', p_org, v_po.branch_id, v_lot_id, v_po.supplier_id, v_po.id,
                   coalesce(v_item.unit_cost, 0), now(), v_item.warranty_months, v_uid
              from unnest(v_ser_trozo) s
            returning id, serial)
          select coalesce(array_agg(id order by id), '{}'),
                 v_ser_res || coalesce(jsonb_agg(jsonb_build_object('id', id, 'serial', serial) order by id), '[]'::jsonb)
            into v_ser_ids, v_ser_res
            from nuevos;
        exception when unique_violation then
          -- La unicidad global (serial_numbers_serial_key) sigue hasta P8 fase 2:
          -- no se dice de quién es el serial.
          raise exception 'serial_repetido' using errcode = '23505';
        end;
      end if;

      -- Kardex por el núcleo: costo del proveedor → promedio ponderado, vigencia y lote.
      v_k := public.fn_kardex_entrada_compra_int(
        p_org, v_po.branch_id, 'purchase_order', v_po.id::text,
        jsonb_build_array(jsonb_build_object(
          'product_id', v_item.product_id, 'qty', v_trozo_qty, 'unit_cost', coalesce(v_item.unit_cost, 0),
          'lot_id', v_lot_id, 'note', 'Recepción ' || v_codigo || ' de OC-' || v_po.id,
          'serial_ids', to_jsonb(v_ser_ids))),
        v_uid, v_po.supplier_id, false);
      v_mov := nullif(v_k->'procesadas'->0->>'movement_id', '')::integer;
      if v_mov is not null then
        v_movs := v_movs || to_jsonb(v_mov);
      end if;
      if jsonb_array_length(coalesce(v_k->'saltadas', '[]'::jsonb)) > 0 then
        v_saltadas := v_saltadas || (v_k->'saltadas'->0 || jsonb_build_object('po_item_id', v_item_id));
      end if;

      insert into public.purchase_receipt_items (
        receipt_id, organization_id, purchase_order_item_id, product_id, qty, unit_cost, lot_id, serial_ids,
        movement_id, ordered_qty, received_before)
      values (v_recepcion_id, p_org, v_item_id, v_item.product_id, v_trozo_qty, coalesce(v_item.unit_cost, 0), v_lot_id,
              v_ser_ids, v_mov, v_item.quantity, v_antes);
    end loop;

    update public.purchase_order_items
       set received_quantity = v_antes + v_qty,
           serials_received = case when cardinality(v_seriales) > 0
                                   then coalesce(serials_received, '{}'::text[]) || v_seriales
                                   else serials_received end,
           updated_at = now()
     where id = v_item_id;

    v_lineas_res := v_lineas_res || jsonb_build_object(
      'po_item_id', v_item_id, 'product_id', v_item.product_id, 'producto', v_item.name,
      'pedido', v_item.quantity, 'recibido_antes', v_antes, 'recibido_ahora', v_qty,
      'recibido_total', v_antes + v_qty, 'pendiente', greatest(v_item.quantity - v_antes - v_qty, 0),
      'costo_unitario', coalesce(v_item.unit_cost, 0),
      'lotes', v_lotes_res, 'seriales', v_ser_res, 'movimientos', v_movs);
  end loop;

  -- Estado de la OC y diferencia con la orden (todas sus líneas).
  select coalesce(bool_and(poi.received_quantity >= poi.quantity), false),
         coalesce(jsonb_agg(jsonb_build_object(
           'po_item_id', poi.id, 'product_id', poi.product_id, 'producto', p.name,
           'pedido', poi.quantity, 'recibido', poi.received_quantity,
           'pendiente', poi.quantity - poi.received_quantity) order by poi.id)
           filter (where poi.received_quantity < poi.quantity), '[]'::jsonb)
    into v_completa, v_pendientes
    from public.purchase_order_items poi
    left join public.products p on p.id = poi.product_id
   where poi.purchase_order_id = v_po.id;
  v_estado := case when v_completa then 'received' else 'partial' end;
  update public.purchase_orders set status = v_estado, updated_at = now() where id = v_po.id;

  -- Completa: factura de compra y CxP en la misma transacción (idempotente por OC).
  if v_completa then
    v_factura := public.fn_fc_int_desde_oc(v_po.uuid);
    update public.purchase_receipts set purchase_invoice_id = (v_factura->>'invoice_id')::uuid where id = v_recepcion_id;
  end if;

  v_res := jsonb_build_object(
    'recepcion_id', v_recepcion_id,
    'codigo', v_codigo,
    'orden', jsonb_build_object('id', v_po.id, 'uuid', v_po.uuid, 'codigo', 'OC-' || v_po.id,
                                'estado', v_estado, 'completa', v_completa),
    'lineas', v_lineas_res,
    'pendientes', v_pendientes,
    'saltadas', v_saltadas,
    'factura', v_factura);
  update public.purchase_receipts set resultado = v_res where id = v_recepcion_id;
  return v_res || jsonb_build_object('ya_procesada', false);
end;
$function$;

comment on function public.fn_oc_recepcionar(integer, uuid, jsonb, text, text) is
  'B8: recepción de una OC en una transacción (cantidades con guarda, lotes con vencimiento, seriales, kardex por la primitiva, estado de la OC, factura al completar). Idempotente por clave. Permiso: recibir.';

revoke all on function public.fn_oc_recepcionar(integer, uuid, jsonb, text, text) from public, anon;
grant execute on function public.fn_oc_recepcionar(integer, uuid, jsonb, text, text) to authenticated;
