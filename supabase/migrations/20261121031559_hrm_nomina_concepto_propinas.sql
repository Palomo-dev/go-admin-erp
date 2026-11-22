-- Propinas por nómina: concepto «Propinas (no salarial)» (Contador, 2026-11-20).
--
-- La propina que se paga dentro de la nómina no es gasto (nada a 5105), no es
-- salario y no entra en la base de aportes, de prestaciones ni en la regla del
-- 40 % (art. 131 CST, Ley 1935 de 2018). Asiento de la nómina: Débito 28150502
-- (propinas liquidadas por pagar, con el trabajador de tercero) / Crédito 2505
-- (por el neto). El pago de la nómina sale normal: Débito 2505 / Crédito banco.
-- fn_hr_nomina_asentar ya arma ese asiento a partir de la cuenta del concepto.
--
-- Regla de control: la nómina no paga más propina que lo liquidado y por pagar
-- de ese trabajador (28150502). Se bloquea al registrar la novedad y otra vez al
-- contabilizar la colilla. Lo que paga la nómina se descuenta de las
-- liquidaciones del trabajador (las más antiguas primero).
--
-- Solo desde 28150502: la 28150501 lleva de tercero al cliente que dejó la
-- propina, no al trabajador, así que no tiene saldo por trabajador. Para pagar
-- por nómina, primero se liquida (Propinas › Liquidar › Pagar después).
--
-- A la fecha no hay colillas ni novedades de nómina (0 filas).

-- ── 1. Catálogo de la plataforma: semilla vigente, con PROPINAS ───────────────
-- catalogo-nomina: semilla vigente de la plataforma (la prueba nominaCatalogoConceptos la compara con conceptos.ts)
insert into public.hr_payroll_concepts
  (organization_id, code, name, kind, is_salarial, base_ss, cuenta_40, is_prestacional, base_retencion, base_parafiscales, debit_account, credit_account, dian_code, is_system)
