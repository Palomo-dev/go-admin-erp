-- Notas crédito de venta — anular en una transacción, en el servidor.
--
-- Antes (notasCreditoService.anularNotaCredito, navegador, sin permiso):
--   · ponía la nota en 'void' y REESCRIBÍA a mano balance y status de la
--     factura sumando el monto de la nota. El disparador
--     trg_nota_credito_recalcula_factura ya había recalculado la factura al
--     cambiar el estado de la nota (20260924093524, §5): el saldo se inflaba
--     dos veces el monto de la nota hasta el siguiente recálculo;
--   · no revertía el asiento (fn_auto_journal_void sale en las notas crédito),
--     ni el reingreso de inventario, ni el saldo a favor (credit_notes) ni la
--     devolución en payments;
--   · dejaba anular una nota ya aceptada por la DIAN (miraba status, no
--     einvoice_status).
--
-- Daño medido el 2026-09-28 (solo se reporta): 28 notas crédito, 2 anuladas
-- (organizaciones 113 y 115, ambas el 2026-08-13), 1 con la marca del servicio
-- («ANULADA: …» en notes). Ninguna tenía asiento, reingreso, saldo a favor,
-- devolución ni FE aceptada, y hoy ninguna factura con notas anuladas tiene el
-- saldo inflado (las dos están en 'issued' con saldo = total − pagado − notas vivas).
--
-- 1. fn_anular_pago admite la DEVOLUCIÓN de una nota crédito (payments.source
--    = 'credit_note', la escribe fn_liquidar_excedente_nota_credito) solo
--    cuando su nota ya está anulada — una devolución no se anula suelta — y
--    revierte su asiento 'refund:credit_note:<nota>'. El resto del cuerpo es
--    el de 20260924072939, sin cambios.
-- 2. fn_nota_credito_anular(p_nota_id, p_motivo): permiso finance.void
--    (fn_finanzas_exigir_permiso → fn_assert_acceso_org), motivo obligatorio,
--    FOR UPDATE de la nota, idempotente (una nota ya anulada devuelve
--    ya_anulada sin tocar nada). Bloquea si la DIAN la aceptó
--    (einvoice_status o un job 'accepted') o si está en envío ('processing' /
--    'sent'): una nota aceptada se corrige con una nota débito, que hoy no
--    existe. Un job 'pending' o 'failed' se cancela con su evento. En la misma
--    transacción:
--      a. saldo a favor sin aplicar → 'cancelled' con saldo 0 y contra-asiento
--         de 'customer_credit:<id>'; aplicado (en parte o todo) → bloquea;
--      b. la nota pasa a 'void' (motivo en notes, como la anulación de la
--         factura): trg_nota_credito_recalcula_factura recalcula la factura con
--         la regla única; aquí no se escribe ningún saldo;
--      c. la devolución en payments → fn_anular_pago (contra-asiento incluido);
--      d. contra-asiento de 'accrual:credit_note:<nota>' (nunca se borra);
--      e. lo que reingresó al inventario sale por kardex con origen propio
--         ('credit_note_void', source_id = la nota), menos lo ya revertido;
--      f. finance_audit_log con el motivo.
-- 0. stock_movements.source admite 'credit_note_void' (la lista de hoy + ese
--    valor): la salida del reingreso anulado tiene origen propio en el kardex.
--
-- Dry-run 2026-09-28 en una transacción que se deshace (org 137): nota total
-- con reingreso sobre una factura pagada → saldo a favor 34.000 y stock
-- 149 → 150; anular → saldo a favor 'cancelled' con contra-asiento, contra-
-- asiento del devengo, salida 'credit_note_void' de 1 (stock 150 → 149),
-- factura 'paid' saldo 0 (la regla única); segunda llamada → ya_anulada sin
-- tocar nada; usuario de otra organización → «Acceso denegado»; motivo corto →
-- motivo_obligatorio; una factura → documento_invalido. Nota por valor con
-- devolución por transferencia: anular la devolución suelta → pago_no_anulable;
-- anular la nota → devolución 'void' con contra-asiento de refund:credit_note.

