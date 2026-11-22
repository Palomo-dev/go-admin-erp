-- Reversión de 20261121105051_finanzas_procesadores_pago_iva_comision_modulos.sql
--
-- Quita PayU, Stripe y PayPal del catálogo, el IVA de la comisión en el abono y el
-- débito al procesador en membresías y parqueaderos. Se detiene si ya hay cobros,
-- abonos o IVA de comisión que dependan de esto.

do $$
begin
  if exists (select 1 from public.journal_lines l where l.account_code like '1380200_' and right(l.account_code, 1) in ('5', '6', '7'))
     or exists (select 1 from public.payment_processor_payouts where processor in ('payu', 'stripe', 'paypal') or commission_vat > 0)
     or exists (select 1 from public.journal_entries e where e.source in ('membership_payment', 'parking_payment')
                and exists (select 1 from public.journal_lines l where l.journal_entry_id = e.id and l.account_code like '138020%')) then
    raise exception 'Hay movimientos que dependen de esta migración: reclasificarlos antes de revertir';
  end if;
end $$;

-- Membresías y parqueaderos: el débito vuelve a ser el de la regla.
do $$
declare
  v_f text;
  v_def text;
begin
  foreach v_f in array array['fn_auto_journal_membership_payment', 'fn_auto_journal_parking_payment'] loop
    v_def := pg_get_functiondef(('public.' || v_f)::regproc);
    v_def := replace(v_def, E'        -- Tarjeta o pasarela: el auxiliar del procesador (138020xx). Contador 2026-11-21.\n', '');
    v_def := replace(v_def, E'        COALESCE(public.fn_cuenta_procesador_cobro(v_org_id, NEW.method, NEW.processor), v_rule.debit_account_code),\n', E'        v_rule.debit_account_code,\n');
    v_def := replace(v_def, E'        coalesce(public.fn_cuenta_procesador_cobro(v_org_id, new.method, new.processor), v_rule.debit_account_code),\n', E'        v_rule.debit_account_code,\n');
    execute v_def;
  end loop;
end $$;

-- Anular un abono sin el cierre del pendiente de IVA del exterior.
do $$
declare
  v_def text := pg_get_functiondef('public.fn_procesador_abono_anular'::regproc);
begin
  execute replace(v_def, E'  update public.journal_entry_failures\n     set resolved_at = now()\n   where organization_id = v_a.organization_id and fact_key = ''processor_payout_iva_exterior:'' || v_a.id\n     and resolved_at is null;\n\n', '');
end $$;