select null, v.* , true from (values
  ('SALARIO', 'Salario', 'devengado', true, true, false, true, true, true, '510506', null, 'Basico'),
  ('SALARIO_INTEGRAL', 'Salario integral', 'devengado', true, true, false, false, true, true, '510503', null, 'Basico'),
  ('SALARIO_HORAS', 'Horas ordinarias (salario por hora)', 'devengado', true, true, false, true, true, true, '510506', null, 'Basico'),
  ('DESCUENTO_TIEMPO', 'Tiempo no trabajado sin justificar', 'devengado', true, true, false, true, true, true, '510506', null, 'Basico'),
  ('RECARGO_NOCTURNO', 'Recargo nocturno', 'devengado', true, true, false, true, true, true, '510515', null, 'HRN'),
  ('RECARGO_DOMINICAL', 'Recargo dominical o festivo', 'devengado', true, true, false, true, true, true, '510515', null, 'HRDDF'),
  ('RECARGO_DOMINICAL_NOCTURNO', 'Recargo dominical o festivo nocturno', 'devengado', true, true, false, true, true, true, '510515', null, 'HRNDF'),
  ('HORA_EXTRA_DIURNA', 'Hora extra diurna', 'devengado', true, true, false, true, true, true, '510515', null, 'HED'),
  ('HORA_EXTRA_NOCTURNA', 'Hora extra nocturna', 'devengado', true, true, false, true, true, true, '510515', null, 'HEN'),
  ('HORA_EXTRA_DOMINICAL_DIURNA', 'Hora extra dominical o festiva diurna', 'devengado', true, true, false, true, true, true, '510515', null, 'HEDDF'),
  ('HORA_EXTRA_DOMINICAL_NOCTURNA', 'Hora extra dominical o festiva nocturna', 'devengado', true, true, false, true, true, true, '510515', null, 'HENDF'),
  ('AUXILIO_TRANSPORTE', 'Auxilio de transporte', 'devengado', false, false, false, true, true, false, '510527', null, 'AuxilioTransporte'),
  ('COMISIONES', 'Comisiones', 'devengado', true, true, false, true, true, true, '510518', null, 'Comision'),
  ('BONIFICACION_SALARIAL', 'Bonificación salarial', 'devengado', true, true, false, true, true, true, '510548', null, 'BonificacionS'),
  ('BONIFICACION_NO_SALARIAL', 'Bonificación no salarial', 'devengado', false, false, true, false, true, false, '510548', null, 'BonificacionNS'),
  ('AUXILIO_NO_SALARIAL', 'Auxilio no salarial', 'devengado', false, false, true, false, true, false, '510545', null, 'AuxilioNS'),
  ('RETROACTIVO', 'Retroactivo salarial', 'devengado', true, true, false, true, true, true, '510506', null, 'Reintegro'),
  ('VACACIONES_DISFRUTADAS', 'Vacaciones disfrutadas', 'devengado', true, true, false, false, true, true, '2525', null, 'VacacionesComunes'),
  ('VACACIONES_COMPENSADAS', 'Vacaciones compensadas en dinero', 'devengado', false, false, false, false, true, true, '2525', null, 'VacacionesCompensadas'),
  ('INCAPACIDAD_COMUN', 'Incapacidad de origen común', 'devengado', false, true, false, false, true, false, '510524', null, 'Incapacidad'),
  ('INCAPACIDAD_LABORAL', 'Incapacidad de origen laboral', 'devengado', false, true, false, false, true, false, '510524', null, 'Incapacidad'),
  ('LICENCIA_MATERNIDAD', 'Licencia de maternidad', 'devengado', false, true, false, false, true, false, '510595', null, 'LicenciaMP'),
  ('LICENCIA_PATERNIDAD', 'Licencia de paternidad', 'devengado', false, true, false, false, true, false, '510595', null, 'LicenciaMP'),
  ('LICENCIA_REMUNERADA', 'Licencia remunerada', 'devengado', true, true, false, true, true, true, '510506', null, 'LicenciaR'),
  ('PRIMA_SERVICIOS', 'Prima de servicios', 'devengado', false, false, false, false, true, false, '2520', null, 'Primas'),
  ('INTERESES_CESANTIAS', 'Intereses sobre cesantías', 'devengado', false, false, false, false, true, false, '2515', null, 'Cesantias'),
  ('PROPINAS', 'Propinas (no salarial)', 'devengado', false, false, false, false, false, false, '28150502', null, null),
  ('SALUD_EMPLEADO', 'Salud (trabajador)', 'deduccion', false, false, false, false, false, false, null, '237005', 'Salud'),
  ('PENSION_EMPLEADO', 'Pensión (trabajador)', 'deduccion', false, false, false, false, false, false, null, '238030', 'FondoPension'),
  ('FONDO_SOLIDARIDAD', 'Fondo de solidaridad pensional', 'deduccion', false, false, false, false, false, false, null, '238030', 'FondoSP'),
  ('RETENCION_FUENTE', 'Retención en la fuente', 'deduccion', false, false, false, false, false, false, null, '236505', 'RetencionFuente'),
  ('EMBARGO_ALIMENTOS', 'Embargo por alimentos', 'deduccion', false, false, false, false, false, false, null, '237025', 'EmbargoFiscal'),
  ('EMBARGO_COOPERATIVA', 'Embargo de cooperativa', 'deduccion', false, false, false, false, false, false, null, '237025', 'EmbargoFiscal'),
  ('EMBARGO_ORDINARIO', 'Embargo ordinario', 'deduccion', false, false, false, false, false, false, null, '237025', 'EmbargoFiscal'),
  ('PRESTAMO', 'Préstamo a empleado', 'deduccion', false, false, false, false, false, false, null, '136595', 'Deuda'),
  ('LIBRANZA', 'Libranza', 'deduccion', false, false, false, false, false, false, null, '237030', 'Libranza'),
  ('APORTE_COOPERATIVA', 'Aporte a cooperativa', 'deduccion', false, false, false, false, false, false, null, '237040', 'Cooperativa'),
  ('FONDO_EMPLEADOS', 'Aporte al fondo de empleados', 'deduccion', false, false, false, false, false, false, null, '237045', null),
  ('CUOTA_SINDICAL', 'Cuota sindical', 'deduccion', false, false, false, false, false, false, null, '237035', 'Sindicatos'),
  ('OTRO_DESCUENTO', 'Otro descuento autorizado', 'deduccion', false, false, false, false, false, false, null, '237095', 'OtraDeduccion'),
  ('SALUD_EMPLEADOR', 'Salud (empleador)', 'aporte_empleador', false, false, false, false, false, false, '510569', '237005', null),
  ('PENSION_EMPLEADOR', 'Pensión (empleador)', 'aporte_empleador', false, false, false, false, false, false, '510570', '238030', null),
  ('ARL', 'Riesgos laborales (ARL)', 'aporte_empleador', false, false, false, false, false, false, '510568', '237006', null),
  ('CAJA_COMPENSACION', 'Caja de compensación', 'aporte_empleador', false, false, false, false, false, false, '510572', '237010', null),
  ('ICBF', 'ICBF', 'aporte_empleador', false, false, false, false, false, false, '510575', '237010', null),
  ('SENA', 'SENA', 'aporte_empleador', false, false, false, false, false, false, '510578', '237010', null),
  ('PROVISION_CESANTIAS', 'Provisión de cesantías', 'provision', false, false, false, false, false, false, '510530', '2510', null),
  ('PROVISION_INTERESES', 'Provisión de intereses sobre cesantías', 'provision', false, false, false, false, false, false, '510533', '2515', null),
  ('PROVISION_PRIMA', 'Provisión de prima de servicios', 'provision', false, false, false, false, false, false, '510536', '2520', null),
  ('PROVISION_VACACIONES', 'Provisión de vacaciones', 'provision', false, false, false, false, false, false, '510539', '2525', null),
  ('CESANTIAS_CONSIGNAR', 'Cesantías por consignar al fondo', 'informativo', false, false, false, false, false, false, '2510', '2510', 'Cesantias'),
  ('INCAPACIDAD_POR_COBRAR', 'Incapacidad o licencia por cobrar a la EPS, la ARL o el fondo', 'informativo', false, false, false, false, false, false, '138095', null, null),
  ('RECUPERACION_PROVISIONES', 'Recuperación de provisiones de nómina de un año cerrado', 'informativo', false, false, false, false, false, false, null, '425050', null)
) as v(code, name, kind, is_salarial, base_ss, cuenta_40, is_prestacional, base_retencion, base_parafiscales, debit_account, credit_account, dian_code)
on conflict (organization_id, code) do update
  set name = excluded.name, kind = excluded.kind, is_salarial = excluded.is_salarial, base_ss = excluded.base_ss,
      cuenta_40 = excluded.cuenta_40, is_prestacional = excluded.is_prestacional, base_retencion = excluded.base_retencion,
      base_parafiscales = excluded.base_parafiscales, debit_account = excluded.debit_account,
      credit_account = excluded.credit_account, dian_code = excluded.dian_code, is_system = true, updated_at = now()
  where public.hr_payroll_concepts.organization_id is null;

