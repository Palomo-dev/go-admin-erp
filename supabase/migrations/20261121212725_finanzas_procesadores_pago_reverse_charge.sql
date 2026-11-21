-- Procesadores de pago, quinta parte (respuesta del Contador, 2026-11-21).
--
-- 1. Bold: NIT de fábrica BOLD.CO S.A.S. 901.281.572-4 (factura electrónica FEC4915264 y nota
--    crédito NC000427 de Bold salen de esa empresa; según la política de adquirencia de Bold, el
--    contrato del comercio es con Bold.Co).
-- 2. Tipo de documento del procesador como tercero (exógena, parágrafo 6 de la Resolución DIAN
--    000033 de 30-oct-2026), en este orden:
--      31 · NIT asignado por la DIAN;
--      42 · número fiscal de su país, tal como aparece en el contrato o el extracto;
--      43 · sin número fiscal: 444444001 y los siguientes, sin dirección.
--    Stripe y PayPal NO se cargan de fábrica: cada organización lo llena con lo que dice su
--    extracto. Sin ese dato el abono no se registra (NIT_PROCESADOR_REQUERIDO).
-- 3. IVA por reverse charge (retención del 100 % del IVA del servicio del exterior, arts. 437-1 y
--    437-2 num. 3 ET), en la fecha del abono:
--      · solo si la organización es responsable de IVA y el extracto NO trae IVA colombiano;
--      · 19 % de la comisión: D 24081003 IVA descontable por servicios del exterior
--        / C 23670502 ReteIVA por servicios del exterior;
--      · con ventas excluidas (proporción), solo se descuenta la parte proporcional y el resto va
--        a 53051501 (art. 490 ET);
--      · no responsable: no retiene (y si el extracto trae IVA, es mayor gasto en 53051501);
--      · si el procesador del exterior cobró IVA colombiano (está inscrito en la DIAN), se trata
--        como uno nacional.
--    Reemplaza el pendiente contable «iva_exterior_por_revisar».
-- La anulación del abono copia todas las líneas del asiento al revés: incluye las del reverse charge.

-- ── 1. Columnas ──────────────────────────────────────────────────────────────
alter table public.payment_processor_settings
  add column if not exists tercero_doc_type text;
alter table public.payment_processor_settings drop constraint if exists payment_processor_settings_doc_type_check;
alter table public.payment_processor_settings add constraint payment_processor_settings_doc_type_check
  check (tercero_doc_type is null or tercero_doc_type in ('31', '42', '43'));
comment on column public.payment_processor_settings.tercero_doc_type is
  'Tipo de documento del procesador para la exógena: 31 NIT DIAN · 42 número fiscal del exterior · 43 sin número fiscal (444444001…). Null: 31 si tiene NIT de fábrica.';

alter table public.payment_processor_payouts
  add column if not exists commission_vat_withheld numeric(14, 2) not null default 0;
comment on column public.payment_processor_payouts.commission_vat_withheld is
  'IVA retenido al 100 % por servicios del exterior (reverse charge, art. 437-2 num. 3 ET): 19 % de la comisión.';
alter table public.payment_processor_payouts drop constraint if exists payment_processor_payouts_vat_treatment_check;
alter table public.payment_processor_payouts add constraint payment_processor_payouts_vat_treatment_check
  check (vat_treatment is null or vat_treatment in ('descontable', 'gasto', 'proporcional', 'exterior', 'reverse_charge'));

-- ── 2. Cuentas nuevas ────────────────────────────────────────────────────────
insert into public.puc_plantilla (codigo, nombre, tipo, padre, descripcion, naturaleza, es_movimiento,
                                  requiere_tercero, requiere_centro_costo, centro_costo_modo, presentacion_niif)
values ('24081003', 'IVA descontable por servicios del exterior', 'liability', '240810',
        'IVA del servicio del exterior retenido al 100 % (reverse charge, art. 437-2 num. 3 ET).', 'debito', true, false, false, 'no_aplica', 'corriente')
on conflict (codigo) do nothing;

do $$
declare
  v_orgs integer[];
  v_org integer;
begin
  -- El arreglo se arma antes: fn_puc_asegurar_cuenta hace ALTER TABLE.
  select array_agg(distinct organization_id order by organization_id) into v_orgs
    from public.chart_of_accounts where account_code in ('240810', '236705');
  foreach v_org in array coalesce(v_orgs, '{}') loop
    perform public.fn_puc_asegurar_cuenta(v_org, '24081003', 'IVA descontable por servicios del exterior', true);
    perform public.fn_puc_asegurar_cuenta(v_org, '23670502', 'ReteIVA por servicios del exterior', true);
  end loop;
end $$;
update public.chart_of_accounts set requiere_tercero = true
 where account_code = '23670502' and requiere_tercero is distinct from true;

