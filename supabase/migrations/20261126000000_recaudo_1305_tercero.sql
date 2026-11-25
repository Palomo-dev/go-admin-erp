-- GO-contabilidad · La 1305 siempre con tercero (instrucción del Contador, 2026-11-25)
--
-- Instrucción: todo recibo de pago de un cliente acredita la 1305 con el mismo tercero que lleva
-- la factura que cancela; un abono sin factura aplicada va a la 2805 con ese tercero; y el sistema
-- no deja guardar una línea de la 1305 sin tercero (el auxiliar por tercero es el que sirve para
-- cartera, circularización y la exógena, formato 1008). Lo anterior se corrige con ajustes, sin
-- tocar los asientos originales.
--
-- CAUSA. fn_trg_tercero_linea_asiento (BEFORE INSERT en journal_lines) solo ponía tercero en los
-- asientos de factura, venta, compra, caja, propinas y anticipos. Los de source 'payments' (el
-- recibo, fn_auto_journal_payment) no estaban en su lista: la línea Cr 1305 del recibo quedaba sin
-- tercero. Lo mismo el reintegro en efectivo de una devolución (source 'returns') y, por copia, el
-- contra-asiento de un recibo anulado (fn_revertir_asiento_nucleo copia el tercero del original, que
-- era nulo).
--
-- Esta migración:
--   1. Funciones que resuelven el tercero de la cartera:
--        fn_tercero_cliente            cliente → NIT/cédula, o consumidor final (fn_consumidor_final_contable)
--        fn_tercero_cartera_venta      el tercero con el que se devengó la venta en la 1305; si aún no
--                                      hay devengo, fn_tercero_de_documento('venta', …)
--        fn_tercero_cartera_factura    lo mismo para una factura (su devengo es accrual:sale:<venta>)
--        fn_tercero_de_pago            recibo → documento que cancela → su tercero
--        fn_tercero_cartera_de_asiento por origen del asiento (recibo, contra-asiento, devolución,
--                                      saldo a favor y su aplicación, cartera, PMS)
--      Se toma primero el tercero que YA lleva el devengo en el libro: así el recibo cruza
--      exactamente el auxiliar de la factura aunque el cliente se haya editado después.
--   2. fn_trg_tercero_linea_asiento: la 1305 de esos orígenes recibe el tercero; el cruce del anticipo
--      (web_order_advance:apply) usa el mismo tercero del devengo de la factura.
--   3. Restricción: zzz_trg_1305_exige_tercero rechaza una línea 1305/1305xx sin tercero
--      (TERCERO_REQUERIDO_1305). Corre después del que pone el tercero y del de cuentas de título.
--      Solo los ajustes de esta corrección (fact_key recaudo_1305_tercero:…, con
--      app.ajuste_tercero_1305 = on) pueden dejar la contrapartida «sin tercero».
--   4. Ajustes del año 2026 (todas las organizaciones): por cada línea 1305 sin tercero de un recibo,
--      de su anulación o del reintegro de una devolución, un asiento de ajuste publicado con fecha de
--      hoy que mueve el valor de «sin tercero» al tercero del cliente (Dr 1305 sin tercero / Cr 1305
--      cliente para el recibo; al revés para la anulación y el reintegro). fact_key
--      recaudo_1305_tercero:<línea original>, source/source_id del recibo (o de la devolución), nota
--      «Asignación de tercero a recaudo 1305 · recibo …» y comprobante de nota contable (NA), no de
--      recibo de caja. No cambia el saldo de la cuenta, solo el del auxiliar. Los recibos sin cliente
--      identificable NO se ajustan: quedan en la lista del informe al Contador.
--
-- Abono sin factura aplicada (2805): hoy la única vía de cobro sin documento en la cartera es el
-- anticipo de contraentrega, que desde 20261125120000 acredita la 2805 con el cliente del pedido y
-- se cruza Dr 2805 / Cr 1305 al facturar (una vez, web_order_advance:apply:<pago>). El saldo a favor
-- (fn_create_customer_credit, Dr 1305 / Cr 2805) y su aplicación (Dr 2805 / Cr 1305) reciben aquí su
-- tercero. Los demás recibos sí cancelan un documento devengado en la 1305 (factura o venta del
-- pedido); en 415 de 1.572 recibos de 2026 el devengo se registró segundos DESPUÉS del recibo, así
-- que «no hay devengo todavía» no sirve para mandar un recibo a la 2805: se dejan en la 1305.
--
-- Resultado al aplicar (2026-11-25): 1.604 ajustes por $ 109.916.907 en 8 organizaciones
-- (1.586 recibos, 17 anulaciones de recibo, 1 reintegro de devolución); 0 líneas sin cliente
-- identificable. Todos al consumidor final 222222222222, porque el devengo de cada factura que
-- cancelan ya lleva ese tercero (fn_tercero_de_documento: cliente sin NIT/cédula → consumidor
-- final). Después: 1305 «sin tercero» = 0 en cada organización; saldo total de la 1305 igual.
--
-- Idempotente: CREATE OR REPLACE, DROP TRIGGER IF EXISTS y fact_key únicos.
-- Reversión: supabase/rollbacks/20261126000000_recaudo_1305_tercero_rollback.sql

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Resolución del tercero de la cartera.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_tercero_cliente(p_org integer, p_customer uuid, OUT nit text, OUT nombre text)
 RETURNS record
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  nit := null;
  nombre := null;
  if p_org is null then
    return;
  end if;
  if p_customer is not null then
    select coalesce(nullif(btrim(c.identification_number), ''), nullif(btrim(c.doc_number), '')),
           nullif(btrim(c.full_name), '')
      into nit, nombre
      from public.customers c
     where c.id = p_customer and c.organization_id = p_org;
  end if;
  -- Sin cliente o sin documento: consumidor final, la misma regla de fn_tercero_de_documento.
  if nit is null then
    select t.nit, t.nombre into nit, nombre from public.fn_consumidor_final_contable(p_org) t;
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_tercero_cartera_venta(p_org integer, p_sale uuid, OUT nit text, OUT nombre text)
 RETURNS record
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  nit := null;
  nombre := null;
  if p_org is null or p_sale is null then
    return;
  end if;
  -- El tercero con el que la venta entró a la 1305 (devengo accrual:sale:<venta>).
  select l.tercero_nit, l.tercero_nombre
    into nit, nombre
    from public.journal_entries e
    join public.journal_lines l on l.journal_entry_id = e.id
   where e.organization_id = p_org
     and e.fact_key = 'accrual:sale:' || p_sale::text
     and l.account_code like '1305%'
     and l.debit > 0
     and nullif(btrim(l.tercero_nit), '') is not null
   order by l.id
   limit 1;
  -- Aún sin devengo (el recibo puede llegar antes): la misma regla con la que se devengará.
  if nit is null and exists (select 1 from public.sales s where s.id = p_sale and s.organization_id = p_org) then
    select t.nit, t.nombre into nit, nombre from public.fn_tercero_de_documento('venta', p_sale) t;
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_tercero_cartera_factura(p_invoice uuid, OUT nit text, OUT nombre text)
 RETURNS record
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_org integer;
  v_sale uuid;