-- ── 2. Pago parcial por línea ──────────────────────────────────────────────
alter table public.tip_settlement_lines
  add column if not exists paid_amount numeric(14, 2) not null default 0,
  add column if not exists payroll_slip_id uuid references public.payroll_slips(id);

comment on column public.tip_settlement_lines.paid_amount is
  'Cuánto de esta línea ya se pagó (caja, banco o nómina). Por pagar = amount − paid_amount.';
comment on column public.tip_settlement_lines.payroll_slip_id is
  'Última colilla de nómina que pagó (parte de) esta línea.';

-- ── 3. Saldo por pagar de un trabajador ────────────────────────────────────
create or replace function public.fn_propinas_saldo_por_pagar(p_organization_id integer, p_user uuid)
 returns numeric
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select coalesce(sum(l.amount - l.paid_amount), 0)::numeric
    from public.tip_settlement_lines l
    join public.tip_settlements s on s.id = l.settlement_id
   where s.organization_id = p_organization_id and s.status <> 'anulada'
     and l.person_id = p_user and l.paid_at is null and l.amount > l.paid_amount;
$function$;

-- Usuario de un vínculo laboral (la liquidación de propinas va por usuario).
create or replace function public.fn_propinas_usuario_de_vinculo(p_employment uuid)
 returns uuid
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select coalesce(
    (select hp.user_id from public.employments e join public.hr_people hp on hp.id = e.person_id where e.id = p_employment),
    (select om.user_id from public.employments e join public.organization_members om on om.id = e.organization_member_id where e.id = p_employment));
$function$;

revoke all on function public.fn_propinas_saldo_por_pagar(integer, uuid) from public, anon, authenticated;
revoke all on function public.fn_propinas_usuario_de_vinculo(uuid) from public, anon, authenticated;

-- ── 4. Lo que paga la nómina se descuenta de las liquidaciones ─────────────
create or replace function public.fn_propinas_aplicar_nomina(p_organization_id integer, p_user uuid, p_monto numeric, p_slip uuid)
 returns numeric
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_resta numeric := coalesce(p_monto, 0);
  v_toma numeric;
  v_rec record;
