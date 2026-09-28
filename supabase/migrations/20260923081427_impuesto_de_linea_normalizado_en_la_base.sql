-- Impuesto de línea normalizado en la base (F-42 · F-50 · F-51 · F-54).
--
-- Hoy escriben invoice_items 4 funciones SQL y 20 puntos de TypeScript; ninguna
-- de las SQL escribe tax_code y solo 3 de las TS usan el resolver. Medido:
-- 5.642 líneas, 3 con tax_code; 283 con tarifa > 0 y tax_code NULL; tarifas
-- calculadas como 1,4179 · 0,8407 · 19,0002 que no son ninguna tarifa.
--
-- En vez de reescribir las 24 rutas, un solo punto en la base:
--
-- 1. fn_codigo_impuesto_linea(org, producto, tarifa): deriva tax_code.
--      a. relación del producto con un impuesto activo de esa tarifa;
--      b. tarifa > 0: plantilla del país de la organización con esa tarifa
--         (se excluyen retenciones: no son impuestos de la línea);
--      c. tarifa 0 sin relación explícita: NULL. «Exento» (IVA_0) es una
--         afirmación fiscal; no se le pone a una línea que simplemente no tiene
--         impuesto configurado (ADR-CC-004).
-- 2. Disparador BEFORE INSERT/UPDATE en invoice_items: completa tax_code y
--    registra en invoice_item_tax_audit lo que no cuadra (tarifa sin plantilla,
--    total_line incoherente). Nunca bloquea: si algo falla, la línea entra igual.
-- 3. trg_recalc_invoice_totals_upd solo dispara cuando cambia algo que mueve
--    importes. Completar tax_code no recalcula, y el relleno de este archivo no
--    reescribe cabeceras ya contabilizadas (48 cambiarían).
-- 4. Relleno de tax_code en las líneas con tarifa > 0.
-- 5. F-51: redondeo único. Con impuesto incluido, la base de cada línea es
--    round(bruto / (1 + tarifa/100), 2) y el impuesto se obtiene por resta.
--
-- ADR: docs/decisiones/ADR-CC-004-impuesto-de-linea-en-la-base.md

-- ── Auditoría ───────────────────────────────────────────────────────────────
create table if not exists public.invoice_item_tax_audit (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  organization_id integer,
  invoice_item_id uuid,
  invoice_id uuid,
  invoice_type text,
  kind text not null check (kind in ('tarifa_sin_plantilla', 'total_line_incoherente', 'error_normalizando')),
  tax_rate numeric,
  total_line numeric,
  expected_total_line numeric,
  detail text
);

create index if not exists idx_invoice_item_tax_audit_org
  on public.invoice_item_tax_audit (organization_id, created_at desc);

alter table public.invoice_item_tax_audit enable row level security;
revoke all on public.invoice_item_tax_audit from anon, authenticated;

comment on table public.invoice_item_tax_audit is
  'Anomalías de impuesto en líneas de factura detectadas por fn_normalizar_impuesto_linea. No bloquea la escritura; es para revisión.';

-- ── Código de impuesto de una línea ─────────────────────────────────────────
create or replace function public.fn_codigo_impuesto_linea(
  p_organization_id integer,
  p_product_id integer,
  p_tax_rate numeric
) returns text
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_code text;
begin
  if p_tax_rate is null or p_organization_id is null then
    return null;
  end if;

  if p_product_id is not null then
    select tt.code into v_code
    from product_tax_relations r
    join organization_taxes ot on ot.id = r.tax_id
    join tax_templates tt on tt.id = ot.template_id
    where r.product_id = p_product_id
      and ot.organization_id = p_organization_id
      and ot.is_active
      and ot.rate = p_tax_rate
      and tt.code not ilike '%RETE%'
    order by tt.id
    limit 1;
    if v_code is not null then
      return v_code;
    end if;
  end if;

  if p_tax_rate = 0 then
    return null;
  end if;

  select tt.code into v_code
  from organizations o
  join tax_templates tt on tt.country = o.country_code
  where o.id = p_organization_id
    and tt.rate = p_tax_rate
    and tt.code not ilike '%RETE%'
    and (tt.valid_to is null or tt.valid_to > now())
  order by tt.id
  limit 1;

  return v_code;
end;
$$;

revoke all on function public.fn_codigo_impuesto_linea(integer, integer, numeric) from public, anon, authenticated;
grant execute on function public.fn_codigo_impuesto_linea(integer, integer, numeric) to service_role;

-- ── Normalización de la línea ───────────────────────────────────────────────
create or replace function public.fn_normalizar_impuesto_linea()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_org integer;
  v_doc uuid;
  v_type text;
  v_rate numeric;
  v_code text;
  v_net numeric;
  v_expected numeric;
