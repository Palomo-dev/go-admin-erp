-- Procesadores de pago, segunda parte (Contador, 2026-11-21).
--
-- 1. PayU, Stripe y PayPal tienen auxiliar propio con el mismo flujo:
--    13802005 PayU · 13802006 Stripe · 13802007 PayPal.
--    (El saldo que se queda guardado en Stripe o PayPal y no baja al banco pasa a
--    un auxiliar de 1110/1120 por proveedor, en su moneda: queda pendiente.)
-- 2. IVA de la comisión del abono, según el perfil tributario vigente:
--    · responsable de IVA (O-48 o régimen ordinario/simple): a IVA descontable
--      (2408) y la comisión neta a 53051501; exige la factura electrónica del
--      adquirente (arts. 485 y 488 ET);
--    · no responsable (régimen no_responsable_iva u O-49): el IVA se suma a 53051501;
--    · ventas gravadas y excluidas: se reparte con la proporción que se indique
--      (art. 490 ET);
--    · Stripe y PayPal no cobran IVA colombiano: el extracto se registra como
--      viene y queda un pendiente contable (posible IVA por retención, art. 437-2
--      num. 3 ET).
-- 3. Membresías y parqueaderos: el cobro con tarjeta o pasarela debita el
--    auxiliar del procesador. Las reglas del módulo siguen en el crédito.

-- ── 1. Cuentas de PayU, Stripe y PayPal ─────────────────────────────────────
insert into public.puc_plantilla (codigo, nombre, tipo, padre, descripcion, naturaleza, es_movimiento,
                                  requiere_tercero, requiere_centro_costo, centro_costo_modo, presentacion_niif)
values
  ('13802005', 'PayU por cobrar', 'asset', '138020',
   'Cobros por PayU pendientes de abono. Tercero: PayU.', 'debito', true, true, false, 'no_aplica', 'corriente'),
  ('13802006', 'Stripe por cobrar', 'asset', '138020',
   'Cobros por Stripe pendientes de abono. Tercero: Stripe.', 'debito', true, true, false, 'no_aplica', 'corriente'),
  ('13802007', 'PayPal por cobrar', 'asset', '138020',
   'Cobros por PayPal pendientes de abono. Tercero: PayPal.', 'debito', true, true, false, 'no_aplica', 'corriente')
on conflict (codigo) do nothing;

do $$
declare
  v_orgs integer[];
  v_org integer;
  v_c record;
begin
  -- El arreglo se arma antes: fn_puc_asegurar_cuenta hace ALTER TABLE.
  select array_agg(distinct organization_id order by organization_id) into v_orgs from public.chart_of_accounts;
  foreach v_org in array v_orgs loop
    for v_c in select * from (values
      ('13802005', 'PayU por cobrar'), ('13802006', 'Stripe por cobrar'), ('13802007', 'PayPal por cobrar')) as x(codigo, nombre)
    loop
      perform public.fn_puc_asegurar_cuenta(v_org, v_c.codigo, v_c.nombre, true);
    end loop;
  end loop;
end $$;

update public.chart_of_accounts c
   set requiere_tercero = true,
       description = coalesce(c.description, p.descripcion)
  from public.puc_plantilla p
 where p.codigo = c.account_code and c.account_code in ('13802005', '13802006', '13802007');

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
    ('mercadopago', 'Mercado Pago', '13802004'),
    ('payu', 'PayU', '13802005'),
    ('stripe', 'Stripe', '13802006'),
    ('paypal', 'PayPal', '13802007')) as v(codigo, nombre, cuenta);
$function$;

alter table public.payment_processor_settings drop constraint if exists payment_processor_settings_processor_check;
alter table public.payment_processor_settings add constraint payment_processor_settings_processor_check
  check (processor in ('datafono', 'wompi', 'bold', 'mercadopago', 'payu', 'stripe', 'paypal'));
alter table public.payment_processor_payouts drop constraint if exists payment_processor_payouts_processor_check;
alter table public.payment_processor_payouts add constraint payment_processor_payouts_processor_check
  check (processor in ('datafono', 'wompi', 'bold', 'mercadopago', 'payu', 'stripe', 'paypal'));

