-- Versión: 20260924075934, la que quedó registrada en supabase_migrations al aplicarla por MCP.
-- Antes se llamaba 20260926120000_factura_venta_emitir_y_anular.sql; se renombró el 2026-09-24 porque ese prefijo
-- lo usaban también migraciones de otras sesiones (chocaba con `supabase db push`).
--
-- Facturas de venta: emitir y anular en la base (P1.4 y P1.5 del plan de ventas y CxC)
--
-- Hasta hoy las dos cosas las hacía el navegador en varios pasos sueltos:
--   * Emitir: issue_invoice y DESPUÉS el descuento de inventario desde el cliente
--     (DetalleFactura.tsx:579-633). Si el navegador se cerraba entre los dos, la
--     factura quedaba emitida sin salida de kardex.
--   * Anular: update de invoice_sales, update A MANO de accounts_receivable a
--     'paid' con saldo 0 y reingreso de inventario desde el navegador
--     (AnularFacturaDialog.tsx:86-153).
--
-- Qué cambia:
--   1. fn_factura_venta_emitir(p_invoice_id): permiso finance.create; bloquea si
--      falta inventario (fn_invoice_stock_shortages); número al emitir si el
--      borrador no lo tiene (resolución de la sucursal o consecutivo FACT-);
--      pasa a 'issued' y la cartera nace por su disparador; saca el inventario
--      UNA vez (no si la venta del POS/web ya lo sacó: L3). Todo en una transacción.
--   2. fn_factura_venta_anular(p_invoice_id, p_motivo): permiso finance.void;
--      las reglas de L4 (sin pagos, no nota crédito, no FE aceptada) en la base;
--      devuelve al kardex exactamente lo que salió (por movimientos, así las
--      recetas devuelven sus ingredientes); la cartera pasa a 'cancelled' y el
--      contra-asiento lo hace trg_auto_journal_void.
--   3. create_account_receivable: una factura anulada deja su cartera 'cancelled'
--      con saldo 0 (antes 'paid'); calculate_days_overdue respeta 'cancelled'.
--      Dato: 22 carteras de facturas anuladas pasan por la función canónica
--      (2 tenían saldo vivo: deuda fantasma).
--   4. fn_caja_abierta_para comprueba la pertenencia a la organización.
--   5. fn_stock_entrada: entrada de kardex genérica (origen y documento propios).
--   6. fn_auto_journal_sale no devenga dos veces: una factura con venta espejo
--      puede tener un devengo con la clave 'accrual:invoice:<id>' y el disparador
--      buscaba solo 'accrual:sale:<sale_id>'; si el primero seguía vivo, creaba
--      un SEGUNDO asiento (ingreso doble). Ahora, si ya hay un devengo vivo con
--      cualquiera de las dos claves, no crea otro. Ningún asiento existente se toca.
--      [Nota corregida tras aplicar, el SQL es idéntico: el comentario aplicado
--      decía que 31 de 36 borradores tenían un devengo VIVO; tienen devengo, pero
--      los 31 ya estaban revertidos por el cierre contable del 2026-09-23 (0 vivos).
--      El cambio queda como prevención.]

-- ── 4 ── fn_caja_abierta_para con pertenencia ───────────────────────────────
create or replace function public.fn_caja_abierta_para(p_org integer, p_branch integer, p_user uuid)
 returns integer
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_id integer;
begin
  perform public.fn_assert_acceso_org(p_org);
  select cs.id into v_id
    from public.cash_sessions cs
   where cs.organization_id = p_org
     and cs.status = 'open'
     and case when coalesce((select os.settings->>'mode' from public.organization_settings os
                              where os.organization_id = p_org and os.key = 'pos_cash_session_mode'), 'branch') = 'user'
              then cs.branch_id is not distinct from p_branch and cs.opened_by = p_user
              else (cs.branch_id is not distinct from p_branch or cs.branch_id is null) end
   order by (cs.branch_id is null), cs.opened_at desc
   limit 1;
  return v_id;
end;
$function$;

revoke all on function public.fn_caja_abierta_para(integer, integer, uuid) from public, anon;
grant execute on function public.fn_caja_abierta_para(integer, integer, uuid) to authenticated, service_role;

-- ── 3 ── Cartera de una factura anulada ─────────────────────────────────────
create or replace function public.create_account_receivable(invoice_id_param text)
 returns uuid
 language plpgsql
 security definer
as $function$
DECLARE
  ar_id UUID;
  invoice_record RECORD;
  v_anulada boolean;
