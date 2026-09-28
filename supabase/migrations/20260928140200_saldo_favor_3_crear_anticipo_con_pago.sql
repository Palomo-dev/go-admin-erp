-- Saldos a favor (3/6) — crear un anticipo a mano pasa por un pago real.
--
-- Antes: el navegador llamaba fn_create_customer_credit con una cuenta PUC
-- elegida en pantalla ('1110' / '1105') y un created_by propio. No pedía
-- permiso, no validaba cliente ni sucursal, no revisaba el asiento y el dinero
-- no pasaba por payments ni por la caja: un anticipo en efectivo era invisible
-- en el arqueo (pos_caja__esperado_calculo suma payments).
--
-- fn_registrar_pago (el pago único) exige al menos un documento y saca de él la
-- organización y el cliente, así que un anticipo sin factura no cabe ahí. Esta
-- RPC es su equivalente para el anticipo puro y reusa sus mismas piezas:
--   · payment_groups (recibo RC-, idempotencia por (organization_id,
--     idempotency_key), mismo candado de recibo 'recibo_pago:<org>');
--   · payments con source = 'customer_credit' (como el sobrante de
--     fn_registrar_pago): el efectivo entra en el arqueo de la caja abierta;
--   · fn_create_customer_credit para el saldo y su asiento
--     Dr cuenta de dinero del método (fn_money_account_code_pago) / Cr 2805.
-- Exige sesión, finance.create, cliente y sucursal de la organización, acceso a
-- la sucursal, método activo de la organización (no 'credit'), referencia si el
-- método la pide y caja abierta para efectivo. created_by = auth.uid().
--
-- fn_create_customer_credit queda como pieza interna (sin EXECUTE para
-- authenticated): la llaman fn_registrar_pago, fn_liquidar_excedente_nota_credito,
-- procesar_devolucion y esta RPC, todas SECURITY DEFINER. Ahora además guarda
-- el autor y FALLA si el asiento no se crea (antes lo dejaba en silencio en
-- journal_entry_failures).
--
-- Deuda anotada: la numeración del recibo (max + 1 bajo el candado) se repite
-- aquí y en fn_registrar_pago; si se cambia, cambiar las dos.

alter table public.credit_notes add column if not exists created_by uuid references auth.users(id);
comment on column public.credit_notes.created_by is 'Usuario de la sesión que creó el saldo a favor (auth.uid()).';

