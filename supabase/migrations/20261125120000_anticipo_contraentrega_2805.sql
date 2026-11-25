-- GO-contraentrega · Anticipo de contraentrega a 2805 (criterio del Contador, 2026-11-24)
--
-- Hasta hoy el cobro del anticipo (payments source='web_order', concepto 'anticipo_contraentrega')
-- se contabilizaba con la regla genérica de cobros: Dr 138020xx (la pasarela) / Cr 1305 Clientes.
-- El Contador pidió:
--   1. Recibo:      Dr 138020xx (o 1105/1110) / Cr 2805 Anticipos recibidos · tercero = cliente.
--   2. Al facturar: Dr 2805 / Cr 1305 (el anticipo se cruza con la cartera de la factura).
--   3. Devolver:    Dr 2805 / Cr pasarela-banco-caja (la comisión no devuelta es gasto; esa ya
--                   queda en 53051501 cuando la pasarela liquida). Ver la migración 20261125121000.
--
-- Esta migración:
--   a) fn_auto_journal_payment: el anticipo acredita 2805 (fn_asegurar_cuenta_anticipos la crea
--      si el plan no la tiene). El resto de cobros no cambia.
--   b) fn_tercero_de_documento('pedido_web', <pedido>): el cliente del pedido (o consumidor final).
--   c) fn_trg_tercero_linea_asiento: las líneas 2805/1305 de los asientos del anticipo llevan como
--      tercero al cliente del pedido (antes quedaban sin tercero).
--   d) Cruce al facturar: cuando fn_cobrar_pedido_web_en_caja pasa el pago del anticipo a la
--      factura (UPDATE payments.source web_order → invoice_sales), un disparador registra
--      Dr 2805 / Cr 1305 una sola vez (fact_key web_order_advance:apply:<pago>), y solo si el
--      anticipo está en 2805 (recibo nuevo o reclasificado).
--   e) Reclasificación de los anticipos YA registrados en 1305 (nunca se editan asientos
--      existentes): un asiento de ajuste por pago, Dr 1305 / Cr 2805, fecha de hoy,
--      fact_key web_order_advance:reclass:<pago>, source 'web_order_advance', source_id = pedido.
--      Solo los pagos que siguen en el pedido (source='web_order'): si ya pasaron a una factura,
--      el 1305 que acreditó el recibo ya cruzó la cartera de esa factura y no hay nada que mover.
--
-- Asientos de ajuste al aplicar (2026-11-25): 13 pagos, todos de la org 358, $ 20.000 cada uno,
-- total $ 260.000 (Dr 1305 / Cr 2805). PENDIENTE: que el Contador confirme la reclasificación y
-- el tercero (cliente del pedido) en 2805.
--
-- Idempotente: CREATE OR REPLACE y fact_key únicos (fn_create_journal_entry no repite un asiento
-- con la misma fact_key).

-- ─────────────────────────────────────────────────────────────────────────────
-- b) Tercero de un pedido web: su cliente; sin cliente, consumidor final.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_tercero_de_documento(p_tipo text, p_id uuid, OUT nit text, OUT nombre text)
 RETURNS record
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_org integer;
begin
  nit := null;
  nombre := null;
  if p_tipo in ('venta', 'nota_debito', 'nota_credito') then
    select coalesce(nullif(btrim(c.identification_number), ''), nullif(btrim(c.doc_number), '')),
           nullif(btrim(c.full_name), ''),
           i.organization_id
      into nit, nombre, v_org
      from public.invoice_sales i
      left join public.customers c
        on c.id = i.customer_id
       and c.organization_id = i.organization_id
     where i.id = p_id;

    -- El devengo del POS usa el id de la venta, que no es el id de la factura.
    if not found and p_tipo = 'venta' then
      select coalesce(nullif(btrim(c.identification_number), ''), nullif(btrim(c.doc_number), '')),
             nullif(btrim(c.full_name), ''),
             s.organization_id
        into nit, nombre, v_org
        from public.sales s
        left join public.customers c
          on c.id = s.customer_id
         and c.organization_id = s.organization_id
       where s.id = p_id;
    end if;

    if nit is null then
      select t.nit, t.nombre
        into nit, nombre
        from public.fn_consumidor_final_contable(v_org) t;
    end if;
  elsif p_tipo = 'pedido_web' then
    -- Anticipo de contraentrega (20261125120000): el cliente del pedido web.
    select coalesce(nullif(btrim(c.identification_number), ''), nullif(btrim(c.doc_number), '')),
           coalesce(nullif(btrim(c.full_name), ''), nullif(btrim(w.customer_name), '')),
           w.organization_id
      into nit, nombre, v_org
      from public.web_orders w
      left join public.customers c
        on c.id = w.customer_id
       and c.organization_id = w.organization_id
     where w.id = p_id;
    if nit is null and v_org is not null then
      select t.nit, t.nombre
        into nit, nombre
        from public.fn_consumidor_final_contable(v_org) t;
    end if;
  elsif p_tipo = 'compra' then
    select coalesce(nullif(btrim(s.nit), ''), nullif(btrim(s.tax_id), '')),
           nullif(btrim(s.name), '')
      into nit, nombre
      from public.invoice_purchase i
      left join public.suppliers s on s.id = i.supplier_id
     where i.id = p_id;
  elsif p_tipo = 'documento_soporte' then
    select coalesce(nullif(btrim(s.nit), ''), nullif(btrim(s.tax_id), ''), nullif(btrim(d.provider->>'identification'), '')),
           coalesce(nullif(btrim(s.name), ''), nullif(btrim(d.provider->>'names'), ''))
      into nit, nombre
      from public.support_documents d
      left join public.suppliers s on s.id = d.supplier_id
     where d.id = p_id;
  end if;