-- Cuenta por cobrar del procesador que cobró, o null si el cobro no pasó por uno.
create or replace function public.fn_cuenta_procesador_cobro(p_organization_id integer, p_method text, p_procesador text)
 returns text
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_cuenta text;
begin
  select k.cuenta into v_cuenta
    from public.fn_procesadores_pago_catalogo() k
   where k.codigo = coalesce(p_procesador, public.fn_procesador_de_pago(p_method, null, null));
  if v_cuenta is not null and exists (
    select 1 from public.chart_of_accounts c
     where c.organization_id = p_organization_id and c.account_code = v_cuenta
       and coalesce(c.is_active, true) and c.es_movimiento is distinct from false
  ) then
    return v_cuenta;
  end if;
  return null;
end;
$function$;
revoke all on function public.fn_cuenta_procesador_cobro(integer, text, text) from public, anon, authenticated;

create or replace function public.fn_cuenta_cobro(p_organization_id integer, p_branch_id integer, p_method text,
                                                  p_bank_account_id integer, p_procesador text default null)
 returns text
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  return coalesce(public.fn_cuenta_procesador_cobro(p_organization_id, p_method, p_procesador),
                  public.fn_money_account_code_pago(p_organization_id, p_branch_id, p_method, p_bank_account_id));
end;
$function$;

-- ── 3. Membresías y parqueaderos: el débito es el auxiliar del procesador ────
do $$
declare
  v_def text := pg_get_functiondef('public.fn_auto_journal_membership_payment'::regproc);
  v_viejo text := E'        v_rule.debit_account_code,\n        v_rule.credit_account_code,\n        v_amount,';
begin
  if position('fn_cuenta_procesador_cobro' in v_def) > 0 then
    return;
  end if;
  if (length(v_def) - length(replace(v_def, v_viejo, ''))) / length(v_viejo) <> 1 then
    raise exception 'fn_auto_journal_membership_payment cambió';
  end if;
  execute replace(v_def, v_viejo,
    E'        -- Tarjeta o pasarela: el auxiliar del procesador (138020xx). Contador 2026-11-21.\n'
    || E'        COALESCE(public.fn_cuenta_procesador_cobro(v_org_id, NEW.method, NEW.processor), v_rule.debit_account_code),\n'
    || E'        v_rule.credit_account_code,\n        v_amount,');
end $$;

do $$
declare
  v_def text := pg_get_functiondef('public.fn_auto_journal_parking_payment'::regproc);
  v_viejo text := E'        v_rule.debit_account_code,\n        v_rule.credit_account_code,\n        v_amount,';
begin
  if position('fn_cuenta_procesador_cobro' in v_def) > 0 then
    return;
  end if;
  if (length(v_def) - length(replace(v_def, v_viejo, ''))) / length(v_viejo) <> 1 then
    raise exception 'fn_auto_journal_parking_payment cambió';
  end if;
  execute replace(v_def, v_viejo,
    E'        -- Tarjeta o pasarela: el auxiliar del procesador (138020xx). Contador 2026-11-21.\n'
    || E'        coalesce(public.fn_cuenta_procesador_cobro(v_org_id, new.method, new.processor), v_rule.debit_account_code),\n'
    || E'        v_rule.credit_account_code,\n        v_amount,');
end $$;

-- ── 2. IVA de la comisión en el abono ─────────────────────────────────────────
alter table public.payment_processor_payouts
  add column if not exists commission_vat numeric(14, 2) not null default 0,
  add column if not exists commission_vat_deductible numeric(14, 2) not null default 0,
  add column if not exists vat_treatment text,
  add column if not exists commission_invoice text;
alter table public.payment_processor_payouts drop constraint if exists payment_processor_payouts_check;
alter table public.payment_processor_payouts drop constraint if exists payment_processor_payouts_cuadre_check;
alter table public.payment_processor_payouts add constraint payment_processor_payouts_cuadre_check
  check (gross_amount = net_amount + commission + commission_vat + withholding_income + withholding_vat + withholding_ica);
alter table public.payment_processor_payouts drop constraint if exists payment_processor_payouts_vat_treatment_check;
alter table public.payment_processor_payouts add constraint payment_processor_payouts_vat_treatment_check
  check (vat_treatment is null or vat_treatment in ('descontable', 'gasto', 'proporcional', 'exterior'));
