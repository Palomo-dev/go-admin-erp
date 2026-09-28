-- Versión: 20260924093524, la que quedó registrada en supabase_migrations al aplicarla por MCP.
-- Antes se llamaba 20260926160000_nota_credito_emitir_y_saldo_con_notas.sql; se renombró el 2026-09-24 porque ese prefijo
-- lo usaban también migraciones de otras sesiones (chocaba con `supabase db push`).
--
-- Facturas de venta — P1.6: nota crédito en una transacción y saldo que cuenta las notas.
--
-- Plan: docs/implementacion/FACTURAS-VENTA-CXC-PLAN.md (L10, P1.6, P7).
--
-- Hallazgo medido hoy (2026-09-24): el saldo de la factura lo recalculan los
-- disparadores como `total − pagado`, sin restar las notas crédito. El diálogo
-- viejo restaba la nota escribiendo `invoice_sales.balance` y la cartera desde
-- el navegador, y el siguiente recálculo (un pago, una línea) la borraba. De 13
-- facturas vivas con notas, 7 muestran hoy un saldo que la nota ya canceló (4
-- «vencidas» por el total, con una nota por el total emitida).
--
-- 1. Columnas aditivas:
--    · invoice_items.credited_item_id: línea de la factura que acredita la línea
--      de la nota (tope por línea sin adivinar por producto).
--    · invoice_sales.idempotency_key: una nota por clave y organización.
-- 2. fn_invoice_sales_acreditado(factura): suma de las notas vivas.
-- 3. fn_factura_venta_recalcular_saldo(factura): UNA regla de saldo y estado,
--    saldo = max(total − pagado − acreditado, 0). La usan los disparadores de
--    pagos y de líneas (antes cada uno tenía su copia) y el nuevo disparador de
--    notas crédito. Es interna: sin EXECUTE para anon ni authenticated.
-- 4. fn_recalc_invoice_balance_from_payments y fn_recalc_invoice_totals llaman
--    a esa regla (la rama de compras se copia tal cual está hoy en la base).
--    Además, un pago de origen `sale` busca la FACTURA de la venta, no la nota
--    crédito que la devolución del POS liga a la misma venta.
-- 5. Disparador de notas crédito: al crear, cambiar o borrar una nota se
--    recalcula su factura (y la cartera la sigue por tr_update_account_receivable).
-- 6. Recalcular con la regla nueva las facturas que tienen notas (las 7 de arriba;
--    ninguna otra cambia: medido en el dry-run).
-- 7. fn_nota_credito_lineas_disponibles(factura): lo que aún se puede acreditar
--    por línea (vinculado + notas viejas sin vínculo repartidas por producto).
-- 8. fn_nota_credito_emitir(...): la nota completa en una transacción —
--    permiso finance.void, tope por línea y global, numeración compartida con
--    la devolución del POS (fn_pos_numero_nota_credito), líneas con el
--    impuesto de su línea original y la convención de signos de
--    procesar_devolucion (cantidad negativa, total negativo), reingreso de
--    mercancía opcional con tope por lo que salió, excedente sobre lo pagado
--    liquidado en la misma transacción (fn_liquidar_excedente_nota_credito;
--    efectivo sin caja abierta → sin_caja_abierta) y registro en
--    finance_audit_log. El asiento lo hace trg_auto_journal_credit_note.
--    La factura electrónica de la nota se encola después, desde la ruta.

-- ── 1 ── Columnas ───────────────────────────────────────────────────────────
alter table public.invoice_items
  add column if not exists credited_item_id uuid null references public.invoice_items(id) on delete set null;
create index if not exists idx_invoice_items_credited_item on public.invoice_items (credited_item_id)
  where credited_item_id is not null;
comment on column public.invoice_items.credited_item_id is
  'Línea de la factura que acredita esta línea de nota crédito (tope por línea). NULL en notas anteriores a 2026-09-24.';

alter table public.invoice_sales
  add column if not exists idempotency_key text null;
create unique index if not exists uq_invoice_sales_idempotency
  on public.invoice_sales (organization_id, idempotency_key) where idempotency_key is not null;
