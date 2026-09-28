-- Saldos a favor (5/6) — anular un anticipo, devolverlo en dinero y vencer al leer.
--
-- Antes: fn_anular_pago rechazaba los pagos con source = 'customer_credit'
-- (pago_no_anulable) y dejaba vivos el saldo, el efectivo de la caja y el
-- asiento; no había forma de devolver un saldo a favor en dinero, y el
-- vencimiento (expiry_date) no tenía efecto: nadie pasaba el estado a 'expired'.
--
-- 1. fn_anular_pago (base: la versión viva de 20260928144544, sesión de notas
--    crédito; el resto del cuerpo no cambia) admite el pago del anticipo
--    (source 'customer_credit'): solo si el saldo NO se ha usado (activo, saldo
--    = monto, sin aplicaciones); si se usó → 'saldo_usado' con el motivo. En la
--    misma transacción: pago 'void', saldo 'cancelled' con saldo 0,
--    contra-asiento de 'customer_credit:<id>' y recibo void/partially_void. El
--    efectivo sale del arqueo porque el pago deja de estar 'completed'; si la
--    caja ya cerró → 'pago_en_caja_cerrada' (regla existente).
--    fn_saldo_favor_anular(credito) es la entrada por saldo: busca el pago vivo
--    del anticipo y delega en fn_anular_pago (una sola anulación en el sistema).
--    Un saldo que no nació de un pago (excedente de nota crédito, devolución de
--    POS) no se anula: 'saldo_no_anulable' (se devuelve en dinero).
-- 2. fn_saldo_favor_devolver: devolución en dinero de todo o parte del saldo.
--    finance.void, idempotencia (payments.idempotency_key), método activo de la
--    organización, referencia si la pide, caja abierta para efectivo o cuenta
--    bancaria de la organización. Escribe un pago negativo
--    (source 'customer_credit_refund', como la devolución de una nota crédito)
--    que saca el efectivo del arqueo, el asiento Dr 2805 / Cr cuenta de dinero
--    con fact_key (si falla, la operación falla) y baja el saldo.
-- 3. fn_saldo_favor_estado: el vencimiento es un estado VIVO al leer —
--    'expired' si expiry_date ya pasó (día en la zona de la sucursal) y queda
--    saldo—, sin cron ni escrituras. fn_apply_customer_credit ya rechaza el
--    vencido (2/6); la devolución en dinero de un saldo vencido se permite.

alter table public.payments add column if not exists idempotency_key text;
create unique index if not exists uq_payments_org_idempotency_key
  on public.payments (organization_id, idempotency_key)
  where idempotency_key is not null;
comment on column public.payments.idempotency_key is
  'Clave de idempotencia de los pagos que no pasan por payment_groups (fn_saldo_favor_devolver).';

-- ── 3. Estado vivo ──
create or replace function public.fn_saldo_favor_estado(p_status text, p_balance numeric, p_org integer, p_branch integer, p_expiry timestamptz)
 returns text
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select case
    when p_status = 'active' and coalesce(p_balance, 0) > 0 and public.fn_saldo_favor_vencido(p_org, p_branch, p_expiry) then 'expired'
    else p_status end;
$function$;

revoke all on function public.fn_saldo_favor_estado(text, numeric, integer, integer, timestamptz) from public, anon;
grant execute on function public.fn_saldo_favor_estado(text, numeric, integer, integer, timestamptz) to authenticated, service_role;

-- ── 1. fn_anular_pago admite el anticipo sin usar ──
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
  v_credito public.credit_notes%rowtype;
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
  if coalesce(v_p.source, '') not in ('invoice_sales', 'account_receivable', 'sale', 'invoice_purchase', 'account_payable', 'credit_note', 'customer_credit') then
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
  -- Anticipo / sobrante a saldo a favor: solo si el saldo no se ha usado.
  if v_p.source = 'customer_credit' then
    select * into v_credito from public.credit_notes
     where id::text = v_p.source_id and organization_id = v_p.organization_id
     for update;
    if not found or coalesce(v_p.amount, 0) <= 0 then
      raise exception 'pago_no_anulable' using errcode = '22023';
    end if;
    if v_credito.status <> 'active' or v_credito.balance <> v_credito.amount
       or exists (select 1 from public.credit_note_applications a where a.credit_note_id = v_credito.id) then
      raise exception 'saldo_usado' using errcode = '22023',
        detail = jsonb_build_object('credito', v_credito.id, 'monto', v_credito.amount, 'saldo', v_credito.balance)::text,
        hint = 'El saldo a favor ya se aplicó o se devolvió: no se puede anular el anticipo.';
    end if;
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

  if v_p.source = 'customer_credit' then
    update public.credit_notes
       set status = 'cancelled', balance = 0, updated_at = now(),
           notes = case when coalesce(btrim(notes), '') = '' then 'ANULADO: ' || btrim(p_motivo)
                        else notes || E'\n' || 'ANULADO: ' || btrim(p_motivo) end
     where id = v_credito.id;
  end if;

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
  -- devolución de una nota crédito lleva el suyo con 'refund:credit_note:<nota>'
  -- y el anticipo el del saldo, 'customer_credit:<saldo>'.
  select je.id into v_asiento from public.journal_entries je
   where je.organization_id = v_p.organization_id
     and (je.fact_key = 'settlement:payment:' || v_p.id::text
          or (v_p.source = 'credit_note' and je.fact_key = 'refund:credit_note:' || v_p.source_id)
          or (v_p.source = 'customer_credit' and je.fact_key = 'customer_credit:' || v_p.source_id))
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
      when v_p.source = 'customer_credit' then 0
      else null end);
