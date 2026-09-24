-- ============================================================================
-- Compras F1.4 — la factura de compra se registra en UNA sola RPC.
-- Plan: docs/implementacion/FACTURAS-COMPRA-CXP-PLAN.md (§0.1–0.7, §4 F1.4, D2, D4, D6, D10–D12).
--
-- Hasta hoy «registrar una compra» estaba implementado tres veces (regla 7):
-- el formulario (6 escrituras sin transacción desde el navegador, IVA perdido,
-- CxP creada en el borrador y tragando el error), la RPC del GO Assistant
-- (moneda USD por defecto, sin costo) y el generador desde la orden de compra
-- (impuesto 0, sin `po_id`, fechas UTC, número por lectura del último). Ahora
-- los tres pasan por las mismas funciones internas:
--
--   fn_fc_guardar_int      cabecera + líneas con `total_line` BRUTO (F-51) +
--                          impuestos aplicados + retenciones + seriales +
--                          comisión (al crear). Solo borradores. Número
--                          duplicado por proveedor → DUPLICATE_INVOICE (D10: se
--                          valida lo nuevo; los 8 grupos repetidos de hoy no se
--                          tocan).
--   fn_fc_confirmar_int    draft → received (el asiento lo hace el disparador),
--                          CxP por el neto (D2, D4), recepción por kardex si se
--                          pide y borrador de documento soporte si se pide.
--   fn_fc_recepcionar_int  kardex + costo con vigencia (F1.3) una sola vez;
--                          reconoce las recepciones viejas y las de la OC.
--
-- Públicas (SECURITY DEFINER, organización del registro, permiso en la base,
-- sucursal con `app_branch_access`):
--   fn_factura_compra_guardar(org, payload)          finance.create
--   fn_factura_compra_confirmar(id, recepcionar, ds) finance.create (+ inventory.create si recepciona)
--   fn_factura_compra_recepcionar(id)                finance.create + inventory.create
--   fn_factura_compra_eliminar_borrador(id)          finance.create
--   fn_factura_compra_desde_oc(uuid de la OC)        finance.create o inventory.create
--   fn_siguiente_numero_compra(org)                  miembro (D11: consecutivo solo con botón)
--   fn_void_purchase_invoice v2 (misma firma)        finance.void
--   confirm_purchase_invoice (envoltorio)            = confirmar(id, true, false): ningún
--                                                     llamador viejo deja mercancía fuera (§0.1)
--   assistant_register_purchase_invoice (misma firma y mismo resultado) delega en las internas;
--   el permiso lo sigue resolviendo el catálogo de herramientas del asistente.
--
-- fn_void_purchase_invoice v2: solo cuentan los pagos `completed` (un pago
-- rechazado ya no bloquea para siempre); revierte SOLO el kardex de la factura
-- (antes restaba stock a ciegas en toda factura `received`, aunque la mercancía
-- nunca hubiera entrado), con su lote; CxP a `void`; `stock_received_at` a NULL;
-- programaciones pendientes canceladas; contra-asiento espejo igual que antes.
-- El CHECK de `stock_movements.source` no admitía `purchase_void`: anular una
-- factura con mercancía recibida fallaba siempre. Se amplía la lista.
--
-- fn_retro_journal_purchases: contabilizaba TODAS las facturas sin asiento,
-- borradores incluidos (origen de los 8 borradores con asiento, §5.2) y estaba
-- abierta a `authenticated` sin comprobar organización. Ahora solo confirmadas
-- y solo la ejecuta el dueño (service role / migraciones).
-- ============================================================================

-- ── Origen `purchase_void` en el kardex ────────────────────────────────────
-- `fn_void_purchase_invoice` escribía `source='purchase_void'`, que el CHECK de
-- `stock_movements` no admite: anular una factura con mercancía recibida
-- fallaba SIEMPRE (encontrado en el dry-run de esta migración). Se amplía la
-- lista (aditivo: todas las filas actuales la cumplen) en vez de reusar
-- `return`, que el disparador contable trata como ajuste (R7).
alter table public.stock_movements drop constraint if exists stock_movements_source_check;
alter table public.stock_movements add constraint stock_movements_source_check check (source = any (array[
  'purchase', 'sale', 'adjustment', 'transfer', 'return', 'loss', 'production', 'initial', 'web_sale', 'mesa_sale',
  'invoice_sale', 'folio_item', 'room_consumption', 'web_order', 'purchase_order', 'purchase_invoice', 'invoice_void',
  'credit_note', 'web_refund', 'folio_item_reversal', 'transfer_out', 'transfer_in', 'purchase_void'
]::text[]));

