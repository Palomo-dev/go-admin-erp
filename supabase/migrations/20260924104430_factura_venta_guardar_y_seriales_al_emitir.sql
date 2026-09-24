-- Facturas de venta — P1.4 / P8: guardar el borrador en una transacción y seriales al emitir.
--
-- Versión 20260924104430 (la registrada al aplicarla por MCP). Dry-run en una
-- transacción que se deshace (2026-09-24): alta con 2 líneas → borrador
-- 2.880 (base 2.500, impuesto 380), venta ligada con 2 sale_items (tax_amount
-- 380 y 0) y 1 comisión; mismo número → numero_duplicado; edición → 4.070 y 2
-- líneas; emitir → salida de kardex invoice_sale 3 y cartera 4.070 al día;
-- editar la emitida → factura_no_borrador; serial vendido por la factura →
-- anular lo devuelve a in_stock junto con el inventario.
--
-- Plan: docs/implementacion/FACTURAS-VENTA-CXC-PLAN.md (L11, L12, P1.4, P8).
--
-- Hoy el formulario escribe desde el navegador, en 5 a 8 llamadas sueltas:
-- sales, sale_items, invoice_sales, invoice_items (con un respaldo si RLS los
-- filtra), invoice_applied_taxes y commissions; y la edición escribe
-- invoice_sales.balance a mano. Si una llamada falla a mitad, queda una
-- factura sin líneas o una venta huérfana. Además los seriales se «vendían»
-- al guardar el borrador (antes de que la mercancía saliera) y su número se
-- buscaba en una tabla que no existe (product_serials).
--
-- 1. fn_seriales_vender (interna): la regla de venta de seriales del cobro
--    del POS (pos_checkout_v1), en una función: de la organización, en stock o
--    reservado → 'sold' con venta, cliente, vendedor, precio y evento de
--    trazabilidad; los que no cumplen vuelven como aviso. El POS puede
--    adoptarla sin cambiar su resultado (coordinación anotada en el plan).
-- 2. fn_factura_venta_guardar(p_org, p_invoice_id, p_datos): crea o edita un
--    BORRADOR en una transacción: la venta ligada (sales + sale_items, lo que
--    leen reportes y comisiones, L12), la cabecera, las líneas (con los
--    seriales elegidos y su número real), los impuestos aplicados y la
--    comisión del vendedor como hacía el formulario. Número único por
--    organización (L11, `numero_duplicado`). Nunca escribe saldos: los
--    recalcula el disparador de líneas. Devuelve los faltantes de inventario
--    (aviso; el bloqueo sigue en la emisión). La edición, como la anterior,
--    no rehace sale_items ni la comisión: su alta ya disparó el asiento de
--    CMV (trg_auto_journal_sale_item_cogs) y el de la comisión
--    (trg_auto_journal_commission). Ese devengo en el BORRADOR es un hallazgo
--    anotado en el plan (§8), no un cambio de esta migración.
--    Diferencia deliberada: sale_items.tax_amount sale con la regla de la base
--    (antes total_line × tasa / 100, que sobrestimaba el impuesto).
-- 3. fn_factura_venta_emitir: además de lo que hacía, vende los seriales de
--    las líneas (fn_seriales_vender) y devuelve los avisos.
-- 4. fn_factura_venta_anular: además, devuelve a stock los seriales que vendió
--    la factura.

-- ── 1 ── Seriales: la regla de venta, una vez ─────────────────────────────
create or replace function public.fn_seriales_vender(
  p_org integer, p_serial_ids integer[], p_sale_id uuid, p_customer uuid, p_branch integer,
  p_user uuid, p_precio numeric, p_canal text, p_invoice_id uuid default null)
 returns text[]
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_serial record;
  v_avisos text[] := '{}';
