-- POS — checkout atómico (Desktop fase 4E; ROADMAP-DESKTOP §Fase 4, punto 4).
--
-- Hasta hoy `POSService.checkout` hacía N inserts secuenciales desde el
-- navegador (`sales`, `sale_items`, stock, `invoice_sales`, `payments`,
-- `invoice_items`, `tips`, `commissions`). Una reproducción del outbox podía
-- morir a mitad y la venta quedaba minutos sin pagos o sin factura. Esta RPC
-- recibe el sobre completo y lo escribe en UNA transacción: o entra todo o no
-- entra nada.
--
-- Contrato — `public.pos_checkout_v1(p_envelope jsonb) returns jsonb`
--
--   p_envelope = {
--     version: 1,
--     sale_id: uuid,                 -- generado en el cliente (idempotencia)
--     created_at: timestamptz,       -- instante real de la venta
--     organization_id: int,          -- debe coincidir con la sesión
--     branch_id: int,
--     user_id: uuid | null,          -- cajero (sales.user_id); null → auth.uid()
--     customer_id: uuid | null,
--     currency: text | null,         -- null → moneda base de la organización
--     tax_included: bool,
--     tax_breakdown: json | null,
--     totals: { subtotal, tax_total, discount_total, total, total_paid,
--               change, shipping_fee, tip_amount },   -- YA calculados
--     items: [{ product_id, product_name, quantity, unit_price,
--               discount_amount, tax_rate, tax_amount, total, tax_included,
--               notes: json, modifiers: [{ name }], serial_ids: [int] }],
--     payments: [{ method, amount }],   -- en orden; el cambio va al 1.º efectivo
--     tip: { server_id: uuid | null } | null,
--     salesperson: { id, commission_rate, commission_type, commission_method,
--                    commission_amount, base_amount } | null,
--     invoice: { prefix: 'FACT', commission_amount },
--     promotion_ids: [uuid]
--   }
--
--   Devuelve { sale, invoice, payments: [], replayed: bool,
--              completed: [bloques insertados al completar], warnings: [] }.
--
-- Reglas:
--   * Guarda de pertenencia: `auth.uid()` (o `user_id` del sobre con
--     service_role) debe ser miembro activo de `organization_id`. Sin sesión
--     falla cerrado (42501).
--   * Valida antes de escribir: sucursal y cliente de la organización, ítems
--     con cantidad > 0, total = Σ ítems + flete + propina, Σ pagos = total_paid.
--   * Idempotente por `sale_id`: si la venta ya existe en la organización no se
--     vuelve a insertar (`replayed: true`) y se completa SOLO lo que falte,
--     bloque a bloque, igual que hacía el código Node (fase 4B). Un
--     `pg_advisory_xact_lock` por venta serializa dos reproducciones
--     simultáneas.
--   * Reutiliza lo que ya existe en la base: `decrement_stock_with_recipe`
--     (stock y `stock_movements`), `increment_promotion_usage`, y los
--     disparadores de `invoice_sales` / `payments` que crean y recalculan la
--     cartera (`accounts_receivable`) y el saldo de la factura. NO se escribe
--     `accounts_receivable` a mano: `tr_create_account_receivable` ya lo hace
--     al insertar la factura, y la fila manual de Node duplicaba la cartera.
--   * Orden de escritura: pagos ANTES que `invoice_items` (el disparador
--     `fn_recalc_invoice_totals` recalcula el saldo a partir de los pagos).
--   * Numeración de factura: misma regla que `generateInvoiceNumber`
--     (`FACT-<max+1>`, 4 dígitos, saltando los ya usados), bajo un advisory
--     lock por organización para que dos cajas no compartan consecutivo.
--   * Stock, seriales, comisión y promociones no bloquean la venta (como en
--     Node): sus fallos vuelven en `warnings`. Venta, líneas, factura, pagos,
--     líneas de factura y propina son atómicos: cualquier error deshace todo.
--
-- Rollback: supabase/rollbacks/20260921100000_pos_checkout_v1_rpc_atomica_rollback.sql