end;
$function$;

revoke all on function public.fn_anular_pago(uuid, text) from public, anon;
grant execute on function public.fn_anular_pago(uuid, text) to authenticated, service_role;

-- Entrada por saldo: el pago vivo del anticipo → fn_anular_pago.
create or replace function public.fn_saldo_favor_anular(p_credit_id uuid, p_motivo text, p_organization_id integer default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_credito public.credit_notes%rowtype;
  v_pago uuid;
begin
  if v_uid is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  select * into v_credito from public.credit_notes where id = p_credit_id;
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

  select p.id into v_pago from public.payments p
   where p.organization_id = v_credito.organization_id and p.source = 'customer_credit'
     and p.source_id = v_credito.id::text and p.status = 'completed' and p.amount > 0
   order by p.created_at limit 1;
  if v_pago is null then
    raise exception 'saldo_no_anulable' using errcode = '22023',
      hint = 'El saldo a favor no nació de un pago (nota crédito o devolución): devuélvalo en dinero.';
  end if;

  return public.fn_anular_pago(v_pago, p_motivo) || jsonb_build_object('credito_id', v_credito.id);
end;
$function$;

revoke all on function public.fn_saldo_favor_anular(uuid, text, integer) from public, anon;
grant execute on function public.fn_saldo_favor_anular(uuid, text, integer) to authenticated, service_role;

-- ── 2. Devolver en dinero ──
create or replace function public.fn_saldo_favor_devolver(
  p_credit_id uuid,
  p_monto numeric,
  p_metodo text,
  p_motivo text,
  p_clave_idempotencia text,
  p_organization_id integer default null,
  p_cuenta_bancaria integer default null,
  p_referencia text default null
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_org integer;
  v_credito public.credit_notes%rowtype;
  v_monto numeric := round(coalesce(p_monto, 0), 2);
  v_pago public.payments%rowtype;
  v_requiere_ref boolean;
  v_caja integer;
  v_cuenta_dinero text;
  v_moneda text;
  v_entry integer;
  v_ref text := nullif(btrim(coalesce(p_referencia, '')), '');
begin
  if v_uid is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  if p_clave_idempotencia is null or btrim(p_clave_idempotencia) = '' or length(p_clave_idempotencia) > 200 then
    raise exception 'clave_idempotencia_invalida' using errcode = '22023';
  end if;
  if v_monto <= 0 then
    raise exception 'monto_invalido' using errcode = '22023';
  end if;
  if p_motivo is null or length(btrim(p_motivo)) < 3 then
    raise exception 'motivo_obligatorio' using errcode = '22023';
  end if;

  select organization_id into v_org from public.credit_notes where id = p_credit_id;
  if v_org is null or (p_organization_id is not null and p_organization_id <> v_org) then
    raise exception 'saldo_no_encontrado' using errcode = 'P0002';
  end if;
  perform public.fn_finanzas_exigir_permiso(v_org, array['finance.void']);

  -- ── Idempotencia ──
  perform pg_advisory_xact_lock(hashtextextended('saldo_favor_devolver:' || v_org || ':' || p_clave_idempotencia, 0));
  select * into v_pago from public.payments where organization_id = v_org and idempotency_key = p_clave_idempotencia;
  if found then
    if v_pago.source <> 'customer_credit_refund' or v_pago.source_id <> p_credit_id::text or v_pago.amount <> -v_monto then
      raise exception 'clave_idempotencia_reutilizada' using errcode = '22023';
    end if;
    return jsonb_build_object('payment_id', v_pago.id, 'repetida', true, 'monto', v_monto,
      'saldo_disponible', (select balance from public.credit_notes where id = p_credit_id));
  end if;

  select * into v_credito from public.credit_notes where id = p_credit_id and organization_id = v_org for update;
  if v_credito.branch_id is not null and not public.app_branch_access(v_credito.branch_id) then
    raise exception 'sin_acceso_sucursal' using errcode = '42501';
  end if;
  if v_credito.status <> 'active' or v_credito.balance <= 0 then
    raise exception 'saldo_no_disponible' using errcode = '22023';
  end if;
  if v_monto > v_credito.balance then
    raise exception 'monto_excede_saldo_a_favor' using errcode = '22023',
      detail = jsonb_build_object('saldo', v_credito.balance)::text;
  end if;

  select pm.requires_reference into v_requiere_ref
    from public.payment_methods pm
    join public.organization_payment_methods opm
      on opm.payment_method_code = pm.code and opm.organization_id = v_org and coalesce(opm.is_active, true)
   where pm.code = p_metodo and coalesce(pm.is_active, true) and pm.code <> 'credit';
  if not found then
    raise exception 'metodo_invalido' using errcode = '22023';
  end if;
  if coalesce(v_requiere_ref, false) and v_ref is null then
    raise exception 'referencia_obligatoria' using errcode = '22023';
  end if;

  if p_metodo = 'cash' then
    v_caja := public.fn_caja_abierta_para(v_org, v_credito.branch_id, v_uid);
    if v_caja is null then
      raise exception 'sin_caja_abierta' using errcode = '22023',
        hint = 'Abra la caja de la sucursal o devuelva el dinero por otro método.';
    end if;
  elsif p_cuenta_bancaria is not null then
    if not exists (select 1 from public.bank_accounts b
                    where b.id = p_cuenta_bancaria and b.organization_id = v_org and coalesce(b.is_active, true)) then
      raise exception 'cuenta_bancaria_invalida' using errcode = '22023';
    end if;
  end if;
  v_cuenta_dinero := public.fn_money_account_code_pago(v_org, v_credito.branch_id, p_metodo,
                       case when p_metodo = 'cash' then null else p_cuenta_bancaria end);
  if v_cuenta_dinero is null then
    raise exception 'sin_cuenta_de_dinero' using errcode = 'P0002';
  end if;
  v_moneda := upper(public.fn_moneda_base_organizacion(v_org));

  -- Pago negativo: saca el efectivo del arqueo (pos_caja__esperado_calculo).
  insert into public.payments (
    organization_id, branch_id, source, source_id, method, amount, currency, reference, status,
    created_by, payment_date, bank_account_id, idempotency_key
  ) values (
    v_org, v_credito.branch_id, 'customer_credit_refund', v_credito.id::text, p_metodo, -v_monto, v_moneda,
    coalesce(v_ref, 'Devolución de saldo a favor'), 'completed', v_uid, now(),
    case when p_metodo = 'cash' then null else p_cuenta_bancaria end, p_clave_idempotencia
  ) returning * into v_pago;

  v_entry := public.fn_create_journal_entry(
    p_organization_id := v_org,
    p_branch_id := v_credito.branch_id,
    p_entry_date := now(),
    p_memo := 'Devolución en dinero de saldo a favor',
    p_source := 'customer_credit_refund',
    p_source_id := v_pago.id::text,
    p_debit_account := '2805',
    p_credit_account := v_cuenta_dinero,
    p_amount := v_monto,
    p_created_by := v_uid,
    p_fact_key := 'customer_credit_refund:' || v_pago.id::text);
  if v_entry is null then
    raise exception 'asiento_no_creado' using errcode = 'P0001',
      hint = 'Revise el plan de cuentas (2805 y la cuenta de dinero) y el periodo contable.';
  end if;

  update public.credit_notes
     set balance = balance - v_monto,
         status = case when balance - v_monto <= 0 then 'used' else 'active' end,
         updated_at = now()
   where id = v_credito.id;

  insert into public.finance_audit_log (organization_id, entity, entity_id, action, user_id, diff, reason)
  values (v_org, 'credit_notes', v_credito.id::text, 'update', v_uid,
          jsonb_build_object('accion', 'devolucion_en_dinero', 'monto', v_monto, 'metodo', p_metodo, 'payment_id', v_pago.id, 'asiento', v_entry),
          btrim(p_motivo));

  return jsonb_build_object(
    'payment_id', v_pago.id, 'repetida', false, 'monto', v_monto, 'asiento_id', v_entry, 'caja_id', v_caja,
    'saldo_disponible', (select balance from public.credit_notes where id = v_credito.id));
end;
$function$;

revoke all on function public.fn_saldo_favor_devolver(uuid, numeric, text, text, text, integer, integer, text) from public, anon;
grant execute on function public.fn_saldo_favor_devolver(uuid, numeric, text, text, text, integer, integer, text) to authenticated, service_role;