-- Abono y cuenta del cobro como en 20261121094157.
create or replace function public.fn_procesador_abono_registrar(p_organization_id integer, p_datos jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_solicitud uuid;
  v_prev public.payment_processor_payouts%rowtype;
  v_proc text := p_datos->>'procesador';
  v_cat record;
  v_ter record;
  v_fecha date;
  v_branch integer;
  v_bruto numeric;
  v_comision numeric;
  v_rf numeric;
  v_riva numeric;
  v_rica numeric;
  v_neto numeric;
  v_banco_id integer;
  v_banco text;
  v_saldo numeric;
  v_ref text := left(nullif(btrim(coalesce(p_datos->>'referencia', '')), ''), 120);
  v_notas text := left(nullif(btrim(coalesce(p_datos->>'notas', '')), ''), 500);
  v_memo text;
  v_id uuid := gen_random_uuid();
  v_je integer;
  v_lin record;
  v_falta text;
begin
  if v_uid is null then
    raise exception 'SESION_REQUERIDA' using errcode = '42501';
  end if;
  perform public.fn_assert_acceso_org(p_organization_id);
  if not public.fn_tiene_permiso(p_organization_id, 'finance.create') then
    raise exception 'SIN_PERMISO: registrar un abono requiere el permiso finance.create' using errcode = '42501';
  end if;
  begin
    v_solicitud := (p_datos->>'solicitud')::uuid;
  exception when others then
    v_solicitud := null;
  end;
  if v_solicitud is null then
    raise exception 'SOLICITUD_REQUERIDA' using errcode = '22023';
  end if;
  select * into v_prev from public.payment_processor_payouts
   where organization_id = p_organization_id and request_id = v_solicitud;
  if found then
    return jsonb_build_object('id', v_prev.id, 'asiento', v_prev.journal_entry_id, 'repetida', true);
  end if;

  select * into v_cat from public.fn_procesadores_pago_catalogo() k where k.codigo = v_proc;
  if not found then
    raise exception 'PROCESADOR_INVALIDO: %', coalesce(v_proc, '(vacío)') using errcode = '22023';
  end if;
  begin
    v_fecha := (p_datos->>'fecha')::date;
  exception when others then
    v_fecha := null;
  end;
  if v_fecha is null then
    raise exception 'FECHA_REQUERIDA: la fecha del abono según el extracto' using errcode = '22023';
  end if;
  if v_fecha > public.fn_today_for(p_organization_id, null) then
    raise exception 'FECHA_FUTURA: el abono no puede ser de una fecha futura' using errcode = '22023';
  end if;
  if not public.fn_is_period_open(p_organization_id, v_fecha) then
    raise exception 'PERIODO_CERRADO: el periodo contable de % está cerrado', v_fecha using errcode = '22023';
  end if;

  -- Importes del extracto, en pesos. El neto es lo que llegó al banco.
  begin
    v_bruto := round(coalesce(nullif(p_datos->>'bruto', '')::numeric, 0), 0);
    v_comision := round(coalesce(nullif(p_datos->>'comision', '')::numeric, 0), 0);
    v_rf := round(coalesce(nullif(p_datos->>'retencion_fuente', '')::numeric, 0), 0);
    v_riva := round(coalesce(nullif(p_datos->>'retencion_iva', '')::numeric, 0), 0);
    v_rica := round(coalesce(nullif(p_datos->>'retencion_ica', '')::numeric, 0), 0);
  exception when others then
    raise exception 'IMPORTE_INVALIDO: revise los valores del abono' using errcode = '22023';
  end;
  if v_bruto <= 0 or least(v_comision, v_rf, v_riva, v_rica) < 0 then
    raise exception 'IMPORTE_INVALIDO: el bruto debe ser mayor que cero y los descuentos no pueden ser negativos' using errcode = '22023';
  end if;
  v_neto := v_bruto - v_comision - v_rf - v_riva - v_rica;
  if v_neto <= 0 then
    raise exception 'NETO_INVALIDO: comisión y retenciones suman % y el bruto es %', v_bruto - v_neto, v_bruto using errcode = '22023';
  end if;
  if nullif(p_datos->>'neto', '') is not null and abs(round((p_datos->>'neto')::numeric, 0) - v_neto) > 0 then
    raise exception 'NETO_DESCUADRADO: bruto % menos descuentos da %, y el neto recibido es %',
      v_bruto, v_neto, round((p_datos->>'neto')::numeric, 0) using errcode = '22023';
  end if;

  -- Sede: la indicada si es de la organización; si no, la principal.
  v_branch := nullif(p_datos->>'sucursal', '')::integer;
  if v_branch is not null and not exists (select 1 from public.branches b where b.id = v_branch and b.organization_id = p_organization_id) then
    raise exception 'SUCURSAL_INVALIDA' using errcode = '22023';
  end if;
  if v_branch is null then
    select b.id into v_branch from public.branches b
     where b.organization_id = p_organization_id and b.is_main and b.is_active limit 1;
    if v_branch is null then
      select min(b.id) into v_branch from public.branches b where b.organization_id = p_organization_id;
    end if;
  end if;

  -- Banco donde llegó el neto.
  v_banco_id := nullif(p_datos->>'cuenta_bancaria', '')::integer;
  if v_banco_id is not null then
    select ba.account_code into v_banco from public.bank_accounts ba
     where ba.id = v_banco_id and ba.organization_id = p_organization_id;
    if v_banco is null then
      raise exception 'CUENTA_BANCARIA_INVALIDA: la cuenta bancaria no es de la organización o no tiene cuenta contable' using errcode = '22023';
    end if;
  else
    v_banco := coalesce(public.fn_cuenta_por_clave(p_organization_id, v_branch, 'bancos'), '1110');
  end if;

  -- No se abona más de lo que el procesador debe a esa fecha.
  v_saldo := public.fn_procesador_pago_saldo(p_organization_id, v_cat.cuenta, v_fecha);
  if v_bruto > v_saldo then
    raise exception 'ABONO_MAYOR_QUE_SALDO: % debía % a %, y el abono es por %',
      v_cat.nombre, v_saldo, v_fecha, v_bruto using errcode = '22023';
  end if;

  select * into v_ter from public.fn_procesador_pago_por_cuenta(p_organization_id, v_cat.cuenta);
  v_memo := 'Abono ' || v_ter.nombre || coalesce(' · ' || v_ref, '');

  -- Las cuentas tienen que existir y recibir movimientos (con su auxiliar de sede).
  for v_lin in
    select * from (values
      (v_banco, v_neto), ('53051501', v_comision), ('13551501', v_rf), ('13551701', v_riva),
      ('13551801', v_rica), (v_cat.cuenta, v_bruto)) as x(cuenta, monto)
    where x.monto > 0
  loop
    if not exists (select 1 from public.chart_of_accounts c
                    where c.organization_id = p_organization_id
                      and c.account_code = public.fn_puc_cuenta_de_sede(p_organization_id, v_branch, v_lin.cuenta)
                      and c.es_movimiento is distinct from false) then
      v_falta := coalesce(v_falta || ', ', '') || v_lin.cuenta;
    end if;
  end loop;
  if v_falta is not null then
    raise exception 'SIN_CUENTA: falta en el plan contable (o es de título): %', v_falta using errcode = '22023';
  end if;

  insert into public.journal_entries (organization_id, branch_id, entry_date, memo, source, source_id, posted, created_by, fact_key)
  values (p_organization_id, v_branch, (v_fecha::timestamp + interval '12 hours') at time zone public.fn_timezone_for(p_organization_id, v_branch), v_memo,
          'payment_processor_payouts', v_id::text, true, v_uid, 'processor_payout:' || v_id)
  returning id into v_je;

  for v_lin in
    select * from (values
      (1, v_banco, v_neto, 0::numeric, 'Abono neto · ' || v_ter.nombre, false),
      (2, '53051501', v_comision, 0::numeric, 'Comisión · ' || v_ter.nombre, true),
      (3, '13551501', v_rf, 0::numeric, 'Retención en la fuente que practicó ' || v_ter.nombre, true),
      (4, '13551701', v_riva, 0::numeric, 'ReteIVA que practicó ' || v_ter.nombre, true),
      (5, '13551801', v_rica, 0::numeric, 'ReteICA que practicó ' || v_ter.nombre, true),
      (6, v_cat.cuenta, 0::numeric, v_bruto, 'Abono bruto · ' || v_ter.nombre, true)) as x(orden, cuenta, debito, credito, descripcion, con_tercero)
    where x.debito > 0 or x.credito > 0
    order by x.orden
  loop
    insert into public.journal_lines (journal_entry_id, account_code, description, debit, credit, cost_center_id,
                                      tercero_nit, tercero_nombre)
    values (v_je, public.fn_puc_cuenta_de_sede(p_organization_id, v_branch, v_lin.cuenta), v_lin.descripcion,
            v_lin.debito, v_lin.credito,
            public.fn_centro_para_cuenta(p_organization_id, v_branch,
              public.fn_puc_cuenta_de_sede(p_organization_id, v_branch, v_lin.cuenta), null,
              public.fn_puc_cuenta_de_sede(p_organization_id, v_branch, v_banco)),
            case when v_lin.con_tercero then v_ter.nit end,
            case when v_lin.con_tercero then v_ter.nombre end);
  end loop;

  insert into public.payment_processor_payouts (
    id, organization_id, branch_id, processor, payout_date, gross_amount, commission,
    withholding_income, withholding_vat, withholding_ica, net_amount, bank_account_id, bank_account_code,
    reference, notes, request_id, journal_entry_id, created_by)
  values (v_id, p_organization_id, v_branch, v_proc, v_fecha, v_bruto, v_comision,
          v_rf, v_riva, v_rica, v_neto, v_banco_id, v_banco,
          v_ref, v_notas, v_solicitud, v_je, v_uid);

  return jsonb_build_object('id', v_id, 'asiento', v_je, 'repetida', false, 'procesador', v_proc,
    'bruto', v_bruto, 'comision', v_comision, 'retenciones', v_rf + v_riva + v_rica, 'neto', v_neto,
    'saldo_restante', v_saldo - v_bruto);
end;
$function$;
create or replace function public.fn_cuenta_cobro(p_organization_id integer, p_branch_id integer, p_method text,
                                                  p_bank_account_id integer, p_procesador text default null)
 returns text
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_proc text := coalesce(p_procesador, public.fn_procesador_de_pago(p_method, null, null));
  v_cuenta text;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  select k.cuenta into v_cuenta from public.fn_procesadores_pago_catalogo() k where k.codigo = v_proc;
  if v_cuenta is not null and exists (
    select 1 from public.chart_of_accounts c
     where c.organization_id = p_organization_id and c.account_code = v_cuenta
       and coalesce(c.is_active, true) and c.es_movimiento is distinct from false
  ) then
    return v_cuenta;
  end if;
  return public.fn_money_account_code_pago(p_organization_id, p_branch_id, p_method, p_bank_account_id);
end;
$function$;
create or replace function public.fn_procesadores_pago_catalogo()
 returns table(codigo text, nombre text, cuenta text)
 language sql
 immutable
 set search_path to 'public', 'pg_temp'
as $function$
  select * from (values
    ('datafono', 'Datáfono (adquirente)', '13802001'),
    ('wompi', 'Wompi', '13802002'),
    ('bold', 'Bold', '13802003'),
    ('mercadopago', 'Mercado Pago', '13802004')) as v(codigo, nombre, cuenta);
$function$;


drop function if exists public.fn_cuenta_procesador_cobro(integer, text, text);
drop function if exists public.fn_org_responsable_iva(integer, date);

alter table public.payment_processor_payouts drop constraint if exists payment_processor_payouts_vat_treatment_check;
alter table public.payment_processor_payouts drop constraint if exists payment_processor_payouts_cuadre_check;
alter table public.payment_processor_payouts
  drop column if exists commission_vat,
  drop column if exists commission_vat_deductible,
  drop column if exists vat_treatment,
  drop column if exists commission_invoice;
alter table public.payment_processor_payouts add constraint payment_processor_payouts_check
  check (gross_amount = net_amount + commission + withholding_income + withholding_vat + withholding_ica);
alter table public.payment_processor_payouts drop constraint if exists payment_processor_payouts_processor_check;
alter table public.payment_processor_payouts add constraint payment_processor_payouts_processor_check
  check (processor in ('datafono', 'wompi', 'bold', 'mercadopago'));
delete from public.payment_processor_settings where processor in ('payu', 'stripe', 'paypal');
alter table public.payment_processor_settings drop constraint if exists payment_processor_settings_processor_check;
alter table public.payment_processor_settings add constraint payment_processor_settings_processor_check
  check (processor in ('datafono', 'wompi', 'bold', 'mercadopago'));

delete from public.chart_of_accounts where account_code in ('13802005', '13802006', '13802007');
delete from public.puc_plantilla where codigo in ('13802005', '13802006', '13802007');
