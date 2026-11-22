-- Reversión de 20261121212725_finanzas_procesadores_pago_reverse_charge.sql
--
-- Vuelve a: Bold sin NIT de fábrica, sin tipo de documento del procesador y el abono sin
-- reverse charge (el exterior deja el pendiente «iva_exterior_por_revisar»). Se detiene si ya
-- hay abonos con reverse charge o procesadores con tipo de documento elegido.
-- Las cuentas 24081003 y 23670502 se quedan (no se borra plan de cuentas); si no tienen
-- movimientos, se pueden inactivar a mano.

do $$
begin
  if exists (select 1 from public.payment_processor_payouts where vat_treatment = 'reverse_charge' or commission_vat_withheld <> 0)
     or exists (select 1 from public.payment_processor_settings where tercero_doc_type is not null) then
    raise exception 'Hay abonos con reverse charge o tipos de documento elegidos: revertirlos antes';
  end if;
end $$;

-- El abono, como quedó tras 20261121105051 + 20261121174749 (origen) + 20261121190106 (NIT).
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

do $$
declare
  v_def text := pg_get_functiondef('public.fn_procesador_abono_registrar(integer, jsonb)'::regprocedure);
  v_viejo text := E'  if v_proc in (''stripe'', ''paypal'') then\n';
  v_nuevo text := E'  if (select p.origen from public.fn_procesador_pago_preferencias(p_organization_id, v_proc) p) = ''exterior'' then\n';
begin
  if position(v_nuevo in v_def) > 0 then
    return;
  end if;
  if (length(v_def) - length(replace(v_def, v_viejo, ''))) / length(v_viejo) <> 1 then
    raise exception 'fn_procesador_abono_registrar cambió: no se encontró una sola vez la regla de Stripe y PayPal';
  end if;
  execute replace(v_def, v_viejo, v_nuevo);
end $$;

do $$
declare
  v_def text := pg_get_functiondef('public.fn_procesador_abono_registrar(integer, jsonb)'::regprocedure);
  v_ancla text := E'  select * into v_ter from public.fn_procesador_pago_por_cuenta(p_organization_id, v_cat.cuenta);\n';
  v_regla text := E'  if v_ter.nit is null then\n'
               || E'    raise exception ''NIT_PROCESADOR_REQUERIDO: falta el NIT de %; complételo en Datos de los procesadores'', v_ter.nombre using errcode = ''22023'';\n'
               || E'  end if;\n';
