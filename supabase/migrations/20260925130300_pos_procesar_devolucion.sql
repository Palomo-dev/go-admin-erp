-- D-1 (docs/design/POS-PARIDAD-PAGINAS-SECUNDARIAS.md §2.4 y §5): la
-- devolución del POS pasa a una RPC transaccional.
--
-- Antes (devolucionesService.procesarDevolucion, 7 devoluciones en la base,
-- 0 con reason_id):
--   - el stock solo volvía para productos serializados;
--   - la salida de caja insertaba cash_movements SIN organization_id (NOT
--     NULL) y buscaba la caja con .single() sobre cualquier caja abierta de la
--     sucursal: fallaba siempre y el error se tragaba;
--   - reason_id quedaba vacío; saldos de factura, venta y cartera se
--     escribían a mano desde el navegador, en N llamadas sin transacción.
--
-- Esta migración (aditiva):
--  1. returns: refund_method, cash_session_id, cash_movement_id,
--     credit_note_invoice_id, customer_credit_id, idempotency_key, notes
--     (todas NULL-ables) + índice único de idempotencia por organización.
--  2. return_lines: las líneas de cada devolución con su motivo (lectura por
--     pertenencia; la escritura solo por la RPC).
--  3. cash_movements.return_id: la salida de caja sabe de qué devolución es.
--     fn_auto_journal_cash_movement no contabiliza esas salidas: el asiento
--     del reintegro lo hace la RPC contra la cartera de la nota crédito (si no,
--     el ingreso se reversaba dos veces: la NC y la regla genérica de caja).
--  4. fn_stock_entrada_devolucion: la entrada simétrica de
--     decrement_stock_on_sale (mismo nivel sin lote, mismo kardex, origen
--     'return'). No se reutiliza fn_register_stock_entry porque exige costo
--     > 0 (735 salidas de venta tienen costo 0) y sobrescribe avg_cost, ni
--     fn_producto_int_ajustar_stock porque fija un absoluto con origen
--     'adjustment'. Lotes: ninguna salida de venta del kardex lleva lote
--     (verificado: 0 de 4.723), así que la entrada vuelve al nivel sin lote,
--     igual que salió. Recetas: solo vuelve el producto si lleva stock; los
--     ingredientes consumidos no.
--  5. procesar_devolucion(...): SECURITY DEFINER, fn_assert_acceso_org +
--     acceso a la sucursal, revocada a anon, idempotente por clave.
--  6. pos_caja_esperado: las devoluciones nuevas ya no se restan dos veces
--     (efectivo → cash_movements; saldo a favor → no sale de caja). Solo las
--     heredadas (refund_method NULL) se siguen restando como antes.
--
-- Nota crédito ELECTRÓNICA (Factus/DIAN): NO se envía todavía. La RPC deja la
-- nota crédito contable en invoice_sales (document_type 'credit_note',
-- related_invoice_id = factura original, einvoice_status NULL) y su id en
-- returns.credit_note_invoice_id. El enganche pendiente: encolar un job de
-- electronic_invoicing_jobs para ese documento desde el servidor, cuando el
-- dueño decida anular vs. devolver (§6.1).

-- ── 1. returns ──────────────────────────────────────────────────────────────
alter table public.returns add column if not exists refund_method text;
alter table public.returns add column if not exists cash_session_id integer references public.cash_sessions(id) on delete set null;
alter table public.returns add column if not exists cash_movement_id integer references public.cash_movements(id) on delete set null;
alter table public.returns add column if not exists credit_note_invoice_id uuid references public.invoice_sales(id) on delete set null;
alter table public.returns add column if not exists customer_credit_id uuid references public.credit_notes(id) on delete set null;
alter table public.returns add column if not exists idempotency_key text;
alter table public.returns add column if not exists notes text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'returns_refund_method_check') then
    alter table public.returns add constraint returns_refund_method_check
      check (refund_method is null or refund_method in ('cash', 'store_credit'));
  end if;
end $$;

create unique index if not exists ux_returns_idempotencia
  on public.returns (organization_id, idempotency_key)
  where idempotency_key is not null;

comment on column public.returns.refund_method is
  'cash = salida de la caja abierta (cash_movement_id); store_credit = saldo a favor (customer_credit_id). NULL = devolución anterior a procesar_devolucion.';
comment on column public.returns.credit_note_invoice_id is
  'Nota crédito contable (invoice_sales, document_type credit_note). La NC electrónica aún no se envía: enganche pendiente.';