comment on column public.payment_processor_payouts.commission_vat is 'IVA de la comisión según el extracto.';
comment on column public.payment_processor_payouts.commission_vat_deductible is 'Parte del IVA de la comisión que va a IVA descontable (2408); el resto es mayor gasto en 53051501.';
comment on column public.payment_processor_payouts.vat_treatment is 'descontable · gasto · proporcional (art. 490 ET) · exterior (Stripe/PayPal: pendiente contable).';
comment on column public.payment_processor_payouts.commission_invoice is 'Factura electrónica del adquirente por la comisión (exigida para descontar el IVA).';

-- ¿La organización es responsable de IVA en esa fecha? true / false / null (sin perfil).
create or replace function public.fn_org_responsable_iva(p_organization_id integer, p_fecha date)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select case
           when p.regimen = 'no_responsable_iva' or 'O-49' = any (coalesce(p.responsabilidades, '{}'::text[])) then false
           when 'O-48' = any (coalesce(p.responsabilidades, '{}'::text[])) or p.regimen in ('ordinario', 'simple') then true
         end
    from public.organization_tax_profiles p
   where p.organization_id = p_organization_id
     and p.vigente_desde <= p_fecha and (p.vigente_hasta is null or p.vigente_hasta >= p_fecha)
   order by p.vigente_desde desc
   limit 1;
$function$;
revoke all on function public.fn_org_responsable_iva(integer, date) from public, anon, authenticated;