-- ── Recalcular el saldo de la factura (interna) ────────────────────────────
create or replace function public.fn_fc_recalcular_saldo(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_saldo numeric;
begin
  v_saldo := greatest(public.fn_invoice_purchase_neto(p_id) - public.fn_invoice_purchase_paid(p_id), 0);
  update public.invoice_purchase
     set balance = v_saldo, updated_at = now()
   where id = p_id and status not in ('void', 'voided') and balance is distinct from v_saldo;
end;
$$;

revoke all on function public.fn_fc_recalcular_saldo(uuid) from public, anon, authenticated;

-- ── Guardar (interna) ──────────────────────────────────────────────────────
create or replace function public.fn_fc_guardar_int(p_org integer, p_payload jsonb, p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid := nullif(p_payload->>'id', '')::uuid;
  v_nuevo boolean := nullif(p_payload->>'id', '') is null;
  v_inv public.invoice_purchase%rowtype;
  v_branch integer := nullif(p_payload->>'branch_id', '')::integer;
  v_supplier integer := nullif(p_payload->>'supplier_id', '')::integer;
  v_number text := nullif(btrim(p_payload->>'number_ext'), '');
  v_currency text := nullif(upper(btrim(p_payload->>'currency')), '');
  v_po integer := nullif(p_payload->>'po_id', '')::integer;
  v_tax_included boolean := coalesce((p_payload->>'tax_included')::boolean, false);
  v_payment_method text := nullif(btrim(p_payload->>'payment_method'), '');
  v_payment_terms integer := nullif(p_payload->>'payment_terms', '')::integer;
  v_payment_terms_id uuid := nullif(p_payload->>'payment_terms_id', '')::uuid;
  v_notes text := nullif(btrim(p_payload->>'notes'), '');
  v_sp uuid := nullif(p_payload->>'salesperson_id', '')::uuid;
  v_crate numeric := coalesce(nullif(p_payload->>'commission_rate', '')::numeric, 0);
  v_camount numeric := coalesce(nullif(p_payload->>'commission_amount', '')::numeric, 0);
  v_cmethod text := coalesce(nullif(p_payload->>'commission_method', ''), 'percentage');
  v_ctype text;
  v_tz text;
  v_issue timestamptz;
  v_due timestamptz;
  v_l jsonb;
  v_r jsonb;
  v_t jsonb;
  v_s text;
  v_prod integer;
  v_prod_name text;
  v_desc text;
  v_qty numeric;
  v_price numeric;
  v_disc numeric;
  v_rate numeric;
  v_neto numeric;
  v_total_line numeric;
  v_base numeric;
  v_rrate numeric;
  v_ramount numeric;
  v_lineas integer := 0;
  v_serial_id integer;
  v_omitidos jsonb := '[]'::jsonb;
  v_seriales text[];
  v_payee text;
  v_subtotal numeric;
  v_total numeric;
begin
  perform public.fn_assert_acceso_org(p_org);

  if v_number is null then
    raise exception 'NUMERO_REQUERIDO' using errcode = '22023';
  end if;
  if v_supplier is null or not exists (select 1 from public.suppliers s where s.id = v_supplier and s.organization_id = p_org) then
    raise exception 'PROVEEDOR_INVALIDO' using errcode = '22023';
  end if;

  if v_nuevo then
    if v_branch is null or not exists (select 1 from public.branches b where b.id = v_branch and b.organization_id = p_org) then
      raise exception 'SUCURSAL_INVALIDA' using errcode = '22023';
    end if;
  else
    select * into v_inv from public.invoice_purchase where id = v_id for update;
    if not found or v_inv.organization_id <> p_org then
      raise exception 'FACTURA_NO_ENCONTRADA' using errcode = 'P0002';
    end if;
    if v_inv.status <> 'draft' then
      raise exception 'NO_EDITABLE' using errcode = '22023',
        detail = 'Solo se edita una factura en borrador; una confirmada se anula y se registra de nuevo.';
    end if;
    perform public.fn_fc_acceso_sucursal(v_inv.branch_id);
    v_branch := coalesce(v_branch, v_inv.branch_id);
    if not exists (select 1 from public.branches b where b.id = v_branch and b.organization_id = p_org) then
      raise exception 'SUCURSAL_INVALIDA' using errcode = '22023';
    end if;
  end if;
  perform public.fn_fc_acceso_sucursal(v_branch);

  if jsonb_typeof(p_payload->'lines') is distinct from 'array' then
    raise exception 'LINEAS_REQUERIDAS' using errcode = '22023';
  end if;
  if jsonb_array_length(p_payload->'lines') = 0 then
    raise exception 'LINEAS_REQUERIDAS' using errcode = '22023';
  end if;
  if jsonb_array_length(p_payload->'lines') > 500 then
    raise exception 'DEMASIADAS_LINEAS' using errcode = '22023';
  end if;
  if v_currency is not null and not exists (select 1 from public.currencies c where c.code = v_currency) then
    raise exception 'MONEDA_INVALIDA' using errcode = '22023';
  end if;
  if v_payment_method is not null and not exists (select 1 from public.payment_methods pm where pm.code = v_payment_method) then
    raise exception 'METODO_PAGO_INVALIDO' using errcode = '22023';
  end if;
  if v_po is not null and not exists (
    select 1 from public.purchase_orders po where po.id = v_po and po.organization_id = p_org and po.supplier_id = v_supplier
  ) then
    raise exception 'ORDEN_INVALIDA' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.invoice_purchase ip
     where ip.organization_id = p_org and ip.supplier_id = v_supplier
       and upper(btrim(ip.number_ext)) = upper(v_number) and ip.status <> 'void'
       and ip.id is distinct from v_id
  ) then
    raise exception 'DUPLICATE_INVOICE:%', v_number using errcode = '23505';
  end if;

  v_tz := public.fn_timezone_for(p_org, v_branch);
  v_issue := coalesce(public.fn_fc_instante(p_payload->>'issue_date', v_tz), case when v_nuevo then now() else v_inv.issue_date end);
  v_due := public.fn_fc_instante(p_payload->>'due_date', v_tz);
  if v_due is not null and (v_due at time zone v_tz)::date < (v_issue at time zone v_tz)::date then
    raise exception 'VENCIMIENTO_ANTES_DE_EMISION' using errcode = '22023';
  end if;

  v_ctype := case
    when v_sp is not null and v_crate > 0 then coalesce(nullif(p_payload->>'commission_type', ''), 'salesperson')
    else 'none'
  end;
  if v_ctype not in ('salesperson', 'intermediation_purchase', 'none') then
    raise exception 'COMISION_INVALIDA' using errcode = '22023';
  end if;

  if v_nuevo then
    insert into public.invoice_purchase (
      organization_id, branch_id, supplier_id, po_id, number_ext, issue_date, due_date, currency,
      subtotal, tax_total, total, balance, status, created_by, notes, payment_terms, payment_method,
      payment_terms_id, tax_included, salesperson_id, commission_rate, commission_type, commission_method, commission_amount
    ) values (
      p_org, v_branch, v_supplier, v_po, v_number, v_issue, v_due, v_currency,
      0, 0, 0, 0, 'draft', p_user, v_notes, v_payment_terms, v_payment_method,
      v_payment_terms_id, v_tax_included, v_sp, v_crate, v_ctype, v_cmethod, v_camount
    ) returning id into v_id;
  else
    update public.invoice_purchase
       set branch_id = v_branch,
           supplier_id = v_supplier,
           po_id = v_po,
           number_ext = v_number,
           issue_date = v_issue,
           due_date = v_due,
           currency = coalesce(v_currency, currency),
           notes = v_notes,
           payment_terms = v_payment_terms,
           payment_method = v_payment_method,
           payment_terms_id = v_payment_terms_id,
           tax_included = v_tax_included,
           salesperson_id = v_sp,
           commission_rate = v_crate,
           commission_type = v_ctype,
           commission_method = v_cmethod,
           commission_amount = v_camount,
           updated_at = now()
     where id = v_id;

    delete from public.invoice_purchase_withholdings where invoice_id = v_id;
    delete from public.invoice_purchase_applied_taxes where invoice_id = v_id;
    delete from public.invoice_items where invoice_purchase_id = v_id or (invoice_id = v_id and invoice_type = 'purchase');
    -- L14: solo los seriales todavía en inventario de esta factura.
    delete from public.serial_numbers where purchase_invoice_id = v_id and status = 'in_stock' and organization_id = p_org;
  end if;

  -- Retenciones antes que las líneas: el disparador de líneas ya calcula el
  -- saldo con el neto (total − retenciones).
  for v_r in select * from jsonb_array_elements(coalesce(p_payload->'withholdings', '[]'::jsonb)) loop
    v_base := coalesce(nullif(v_r->>'base', '')::numeric, 0);
    v_rrate := coalesce(nullif(v_r->>'rate', '')::numeric, 0);
    v_ramount := coalesce(nullif(v_r->>'amount', '')::numeric, round(v_base * v_rrate / 100, 2));
    if nullif(btrim(v_r->>'concept'), '') is null or v_base < 0 or v_rrate < 0 or v_rrate > 100 or v_ramount < 0 then
      raise exception 'RETENCION_INVALIDA' using errcode = '22023';
    end if;
    insert into public.invoice_purchase_withholdings (organization_id, invoice_id, concept, base, rate, amount, tax_code)
    values (p_org, v_id, btrim(v_r->>'concept'), round(v_base, 2), v_rrate, round(v_ramount, 2), nullif(btrim(v_r->>'tax_code'), ''));
  end loop;

  for v_t in select * from jsonb_array_elements(coalesce(p_payload->'applied_taxes', '[]'::jsonb)) loop
    continue when nullif(btrim(v_t->>'tax_code'), '') is null;
    insert into public.invoice_purchase_applied_taxes (invoice_id, tax_code, tax_rate, is_applied)
    values (v_id, btrim(v_t->>'tax_code'), coalesce(nullif(v_t->>'tax_rate', '')::numeric, 0), true);
  end loop;

  for v_l in select * from jsonb_array_elements(p_payload->'lines') loop
    v_prod := nullif(v_l->>'product_id', '')::integer;
    v_qty := nullif(v_l->>'qty', '')::numeric;
    v_price := nullif(v_l->>'unit_price', '')::numeric;
    v_disc := coalesce(nullif(v_l->>'discount_amount', '')::numeric, 0);
    v_rate := coalesce(nullif(v_l->>'tax_rate', '')::numeric, 0);
    if v_qty is null or v_qty <= 0 or v_price is null or v_price < 0 or v_disc < 0 or v_rate < 0 or v_rate > 100
       or v_disc > v_qty * v_price + 0.005 then
      raise exception 'LINEA_INVALIDA' using errcode = '22023';
    end if;
    v_prod_name := null;
    if v_prod is not null then
      select p.name into v_prod_name from public.products p where p.id = v_prod and p.organization_id = p_org;
      if v_prod_name is null then
        raise exception 'PRODUCTO_NO_ES_DE_LA_ORG' using errcode = '42501';
      end if;
    end if;
    v_desc := coalesce(nullif(btrim(v_l->>'description'), ''), v_prod_name);
    if v_desc is null then
      raise exception 'LINEA_SIN_DESCRIPCION' using errcode = '22023';
    end if;

    -- Regla F-51 (la de `calcularLineaCompra`): bruto con impuesto.
    v_neto := round(v_qty * v_price, 2) - round(v_disc, 2);
    v_total_line := case when v_tax_included then v_neto else v_neto + round(v_neto * v_rate / 100, 2) end;

    v_seriales := array(
      select distinct btrim(x)
        from jsonb_array_elements_text(
               case when jsonb_typeof(v_l->'serial_numbers') = 'array' then v_l->'serial_numbers' else '[]'::jsonb end) x
       where btrim(x) <> ''
    );

    insert into public.invoice_items (
      invoice_id, invoice_type, invoice_purchase_id, invoice_sales_id, product_id, description,
      qty, unit_price, tax_code, tax_rate, total_line, discount_amount, tax_included, serial_numbers, note
    ) values (
      v_id, 'purchase', v_id, null, v_prod, v_desc,
      v_qty, v_price, nullif(btrim(v_l->>'tax_code'), ''), v_rate, v_total_line, round(v_disc, 2), v_tax_included,
      coalesce(v_seriales, '{}'::text[]), nullif(btrim(v_l->>'note'), '')
    );
    v_lineas := v_lineas + 1;

    -- L14: seriales `in_stock` con proveedor, factura y costo; un serial ya
    -- registrado (es único global) se informa y no se toca.
    if v_prod is not null then
      foreach v_s in array coalesce(v_seriales, '{}'::text[]) loop
        v_serial_id := null;
        insert into public.serial_numbers (
          product_id, organization_id, branch_id, current_branch_id, serial, status, supplier_id,
          purchase_invoice_id, cost_at_purchase, received_date
        ) values (
          v_prod, p_org, v_branch, v_branch, v_s, 'in_stock', v_supplier, v_id, v_price, now()
        )
        on conflict (serial) do nothing
        returning id into v_serial_id;
        if v_serial_id is null then
          v_omitidos := v_omitidos || jsonb_build_object('serial', v_s, 'product_id', v_prod, 'reason', 'serial_duplicado');
        else
          insert into public.serial_tracking_events (
            serial_number_id, organization_id, event_type, to_branch_id, to_status, source_table, source_id,
            purchase_invoice_id, performed_by, event_date
          ) values (
            v_serial_id, p_org, 'stock_in', v_branch, 'in_stock', 'invoice_purchase', v_id::text, v_id, p_user, now()
          );
        end if;
      end loop;
    end if;
  end loop;

  select subtotal, total into v_subtotal, v_total from public.invoice_purchase where id = v_id;

  -- L12: comisión al crear, en la moneda de la factura (el disparador de la base
  -- solo actúa al pasar a `paid`, que ningún camino escribe).
  if v_nuevo and v_ctype <> 'none' then
    select nullif(btrim(coalesce(pr.first_name, '') || ' ' || coalesce(pr.last_name, '')), '') into v_payee
      from public.profiles pr where pr.id = v_sp;
    insert into public.commissions (
      id, organization_id, branch_id, commission_type, source_type, source_id, payee_type, payee_id, payee_name,
      base_amount, commission_rate, commission_amount, currency, status, accrued_at, created_by, metadata
    ) values (
      gen_random_uuid(), p_org, v_branch, v_ctype, 'invoice_purchase', v_id::text, 'employee', v_sp, coalesce(v_payee, 'N/A'),
      case when coalesce(v_subtotal, 0) > 0 then v_subtotal else coalesce(v_total, 0) end, v_crate, v_camount,
      (select currency from public.invoice_purchase where id = v_id), 'accrued', now(), p_user,
      jsonb_build_object('invoice_number', v_number, 'commission_method', v_cmethod)
    );
  end if;

  perform public.fn_fc_recalcular_saldo(v_id);

  return jsonb_build_object(
    'id', v_id,
    'number_ext', v_number,
    'status', 'draft',
    'lineas', v_lineas,
    'subtotal', v_subtotal,
    'total', v_total,
    'neto_a_pagar', public.fn_invoice_purchase_neto(v_id),
    'seriales_omitidos', v_omitidos
  );
end;
$$;

revoke all on function public.fn_fc_guardar_int(integer, jsonb, uuid) from public, anon, authenticated;

-- ── Documento soporte en borrador (interna) ────────────────────────────────
create or replace function public.fn_fc_crear_ds_int(p_id uuid, p_user uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inv public.invoice_purchase%rowtype;
  v_sup record;
  v_ds uuid;
  v_ref text;
  v_n integer;
begin
  select * into v_inv from public.invoice_purchase where id = p_id;
  select id into v_ds from public.support_documents
   where invoice_purchase_id = p_id and organization_id = v_inv.organization_id and status <> 'cancelled'
   limit 1;
  if v_ds is not null then
    return v_ds;
  end if;

  select s.id, s.name, s.nit, s.dv, s.address, s.email, s.phone, s.country_code into v_sup
    from public.suppliers s where s.id = v_inv.supplier_id;

  perform pg_advisory_xact_lock(hashtextextended('ds_ref:' || v_inv.organization_id, 0));
  select coalesce(max((regexp_match(reference_code, '^DS\s*-\s*(\d{1,7})'))[1]::integer), 0) + 1 into v_n
    from public.support_documents where organization_id = v_inv.organization_id;
  v_ref := 'DS-' || lpad(v_n::text, 4, '0');

  insert into public.support_documents (
    organization_id, branch_id, supplier_id, invoice_purchase_id, reference_code, issue_date, observation,
    payment_details, provider, subtotal, tax_total, total, currency, status, created_by, tax_included
  ) values (
    v_inv.organization_id, v_inv.branch_id, v_inv.supplier_id, p_id, v_ref, v_inv.issue_date,
    'Documento soporte de la compra ' || v_inv.number_ext,
    '[]'::jsonb,
    jsonb_strip_nulls(jsonb_build_object(
      'supplier_id', v_sup.id, 'names', v_sup.name,
      'identification', nullif(regexp_replace(coalesce(v_sup.nit, ''), '[^0-9]', '', 'g'), ''),
      'dv', nullif(btrim(v_sup.dv::text), ''), 'address', v_sup.address, 'email', v_sup.email,
      'phone', v_sup.phone, 'country_code', coalesce(nullif(btrim(v_sup.country_code::text), ''), 'CO'))),
    v_inv.subtotal, v_inv.tax_total, v_inv.total, v_inv.currency, 'draft', p_user, v_inv.tax_included
  ) returning id into v_ds;

  -- Las líneas del documento soporte son las de la compra (la cola de
  -- facturación electrónica las lee por `support_document_id`).
  update public.invoice_items set support_document_id = v_ds
   where invoice_purchase_id = p_id or (invoice_id = p_id and invoice_type = 'purchase');

  return v_ds;
end;
$$;

revoke all on function public.fn_fc_crear_ds_int(uuid, uuid) from public, anon, authenticated;

-- ── Recepcionar (interna) ──────────────────────────────────────────────────
create or replace function public.fn_fc_recepcionar_int(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inv public.invoice_purchase%rowtype;
  v_iva_al_costo boolean;
  v_lineas jsonb;
  v_res jsonb;
  v_desde timestamptz;
begin
  select * into v_inv from public.invoice_purchase where id = p_id for update;
  if not found then
    raise exception 'FACTURA_NO_ENCONTRADA' using errcode = 'P0002';
  end if;
  if v_inv.status = 'draft' then
    raise exception 'NO_CONFIRMADA' using errcode = '22023';
  end if;
  if v_inv.status in ('void', 'voided') then
    raise exception 'ANULADA' using errcode = '22023';
  end if;
  if v_inv.stock_received_at is not null then
    return jsonb_build_object('ya_recepcionado', true, 'procesadas', '[]'::jsonb, 'saltadas', '[]'::jsonb);
  end if;

  -- Recepciones hechas por los caminos viejos (`purchase` o `purchase_invoice`).
  select min(created_at) into v_desde from public.stock_movements
   where organization_id = v_inv.organization_id and source in ('purchase', 'purchase_invoice')
     and source_id = p_id::text and direction = 'in';
  if v_desde is not null then
    update public.invoice_purchase set stock_received_at = v_desde where id = p_id;
    return jsonb_build_object('ya_recepcionado', true, 'procesadas', '[]'::jsonb, 'saltadas', '[]'::jsonb);
  end if;

  -- La mercancía de una factura que viene de una OC ya entró con la recepción de la OC.
  if v_inv.po_id is not null and exists (
    select 1 from public.stock_movements
     where organization_id = v_inv.organization_id and source = 'purchase_order'
       and source_id = v_inv.po_id::text and direction = 'in'
  ) then
    update public.invoice_purchase set stock_received_at = now() where id = p_id;
    return jsonb_build_object('ya_recepcionado', false, 'recibido_por_orden', true, 'procesadas', '[]'::jsonb, 'saltadas', '[]'::jsonb);
  end if;

  -- D6: el costo es neto de descuento y, para responsables de IVA, sin el IVA
  -- descontable. Para no responsables (R-99-PN sin O-48), el IVA va al costo.
  select coalesce('R-99-PN' = any(o.fiscal_responsibilities) and not ('O-48' = any(o.fiscal_responsibilities)), false)
    into v_iva_al_costo
    from public.organizations o where o.id = v_inv.organization_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'product_id', ii.product_id,
           'qty', ii.qty,
           'unit_cost', case when ii.qty > 0 then round(
              (case
                 when coalesce(v_iva_al_costo, false) then ii.total_line
                 when v_inv.tax_included and coalesce(ii.tax_rate, 0) > 0
                   then round((ii.qty * ii.unit_price - coalesce(ii.discount_amount, 0)) / (1 + ii.tax_rate / 100), 2)
                 else ii.qty * ii.unit_price - coalesce(ii.discount_amount, 0)
               end) / ii.qty, 6) else 0 end)
           order by ii.created_at, ii.id), '[]'::jsonb)
    into v_lineas
    from public.invoice_items ii
   where ii.invoice_purchase_id = p_id or (ii.invoice_id = p_id and ii.invoice_type = 'purchase');

  v_res := public.fn_kardex_entrada_compra_int(
    v_inv.organization_id, v_inv.branch_id, 'purchase', p_id::text, v_lineas, auth.uid(), v_inv.supplier_id, true);

  update public.invoice_purchase set stock_received_at = now() where id = p_id;
  return v_res;