end;
$function$;

-- Pedido web del anticipo de un pago (el pago está en el pedido o ya pasó a la factura).
CREATE OR REPLACE FUNCTION public.fn_anticipo_pedido_web_de_pago(p_payment_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(
    (select w.id from public.web_orders w
      where p.source = 'web_order' and w.id::text = p.source_id and w.organization_id = p.organization_id),
    (select w.id from public.invoice_sales i
       join public.web_orders w on w.sale_id = i.sale_id and w.organization_id = i.organization_id
      where p.source = 'invoice_sales' and i.id::text = p.source_id
      limit 1))
    from public.payments p
   where p.id = p_payment_id
     and coalesce(p.processor_response->>'concepto', '') = 'anticipo_contraentrega';
$function$;

-- ¿El anticipo de este pago está en 2805? (recibo nuevo a 2805, o recibo viejo ya reclasificado).
CREATE OR REPLACE FUNCTION public.fn_anticipo_en_2805(p_payment_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists (
    select 1
      from public.payments p
      join public.journal_entries e
        on e.organization_id = p.organization_id
       and e.fact_key in ('settlement:payment:' || p.id::text, 'web_order_advance:reclass:' || p.id::text)
      join public.journal_lines l on l.journal_entry_id = e.id
     where p.id = p_payment_id
       and l.account_code like '2805%'
       and l.credit > 0);
$function$;

REVOKE ALL ON FUNCTION public.fn_anticipo_pedido_web_de_pago(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_anticipo_en_2805(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_anticipo_pedido_web_de_pago(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_anticipo_en_2805(uuid) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- c) Tercero en las líneas del anticipo.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_trg_tercero_linea_asiento()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_source text;
  v_source_id text;
  v_org integer;
  v_fact text;
  v_nit text;
  v_nombre text;
  v_persona uuid;
  v_sale uuid;
  v_pedido uuid;
begin
  if new.tercero_nit is not null then
    return new;
  end if;
  select e.source, e.source_id, e.organization_id, e.fact_key
    into v_source, v_source_id, v_org, v_fact
    from public.journal_entries e
   where e.id = new.journal_entry_id;
  -- Cuenta por cobrar a un procesador de pago (138020xx): el tercero es el
  -- procesador, en cualquier asiento (cobro, abono, anulación). Contador 2026-11-21.
  if new.account_code like '138020%' and new.tercero_nombre is null then
    select p.nit, p.nombre into v_nit, v_nombre
      from public.fn_procesador_pago_por_cuenta(v_org, new.account_code) p;
    if v_nombre is not null then
      new.tercero_nit := v_nit;
      new.tercero_nombre := v_nombre;
      return new;
    end if;
  end if;
  -- Anticipo de contraentrega (20261125120000): 2805 y 1305 con el cliente del pedido, en el
  -- recibo (source payments), el ajuste, el cruce al facturar y la devolución (web_order_advance).
  if (new.account_code like '2805%' or new.account_code like '1305%')
     and (v_source = 'web_order_advance'
          or (v_source = 'payments' and new.account_code like '2805%')) then
    begin
      if v_source = 'web_order_advance' then
        v_pedido := v_source_id::uuid;
      else
        v_pedido := public.fn_anticipo_pedido_web_de_pago(v_source_id::uuid);
      end if;
    exception when others then
      v_pedido := null;
    end;
    if v_pedido is not null then
      select t.nit, t.nombre into v_nit, v_nombre
        from public.fn_tercero_de_documento('pedido_web', v_pedido) t;
      if v_nit is not null then
        new.tercero_nit := v_nit;
        new.tercero_nombre := coalesce(new.tercero_nombre, v_nombre);
      end if;
    end if;
    return new;
  end if;
  -- sales: el devengo del POS. La factura, si llega después, reutiliza la misma clave.
  if v_source is null or v_source not in ('invoice_sales', 'invoice_purchase', 'credit_note', 'cash_movements', 'support_documents', 'sales',
                                          'supplier_advance', 'supplier_advance_application', 'supplier_advance_refund',
                                          'tips', 'tip_settlements') then
    return new;
  end if;

  if v_source = 'cash_movements' then
    select nullif(btrim(cm.tercero_nit), ''), nullif(btrim(cm.tercero_nombre), '')
      into v_nit, v_nombre
      from public.cash_movements cm
     where cm.id::text = v_source_id and cm.organization_id = v_org;
  elsif v_source = 'invoice_purchase' then
    select t.nit, t.nombre into v_nit, v_nombre
      from public.fn_tercero_de_documento('compra', v_source_id::uuid) t;
  elsif v_source = 'support_documents' then
    select t.nit, t.nombre into v_nit, v_nombre
      from public.fn_tercero_de_documento('documento_soporte', v_source_id::uuid) t;
  elsif v_source in ('supplier_advance', 'supplier_advance_application', 'supplier_advance_refund') then
    select t.nit, t.nombre into v_nit, v_nombre
      from public.fn_tercero_anticipo_proveedor(v_source, v_source_id) t;
  elsif v_source = 'tips' then
    select tp.sale_id into v_sale from public.tips tp
     where tp.id::text = v_source_id and tp.organization_id = v_org;
    if v_sale is not null then
      select t.nit, t.nombre into v_nit, v_nombre
        from public.fn_tercero_de_documento('venta', v_sale) t;
    end if;
  elsif v_source = 'tip_settlements' then
    -- fact_key 'tip_settlement:<liquidación>:<persona>'
    begin
      v_persona := split_part(coalesce(v_fact, ''), ':', 3)::uuid;
    exception when others then
      v_persona := null;
    end;
    if v_persona is not null then
      select nullif(btrim(i.doc_number), ''), public.fn_hr_nombre_persona(hp.id)
        into v_nit, v_nombre
        from public.hr_people hp
        left join public.hr_people_identification i on i.person_id = hp.id
       where hp.organization_id = v_org and hp.user_id = v_persona
       order by (i.doc_number is null), hp.created_at
       limit 1;
      if v_nombre is null then
        select nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), '') into v_nombre
          from public.profiles p where p.id = v_persona;
      end if;
    end if;
    if v_nit is null then
      select nullif(btrim(coalesce(o.nit, o.tax_id)), ''),
             coalesce(nullif(btrim(o.legal_name), ''), o.name)
               || case when v_nombre is not null then ' · propinas de ' || v_nombre else '' end
        into v_nit, v_nombre
        from public.organizations o where o.id = v_org;
    end if;
  else
    select t.nit, t.nombre into v_nit, v_nombre
      from public.fn_tercero_de_documento('venta', v_source_id::uuid) t;
  end if;

  if v_nit is not null then
    new.tercero_nit := v_nit;
    new.tercero_nombre := coalesce(new.tercero_nombre, v_nombre);
  end if;
  return new;
exception when others then
  return new;
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- a) El recibo del anticipo acredita 2805.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_auto_journal_payment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_rule RECORD;
    v_entry_id integer;
    v_source_type text;
    v_es_cobro boolean;
    v_memo text;
    v_money_account text;
    v_counterpart text;
    v_discount numeric := 0;
    v_discount_account text;
    v_anticipo boolean := false;
BEGIN
    IF NEW.status IS NOT NULL AND NEW.status <> 'completed' THEN
        RETURN NEW;
    END IF;

    IF NEW.source IN ('invoice_sales', 'account_receivable', 'sale', 'web_order') THEN
        v_source_type := 'sale_payment';
        v_es_cobro := true;
        v_memo := 'Cobro recibido';
    ELSIF NEW.source IN ('invoice_purchase', 'account_payable') THEN
        v_source_type := 'purchase_payment';
        v_es_cobro := false;
        v_memo := 'Pago a proveedor';
    ELSE
        RETURN NEW;
    END IF;

    -- Anticipo de contraentrega (20261125120000, Contador 2026-11-24): no es cartera, es un
    -- pasivo con el cliente hasta facturar. Dr pasarela/banco/caja / Cr 2805.
    v_anticipo := NEW.source = 'web_order'
      AND COALESCE(NEW.processor_response->>'concepto', '') = 'anticipo_contraentrega';

    SELECT * INTO v_rule
    FROM accounting_rules
    WHERE organization_id = NEW.organization_id
      AND source_type = v_source_type
      AND is_active = true
    ORDER BY priority
    LIMIT 1;

    IF v_rule IS NULL AND NOT v_anticipo THEN
        PERFORM fn_log_journal_failure(
            NEW.organization_id, NEW.branch_id, COALESCE(NEW.payment_date, NEW.created_at),
            'payments', NEW.id::text, 'settlement:payment:' || NEW.id::text,
            NULL, NULL, NEW.amount,
            'no_rule', 'Sin regla contable activa de ' || v_source_type);
        RETURN NEW;
    END IF;

    -- Cobro con tarjeta o pasarela: a la cuenta por cobrar del procesador (138020xx),
    -- que se salda con el abono. Contador 2026-11-21.
    v_money_account := CASE WHEN v_es_cobro
        THEN fn_cuenta_cobro(NEW.organization_id, NEW.branch_id, NEW.method, NEW.bank_account_id, NEW.processor)
        ELSE fn_money_account_code_pago(NEW.organization_id, NEW.branch_id, NEW.method, NEW.bank_account_id)
    END;

    IF v_anticipo THEN
        PERFORM public.fn_asegurar_cuenta_anticipos(NEW.organization_id);
        v_counterpart := '2805';
        v_memo := 'Anticipo de contraentrega recibido';
    ELSE
        v_counterpart := CASE WHEN v_es_cobro
            THEN v_rule.credit_account_code
            ELSE v_rule.debit_account_code
        END;
    END IF;

    IF v_money_account IS NULL THEN
        IF v_rule IS NULL THEN
            PERFORM fn_log_journal_failure(
                NEW.organization_id, NEW.branch_id, COALESCE(NEW.payment_date, NEW.created_at),
                'payments', NEW.id::text, 'settlement:payment:' || NEW.id::text,
                NULL, v_counterpart, NEW.amount,
                'no_rule', 'Sin cuenta de dinero para el anticipo ni regla de ' || v_source_type);
            RETURN NEW;
        END IF;
        v_money_account := CASE WHEN v_es_cobro
            THEN v_rule.debit_account_code
            ELSE v_rule.credit_account_code
        END;
    END IF;

    IF v_counterpart LIKE '4%' THEN
        PERFORM fn_log_journal_failure(
            NEW.organization_id, NEW.branch_id, COALESCE(NEW.payment_date, NEW.created_at),
            'payments', NEW.id::text, 'settlement:payment:' || NEW.id::text,
            v_money_account, v_counterpart, NEW.amount,
            'no_rule',
            'La regla de ' || v_source_type || ' lleva el cobro a la cuenta de ingreso ' ||
            v_counterpart || '; el ingreso ya se devengó con la venta');
        RETURN NEW;
    END IF;

    IF NOT v_anticipo AND COALESCE(NEW.discount_amount, 0) > 0 AND v_rule.discount_account_code IS NOT NULL
       AND EXISTS (
           SELECT 1 FROM chart_of_accounts
           WHERE organization_id = NEW.organization_id
             AND account_code = v_rule.discount_account_code
       ) THEN
        v_discount := NEW.discount_amount;
        v_discount_account := v_rule.discount_account_code;
    END IF;

    IF v_es_cobro THEN
        v_entry_id := fn_create_journal_entry(
            p_organization_id := NEW.organization_id,
            p_branch_id := NEW.branch_id,
            p_entry_date := COALESCE(NEW.payment_date, NEW.created_at, now()),
            p_memo := v_memo || ' - Ref: ' || COALESCE(NEW.reference, NEW.id::text),
            p_source := 'payments',
            p_source_id := NEW.id::text,
            p_debit_account := v_money_account,
            p_credit_account := v_counterpart,
            p_amount := NEW.amount + v_discount,
            p_tax_account := v_discount_account,
            p_tax_amount := v_discount,
            p_created_by := NEW.created_by,
            p_tax_is_credit := false,
            p_fact_key := 'settlement:payment:' || NEW.id::text
        );
    ELSE
        v_entry_id := fn_create_journal_entry(
            p_organization_id := NEW.organization_id,
            p_branch_id := NEW.branch_id,
            p_entry_date := COALESCE(NEW.payment_date, NEW.created_at, now()),
            p_memo := v_memo || ' - Ref: ' || COALESCE(NEW.reference, NEW.id::text),
            p_source := 'payments',
            p_source_id := NEW.id::text,
            p_debit_account := v_counterpart,
            p_credit_account := v_money_account,
            p_amount := NEW.amount + v_discount,
            p_tax_account := v_discount_account,
            p_tax_amount := v_discount,
            p_created_by := NEW.created_by,
            p_tax_is_credit := true,
            p_fact_key := 'settlement:payment:' || NEW.id::text
        );
    END IF;

    RETURN NEW;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- d) Cruce al facturar: Dr 2805 / Cr 1305, una vez por pago.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_trg_anticipo_pedido_web_aplicado()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_pedido uuid;
  v_wo record;