begin
  nit := null;
  nombre := null;
  select i.organization_id, i.sale_id into v_org, v_sale
    from public.invoice_sales i where i.id = p_invoice;
  if v_org is null then
    return;
  end if;
  if v_sale is not null then
    select l.tercero_nit, l.tercero_nombre into nit, nombre
      from public.journal_entries e
      join public.journal_lines l on l.journal_entry_id = e.id
     where e.organization_id = v_org
       and e.fact_key = 'accrual:sale:' || v_sale::text
       and l.account_code like '1305%'
       and l.debit > 0
       and nullif(btrim(l.tercero_nit), '') is not null
     order by l.id
     limit 1;
  end if;
  if nit is null then
    select l.tercero_nit, l.tercero_nombre into nit, nombre
      from public.journal_entries e
      join public.journal_lines l on l.journal_entry_id = e.id
     where e.organization_id = v_org
       and e.source = 'invoice_sales'
       and e.source_id = p_invoice::text
       and e.fact_key like 'accrual:sale:%'
       and l.account_code like '1305%'
       and l.debit > 0
       and nullif(btrim(l.tercero_nit), '') is not null
     order by l.id
     limit 1;
  end if;
  if nit is null then
    select t.nit, t.nombre into nit, nombre from public.fn_tercero_de_documento('venta', p_invoice) t;
  end if;