begin
  if p_serial_ids is null or cardinality(p_serial_ids) = 0 then
    return v_avisos;
  end if;
  for v_serial in
    select sn.id, sn.status, sn.organization_id from public.serial_numbers sn where sn.id = any(p_serial_ids)
    for update
  loop
    if v_serial.organization_id <> p_org then
      v_avisos := array_append(v_avisos, 'serial ' || v_serial.id || ': de otra organización');
      continue;
    end if;
    if v_serial.status not in ('in_stock', 'reserved') then
      v_avisos := array_append(v_avisos, 'serial ' || v_serial.id || ': estado ' || v_serial.status || ', no disponible');
      continue;
    end if;
    update public.serial_numbers set
      status = 'sold', sale_channel = p_canal, sale_date = now(), sale_id = p_sale_id::text,
      invoice_sale_id = coalesce(p_invoice_id, invoice_sale_id),
      sold_to_customer_id = p_customer, sold_by_user_id = p_user, price_at_sale = p_precio,
      current_branch_id = p_branch, updated_at = now(), updated_by = p_user
    where id = v_serial.id;
    insert into public.serial_tracking_events (
      serial_number_id, organization_id, event_type, from_status, to_status, to_branch_id,
      source_table, source_id, sale_id, customer_id, performed_by
    ) values (
      v_serial.id, p_org, 'sold', v_serial.status, 'sold', p_branch,
      case when p_invoice_id is not null then 'invoice_sales' else 'sales' end,
      coalesce(p_invoice_id::text, p_sale_id::text), p_sale_id, p_customer, p_user
    );
  end loop;
  if (select count(*) from public.serial_numbers where id = any(p_serial_ids)) <> cardinality(p_serial_ids) then
    v_avisos := array_append(v_avisos, 'hay seriales que no existen');
  end if;
  return v_avisos;
end;
$function$;

revoke all on function public.fn_seriales_vender(integer, integer[], uuid, uuid, integer, uuid, numeric, text, uuid) from public, anon, authenticated;
grant execute on function public.fn_seriales_vender(integer, integer[], uuid, uuid, integer, uuid, numeric, text, uuid) to service_role;