begin
  for v_rec in
    select l.id, l.settlement_id, l.amount, l.paid_amount
      from public.tip_settlement_lines l
      join public.tip_settlements s on s.id = l.settlement_id
     where s.organization_id = p_organization_id and s.status <> 'anulada'
       and l.person_id = p_user and l.paid_at is null and l.amount > l.paid_amount
     order by s.created_at, s.number, l.id
     for update of l
  loop
    exit when v_resta <= 0;
    v_toma := least(v_resta, v_rec.amount - v_rec.paid_amount);
    update public.tip_settlement_lines
       set paid_amount = paid_amount + v_toma,
           paid_method = 'nomina',
           payroll_slip_id = p_slip,
           paid_at = case when paid_amount + v_toma >= amount then now() end
     where id = v_rec.id;
    v_resta := v_resta - v_toma;
    update public.tip_settlements s
       set status = case when exists (select 1 from public.tip_settlement_lines l2
                                       where l2.settlement_id = s.id and l2.paid_at is null and l2.amount > l2.paid_amount)
                         then 'por_pagar' else 'pagada' end
     where s.id = v_rec.settlement_id;
  end loop;
  return v_resta;  -- 0 si alcanzó el saldo
end;
$function$;

revoke all on function public.fn_propinas_aplicar_nomina(integer, uuid, numeric, uuid) from public, anon, authenticated;

-- ── 5. Pagar por caja o banco: solo lo que falta de cada línea ──────────────
do $$
declare
  v_def text := pg_get_functiondef('public.fn_propinas_pagar_lineas'::regproc);
  v_n int;
begin
  if position('paid_amount' in v_def) > 0 then
    return;
  end if;
  v_n := (length(v_def) - length(replace(v_def, 'l.paid_at is null and l.amount > 0', ''))) / length('l.paid_at is null and l.amount > 0');
  if v_n <> 4 then
    raise exception 'fn_propinas_pagar_lineas cambió (% condiciones)', v_n;
  end if;
  v_def := replace(v_def, 'l.paid_at is null and l.amount > 0', 'l.paid_at is null and l.amount > l.paid_amount');
  v_def := replace(v_def, 'select coalesce(sum(l.amount), 0) into v_total', 'select coalesce(sum(l.amount - l.paid_amount), 0) into v_total');
  v_def := replace(v_def, 'select l.id, l.person_id, l.amount', 'select l.id, l.person_id, l.amount - l.paid_amount as amount');
  v_def := replace(v_def, 'set paid_at = now(), paid_method = p_medio, paid_by = p_uid, cash_movement_id = v_mov_id,',
                          'set paid_at = now(), paid_amount = l.amount, paid_method = coalesce(l.paid_method, p_medio), paid_by = p_uid,
           cash_movement_id = coalesce(v_mov_id, l.cash_movement_id),');
  if position('l.amount - l.paid_amount as amount' in v_def) = 0 or position('paid_amount = l.amount' in v_def) = 0 then
    raise exception 'fn_propinas_pagar_lineas: no se pudo adaptar';
  end if;
  execute v_def;
end $$;

-- El cuadre y el detalle cuentan lo pagado en parte.
do $$
declare
  v_def text := pg_get_functiondef('public.fn_propinas_cuadre'::regproc);
begin
  if position('paid_amount' in v_def) > 0 then
    return;
  end if;
  v_def := replace(v_def, 'select coalesce(sum(l.amount), 0) into v_por_pagar', 'select coalesce(sum(l.amount - l.paid_amount), 0) into v_por_pagar');
  v_def := replace(v_def, 'select l.person_id, sum(l.amount) as monto', 'select l.person_id, sum(l.amount - l.paid_amount) as monto');
  v_def := replace(v_def, 's.created_at <= p_hasta and l.amount > 0', 's.created_at <= p_hasta and l.amount > l.paid_amount');
  if position('sum(l.amount - l.paid_amount) as monto' in v_def) = 0 then
    raise exception 'fn_propinas_cuadre cambió';
  end if;
  execute v_def;
end $$;

do $$
declare
  v_def text := pg_get_functiondef('public.fn_propinas_liquidacion_detalle'::regproc);
begin
  if position('pagado_monto' in v_def) > 0 then
    return;
  end if;
  if position($q$'pagado_en', l.paid_at, 'medio_pago', l.paid_method)$q$ in v_def) = 0 then
    raise exception 'fn_propinas_liquidacion_detalle cambió';
  end if;
  execute replace(v_def, $q$'pagado_en', l.paid_at, 'medio_pago', l.paid_method)$q$,
                         $q$'pagado_en', l.paid_at, 'medio_pago', l.paid_method, 'pagado_monto', l.paid_amount)$q$);
end $$;

-- ── 6. Novedad de propinas: no más que el saldo del trabajador ──────────────
do $$
declare
  v_def text := pg_get_functiondef('public.fn_hr_nomina_novedad_registrar'::regproc);
  v_ancla text := E'    raise exception ''concepto_no_admitido: % lo calcula el motor o no existe'', v_codigo using errcode = ''22023'';\n  end if;\n';