comment on column public.invoice_sales.idempotency_key is
  'Clave de idempotencia del documento creado por RPC (nota crédito): la misma clave devuelve el mismo documento.';

create index if not exists idx_invoice_sales_related_invoice on public.invoice_sales (related_invoice_id)
  where related_invoice_id is not null;

-- ── 2 ── Acreditado ─────────────────────────────────────────────────────────
create or replace function public.fn_invoice_sales_acreditado(p_invoice_id uuid)
 returns numeric
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select coalesce(sum(abs(coalesce(n.total, 0))), 0)
    from public.invoice_sales n
   where n.related_invoice_id = p_invoice_id
     and n.document_type = 'credit_note'
     and n.status not in ('draft', 'void', 'voided', 'cancelled');
$function$;

revoke all on function public.fn_invoice_sales_acreditado(uuid) from public, anon, authenticated;
grant execute on function public.fn_invoice_sales_acreditado(uuid) to service_role;

-- ── 3 ── Una regla de saldo ────────────────────────────────────────────────
create or replace function public.fn_factura_venta_recalcular_saldo(p_invoice_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_inv record;
  v_paid numeric;
  v_cred numeric;
  v_balance numeric;
  v_status text;
begin
  select id, total, status, document_type into v_inv from public.invoice_sales where id = p_invoice_id;
  if not found or v_inv.total is null then
    return;
  end if;
  if coalesce(v_inv.document_type, 'invoice') = 'credit_note' or v_inv.status in ('void', 'voided', 'cancelled') then
    return;
  end if;

  v_paid := public.fn_invoice_sales_paid(p_invoice_id);
  v_cred := public.fn_invoice_sales_acreditado(p_invoice_id);
  v_balance := greatest(v_inv.total - v_paid - v_cred, 0);

  v_status := v_inv.status;
  if v_inv.status <> 'draft' then
    if v_paid > 0 or v_cred > 0 then
      v_status := case when v_balance = 0 then 'paid' else 'partial' end;
    elsif v_inv.status in ('paid', 'partial') then
      -- Sin pagos ni notas vivas: vuelve a estar solo emitida.
      v_status := 'issued';
    end if;
  end if;

  update public.invoice_sales
     set balance = v_balance, status = v_status, updated_at = now()
   where id = p_invoice_id
     and (balance is distinct from v_balance or status is distinct from v_status);
end;
$function$;

revoke all on function public.fn_factura_venta_recalcular_saldo(uuid) from public, anon, authenticated;
grant execute on function public.fn_factura_venta_recalcular_saldo(uuid) to service_role;

-- ── 4a ── Disparador de pagos (rama de compras sin cambios) ────────────────
create or replace function public.fn_recalc_invoice_balance_from_payments()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
DECLARE
  r RECORD;
  v_invoice_id uuid;
  v_total numeric;
  v_balance numeric;
  v_status text;
BEGIN
  FOR r IN
    SELECT DISTINCT src, sid
    FROM (VALUES
      (CASE WHEN TG_OP <> 'DELETE' THEN NEW.source END,
       CASE WHEN TG_OP <> 'DELETE' THEN NEW.source_id END),
      (CASE WHEN TG_OP <> 'INSERT' THEN OLD.source END,
       CASE WHEN TG_OP <> 'INSERT' THEN OLD.source_id END)
    ) AS t(src, sid)
    WHERE src IN ('invoice_sales', 'invoice_purchase', 'sale', 'account_payable', 'account_receivable')
      AND sid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  LOOP
    v_invoice_id := NULL;

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

      -- Compras (F1.1): neto a pagar (total − retenciones) − pagado de los dos
      -- orígenes, con descuento (D4, D5).
      v_balance := GREATEST(fn_invoice_purchase_neto(v_invoice_id) - fn_invoice_purchase_paid(v_invoice_id), 0);

      UPDATE invoice_purchase
      SET balance = v_balance, updated_at = NOW()
      WHERE id = v_invoice_id AND balance IS DISTINCT FROM v_balance;

      CONTINUE;
    END IF;

    IF r.src = 'invoice_sales' THEN
      v_invoice_id := r.sid::uuid;
    ELSIF r.src = 'account_receivable' THEN
      -- La cartera sin factura la ajusta update_accounts_receivable_on_payment.
      SELECT invoice_id INTO v_invoice_id FROM accounts_receivable WHERE id = r.sid::uuid;
    ELSE
      -- La factura de la venta, no la nota crédito ligada a la misma venta.
      SELECT id INTO v_invoice_id FROM invoice_sales
       WHERE sale_id = r.sid::uuid AND COALESCE(document_type, 'invoice') = 'invoice'
       ORDER BY created_at, id LIMIT 1;
    END IF;

    CONTINUE WHEN v_invoice_id IS NULL;

    -- Ventas: una sola regla (total − pagado − notas crédito).
    PERFORM public.fn_factura_venta_recalcular_saldo(v_invoice_id);
  END LOOP;

  RETURN NULL;
END;
$function$;

-- ── 4b ── Disparador de líneas (rama de compras sin cambios) ───────────────
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
  v_new_balance numeric;
  v_status text;
  v_doc_type text;
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
    SELECT tax_included, status, COALESCE(document_type, 'invoice')
      INTO v_tax_included, v_status, v_doc_type
      FROM invoice_sales WHERE id = v_sales_id;

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

    IF v_status IN ('void', 'voided') OR v_doc_type <> 'invoice' THEN
      -- Anulada o nota crédito: solo totales (la nota nace y queda con saldo 0).
      UPDATE invoice_sales
      SET subtotal = v_subtotal,
          tax_total = v_tax,
          total = v_total,
          balance = CASE WHEN v_doc_type = 'credit_note' THEN 0 ELSE balance END,
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
          updated_at = NOW()
      WHERE id = v_sales_id
        AND (total IS DISTINCT FROM v_total
          OR subtotal IS DISTINCT FROM v_subtotal
          OR tax_total IS DISTINCT FROM v_tax);
      PERFORM public.fn_factura_venta_recalcular_saldo(v_sales_id);
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
$function$;

-- ── 5 ── Disparador de notas crédito ───────────────────────────────────────
create or replace function public.fn_trg_nota_credito_recalcula_factura()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  if tg_op <> 'INSERT' and old.related_invoice_id is not null then
    perform public.fn_factura_venta_recalcular_saldo(old.related_invoice_id);
  end if;
  if tg_op <> 'DELETE' and new.related_invoice_id is not null
     and (tg_op = 'INSERT' or new.related_invoice_id is distinct from old.related_invoice_id
          or new.status is distinct from old.status or new.total is distinct from old.total) then
    perform public.fn_factura_venta_recalcular_saldo(new.related_invoice_id);
  end if;
  return null;
end;
$function$;

revoke all on function public.fn_trg_nota_credito_recalcula_factura() from public, anon, authenticated;

drop trigger if exists trg_nota_credito_recalcula_factura on public.invoice_sales;
create trigger trg_nota_credito_recalcula_factura
  after insert or update of status, total, related_invoice_id on public.invoice_sales
  for each row when (new.document_type = 'credit_note')
  execute function public.fn_trg_nota_credito_recalcula_factura();

drop trigger if exists trg_nota_credito_borrada_recalcula_factura on public.invoice_sales;
create trigger trg_nota_credito_borrada_recalcula_factura
  after delete on public.invoice_sales
  for each row when (old.document_type = 'credit_note')
  execute function public.fn_trg_nota_credito_recalcula_factura();

-- ── 6 ── Facturas con notas: la regla nueva ────────────────────────────────
select public.fn_factura_venta_recalcular_saldo(f.id)
  from public.invoice_sales f
 where coalesce(f.document_type, 'invoice') = 'invoice'
   and f.status not in ('draft', 'void', 'voided', 'cancelled')
   and exists (select 1 from public.invoice_sales n
                where n.related_invoice_id = f.id and n.document_type = 'credit_note');

-- ── 7 ── Lo que queda por acreditar, por línea ─────────────────────────────
create or replace function public.fn_nota_credito_lineas_disponibles(p_invoice_id uuid)
 returns table (
   item_id uuid, product_id integer, descripcion text, cantidad numeric, acreditada numeric,
   disponible numeric, unit_price numeric, discount_amount numeric, total_line numeric,
   tax_rate numeric, tax_code text, tax_included boolean)
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_org integer;
begin
  select organization_id into v_org from public.invoice_sales where id = p_invoice_id;
  if v_org is null then
    return;
  end if;
  perform public.fn_assert_acceso_org(v_org);

  return query
  with notas as (
    select n.id from public.invoice_sales n
     where n.related_invoice_id = p_invoice_id and n.document_type = 'credit_note'
       and n.status not in ('draft', 'void', 'voided', 'cancelled')
  ), lineas_nota as (
    select li.credited_item_id, li.product_id, abs(coalesce(li.qty, 0)) as q
      from public.invoice_items li
     where coalesce(li.invoice_sales_id, li.invoice_id) in (select id from notas)
  ), legado as (
    -- Notas viejas sin vínculo: se reparten por producto, en orden de línea.
    select ln.product_id, sum(ln.q) as q from lineas_nota ln
     where ln.credited_item_id is null and ln.product_id is not null
     group by ln.product_id
  ), items as (
    select ii.*,
           coalesce((select sum(ln.q) from lineas_nota ln where ln.credited_item_id = ii.id), 0) as vinculada
      from public.invoice_items ii
     where coalesce(ii.invoice_sales_id, ii.invoice_id) = p_invoice_id
       and coalesce(ii.qty, 0) > 0
  ), libres as (
    select it.*, greatest(it.qty - it.vinculada, 0) as libre,
           coalesce(sum(greatest(it.qty - it.vinculada, 0)) over (
             partition by it.product_id order by it.created_at, it.id
             rows between unbounded preceding and 1 preceding), 0) as antes
      from items it
  ), repartidas as (
    -- Parte de las notas viejas de su producto que le toca a esta línea.
    select l.*, greatest(least(l.libre, coalesce(g.q, 0) - l.antes), 0) as de_legado
      from libres l
      left join legado g on g.product_id = l.product_id
  )
  select r.id, r.product_id, r.description, r.qty,
         r.qty - (r.libre - r.de_legado),
         r.libre - r.de_legado,
         r.unit_price, coalesce(r.discount_amount, 0), r.total_line,
         coalesce(r.tax_rate, 0), r.tax_code, r.tax_included
    from repartidas r
   order by r.created_at, r.id;
end;
$function$;

revoke all on function public.fn_nota_credito_lineas_disponibles(uuid) from public, anon;
grant execute on function public.fn_nota_credito_lineas_disponibles(uuid) to authenticated, service_role;

-- ── 8 ── Emitir la nota crédito ────────────────────────────────────────────
create or replace function public.fn_nota_credito_emitir(
  p_invoice_id uuid,
  p_modo text,
  p_lineas jsonb,
  p_valor numeric,
  p_concepto text,
  p_motivo text,
  p_reingresar boolean,
  p_liquidacion text,
  p_metodo_devolucion text,
  p_cuenta_bancaria integer,
  p_clave_idempotencia text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_inv public.invoice_sales%rowtype;
  v_existente public.invoice_sales%rowtype;
  v_disp record;
  v_q numeric;
  v_lineas jsonb := '[]'::jsonb;
  v_l jsonb;
  v_tot numeric := 0;
  v_sub numeric := 0;
  v_tope numeric;
  v_numero text;
  v_nc_id uuid;
  v_exc numeric := 0;
  v_liq jsonb;
  v_reingresos integer := 0;
  v_salio numeric;
  v_volvio numeric;
  v_costo numeric;
  v_track boolean;
begin
  if v_uid is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  if p_clave_idempotencia is null or btrim(p_clave_idempotencia) = '' or length(p_clave_idempotencia) > 200 then
    raise exception 'clave_idempotencia_invalida' using errcode = '22023';
  end if;
  if p_modo not in ('total', 'lineas', 'valor') then
    raise exception 'modo_invalido' using errcode = '22023';
  end if;
  if p_motivo is null or length(btrim(p_motivo)) < 5 then
    raise exception 'motivo_obligatorio' using errcode = '22023';
  end if;
  if coalesce(p_liquidacion, 'saldo_a_favor') not in ('saldo_a_favor', 'devolucion') then
    raise exception 'liquidacion_invalida' using errcode = '22023';
  end if;

  select * into v_inv from public.invoice_sales where id = p_invoice_id for update;
  if not found then
    raise exception 'factura_no_encontrada' using errcode = 'P0002';
  end if;
  perform public.fn_finanzas_exigir_permiso(v_inv.organization_id, array['finance.void']);
  if v_inv.branch_id is not null and not public.app_branch_access(v_inv.branch_id) then
    raise exception 'sin_acceso_sucursal' using errcode = '42501';
  end if;

  -- Idempotencia: la misma clave devuelve la nota ya emitida.
  perform pg_advisory_xact_lock(hashtextextended('nota_credito:' || v_inv.organization_id || ':' || p_clave_idempotencia, 0));
  select * into v_existente from public.invoice_sales
   where organization_id = v_inv.organization_id and idempotency_key = p_clave_idempotencia;
  if found then
    return jsonb_build_object('id', v_existente.id, 'numero', v_existente.number,
                              'total', abs(coalesce(v_existente.total, 0)), 'repetida', true);
  end if;

  if coalesce(v_inv.document_type, 'invoice') <> 'invoice' then
    raise exception 'documento_invalido' using errcode = '22023';
  end if;
  if v_inv.status = 'draft' then
    raise exception 'factura_borrador' using errcode = '22023';
  end if;
  if v_inv.status in ('void', 'voided', 'cancelled') then
    raise exception 'ya_anulada' using errcode = '22023';
  end if;

  -- ── Líneas de la nota ──
  if p_modo = 'valor' then
    if p_valor is null or p_valor <= 0 then
      raise exception 'monto_invalido' using errcode = '22023';
    end if;
    if p_concepto is null or btrim(p_concepto) = '' then
      raise exception 'concepto_obligatorio' using errcode = '22023';
    end if;
    -- F-42: concepto libre sin impuesto, como el diálogo anterior.
    v_lineas := jsonb_build_array(jsonb_build_object(
      'item_id', null, 'product_id', null, 'descripcion', btrim(p_concepto), 'q', 1,
      'unit_price', round(p_valor, 2), 'discount', 0, 'total_line', -round(p_valor, 2),
      'tax_rate', 0, 'tax_code', null, 'tax_included', false));
  else
    if p_modo = 'lineas' and (p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0) then
      raise exception 'sin_lineas' using errcode = '22023';
    end if;
    for v_disp in select * from public.fn_nota_credito_lineas_disponibles(v_inv.id) loop
      if p_modo = 'total' then
        v_q := v_disp.disponible;
      else
        select (e->>'cantidad')::numeric into v_q
          from jsonb_array_elements(p_lineas) e
         where (e->>'item_id')::uuid = v_disp.item_id;
        if (select count(*) from jsonb_array_elements(p_lineas) e where (e->>'item_id')::uuid = v_disp.item_id) > 1 then
          raise exception 'linea_repetida' using errcode = '22023';
        end if;
      end if;
      continue when v_q is null or v_q = 0;
      if v_q < 0 then
        raise exception 'cantidad_invalida' using errcode = '22023';
      end if;
      if v_q > v_disp.disponible + 0.000001 then
        raise exception 'cantidad_excede_disponible' using errcode = '22023',
          detail = jsonb_build_object('item_id', v_disp.item_id, 'disponible', v_disp.disponible, 'pedida', v_q)::text;
      end if;
      v_lineas := v_lineas || jsonb_build_object(
        'item_id', v_disp.item_id, 'product_id', v_disp.product_id, 'descripcion', v_disp.descripcion, 'q', v_q,
        'unit_price', v_disp.unit_price,
        'discount', round(v_disp.discount_amount * v_q / v_disp.cantidad, 2),
        'total_line', -round(v_disp.total_line * v_q / v_disp.cantidad, 2),
        'tax_rate', v_disp.tax_rate, 'tax_code', v_disp.tax_code,
        'tax_included', coalesce(v_disp.tax_included, v_inv.tax_included, false));
    end loop;
    if p_modo = 'lineas' and exists (
      select 1 from jsonb_array_elements(p_lineas) e
       where not exists (select 1 from jsonb_array_elements(v_lineas) l where l->>'item_id' = e->>'item_id')
         and coalesce((e->>'cantidad')::numeric, 0) > 0) then
      raise exception 'linea_no_pertenece_a_la_factura' using errcode = '22023';
    end if;
    if jsonb_array_length(v_lineas) = 0 then
      raise exception 'nada_por_acreditar' using errcode = '22023';
    end if;
  end if;

  -- Totales con la regla de fn_recalc_invoice_totals (cantidad negativa).
  for v_l in select * from jsonb_array_elements(v_lineas) loop
    v_tot := v_tot + (v_l->>'total_line')::numeric;
    v_sub := v_sub + case
      when coalesce(v_inv.tax_included, false) and (v_l->>'tax_rate')::numeric > 0
        then round((-(v_l->>'q')::numeric * (v_l->>'unit_price')::numeric + (v_l->>'discount')::numeric)
                   / (1 + (v_l->>'tax_rate')::numeric / 100), 2)
      else -(v_l->>'q')::numeric * (v_l->>'unit_price')::numeric + (v_l->>'discount')::numeric
    end;
  end loop;
  if v_tot >= 0 then
    raise exception 'monto_invalido' using errcode = '22023';
  end if;

  -- Tope global: lo facturado menos lo ya acreditado.
  v_tope := coalesce(v_inv.total, 0) - public.fn_invoice_sales_acreditado(v_inv.id);
  if abs(v_tot) > v_tope + 0.01 then
    raise exception 'nota_excede_facturado' using errcode = '22023',
      detail = jsonb_build_object('tope', round(greatest(v_tope, 0), 2), 'nota', abs(v_tot))::text;
  end if;

  -- Reingreso: solo con productos y nunca con seriales (eso va por la devolución del POS).
  if coalesce(p_reingresar, false) and p_modo <> 'valor' and exists (
      select 1 from jsonb_array_elements(v_lineas) l join public.products p on p.id = (l->>'product_id')::integer
       where coalesce(p.track_serial, false)) then
    raise exception 'reingreso_con_seriales' using errcode = '22023';
  end if;

  -- ── Documento ──
  v_numero := public.fn_pos_numero_nota_credito(v_inv.organization_id, v_inv.branch_id);

  insert into public.invoice_sales (
    organization_id, branch_id, customer_id, number, issue_date, due_date,
    currency, subtotal, tax_total, total, balance, status, document_type,
    related_invoice_id, tax_included, payment_method, description, created_by, idempotency_key
  ) values (
    v_inv.organization_id, v_inv.branch_id, v_inv.customer_id, v_numero, now(), now(),
    v_inv.currency, v_sub, least(v_tot - v_sub, 0), v_tot, 0, 'issued', 'credit_note',
    v_inv.id, v_inv.tax_included, v_inv.payment_method,
    'Nota crédito de la factura ' || coalesce(v_inv.number, v_inv.id::text) || '. Motivo: ' || btrim(p_motivo),
    v_uid, p_clave_idempotencia
  )
  returning id into v_nc_id;

  insert into public.invoice_items (
    invoice_id, invoice_sales_id, invoice_type, product_id, description, qty, unit_price,
    total_line, tax_rate, tax_code, discount_amount, tax_included, credited_item_id
  )
  select v_nc_id, v_nc_id, 'sale', (l->>'product_id')::integer,
         coalesce(l->>'descripcion', 'Nota crédito'),
         -(l->>'q')::numeric, (l->>'unit_price')::numeric, (l->>'total_line')::numeric,
         (l->>'tax_rate')::numeric, l->>'tax_code', -(l->>'discount')::numeric,
         (l->>'tax_included')::boolean, (l->>'item_id')::uuid
    from jsonb_array_elements(v_lineas) l;

  insert into public.invoice_applied_taxes (invoice_id, tax_code, tax_rate, is_applied)
  select v_nc_id, t.tax_code, t.tax_rate, t.is_applied
    from public.invoice_applied_taxes t where t.invoice_id = v_inv.id;

  -- ── Reingreso de mercancía: tope por lo que salió y aún no volvió ──
  if coalesce(p_reingresar, false) and p_modo <> 'valor' then
    for v_l in
      select jsonb_build_object('product_id', (l->>'product_id')::integer, 'q', sum((l->>'q')::numeric))
        from jsonb_array_elements(v_lineas) l
       where l->>'product_id' is not null
       group by (l->>'product_id')::integer
    loop
      select coalesce(p.track_stock, false) into v_track from public.products p where p.id = (v_l->>'product_id')::integer;
      continue when not coalesce(v_track, false);
      select coalesce(sum(sm.qty), 0), (array_agg(sm.unit_cost order by sm.id))[1] into v_salio, v_costo
        from public.stock_movements sm
       where sm.organization_id = v_inv.organization_id and sm.direction = 'out'
         and sm.product_id = (v_l->>'product_id')::integer
         and sm.source in ('invoice_sale', 'sale', 'mesa_sale', 'web_sale')
         and sm.source_id in (v_inv.id::text, coalesce(v_inv.sale_id::text, v_inv.id::text));
      select coalesce(sum(sm.qty), 0) into v_volvio
        from public.stock_movements sm
       where sm.organization_id = v_inv.organization_id and sm.direction = 'in'
         and sm.product_id = (v_l->>'product_id')::integer
         and ((sm.source = 'invoice_void' and sm.source_id = v_inv.id::text)
           or (sm.source = 'credit_note' and sm.source_id in (
                 select n.id::text from public.invoice_sales n where n.related_invoice_id = v_inv.id))
           or (v_inv.sale_id is not null and sm.source = 'return' and sm.source_id in (
                 select r.id::text from public.returns r where r.sale_id = v_inv.sale_id)));
      v_q := least((v_l->>'q')::numeric, v_salio - v_volvio);
      continue when v_q <= 0;
      perform public.fn_stock_entrada(v_inv.organization_id, v_inv.branch_id, (v_l->>'product_id')::integer, v_q,
                                      v_costo, 'credit_note', v_nc_id::text,
                                      'Nota crédito ' || v_numero || ' de la factura ' || coalesce(v_inv.number, ''), v_uid);
      v_reingresos := v_reingresos + 1;
    end loop;
  end if;

  -- ── Excedente sobre lo pagado: se liquida aquí mismo ──
  v_exc := public.fn_excedente_nota_credito(v_nc_id);
  if v_exc > 0 then
    if coalesce(p_liquidacion, 'saldo_a_favor') = 'saldo_a_favor' and v_inv.customer_id is null then
      raise exception 'saldo_a_favor_sin_cliente' using errcode = '22023';
    end if;
    if p_liquidacion = 'devolucion' then
      if p_metodo_devolucion is null then
        raise exception 'metodo_devolucion_obligatorio' using errcode = '22023';
      end if;
      if p_metodo_devolucion = 'cash'
         and public.fn_caja_abierta_para(v_inv.organization_id, v_inv.branch_id, v_uid) is null then
        raise exception 'sin_caja_abierta' using errcode = '22023';
      end if;
    end if;
    v_liq := public.fn_liquidar_excedente_nota_credito(
      v_nc_id, coalesce(p_liquidacion, 'saldo_a_favor'), p_metodo_devolucion, p_cuenta_bancaria);
  end if;

  insert into public.finance_audit_log (organization_id, entity, entity_id, action, user_id, diff, reason)
  values (v_inv.organization_id, 'invoice_sales', v_nc_id::text, 'insert', v_uid,
          jsonb_build_object('documento', 'nota_credito', 'factura', v_inv.id, 'numero', v_numero, 'modo', p_modo, 'total', abs(v_tot),
                             'excedente', v_exc, 'productos_reingresados', v_reingresos),
          btrim(p_motivo));

  return jsonb_build_object(
    'id', v_nc_id, 'numero', v_numero, 'total', abs(v_tot), 'repetida', false,
    'excedente', v_exc, 'liquidacion', v_liq, 'productos_reingresados', v_reingresos,
    'fe_factura', v_inv.einvoice_status);
end;
$function$;

revoke all on function public.fn_nota_credito_emitir(uuid, text, jsonb, numeric, text, text, boolean, text, text, integer, text) from public, anon;
grant execute on function public.fn_nota_credito_emitir(uuid, text, jsonb, numeric, text, text, boolean, text, text, integer, text) to authenticated, service_role;