-- Abono con IVA de la comisión.
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
  v_iva numeric;
  v_iva_desc numeric := 0;
  v_prop numeric;
  v_trat text;
  v_resp boolean;
  v_cta_iva text;
  v_factura text := left(nullif(btrim(coalesce(p_datos->>'factura_comision', '')), ''), 60);
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
    v_iva := round(coalesce(nullif(p_datos->>'iva_comision', '')::numeric, 0), 0);
    v_prop := nullif(p_datos->>'proporcion_descontable', '')::numeric;
  exception when others then
    raise exception 'IMPORTE_INVALIDO: revise los valores del abono' using errcode = '22023';
  end;
  if v_bruto <= 0 or least(v_comision, v_rf, v_riva, v_rica, v_iva) < 0 then
    raise exception 'IMPORTE_INVALIDO: el bruto debe ser mayor que cero y los descuentos no pueden ser negativos' using errcode = '22023';
  end if;
  v_neto := v_bruto - v_comision - v_iva - v_rf - v_riva - v_rica;
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

  -- IVA de la comisión (Contador 2026-11-21): según el perfil tributario vigente en la fecha.
  if v_proc in ('stripe', 'paypal') then
    -- Servicio desde el exterior, sin IVA colombiano: el extracto como viene y queda un
    -- pendiente contable (posible IVA por retención, art. 437-2 num. 3 ET).
    v_trat := 'exterior';
  elsif v_iva > 0 then
    v_resp := public.fn_org_responsable_iva(p_organization_id, v_fecha);
    if v_prop is not null then
      if v_prop < 0 or v_prop > 1 then
        raise exception 'PROPORCION_INVALIDA: la proporción descontable va de 0 a 1' using errcode = '22023';
      end if;
      if v_resp is false then
        raise exception 'PROPORCION_NO_APLICA: la organización no es responsable de IVA; el IVA de la comisión es gasto' using errcode = '22023';
      end if;
      v_trat := 'proporcional';                     -- ventas gravadas y excluidas (art. 490 ET)
      v_iva_desc := round(v_iva * v_prop, 0);
    elsif v_resp is null then
      raise exception 'PERFIL_TRIBUTARIO_REQUERIDO: defina el perfil tributario de la organización para saber si el IVA de la comisión es descontable' using errcode = '22023';
    elsif v_resp then
      v_trat := 'descontable';                      -- arts. 485 y 488 ET
      v_iva_desc := v_iva;
    else
      v_trat := 'gasto';                            -- no responsable: mayor gasto
    end if;
    if v_iva_desc > 0 then
      if v_factura is null then
        raise exception 'FACTURA_REQUERIDA: para descontar el IVA de la comisión se necesita la factura electrónica del adquirente' using errcode = '22023';
      end if;
      v_cta_iva := coalesce(public.fn_cuenta_por_clave(p_organization_id, v_branch, 'iva_descontable'), '24081001');
    end if;
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
      (v_banco, v_neto), ('53051501', v_comision + v_iva - v_iva_desc), (coalesce(v_cta_iva, '24081001'), v_iva_desc),
      ('13551501', v_rf), ('13551701', v_riva), ('13551801', v_rica), (v_cat.cuenta, v_bruto)) as x(cuenta, monto)
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
      (2, '53051501', v_comision + v_iva - v_iva_desc, 0::numeric,
         'Comisión · ' || v_ter.nombre || case when v_iva - v_iva_desc > 0 then ' (con IVA no descontable)' else '' end, true),
      (3, coalesce(v_cta_iva, '24081001'), v_iva_desc, 0::numeric, 'IVA descontable de la comisión · ' || v_ter.nombre, true),
      (4, '13551501', v_rf, 0::numeric, 'Retención en la fuente que practicó ' || v_ter.nombre, true),
      (5, '13551701', v_riva, 0::numeric, 'ReteIVA que practicó ' || v_ter.nombre, true),
      (6, '13551801', v_rica, 0::numeric, 'ReteICA que practicó ' || v_ter.nombre, true),
      (7, v_cat.cuenta, 0::numeric, v_bruto, 'Abono bruto · ' || v_ter.nombre, true)) as x(orden, cuenta, debito, credito, descripcion, con_tercero)
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
    reference, notes, request_id, journal_entry_id, created_by,
    commission_vat, commission_vat_deductible, vat_treatment, commission_invoice)
  values (v_id, p_organization_id, v_branch, v_proc, v_fecha, v_bruto, v_comision,
          v_rf, v_riva, v_rica, v_neto, v_banco_id, v_banco,
          v_ref, v_notas, v_solicitud, v_je, v_uid,
          v_iva, v_iva_desc, v_trat, v_factura);

  if v_trat = 'exterior' and v_comision + v_iva > 0 then
    perform public.fn_log_journal_failure(
      p_organization_id, v_branch, (v_fecha::timestamp + interval '12 hours') at time zone public.fn_timezone_for(p_organization_id, v_branch),
      'payment_processor_payouts', v_id::text, 'processor_payout_iva_exterior:' || v_id,
      '53051501', v_cat.cuenta, v_comision + v_iva, 'iva_exterior_por_revisar',
      'Comisión de ' || v_ter.nombre || ' prestada desde el exterior: el abono quedó registrado como vino en el extracto. '
      || 'Revisar si aplica IVA por retención (art. 437-2 num. 3 ET) antes de automatizarlo.');
  end if;

  return jsonb_build_object('id', v_id, 'asiento', v_je, 'repetida', false, 'procesador', v_proc,
    'bruto', v_bruto, 'comision', v_comision, 'iva_comision', v_iva, 'iva_descontable', v_iva_desc,
    'tratamiento_iva', v_trat, 'retenciones', v_rf + v_riva + v_rica, 'neto', v_neto,
    'saldo_restante', v_saldo - v_bruto);
end;
$function$;
revoke all on function public.fn_procesador_abono_registrar(integer, jsonb) from public, anon;
grant execute on function public.fn_procesador_abono_registrar(integer, jsonb) to authenticated;

-- Anular un abono también cierra su pendiente de IVA del exterior.
do $$
declare
  v_def text := pg_get_functiondef('public.fn_procesador_abono_anular'::regproc);
  v_ancla text := E'  update public.payment_processor_payouts\n     set status = ''anulado''';
begin
  if position('processor_payout_iva_exterior' in v_def) > 0 then
    return;
  end if;
  if position(v_ancla in v_def) = 0 then
    raise exception 'fn_procesador_abono_anular cambió';
  end if;
  execute replace(v_def, v_ancla, E'  update public.journal_entry_failures\n     set resolved_at = now()\n   where organization_id = v_a.organization_id and fact_key = ''processor_payout_iva_exterior:'' || v_a.id\n     and resolved_at is null;\n\n' || v_ancla);
end $$;
