-- Saldos a favor (2/6) — aplicar un saldo a favor a una factura, validado en la base.
--
-- fn_apply_customer_credit(uuid, uuid, numeric, uuid) confiaba en el cliente:
-- created_by venía del navegador, no pedía permiso, no comprobaba cliente ni
-- sucursal ni tipo/estado de la factura, no tenía idempotencia y asentaba
-- contra 1305 fijo sin verificar que el asiento se creara.
--
-- La nueva firma (p_credit_id, p_invoice_id, p_amount, p_clave_idempotencia,
-- p_organization_id) exige, en una transacción:
--   · sesión (auth.uid()) y permiso finance.create resuelto en la base
--     (fn_finanzas_exigir_permiso); p_organization_id es la de la sesión que
--     manda el servidor: un saldo de otra organización es "no encontrado";
--   · idempotencia por clave (credit_note_applications.idempotency_key);
--   · saldo activo, no vencido (expiry_date en la zona de la organización o
--     de la sucursal del saldo, fn_saldo_favor_vencido) y suficiente;
--   · factura de la misma organización y del MISMO cliente, tipo factura,
--     emitida (no borrador ni anulada), en la moneda base y con acceso a la
--     sucursal de la factura y a la del saldo;
--   · created_by = auth.uid(), nunca del cliente;
--   · asiento Dr 2805 / Cr cuenta por cobrar de la organización
--     (fn_regla_devengo_venta) con fact_key; si no se crea, la operación falla.
-- El saldo y el estado de la factura los pone la regla única (disparador de la
-- migración 1/6); aquí solo se escribe la aplicación y el saldo del crédito.

alter table public.credit_note_applications add column if not exists idempotency_key text;
create unique index if not exists uq_credit_note_applications_org_idem
  on public.credit_note_applications (organization_id, idempotency_key)
  where idempotency_key is not null;

comment on column public.credit_note_applications.idempotency_key is
  'Clave de idempotencia de fn_apply_customer_credit: la misma clave devuelve la aplicación ya hecha.';

-- ¿El saldo a favor está vencido? El vencimiento es un día calendario: vale
-- todo ese día en la zona de la sucursal del saldo (o de la organización).
create or replace function public.fn_saldo_favor_vencido(p_org integer, p_branch integer, p_expiry timestamptz)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select p_expiry is not null
     and (p_expiry at time zone public.fn_timezone_for(p_org, p_branch))::date < public.fn_today_for(p_org, p_branch);
$function$;

revoke all on function public.fn_saldo_favor_vencido(integer, integer, timestamptz) from public, anon;
grant execute on function public.fn_saldo_favor_vencido(integer, integer, timestamptz) to authenticated, service_role;

drop function if exists public.fn_apply_customer_credit(uuid, uuid, numeric, uuid);