create or replace function public.pos_checkout_v1(p_envelope jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org         integer;
  v_branch      integer;
  v_sale_id     uuid;
  v_created_at  timestamptz;
  v_user_id     uuid;   -- cajero: sales.user_id
  v_actor       uuid;   -- quien ejecuta: created_by de factura y pagos
  v_customer    uuid;
  v_currency    text;
  v_tax_included boolean;
  v_totals      jsonb;
  v_subtotal    numeric;
  v_tax_total   numeric;
  v_discount    numeric;
  v_total       numeric;
  v_total_paid  numeric;
  v_change      numeric;
  v_shipping    numeric;
  v_tip         numeric;
  v_balance     numeric;
  v_items       jsonb;
  v_items_total numeric;
  v_payments    jsonb;
  v_pay_sum     numeric;
  v_status      text;
  v_pay_status  text;
  v_sale        public.sales%rowtype;
  v_invoice     public.invoice_sales%rowtype;
  v_replayed    boolean := false;
  v_completed   text[] := '{}';
  v_warnings    text[] := '{}';
  v_item        jsonb;
  v_pay         jsonb;
  v_ord         integer;
  v_product_id  integer;
  v_qty         numeric;
  v_unit_price  numeric;
  v_sp          jsonb;
  v_sp_id       uuid;
  v_sp_rate     numeric;
  v_sp_type     text;
  v_inv         jsonb;
  v_prefix      text;
  v_max         integer;
  v_n           integer;
  v_number      text;
  v_first_method text;
  v_existing_payments integer;
  v_idx         integer;
  v_change_assigned boolean := false;
  v_takes_change boolean;
  v_payment_rows jsonb;
  v_desc        text;
  v_pname       text;
  v_parent_name text;
  v_mods        text;
  v_promos      uuid[];
  v_serial_ids  integer[];
  v_serial      record;
  v_payee_name  text;
  v_tip_server  uuid;
  v_tip_type    text;
begin
  -- ── 1. Sobre ─────────────────────────────────────────────────────────────
  if p_envelope is null or jsonb_typeof(p_envelope) <> 'object' then
    raise exception 'Sobre de venta inválido' using errcode = '22023';
  end if;

  v_org        := (p_envelope->>'organization_id')::integer;
  v_branch     := (p_envelope->>'branch_id')::integer;
  v_sale_id    := (p_envelope->>'sale_id')::uuid;
  v_created_at := coalesce((p_envelope->>'created_at')::timestamptz, now());
  v_user_id    := nullif(p_envelope->>'user_id', '')::uuid;
  v_customer   := nullif(p_envelope->>'customer_id', '')::uuid;

  if v_org is null or v_branch is null or v_sale_id is null then
    raise exception 'El sobre necesita organization_id, branch_id y sale_id' using errcode = '22023';
  end if;

  -- ── 2. Guarda de pertenencia ─────────────────────────────────────────────
  -- Afirmación positiva incondicional: con anon `auth.uid()` es NULL y el
  -- EXISTS falla cerrado. Con service_role (sin sub en el JWT) el actor es el
  -- cajero del sobre, que igualmente debe ser miembro activo.
  v_actor := auth.uid();
  if v_actor is null and auth.role() = 'service_role' then
    v_actor := v_user_id;
  end if;
  if v_actor is null or not exists (
    select 1 from public.organization_members om
    where om.user_id = v_actor
      and om.organization_id = v_org
      and om.is_active
  ) then
    raise exception 'No perteneces a esta organización' using errcode = '42501';
  end if;
  v_user_id := coalesce(v_user_id, v_actor);

  if not exists (select 1 from public.branches b where b.id = v_branch and b.organization_id = v_org) then
    raise exception 'La sucursal % no pertenece a la organización', v_branch using errcode = '22023';
  end if;
  if v_customer is not null and not exists (
    select 1 from public.customers c where c.id = v_customer and c.organization_id = v_org
  ) then
    raise exception 'El cliente % no pertenece a la organización', v_customer using errcode = '22023';
  end if;

  -- ── 3. Totales e ítems: valores ya calculados, aquí solo se validan ──────
  v_totals       := coalesce(p_envelope->'totals', '{}'::jsonb);
  v_subtotal     := coalesce((v_totals->>'subtotal')::numeric, 0);
  v_tax_total    := coalesce((v_totals->>'tax_total')::numeric, 0);
  v_discount     := coalesce((v_totals->>'discount_total')::numeric, 0);
  v_total        := (v_totals->>'total')::numeric;
  v_total_paid   := coalesce((v_totals->>'total_paid')::numeric, 0);
  v_change       := coalesce((v_totals->>'change')::numeric, 0);
  v_shipping     := coalesce((v_totals->>'shipping_fee')::numeric, 0);
  v_tip          := coalesce((v_totals->>'tip_amount')::numeric, 0);
  v_tax_included := coalesce((p_envelope->>'tax_included')::boolean, false);
  v_items        := coalesce(p_envelope->'items', '[]'::jsonb);
  v_payments     := coalesce(p_envelope->'payments', '[]'::jsonb);

  if v_total is null or v_total < 0 then
    raise exception 'Total de la venta inválido' using errcode = '22023';
  end if;
  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then
    raise exception 'La venta no tiene ítems' using errcode = '22023';
  end if;
  if v_tip < 0 or v_shipping < 0 or v_total_paid < 0 or v_change < 0 then
    raise exception 'Importes negativos en el sobre' using errcode = '22023';
  end if;

  v_items_total := 0;
  for v_item in select value from jsonb_array_elements(v_items) loop
    v_qty := (v_item->>'quantity')::numeric;
    v_unit_price := coalesce((v_item->>'unit_price')::numeric, 0);
    if v_qty is null or v_qty <= 0 then
      raise exception 'Ítem con cantidad inválida (producto %)', v_item->>'product_id' using errcode = '22023';
    end if;
    if v_unit_price < 0 or coalesce((v_item->>'discount_amount')::numeric, 0) < 0 then
      raise exception 'Ítem con importes negativos (producto %)', v_item->>'product_id' using errcode = '22023';
    end if;
    v_items_total := v_items_total + coalesce((v_item->>'total')::numeric, 0);
  end loop;
  if abs(v_items_total + v_shipping + v_tip - v_total) > 0.05 then
    raise exception 'Totales incoherentes: ítems % + flete % + propina % ≠ total %',
      v_items_total, v_shipping, v_tip, v_total using errcode = '22023';
  end if;

  v_pay_sum := 0;
  for v_pay in select value from jsonb_array_elements(v_payments) loop
    if coalesce((v_pay->>'amount')::numeric, 0) < 0 then
      raise exception 'Pago con importe negativo' using errcode = '22023';
    end if;
    v_pay_sum := v_pay_sum + coalesce((v_pay->>'amount')::numeric, 0);
  end loop;
  if abs(v_pay_sum - v_total_paid) > 0.05 then
    raise exception 'Pagos incoherentes: Σ pagos % ≠ total_paid %', v_pay_sum, v_total_paid using errcode = '22023';
  end if;

  v_balance    := greatest(0, v_total - v_total_paid);
  v_status     := case when v_total_paid >= v_total then 'paid' else 'pending' end;
  v_pay_status := case when v_total_paid >= v_total then 'paid' else 'partial' end;

  v_currency := coalesce(
    nullif(p_envelope->>'currency', ''),
    (select oc.currency_code from public.organization_currencies oc
      where oc.organization_id = v_org order by oc.is_base desc, oc.currency_code asc limit 1),
    'COP');

  v_sp      := case when jsonb_typeof(p_envelope->'salesperson') = 'object' then p_envelope->'salesperson' else null end;
  v_sp_id   := nullif(v_sp->>'id', '')::uuid;
  v_sp_rate := coalesce((v_sp->>'commission_rate')::numeric, 0);
  v_sp_type := coalesce(nullif(v_sp->>'commission_type', ''), 'none');
  if v_sp_id is null or v_sp_rate <= 0 then
    v_sp_type := 'none';
  end if;
  v_inv := coalesce(p_envelope->'invoice', '{}'::jsonb);

  -- ── 4. Venta (idempotente por id) ────────────────────────────────────────
  perform pg_advisory_xact_lock(hashtext('pos_checkout:' || v_sale_id::text));

  select * into v_sale from public.sales s where s.id = v_sale_id for update;
  if found then
    if v_sale.organization_id <> v_org then
      raise exception 'La venta pertenece a otra organización' using errcode = '42501';
    end if;
    v_replayed := true;
  else
    begin
      insert into public.sales (
        id, created_at, organization_id, branch_id, customer_id, user_id,
        subtotal, tax_total, discount_total, total, balance,
        status, payment_status, tax_included, tax_breakdown, sale_date,
        salesperson_id, commission_rate, commission_type, delivery_fee, tip_amount
      ) values (
        v_sale_id, v_created_at, v_org, v_branch, v_customer, v_user_id,
        v_subtotal, v_tax_total, v_discount, v_total, v_balance,
        v_status, v_pay_status, v_tax_included,
        case when jsonb_typeof(p_envelope->'tax_breakdown') in ('array', 'object') then p_envelope->'tax_breakdown' else null end,
        v_created_at,
        v_sp_id, coalesce((v_sp->>'commission_rate')::numeric, 0),
        case when v_sp_type in ('salesperson', 'intermediation_sale') then v_sp_type else 'none' end,
        case when v_shipping > 0 then v_shipping else 0 end,
        case when v_tip > 0 then v_tip else null end
      ) returning * into v_sale;
    exception when unique_violation then
      -- Otra reproducción insertó el mismo id entre el SELECT y el INSERT.
      select * into v_sale from public.sales s where s.id = v_sale_id;
      if v_sale.id is null or v_sale.organization_id <> v_org then
        raise;
      end if;
      v_replayed := true;
    end;
  end if;

  -- ── 5. Promociones (estadística; solo en venta nueva, como en Node) ──────
  v_promos := array(
    select x::uuid from jsonb_array_elements_text(coalesce(p_envelope->'promotion_ids', '[]'::jsonb)) x
  );
  if not v_replayed and cardinality(v_promos) > 0 then
    begin
      perform public.increment_promotion_usage(v_org, v_promos);
    exception when others then
      v_warnings := array_append(v_warnings, 'promociones: ' || sqlerrm);
    end;
  end if;

  -- ── 6. Comisión (no bloquea; una sola por venta) ─────────────────────────
  if v_sp_type <> 'none' and not exists (
    select 1 from public.commissions c where c.source_type = 'sale' and c.source_id = v_sale_id::text
  ) then
    begin
      select nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '')
        into v_payee_name from public.profiles p where p.id = v_sp_id;
      insert into public.commissions (
        organization_id, branch_id, commission_type, source_type, source_id,
        payee_type, payee_id, payee_name, base_amount, commission_rate, commission_amount,
        currency, status, accrued_at, created_by, metadata
      ) values (
        v_org, v_branch, v_sp_type, 'sale', v_sale_id::text,
        'employee', v_sp_id, coalesce(v_payee_name, 'N/A'),
        coalesce((v_sp->>'base_amount')::numeric, v_subtotal), v_sp_rate,
        coalesce((v_sp->>'commission_amount')::numeric, 0),
        v_currency, 'accrued', now(), v_actor,
        jsonb_build_object('sale_id', v_sale_id, 'commission_method', coalesce(nullif(v_sp->>'commission_method', ''), 'percentage'))
      );
      if v_replayed then v_completed := array_append(v_completed, 'commissions'); end if;
    exception when others then
      v_warnings := array_append(v_warnings, 'comisión: ' || sqlerrm);
    end;
  end if;

  -- ── 7. Líneas de venta ───────────────────────────────────────────────────
  if not exists (select 1 from public.sale_items si where si.sale_id = v_sale_id) then
    insert into public.sale_items (
      sale_id, product_id, quantity, unit_price, total, tax_amount, tax_rate, discount_amount, notes
    )
    select
      v_sale_id,
      nullif(i.value->>'product_id', '')::integer,
      (i.value->>'quantity')::numeric,
      coalesce((i.value->>'unit_price')::numeric, 0),
      coalesce((i.value->>'total')::numeric, 0),
      coalesce((i.value->>'tax_amount')::numeric, 0),
      coalesce((i.value->>'tax_rate')::numeric, 0),
      coalesce((i.value->>'discount_amount')::numeric, 0),
      case when jsonb_typeof(i.value->'notes') = 'object' then i.value->'notes' else null end
    from jsonb_array_elements(v_items) with ordinality as i(value, ord)
    order by i.ord;
    if v_replayed then v_completed := array_append(v_completed, 'sale_items'); end if;
  end if;

  -- ── 8. Stock y seriales (no bloquean; un solo descuento por venta) ───────
  if not exists (
    select 1 from public.stock_movements sm where sm.source = 'sale' and sm.source_id = v_sale_id::text
  ) then
    for v_item, v_ord in select i.value, i.ord from jsonb_array_elements(v_items) with ordinality as i(value, ord) order by i.ord loop
      v_product_id := nullif(v_item->>'product_id', '')::integer;
      v_qty        := (v_item->>'quantity')::numeric;
      v_unit_price := coalesce((v_item->>'unit_price')::numeric, 0);
      if v_product_id is null then continue; end if;

      begin
        perform public.decrement_stock_with_recipe(
          v_org, v_branch, v_product_id, v_qty, 'sale', v_sale_id::text, v_unit_price, v_user_id
        );
      exception when others then
        v_warnings := array_append(v_warnings, 'stock producto ' || v_product_id || ': ' || sqlerrm);
      end;

      v_serial_ids := array(
        select x::integer from jsonb_array_elements_text(coalesce(v_item->'serial_ids', '[]'::jsonb)) x
      );
      if cardinality(v_serial_ids) > 0 then
        for v_serial in
          select sn.id, sn.status, sn.organization_id, sn.current_branch_id
          from public.serial_numbers sn where sn.id = any(v_serial_ids)
        loop
          if v_serial.organization_id <> v_org then
            v_warnings := array_append(v_warnings, 'serial ' || v_serial.id || ': de otra organización');
            continue;
          end if;
          if v_serial.status not in ('in_stock', 'reserved') then
            v_warnings := array_append(v_warnings, 'serial ' || v_serial.id || ': estado ' || v_serial.status || ', no disponible');
            continue;
          end if;
          update public.serial_numbers set
            status = 'sold', sale_channel = 'pos', sale_date = now(), sale_id = v_sale_id::text,
            sold_to_customer_id = v_customer, sold_by_user_id = v_user_id, price_at_sale = v_unit_price,
            current_branch_id = v_branch, updated_at = now(), updated_by = v_user_id
          where id = v_serial.id;
          insert into public.serial_tracking_events (
            serial_number_id, organization_id, event_type, from_status, to_status, to_branch_id,
            source_table, source_id, sale_id, customer_id, performed_by
          ) values (
            v_serial.id, v_org, 'sold', v_serial.status, 'sold', v_branch,
            'sales', v_sale_id::text, v_sale_id, v_customer, v_user_id
          );
        end loop;
      end if;
    end loop;
    if v_replayed then v_completed := array_append(v_completed, 'stock'); end if;
  end if;

  -- ── 9. Factura (se reutiliza si ya existe: no consume otro consecutivo) ──
  select * into v_invoice from public.invoice_sales inv
  where inv.sale_id = v_sale_id and inv.organization_id = v_org
  order by inv.created_at asc limit 1;

  select p.value->>'method' into v_first_method
  from jsonb_array_elements(v_payments) with ordinality as p(value, ord) order by p.ord limit 1;

  if v_invoice.id is null then
    v_prefix := coalesce(nullif(v_inv->>'prefix', ''), 'FACT');
    -- Misma regla que generateInvoiceNumber: máximo secuencial (1-7 dígitos,
    -- ignorando sufijos y respaldos con timestamp) + 1, saltando los usados.
    perform pg_advisory_xact_lock(hashtext('invoice_number:' || v_org::text));
    select coalesce(max(substring(inv.number from ('(?i)' || v_prefix || '\s*-\s*(\d{1,7})(?:\D|$)'))::integer), 0)
      into v_max
    from public.invoice_sales inv
    where inv.organization_id = v_org and inv.number like v_prefix || '-%';
    v_n := v_max + 1;
    v_number := v_prefix || '-' || lpad(v_n::text, 4, '0');
    while exists (
      select 1 from public.invoice_sales inv
      where inv.organization_id = v_org
        and upper(regexp_replace(trim(inv.number), '\s+', ' ', 'g')) = v_number
    ) loop
      v_n := v_n + 1;
      v_number := v_prefix || '-' || lpad(v_n::text, 4, '0');
    end loop;

    insert into public.invoice_sales (
      organization_id, branch_id, customer_id, sale_id, number, issue_date, due_date, currency,
      subtotal, tax_total, total, balance, status, tax_included, payment_method, payment_terms,
      created_by, notes, salesperson_id, commission_rate, commission_type, commission_method, commission_amount
    ) values (
      v_org, v_branch, v_customer, v_sale_id, v_number, v_created_at, v_created_at, v_currency,
      v_subtotal, v_tax_total, v_total, v_sale.balance,
      case when v_sale.balance > 0 then 'partial' else 'paid' end,
      v_tax_included, coalesce(v_first_method, 'cash'), 0,
      v_actor, 'Factura generada automáticamente desde POS - Venta #' || v_sale_id::text,
      v_sp_id, coalesce((v_sp->>'commission_rate')::numeric, 0),
      case when v_sp_type <> 'none' then v_sp_type else 'none' end,
      coalesce(nullif(v_sp->>'commission_method', ''), 'percentage'),
      coalesce((v_inv->>'commission_amount')::numeric, 0)
    ) returning * into v_invoice;
    if v_replayed then v_completed := array_append(v_completed, 'invoice_sales'); end if;
  end if;

  -- ── 10. Pagos (antes que invoice_items; solo los que faltan, en orden) ───
  select count(*) into v_existing_payments
  from public.payments p where p.source = 'invoice_sales' and p.source_id = v_invoice.id::text;

  v_idx := 0;
  for v_pay, v_ord in select p.value, p.ord from jsonb_array_elements(v_payments) with ordinality as p(value, ord) order by p.ord loop
    if coalesce((v_pay->>'amount')::numeric, 0) <= 0 then continue; end if;
    -- El cambio se asigna al primer pago en efectivo, exista ya o no.
    v_takes_change := (not v_change_assigned) and v_change > 0 and (v_pay->>'method') = 'cash';
    if v_takes_change then v_change_assigned := true; end if;
    if v_idx < v_existing_payments then
      v_idx := v_idx + 1;
      continue;
    end if;
    v_idx := v_idx + 1;
    insert into public.payments (
      organization_id, branch_id, amount, method, currency, status, change_amount,
      source, source_id, created_by
    ) values (
      v_org, v_branch, (v_pay->>'amount')::numeric, v_pay->>'method', v_currency, 'completed',
      case when v_takes_change then v_change else 0 end,
      'invoice_sales', v_invoice.id::text, v_actor
    );
    if v_replayed and not ('payments' = any(v_completed)) then v_completed := array_append(v_completed, 'payments'); end if;
  end loop;

  -- ── 11. Líneas de factura ────────────────────────────────────────────────
  if not exists (select 1 from public.invoice_items ii where ii.invoice_id = v_invoice.id) then
    for v_item, v_ord in select i.value, i.ord from jsonb_array_elements(v_items) with ordinality as i(value, ord) order by i.ord loop
      v_product_id := nullif(v_item->>'product_id', '')::integer;
      v_pname := null; v_parent_name := null; v_mods := null;
      if v_product_id is not null then
        select p.name, pp.name into v_pname, v_parent_name
        from public.products p left join public.products pp on pp.id = p.parent_product_id
        where p.id = v_product_id and p.organization_id = v_org;
      end if;
      v_desc := coalesce(v_pname, nullif(v_item->>'product_name', ''), 'Producto ID: ' || coalesce(v_product_id::text, '?'));
      if v_pname is not null and v_parent_name is not null then
        v_desc := v_parent_name || ' - ' || v_desc;
      end if;
      select string_agg(m.value->>'name', ', ') into v_mods
      from jsonb_array_elements(case when jsonb_typeof(v_item->'modifiers') = 'array' then v_item->'modifiers' else '[]'::jsonb end) m
      where coalesce(m.value->>'name', '') <> '';
      if v_mods is not null then
        v_desc := v_desc || ' (' || v_mods || ')';
      end if;

      insert into public.invoice_items (
        invoice_id, invoice_sales_id, invoice_type, product_id, description, qty, unit_price,
        total_line, tax_rate, tax_included, discount_amount
      ) values (
        v_invoice.id, v_invoice.id, 'sale', v_product_id, left(v_desc, 255),
        (v_item->>'quantity')::numeric, coalesce((v_item->>'unit_price')::numeric, 0),
        coalesce((v_item->>'total')::numeric, 0), coalesce((v_item->>'tax_rate')::numeric, 0),
        coalesce((v_item->>'tax_included')::boolean, v_tax_included),
        coalesce((v_item->>'discount_amount')::numeric, 0)
      );
    end loop;
    if v_replayed then v_completed := array_append(v_completed, 'invoice_items'); end if;
  end if;

  -- ── 12. Propina ──────────────────────────────────────────────────────────
  if v_tip > 0 and not exists (select 1 from public.tips t where t.sale_id = v_sale_id) then
    v_tip_server := coalesce(nullif(p_envelope->'tip'->>'server_id', '')::uuid, v_user_id);
    -- tips.tip_type solo admite cash/card/split/pooled.
    v_tip_type := case when v_first_method = 'card' then 'card' else 'cash' end;
    insert into public.tips (
      organization_id, branch_id, sale_id, server_id, amount, tip_type, is_distributed, notes
    ) values (
      v_org, v_branch, v_sale_id, v_tip_server, v_tip, v_tip_type, false,
      'Propina de venta #' || right(v_sale_id::text, 8)
    );
    if v_replayed then v_completed := array_append(v_completed, 'tips'); end if;
  end if;

  -- ── 13. Resultado (filas frescas: los disparadores ya recalcularon) ──────
  select * into v_sale from public.sales s where s.id = v_sale_id;
  select * into v_invoice from public.invoice_sales inv where inv.id = v_invoice.id;
  select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at, p.id), '[]'::jsonb) into v_payment_rows
  from public.payments p where p.source = 'invoice_sales' and p.source_id = v_invoice.id::text;

  return jsonb_build_object(
    'sale', to_jsonb(v_sale),
    'invoice', to_jsonb(v_invoice),
    'payments', v_payment_rows,
    'replayed', v_replayed,
    'completed', to_jsonb(v_completed),
    'warnings', to_jsonb(v_warnings)
  );
end;
$$;

comment on function public.pos_checkout_v1(jsonb) is
  'POS: checkout atómico e idempotente por sale_id (Desktop fase 4E). Recibe el sobre completo con valores ya calculados, los valida y escribe venta, líneas, stock, factura, pagos, líneas de factura, propina y comisión en una transacción. Guarda de pertenencia por organization_members.';

revoke all on function public.pos_checkout_v1(jsonb) from public, anon;
grant execute on function public.pos_checkout_v1(jsonb) to authenticated, service_role;
