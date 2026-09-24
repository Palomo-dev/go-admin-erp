-- ============================================================================
-- Compras F1.1 + F1.2 + F1.5 — un solo «pagado», un solo escritor de la CxP,
-- retenciones y recepción de la factura de compra.
-- Plan: docs/implementacion/FACTURAS-COMPRA-CXP-PLAN.md (§4 F1).
--
-- 1. `invoice_purchase.stock_received_at` (NULL-able): cuándo entró la mercancía
--    al kardex. NULL = por recibir. No se rellena para las facturas viejas (el
--    dueño revisa los datos históricos con su contador, §5.3).
-- 2. `invoice_purchase_withholdings`: retenciones de la compra. Solo SELECT para
--    el cliente; las escribe `fn_factura_compra_guardar` (SECURITY DEFINER).
-- 3. `fn_invoice_purchase_paid(uuid)`: pagos `completed` de los dos orígenes
--    (`invoice_purchase` y `account_payable`), con `discount_amount` sumando en
--    los dos (D5: un descuento por pronto pago reduce la deuda). Antes la CxP lo
--    sumaba y la factura no.
--    `fn_invoice_purchase_neto(uuid)`: total − retenciones (D4: la CxP y el
--    saldo de la factura son por el neto a pagar).
-- 4. `fn_recalc_invoice_totals` (rama de compra), `fn_recalc_invoice_balance_from_payments`
--    (rama de compra) y `fn_recalc_accounts_payable_from_payments` usan esas dos
--    funciones. La rama de VENTA se copia sin cambios (riesgo R1).
--    La rama de compra respeta ahora `tax_included` de la cabecera igual que la
--    de venta (base por línea redondeada; F-51): antes, con IVA incluido, el
--    subtotal era el bruto y el impuesto quedaba en 0.
-- 5. Índice único parcial `accounts_payable(invoice_id)`: una CxP por factura.
--    Verificado justo antes de aplicar: 0 duplicados.
-- 6. `fn_cxp_asegurar_de_factura(uuid)`: el ÚNICO escritor de la CxP de una
--    factura. Borrador → nada (D2: un borrador no es deuda); anulada → CxP
--    `void` con saldo 0; confirmada → crea o sincroniza monto (neto), vencimiento,
--    proveedor y sucursal, y recalcula saldo y estado. Lo llama el disparador
--    `trg_cxp_desde_factura` cuando cambia total, vencimiento, estado o
--    proveedor, así que cualquier camino que confirme una factura deja su CxP.
-- 7. `fn_cxp_recalcular(uuid)`: saldo y estado de una CxP desde los pagos. Un
--    pago anulado que deja el pagado en 0 devuelve la CxP a `pending` (antes se
--    quedaba en `partial`). Una CxP `void` se queda `void` con saldo 0.
--
-- Funciones internas (`fn_invoice_purchase_paid`, `_neto`, `fn_cxp_*`): sin
-- EXECUTE para anon ni authenticated; solo las llaman funciones y disparadores
-- del dueño.
-- ============================================================================

-- ── 1. Columna de recepción ────────────────────────────────────────────────
alter table public.invoice_purchase
  add column if not exists stock_received_at timestamptz null;

comment on column public.invoice_purchase.stock_received_at is
  'Momento en que la mercancía de la factura entró al inventario por kardex. NULL = por recibir (o factura sin productos). Lo escribe fn_factura_compra_recepcionar.';

-- ── 2. Retenciones ─────────────────────────────────────────────────────────
create table if not exists public.invoice_purchase_withholdings (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  invoice_id uuid not null references public.invoice_purchase(id) on delete cascade,
  concept text not null,
  base numeric not null default 0 check (base >= 0),
  rate numeric not null default 0 check (rate >= 0 and rate <= 100),
  amount numeric not null default 0 check (amount >= 0),
  tax_code text null,
  created_at timestamptz not null default now()
);

comment on table public.invoice_purchase_withholdings is
  'Retenciones practicadas en una factura de compra (retefuente, reteIVA, reteICA). La CxP es por el neto: total − Σ amount (D4). Solo las escribe fn_factura_compra_guardar.';

create index if not exists idx_invoice_purchase_withholdings_invoice
  on public.invoice_purchase_withholdings (invoice_id);
create index if not exists idx_invoice_purchase_withholdings_org
  on public.invoice_purchase_withholdings (organization_id);

alter table public.invoice_purchase_withholdings enable row level security;