end;
$$;

revoke all on function public.fn_fc_recepcionar_int(uuid) from public, anon, authenticated;

-- ── Confirmar (interna) ────────────────────────────────────────────────────
create or replace function public.fn_fc_confirmar_int(p_id uuid, p_recepcionar boolean, p_generar_ds boolean, p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inv public.invoice_purchase%rowtype;
  v_ap uuid;
  v_rec jsonb := null;
  v_ds uuid := null;
begin
  select * into v_inv from public.invoice_purchase where id = p_id for update;
  if not found then
    raise exception 'FACTURA_NO_ENCONTRADA' using errcode = 'P0002';
  end if;
  perform public.fn_assert_acceso_org(v_inv.organization_id);
  perform public.fn_fc_acceso_sucursal(v_inv.branch_id);
  if v_inv.status <> 'draft' then
    raise exception 'YA_CONFIRMADA' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.invoice_items ii
     where ii.invoice_purchase_id = p_id or (ii.invoice_id = p_id and ii.invoice_type = 'purchase')
  ) then
    raise exception 'SIN_LINEAS' using errcode = '22023';
  end if;

  -- El devengo lo registra `trg_auto_journal_purchase` con el total ya calculado
  -- por las líneas; la CxP la crea `trg_cxp_desde_factura`.
  update public.invoice_purchase set status = 'received', updated_at = now() where id = p_id;

  v_ap := public.fn_cxp_asegurar_de_factura(p_id);
  perform public.fn_fc_recalcular_saldo(p_id);

  if p_recepcionar then
    v_rec := public.fn_fc_recepcionar_int(p_id);
  end if;
  if p_generar_ds then
    v_ds := public.fn_fc_crear_ds_int(p_id, p_user);
  end if;

  return jsonb_build_object(
    'invoice_id', p_id,
    'status', 'received',
    'accounts_payable_id', v_ap,
    'recepcion', v_rec,
    'support_document_id', v_ds
  );