end;
$function$;

-- Cuenta por cobrar (accounts_receivable): su factura, si no su venta, si no su cliente.
CREATE OR REPLACE FUNCTION public.fn_tercero_cartera_cxc(p_ar uuid, OUT nit text, OUT nombre text)
 RETURNS record
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_ar record;
begin
  nit := null;
  nombre := null;
  select a.organization_id, a.invoice_id, a.sale_id, a.customer_id into v_ar
    from public.accounts_receivable a where a.id = p_ar;
  if v_ar.organization_id is null then
    return;
  end if;
  if v_ar.invoice_id is not null then
    select t.nit, t.nombre into nit, nombre from public.fn_tercero_cartera_factura(v_ar.invoice_id) t;
  end if;
  if nit is null and v_ar.sale_id is not null then
    select t.nit, t.nombre into nit, nombre from public.fn_tercero_cartera_venta(v_ar.organization_id, v_ar.sale_id) t;
  end if;
  if nit is null then
    select t.nit, t.nombre into nit, nombre from public.fn_tercero_cliente(v_ar.organization_id, v_ar.customer_id) t;
  end if;
end;
$function$;

-- Reserva (PMS): su huésped titular.
CREATE OR REPLACE FUNCTION public.fn_tercero_reserva(p_reservation uuid, OUT nit text, OUT nombre text)
 RETURNS record
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_org integer;
  v_cliente uuid;
begin
  nit := null;
  nombre := null;
  select r.organization_id, r.customer_id into v_org, v_cliente
    from public.reservations r where r.id = p_reservation;
  if v_org is not null then
    select t.nit, t.nombre into nit, nombre from public.fn_tercero_cliente(v_org, v_cliente) t;
  end if;
end;
$function$;

-- Recibo → documento que cancela → el tercero de su cartera.
CREATE OR REPLACE FUNCTION public.fn_tercero_de_pago(p_payment uuid, OUT nit text, OUT nombre text)
 RETURNS record
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_p record;
  v_doc text;
  v_wo record;
  v_res uuid;
  v_cliente uuid;