-- ── 2 ── Guardar el borrador ───────────────────────────────────────────────
create or replace function public.fn_factura_venta_guardar(p_org integer, p_invoice_id uuid, p_datos jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_inv public.invoice_sales%rowtype;
  v_id uuid;
  v_sale_id uuid;
  v_branch integer;
  v_customer uuid;
  v_numero text;
  v_incluido boolean;
  v_item jsonb;
  v_items jsonb;
  v_total numeric := 0;
  v_sub numeric := 0;
  v_qty numeric;
  v_precio numeric;
  v_desc numeric;
  v_tasa numeric;
  v_linea numeric;
  v_producto integer;
  v_vendedor uuid;
  v_tasa_com numeric;
  v_tipo_com text;
  v_metodo_com text;
  v_monto_com numeric;
  v_emision timestamptz;
  v_vence timestamptz;
  v_faltantes jsonb;
  v_nombre_vendedor text;
begin
  if v_uid is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  perform public.fn_finanzas_exigir_permiso(p_org, array['finance.create']);
  if p_datos is null or jsonb_typeof(p_datos) <> 'object' then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;

  -- Sucursal y cliente: de la organización.
  v_branch := nullif(p_datos->>'branch_id', '')::integer;
  if v_branch is null or not exists (select 1 from public.branches b where b.id = v_branch and b.organization_id = p_org) then
    raise exception 'sucursal_invalida' using errcode = '22023';
  end if;
  if not public.app_branch_access(v_branch) then
    raise exception 'sin_acceso_sucursal' using errcode = '42501';
  end if;
  v_customer := nullif(p_datos->>'customer_id', '')::uuid;
  if v_customer is not null and not exists (select 1 from public.customers c where c.id = v_customer and c.organization_id = p_org) then
    raise exception 'cliente_invalido' using errcode = '22023';
  end if;

  -- Líneas: forma y productos de la organización.
  v_items := p_datos->'items';
  if v_items is null or jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then
    raise exception 'factura_sin_lineas' using errcode = '22023';
  end if;
  if jsonb_array_length(v_items) > 500 then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  v_incluido := coalesce((p_datos->>'tax_included')::boolean, false);
  for v_item in select * from jsonb_array_elements(v_items) loop
    v_qty := (v_item->>'qty')::numeric;
    v_precio := coalesce((v_item->>'unit_price')::numeric, 0);
    v_desc := coalesce((v_item->>'discount_amount')::numeric, 0);
    v_tasa := coalesce((v_item->>'tax_rate')::numeric, 0);
    v_linea := (v_item->>'total_line')::numeric;
    v_producto := nullif(v_item->>'product_id', '')::integer;
    if v_qty is null or v_qty <= 0 or v_precio < 0 or v_desc < 0 or v_tasa < 0 or v_linea is null
       or coalesce(btrim(v_item->>'description'), '') = '' then
      raise exception 'linea_invalida' using errcode = '22023';
    end if;
    if v_producto is not null and not exists (select 1 from public.products p where p.id = v_producto and p.organization_id = p_org) then
      raise exception 'producto_invalido' using errcode = '22023';
    end if;
    -- Misma regla de base que fn_recalc_invoice_totals.
    v_total := v_total + v_linea;
    v_sub := v_sub + case
      when v_incluido and v_tasa > 0 then round((v_qty * v_precio - v_desc) / (1 + v_tasa / 100), 2)
      else v_qty * v_precio - v_desc end;
  end loop;

  -- Número: único entre las facturas de la organización (L11). Vacío → se asigna al emitir.
  v_numero := nullif(btrim(coalesce(p_datos->>'number', '')), '');
  if v_numero is not null and exists (
      select 1 from public.invoice_sales i
       where i.organization_id = p_org and coalesce(i.document_type, 'invoice') = 'invoice'
         and i.number = v_numero and i.id is distinct from p_invoice_id) then
    raise exception 'numero_duplicado' using errcode = '23505';
  end if;

  v_emision := coalesce(nullif(p_datos->>'issue_date', '')::timestamptz, now());
  v_vence := nullif(p_datos->>'due_date', '')::timestamptz;

  -- Comisión, con la fórmula del formulario.
  v_vendedor := nullif(p_datos->>'salesperson_id', '')::uuid;
  if v_vendedor is not null and not exists (
      select 1 from public.organization_members om where om.organization_id = p_org and om.user_id = v_vendedor) then
    raise exception 'vendedor_invalido' using errcode = '22023';
  end if;
  v_tasa_com := coalesce((p_datos->>'commission_rate')::numeric, 0);
  v_tipo_com := case when v_vendedor is not null and v_tasa_com > 0 then coalesce(nullif(p_datos->>'commission_type', ''), 'salesperson') else 'none' end;
  v_metodo_com := case when v_vendedor is not null and v_tasa_com > 0 then coalesce(nullif(p_datos->>'commission_method', ''), 'percentage') else 'percentage' end;
  v_monto_com := case
    when v_tipo_com = 'none' then 0
    when v_metodo_com = 'fixed_amount' then v_tasa_com
    else round((case when v_sub > 0 then v_sub else v_total end) * v_tasa_com / 100, 2) end;

  if p_invoice_id is null then
    -- ── Alta: la venta ligada primero (la leen reportes y comisiones, L12) ──
    insert into public.sales (
      organization_id, branch_id, customer_id, user_id, sale_date, subtotal, tax_total, total, balance,
      status, payment_status, source, include_in_cash_register, notes, discount_total, tax_included
    ) values (
      p_org, v_branch, v_customer, v_uid, v_emision, v_sub, v_total - v_sub, v_total, v_total,
      'pending', 'pending', 'invoice', coalesce((p_datos->>'include_in_cash_register')::boolean, false),
      nullif(p_datos->>'notes', ''), 0, v_incluido
    )
    returning id into v_sale_id;

    insert into public.invoice_sales (
      organization_id, branch_id, customer_id, sale_id, number, issue_date, due_date, currency,
      subtotal, tax_total, total, balance, status, payment_terms, payment_method, notes, tax_included,
      created_by, opportunity_id, salesperson_id, commission_rate, commission_type, commission_method, commission_amount
    ) values (
      p_org, v_branch, v_customer, v_sale_id, v_numero, v_emision, v_vence, nullif(p_datos->>'currency', ''),
      v_sub, v_total - v_sub, v_total, v_total, 'draft', coalesce((p_datos->>'payment_terms')::integer, 0),
      nullif(p_datos->>'payment_method', ''), nullif(p_datos->>'notes', ''), v_incluido,
      v_uid, nullif(p_datos->>'opportunity_id', '')::uuid, v_vendedor, v_tasa_com, v_tipo_com, v_metodo_com, v_monto_com
    )
    returning id into v_id;
  else
    -- ── Edición: solo borradores de la organización ──
    select * into v_inv from public.invoice_sales where id = p_invoice_id and organization_id = p_org for update;
    if not found then
      raise exception 'factura_no_encontrada' using errcode = 'P0002';
    end if;
    if coalesce(v_inv.document_type, 'invoice') <> 'invoice' then
      raise exception 'documento_invalido' using errcode = '22023';
    end if;
    if v_inv.status <> 'draft' then
      raise exception 'factura_no_borrador' using errcode = '22023';
    end if;
    v_id := v_inv.id;
    v_sale_id := v_inv.sale_id;

    update public.invoice_sales set
      branch_id = v_branch, customer_id = v_customer, number = v_numero, issue_date = v_emision, due_date = v_vence,
      currency = coalesce(nullif(p_datos->>'currency', ''), currency),
      payment_terms = coalesce((p_datos->>'payment_terms')::integer, 0),
      payment_method = nullif(p_datos->>'payment_method', ''), notes = nullif(p_datos->>'notes', ''),
      tax_included = v_incluido, opportunity_id = nullif(p_datos->>'opportunity_id', '')::uuid,
      salesperson_id = v_vendedor, commission_rate = v_tasa_com, commission_type = v_tipo_com,
      commission_method = v_metodo_com, commission_amount = v_monto_com, updated_at = now()
    where id = v_id;

    delete from public.invoice_items where coalesce(invoice_sales_id, invoice_id) = v_id;
    delete from public.invoice_applied_taxes where invoice_id = v_id;

    if v_sale_id is not null then
      update public.sales set
        branch_id = v_branch, customer_id = v_customer, sale_date = v_emision,
        subtotal = v_sub, tax_total = v_total - v_sub, total = v_total, balance = v_total,
        include_in_cash_register = coalesce((p_datos->>'include_in_cash_register')::boolean, include_in_cash_register),
        notes = nullif(p_datos->>'notes', ''), tax_included = v_incluido, updated_at = now()
      where id = v_sale_id and organization_id = p_org and status = 'pending';
      -- Como la edición anterior: sale_items y la comisión no se tocan. Su alta
      -- ya contabilizó CMV y comisión (disparadores de sale_items y commissions);
      -- rehacerlas exigiría revertir esos asientos (hallazgo anotado en el plan).
    end if;
  end if;

  -- ── Líneas de la venta ligada, solo en el alta (tax_amount con la regla de la base) ──
  if p_invoice_id is null then
    insert into public.sale_items (sale_id, product_id, quantity, unit_price, total, tax_rate, tax_amount, discount_amount, tax_included, serial_ids)
    select v_sale_id, nullif(i->>'product_id', '')::integer, (i->>'qty')::numeric, coalesce((i->>'unit_price')::numeric, 0),
           (i->>'total_line')::numeric, coalesce((i->>'tax_rate')::numeric, 0),
           case
             when coalesce((i->>'tax_rate')::numeric, 0) <= 0 then 0
             when v_incluido then (i->>'total_line')::numeric - round((i->>'total_line')::numeric / (1 + (i->>'tax_rate')::numeric / 100), 2)
             else (i->>'total_line')::numeric - ((i->>'qty')::numeric * coalesce((i->>'unit_price')::numeric, 0) - coalesce((i->>'discount_amount')::numeric, 0))
           end,
           coalesce((i->>'discount_amount')::numeric, 0), v_incluido,
           nullif(array(select x::integer from jsonb_array_elements_text(coalesce(i->'serial_ids', '[]'::jsonb)) x), '{}')
      from jsonb_array_elements(v_items) i;
  end if;

  -- ── Líneas de la factura (el disparador recalcula totales y saldo) ──
  insert into public.invoice_items (
    invoice_id, invoice_sales_id, invoice_type, product_id, description, qty, unit_price,
    tax_code, tax_rate, tax_included, total_line, discount_amount, serial_ids, serial_numbers
  )
  select v_id, v_id, 'sale', nullif(i->>'product_id', '')::integer, btrim(i->>'description'),
         (i->>'qty')::numeric, coalesce((i->>'unit_price')::numeric, 0),
         nullif(i->>'tax_code', ''), coalesce((i->>'tax_rate')::numeric, 0),
         coalesce((i->>'tax_included')::boolean, v_incluido), (i->>'total_line')::numeric,
         coalesce((i->>'discount_amount')::numeric, 0),
         nullif(array(select x::integer from jsonb_array_elements_text(coalesce(i->'serial_ids', '[]'::jsonb)) x), '{}'),
         nullif(array(select sn.serial from public.serial_numbers sn
                       where sn.organization_id = p_org
                         and sn.id in (select x::integer from jsonb_array_elements_text(coalesce(i->'serial_ids', '[]'::jsonb)) x)
                       order by sn.id), '{}')
    from jsonb_array_elements(v_items) i;

  insert into public.invoice_applied_taxes (invoice_id, tax_code, tax_rate, is_applied)
  select v_id, t->>'tax_code', coalesce((t->>'tax_rate')::numeric, 0), true
    from jsonb_array_elements(coalesce(p_datos->'applied_taxes', '[]'::jsonb)) t
   where coalesce(btrim(t->>'tax_code'), '') <> '';

  -- ── Comisión del vendedor (como el formulario; el disparador de pago no la duplica) ──
  if p_invoice_id is null and v_tipo_com <> 'none' and v_monto_com > 0 then
    select coalesce(nullif(btrim(coalesce(pr.first_name, '') || ' ' || coalesce(pr.last_name, '')), ''), pr.email, 'N/A')
      into v_nombre_vendedor from public.profiles pr where pr.id = v_vendedor;
    insert into public.commissions (
      organization_id, branch_id, commission_type, source_type, source_id, payee_type, payee_id, payee_name,
      base_amount, commission_rate, commission_amount, currency, status, accrued_at, created_by, metadata
    ) values (
      p_org, v_branch, v_tipo_com, 'invoice_sale', v_id::text, 'employee', v_vendedor, coalesce(v_nombre_vendedor, 'N/A'),
      case when v_sub > 0 then v_sub else v_total end, v_tasa_com, v_monto_com,
      (select currency from public.invoice_sales where id = v_id), 'accrued', now(), v_uid,
      jsonb_build_object('invoice_number', v_numero, 'commission_method', v_metodo_com)
    );
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('product_id', s.product_id, 'producto', s.product_name,
                                                'requerido', s.required, 'disponible', s.available)), '[]'::jsonb)
    into v_faltantes
    from public.fn_invoice_stock_shortages(v_id) s;

  insert into public.finance_audit_log (organization_id, entity, entity_id, action, user_id, diff)
  values (p_org, 'invoice_sales', v_id::text, case when p_invoice_id is null then 'insert' else 'update' end, v_uid,
          jsonb_build_object('documento', 'factura_borrador', 'numero', v_numero, 'total', v_total, 'lineas', jsonb_array_length(v_items)));

  return jsonb_build_object('id', v_id, 'numero', v_numero, 'sale_id', v_sale_id, 'total', v_total, 'faltantes', v_faltantes);