end;
$$;

revoke all on function public.fn_fc_confirmar_int(uuid, boolean, boolean, uuid) from public, anon, authenticated;

-- ── Públicas ───────────────────────────────────────────────────────────────
create or replace function public.fn_factura_compra_guardar(p_org integer, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.fn_finanzas_exigir_permiso(p_org, array['finance.create']);
  return public.fn_fc_guardar_int(p_org, p_payload, auth.uid());
end;
$$;

create or replace function public.fn_factura_compra_confirmar(p_id uuid, p_recepcionar boolean default true, p_generar_ds boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org integer;
begin
  select organization_id into v_org from public.invoice_purchase where id = p_id;
  if v_org is null then
    raise exception 'FACTURA_NO_ENCONTRADA' using errcode = 'P0002';
  end if;
  perform public.fn_finanzas_exigir_permiso(v_org, array['finance.create']);
  if p_recepcionar then
    perform public.fn_finanzas_exigir_permiso(v_org, array['inventory.create']);
  end if;
  return public.fn_fc_confirmar_int(p_id, coalesce(p_recepcionar, true), coalesce(p_generar_ds, false), auth.uid());
end;
$$;

create or replace function public.fn_factura_compra_recepcionar(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inv record;
begin
  select organization_id, branch_id into v_inv from public.invoice_purchase where id = p_id;
  if v_inv.organization_id is null then
    raise exception 'FACTURA_NO_ENCONTRADA' using errcode = 'P0002';
  end if;
  perform public.fn_finanzas_exigir_permiso(v_inv.organization_id, array['finance.create']);
  perform public.fn_finanzas_exigir_permiso(v_inv.organization_id, array['inventory.create']);
  perform public.fn_fc_acceso_sucursal(v_inv.branch_id);
  return public.fn_fc_recepcionar_int(p_id);
end;
$$;

create or replace function public.fn_factura_compra_eliminar_borrador(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inv public.invoice_purchase%rowtype;
begin
  select * into v_inv from public.invoice_purchase where id = p_id for update;
  if not found then
    raise exception 'FACTURA_NO_ENCONTRADA' using errcode = 'P0002';
  end if;
  perform public.fn_finanzas_exigir_permiso(v_inv.organization_id, array['finance.create']);
  perform public.fn_fc_acceso_sucursal(v_inv.branch_id);
  if v_inv.status <> 'draft' then
    raise exception 'SOLO_BORRADOR' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.payments p
     where p.status = 'completed'
       and ((p.source = 'invoice_purchase' and p.source_id = p_id::text)
         or (p.source = 'account_payable' and p.source_id in (
               select ap.id::text from public.accounts_payable ap where ap.invoice_id = p_id)))
  ) then
    raise exception 'TIENE_PAGOS' using errcode = '22023';
  end if;
  if exists (select 1 from public.journal_entries je
              where je.organization_id = v_inv.organization_id and je.source = 'invoice_purchase' and je.source_id = p_id::text) then
    -- Un borrador con asiento (datos viejos, §5.2) no se borra: se anula.
    raise exception 'TIENE_ASIENTO' using errcode = '22023';
  end if;

  delete from public.serial_numbers where purchase_invoice_id = p_id and status = 'in_stock' and organization_id = v_inv.organization_id;
  delete from public.commissions where organization_id = v_inv.organization_id and source_type = 'invoice_purchase'
     and source_id = p_id::text and status = 'accrued';
  -- CxP que los caminos viejos crearon para el borrador (sin pagos: comprobado arriba).
  delete from public.accounts_payable where invoice_id = p_id;
  delete from public.invoice_purchase_withholdings where invoice_id = p_id;
  delete from public.invoice_purchase_applied_taxes where invoice_id = p_id;
  delete from public.invoice_items where invoice_purchase_id = p_id or (invoice_id = p_id and invoice_type = 'purchase');
  delete from public.invoice_purchase where id = p_id;
end;
$$;

create or replace function public.fn_siguiente_numero_compra(p_org integer)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_anio integer;
  v_n integer;
begin
  perform public.fn_assert_acceso_org(p_org);
  v_anio := extract(year from (now() at time zone public.fn_timezone_for(p_org, null)))::integer;
  select coalesce(max((regexp_match(upper(number_ext), '^COMP-' || v_anio || '-(\d{1,9})$'))[1]::integer), 0) + 1 into v_n
    from public.invoice_purchase where organization_id = p_org;
  return 'COMP-' || v_anio || '-' || lpad(v_n::text, 4, '0');
end;
$$;

-- ── Desde una orden de compra recibida ─────────────────────────────────────
create or replace function public.fn_factura_compra_desde_oc(p_po_uuid uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
  perform public.fn_finanzas_exigir_permiso(v_po.organization_id, array['finance.create', 'inventory.create']);
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
$$;

-- ── Anular (v2, misma firma) ───────────────────────────────────────────────
create or replace function public.fn_void_purchase_invoice(p_invoice_id uuid, p_reason text default null, p_user uuid default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inv public.invoice_purchase%rowtype;
  v_user uuid;
  v_mov record;
  v_sl_id integer;
  v_orig_entry record;
  v_new_entry_id integer;
begin
  select * into v_inv from public.invoice_purchase where id = p_invoice_id for update;
  if not found then
    raise exception 'Factura de compra no encontrada' using errcode = 'P0002';
  end if;
  perform public.fn_finanzas_exigir_permiso(v_inv.organization_id, array['finance.void']);
  perform public.fn_fc_acceso_sucursal(v_inv.branch_id);
  v_user := coalesce(auth.uid(), p_user);

  if v_inv.status in ('void', 'voided') then
    raise exception 'La factura ya está anulada' using errcode = '22023';
  end if;

  -- Solo bloquean los pagos COMPLETADOS (un pago rechazado o cancelado no).
  if exists (
    select 1 from public.payments p
     where p.status = 'completed'
       and ((p.source = 'invoice_purchase' and p.source_id = p_invoice_id::text)
         or (p.source = 'account_payable' and p.source_id in (
               select ap.id::text from public.accounts_payable ap where ap.invoice_id = p_invoice_id)))
  ) then
    raise exception 'No se puede anular: la factura tiene pagos registrados' using errcode = '22023';
  end if;

  -- Revertir SOLO lo que esta factura metió al kardex, con su lote.
  for v_mov in
    select sm.branch_id, sm.product_id, sm.lot_id, sum(sm.qty) as qty,
           case when sum(sm.qty) > 0 then sum(sm.qty * coalesce(sm.unit_cost, 0)) / sum(sm.qty) else 0 end as unit_cost
      from public.stock_movements sm
     where sm.organization_id = v_inv.organization_id
       and sm.source in ('purchase', 'purchase_invoice')
       and sm.source_id = p_invoice_id::text
       and sm.direction = 'in'
     group by sm.branch_id, sm.product_id, sm.lot_id
  loop
    select sl.id into v_sl_id from public.stock_levels sl
     where sl.product_id = v_mov.product_id and sl.branch_id = v_mov.branch_id
       and sl.lot_id is not distinct from v_mov.lot_id
     order by sl.id limit 1 for update;
    if v_sl_id is not null then
      update public.stock_levels set qty_on_hand = coalesce(qty_on_hand, 0) - v_mov.qty, updated_at = now()
       where id = v_sl_id;
    end if;
    insert into public.stock_movements (
      organization_id, branch_id, product_id, lot_id, direction, qty, unit_cost, source, source_id, note, updated_by
    ) values (
      v_inv.organization_id, v_mov.branch_id, v_mov.product_id, v_mov.lot_id, 'out', v_mov.qty, v_mov.unit_cost,
      'purchase_void', p_invoice_id::text, 'Anulación factura ' || coalesce(v_inv.number_ext, ''), v_user
    );
  end loop;

  -- Contra-asiento ESPEJO del devengo (incluye IVA), igual que antes.
  select je.id, je.organization_id, je.branch_id into v_orig_entry
    from public.journal_entries je
   where je.source = 'invoice_purchase' and je.source_id = p_invoice_id::text and je.memo like 'Compra %'
   order by je.id desc limit 1;

  if v_orig_entry.id is not null then
    insert into public.journal_entries (organization_id, branch_id, entry_date, memo, source, source_id, posted, created_by)
    values (v_orig_entry.organization_id, v_orig_entry.branch_id, now(),
            'Anulación factura de compra ' || coalesce(v_inv.number_ext, ''), 'invoice_purchase', p_invoice_id::text, true, v_user)
    returning id into v_new_entry_id;

    insert into public.journal_lines (journal_entry_id, account_code, description, debit, credit)
    select v_new_entry_id, jl.account_code, 'Reversa - ' || jl.description, jl.credit, jl.debit
      from public.journal_lines jl where jl.journal_entry_id = v_orig_entry.id;
  end if;

  update public.ap_payment_schedules
     set status = 'cancelled', decided_by = v_user, decided_at = now(),
         decision_comment = 'Factura anulada', updated_at = now()
   where status = 'pending'
     and account_payable_id in (select ap.id from public.accounts_payable ap where ap.invoice_id = p_invoice_id);

  update public.invoice_purchase
     set status = 'void',
         balance = 0,
         stock_received_at = null,
         notes = coalesce(notes, '') ||
           case when p_reason is not null and btrim(p_reason) <> '' then E'\n[ANULADA] ' || btrim(p_reason) else E'\n[ANULADA]' end,
         updated_at = now()
   where id = p_invoice_id;
  -- La CxP pasa a `void` con saldo 0 por `trg_cxp_desde_factura`; se asegura aquí también.
  perform public.fn_cxp_asegurar_de_factura(p_invoice_id);
end;
$$;

-- ── Envoltorio del camino viejo ────────────────────────────────────────────
create or replace function public.confirm_purchase_invoice(invoice_id_param uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.fn_factura_compra_confirmar(invoice_id_param, true, false);
  return true;
end;
$$;

-- ── GO Assistant: misma firma y mismo resultado, sobre las internas ────────
create or replace function public.assistant_register_purchase_invoice(
  p_organization_id integer, p_branch_id integer, p_user_id uuid, p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item          jsonb;
  v_supplier_id   integer := nullif(p_payload->>'supplier_id','')::integer;
  v_supplier_name text;
  v_new_supplier  boolean := false;
  v_nit           text := nullif(regexp_replace(coalesce(p_payload->'supplier'->>'nit',''), '[^0-9]', '', 'g'), '');
  v_number        text := nullif(trim(p_payload->>'number_ext'), '');
  v_issue         timestamptz;
  v_due           timestamptz;
  v_receive       boolean := coalesce((p_payload->>'receive_stock')::boolean, true);
  v_product_id    integer;
  v_lineas        jsonb := '[]'::jsonb;
  v_name          text;
  v_g             jsonb;
  v_c             jsonb;
  v_id            uuid;
  v_inv           record;
  v_procesadas    jsonb;
  v_resumen       jsonb;
  v_tz            text;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if auth.uid() is not null and p_user_id is distinct from auth.uid() then
    raise exception 'USUARIO_NO_COINCIDE' using errcode = '42501';
  end if;
  if v_number is null then
    raise exception 'NUMBER_REQUIRED' using errcode = '22023';
  end if;
  if not exists (select 1 from public.branches where id = p_branch_id and organization_id = p_organization_id) then
    raise exception 'BRANCH_NOT_IN_ORG' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_payload->'items') <> 'array' or jsonb_array_length(p_payload->'items') = 0 then
    raise exception 'ITEMS_REQUIRED' using errcode = '22023';
  end if;

  if v_supplier_id is not null then
    select name into v_supplier_name from public.suppliers
     where id = v_supplier_id and organization_id = p_organization_id;
    if v_supplier_name is null then
      raise exception 'SUPPLIER_NOT_IN_ORG' using errcode = 'P0002';
    end if;
  else
    if v_nit is not null then
      select id, name into v_supplier_id, v_supplier_name from public.suppliers
       where organization_id = p_organization_id
         and regexp_replace(coalesce(nit,''), '[^0-9]', '', 'g') = v_nit
       order by is_active desc nulls last, id limit 1;
    end if;
    if v_supplier_id is null then
      v_supplier_name := nullif(trim(p_payload->'supplier'->>'name'), '');
      if v_supplier_name is null then
        raise exception 'SUPPLIER_REQUIRED' using errcode = '22023';
      end if;
      insert into public.suppliers (organization_id, name, nit, dv, doc_type, supplier_type, is_active)
      values (p_organization_id, v_supplier_name, v_nit,
              left(nullif(p_payload->'supplier'->>'dv',''), 1),
              case when v_nit is not null then 'nit' else null end, 'company', true)
      returning id into v_supplier_id;
      v_new_supplier := true;
    end if;
  end if;

  if exists (select 1 from public.invoice_purchase
              where organization_id = p_organization_id and supplier_id = v_supplier_id
                and upper(trim(number_ext)) = upper(v_number) and status <> 'void') then
    raise exception 'DUPLICATE_INVOICE:%', v_number using errcode = '23505';
  end if;

  for v_item in select * from jsonb_array_elements(p_payload->'items') loop
    v_product_id := nullif(v_item->>'product_id','')::integer;
    if nullif(v_item->>'qty','')::numeric is null or (v_item->>'qty')::numeric <= 0
       or nullif(v_item->>'unit_price','')::numeric is null or (v_item->>'unit_price')::numeric < 0 then
      raise exception 'ITEM_INVALID' using errcode = '22023';
    end if;
    v_name := null;
    if v_product_id is not null then
      select name into v_name from public.products where id = v_product_id and organization_id = p_organization_id;
      if v_name is null then
        raise exception 'PRODUCT_NOT_IN_ORG' using errcode = 'P0002';
      end if;
    end if;
    v_lineas := v_lineas || jsonb_build_object(
      'product_id', v_product_id,
      'description', coalesce(nullif(trim(v_item->>'description'),''), v_name, 'Producto'),
      'qty', (v_item->>'qty')::numeric,
      'unit_price', (v_item->>'unit_price')::numeric,
      'tax_rate', coalesce(nullif(v_item->>'tax_rate','')::numeric, 0),
      'discount_amount', coalesce(nullif(v_item->>'discount_amount','')::numeric, 0));
  end loop;

  v_tz := public.fn_timezone_for(p_organization_id, p_branch_id);
  v_issue := coalesce(public.fn_fc_instante(p_payload->>'issue_date', v_tz), now());
  v_due := coalesce(public.fn_fc_instante(p_payload->>'due_date', v_tz), v_issue + interval '30 days');

  v_g := public.fn_fc_guardar_int(p_organization_id, jsonb_build_object(
    'branch_id', p_branch_id,
    'supplier_id', v_supplier_id,
    'number_ext', v_number,
    'issue_date', v_issue,
    'due_date', v_due,
    -- Sin moneda, la base de la organización (antes 'USD' por defecto).
    'currency', nullif(trim(p_payload->>'currency'), ''),
    'payment_method', nullif(trim(p_payload->>'payment_method'), ''),
    'tax_included', coalesce((p_payload->>'tax_included')::boolean, false),
    'notes', nullif(trim(p_payload->>'notes'), ''),
    'lines', v_lineas
  ), p_user_id);
  v_id := (v_g->>'id')::uuid;

  v_c := public.fn_fc_confirmar_int(v_id, v_receive, false, p_user_id);
  v_procesadas := coalesce(v_c->'recepcion'->'procesadas', '[]'::jsonb);

  select subtotal, tax_total, total, currency into v_inv from public.invoice_purchase where id = v_id;
  select coalesce(jsonb_agg(jsonb_build_object(
           'product_id', ii.product_id, 'description', ii.description, 'qty', ii.qty, 'unit_price', ii.unit_price,
           'tax_rate', ii.tax_rate, 'discount_amount', ii.discount_amount, 'total_line', ii.total_line)
           order by ii.created_at, ii.id), '[]'::jsonb)
    into v_resumen
    from public.invoice_items ii where ii.invoice_purchase_id = v_id;

  return jsonb_build_object(
    'invoice_id', v_id, 'number_ext', v_number,
    'supplier_id', v_supplier_id, 'proveedor', v_supplier_name, 'proveedor_nuevo', v_new_supplier,
    'subtotal', v_inv.subtotal, 'tax_total', v_inv.tax_total, 'total', v_inv.total, 'moneda', v_inv.currency,
    'lineas', jsonb_array_length(v_lineas), 'lineas_con_stock', jsonb_array_length(v_procesadas),
    'accounts_payable_id', v_c->'accounts_payable_id',
    'stock_lines', coalesce((select jsonb_agg(jsonb_build_object('product_id', (x->>'product_id')::integer, 'quantity', (x->>'qty')::numeric))
                               from jsonb_array_elements(v_procesadas) x), '[]'::jsonb),
    'detalle', v_resumen
  );
end;
$$;

-- ── Contabilización retroactiva: solo confirmadas y solo el dueño ──────────
create or replace function public.fn_retro_journal_purchases()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
DECLARE
    v_purchase RECORD;
    v_rule RECORD;
    v_entry_id integer;
    v_count integer := 0;
BEGIN
    FOR v_purchase IN
        SELECT inv.id, inv.organization_id, inv.branch_id, inv.number_ext,
               inv.issue_date, inv.subtotal, inv.tax_total, inv.total,
               inv.created_at
        FROM invoice_purchase inv
        WHERE inv.status IN ('received', 'partial', 'paid')
          AND NOT EXISTS (
            SELECT 1 FROM journal_entries je
            WHERE je.source = 'invoice_purchase'
              AND je.source_id = inv.id::text
              AND je.organization_id = inv.organization_id
        )
    LOOP
        SELECT * INTO v_rule
        FROM accounting_rules
        WHERE organization_id = v_purchase.organization_id
          AND source_type = 'purchase'
          AND event_type = 'created'
          AND is_active = true
        ORDER BY priority
        LIMIT 1;

        IF v_rule IS NULL THEN
            CONTINUE;
        END IF;

        v_entry_id := fn_create_journal_entry(
            p_organization_id := v_purchase.organization_id,
            p_branch_id := v_purchase.branch_id,
            p_entry_date := COALESCE(v_purchase.issue_date, v_purchase.created_at),
            p_memo := 'Compra ' || COALESCE(v_purchase.number_ext, v_purchase.id::text),
            p_source := 'invoice_purchase',
            p_source_id := v_purchase.id::text,
            p_debit_account := v_rule.debit_account_code,
            p_credit_account := v_rule.credit_account_code,
            p_amount := v_purchase.total,
            p_tax_account := v_rule.tax_account_code,
            p_tax_amount := CASE WHEN v_rule.use_tax_from_document THEN v_purchase.tax_total ELSE 0 END
        );

        v_count := v_count + 1;
    END LOOP;

    RAISE NOTICE 'Facturas de compra contabilizadas: %', v_count;
END;
$$;

-- ── Permisos de ejecución ──────────────────────────────────────────────────
revoke all on function public.fn_retro_journal_purchases() from public, anon, authenticated;

revoke all on function public.fn_factura_compra_guardar(integer, jsonb) from public, anon;
revoke all on function public.fn_factura_compra_confirmar(uuid, boolean, boolean) from public, anon;
revoke all on function public.fn_factura_compra_recepcionar(uuid) from public, anon;
revoke all on function public.fn_factura_compra_eliminar_borrador(uuid) from public, anon;
revoke all on function public.fn_siguiente_numero_compra(integer) from public, anon;
revoke all on function public.fn_factura_compra_desde_oc(uuid) from public, anon;
revoke all on function public.fn_void_purchase_invoice(uuid, text, uuid) from public, anon;
revoke all on function public.confirm_purchase_invoice(uuid) from public, anon;
revoke all on function public.assistant_register_purchase_invoice(integer, integer, uuid, jsonb) from public, anon;

grant execute on function public.fn_factura_compra_guardar(integer, jsonb) to authenticated;
grant execute on function public.fn_factura_compra_confirmar(uuid, boolean, boolean) to authenticated;
grant execute on function public.fn_factura_compra_recepcionar(uuid) to authenticated;
grant execute on function public.fn_factura_compra_eliminar_borrador(uuid) to authenticated;
grant execute on function public.fn_siguiente_numero_compra(integer) to authenticated;
grant execute on function public.fn_factura_compra_desde_oc(uuid) to authenticated;
grant execute on function public.fn_void_purchase_invoice(uuid, text, uuid) to authenticated;
grant execute on function public.confirm_purchase_invoice(uuid) to authenticated;
grant execute on function public.assistant_register_purchase_invoice(integer, integer, uuid, jsonb) to authenticated;