-- ── 0 ── Origen del kardex ─────────────────────────────────────────────────
alter table public.stock_movements drop constraint if exists stock_movements_source_check;
alter table public.stock_movements add constraint stock_movements_source_check check (source = any (array[
  'purchase', 'sale', 'adjustment', 'transfer', 'return', 'loss', 'production', 'initial', 'web_sale', 'mesa_sale',
  'invoice_sale', 'folio_item', 'room_consumption', 'web_order', 'purchase_order', 'purchase_invoice', 'invoice_void',
  'credit_note', 'web_refund', 'folio_item_reversal', 'transfer_out', 'transfer_in', 'purchase_void',
  'credit_note_void']::text[]));

-- ── 1 ── fn_anular_pago: la devolución de una nota crédito anulada ─────────
create or replace function public.fn_anular_pago(p_payment_id uuid, p_motivo text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_p public.payments%rowtype;
  v_caja record;
  v_asiento integer;
  v_reverso integer;
  v_vivos integer;
begin
  if v_uid is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  if p_motivo is null or length(btrim(p_motivo)) < 3 then
    raise exception 'motivo_obligatorio' using errcode = '22023';
  end if;

  select * into v_p from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'pago_no_encontrado' using errcode = 'P0002';
  end if;
  perform public.fn_finanzas_exigir_permiso(v_p.organization_id, array['finance.void', 'pos.void']);
  if v_p.branch_id is not null and not public.app_branch_access(v_p.branch_id) then
    raise exception 'sin_acceso_sucursal' using errcode = '42501';
  end if;
  if v_p.status is distinct from 'completed' then
    raise exception 'pago_no_anulable' using errcode = '22023';
  end if;
  if coalesce(v_p.source, '') not in ('invoice_sales', 'account_receivable', 'sale', 'invoice_purchase', 'account_payable', 'credit_note') then
    -- Folios, parqueaderos, membresías y web tienen su propio flujo de reverso.
    raise exception 'pago_no_anulable' using errcode = '22023';
  end if;
  -- La devolución de una nota crédito solo se anula con su nota (fn_nota_credito_anular).
  if v_p.source = 'credit_note' and not exists (
      select 1 from public.invoice_sales n
       where n.id::text = v_p.source_id and n.organization_id = v_p.organization_id
         and n.document_type = 'credit_note' and n.status in ('void', 'voided', 'cancelled')) then
    raise exception 'pago_no_anulable' using errcode = '22023',
      hint = 'La devolución de una nota crédito se anula anulando la nota.';
  end if;

  -- Efectivo de una caja ya cerrada: el arqueo se cerró con él.
  if v_p.method = 'cash' then
    select cs.id, cs.status into v_caja from public.cash_sessions cs
     where cs.id = (select g.cash_session_id from public.payment_groups g where g.id = v_p.payment_group_id);
    if not found then
      select cs.id, cs.status into v_caja from public.cash_sessions cs
       where cs.organization_id = v_p.organization_id
         and (cs.branch_id is null or cs.branch_id is not distinct from v_p.branch_id)
         and v_p.created_at >= cs.opened_at and v_p.created_at <= coalesce(cs.closed_at, 'infinity'::timestamptz)
       order by (cs.status = 'open'), cs.opened_at desc
       limit 1;
    end if;
    if found and v_caja.status <> 'open' then
      raise exception 'pago_en_caja_cerrada' using errcode = '22023',
        hint = 'El pago está en una caja ya cerrada: registre una nota crédito o una salida de caja.';
    end if;
  end if;

  update public.payments
     set status = 'void', voided_at = now(), voided_by = v_uid,
         void_reason = btrim(p_motivo), updated_at = now()
   where id = v_p.id;

  -- Cuota de vuelta.
  if v_p.installment_id is not null then
    if v_p.source = 'account_receivable' then
      update public.ar_installments
         set paid_amount = greatest(paid_amount - v_p.amount, 0),
             balance = least(amount, balance + v_p.amount),
             status = case when greatest(paid_amount - v_p.amount, 0) > 0 then 'partial' else 'pending' end,
             paid_at = null
       where id = v_p.installment_id;
    elsif v_p.source = 'account_payable' then
      update public.ap_installments
         set paid_amount = greatest(paid_amount - v_p.amount, 0),
             balance = least(amount, balance + v_p.amount),
             status = case when greatest(paid_amount - v_p.amount, 0) > 0 then 'partial' else 'pending' end,
             paid_at = null
       where id = v_p.installment_id;
    end if;
  end if;

  -- Contra-asiento del asiento del pago (nunca se edita ni se borra). La
  -- devolución de una nota crédito lleva el suyo con 'refund:credit_note:<nota>'.
  select je.id into v_asiento from public.journal_entries je
   where je.organization_id = v_p.organization_id
     and (je.fact_key = 'settlement:payment:' || v_p.id::text
          or (v_p.source = 'credit_note' and je.fact_key = 'refund:credit_note:' || v_p.source_id))
     and coalesce(je.posted, false)
     and not exists (select 1 from public.journal_entries r
                      where r.organization_id = je.organization_id and r.fact_key = 'reversal:' || je.id)
   limit 1;
  if v_asiento is not null then
    v_reverso := public.fn_revertir_asiento_en_fecha(v_asiento, 'anulacion_pago', 'pago:' || v_p.id::text, now(), v_uid);
  end if;

  -- Estado del recibo.
  if v_p.payment_group_id is not null then
    select count(*) into v_vivos from public.payments
     where payment_group_id = v_p.payment_group_id and status = 'completed' and source <> 'customer_credit';
    update public.payment_groups
       set status = case when v_vivos = 0 then 'void' else 'partially_void' end
     where id = v_p.payment_group_id;
  end if;

  insert into public.finance_audit_log (organization_id, entity, entity_id, action, user_id, diff, reason)
  values (v_p.organization_id, 'payments', v_p.id::text, 'void', v_uid,
          jsonb_build_object('amount', v_p.amount, 'source', v_p.source, 'source_id', v_p.source_id,
                             'asiento', v_asiento, 'contra_asiento', v_reverso),
          btrim(p_motivo));

  return jsonb_build_object(
    'payment_id', v_p.id, 'source', v_p.source, 'source_id', v_p.source_id,
    'asiento_revertido', v_asiento, 'contra_asiento', v_reverso,
    'saldo_nuevo', case
      when v_p.source = 'account_receivable' then coalesce(
        (select i.balance from public.accounts_receivable a join public.invoice_sales i on i.id = a.invoice_id where a.id::text = v_p.source_id),
        (select a.balance from public.accounts_receivable a where a.id::text = v_p.source_id))
      when v_p.source = 'invoice_sales' then (select i.balance from public.invoice_sales i where i.id::text = v_p.source_id)
      when v_p.source = 'account_payable' then (select a.balance from public.accounts_payable a where a.id::text = v_p.source_id)
      when v_p.source = 'invoice_purchase' then (select i.balance from public.invoice_purchase i where i.id::text = v_p.source_id)
      else null end);
end;
$function$;

revoke all on function public.fn_anular_pago(uuid, text) from public, anon;
grant execute on function public.fn_anular_pago(uuid, text) to authenticated, service_role;

-- ── 2 ── Anular la nota crédito ────────────────────────────────────────────
create or replace function public.fn_nota_credito_anular(p_nota_id uuid, p_motivo text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_nc public.invoice_sales%rowtype;
  v_job record;
  v_credito record;
  v_pago record;
  v_mov record;
  v_asiento integer;
  v_reverso integer;
  v_reverso_credito integer;
  v_pagos integer := 0;
  v_jobs integer := 0;
  v_productos integer := 0;
  v_creditos integer := 0;
begin
  if v_uid is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  if p_motivo is null or length(btrim(p_motivo)) < 5 then
    raise exception 'motivo_obligatorio' using errcode = '22023';
  end if;

  select * into v_nc from public.invoice_sales where id = p_nota_id for update;
  if not found then
    raise exception 'nota_no_encontrada' using errcode = 'P0002';
  end if;
  perform public.fn_finanzas_exigir_permiso(v_nc.organization_id, array['finance.void']);
  if v_nc.branch_id is not null and not public.app_branch_access(v_nc.branch_id) then
    raise exception 'sin_acceso_sucursal' using errcode = '42501';
  end if;
  if coalesce(v_nc.document_type, 'invoice') <> 'credit_note' then
    raise exception 'documento_invalido' using errcode = '22023';
  end if;

  -- Idempotente: anularla otra vez no repite nada.
  if v_nc.status in ('void', 'voided', 'cancelled') then
    return jsonb_build_object('id', v_nc.id, 'status', v_nc.status, 'ya_anulada', true);
  end if;

  -- DIAN: una nota aceptada no se anula localmente (se corrige con una nota
  -- débito, que hoy no existe); tampoco una que está en envío.
  if v_nc.einvoice_status = 'accepted' or exists (
      select 1 from public.electronic_invoicing_jobs j
       where j.invoice_id = v_nc.id and j.organization_id = v_nc.organization_id and j.status = 'accepted') then
    raise exception 'nota_aceptada_dian' using errcode = '22023',
      hint = 'La DIAN ya aceptó esta nota crédito: se corrige con una nota débito, no se anula.';
  end if;
  if exists (select 1 from public.electronic_invoicing_jobs j
              where j.invoice_id = v_nc.id and j.organization_id = v_nc.organization_id
                and j.status in ('processing', 'sent')) then
    raise exception 'nota_en_envio_dian' using errcode = '22023',
      hint = 'La nota se está enviando a la DIAN: espere la respuesta antes de anularla.';
  end if;

  -- a. Saldo a favor que generó la nota: solo si nadie lo ha usado.
  for v_credito in
    select c.* from public.credit_notes c
     where c.source_credit_note_id = v_nc.id and c.organization_id = v_nc.organization_id
     for update
  loop
    continue when v_credito.status = 'cancelled';
    if v_credito.status = 'used' or coalesce(v_credito.balance, 0) < coalesce(v_credito.amount, 0)
       or exists (select 1 from public.credit_note_applications a where a.credit_note_id = v_credito.id) then
      raise exception 'saldo_a_favor_aplicado' using errcode = '22023',
        detail = jsonb_build_object('credito', v_credito.id, 'monto', v_credito.amount, 'saldo', v_credito.balance)::text,
        hint = 'El saldo a favor de esta nota ya se usó: anule primero su aplicación.';
    end if;
    update public.credit_notes
       set status = 'cancelled', balance = 0,
           notes = case when coalesce(btrim(notes), '') = '' then 'ANULADO: nota crédito anulada'
                        else notes || E'\n' || 'ANULADO: nota crédito anulada' end
     where id = v_credito.id;
    select je.id into v_asiento from public.journal_entries je
     where je.organization_id = v_nc.organization_id and je.fact_key = 'customer_credit:' || v_credito.id
       and coalesce(je.posted, false)
       and not exists (select 1 from public.journal_entries r
                        where r.organization_id = je.organization_id and r.fact_key = 'reversal:' || je.id)
     limit 1;
    if v_asiento is not null then
      v_reverso_credito := public.fn_revertir_asiento_en_fecha(v_asiento, 'anulacion_nota_credito',
                                                              'saldo_a_favor:' || v_credito.id, now(), v_uid);
    end if;
    v_creditos := v_creditos + 1;
  end loop;

  -- La cola de facturación electrónica: lo que no ha salido se cancela.
  for v_job in
    select j.id from public.electronic_invoicing_jobs j
     where j.invoice_id = v_nc.id and j.organization_id = v_nc.organization_id and j.status in ('pending', 'failed')
     for update
  loop
    update public.electronic_invoicing_jobs set status = 'cancelled', locked_at = null, locked_by = null where id = v_job.id;
    insert into public.electronic_invoicing_events (job_id, organization_id, event_type, event_message, metadata)
    values (v_job.id, v_nc.organization_id, 'cancelled', 'Job cancelado: la nota crédito se anuló',
            jsonb_build_object('actor', v_uid, 'accion', 'cancel', 'origen', 'fn_nota_credito_anular'));
    v_jobs := v_jobs + 1;
  end loop;

  -- b. La nota: el disparador trg_nota_credito_recalcula_factura recalcula la factura.
  update public.invoice_sales
     set status = 'void',
         notes = case when coalesce(btrim(notes), '') = '' then 'ANULADA: ' || btrim(p_motivo)
                      else notes || E'\n\nANULADA: ' || btrim(p_motivo) end,
         updated_at = now()
   where id = v_nc.id;

  -- c. La devolución del excedente (fn_anular_pago revierte su asiento).
  for v_pago in
    select p.id from public.payments p
     where p.organization_id = v_nc.organization_id and p.source = 'credit_note'
       and p.source_id = v_nc.id::text and p.status = 'completed'
  loop
    perform public.fn_anular_pago(v_pago.id, 'Anulación de la nota crédito ' || coalesce(v_nc.number, v_nc.id::text) || ': ' || btrim(p_motivo));
    v_pagos := v_pagos + 1;
  end loop;

  -- d. Contra-asiento del devengo de la nota.
  v_asiento := null;
  select je.id into v_asiento from public.journal_entries je
   where je.organization_id = v_nc.organization_id and je.fact_key = 'accrual:credit_note:' || v_nc.id
     and coalesce(je.posted, false)
     and not exists (select 1 from public.journal_entries r
                      where r.organization_id = je.organization_id and r.fact_key = 'reversal:' || je.id)
   limit 1;
  if v_asiento is not null then
    v_reverso := public.fn_revertir_asiento_en_fecha(v_asiento, 'anulacion_nota_credito',
                                                    'nota_credito:' || v_nc.id, now(), v_uid);
  end if;

  -- e. Inventario: sale lo que reingresó la nota y aún no se revirtió.
  for v_mov in
    select sm.product_id, sm.branch_id, sum(sm.qty) as qty,
           (array_agg(sm.unit_cost order by sm.id))[1] as unit_cost
      from public.stock_movements sm
     where sm.organization_id = v_nc.organization_id and sm.direction = 'in'
       and sm.source = 'credit_note' and sm.source_id = v_nc.id::text
     group by sm.product_id, sm.branch_id
  loop
    v_mov.qty := v_mov.qty - coalesce((
      select sum(o.qty) from public.stock_movements o
       where o.organization_id = v_nc.organization_id and o.direction = 'out'
         and o.source = 'credit_note_void' and o.source_id = v_nc.id::text
         and o.product_id = v_mov.product_id and o.branch_id = v_mov.branch_id), 0);
    continue when v_mov.qty <= 0;
    perform public.decrement_stock_on_sale(
      v_nc.organization_id, v_mov.branch_id, v_mov.product_id, v_mov.qty, 'credit_note_void', v_nc.id::text,
      v_mov.unit_cost, 'Anulación de la nota crédito ' || coalesce(v_nc.number, v_nc.id::text), v_uid);
    v_productos := v_productos + 1;
  end loop;

  insert into public.finance_audit_log (organization_id, entity, entity_id, action, user_id, diff, reason)
  values (v_nc.organization_id, 'invoice_sales', v_nc.id::text, 'void', v_uid,
          jsonb_build_object('documento', 'nota_credito', 'numero', v_nc.number, 'total', abs(coalesce(v_nc.total, 0)),
                             'factura', v_nc.related_invoice_id, 'contra_asiento', v_reverso,
                             'saldos_a_favor_cancelados', v_creditos, 'contra_asiento_saldo_a_favor', v_reverso_credito,
                             'devoluciones_anuladas', v_pagos, 'productos_retirados', v_productos, 'jobs_fe_cancelados', v_jobs),
          btrim(p_motivo));

  return jsonb_build_object(
    'id', v_nc.id, 'status', 'void', 'ya_anulada', false, 'factura', v_nc.related_invoice_id,
    'contra_asiento', v_reverso, 'saldos_a_favor_cancelados', v_creditos, 'devoluciones_anuladas', v_pagos,
    'productos_retirados', v_productos, 'jobs_fe_cancelados', v_jobs,
    'saldo_factura', (select i.balance from public.invoice_sales i where i.id = v_nc.related_invoice_id));
end;
$function$;

revoke all on function public.fn_nota_credito_anular(uuid, text) from public, anon;
grant execute on function public.fn_nota_credito_anular(uuid, text) to authenticated, service_role;

comment on function public.fn_nota_credito_anular(uuid, text) is
  'Anula una nota crédito de venta en una transacción (finance.void): saldo a favor sin usar, devolución, contra-asiento e inventario. Idempotente. Una nota aceptada por la DIAN no se anula.';
