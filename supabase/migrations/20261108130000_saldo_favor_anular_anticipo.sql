-- Anular un anticipo de cliente (saldo a favor nacido de un pago).
-- Aplicada por el MCP el 2026-11-07 con orden del dueño («corrige el error de anular un anticipo»).
--
-- Error: `fn_saldo_favor_anular` delegaba en `fn_anular_pago`, y esa función no
-- acepta pagos con source = 'customer_credit': siempre respondía `pago_no_anulable`.
-- Además, el asiento del anticipo no es el del pago (`settlement:payment:<id>`):
-- lo crea `fn_create_customer_credit` con fact_key 'customer_credit:<credito>'
-- (D dinero / C 2805), y `fn_auto_journal_payment` no asienta este origen.
--
-- Ahora la anulación se hace aquí, completa y en una transacción:
--   1. Solo un anticipo SIN USAR (balance = amount, estado vivo). Si ya se aplicó
--      parte, se devuelve el disponible (`fn_saldo_favor_devolver`), no se anula.
--   2. Efectivo de una caja ya cerrada: no se anula (mismo criterio de fn_anular_pago).
--   3. El pago queda 'void' (quién, cuándo, motivo); el recibo, 'void'.
--   4. Contra-asiento del asiento 'customer_credit:<credito>' (nunca se edita ni borra).
--   5. El saldo queda 'cancelled' con balance 0.
--   6. finance_audit_log.
-- Misma firma y mismo ACL (CREATE OR REPLACE). Hoy hay 0 saldos a favor y 0 pagos de
-- este origen en la base: no cambia ningún dato existente.

create or replace function public.fn_saldo_favor_anular(p_credit_id uuid, p_motivo text, p_organization_id integer default null::integer)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_credito public.credit_notes%rowtype;
  v_p public.payments%rowtype;
  v_caja record;
  v_asiento integer;
  v_reverso integer;
begin
  if v_uid is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  if p_motivo is null or length(btrim(p_motivo)) < 3 then
    raise exception 'motivo_obligatorio' using errcode = '22023';
  end if;

  select * into v_credito from public.credit_notes where id = p_credit_id for update;
  if not found or (p_organization_id is not null and p_organization_id <> v_credito.organization_id) then
    raise exception 'saldo_no_encontrado' using errcode = 'P0002';
  end if;
  perform public.fn_finanzas_exigir_permiso(v_credito.organization_id, array['finance.void']);
  if v_credito.branch_id is not null and not public.app_branch_access(v_credito.branch_id) then
    raise exception 'sin_acceso_sucursal' using errcode = '42501';
  end if;
  if v_credito.status = 'cancelled' then
    raise exception 'saldo_no_disponible' using errcode = '22023';
  end if;
  if round(coalesce(v_credito.balance, 0), 2) <> round(coalesce(v_credito.amount, 0), 2) then
    raise exception 'saldo_usado' using errcode = '22023',
      hint = 'El anticipo ya se aplicó en parte: devuelva el disponible en lugar de anularlo.';
  end if;

  select * into v_p from public.payments p
   where p.organization_id = v_credito.organization_id and p.source = 'customer_credit'
     and p.source_id = v_credito.id::text and p.status = 'completed' and p.amount > 0
   order by p.created_at
   limit 1
   for update;
  if not found then
    raise exception 'saldo_no_anulable' using errcode = '22023',
      hint = 'El saldo a favor no nació de un pago (nota crédito o devolución): devuélvalo en dinero.';
  end if;

  -- Efectivo de una caja ya cerrada: el arqueo se cerró con él.
  if v_p.method = 'cash' then
    select cs.id, cs.status into v_caja from public.cash_sessions cs
     where cs.id = (select g.cash_session_id from public.payment_groups g where g.id = v_p.payment_group_id);
    if found and v_caja.status <> 'open' then
      raise exception 'pago_en_caja_cerrada' using errcode = '22023',
        hint = 'El anticipo está en una caja ya cerrada: devuélvalo con una salida de caja.';
    end if;
  end if;

  update public.payments
     set status = 'void', voided_at = now(), voided_by = v_uid,
         void_reason = btrim(p_motivo), updated_at = now()
   where id = v_p.id;

  if v_p.payment_group_id is not null then
    update public.payment_groups set status = 'void' where id = v_p.payment_group_id;
  end if;

  select je.id into v_asiento from public.journal_entries je
   where je.organization_id = v_credito.organization_id
     and je.fact_key = 'customer_credit:' || v_credito.id::text
     and coalesce(je.posted, false)
     and not exists (select 1 from public.journal_entries r
                      where r.organization_id = je.organization_id and r.fact_key = 'reversal:' || je.id)
   limit 1;
  if v_asiento is not null then
    v_reverso := public.fn_revertir_asiento_en_fecha(v_asiento, 'anulacion_anticipo', 'saldo:' || v_credito.id::text, now(), v_uid);
  end if;

  update public.credit_notes
     set status = 'cancelled', balance = 0, updated_at = now()
   where id = v_credito.id;

  insert into public.finance_audit_log (organization_id, entity, entity_id, action, user_id, diff, reason)
  values (v_credito.organization_id, 'credit_notes', v_credito.id::text, 'void', v_uid,
          jsonb_build_object('monto', v_credito.amount, 'pago', v_p.id, 'asiento', v_asiento, 'contra_asiento', v_reverso),
          btrim(p_motivo));

  return jsonb_build_object(
    'payment_id', v_p.id, 'source', 'customer_credit', 'source_id', v_credito.id::text,
    'asiento_revertido', v_asiento, 'contra_asiento', v_reverso, 'saldo_nuevo', 0,
    'credito_id', v_credito.id);
end;
$function$;