BEGIN
  perform public.fn_assert_acceso_org((select i.organization_id from public.invoice_sales i where i.id = invoice_id_param::uuid));
  BEGIN
    SELECT * INTO invoice_record FROM invoice_sales WHERE id = invoice_id_param::UUID;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Error al convertir o buscar factura con ID %: %', invoice_id_param, SQLERRM;
  END;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Factura no encontrada con ID: %', invoice_id_param;
  END IF;

  v_anulada := invoice_record.status IN ('void', 'voided', 'cancelled');

  SELECT id INTO ar_id FROM accounts_receivable WHERE invoice_id = invoice_id_param::UUID LIMIT 1;

  IF FOUND THEN
    UPDATE accounts_receivable
    SET
      amount = invoice_record.total,
      balance = CASE WHEN v_anulada THEN 0 ELSE invoice_record.balance END,
      status = CASE
                WHEN v_anulada THEN 'cancelled'
                WHEN invoice_record.balance <= 0 THEN 'paid'
                WHEN invoice_record.balance < invoice_record.total THEN 'partial'
                WHEN invoice_record.due_date < NOW() THEN 'overdue'
                ELSE 'current'
              END,
      updated_at = NOW()
    WHERE id = ar_id;

    RETURN ar_id;
  ELSE
    INSERT INTO accounts_receivable (
      id, organization_id, customer_id, invoice_id, sale_id, amount, balance, due_date,
      status, days_overdue, created_at, updated_at
    ) VALUES (
      gen_random_uuid(),
      invoice_record.organization_id,
      invoice_record.customer_id,
      invoice_record.id,
      invoice_record.sale_id,
      invoice_record.total,
      CASE WHEN v_anulada THEN 0 ELSE invoice_record.balance END,
      invoice_record.due_date,
      CASE
        WHEN v_anulada THEN 'cancelled'
        WHEN invoice_record.balance <= 0 THEN 'paid'
        WHEN invoice_record.balance < invoice_record.total THEN 'partial'
        WHEN invoice_record.due_date < NOW() THEN 'overdue'
        ELSE 'current'
      END,
      CASE
        WHEN NOT v_anulada AND invoice_record.due_date < NOW() THEN EXTRACT(DAY FROM NOW() - invoice_record.due_date)::integer
        ELSE 0
      END,
      NOW(),
      NOW()
    )
    RETURNING id INTO ar_id;

    RETURN ar_id;
  END IF;
END;
$function$;

create or replace function public.calculate_days_overdue()
 returns trigger
 language plpgsql
as $function$
DECLARE
  v_today date;
BEGIN
  -- Una cartera anulada no vence ni se marca pagada.
  IF NEW.status = 'cancelled' THEN
    NEW.days_overdue := 0;
    RETURN NEW;
  END IF;

  -- Calcular dias de atraso si hay fecha de vencimiento y balance pendiente
  IF NEW.due_date IS NOT NULL AND NEW.balance > 0 THEN
    -- El dia calendario sale de la sucursal de la cuenta, y si no la tiene,
    -- de su organizacion. Nunca del dia UTC del servidor.
    v_today := public.fn_today_for(NEW.organization_id, NEW.branch_id);

    IF NEW.due_date::date < v_today THEN
      NEW.days_overdue := (v_today - NEW.due_date::date)::integer;
      IF NEW.status = 'current' THEN
        NEW.status := 'overdue';
      END IF;
    ELSE
      NEW.days_overdue := 0;
      IF NEW.status = 'overdue' AND NEW.balance = NEW.amount THEN
        NEW.status := 'current';
      END IF;
    END IF;
  ELSE
    NEW.days_overdue := 0;
    IF NEW.balance = 0 THEN
      NEW.status := 'paid';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- Dato: carteras de facturas ya anuladas, por la función canónica.
select public.create_account_receivable(i.id::text)
  from public.invoice_sales i
 where i.status in ('void', 'voided', 'cancelled')
   and exists (select 1 from public.accounts_receivable a where a.invoice_id = i.id and a.status is distinct from 'cancelled');

-- ── 5 ── Entrada de kardex genérica ─────────────────────────────────────────
create or replace function public.fn_stock_entrada(
  p_organization_id integer, p_branch_id integer, p_product_id integer, p_qty numeric,
  p_unit_cost numeric, p_source text, p_source_id text, p_note text, p_updated_by uuid)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_sl record;
  v_mov integer;
begin
  if p_qty is null or p_qty <= 0 then
    raise exception 'cantidad_invalida' using errcode = '22023';
  end if;
  select id into v_sl from public.stock_levels
   where product_id = p_product_id and branch_id = p_branch_id and lot_id is null
   order by id limit 1 for update;
  if v_sl.id is null then
    insert into public.stock_levels (product_id, branch_id, lot_id, qty_on_hand, qty_reserved, avg_cost, min_level)
    values (p_product_id, p_branch_id, null, p_qty, 0, coalesce(p_unit_cost, 0), 0);
  else
    update public.stock_levels set qty_on_hand = coalesce(qty_on_hand, 0) + p_qty, updated_at = now() where id = v_sl.id;
  end if;
  insert into public.stock_movements (organization_id, branch_id, product_id, lot_id, direction, qty, unit_cost,
                                      source, source_id, note, updated_by)
  values (p_organization_id, p_branch_id, p_product_id, null, 'in', p_qty, coalesce(p_unit_cost, 0),
          p_source, p_source_id, p_note, p_updated_by)
  returning id into v_mov;
  return v_mov;
end;
$function$;