-- ── 3. Bold de fábrica ───────────────────────────────────────────────────────
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
      ('bold', '901281572-4', 'BOLD.CO S.A.S.'),
      ('mercadopago', '900116319-8', 'MERCADOPAGO COLOMBIA LTDA'),
      ('payu', '830109723-8', 'PAYU COLOMBIA S.A.S.')) as f(codigo, nit, nombre)
      on f.codigo = k.codigo
   where left(coalesce(p_cuenta, ''), 8) = k.cuenta;
$function$;
revoke all on function public.fn_procesador_pago_por_cuenta(integer, text) from public, anon, authenticated;

-- ── 4. Configurar: tipo de documento ─────────────────────────────────────────
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
  v_tipo text := nullif(btrim(coalesce(p_datos->>'tipo_documento', '')), '');
  v_retiene boolean;
  v_pref record;
  v_n integer;
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
  if v_tipo is not null and v_tipo not in ('31', '42', '43') then
    raise exception 'TIPO_DOCUMENTO_INVALIDO: 31 (NIT), 42 (número fiscal del exterior) o 43 (sin número fiscal)' using errcode = '22023';
  end if;
  if p_datos ? 'retiene_saldo' and jsonb_typeof(p_datos->'retiene_saldo') <> 'null' then
    if jsonb_typeof(p_datos->'retiene_saldo') <> 'boolean' then
      raise exception 'RETIENE_SALDO_INVALIDO: se espera sí o no (true/false)' using errcode = '22023';
    end if;
    v_retiene := (p_datos->>'retiene_saldo')::boolean;
  end if;
  -- 43 · sin número fiscal: 444444001 y los siguientes, uno por procesador de la organización.
  if v_tipo = '43' and v_nit is null then
    -- El que ya tenía este procesador se conserva.
    select s.tercero_nit into v_nit
      from public.payment_processor_settings s
     where s.organization_id = p_organization_id and s.processor = v_proc and s.tercero_doc_type = '43'
       and s.tercero_nit ~ '^44444400[0-9]+$';
    if v_nit is null then
      select coalesce(max(substr(s.tercero_nit, 9)::integer), 0) + 1 into v_n
        from public.payment_processor_settings s
       where s.organization_id = p_organization_id and s.tercero_doc_type = '43' and s.tercero_nit ~ '^44444400[0-9]+$';
      v_nit := '44444400' || v_n::text;
    end if;
  end if;

  insert into public.payment_processor_settings
    (organization_id, processor, tercero_nit, tercero_nombre, tercero_doc_type, origin, retains_balance, updated_by, updated_at)
  values (p_organization_id, v_proc, v_nit, v_nombre, v_tipo, v_origen, v_retiene, v_uid, now())
  on conflict (organization_id, processor) do update
    set tercero_nit = case when p_datos ? 'nit' or v_tipo = '43' then excluded.tercero_nit else payment_processor_settings.tercero_nit end,
        tercero_nombre = case when p_datos ? 'nombre' then excluded.tercero_nombre else payment_processor_settings.tercero_nombre end,
        tercero_doc_type = case when p_datos ? 'tipo_documento' then excluded.tercero_doc_type else payment_processor_settings.tercero_doc_type end,
        origin = case when p_datos ? 'origen' then excluded.origin else payment_processor_settings.origin end,
        retains_balance = case when p_datos ? 'retiene_saldo' then excluded.retains_balance else payment_processor_settings.retains_balance end,
        updated_by = excluded.updated_by, updated_at = now();

  select * into v_pref from public.fn_procesador_pago_preferencias(p_organization_id, v_proc);
  return (select jsonb_build_object('procesador', v_proc, 'nit', s.tercero_nit, 'nombre', s.tercero_nombre,
                                    'tipo_documento', s.tercero_doc_type,
                                    'origen', v_pref.origen, 'retiene_saldo', v_pref.retiene_saldo)
            from public.payment_processor_settings s
           where s.organization_id = p_organization_id and s.processor = v_proc);
end;
$function$;
revoke all on function public.fn_procesador_pago_configurar(integer, jsonb) from public, anon;
grant execute on function public.fn_procesador_pago_configurar(integer, jsonb) to authenticated;