begin
  nit := null;
  nombre := null;
  select p.id, p.organization_id, p.source, p.source_id,
         coalesce(p.processor_response->>'concepto', '') as concepto
    into v_p
    from public.payments p where p.id = p_payment;
  if v_p.id is null then
    return;
  end if;
  v_doc := nullif(btrim(v_p.source_id), '');
  if v_doc is null then
    return;
  end if;

  begin
    if v_p.source = 'invoice_sales' then
      select t.nit, t.nombre into nit, nombre from public.fn_tercero_cartera_factura(v_doc::uuid) t;

    elsif v_p.source = 'web_order' then
      select w.id, w.sale_id into v_wo
        from public.web_orders w
       where w.id::text = v_doc and w.organization_id = v_p.organization_id;
      if v_wo.id is null then
        return;
      end if;
      if v_p.concepto = 'anticipo_contraentrega' then
        -- El tercero con el que el anticipo quedó en el libro (reclasificación o recibo a 2805).
        select l.tercero_nit, l.tercero_nombre into nit, nombre
          from public.journal_entries e
          join public.journal_lines l on l.journal_entry_id = e.id
         where e.organization_id = v_p.organization_id
           and e.fact_key in ('web_order_advance:reclass:' || v_p.id::text, 'settlement:payment:' || v_p.id::text)
           and (l.account_code like '1305%' or l.account_code like '2805%')
           and nullif(btrim(l.tercero_nit), '') is not null
         order by (e.fact_key like 'web_order_advance:reclass:%') desc, l.id
         limit 1;
      elsif v_wo.sale_id is not null then
        -- Pago de un pedido cuya venta ya está (o estará) devengada en la 1305.
        select t.nit, t.nombre into nit, nombre
          from public.fn_tercero_cartera_venta(v_p.organization_id, v_wo.sale_id) t;
      end if;
      if nit is null then
        select t.nit, t.nombre into nit, nombre from public.fn_tercero_de_documento('pedido_web', v_wo.id) t;
      end if;

    elsif v_p.source = 'sale' then
      select t.nit, t.nombre into nit, nombre
        from public.fn_tercero_cartera_venta(v_p.organization_id, v_doc::uuid) t;

    elsif v_p.source = 'account_receivable' then
      select t.nit, t.nombre into nit, nombre from public.fn_tercero_cartera_cxc(v_doc::uuid) t;

    elsif v_p.source = 'folio' then
      select f.reservation_id into v_res from public.folios f where f.id::text = v_doc;
      if v_res is not null then
        select t.nit, t.nombre into nit, nombre from public.fn_tercero_reserva(v_res) t;
      end if;

    elsif v_p.source = 'customer_credit_refund' then
      select cn.customer_id into v_cliente
        from public.credit_notes cn
       where cn.id::text = v_doc and cn.organization_id = v_p.organization_id;
      if found then
        select t.nit, t.nombre into nit, nombre from public.fn_tercero_cliente(v_p.organization_id, v_cliente) t;
      end if;

    elsif v_p.source = 'credit_note' then
      if exists (select 1 from public.invoice_sales i where i.id::text = v_doc) then
        select t.nit, t.nombre into nit, nombre from public.fn_tercero_de_documento('nota_credito', v_doc::uuid) t;
      end if;
    end if;
  exception when invalid_text_representation then
    nit := null;
    nombre := null;
  end;
end;
$function$;

-- Por origen del asiento. p_cuenta distingue la 2805 de la 1305 cuando el asiento las trae a las dos.
CREATE OR REPLACE FUNCTION public.fn_tercero_cartera_de_asiento(p_source text, p_source_id text, p_org integer,
                                                               p_cuenta text DEFAULT '1305', p_nivel integer DEFAULT 0,
                                                               OUT nit text, OUT nombre text)
 RETURNS record
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_id text := nullif(btrim(p_source_id), '');
  v_o record;
  v_r record;
  v_a record;
  v_cliente uuid;
  v_res uuid;