revoke all on function public.fn_stock_entrada(integer, integer, integer, numeric, numeric, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.fn_stock_entrada(integer, integer, integer, numeric, numeric, text, text, text, uuid) to service_role;

-- ── 1 ── Emitir ─────────────────────────────────────────────────────────────
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
  end if;

  return jsonb_build_object('id', v_inv.id, 'numero', v_numero, 'status', 'issued',
                            'stock_descontado', v_descontar and v_lineas > 0, 'productos', v_lineas);
end;
$function$;

revoke all on function public.fn_factura_venta_emitir(uuid) from public, anon;
grant execute on function public.fn_factura_venta_emitir(uuid) to authenticated, service_role;

-- ── 2 ── Anular ─────────────────────────────────────────────────────────────
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
  v_devueltos integer := 0;
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
  -- L4: con pagos va por nota crédito (misma regla que puedeAnular).
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

  insert into public.finance_audit_log (organization_id, entity, entity_id, action, user_id, diff, reason)
  values (v_inv.organization_id, 'invoice_sales', v_inv.id::text, 'void', v_uid,
          jsonb_build_object('number', v_inv.number, 'total', v_inv.total, 'productos_devueltos', v_devueltos),
          btrim(p_motivo));

  return jsonb_build_object('id', v_inv.id, 'status', 'void', 'productos_devueltos', v_devueltos);
end;
$function$;

revoke all on function public.fn_factura_venta_anular(uuid, text) from public, anon;
grant execute on function public.fn_factura_venta_anular(uuid, text) to authenticated, service_role;

-- ── 6 ── Un solo devengo por factura (claves accrual:invoice y accrual:sale) ─
create or replace function public.fn_auto_journal_sale()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
DECLARE
    v_rule RECORD;
    v_entry_id integer;
    v_base_key text;
    v_fact_key text;
    v_prev_id integer;
    v_i integer;
BEGIN
    IF NEW.document_type IS NOT NULL AND NEW.document_type <> 'invoice' THEN
        RETURN NEW;
    END IF;

    IF NEW.status IS NULL OR NEW.status NOT IN ('issued', 'paid', 'partial') THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.status IN ('issued', 'paid', 'partial') THEN
        RETURN NEW;
    END IF;

    -- Ya hay un devengo vivo de esta factura (con la clave de la factura o con
    -- la de su venta): no se crea otro.
    IF EXISTS (
        SELECT 1 FROM journal_entries je
         WHERE je.organization_id = NEW.organization_id
           AND (je.fact_key LIKE 'accrual:invoice:' || NEW.id::text || '%'
                OR (NEW.sale_id IS NOT NULL AND je.fact_key LIKE 'accrual:sale:' || NEW.sale_id::text || '%'))
           AND NOT EXISTS (SELECT 1 FROM journal_entries r
                            WHERE r.organization_id = je.organization_id AND r.fact_key = 'reversal:' || je.id)
    ) THEN
        RETURN NEW;
    END IF;

    v_base_key := CASE
        WHEN NEW.sale_id IS NOT NULL THEN 'accrual:sale:' || NEW.sale_id::text
        ELSE 'accrual:invoice:' || NEW.id::text
    END;

    v_fact_key := v_base_key;
    FOR v_i IN 1..20 LOOP
        SELECT id INTO v_prev_id FROM journal_entries
        WHERE organization_id = NEW.organization_id AND fact_key = v_fact_key;
        EXIT WHEN v_prev_id IS NULL;
        EXIT WHEN NOT EXISTS (
            SELECT 1 FROM journal_entries
            WHERE organization_id = NEW.organization_id AND fact_key = 'reversal:' || v_prev_id);
        v_fact_key := v_base_key || ':reemision:' || v_i;
    END LOOP;

    SELECT * INTO v_rule FROM fn_regla_devengo_venta(NEW.organization_id);

    IF v_rule.debit_account_code IS NULL THEN
        PERFORM fn_log_journal_failure(
            NEW.organization_id, NEW.branch_id, COALESCE(NEW.issue_date, now()),
            'invoice_sales', NEW.id::text, v_fact_key, NULL, NULL, NEW.total,
            'no_rule', 'Sin regla contable activa de venta con cuenta de ingreso');
        RETURN NEW;
    END IF;

    v_entry_id := fn_create_journal_entry(
        p_organization_id := NEW.organization_id,
        p_branch_id := NEW.branch_id,
        p_entry_date := COALESCE(NEW.issue_date, now()),
        p_memo := 'Venta ' || COALESCE(NEW.number, NEW.id::text),
        p_source := 'invoice_sales',
        p_source_id := NEW.id::text,
        p_debit_account := v_rule.debit_account_code,
        p_credit_account := v_rule.credit_account_code,
        p_amount := NEW.total,
        p_tax_account := v_rule.tax_account_code,
        p_tax_amount := CASE WHEN v_rule.use_tax_from_document THEN NEW.tax_total ELSE 0 END,
        p_created_by := NEW.created_by,
        p_tax_is_credit := true,
        p_fact_key := v_fact_key
    );

    RETURN NEW;
END;
$function$;