-- ── 2. return_lines ─────────────────────────────────────────────────────────
create table if not exists public.return_lines (
  id bigint generated always as identity primary key,
  organization_id integer not null references public.organizations(id) on delete cascade,
  return_id integer not null references public.returns(id) on delete cascade,
  sale_item_id uuid references public.sale_items(id) on delete set null,
  product_id integer references public.products(id) on delete set null,
  quantity numeric not null check (quantity > 0),
  unit_refund numeric not null,
  refund_amount numeric not null,
  tax_amount numeric not null default 0,
  reason_id integer references public.return_reasons(id) on delete set null,
  restocked boolean not null default false,
  stock_movement_id integer references public.stock_movements(id) on delete set null,
  serial_ids integer[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_return_lines_return on public.return_lines (return_id);
create index if not exists idx_return_lines_sale_item on public.return_lines (sale_item_id);
create index if not exists idx_return_lines_org on public.return_lines (organization_id);

alter table public.return_lines enable row level security;

drop policy if exists return_lines_select_miembros on public.return_lines;
create policy return_lines_select_miembros on public.return_lines
  for select to authenticated
  using (organization_id in (
    select om.organization_id from public.organization_members om
     where om.user_id = (select auth.uid()) and om.is_active = true));

revoke all on public.return_lines from anon;
revoke insert, update, delete on public.return_lines from authenticated;
grant select on public.return_lines to authenticated;

comment on table public.return_lines is
  'Líneas de devolución con su motivo. Solo las escribe procesar_devolucion (SECURITY DEFINER).';

-- ── 3. cash_movements.return_id y su asiento ────────────────────────────────
alter table public.cash_movements add column if not exists return_id integer references public.returns(id) on delete set null;
create index if not exists idx_cash_movements_return on public.cash_movements (return_id) where return_id is not null;

comment on column public.cash_movements.return_id is
  'Devolución que originó la salida. Su asiento lo hace procesar_devolucion, no fn_auto_journal_cash_movement.';

create or replace function public.fn_auto_journal_cash_movement()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
DECLARE
    v_rule RECORD;
    v_entry_id integer;
    v_session RECORD;
    v_es_entrada boolean;
    v_importe numeric;
    v_debito text;
    v_credito text;
BEGIN
    -- La salida de una devolución la contabiliza procesar_devolucion contra la
    -- cartera de la nota crédito; con la regla genérica el ingreso se
    -- reversaba dos veces.
    IF NEW.return_id IS NOT NULL THEN
        RETURN NEW;
    END IF;

    SELECT cs.organization_id, cs.branch_id
    INTO v_session
    FROM cash_sessions cs
    WHERE cs.id = NEW.cash_session_id;

    IF v_session IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT * INTO v_rule
    FROM accounting_rules
    WHERE organization_id = v_session.organization_id
      AND source_type = 'cash_movement'
      AND event_type = 'created'
      AND is_active = true
    ORDER BY priority
    LIMIT 1;

    IF v_rule IS NULL THEN
        PERFORM fn_log_journal_failure(
            v_session.organization_id, v_session.branch_id, NEW.created_at,
            'cash_movements', NEW.id::text, 'cash_move:' || NEW.id::text,
            NULL, NULL, NEW.amount,
            'no_rule', 'Sin regla contable activa de movimiento de caja');
        RETURN NEW;
    END IF;

    v_es_entrada := COALESCE(NEW.type, 'in') IN ('in', 'deposit', 'income');
    v_importe := ABS(COALESCE(NEW.amount, 0));

    IF COALESCE(NEW.amount, 0) < 0 THEN
        v_es_entrada := NOT v_es_entrada;
    END IF;

    IF v_es_entrada THEN
        v_debito  := v_rule.debit_account_code;
        v_credito := v_rule.credit_account_code;
    ELSE
        v_debito  := v_rule.credit_account_code;
        v_credito := v_rule.debit_account_code;
    END IF;

    v_entry_id := fn_create_journal_entry(
        p_organization_id := v_session.organization_id,
        p_branch_id := v_session.branch_id,
        p_entry_date := NEW.created_at,
        p_memo := 'Mov. Caja: ' || COALESCE(NEW.type, '') || ' - ' || COALESCE(NEW.concept, ''),
        p_source := 'cash_movements',
        p_source_id := NEW.id::text,
        p_debit_account := v_debito,
        p_credit_account := v_credito,
        p_amount := v_importe,
        p_fact_key := 'cash_move:' || NEW.id::text
    );

    RETURN NEW;
END;
$function$;

-- ── 4. Entrada de stock por devolución ──────────────────────────────────────
create or replace function public.fn_stock_entrada_devolucion(
  p_organization_id integer,
  p_branch_id integer,
  p_product_id integer,
  p_qty numeric,
  p_unit_cost numeric,
  p_source_id text,
  p_note text,
  p_updated_by uuid
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sl record;
  v_costo numeric;
  v_mov integer;
begin
  if p_qty is null or p_qty <= 0 then
    raise exception 'cantidad_invalida' using errcode = '22023';
  end if;
  v_costo := public.fn_costo_unitario_producto(p_product_id, p_branch_id, p_unit_cost);
  if coalesce(p_unit_cost, 0) > 0 then
    v_costo := p_unit_cost;
  end if;

  select id, qty_on_hand into v_sl
    from public.stock_levels
   where product_id = p_product_id and branch_id = p_branch_id and lot_id is null
   order by id
   limit 1
   for update;

  if v_sl.id is null then
    insert into public.stock_levels (product_id, branch_id, lot_id, qty_on_hand, qty_reserved, avg_cost, min_level)
    values (p_product_id, p_branch_id, null, p_qty, 0, coalesce(v_costo, 0), 0);
  else
    update public.stock_levels
       set qty_on_hand = coalesce(qty_on_hand, 0) + p_qty,
           updated_at = now()
     where id = v_sl.id;
  end if;

  insert into public.stock_movements (
    organization_id, branch_id, product_id, lot_id,
    direction, qty, unit_cost, source, source_id, note, updated_by
  ) values (
    p_organization_id, p_branch_id, p_product_id, null,
    'in', p_qty, coalesce(v_costo, 0), 'return', p_source_id, p_note, p_updated_by
  )
  returning id into v_mov;

  return v_mov;
end;
$$;

comment on function public.fn_stock_entrada_devolucion(integer, integer, integer, numeric, numeric, text, text, uuid) is
  'Entrada de stock por devolución: simétrica de decrement_stock_on_sale (nivel sin lote, kardex con origen return). Solo la llama procesar_devolucion.';

revoke all on function public.fn_stock_entrada_devolucion(integer, integer, integer, numeric, numeric, text, text, uuid) from public, anon, authenticated;

-- ── 5. procesar_devolucion ──────────────────────────────────────────────────
create or replace function public.procesar_devolucion(
  p_organization_id integer,
  p_sale_id uuid,
  p_items jsonb,
  p_refund_method text,
  p_reason text,
  p_notes text default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_sale public.sales%rowtype;
  v_existente public.returns%rowtype;
  v_metodo text;
  v_modo text;
  v_item jsonb;
  v_si record;
  v_prod record;
  v_motivo record;
  v_qty numeric;
  v_devuelto numeric;
  v_serials integer[];
  v_serial record;
  v_lineas jsonb := '[]'::jsonb;
  v_linea jsonb;
  v_total numeric := 0;
  v_tax_total numeric := 0;
  v_monto numeric;
  v_impuesto numeric;
  v_reason_id integer;
  v_sesion_id integer;
  v_sesion_branch integer;
  v_return_id integer;
  v_mov_caja integer;
  v_mov_stock integer;
  v_costo numeric;
  v_factura public.invoice_sales%rowtype;
  v_nc_id uuid;
  v_nc_numero text;
  v_nc_sub numeric := 0;
  v_nc_tot numeric := 0;
  v_inv_item record;
  v_usados uuid[] := '{}';
  v_credito uuid;
  v_regla_nc record;
  v_regla_ref record;
  v_regla_caja record;
  v_cta_cartera text;
  v_cta_caja text;
  v_cta_ingreso text;
  v_concepto text;
begin
  if v_uid is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  perform public.fn_assert_acceso_org(p_organization_id);

  if p_idempotency_key is null or btrim(p_idempotency_key) = '' or length(p_idempotency_key) > 200 then
    raise exception 'clave_idempotencia_invalida' using errcode = '22023';
  end if;

  -- Idempotencia: la misma clave devuelve la devolución ya hecha. El candado
  -- evita que dos envíos simultáneos con la misma clave pasen los dos.
  perform pg_advisory_xact_lock(hashtextextended('procesar_devolucion:' || p_organization_id || ':' || p_idempotency_key, 0));
  select * into v_existente from public.returns
   where organization_id = p_organization_id and idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object(
      'return_id', v_existente.id, 'repetida', true,
      'total_refund', v_existente.total_refund, 'refund_method', v_existente.refund_method,
      'cash_movement_id', v_existente.cash_movement_id, 'cash_session_id', v_existente.cash_session_id,
      'credit_note_invoice_id', v_existente.credit_note_invoice_id,
      'customer_credit_id', v_existente.customer_credit_id,
      'nc_electronica', 'no_enviada');
  end if;

  -- Venta: de la organización, de una sucursal a la que se tiene acceso,
  -- bloqueada para que dos devoluciones de la misma venta no se crucen.
  select * into v_sale from public.sales
   where id = p_sale_id and organization_id = p_organization_id
   for update;
  if not found then
    raise exception 'venta_no_encontrada' using errcode = 'P0002';
  end if;
  if not public.app_branch_access(v_sale.branch_id) then
    raise exception 'sin_acceso_sucursal' using errcode = '42501';
  end if;
  if v_sale.status is distinct from 'paid' then
    -- Una venta a crédito o anulada no se reintegra: se abona la cartera o se anula.
    raise exception 'venta_no_pagada' using errcode = '22023';
  end if;

  -- 'original_method' no existe aún (reintegro por el medio original): como
  -- antes, se paga en efectivo. 'credit_note' es el nombre viejo del saldo a favor.
  v_metodo := case p_refund_method
    when 'cash' then 'cash'
    when 'original_method' then 'cash'
    when 'store_credit' then 'store_credit'
    when 'credit_note' then 'store_credit'
    else null end;
  if v_metodo is null then
    raise exception 'metodo_reintegro_invalido' using errcode = '22023';
  end if;
  if v_metodo = 'store_credit' and v_sale.customer_id is null then
    raise exception 'saldo_a_favor_sin_cliente' using errcode = '22023';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'motivo_obligatorio' using errcode = '22023';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'sin_lineas' using errcode = '22023';
  end if;

  -- ── Líneas: validación y montos calculados aquí (no los del navegador) ──
  for v_item in select * from jsonb_array_elements(p_items) loop
    select si.* into v_si from public.sale_items si
     where si.id = (v_item->>'sale_item_id')::uuid and si.sale_id = v_sale.id;
    if not found then
      raise exception 'linea_no_pertenece_a_la_venta' using errcode = '22023';
    end if;
    if exists (select 1 from jsonb_array_elements(v_lineas) l where (l->>'sale_item_id')::uuid = v_si.id) then
      raise exception 'linea_repetida' using errcode = '22023';
    end if;

    v_qty := (v_item->>'quantity')::numeric;
    if v_qty is null or v_qty <= 0 then
      raise exception 'cantidad_invalida' using errcode = '22023';
    end if;

    -- Ya devuelto: líneas nuevas + devoluciones anteriores (jsonb return_items).
    select coalesce(sum(rl.quantity), 0) into v_devuelto
      from public.return_lines rl
      join public.returns r on r.id = rl.return_id
     where rl.sale_item_id = v_si.id and r.status = 'processed';
    v_devuelto := v_devuelto + coalesce((
      select sum(coalesce((ri->>'return_quantity')::numeric, 0))
        from public.returns r, jsonb_array_elements(coalesce(r.return_items, '[]'::jsonb)) ri
       where r.sale_id = v_sale.id and r.status = 'processed'
         and not exists (select 1 from public.return_lines x where x.return_id = r.id)
         and coalesce(ri->>'id', ri->>'sale_item_id') = v_si.id::text), 0);
    if v_qty > coalesce(v_si.quantity, 0) - v_devuelto then
      raise exception 'cantidad_excede_disponible' using errcode = '22023',
        detail = format('Línea %s: vendidas %s, ya devueltas %s, pedidas %s', v_si.id, v_si.quantity, v_devuelto, v_qty);
    end if;

    -- Motivo del catálogo de la organización (por id o por código).
    select rr.id, rr.affects_inventory into v_motivo from public.return_reasons rr
     where rr.organization_id = p_organization_id and rr.is_active
       and (rr.id = nullif(v_item->>'reason_id', '')::integer
            or upper(rr.code) = upper(nullif(btrim(v_item->>'reason_code'), '')))
     limit 1;
    if not found then
      raise exception 'motivo_invalido' using errcode = '22023';
    end if;
    v_reason_id := coalesce(v_reason_id, v_motivo.id);

    select p.id, p.name, p.track_stock, p.track_serial into v_prod from public.products p
     where p.id = v_si.product_id;

    v_serials := array(select x::integer from jsonb_array_elements_text(coalesce(v_item->'serial_ids', '[]'::jsonb)) x);
    if coalesce(v_prod.track_serial, false) then
      if cardinality(v_serials) <> v_qty then
        raise exception 'seriales_no_coinciden' using errcode = '22023';
      end if;
      for v_serial in select sn.* from public.serial_numbers sn where sn.id = any(v_serials) loop
        if v_serial.organization_id <> p_organization_id or v_serial.product_id <> v_si.product_id
           or v_serial.status <> 'sold'
           or (v_serial.sale_id is not null and v_serial.sale_id <> v_sale.id::text) then
          raise exception 'serial_invalido' using errcode = '22023', detail = format('Serial %s', v_serial.id);
        end if;
      end loop;
      if (select count(*) from public.serial_numbers sn where sn.id = any(v_serials)) <> cardinality(v_serials) then
        raise exception 'serial_invalido' using errcode = '22023';
      end if;
    elsif cardinality(v_serials) > 0 then
      raise exception 'serial_invalido' using errcode = '22023';
    end if;

    -- Monto: el total cobrado de la línea (con impuesto y descuento de línea)
    -- prorrateado por cantidad.
    v_monto := round(coalesce(v_si.total, 0) / nullif(v_si.quantity, 0) * v_qty, 2);
    v_impuesto := round(coalesce(v_si.tax_amount, 0) / nullif(v_si.quantity, 0) * v_qty, 2);
    v_total := v_total + v_monto;
    v_tax_total := v_tax_total + v_impuesto;

    v_lineas := v_lineas || jsonb_build_object(
      'sale_item_id', v_si.id, 'product_id', v_si.product_id, 'product_name', v_prod.name,
      'quantity', v_qty, 'sold_quantity', v_si.quantity,
      'unit_price', v_si.unit_price, 'tax_rate', coalesce(v_si.tax_rate, 0),
      'discount_amount', coalesce(v_si.discount_amount, 0),
      'unit_refund', round(coalesce(v_si.total, 0) / nullif(v_si.quantity, 0), 2),
      'refund_amount', v_monto, 'tax_amount', v_impuesto,
      'reason_id', v_motivo.id, 'reason_code', v_item->>'reason_code',
      'affects_inventory', v_motivo.affects_inventory,
      'track_stock', coalesce(v_prod.track_stock, false),
      'serial_ids', to_jsonb(v_serials));
  end loop;

  if v_total <= 0 then
    raise exception 'monto_invalido' using errcode = '22023';
  end if;

  -- ── Caja: la abierta que corresponde (modo de la organización) ──
  if v_metodo = 'cash' then
    v_modo := coalesce(
      (select os.settings->>'mode' from public.organization_settings os
        where os.organization_id = p_organization_id and os.key = 'pos_cash_session_mode'),
      'branch');
    if v_modo = 'user' then
      select cs.id, cs.branch_id into v_sesion_id, v_sesion_branch from public.cash_sessions cs
       where cs.organization_id = p_organization_id and cs.status = 'open'
         and cs.branch_id = v_sale.branch_id and cs.opened_by = v_uid
       order by cs.opened_at desc limit 1;
    else
      select cs.id, cs.branch_id into v_sesion_id, v_sesion_branch from public.cash_sessions cs
       where cs.organization_id = p_organization_id and cs.status = 'open'
         and (cs.branch_id = v_sale.branch_id or cs.branch_id is null)
       order by (cs.branch_id is null), cs.opened_at desc limit 1;
    end if;
    if v_sesion_id is null then
      -- Decisión del dueño (2026-09-23): efectivo sin caja abierta se bloquea.
      raise exception 'efectivo_sin_caja' using errcode = '22023',
        hint = 'Abra la caja o reintegre como saldo a favor del cliente.';
    end if;
  end if;

  -- ── Devolución y líneas ──
  insert into public.returns (
    organization_id, branch_id, sale_id, user_id, total_refund, reason, reason_id,
    status, return_items, refund_method, cash_session_id, idempotency_key, notes
  ) values (
    p_organization_id, v_sale.branch_id, v_sale.id, v_uid, v_total, btrim(p_reason), v_reason_id,
    'processed',
    (select jsonb_agg(jsonb_build_object(
        'id', l->>'sale_item_id', 'product_id', (l->>'product_id')::integer,
        'return_quantity', (l->>'quantity')::numeric, 'refund_amount', (l->>'refund_amount')::numeric,
        'reason', l->>'reason_code', 'reason_id', (l->>'reason_id')::integer))
       from jsonb_array_elements(v_lineas) l),
    v_metodo, v_sesion_id, p_idempotency_key, nullif(btrim(coalesce(p_notes, '')), '')
  )
  returning id into v_return_id;

  for v_linea in select * from jsonb_array_elements(v_lineas) loop
    v_mov_stock := null;
    -- Stock por kardex: solo si el producto lleva stock y el motivo lo repone.
    if (v_linea->>'track_stock')::boolean and (v_linea->>'affects_inventory')::boolean then
      select sm.unit_cost into v_costo from public.stock_movements sm
       where sm.organization_id = p_organization_id
         and sm.source in ('sale', 'mesa_sale', 'invoice_sale', 'web_sale')
         and sm.source_id = v_sale.id::text
         and sm.product_id = (v_linea->>'product_id')::integer
         and sm.direction = 'out'
       order by sm.id limit 1;
      v_mov_stock := public.fn_stock_entrada_devolucion(
        p_organization_id, v_sale.branch_id, (v_linea->>'product_id')::integer,
        (v_linea->>'quantity')::numeric, v_costo, v_return_id::text,
        'Devolución de la venta ' || v_sale.id::text, v_uid);
    end if;

    -- Seriales: vuelven a stock si el motivo repone; si no, quedan «returned».
    if jsonb_array_length(v_linea->'serial_ids') > 0 then
      for v_serial in
        select sn.* from public.serial_numbers sn
         where sn.id = any(array(select x::integer from jsonb_array_elements_text(v_linea->'serial_ids') x))
      loop
        update public.serial_numbers set
          status = case when (v_linea->>'affects_inventory')::boolean then 'in_stock' else 'returned' end,
          sold_to_customer_id = null, sold_by_user_id = null, sale_id = null,
          web_order_id = null, invoice_sale_id = null,
          sale_channel = 'in_stock', sale_date = null,
          current_branch_id = v_sale.branch_id,
          updated_at = now(), updated_by = v_uid
        where id = v_serial.id;
        insert into public.serial_tracking_events (
          serial_number_id, organization_id, event_type, from_status, to_status,
          from_branch_id, to_branch_id, source_table, source_id, sale_id, customer_id, performed_by, notes
        ) values (
          v_serial.id, p_organization_id, 'returned', v_serial.status,
          case when (v_linea->>'affects_inventory')::boolean then 'in_stock' else 'returned' end,
          v_serial.current_branch_id, v_sale.branch_id, 'returns', v_return_id::text, v_sale.id,
          v_sale.customer_id, v_uid, btrim(p_reason)
        );
      end loop;
    end if;

    insert into public.return_lines (
      organization_id, return_id, sale_item_id, product_id, quantity, unit_refund,
      refund_amount, tax_amount, reason_id, restocked, stock_movement_id, serial_ids
    ) values (
      p_organization_id, v_return_id, (v_linea->>'sale_item_id')::uuid, (v_linea->>'product_id')::integer,
      (v_linea->>'quantity')::numeric, (v_linea->>'unit_refund')::numeric,
      (v_linea->>'refund_amount')::numeric, (v_linea->>'tax_amount')::numeric,
      (v_linea->>'reason_id')::integer, v_mov_stock is not null, v_mov_stock,
      array(select x::integer from jsonb_array_elements_text(v_linea->'serial_ids') x)
    );
  end loop;

  -- ── Nota crédito contable (si la venta tiene factura), como las existentes:
  --    totales negativos, saldo 0, estado issued, ligada a la factura original.
  select * into v_factura from public.invoice_sales
   where sale_id = v_sale.id and organization_id = p_organization_id
     and coalesce(document_type, 'invoice') = 'invoice'
   order by created_at limit 1;
  if found then
    -- Numeración: la resolución de notas crédito de la sede si existe; si no,
    -- NC-#### como CreditNoteNumberService (con candado por organización).
    begin
      select n.invoice_number into v_nc_numero
        from public.fn_get_next_invoice_number(p_organization_id, v_factura.branch_id, 'credit_note') n;
    exception when others then
      v_nc_numero := null;
    end;
    if v_nc_numero is null then
      perform pg_advisory_xact_lock(hashtextextended('numero_nota_credito:' || p_organization_id, 0));
      select 'NC-' || lpad((coalesce(max(nullif(regexp_replace(regexp_replace(i.number, '^NC-?', '', 'i'), '\D', '', 'g'), '')::bigint), 0) + 1)::text, 4, '0')
        into v_nc_numero
        from public.invoice_sales i
       where i.organization_id = p_organization_id and i.document_type = 'credit_note'
         and i.number ~* '^NC-?\d+$';
    end if;

    -- Líneas de la NC: revierten lo facturado de cada producto, prorrateado.
    for v_linea in select * from jsonb_array_elements(v_lineas) loop
      select ii.* into v_inv_item from public.invoice_items ii
       where coalesce(ii.invoice_sales_id, ii.invoice_id) = v_factura.id
         and ii.product_id is not distinct from (v_linea->>'product_id')::integer
         and not (ii.id = any(v_usados))
         and coalesce(ii.qty, 0) > 0
       order by ii.created_at, ii.id limit 1;
      if found then
        v_usados := v_usados || v_inv_item.id;
        v_linea := v_linea || jsonb_build_object(
          'nc_qty', -((v_linea->>'quantity')::numeric),
          'nc_unit_price', v_inv_item.unit_price,
          'nc_discount', -round(coalesce(v_inv_item.discount_amount, 0) * (v_linea->>'quantity')::numeric / v_inv_item.qty, 2),
          'nc_total_line', -round(coalesce(v_inv_item.total_line, 0) * (v_linea->>'quantity')::numeric / v_inv_item.qty, 2),
          'nc_tax_rate', coalesce(v_inv_item.tax_rate, 0), 'nc_tax_code', v_inv_item.tax_code,
          'nc_tax_included', coalesce(v_inv_item.tax_included, v_factura.tax_included),
          'nc_description', coalesce(v_inv_item.description, v_linea->>'product_name', 'Devolución'));
      else
        v_linea := v_linea || jsonb_build_object(
          'nc_qty', -((v_linea->>'quantity')::numeric),
          'nc_unit_price', (v_linea->>'unit_price')::numeric,
          'nc_discount', -round((v_linea->>'discount_amount')::numeric * (v_linea->>'quantity')::numeric / nullif((v_linea->>'sold_quantity')::numeric, 0), 2),
          'nc_total_line', -((v_linea->>'refund_amount')::numeric),
          'nc_tax_rate', (v_linea->>'tax_rate')::numeric, 'nc_tax_code', null,
          'nc_tax_included', v_factura.tax_included,
          'nc_description', coalesce(v_linea->>'product_name', 'Devolución'));
      end if;
      -- Misma regla de base que fn_recalc_invoice_totals.
      v_nc_tot := v_nc_tot + (v_linea->>'nc_total_line')::numeric;
      v_nc_sub := v_nc_sub + case
        when coalesce(v_factura.tax_included, false) and (v_linea->>'nc_tax_rate')::numeric > 0
          then round(((v_linea->>'nc_qty')::numeric * (v_linea->>'nc_unit_price')::numeric
                      - coalesce((v_linea->>'nc_discount')::numeric, 0)) / (1 + (v_linea->>'nc_tax_rate')::numeric / 100), 2)
        when coalesce(v_factura.tax_included, false)
          then (v_linea->>'nc_qty')::numeric * (v_linea->>'nc_unit_price')::numeric - coalesce((v_linea->>'nc_discount')::numeric, 0)
        else (v_linea->>'nc_qty')::numeric * (v_linea->>'nc_unit_price')::numeric - coalesce((v_linea->>'nc_discount')::numeric, 0)
      end;
      v_lineas := (select jsonb_agg(case when (e->>'sale_item_id') = (v_linea->>'sale_item_id') then v_linea else e end)
                     from jsonb_array_elements(v_lineas) e);
    end loop;

    insert into public.invoice_sales (
      organization_id, branch_id, customer_id, sale_id, number, issue_date, due_date,
      currency, subtotal, tax_total, total, balance, status, document_type,
      related_invoice_id, tax_included, payment_method, description, created_by
    ) values (
      p_organization_id, v_factura.branch_id, v_factura.customer_id, v_sale.id, v_nc_numero, now(), now(),
      v_factura.currency, v_nc_sub, least(v_nc_tot - v_nc_sub, 0), v_nc_tot, 0, 'issued', 'credit_note',
      v_factura.id, v_factura.tax_included, v_factura.payment_method,
      'Nota crédito por devolución ' || v_return_id || ' - ' || btrim(p_reason), v_uid
    )
    returning id into v_nc_id;

    insert into public.invoice_items (
      invoice_id, invoice_sales_id, invoice_type, product_id, description, qty, unit_price,
      total_line, tax_rate, tax_code, discount_amount, tax_included, serial_ids
    )
    select v_nc_id, v_nc_id, 'sale', (l->>'product_id')::integer, l->>'nc_description',
           (l->>'nc_qty')::numeric, (l->>'nc_unit_price')::numeric, (l->>'nc_total_line')::numeric,
           (l->>'nc_tax_rate')::numeric, l->>'nc_tax_code', coalesce((l->>'nc_discount')::numeric, 0),
           coalesce((l->>'nc_tax_included')::boolean, false),
           array(select x::integer from jsonb_array_elements_text(l->'serial_ids') x)
      from jsonb_array_elements(v_lineas) l;
  end if;

  -- ── Reintegro ──
  -- Cuentas: la cartera que acredita la NC (regla sale_credit_note), la caja
  -- de los movimientos (regla cash_movement) y el ingreso que reversa una
  -- devolución sin factura (regla refund).
  select * into v_regla_nc from public.accounting_rules
   where organization_id = p_organization_id and source_type = 'sale_credit_note' and event_type = 'created' and is_active
   order by priority limit 1;
  select * into v_regla_caja from public.accounting_rules
   where organization_id = p_organization_id and source_type = 'cash_movement' and event_type = 'created' and is_active
   order by priority limit 1;
  select * into v_regla_ref from public.accounting_rules
   where organization_id = p_organization_id and source_type = 'refund' and is_active
   order by (event_type = 'refunded') desc, priority limit 1;
  v_cta_cartera := v_regla_nc.credit_account_code;
  -- Sin regla de movimientos de caja, la caja es la cuenta que acredita la regla de reintegro.
  v_cta_caja := coalesce(v_regla_caja.debit_account_code, v_regla_ref.credit_account_code);
  v_cta_ingreso := v_regla_ref.debit_account_code;
  v_concepto := 'Devolución ' || v_return_id || ' de la venta ' || left(v_sale.id::text, 8);

  if v_metodo = 'cash' then
    insert into public.cash_movements (
      organization_id, cash_session_id, branch_id, type, concept, amount, user_id, notes, return_id
    ) values (
      p_organization_id, v_sesion_id, coalesce(v_sesion_branch, v_sale.branch_id), 'out', v_concepto, v_total, v_uid,
      nullif(btrim(coalesce(p_notes, '')), ''), v_return_id
    )
    returning id into v_mov_caja;

    -- Con NC: la NC ya reversó ingreso e IVA contra la cartera; el reintegro
    -- paga esa cartera con la caja. Sin NC: reversa el ingreso contra la caja.
    if coalesce(case when v_nc_id is not null then v_cta_cartera else v_cta_ingreso end, '') = '' or coalesce(v_cta_caja, '') = '' then
      perform public.fn_log_journal_failure(
        p_organization_id, v_sale.branch_id, now(), 'returns', v_return_id::text,
        'return_refund:' || v_return_id, null, null, v_total, 'no_rule',
        'Sin regla contable para el reintegro en efectivo de la devolución');
    else
      perform public.fn_create_journal_entry(
        p_organization_id := p_organization_id,
        p_branch_id := v_sale.branch_id,
        p_entry_date := now(),
        p_memo := 'Reintegro en efectivo - ' || v_concepto,
        p_source := 'returns',
        p_source_id := v_return_id::text,
        p_debit_account := case when v_nc_id is not null then v_cta_cartera else v_cta_ingreso end,
        p_credit_account := v_cta_caja,
        p_amount := v_total,
        p_created_by := v_uid,
        p_fact_key := 'return_refund:' || v_return_id
      );
    end if;
  else
    -- Saldo a favor: Dr cartera de la NC (o ingreso si no hay NC) / Cr 2805.
    v_credito := public.fn_create_customer_credit(
      p_organization_id, v_sale.customer_id, v_total,
      coalesce(case when v_nc_id is not null then v_cta_cartera else v_cta_ingreso end, '1305'),
      v_sale.branch_id, 'Saldo a favor por ' || v_concepto, null, v_uid);
    update public.credit_notes set source_credit_note_id = v_nc_id where id = v_credito and v_nc_id is not null;
  end if;

  update public.returns set
    cash_movement_id = v_mov_caja,
    customer_credit_id = v_credito,
    credit_note_invoice_id = v_nc_id
  where id = v_return_id;

  return jsonb_build_object(
    'return_id', v_return_id, 'repetida', false,
    'total_refund', v_total, 'tax_refund', v_tax_total, 'refund_method', v_metodo,
    'cash_movement_id', v_mov_caja, 'cash_session_id', v_sesion_id,
    'credit_note_invoice_id', v_nc_id, 'credit_note_number', v_nc_numero,
    'customer_credit_id', v_credito,
    'nc_electronica', 'no_enviada',
    'lines', (select jsonb_agg(jsonb_build_object(
                'sale_item_id', l->>'sale_item_id', 'quantity', (l->>'quantity')::numeric,
                'refund_amount', (l->>'refund_amount')::numeric))
              from jsonb_array_elements(v_lineas) l)
  );
end;
$$;

comment on function public.procesar_devolucion(integer, uuid, jsonb, text, text, text, text) is
  'Devolución del POS en una transacción: líneas con motivo, stock por kardex (seriales incluidos), salida de la caja abierta (o bloqueo), saldo a favor y nota crédito contable. Idempotente por p_idempotency_key. La NC electrónica no se envía aún.';

revoke all on function public.procesar_devolucion(integer, uuid, jsonb, text, text, text, text) from public, anon;
grant execute on function public.procesar_devolucion(integer, uuid, jsonb, text, text, text, text) to authenticated, service_role;

-- ── 6. pos_caja_esperado: devoluciones sin doble resta ──────────────────────
create or replace function public.pos_caja_esperado(p_session_id integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  s public.cash_sessions%rowtype;
  v_hasta timestamptz;
  v_por_cajero boolean;
  v_ventas_ef numeric := 0;
  v_vuelto numeric := 0;
  v_abonos_ef numeric := 0;
  v_compras_ef numeric := 0;
  v_devoluciones numeric := 0;
  v_entradas numeric := 0;
  v_salidas numeric := 0;
  v_efectivo numeric := 0;
  v_por_metodo jsonb := '{}'::jsonb;
begin
  select * into s from public.cash_sessions where id = p_session_id;
  if not found then
    raise exception 'La caja no existe' using errcode = 'P0002';
  end if;
  perform public.fn_assert_acceso_org(s.organization_id);
  if auth.uid() is not null and not public.app_branch_access(s.branch_id) then
    raise exception 'Acceso denegado a la sucursal' using errcode = '42501';
  end if;

  v_hasta := coalesce(s.closed_at, now());
  v_por_cajero := coalesce(
    (select os.settings->>'mode' from public.organization_settings os
      where os.organization_id = s.organization_id and os.key = 'pos_cash_session_mode'),
    'branch') = 'user';

  with p as (
    select coalesce(pay.method, 'other') as metodo,
           coalesce(pay.amount, 0) as monto,
           coalesce(pay.change_amount, 0) as vuelto,
           coalesce(pay.source, '') as origen
      from public.payments pay
     where pay.organization_id = s.organization_id
       and pay.status = 'completed'
       and pay.created_at >= s.opened_at
       and pay.created_at <= v_hasta
       and (s.branch_id is null or pay.branch_id = s.branch_id)
       and (not v_por_cajero or pay.created_by = s.opened_by)
  )
  select
    coalesce(sum(monto)  filter (where metodo = 'cash' and origen not in ('invoice_purchase', 'account_payable', 'account_receivable')), 0),
    coalesce(sum(vuelto) filter (where metodo = 'cash' and origen not in ('invoice_purchase', 'account_payable', 'account_receivable')), 0),
    coalesce(sum(monto)  filter (where metodo = 'cash' and origen = 'account_receivable'), 0),
    coalesce(sum(monto)  filter (where metodo = 'cash' and origen in ('invoice_purchase', 'account_payable')), 0),
    coalesce(
      (select jsonb_object_agg(x.metodo, x.total)
         from (select metodo, sum(monto) as total from p
                where metodo <> 'cash' and origen not in ('invoice_purchase', 'account_payable')
                group by metodo) x),
      '{}'::jsonb)
    into v_ventas_ef, v_vuelto, v_abonos_ef, v_compras_ef, v_por_metodo
    from p;

  -- Devoluciones heredadas (anteriores a procesar_devolucion): se restan como
  -- antes. Las nuevas en efectivo ya son una salida en cash_movements y las de
  -- saldo a favor no sacan efectivo.
  select coalesce(sum(r.total_refund), 0) into v_devoluciones
    from public.returns r
   where r.organization_id = s.organization_id
     and r.status = 'processed'
     and r.refund_method is null
     and r.created_at >= s.opened_at
     and r.created_at <= v_hasta
     and (s.branch_id is null or r.branch_id = s.branch_id)
     and (not v_por_cajero or r.user_id = s.opened_by);

  select coalesce(sum(m.amount) filter (where m.type = 'in'), 0),
         coalesce(sum(m.amount) filter (where m.type = 'out'), 0)
    into v_entradas, v_salidas
    from public.cash_movements m
   where m.cash_session_id = s.id;

  v_efectivo := coalesce(s.initial_amount, 0)
              + (v_ventas_ef - v_vuelto)
              + v_abonos_ef
              + v_entradas - v_salidas
              - v_compras_ef
              - v_devoluciones;

  return jsonb_build_object(
    'session_id', s.id,
    'organization_id', s.organization_id,
    'status', s.status,
    'efectivo_esperado', round(v_efectivo, 2),
    'por_metodo', v_por_metodo || jsonb_build_object('cash', round(v_efectivo, 2)),
    'detalle', jsonb_build_object(
      'inicial', coalesce(s.initial_amount, 0),
      'ventas_efectivo', v_ventas_ef - v_vuelto,
      'vuelto', v_vuelto,
      'abonos_efectivo', v_abonos_ef,
      'entradas', v_entradas,
      'salidas', v_salidas,
      'compras_efectivo', v_compras_ef,
      'devoluciones', v_devoluciones
    ),
    'por_cajero', v_por_cajero,
    'hasta', v_hasta
  );
end;
$$;