begin
  if position('NIT_PROCESADOR_REQUERIDO' in v_def) > 0 then
    return;
  end if;
  if (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 1 then
    raise exception 'fn_procesador_abono_registrar cambió: no se encontró una sola vez la lectura del tercero';
  end if;
  execute replace(v_def, v_ancla, v_ancla || v_regla);
end $$;

create or replace function public.fn_procesador_pago_configurar(p_organization_id integer, p_datos jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_proc text := p_datos->>'procesador';
  v_nit text := left(nullif(regexp_replace(coalesce(p_datos->>'nit', ''), '[^0-9A-Za-z-]', '', 'g'), ''), 20);
  v_nombre text := left(nullif(btrim(coalesce(p_datos->>'nombre', '')), ''), 120);
  v_origen text := nullif(lower(btrim(coalesce(p_datos->>'origen', ''))), '');
  v_retiene boolean;
  v_pref record;
begin
  if v_uid is null then
    raise exception 'SESION_REQUERIDA' using errcode = '42501';
  end if;
  perform public.fn_assert_acceso_org(p_organization_id);
  if not public.fn_tiene_permiso(p_organization_id, 'finance.create') then
    raise exception 'SIN_PERMISO: requiere el permiso finance.create' using errcode = '42501';
  end if;
  if not exists (select 1 from public.fn_procesadores_pago_catalogo() k where k.codigo = v_proc) then
    raise exception 'PROCESADOR_INVALIDO: %', coalesce(v_proc, '(vacío)') using errcode = '22023';
  end if;
  if v_origen is not null and v_origen not in ('nacional', 'exterior') then
    raise exception 'ORIGEN_INVALIDO: el origen es nacional o exterior' using errcode = '22023';
  end if;
  if p_datos ? 'retiene_saldo' and jsonb_typeof(p_datos->'retiene_saldo') <> 'null' then
    if jsonb_typeof(p_datos->'retiene_saldo') <> 'boolean' then
      raise exception 'RETIENE_SALDO_INVALIDO: se espera sí o no (true/false)' using errcode = '22023';
    end if;
    v_retiene := (p_datos->>'retiene_saldo')::boolean;
  end if;

  insert into public.payment_processor_settings
    (organization_id, processor, tercero_nit, tercero_nombre, origin, retains_balance, updated_by, updated_at)
  values (p_organization_id, v_proc, v_nit, v_nombre, v_origen, v_retiene, v_uid, now())
  on conflict (organization_id, processor) do update
    set tercero_nit = case when p_datos ? 'nit' then excluded.tercero_nit else payment_processor_settings.tercero_nit end,
        tercero_nombre = case when p_datos ? 'nombre' then excluded.tercero_nombre else payment_processor_settings.tercero_nombre end,
        origin = case when p_datos ? 'origen' then excluded.origin else payment_processor_settings.origin end,
        retains_balance = case when p_datos ? 'retiene_saldo' then excluded.retains_balance else payment_processor_settings.retains_balance end,
        updated_by = excluded.updated_by, updated_at = now();

  select * into v_pref from public.fn_procesador_pago_preferencias(p_organization_id, v_proc);
  return (select jsonb_build_object('procesador', v_proc, 'nit', s.tercero_nit, 'nombre', s.tercero_nombre,
                                    'origen', v_pref.origen, 'retiene_saldo', v_pref.retiene_saldo)
            from public.payment_processor_settings s
           where s.organization_id = p_organization_id and s.processor = v_proc);
end;
$function$;
revoke all on function public.fn_procesador_pago_configurar(integer, jsonb) from public, anon;
grant execute on function public.fn_procesador_pago_configurar(integer, jsonb) to authenticated;

create or replace function public.fn_procesador_pago_por_cuenta(p_organization_id integer, p_cuenta text)
 returns table(codigo text, nombre text, nit text, cuenta text)
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select k.codigo,
         coalesce(nullif(btrim(s.tercero_nombre), ''), f.nombre, k.nombre),
         coalesce(nullif(btrim(s.tercero_nit), ''), f.nit),
         k.cuenta
    from public.fn_procesadores_pago_catalogo() k
    left join public.payment_processor_settings s
      on s.organization_id = p_organization_id and s.processor = k.codigo
    left join (values
      ('wompi', '900499068-7', 'WOMPI S.A.S.'),
      ('mercadopago', '900116319-8', 'MERCADOPAGO COLOMBIA LTDA'),
      ('payu', '830109723-8', 'PAYU COLOMBIA S.A.S.')) as f(codigo, nit, nombre)
      on f.codigo = k.codigo
   where left(coalesce(p_cuenta, ''), 8) = k.cuenta;
$function$;
revoke all on function public.fn_procesador_pago_por_cuenta(integer, text) from public, anon, authenticated;

delete from public.puc_plantilla where codigo = '24081003'
  and not exists (select 1 from public.chart_of_accounts c join public.journal_lines l on l.account_code = c.account_code where c.account_code = '24081003');

alter table public.payment_processor_payouts drop constraint if exists payment_processor_payouts_vat_treatment_check;
alter table public.payment_processor_payouts add constraint payment_processor_payouts_vat_treatment_check
  check (vat_treatment is null or vat_treatment in ('descontable', 'gasto', 'proporcional', 'exterior'));
alter table public.payment_processor_payouts drop column if exists commission_vat_withheld;
alter table public.payment_processor_settings drop constraint if exists payment_processor_settings_doc_type_check;
alter table public.payment_processor_settings drop column if exists tercero_doc_type;
