-- Reversión de 20260929010000_factura_venta_nota_impuestos_terminos.sql.
-- Restaura fn_factura_venta_guardar de 20260924104430 y quita las dos columnas.
-- ADVERTENCIA: borra las notas de línea, el detalle de impuestos por línea y
-- los términos guardados desde entonces (los datos no se restauran).

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

alter table public.invoice_items drop column if exists impuestos_linea;
alter table public.invoice_sales drop column if exists terms_conditions;