begin
  if not (old.source = 'web_order' and new.source = 'invoice_sales'
          and coalesce(new.processor_response->>'concepto', '') = 'anticipo_contraentrega'
          and coalesce(new.status, 'completed') = 'completed') then
    return new;
  end if;
  -- Solo si el anticipo está en 2805: si el recibo falló o quedó en 1305 sin reclasificar,
  -- el cruce dejaría 2805 en negativo.
  if not public.fn_anticipo_en_2805(new.id) then
    return new;
  end if;
  begin
    v_pedido := old.source_id::uuid;
  exception when others then
    return new;
  end;
  select w.id, w.organization_id, w.branch_id, w.order_number into v_wo
    from public.web_orders w where w.id = v_pedido and w.organization_id = new.organization_id;
  if v_wo.id is null then
    return new;
  end if;
  perform public.fn_create_journal_entry(
    p_organization_id := new.organization_id,
    p_branch_id := coalesce(new.branch_id, v_wo.branch_id),
    p_entry_date := now(),
    p_memo := 'Anticipo de contraentrega aplicado a la factura - pedido ' || v_wo.order_number,
    p_source := 'web_order_advance',
    p_source_id := v_wo.id::text,
    p_debit_account := '2805',
    p_credit_account := '1305',
    p_amount := new.amount,
    p_created_by := coalesce(auth.uid(), new.created_by),
    p_fact_key := 'web_order_advance:apply:' || new.id::text
  );
  return new;