create or replace function public.fn_apply_customer_credit(
  p_credit_id uuid,
  p_invoice_id uuid,
  p_amount numeric,
  p_clave_idempotencia text,
  p_organization_id integer default null
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_org integer;
  v_credit public.credit_notes%rowtype;
  v_inv public.invoice_sales%rowtype;
  v_app public.credit_note_applications%rowtype;
  v_monto numeric := round(coalesce(p_amount, 0), 2);
  v_base text;
  v_cxc text;
  v_entry integer;
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

  select organization_id into v_org from public.credit_notes where id = p_credit_id;
  if v_org is null or (p_organization_id is not null and p_organization_id <> v_org) then
    raise exception 'saldo_no_encontrado' using errcode = 'P0002';
  end if;
  perform public.fn_finanzas_exigir_permiso(v_org, array['finance.create']);

  -- ── Idempotencia ──
  perform pg_advisory_xact_lock(hashtextextended('saldo_favor_aplicar:' || v_org || ':' || p_clave_idempotencia, 0));
  select * into v_app from public.credit_note_applications
   where organization_id = v_org and idempotency_key = p_clave_idempotencia;
  if found then
    if v_app.credit_note_id <> p_credit_id or v_app.invoice_id <> p_invoice_id or v_app.amount <> v_monto then
      raise exception 'clave_idempotencia_reutilizada' using errcode = '22023';
    end if;
    return jsonb_build_object(
      'aplicacion_id', v_app.id, 'repetida', true, 'monto', v_app.amount,
      'saldo_disponible', (select balance from public.credit_notes where id = v_app.credit_note_id),
      'saldo_factura', (select balance from public.invoice_sales where id = v_app.invoice_id));
  end if;

  -- ── Saldo a favor (bloqueado: primero el saldo, luego la factura) ──
  select * into v_credit from public.credit_notes where id = p_credit_id and organization_id = v_org for update;
  if v_credit.branch_id is not null and not public.app_branch_access(v_credit.branch_id) then
    raise exception 'sin_acceso_sucursal' using errcode = '42501';
  end if;
  if v_credit.status <> 'active' or v_credit.balance <= 0 then
    raise exception 'saldo_no_disponible' using errcode = '22023';
  end if;
  if public.fn_saldo_favor_vencido(v_org, v_credit.branch_id, v_credit.expiry_date) then
    raise exception 'saldo_vencido' using errcode = '22023';
  end if;
  if v_monto > v_credit.balance then
    raise exception 'monto_excede_saldo_a_favor' using errcode = '22023',
      detail = jsonb_build_object('saldo', v_credit.balance)::text;
  end if;

  -- ── Factura ──
  select * into v_inv from public.invoice_sales where id = p_invoice_id and organization_id = v_org for update;
  if not found then
    raise exception 'factura_no_encontrada' using errcode = 'P0002';
  end if;
  if coalesce(v_inv.document_type, 'invoice') <> 'invoice' then
    raise exception 'documento_invalido' using errcode = '22023';
  end if;
  if v_inv.status = 'draft' then
    raise exception 'documento_borrador' using errcode = '22023';
  end if;
  if v_inv.status in ('void', 'voided', 'cancelled') then
    raise exception 'documento_anulado' using errcode = '22023';
  end if;
  if v_inv.customer_id is distinct from v_credit.customer_id then
    raise exception 'cliente_distinto' using errcode = '22023';
  end if;
  if v_inv.branch_id is not null and not public.app_branch_access(v_inv.branch_id) then
    raise exception 'sin_acceso_sucursal' using errcode = '42501';
  end if;
  v_base := upper(public.fn_moneda_base_organizacion(v_org));
  if upper(coalesce(v_inv.currency, v_base)) <> v_base then
    raise exception 'moneda_distinta' using errcode = '22023';
  end if;
  if v_monto > coalesce(v_inv.balance, 0) then
    raise exception 'monto_excede_saldo' using errcode = '22023',
      detail = jsonb_build_object('saldo', v_inv.balance)::text;
  end if;

  select debit_account_code into v_cxc from public.fn_regla_devengo_venta(v_org);
  if v_cxc is null then
    raise exception 'sin_cuenta_por_cobrar' using errcode = 'P0002';
  end if;

  -- El disparador trg_aplicacion_saldo_favor_recalcula_factura recalcula la
  -- factura con la regla única (y ella su cartera).
  insert into public.credit_note_applications (organization_id, credit_note_id, invoice_id, amount, created_by, idempotency_key)
  values (v_org, p_credit_id, p_invoice_id, v_monto, v_uid, p_clave_idempotencia)
  returning * into v_app;

  update public.credit_notes
     set balance = balance - v_monto,
         status = case when balance - v_monto <= 0 then 'used' else 'active' end,
         updated_at = now()
   where id = p_credit_id;

  v_entry := public.fn_create_journal_entry(
    p_organization_id := v_org,
    p_branch_id := coalesce(v_inv.branch_id, v_credit.branch_id),
    p_entry_date := now(),
    p_memo := 'Aplicación de saldo a favor a la factura ' || coalesce(v_inv.number, v_inv.id::text),
    p_source := 'customer_credit_application',
    p_source_id := v_app.id::text,
    p_debit_account := '2805',
    p_credit_account := v_cxc,
    p_amount := v_monto,
    p_created_by := v_uid,
    p_fact_key := 'customer_credit_application:' || v_app.id::text);
  if v_entry is null then
    raise exception 'asiento_no_creado' using errcode = 'P0001',
      hint = 'Revise el plan de cuentas (2805 y la cuenta por cobrar) y el periodo contable.';
  end if;

  return jsonb_build_object(
    'aplicacion_id', v_app.id, 'repetida', false, 'monto', v_monto, 'asiento_id', v_entry,
    'saldo_disponible', (select balance from public.credit_notes where id = p_credit_id),
    'saldo_factura', (select balance from public.invoice_sales where id = p_invoice_id),
    'estado_factura', (select status from public.invoice_sales where id = p_invoice_id));
end;
$function$;

revoke all on function public.fn_apply_customer_credit(uuid, uuid, numeric, text, integer) from public, anon;
grant execute on function public.fn_apply_customer_credit(uuid, uuid, numeric, text, integer) to authenticated, service_role;