drop policy if exists invoice_purchase_withholdings_select on public.invoice_purchase_withholdings;
create policy invoice_purchase_withholdings_select on public.invoice_purchase_withholdings
  for select to authenticated
  using (
    organization_id in (
      select om.organization_id from public.organization_members om
       where om.user_id = (select auth.uid()) and om.is_active
    )
    -- La factura visible para el usuario (hereda la restricción por sucursal).
    and invoice_id in (select ip.id from public.invoice_purchase ip)
  );

revoke all on table public.invoice_purchase_withholdings from anon, public;
revoke insert, update, delete on table public.invoice_purchase_withholdings from authenticated;
grant select on table public.invoice_purchase_withholdings to authenticated;

-- ── 3. Pagado y neto ───────────────────────────────────────────────────────
create or replace function public.fn_invoice_purchase_paid(p_invoice_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(sum(p.amount + coalesce(p.discount_amount, 0)), 0)
    from public.payments p
   where p.status = 'completed'
     and (
       (p.source = 'invoice_purchase' and p.source_id = p_invoice_id::text)
       or (p.source = 'account_payable' and p.source_id in (
             select ap.id::text from public.accounts_payable ap where ap.invoice_id = p_invoice_id))
     );
$$;

comment on function public.fn_invoice_purchase_paid(uuid) is
  'Pagado de una factura de compra: pagos completed de los dos orígenes (invoice_purchase y account_payable), amount + discount_amount (D5). Interna.';

create or replace function public.fn_invoice_purchase_neto(p_invoice_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select greatest(
           coalesce(ip.total, 0)
           - coalesce((select sum(w.amount) from public.invoice_purchase_withholdings w where w.invoice_id = ip.id), 0),
           0)
    from public.invoice_purchase ip
   where ip.id = p_invoice_id;
$$;

comment on function public.fn_invoice_purchase_neto(uuid) is
  'Neto a pagar de una factura de compra: total − retenciones (D4). Interna.';

revoke all on function public.fn_invoice_purchase_paid(uuid) from public, anon, authenticated;
revoke all on function public.fn_invoice_purchase_neto(uuid) from public, anon, authenticated;

-- ── 7. Recalcular una CxP ──────────────────────────────────────────────────
create or replace function public.fn_cxp_recalcular(p_ap_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ap public.accounts_payable%rowtype;
  v_pagado numeric;
  v_saldo numeric;
  v_estado text;
begin
  select * into v_ap from public.accounts_payable where id = p_ap_id;
  if not found then
    return;
  end if;

  if v_ap.status = 'void' then
    update public.accounts_payable
       set balance = 0, updated_at = now()
     where id = p_ap_id and balance is distinct from 0;
    return;
  end if;

  if v_ap.invoice_id is not null then
    v_pagado := public.fn_invoice_purchase_paid(v_ap.invoice_id);
  else
    select coalesce(sum(p.amount + coalesce(p.discount_amount, 0)), 0) into v_pagado
      from public.payments p
     where p.status = 'completed' and p.source = 'account_payable' and p.source_id = v_ap.id::text;
  end if;

  v_saldo := greatest(coalesce(v_ap.amount, 0) - v_pagado, 0);

  v_estado := case
    when v_pagado > 0 and v_saldo <= 0 then 'paid'
    when v_pagado > 0 then 'partial'
    when coalesce(v_ap.status, 'pending') in ('partial', 'paid') then 'pending'
    else coalesce(v_ap.status, 'pending')
  end;

  update public.accounts_payable
     set balance = v_saldo,
         status = v_estado,
         updated_at = now()
   where id = p_ap_id
     and (balance is distinct from v_saldo or status is distinct from v_estado);
end;
$$;

revoke all on function public.fn_cxp_recalcular(uuid) from public, anon, authenticated;

-- ── 4a. Disparador de pagos → CxP ─────────────────────────────────────────
create or replace function public.fn_recalc_accounts_payable_from_payments()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  v_ap_id uuid;
begin
  for r in
    select distinct src, sid
      from (values
        (case when tg_op <> 'DELETE' then new.source end,
         case when tg_op <> 'DELETE' then new.source_id end),
        (case when tg_op <> 'INSERT' then old.source end,
         case when tg_op <> 'INSERT' then old.source_id end)
      ) as t(src, sid)
     where src in ('invoice_purchase', 'account_payable')
       and sid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  loop
    if r.src = 'invoice_purchase' then
      select id into v_ap_id from public.accounts_payable where invoice_id = r.sid::uuid limit 1;
    else
      v_ap_id := r.sid::uuid;
    end if;

    continue when v_ap_id is null;
    perform public.fn_cxp_recalcular(v_ap_id);
  end loop;

  return null;
end;
$$;

-- ── 4b. Disparador de pagos → saldo de la factura ─────────────────────────
-- Rama de venta: IDÉNTICA a la versión anterior.
create or replace function public.fn_recalc_invoice_balance_from_payments()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
DECLARE
  r RECORD;
  v_invoice_id uuid;
  v_paid numeric;
  v_total numeric;
  v_balance numeric;
  v_status text;
  v_new_status text;
BEGIN
  FOR r IN
    SELECT DISTINCT src, sid
    FROM (VALUES
      (CASE WHEN TG_OP <> 'DELETE' THEN NEW.source END,
       CASE WHEN TG_OP <> 'DELETE' THEN NEW.source_id END),
      (CASE WHEN TG_OP <> 'INSERT' THEN OLD.source END,
       CASE WHEN TG_OP <> 'INSERT' THEN OLD.source_id END)
    ) AS t(src, sid)
    WHERE src IN ('invoice_sales', 'invoice_purchase', 'sale', 'account_payable')
      AND sid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  LOOP
    IF r.src IN ('invoice_purchase', 'account_payable') THEN
      IF r.src = 'invoice_purchase' THEN
        v_invoice_id := r.sid::uuid;
      ELSE
        SELECT invoice_id INTO v_invoice_id FROM accounts_payable WHERE id = r.sid::uuid;
      END IF;

      CONTINUE WHEN v_invoice_id IS NULL;

      SELECT total, status INTO v_total, v_status
      FROM invoice_purchase WHERE id = v_invoice_id;

      CONTINUE WHEN v_total IS NULL;
      CONTINUE WHEN v_status IN ('draft', 'void', 'voided');

      -- Compras: neto a pagar (total − retenciones) − pagado (dos orígenes, con descuento).
      v_balance := GREATEST(fn_invoice_purchase_neto(v_invoice_id) - fn_invoice_purchase_paid(v_invoice_id), 0);

      UPDATE invoice_purchase
      SET balance = v_balance, updated_at = NOW()
      WHERE id = v_invoice_id AND balance IS DISTINCT FROM v_balance;

      CONTINUE;
    END IF;

    IF r.src = 'invoice_sales' THEN
      v_invoice_id := r.sid::uuid;
    ELSE
      SELECT id INTO v_invoice_id FROM invoice_sales WHERE sale_id = r.sid::uuid LIMIT 1;
    END IF;

    CONTINUE WHEN v_invoice_id IS NULL;

    SELECT total, status INTO v_total, v_status
    FROM invoice_sales WHERE id = v_invoice_id;

    CONTINUE WHEN v_total IS NULL;
    CONTINUE WHEN v_status IN ('draft', 'void', 'voided');

    v_paid := fn_invoice_sales_paid(v_invoice_id);
    v_balance := GREATEST(v_total - v_paid, 0);

    v_new_status := v_status;
    IF v_paid > 0 THEN
      v_new_status := CASE WHEN v_balance = 0 THEN 'paid' ELSE 'partial' END;
    END IF;

    UPDATE invoice_sales
    SET balance = v_balance,
        status = v_new_status,
        updated_at = NOW()
    WHERE id = v_invoice_id
      AND (balance IS DISTINCT FROM v_balance OR status IS DISTINCT FROM v_new_status);
  END LOOP;

  RETURN NULL;
END;
$$;

-- ── 4c. Disparador de líneas → totales ─────────────────────────────────────
-- Rama de venta: IDÉNTICA a la versión anterior.
create or replace function public.fn_recalc_invoice_totals()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
DECLARE
  v_sales_id uuid;
  v_purchase_id uuid;
  v_subtotal numeric;
  v_total numeric;
  v_tax numeric;
  v_paid numeric;
  v_new_balance numeric;
  v_status text;
  v_tax_included boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_sales_id := COALESCE(OLD.invoice_sales_id, CASE WHEN OLD.invoice_type = 'sale' THEN OLD.invoice_id END);
    v_purchase_id := COALESCE(OLD.invoice_purchase_id, CASE WHEN OLD.invoice_type = 'purchase' THEN OLD.invoice_id END);
  ELSE
    v_sales_id := COALESCE(NEW.invoice_sales_id, CASE WHEN NEW.invoice_type = 'sale' THEN NEW.invoice_id END);
    -- F-44: era OLD.invoice_id; en un INSERT OLD es NULL y la compra no se recalculaba.
    v_purchase_id := COALESCE(NEW.invoice_purchase_id, CASE WHEN NEW.invoice_type = 'purchase' THEN NEW.invoice_id END);
  END IF;

  IF v_sales_id IS NOT NULL THEN
    SELECT tax_included INTO v_tax_included FROM invoice_sales WHERE id = v_sales_id;

    IF v_tax_included THEN
      -- Impuesto incluido: total_line es el bruto. La base de cada línea se
      -- redondea a centavos y el impuesto sale por resta (F-51: una sola regla,
      -- la misma que splitGrossLine en taxResolver.ts).
      SELECT
        COALESCE(SUM(
          CASE
            WHEN tax_rate > 0 THEN ROUND((qty * unit_price - COALESCE(discount_amount, 0)) / (1 + tax_rate / 100), 2)
            ELSE (qty * unit_price - COALESCE(discount_amount, 0))
          END
        ), 0),
        COALESCE(SUM(total_line), 0)
      INTO v_subtotal, v_total
      FROM invoice_items
      WHERE invoice_sales_id = v_sales_id
         OR (invoice_id = v_sales_id AND invoice_type = 'sale');
    ELSE
      SELECT
        COALESCE(SUM(qty * unit_price - COALESCE(discount_amount, 0)), 0),
        COALESCE(SUM(total_line), 0)
      INTO v_subtotal, v_total
      FROM invoice_items
      WHERE invoice_sales_id = v_sales_id
         OR (invoice_id = v_sales_id AND invoice_type = 'sale');
    END IF;

    v_tax := CASE WHEN v_total < 0 THEN LEAST(v_total - v_subtotal, 0) ELSE GREATEST(v_total - v_subtotal, 0) END;

    v_paid := fn_invoice_sales_paid(v_sales_id);

    v_new_balance := GREATEST(v_total - v_paid, 0);

    SELECT status INTO v_status FROM invoice_sales WHERE id = v_sales_id;

    IF v_status IN ('void', 'voided') THEN
      UPDATE invoice_sales
      SET subtotal = v_subtotal,
          tax_total = v_tax,
          total = v_total,
          updated_at = NOW()
      WHERE id = v_sales_id
        AND (total IS DISTINCT FROM v_total
          OR subtotal IS DISTINCT FROM v_subtotal
          OR tax_total IS DISTINCT FROM v_tax);
    ELSE
      UPDATE invoice_sales
      SET subtotal = v_subtotal,
          tax_total = v_tax,
          total = v_total,
          balance = v_new_balance,
          updated_at = NOW()
      WHERE id = v_sales_id
        AND (total IS DISTINCT FROM v_total
          OR subtotal IS DISTINCT FROM v_subtotal
          OR tax_total IS DISTINCT FROM v_tax
          OR balance IS DISTINCT FROM v_new_balance);
    END IF;
  END IF;

  IF v_purchase_id IS NOT NULL THEN
    SELECT tax_included, status INTO v_tax_included, v_status FROM invoice_purchase WHERE id = v_purchase_id;

    -- Misma regla que venta (F-51): con impuesto incluido, la base de cada
    -- línea se redondea y el impuesto sale por resta.
    SELECT
      COALESCE(SUM(
        CASE
          WHEN COALESCE(v_tax_included, false) AND tax_rate > 0
            THEN ROUND((qty * unit_price - COALESCE(discount_amount, 0)) / (1 + tax_rate / 100), 2)
          ELSE (qty * unit_price - COALESCE(discount_amount, 0))
        END
      ), 0),
      COALESCE(SUM(total_line), 0)
    INTO v_subtotal, v_total
    FROM invoice_items
    WHERE invoice_purchase_id = v_purchase_id
       OR (invoice_id = v_purchase_id AND invoice_type = 'purchase');

    v_tax := GREATEST(v_total - v_subtotal, 0);

    -- Neto a pagar (total − retenciones) − pagado de los dos orígenes (D4, D5).
    v_new_balance := GREATEST(
      v_total
        - COALESCE((SELECT SUM(w.amount) FROM invoice_purchase_withholdings w WHERE w.invoice_id = v_purchase_id), 0)
        - fn_invoice_purchase_paid(v_purchase_id),
      0);

    IF v_status IN ('void', 'voided') THEN
      UPDATE invoice_purchase
      SET subtotal = v_subtotal,
          tax_total = v_tax,
          total = v_total,
          updated_at = NOW()
      WHERE id = v_purchase_id
        AND (total IS DISTINCT FROM v_total
          OR subtotal IS DISTINCT FROM v_subtotal
          OR tax_total IS DISTINCT FROM v_tax);
    ELSE
      UPDATE invoice_purchase
      SET subtotal = v_subtotal,
          tax_total = v_tax,
          total = v_total,
          balance = v_new_balance,
          updated_at = NOW()
      WHERE id = v_purchase_id
        AND (total IS DISTINCT FROM v_total
          OR subtotal IS DISTINCT FROM v_subtotal
          OR tax_total IS DISTINCT FROM v_tax
          OR balance IS DISTINCT FROM v_new_balance);
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

-- ── 5. Una CxP por factura ─────────────────────────────────────────────────
create unique index if not exists ux_accounts_payable_invoice_id
  on public.accounts_payable (invoice_id)
  where invoice_id is not null;

-- ── 6. Único escritor de la CxP de una factura ─────────────────────────────
create or replace function public.fn_cxp_asegurar_de_factura(p_invoice_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inv public.invoice_purchase%rowtype;
  v_ap_id uuid;
  v_neto numeric;
  v_vence timestamptz;
begin
  select * into v_inv from public.invoice_purchase where id = p_invoice_id;
  if not found then
    return null;
  end if;

  select id into v_ap_id from public.accounts_payable where invoice_id = p_invoice_id;

  -- D2: un borrador no es deuda. (Las CxP que los caminos viejos crearon para
  -- borradores se dejan como están: no se reparan datos históricos.)
  if v_inv.status = 'draft' then
    return v_ap_id;
  end if;

  if v_inv.status in ('void', 'voided') then
    if v_ap_id is not null then
      update public.accounts_payable
         set status = 'void', balance = 0, updated_at = now()
       where id = v_ap_id
         and (status is distinct from 'void' or balance is distinct from 0);
    end if;
    return v_ap_id;
  end if;

  v_neto := public.fn_invoice_purchase_neto(p_invoice_id);
  v_vence := coalesce(v_inv.due_date, v_inv.issue_date, now());

  if v_ap_id is null then
    insert into public.accounts_payable (
      organization_id, branch_id, supplier_id, invoice_id, amount, balance, due_date, status
    ) values (
      v_inv.organization_id, v_inv.branch_id, v_inv.supplier_id, v_inv.id, v_neto, v_neto, v_vence, 'pending'
    )
    on conflict (invoice_id) where invoice_id is not null do nothing
    returning id into v_ap_id;

    if v_ap_id is null then
      select id into v_ap_id from public.accounts_payable where invoice_id = p_invoice_id;
    end if;
  else
    update public.accounts_payable
       set amount = v_neto,
           due_date = v_vence,
           supplier_id = v_inv.supplier_id,
           branch_id = coalesce(v_inv.branch_id, branch_id),
           status = case when status = 'void' then 'pending' else status end,
           updated_at = now()
     where id = v_ap_id
       and (amount is distinct from v_neto
         or due_date is distinct from v_vence
         or supplier_id is distinct from v_inv.supplier_id
         or branch_id is distinct from coalesce(v_inv.branch_id, branch_id)
         or status = 'void');
  end if;

  perform public.fn_cxp_recalcular(v_ap_id);
  return v_ap_id;
end;
$$;

comment on function public.fn_cxp_asegurar_de_factura(uuid) is
  'Único escritor de la CxP de una factura de compra (F1.2). Borrador: nada; anulada: CxP void; confirmada: crea o sincroniza monto neto, vencimiento, proveedor y sucursal. Interna.';

revoke all on function public.fn_cxp_asegurar_de_factura(uuid) from public, anon, authenticated;

create or replace function public.fn_trg_cxp_desde_factura()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'draft' then
    return null;
  end if;
  if tg_op = 'INSERT'
     or new.total is distinct from old.total
     or new.due_date is distinct from old.due_date
     or new.status is distinct from old.status
     or new.supplier_id is distinct from old.supplier_id then
    perform public.fn_cxp_asegurar_de_factura(new.id);
  end if;
  return null;
end;
$$;

revoke all on function public.fn_trg_cxp_desde_factura() from public, anon, authenticated;

drop trigger if exists trg_cxp_desde_factura on public.invoice_purchase;
create trigger trg_cxp_desde_factura
  after insert or update of total, due_date, status, supplier_id on public.invoice_purchase
  for each row execute function public.fn_trg_cxp_desde_factura();