end;
$function$;

DROP TRIGGER IF EXISTS trg_anticipo_pedido_web_aplicado ON public.payments;
CREATE TRIGGER trg_anticipo_pedido_web_aplicado
  AFTER UPDATE OF source ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.fn_trg_anticipo_pedido_web_aplicado();

-- ─────────────────────────────────────────────────────────────────────────────
-- e) Reclasificación de los anticipos ya registrados en 1305 (asiento de ajuste, nunca edición).
--    Dr 1305 / Cr 2805 por el monto del recibo, tercero = cliente del pedido.
-- ─────────────────────────────────────────────────────────────────────────────
DO $reclasificar$
declare
  v_p record;
  v_n integer := 0;
  v_total numeric := 0;
begin
  for v_p in
    select p.id, p.organization_id, p.branch_id, p.source_id, w.order_number, l.credit as monto
      from public.payments p
      join public.web_orders w on w.id::text = p.source_id and w.organization_id = p.organization_id
      join public.journal_entries e
        on e.organization_id = p.organization_id and e.fact_key = 'settlement:payment:' || p.id::text
      join public.journal_lines l on l.journal_entry_id = e.id and l.account_code = '1305' and l.credit > 0
     where p.source = 'web_order'
       and p.status = 'completed'
       and coalesce(p.processor_response->>'concepto', '') = 'anticipo_contraentrega'
       and not exists (select 1 from public.journal_entries r
                        where r.organization_id = p.organization_id
                          and r.fact_key = 'web_order_advance:reclass:' || p.id::text)
     order by p.created_at
  loop
    perform public.fn_asegurar_cuenta_anticipos(v_p.organization_id);
    perform public.fn_create_journal_entry(
      p_organization_id := v_p.organization_id,
      p_branch_id := v_p.branch_id,
      p_entry_date := now(),
      p_memo := 'Ajuste: anticipo de contraentrega de 1305 a 2805 - pedido ' || v_p.order_number,
      p_source := 'web_order_advance',
      p_source_id := v_p.source_id,
      p_debit_account := '1305',
      p_credit_account := '2805',
      p_amount := v_p.monto,
      p_fact_key := 'web_order_advance:reclass:' || v_p.id::text
    );
    v_n := v_n + 1;
    v_total := v_total + v_p.monto;
  end loop;
  raise notice 'Anticipos reclasificados de 1305 a 2805: % asientos, total %', v_n, v_total;
end
$reclasificar$;