begin
  if position('propinas_sin_saldo' in v_def) > 0 then
    return;
  end if;
  if position(v_ancla in v_def) = 0 or position(E'  v_inst uuid;\n' in v_def) = 0 then
    raise exception 'fn_hr_nomina_novedad_registrar cambió';
  end if;
  v_def := replace(v_def, E'  v_inst uuid;\n', E'  v_inst uuid;\n  v_saldo numeric;\n  v_usuario uuid;\n');
  v_def := replace(v_def, v_ancla, v_ancla || $p$  -- Propinas (no salarial), Contador 2026-11-20: la nómina no paga más que lo
  -- liquidado y por pagar del trabajador (28150502), descontando las novedades de
  -- propinas que todavía no se contabilizan.
  if v_codigo = 'PROPINAS' then
    if coalesce(nullif(p_datos->>'valor', '')::numeric, 0) <= 0 then
      raise exception 'propinas_valor_requerido: la propina se registra por valor' using errcode = '22023';
    end if;
    v_usuario := public.fn_propinas_usuario_de_vinculo(e.id);
    v_saldo := case when v_usuario is null then 0 else public.fn_propinas_saldo_por_pagar(p_org, v_usuario) end
               - coalesce((select sum(n.amount) from public.hr_payroll_novelties n
                            join public.payroll_periods p2 on p2.id = n.period_id
                           where n.organization_id = p_org and n.employment_id = e.id and n.concept_code = 'PROPINAS'
                             and n.status in ('pendiente', 'aprobada')
                             and p2.status in ('open', 'calculating', 'calculated', 'reviewing')), 0);
    if (p_datos->>'valor')::numeric > greatest(v_saldo, 0) then
      raise exception 'propinas_sin_saldo: el trabajador tiene % en propinas liquidadas por pagar; liquídelas primero en Propinas', greatest(v_saldo, 0)
        using errcode = '22023';
    end if;
  end if;
$p$);
  execute v_def;
end $$;

-- ── 7. Contabilizar la colilla: el mismo control y el descuento de las liquidaciones ─
do $$
declare
  v_def text := pg_get_functiondef('public.fn_hr_nomina_asentar'::regproc);
  v_falla text := E'  if v_falta is not null then\n    perform public.fn_log_journal_failure(p_org, p_sede, v_fecha, ''payroll_slips'', v_source_id, v_fact, null, null, p_slip.net_pay, v_motivo, v_falta);\n    return;\n  end if;\n';
  v_resuelto text := E'  -- El rechazo anterior de este hecho queda resuelto.\n';
begin
  if position('propinas_sin_saldo' in v_def) > 0 then
    return;
  end if;
  if position(v_falla in v_def) = 0 or position(v_resuelto in v_def) = 0 or position(E'  l record;\nbegin' in v_def) = 0 then
    raise exception 'fn_hr_nomina_asentar cambió';
  end if;
  v_def := replace(v_def, E'  l record;\nbegin', E'  l record;\n  v_prop numeric := 0;\n  v_usuario uuid;\n  v_saldo numeric;\nbegin');
  v_def := replace(v_def, v_falla, $p$  -- Propinas (no salarial), Contador 2026-11-20: no más que lo liquidado y por
  -- pagar del trabajador en 28150502.
  if v_falta is null and p_evento = 'created' then
    select coalesce(sum(i.amount), 0) into v_prop
      from public.payroll_items i where i.payroll_slip_id = p_slip.id and i.code = 'PROPINAS';
    if v_prop > 0 then
      v_usuario := public.fn_propinas_usuario_de_vinculo(p_slip.employment_id);
      v_saldo := case when v_usuario is null then 0 else public.fn_propinas_saldo_por_pagar(p_org, v_usuario) end;
      if v_prop > v_saldo then
        v_motivo := 'propinas_sin_saldo';
        v_falta := 'La nómina paga ' || v_prop || ' en propinas y el trabajador tiene ' || v_saldo
                   || ' liquidado por pagar (28150502): liquide primero las propinas';
      end if;
    end if;
  end if;

$p$ || v_falla);
  v_def := replace(v_def, v_resuelto, $p$  if p_evento = 'created' and v_prop > 0 then
    perform public.fn_propinas_aplicar_nomina(p_org, v_usuario, v_prop, p_slip.id);
  end if;
$p$ || v_resuelto);
  execute v_def;
end $$;