begin
  v_rate := coalesce(NEW.tax_rate, 0);

  if NEW.invoice_purchase_id is not null or NEW.invoice_type = 'purchase' then
    v_type := 'purchase';
    v_doc := coalesce(NEW.invoice_purchase_id, NEW.invoice_id);
    select organization_id into v_org from invoice_purchase where id = v_doc;
  elsif NEW.invoice_sales_id is not null or NEW.invoice_type = 'sale' then
    v_type := 'sale';
    v_doc := coalesce(NEW.invoice_sales_id, NEW.invoice_id);
    select organization_id into v_org from invoice_sales where id = v_doc;
  end if;

  if NEW.tax_code is null and NEW.tax_rate is not null and v_org is not null then
    v_code := fn_codigo_impuesto_linea(v_org, NEW.product_id, v_rate);
    if v_code is not null then
      NEW.tax_code := v_code;
    elsif v_rate <> 0 then
      insert into invoice_item_tax_audit (organization_id, invoice_item_id, invoice_id, invoice_type,
        kind, tax_rate, total_line, detail)
      values (v_org, NEW.id, v_doc, v_type, 'tarifa_sin_plantilla', NEW.tax_rate, NEW.total_line,
        'La tarifa no corresponde a ningún impuesto del país de la organización');
    end if;
  end if;

  if NEW.qty is not null and NEW.unit_price is not null and NEW.total_line is not null then
    v_net := NEW.qty * NEW.unit_price - coalesce(NEW.discount_amount, 0);
    v_expected := case
      when coalesce(NEW.tax_included, false) then round(v_net, 2)
      else round(v_net * (1 + v_rate / 100), 2)
    end;
    if abs(NEW.total_line - v_expected) > 1 then
      insert into invoice_item_tax_audit (organization_id, invoice_item_id, invoice_id, invoice_type,
        kind, tax_rate, total_line, expected_total_line, detail)
      values (v_org, NEW.id, v_doc, v_type, 'total_line_incoherente', NEW.tax_rate, NEW.total_line, v_expected,
        'total_line no es el bruto de qty × precio − descuento con la tarifa y el modo de la línea');
    end if;
  end if;

  return NEW;
exception when others then
  begin
    insert into invoice_item_tax_audit (organization_id, invoice_item_id, invoice_id, invoice_type, kind, detail)
    values (v_org, NEW.id, v_doc, v_type, 'error_normalizando', SQLERRM);
  exception when others then
    null;
  end;
  return NEW;
end;
$$;

drop trigger if exists trg_normalizar_impuesto_linea on public.invoice_items;
create trigger trg_normalizar_impuesto_linea
  before insert or update of tax_rate, tax_code, qty, unit_price, discount_amount, total_line, tax_included, product_id
  on public.invoice_items
  for each row execute function public.fn_normalizar_impuesto_linea();

-- ── El recálculo solo cuando cambian importes ───────────────────────────────
drop trigger if exists trg_recalc_invoice_totals_upd on public.invoice_items;
create trigger trg_recalc_invoice_totals_upd
  after update of qty, unit_price, discount_amount, tax_rate, total_line, tax_included,
                  invoice_id, invoice_sales_id, invoice_purchase_id, invoice_type
  on public.invoice_items
  for each row execute function public.fn_recalc_invoice_totals();

-- ── Relleno de tax_code (no recalcula: tax_code no está en la lista) ────────
update public.invoice_items ii
set tax_code = fn_codigo_impuesto_linea(
  coalesce(
    (select s.organization_id from invoice_sales s where s.id = coalesce(ii.invoice_sales_id, ii.invoice_id) and ii.invoice_type = 'sale'),
    (select p.organization_id from invoice_purchase p where p.id = coalesce(ii.invoice_purchase_id, ii.invoice_id) and ii.invoice_type = 'purchase')
  ),
  ii.product_id, ii.tax_rate)
where ii.tax_code is null and coalesce(ii.tax_rate, 0) > 0;

-- ── F-51: base redondeada por línea, impuesto por resta ─────────────────────
-- Conserva SECURITY DEFINER: la versión anterior lo tenía y CREATE OR REPLACE
-- sin la cláusula la dejaría como INVOKER.
create or replace function public.fn_recalc_invoice_totals()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
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
    v_purchase_id := COALESCE(NEW.invoice_purchase_id, CASE WHEN NEW.invoice_type = 'purchase' THEN OLD.invoice_id END);
  END IF;

  -- ===== FACTURA DE VENTA =====
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

    v_tax := GREATEST(v_total - v_subtotal, 0);

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

  -- ===== FACTURA DE COMPRA =====
  IF v_purchase_id IS NOT NULL THEN
    SELECT
      COALESCE(SUM(qty * unit_price - COALESCE(discount_amount, 0)), 0),
      COALESCE(SUM(total_line), 0)
    INTO v_subtotal, v_total
    FROM invoice_items
    WHERE invoice_purchase_id = v_purchase_id
       OR (invoice_id = v_purchase_id AND invoice_type = 'purchase');

    v_tax := GREATEST(v_total - v_subtotal, 0);

    SELECT COALESCE(SUM(amount), 0) INTO v_paid
    FROM payments
    WHERE source = 'invoice_purchase' AND source_id = v_purchase_id::text AND status = 'completed';

    v_new_balance := GREATEST(v_total - v_paid, 0);

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

  RETURN NULL;
END;
$function$;