begin
  nit := null;
  nombre := null;
  if p_source is null or v_id is null or p_org is null then
    return;
  end if;

  begin
    if p_source = 'payments' then
      select t.nit, t.nombre into nit, nombre from public.fn_tercero_de_pago(v_id::uuid) t;

    elsif p_source = 'reversal' then
      -- Contra-asiento: el tercero del asiento que revierte (copia el suyo; si era nulo, se resuelve).
      if p_nivel < 3 then
        select e.source, e.source_id into v_o
          from public.journal_entries e
         where e.id = v_id::integer and e.organization_id = p_org;
        if v_o.source is not null and v_o.source <> 'reversal' then
          select t.nit, t.nombre into nit, nombre
            from public.fn_tercero_cartera_de_asiento(v_o.source, v_o.source_id, p_org, p_cuenta, p_nivel + 1) t;
        end if;
      end if;

    elsif p_source = 'returns' then
      -- Reintegro de una devolución: paga la cartera que acreditó su nota crédito.
      select r.sale_id, r.credit_note_invoice_id into v_r
        from public.returns r where r.id = v_id::integer and r.organization_id = p_org;
      if v_r.credit_note_invoice_id is not null then
        select l.tercero_nit, l.tercero_nombre into nit, nombre
          from public.journal_entries e
          join public.journal_lines l on l.journal_entry_id = e.id
         where e.organization_id = p_org
           and e.fact_key = 'accrual:credit_note:' || v_r.credit_note_invoice_id::text
           and l.account_code like '1305%'
           and nullif(btrim(l.tercero_nit), '') is not null
         order by l.id
         limit 1;
        if nit is null then
          select t.nit, t.nombre into nit, nombre
            from public.fn_tercero_de_documento('nota_credito', v_r.credit_note_invoice_id) t;
        end if;
      end if;
      if nit is null and v_r.sale_id is not null then
        select t.nit, t.nombre into nit, nombre from public.fn_tercero_cartera_venta(p_org, v_r.sale_id) t;
      end if;

    elsif p_source = 'customer_credit' then
      -- Saldo a favor: Dr 1305 (cartera de la NC) / Cr 2805, ambos con el cliente del saldo.
      select cn.customer_id into v_cliente
        from public.credit_notes cn where cn.id = v_id::uuid and cn.organization_id = p_org;
      if found then
        select t.nit, t.nombre into nit, nombre from public.fn_tercero_cliente(p_org, v_cliente) t;
      end if;

    elsif p_source = 'customer_credit_application' then
      -- Aplicación del saldo a favor: Dr 2805 (cliente del saldo) / Cr 1305 (cartera de la factura).
      select a.invoice_id, a.credit_note_id into v_a
        from public.credit_note_applications a where a.id = v_id::uuid and a.organization_id = p_org;
      if p_cuenta like '1305%' and v_a.invoice_id is not null then
        select t.nit, t.nombre into nit, nombre from public.fn_tercero_cartera_factura(v_a.invoice_id) t;
      end if;
      if nit is null and v_a.credit_note_id is not null then
        select cn.customer_id into v_cliente
          from public.credit_notes cn where cn.id = v_a.credit_note_id and cn.organization_id = p_org;
        select t.nit, t.nombre into nit, nombre from public.fn_tercero_cliente(p_org, v_cliente) t;
      end if;

    elsif p_source = 'customer_credit_refund' then
      select t.nit, t.nombre into nit, nombre from public.fn_tercero_de_pago(v_id::uuid) t;

    elsif p_source = 'accounts_receivable' then
      select t.nit, t.nombre into nit, nombre from public.fn_tercero_cartera_cxc(v_id::uuid) t;

    elsif p_source = 'folio_items' then
      select f.reservation_id into v_res
        from public.folio_items fi join public.folios f on f.id = fi.folio_id
       where fi.id::text = v_id;
      if v_res is not null then
        select t.nit, t.nombre into nit, nombre from public.fn_tercero_reserva(v_res) t;
      end if;

    elsif p_source = 'folio_payment' then
      select f.reservation_id into v_res
        from public.payments p join public.folios f on f.id::text = p.source_id
       where p.id::text = v_id and p.organization_id = p_org;
      if v_res is not null then
        select t.nit, t.nombre into nit, nombre from public.fn_tercero_reserva(v_res) t;
      end if;

    elsif p_source = 'reservation' then
      select t.nit, t.nombre into nit, nombre from public.fn_tercero_reserva(v_id::uuid) t;

    elsif p_source = 'ota_payout' then
      -- Liquidación de Booking/Expedia: cancela la cartera del huésped de la reserva.
      select d.reservation_id into v_res from public.booking_reservation_details d where d.id = v_id::uuid;
      if v_res is null then
        select d.reservation_id into v_res from public.expedia_reservation_details d where d.id = v_id::uuid;
      end if;
      if v_res is not null then
        select t.nit, t.nombre into nit, nombre from public.fn_tercero_reserva(v_res) t;
      end if;
    end if;
  exception when invalid_text_representation or numeric_value_out_of_range then
    nit := null;
    nombre := null;
  end;
end;
$function$;