end;
$function$;

revoke all on function public.fn_factura_venta_guardar(integer, uuid, jsonb) from public, anon;
grant execute on function public.fn_factura_venta_guardar(integer, uuid, jsonb) to authenticated, service_role;

-- ── 3 ── Emitir: además, vende los seriales de las líneas ──────────────────
create or replace function public.fn_factura_venta_emitir(p_invoice_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_inv public.invoice_sales%rowtype;
  v_faltantes jsonb;
  v_numero text;
  v_descontar boolean;
  v_item record;
  v_lineas integer := 0;
  v_avisos text[] := '{}';
begin
  if v_uid is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  select * into v_inv from public.invoice_sales where id = p_invoice_id for update;
  if not found then
    raise exception 'factura_no_encontrada' using errcode = 'P0002';
  end if;
  perform public.fn_finanzas_exigir_permiso(v_inv.organization_id, array['finance.create']);
  if v_inv.branch_id is not null and not public.app_branch_access(v_inv.branch_id) then
    raise exception 'sin_acceso_sucursal' using errcode = '42501';
  end if;
  if coalesce(v_inv.document_type, 'invoice') <> 'invoice' then
    raise exception 'documento_invalido' using errcode = '22023';
  end if;
  if v_inv.status <> 'draft' then
    raise exception 'factura_no_borrador' using errcode = '22023';
  end if;
  if not exists (select 1 from public.invoice_items ii
                  where coalesce(ii.invoice_sales_id, ii.invoice_id) = v_inv.id) then
    raise exception 'factura_sin_lineas' using errcode = '22023';
  end if;

  -- Faltantes de inventario (recetas incluidas): no se emite.
  select coalesce(jsonb_agg(jsonb_build_object('product_id', s.product_id, 'producto', s.product_name,
                                                'requerido', s.required, 'disponible', s.available)), '[]'::jsonb)
    into v_faltantes
    from public.fn_invoice_stock_shortages(v_inv.id) s;
  if jsonb_array_length(v_faltantes) > 0 then
    raise exception 'stock_insuficiente' using errcode = '22023', detail = v_faltantes::text;
  end if;

  -- Número: el del borrador si ya lo tiene; si no, la resolución de la sucursal
  -- o el consecutivo FACT- de la organización (mismo criterio que el formulario).
  v_numero := nullif(btrim(coalesce(v_inv.number, '')), '');
  if v_numero is null then
    begin
      select n.invoice_number into v_numero
        from public.fn_get_next_invoice_number(v_inv.organization_id, v_inv.branch_id, 'invoice') n;
    exception when others then
      v_numero := null;
    end;
    if v_numero is null then
      perform pg_advisory_xact_lock(hashtextextended('numero_factura_venta:' || v_inv.organization_id, 0));
      select 'FACT-' || lpad((coalesce(max(nullif(regexp_replace(i.number, '\D', '', 'g'), '')::bigint), 0) + 1)::text, 4, '0')
        into v_numero
        from public.invoice_sales i
       where i.organization_id = v_inv.organization_id
         and coalesce(i.document_type, 'invoice') = 'invoice'
         and i.number ~* '^FACT-?\d+$';
    end if;
  end if;

  update public.invoice_sales
     set status = 'issued', number = v_numero, updated_at = now()
   where id = v_inv.id;
  -- La cartera nace por tr_update_account_receivable; issue_invoice la llamaba
  -- a mano: se conserva la llamada por si el disparador estuviera apagado.
  perform public.create_account_receivable(v_inv.id::text);

  -- Inventario: una sola salida (L3).
  v_descontar := not (v_inv.sale_id is not null and exists (
    select 1 from public.stock_movements sm
     where sm.source_id = v_inv.sale_id::text and sm.source in ('sale', 'mesa_sale', 'web_sale')));
  if v_descontar then
    for v_item in
      select ii.product_id, sum(ii.qty) as qty, max(ii.unit_price) as unit_price
        from public.invoice_items ii
       where coalesce(ii.invoice_sales_id, ii.invoice_id) = v_inv.id
         and ii.product_id is not null and coalesce(ii.qty, 0) > 0
       group by ii.product_id
    loop
      perform public.decrement_stock_with_recipe(
        v_inv.organization_id, v_inv.branch_id, v_item.product_id, v_item.qty,
        'invoice_sale', coalesce(v_inv.sale_id::text, v_inv.id::text), v_item.unit_price, v_uid,
        'Factura ' || v_numero);
      v_lineas := v_lineas + 1;
    end loop;

    -- Seriales elegidos en las líneas: se venden cuando sale la mercancía
    -- (antes se vendían al guardar el borrador). Misma regla que el POS.
    for v_item in
      select ii.serial_ids, ii.unit_price
        from public.invoice_items ii
       where coalesce(ii.invoice_sales_id, ii.invoice_id) = v_inv.id
         and cardinality(ii.serial_ids) > 0
    loop
      v_avisos := v_avisos || public.fn_seriales_vender(
        v_inv.organization_id, v_item.serial_ids, v_inv.sale_id, v_inv.customer_id, v_inv.branch_id,
        v_uid, v_item.unit_price, 'invoice', v_inv.id);
    end loop;
  end if;

  return jsonb_build_object('id', v_inv.id, 'numero', v_numero, 'status', 'issued',
                            'stock_descontado', v_descontar and v_lineas > 0, 'productos', v_lineas,
                            'seriales_avisos', to_jsonb(v_avisos));
end;
$function$;

revoke all on function public.fn_factura_venta_emitir(uuid) from public, anon;
grant execute on function public.fn_factura_venta_emitir(uuid) to authenticated, service_role;

-- ── 4 ── Anular: además, los seriales vendidos por la factura vuelven a stock ─
create or replace function public.fn_factura_venta_anular(p_invoice_id uuid, p_motivo text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_inv public.invoice_sales%rowtype;
  v_mov record;
  v_serial record;
  v_devueltos integer := 0;
  v_seriales integer := 0;
begin
  if v_uid is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  if p_motivo is null or length(btrim(p_motivo)) < 3 then
    raise exception 'motivo_obligatorio' using errcode = '22023';
  end if;
  select * into v_inv from public.invoice_sales where id = p_invoice_id for update;
  if not found then
    raise exception 'factura_no_encontrada' using errcode = 'P0002';
  end if;
  perform public.fn_finanzas_exigir_permiso(v_inv.organization_id, array['finance.void']);
  if v_inv.branch_id is not null and not public.app_branch_access(v_inv.branch_id) then
    raise exception 'sin_acceso_sucursal' using errcode = '42501';
  end if;
  if v_inv.status in ('void', 'voided', 'cancelled') then
    raise exception 'ya_anulada' using errcode = '22023';
  end if;
  if coalesce(v_inv.document_type, 'invoice') = 'credit_note' then
    raise exception 'nota_credito' using errcode = '22023';
  end if;
  -- L4: con pagos (o notas crédito) va por nota crédito (misma regla que puedeAnular).
  if coalesce(v_inv.total, 0) > 0 and coalesce(v_inv.balance, 0) < coalesce(v_inv.total, 0) then
    raise exception 'con_pagos' using errcode = '22023';
  end if;
  if v_inv.einvoice_status = 'accepted' then
    raise exception 'fe_aceptada' using errcode = '22023';
  end if;

  update public.invoice_sales
     set status = 'void',
         balance = 0,
         notes = case when coalesce(btrim(notes), '') = '' then 'ANULADA: ' || btrim(p_motivo)
                      else notes || E'\n\nANULADA: ' || btrim(p_motivo) end,
         updated_at = now()
   where id = v_inv.id;

  -- Inventario: vuelve exactamente lo que salió por esta factura o su venta,
  -- menos lo que ya se reingresó al anular.
  for v_mov in
    select sm.product_id, sm.branch_id, sum(sm.qty) as qty,
           (array_agg(sm.unit_cost order by sm.id))[1] as unit_cost
      from public.stock_movements sm
     where sm.organization_id = v_inv.organization_id
       and sm.direction = 'out'
       and sm.source in ('invoice_sale', 'sale', 'mesa_sale', 'web_sale')
       and sm.source_id in (v_inv.id::text, coalesce(v_inv.sale_id::text, v_inv.id::text))
     group by sm.product_id, sm.branch_id
  loop
    v_mov.qty := v_mov.qty - coalesce((
      select sum(e.qty) from public.stock_movements e
       where e.organization_id = v_inv.organization_id and e.direction = 'in'
         and e.source = 'invoice_void' and e.source_id = v_inv.id::text
         and e.product_id = v_mov.product_id and e.branch_id = v_mov.branch_id), 0);
    continue when v_mov.qty <= 0;
    perform public.fn_stock_entrada(v_inv.organization_id, v_mov.branch_id, v_mov.product_id, v_mov.qty,
                                    v_mov.unit_cost, 'invoice_void', v_inv.id::text,
                                    'Anulación de la factura ' || coalesce(v_inv.number, v_inv.id::text), v_uid);
    v_devueltos := v_devueltos + 1;
  end loop;

  -- Seriales que vendió esta factura (o su venta): vuelven a stock.
  for v_serial in
    select sn.id, sn.status, sn.current_branch_id from public.serial_numbers sn
     where sn.organization_id = v_inv.organization_id and sn.status = 'sold'
       and (sn.invoice_sale_id = v_inv.id or (v_inv.sale_id is not null and sn.sale_id = v_inv.sale_id::text))
     for update
  loop
    update public.serial_numbers set
      status = 'in_stock', sold_to_customer_id = null, sold_by_user_id = null, sale_id = null,
      invoice_sale_id = null, sale_channel = 'in_stock', sale_date = null, price_at_sale = null,
      updated_at = now(), updated_by = v_uid
    where id = v_serial.id;
    insert into public.serial_tracking_events (
      serial_number_id, organization_id, event_type, from_status, to_status, from_branch_id, to_branch_id,
      source_table, source_id, sale_id, customer_id, performed_by, notes
    ) values (
      v_serial.id, v_inv.organization_id, 'returned', 'sold', 'in_stock', v_serial.current_branch_id, v_serial.current_branch_id,
      'invoice_sales', v_inv.id::text, v_inv.sale_id, v_inv.customer_id, v_uid, 'Anulación: ' || btrim(p_motivo)
    );
    v_seriales := v_seriales + 1;
  end loop;

  insert into public.finance_audit_log (organization_id, entity, entity_id, action, user_id, diff, reason)
  values (v_inv.organization_id, 'invoice_sales', v_inv.id::text, 'void', v_uid,
          jsonb_build_object('number', v_inv.number, 'total', v_inv.total, 'productos_devueltos', v_devueltos,
                             'seriales_devueltos', v_seriales),
          btrim(p_motivo));

  return jsonb_build_object('id', v_inv.id, 'status', 'void', 'productos_devueltos', v_devueltos, 'seriales_devueltos', v_seriales);
end;
$function$;

revoke all on function public.fn_factura_venta_anular(uuid, text) from public, anon;
grant execute on function public.fn_factura_venta_anular(uuid, text) to authenticated, service_role;