-- ── 5. Abono con reverse charge ──────────────────────────────────────────────
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
  v_rc numeric := 0;
  v_rc_desc numeric := 0;
  v_prop numeric;
  v_trat text;
  v_resp boolean;
  v_exterior boolean;
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
  if v_prop is not null and (v_prop < 0 or v_prop > 1) then
    raise exception 'PROPORCION_INVALIDA: la proporción descontable va de 0 a 1' using errcode = '22023';
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
  v_exterior := (select p.origen from public.fn_procesador_pago_preferencias(p_organization_id, v_proc) p) = 'exterior';
  if v_exterior and v_iva = 0 then
    -- Servicio del exterior sin IVA colombiano en el extracto: reverse charge si la organización
    -- es responsable de IVA (arts. 437-1 y 437-2 num. 3 ET); si no lo es, no retiene.
    v_resp := public.fn_org_responsable_iva(p_organization_id, v_fecha);
    if v_resp is null then
      raise exception 'PERFIL_TRIBUTARIO_REQUERIDO: defina el perfil tributario de la organización para saber si aplica el IVA por servicios del exterior' using errcode = '22023';
    elsif v_resp and v_comision > 0 then
      v_trat := 'reverse_charge';
      v_rc := round(v_comision * 0.19, 0);
      -- Ventas excluidas: solo la parte proporcional es descontable; el resto, mayor gasto (art. 490 ET).
      v_rc_desc := case when v_prop is null then v_rc else round(v_rc * v_prop, 0) end;
      perform public.fn_puc_asegurar_cuenta(p_organization_id, '23670502', 'ReteIVA por servicios del exterior', true);
      if v_rc_desc > 0 then
        perform public.fn_puc_asegurar_cuenta(p_organization_id, '24081003', 'IVA descontable por servicios del exterior', true);
      end if;
    else
      v_trat := 'exterior';
    end if;
  elsif v_iva > 0 then
    v_resp := public.fn_org_responsable_iva(p_organization_id, v_fecha);
    if v_prop is not null then
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
  elsif v_exterior then
    v_trat := 'exterior';
  end if;

  -- No se abona más de lo que el procesador debe a esa fecha.
  v_saldo := public.fn_procesador_pago_saldo(p_organization_id, v_cat.cuenta, v_fecha);
  if v_bruto > v_saldo then
    raise exception 'ABONO_MAYOR_QUE_SALDO: % debía % a %, y el abono es por %',
      v_cat.nombre, v_saldo, v_fecha, v_bruto using errcode = '22023';
  end if;

  select * into v_ter from public.fn_procesador_pago_por_cuenta(p_organization_id, v_cat.cuenta);
  if v_ter.nit is null then
    raise exception 'NIT_PROCESADOR_REQUERIDO: falta el NIT de %; complételo en Datos de los procesadores', v_ter.nombre using errcode = '22023';
  end if;
  v_memo := 'Abono ' || v_ter.nombre || coalesce(' · ' || v_ref, '');

  -- Las cuentas tienen que existir y recibir movimientos (con su auxiliar de sede).
  for v_lin in
    select * from (values
      (v_banco, v_neto), ('53051501', v_comision + v_iva - v_iva_desc + v_rc - v_rc_desc), (coalesce(v_cta_iva, '24081001'), v_iva_desc),
      ('24081003', v_rc_desc), ('23670502', v_rc),
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
      (7, v_cat.cuenta, 0::numeric, v_bruto, 'Abono bruto · ' || v_ter.nombre, true),
      (8, '24081003', v_rc_desc, 0::numeric, 'IVA descontable por servicio del exterior (reverse charge) · ' || v_ter.nombre, true),
      (9, '53051501', v_rc - v_rc_desc, 0::numeric, 'IVA no descontable por servicio del exterior (art. 490 ET) · ' || v_ter.nombre, true),
      (10, '23670502', 0::numeric, v_rc, 'ReteIVA 100 % por servicio del exterior (art. 437-2 num. 3 ET) · ' || v_ter.nombre, true))
      as x(orden, cuenta, debito, credito, descripcion, con_tercero)
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
    commission_vat, commission_vat_deductible, vat_treatment, commission_invoice, commission_vat_withheld)
  values (v_id, p_organization_id, v_branch, v_proc, v_fecha, v_bruto, v_comision,
          v_rf, v_riva, v_rica, v_neto, v_banco_id, v_banco,
          v_ref, v_notas, v_solicitud, v_je, v_uid,
          v_iva, v_iva_desc + v_rc_desc, v_trat, v_factura, v_rc);

  return jsonb_build_object('id', v_id, 'asiento', v_je, 'repetida', false, 'procesador', v_proc,
    'bruto', v_bruto, 'comision', v_comision, 'iva_comision', v_iva, 'iva_descontable', v_iva_desc + v_rc_desc,
    'iva_retenido_exterior', v_rc,
    'tratamiento_iva', v_trat, 'retenciones', v_rf + v_riva + v_rica, 'neto', v_neto,
    'saldo_restante', v_saldo - v_bruto);
end;
$function$;
revoke all on function public.fn_procesador_abono_registrar(integer, jsonb) from public, anon;
grant execute on function public.fn_procesador_abono_registrar(integer, jsonb) to authenticated;