create or replace function public.fn_create_customer_credit(p_org integer, p_customer uuid, p_amount numeric, p_cash_account text default '1110'::text, p_branch integer default null::integer, p_notes text default null::text, p_expiry timestamp with time zone default null::timestamp with time zone, p_created_by uuid default null::uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_id uuid;
  v_entry integer;
begin
  if (select auth.uid()) is not null and not exists (
    select 1 from public.organization_members om
     where om.organization_id = p_org
       and om.user_id = (select auth.uid())
       and om.is_active
  ) then
    raise exception 'no pertenece a la organizacion %', p_org using errcode = '42501';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'monto_invalido' using errcode = '22023';
  end if;

  insert into public.credit_notes(organization_id, customer_id, branch_id, amount, balance, status, notes, expiry_date, created_by)
  values (p_org, p_customer, p_branch, p_amount, p_amount, 'active', p_notes, p_expiry, coalesce((select auth.uid()), p_created_by))
  returning id into v_id;

  v_entry := fn_create_journal_entry(
    p_organization_id := p_org,
    p_branch_id := p_branch,
    p_entry_date := now(),
    p_memo := 'Saldo a favor cliente',
    p_source := 'customer_credit',
    p_source_id := v_id::text,
    p_debit_account := p_cash_account,
    p_credit_account := '2805',
    p_amount := p_amount,
    p_tax_account := null,
    p_tax_amount := 0,
    p_created_by := coalesce((select auth.uid()), p_created_by),
    p_fact_key := 'customer_credit:' || v_id::text
  );
  if v_entry is null then
    raise exception 'asiento_no_creado' using errcode = 'P0001',
      hint = 'No se pudo contabilizar el saldo a favor: revise el plan de cuentas (2805 y la cuenta de dinero) y el periodo contable.';
  end if;

  return v_id;
end;
$function$;

revoke all on function public.fn_create_customer_credit(integer, uuid, numeric, text, integer, text, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.fn_create_customer_credit(integer, uuid, numeric, text, integer, text, timestamptz, uuid) to service_role;

create or replace function public.fn_saldo_favor_crear(
  p_customer uuid,
  p_branch integer,
  p_monto numeric,
  p_metodo text,
  p_clave_idempotencia text,
  p_organization_id integer,
  p_cuenta_bancaria integer default null,
  p_referencia text default null,
  p_vence date default null,
  p_notas text default null
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_org integer := p_organization_id;
  v_monto numeric := round(coalesce(p_monto, 0), 2);
  v_grupo public.payment_groups%rowtype;
  v_requiere_ref boolean;
  v_caja integer;
  v_cuenta_dinero text;
  v_moneda text;
  v_expiry timestamptz;
  v_recibo text;
  v_credito uuid;
  v_pago uuid;
  v_ref text := nullif(btrim(coalesce(p_referencia, '')), '');
begin
  if v_uid is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  if v_org is null then
    raise exception 'organizacion_no_permitida' using errcode = '42501';
  end if;
  if p_clave_idempotencia is null or btrim(p_clave_idempotencia) = '' or length(p_clave_idempotencia) > 200 then
    raise exception 'clave_idempotencia_invalida' using errcode = '22023';
  end if;
  if v_monto <= 0 then
    raise exception 'monto_invalido' using errcode = '22023';
  end if;

  perform public.fn_finanzas_exigir_permiso(v_org, array['finance.create']);

  -- ── Idempotencia (mismo espacio de claves y candado que fn_registrar_pago) ──
  perform pg_advisory_xact_lock(hashtextextended('fn_registrar_pago:' || v_org || ':' || p_clave_idempotencia, 0));
  select * into v_grupo from public.payment_groups
   where organization_id = v_org and idempotency_key = p_clave_idempotencia;
  if found then
    if v_grupo.customer_credit_id is null or v_grupo.total_applied <> 0 or v_grupo.advance_amount <> v_monto
       or v_grupo.customer_id is distinct from p_customer then
      raise exception 'clave_idempotencia_reutilizada' using errcode = '22023';
    end if;
    return jsonb_build_object(
      'credito_id', v_grupo.customer_credit_id, 'grupo_id', v_grupo.id, 'recibo', v_grupo.receipt_number,
      'repetida', true, 'caja_id', v_grupo.cash_session_id, 'monto', v_grupo.advance_amount);
  end if;

  -- ── Cliente y sucursal de la organización ──
  if not exists (select 1 from public.customers c where c.id = p_customer and c.organization_id = v_org) then
    raise exception 'cliente_no_encontrado' using errcode = 'P0002';
  end if;
  if p_branch is null or not exists (
    select 1 from public.branches b where b.id = p_branch and b.organization_id = v_org and coalesce(b.is_active, true)
  ) then
    raise exception 'sucursal_invalida' using errcode = '22023';
  end if;
  if not public.app_branch_access(p_branch) then
    raise exception 'sin_acceso_sucursal' using errcode = '42501';
  end if;

  -- ── Método de la organización ──
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

  if p_vence is not null then
    if p_vence < public.fn_today_for(v_org, p_branch) then
      raise exception 'vencimiento_invalido' using errcode = '22023';
    end if;
    -- El día de vencimiento en la zona de la sucursal (vale todo ese día).
    v_expiry := (p_vence::timestamp at time zone public.fn_timezone_for(v_org, p_branch));
  end if;

  -- ── Efectivo: caja abierta; banco: cuenta de la organización ──
  if p_metodo = 'cash' then
    v_caja := public.fn_caja_abierta_para(v_org, p_branch, v_uid);
    if v_caja is null then
      raise exception 'sin_caja_abierta' using errcode = '22023',
        hint = 'Abra la caja de la sucursal o registre el anticipo con otro método.';
    end if;
  elsif p_cuenta_bancaria is not null then
    if not exists (select 1 from public.bank_accounts b
                    where b.id = p_cuenta_bancaria and b.organization_id = v_org and coalesce(b.is_active, true)) then
      raise exception 'cuenta_bancaria_invalida' using errcode = '22023';
    end if;
  end if;

  v_cuenta_dinero := public.fn_money_account_code_pago(v_org, p_branch, p_metodo,
                       case when p_metodo = 'cash' then null else p_cuenta_bancaria end);
  if v_cuenta_dinero is null then
    raise exception 'sin_cuenta_de_dinero' using errcode = 'P0002';
  end if;
  v_moneda := upper(public.fn_moneda_base_organizacion(v_org));

  -- ── Recibo (misma numeración y candado que fn_registrar_pago) ──
  perform pg_advisory_xact_lock(hashtextextended('recibo_pago:' || v_org, 0));
  select 'RC-' || lpad((coalesce(max(nullif(regexp_replace(g.receipt_number, '\D', '', 'g'), '')::bigint), 0) + 1)::text, 6, '0')
    into v_recibo
    from public.payment_groups g where g.organization_id = v_org;

  insert into public.payment_groups (
    organization_id, branch_id, direction, receipt_number, customer_id, method, currency,
    total_applied, advance_amount, received_amount, change_amount, payment_date, reference,
    bank_account_id, notes, cash_session_id, origin, idempotency_key, created_by
  ) values (
    v_org, p_branch, 'cobro', v_recibo, p_customer, p_metodo, v_moneda,
    0, v_monto, case when p_metodo = 'cash' then v_monto end, 0, now(), v_ref,
    case when p_metodo = 'cash' then null else p_cuenta_bancaria end,
    nullif(btrim(coalesce(p_notas, '')), ''), v_caja, 'saldo_a_favor', p_clave_idempotencia, v_uid
  ) returning * into v_grupo;

  -- Saldo y asiento (falla si el asiento no se crea).
  v_credito := public.fn_create_customer_credit(
    v_org, p_customer, v_monto, v_cuenta_dinero, p_branch,
    coalesce(nullif(btrim(coalesce(p_notas, '')), ''), 'Anticipo del recibo ' || v_recibo),
    v_expiry, v_uid);

  -- El dinero: una fila en payments (entra al arqueo si es efectivo).
  insert into public.payments (
    organization_id, branch_id, source, source_id, method, amount, currency, reference, status,
    created_by, payment_date, bank_account_id, payment_group_id
  ) values (
    v_org, p_branch, 'customer_credit', v_credito::text, p_metodo, v_monto, v_moneda,
    coalesce(v_ref, v_recibo), 'completed', v_uid, now(),
    case when p_metodo = 'cash' then null else p_cuenta_bancaria end, v_grupo.id
  ) returning id into v_pago;

  update public.payment_groups set customer_credit_id = v_credito where id = v_grupo.id;

  return jsonb_build_object(
    'credito_id', v_credito, 'grupo_id', v_grupo.id, 'recibo', v_recibo, 'repetida', false,
    'caja_id', v_caja, 'payment_id', v_pago, 'monto', v_monto);
end;
$function$;

revoke all on function public.fn_saldo_favor_crear(uuid, integer, numeric, text, text, integer, integer, text, date, text) from public, anon;
grant execute on function public.fn_saldo_favor_crear(uuid, integer, numeric, text, text, integer, integer, text, date, text) to authenticated, service_role;