REVOKE ALL ON FUNCTION public.fn_tercero_cliente(integer, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_tercero_cartera_venta(integer, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_tercero_cartera_factura(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_tercero_cartera_cxc(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_tercero_reserva(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_tercero_de_pago(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_tercero_cartera_de_asiento(text, text, integer, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_tercero_cliente(integer, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_tercero_cartera_venta(integer, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_tercero_cartera_factura(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_tercero_cartera_cxc(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_tercero_reserva(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_tercero_de_pago(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_tercero_cartera_de_asiento(text, text, integer, text, integer) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. El tercero en la línea: la 1305 de recibos, anulaciones, devoluciones, saldo a favor, cartera y PMS.
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
  v_pago uuid;
  v_factura uuid;
begin
  if new.tercero_nit is not null then
    return new;
  end if;
  select e.source, e.source_id, e.organization_id, e.fact_key
    into v_source, v_source_id, v_org, v_fact
    from public.journal_entries e
   where e.id = new.journal_entry_id;
  -- Ajuste de asignación de tercero (20261126000000): su contrapartida «sin tercero» es a propósito.
  if coalesce(v_fact, '') like 'recaudo_1305_tercero:%' then
    return new;
  end if;
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
  -- La 1305 con el tercero de la factura que cancela (Contador 2026-11-25, 20261126000000): el
  -- recibo, su anulación, el reintegro de una devolución, el saldo a favor y su aplicación (también
  -- su 2805), la cartera y el PMS.
  if v_source in ('payments', 'reversal', 'returns', 'customer_credit', 'customer_credit_application',
                  'customer_credit_refund', 'accounts_receivable', 'folio_items', 'folio_payment',
                  'reservation', 'ota_payout')
     and (new.account_code like '1305%'
          or (new.account_code like '2805%'
              and v_source in ('customer_credit', 'customer_credit_application', 'customer_credit_refund'))) then
    select t.nit, t.nombre into v_nit, v_nombre
      from public.fn_tercero_cartera_de_asiento(v_source, v_source_id, v_org, new.account_code) t;
    if v_nit is not null then
      new.tercero_nit := v_nit;
      new.tercero_nombre := coalesce(new.tercero_nombre, v_nombre);
    end if;
    return new;
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
    -- Cruce y devolución del anticipo (20261125170000): 1305 con el tercero de la factura a la
    -- que se aplicó (el de su devengo) y 2805 con el tercero con el que se recibió el anticipo.
    if v_pedido is not null and v_source = 'web_order_advance' then
      if coalesce(v_fact, '') like 'web_order_advance:apply:%' then
        begin
          v_pago := split_part(v_fact, ':', 3)::uuid;
        exception when others then
          v_pago := null;
        end;
      else
        select p.id into v_pago
          from public.payments p
         where p.organization_id = v_org
           and p.source = 'web_order' and p.source_id = v_pedido::text
           and p.status = 'completed'
           and coalesce(p.processor_response->>'concepto', '') = 'anticipo_contraentrega'
         order by p.created_at
         limit 1;
      end if;
      if v_pago is not null and new.account_code like '1305%' then
        select i.id into v_factura
          from public.payments p
          join public.invoice_sales i on i.id::text = p.source_id and i.organization_id = p.organization_id
         where p.id = v_pago and p.source = 'invoice_sales';
        if v_factura is not null then
          -- 20261126000000: el tercero con el que la factura está en la 1305 (su devengo).
          select t.nit, t.nombre into v_nit, v_nombre
            from public.fn_tercero_cartera_factura(v_factura) t;
        end if;
      elsif v_pago is not null and new.account_code like '2805%' then
        select l.tercero_nit, l.tercero_nombre into v_nit, v_nombre
          from public.journal_entries e
          join public.journal_lines l on l.journal_entry_id = e.id
         where e.organization_id = v_org
           and e.fact_key in ('settlement:payment:' || v_pago::text, 'web_order_advance:reclass:' || v_pago::text)
           and l.account_code like '2805%'
           and l.credit > 0
           and l.tercero_nit is not null
         order by l.id
         limit 1;
      end if;
    end if;
    if v_pedido is not null then
      if v_nit is null then
        select t.nit, t.nombre into v_nit, v_nombre
          from public.fn_tercero_de_documento('pedido_web', v_pedido) t;
      end if;
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
-- 3. Restricción: ninguna línea de la 1305 sin tercero.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_trg_1305_exige_tercero()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_fact text;
  v_source text;
begin
  if new.account_code is null or new.account_code not like '1305%' then
    return new;
  end if;
  if nullif(btrim(coalesce(new.tercero_nit, '')), '') is not null then
    return new;
  end if;
  -- Una línea vieja que ya estaba sin tercero no se vuelve a juzgar al editarse otra columna;
  -- sí se rechaza quitarle el tercero o pasar a la 1305 una línea sin tercero.
  if tg_op = 'UPDATE' and old.account_code like '1305%'
     and nullif(btrim(coalesce(old.tercero_nit, '')), '') is null then
    return new;
  end if;
  select e.fact_key, e.source into v_fact, v_source
    from public.journal_entries e where e.id = new.journal_entry_id;
  -- Contrapartida «sin tercero» de los ajustes de asignación (solo con el interruptor de la corrección).
  if coalesce(current_setting('app.ajuste_tercero_1305', true), '') = 'on'
     and coalesce(v_fact, '') like 'recaudo_1305_tercero:%' then
    return new;
  end if;
  raise exception 'TERCERO_REQUERIDO_1305: la línea de la cuenta % no tiene tercero (asiento %, origen %).',
      new.account_code, new.journal_entry_id, coalesce(v_source, 'manual')
    using errcode = 'P0001',
          detail = 'La 1305 Clientes se lleva por tercero: es el auxiliar de cartera, circularización y exógena (formato 1008).',
          hint = 'Indique el cliente (NIT o cédula) de la línea; si la factura es a consumidor final, el tercero es 222222222222.';
end;
$function$;

REVOKE ALL ON FUNCTION public.fn_trg_1305_exige_tercero() FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Ajustes del año 2026: «sin tercero» → tercero del cliente, línea por línea.
-- ─────────────────────────────────────────────────────────────────────────────
DO $ajustes$
declare
  v_l record;
  v_t record;
  v_c record;
  v_link_source text;
  v_link_id text;
  v_recibo text;
  v_memo text;
  v_entry integer;
  v_monto numeric;
  v_n integer := 0;
  v_total numeric := 0;
  v_sin integer := 0;
begin
  perform set_config('app.ajuste_tercero_1305', 'on', true);

  for v_l in
    select l.id as lid, l.account_code, coalesce(l.debit, 0) as debit, coalesce(l.credit, 0) as credit,
           e.id as eid, e.organization_id as org, e.branch_id, e.source, e.source_id
      from public.journal_lines l
      join public.journal_entries e on e.id = l.journal_entry_id
     where l.account_code like '1305%'
       and nullif(btrim(coalesce(l.tercero_nit, '')), '') is null
       and e.entry_date >= '2026-01-01' and e.entry_date < '2027-01-01'
       and e.source in ('payments', 'reversal', 'returns')
       and coalesce(e.fact_key, '') not like 'recaudo_1305_tercero:%'
       and (coalesce(l.debit, 0) <> 0 or coalesce(l.credit, 0) <> 0)
       and not exists (select 1 from public.journal_entries a
                        where a.organization_id = e.organization_id
                          and a.fact_key = 'recaudo_1305_tercero:' || l.id::text)
     order by e.organization_id, l.id
  loop
    select t.nit, t.nombre into v_t
      from public.fn_tercero_cartera_de_asiento(v_l.source, v_l.source_id, v_l.org, v_l.account_code) t;
    if v_t.nit is null then
      -- Sin cliente identificable: no se fuerza; va a la lista del Contador.
      v_sin := v_sin + 1;
      continue;
    end if;

    -- Enlace al recibo original (o a la devolución) y número del recibo para la nota.
    v_link_source := null;
    v_link_id := null;
    v_recibo := null;
    if v_l.source = 'payments' then
      v_link_source := 'payments';
      v_link_id := v_l.source_id;
    elsif v_l.source = 'reversal' then
      select o.source, o.source_id into v_link_source, v_link_id
        from public.journal_entries o
       where o.id::text = v_l.source_id and o.organization_id = v_l.org;
    else
      v_link_source := 'returns';
      v_link_id := v_l.source_id;
    end if;
    if v_link_source = 'payments' then
      select coalesce(nullif(btrim(p.receipt_number), ''), nullif(btrim(g.receipt_number), ''), p.id::text)
        into v_recibo
        from public.payments p
        left join public.payment_groups g on g.id = p.payment_group_id
       where p.id::text = v_link_id;
    end if;

    v_memo := 'Asignación de tercero a recaudo 1305 · '
      || case
           when v_l.source = 'payments' then 'recibo ' || coalesce(v_recibo, v_link_id)
           when v_l.source = 'reversal' then 'anulación del recibo ' || coalesce(v_recibo, v_link_id, v_l.source_id)
           else 'reintegro de la devolución ' || v_l.source_id
         end;

    select c.numero, c.prefijo into v_c
      from public.fn_tomar_consecutivo_comprobante(v_l.org, 'nota_contable', 'NA') c;

    insert into public.journal_entries (
      organization_id, branch_id, entry_date, memo, source, source_id, posted, created_by, fact_key,
      comprobante_tipo, comprobante_prefijo, comprobante_numero
    ) values (
      v_l.org, v_l.branch_id, now(), v_memo, coalesce(v_link_source, v_l.source), coalesce(v_link_id, v_l.source_id),
      true, null, 'recaudo_1305_tercero:' || v_l.lid::text,
      'nota_contable', v_c.prefijo, v_c.numero
    ) returning id into v_entry;

    if v_l.credit > 0 then
      -- Recibo (Cr 1305 sin tercero): Dr 1305 sin tercero / Cr 1305 cliente.
      v_monto := v_l.credit;
      insert into public.journal_lines (journal_entry_id, account_code, description, debit, credit)
      values (v_entry, v_l.account_code, v_memo, v_monto, 0);
      insert into public.journal_lines (journal_entry_id, account_code, description, debit, credit, tercero_nit, tercero_nombre)
      values (v_entry, v_l.account_code, v_memo, 0, v_monto, v_t.nit, v_t.nombre);
    else
      -- Anulación o reintegro (Dr 1305 sin tercero): Dr 1305 cliente / Cr 1305 sin tercero.
      v_monto := v_l.debit;
      insert into public.journal_lines (journal_entry_id, account_code, description, debit, credit, tercero_nit, tercero_nombre)
      values (v_entry, v_l.account_code, v_memo, v_monto, 0, v_t.nit, v_t.nombre);
      insert into public.journal_lines (journal_entry_id, account_code, description, debit, credit)
      values (v_entry, v_l.account_code, v_memo, 0, v_monto);
    end if;

    v_n := v_n + 1;
    v_total := v_total + v_monto;
  end loop;

  perform set_config('app.ajuste_tercero_1305', '', true);
  raise notice 'Asignación de tercero a la 1305: % ajustes por %; % líneas sin cliente identificable (lista al Contador)',
    v_n, v_total, v_sin;
end
$ajustes$;

-- La restricción entra después de los ajustes (y de que el disparador ya ponga el tercero).
DROP TRIGGER IF EXISTS zzz_trg_1305_exige_tercero ON public.journal_lines;
CREATE TRIGGER zzz_trg_1305_exige_tercero
  BEFORE INSERT OR UPDATE OF account_code, tercero_nit ON public.journal_lines
  FOR EACH ROW EXECUTE FUNCTION public.fn_trg_1305_exige_tercero();
