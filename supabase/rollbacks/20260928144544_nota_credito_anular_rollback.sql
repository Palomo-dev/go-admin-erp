-- Rollback de 20260928144544_nota_credito_anular.sql
--
-- ADVERTENCIA: no revierte datos. Las notas anuladas con fn_nota_credito_anular
-- siguen anuladas, con sus contra-asientos, sus saldos a favor cancelados, sus
-- devoluciones anuladas y sus salidas 'credit_note_void' en el kardex.
-- Restaurar el CHECK de stock_movements.source FALLA si ya hay filas
-- 'credit_note_void': en ese caso, deje el CHECK como está (es un superconjunto).
--
-- Restaura fn_anular_pago como quedó en 20260924072939 (sin la devolución de
-- nota crédito) y quita fn_nota_credito_anular.

drop function if exists public.fn_nota_credito_anular(uuid, text);

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
  if coalesce(v_p.source, '') not in ('invoice_sales', 'account_receivable', 'sale', 'invoice_purchase', 'account_payable') then
    -- Folios, parqueaderos, membresías y web tienen su propio flujo de reverso.
    raise exception 'pago_no_anulable' using errcode = '22023';
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

  -- Contra-asiento del asiento del pago (nunca se edita ni se borra).
  select je.id into v_asiento from public.journal_entries je
   where je.organization_id = v_p.organization_id
     and je.fact_key = 'settlement:payment:' || v_p.id::text
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

alter table public.stock_movements drop constraint if exists stock_movements_source_check;
alter table public.stock_movements add constraint stock_movements_source_check check (source = any (array[
  'purchase', 'sale', 'adjustment', 'transfer', 'return', 'loss', 'production', 'initial', 'web_sale', 'mesa_sale',
  'invoice_sale', 'folio_item', 'room_consumption', 'web_order', 'purchase_order', 'purchase_invoice', 'invoice_void',
  'credit_note', 'web_refund', 'folio_item_reversal', 'transfer_out', 'transfer_in', 'purchase_void']::text[]));
