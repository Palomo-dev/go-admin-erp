-- Reversión de 20261116235754_hrm_f3_11_nomina_ajuste_anual_recuperacion.
-- Devuelve fn_hr_nomina_ajuste_anual_provisiones a 20261116232134_hrm_f3_09_nomina_ronda3_cuentas (sin recuperaciones
-- ni soporte de vacaciones; ese formato de p_vacaciones es {vinculo_id: valor}), quita el concepto de plataforma
-- RECUPERACION_PROVISIONES y las columnas soporte_vacaciones, criterio y fecha_asiento.
-- ADVERTENCIA: no revierte datos. Los asientos publicados quedan como están (contra-asiento si hace falta); la
-- 425050 creada en los planes se queda; borrar las columnas borra el soporte guardado: expórtalo antes.

create or replace function public.fn_hr_nomina_ajuste_anual_provisiones(p_actor uuid, p_org integer, p_anio integer, p_vacaciones jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_corte date := make_date(p_anio, 12, 31);
  v_tz text := public.fn_timezone_for(p_org, null);
  v_fecha timestamptz := (make_date(p_anio, 12, 31) + time '23:00') at time zone public.fn_timezone_for(p_org, null);
  v_conceptos jsonb := public.fn_hr_nomina_conceptos(p_org);
  v_sede integer;
  v_lineas jsonb := '[]'::jsonb;
  v_detalle jsonb := '[]'::jsonb;
  k record;
  e record;
  v_pasivo text;
  v_gasto text;
  v_saldo numeric;
  v_real numeric;
  v_dif numeric;
  v_entry integer;
  l record;
begin
  if not public.fn_hr_puede_actor(p_actor, p_org, 'hr.payroll.close') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if not public.fn_hr_nomina_habilitada(p_org) then
    raise exception 'nomina_no_habilitada' using errcode = '55000';
  end if;
  if exists (select 1 from public.hr_payroll_year_adjustments a where a.organization_id = p_org and a.anio = p_anio) then
    raise exception 'ajuste_ya_registrado: el ajuste anual de % ya existe', p_anio using errcode = '55000';
  end if;
  -- El año tiene que estar liquidado: el período de cesantías cerrado y ningún período del año sin cerrar.
  if not exists (select 1 from public.payroll_periods p where p.organization_id = p_org and p.kind = 'cesantias'
                    and extract(year from p.period_end) = p_anio and p.status in ('approved', 'paid', 'closed')) then
    raise exception 'falta_periodo_cesantias: cierra primero el período de cesantías de %', p_anio using errcode = '55000';
  end if;
  if exists (select 1 from public.payroll_periods p where p.organization_id = p_org and extract(year from p.period_end) = p_anio
                and p.status in ('open', 'calculating', 'calculated', 'reviewing')) then
    raise exception 'periodos_abiertos: hay períodos de % sin cerrar', p_anio using errcode = '55000';
  end if;
  if not public.fn_is_period_open(p_org, v_corte) then
    raise exception 'periodo_contable_cerrado' using errcode = '55000';
  end if;
  select b.id into v_sede from public.branches b where b.organization_id = p_org order by b.is_main desc nulls last, b.id limit 1;

  for k in select x.key as codigo, x.value as c from jsonb_each(v_conceptos) x where x.value->>'tipo' = 'provision' order by x.key loop
    v_pasivo := public.fn_hr_nomina_cuenta(p_org, k.c->>'cuenta_credito');
    if v_pasivo is null then
      raise exception 'cuenta_no_es_de_movimiento: %', k.c->>'cuenta_credito' using errcode = '55000';
    end if;
    for e in
      select em.id, t.nit, t.nombre, em.status
        from public.employments em
       cross join lateral public.fn_hr_nomina_tercero(em.id, 'empleado', v_corte) t
       where em.organization_id = p_org and t.nit is not null
    loop
      select coalesce(sum(coalesce(jl.credit, 0) - coalesce(jl.debit, 0)), 0) into v_saldo
        from public.journal_lines jl join public.journal_entries je on je.id = jl.journal_entry_id
       where jl.organization_id = p_org and je.organization_id = p_org and jl.account_code = v_pasivo
         and jl.tercero_nit = e.nit and je.entry_date <= v_fecha;
      if k.codigo = 'PROVISION_VACACIONES' then
        if e.status = 'active' or v_saldo <> 0 then
          if p_vacaciones is null or not (p_vacaciones ? e.id::text) then
            raise exception 'falta_valor_vacaciones: el vínculo % no trae el valor de sus vacaciones pendientes', e.id using errcode = '22023';
          end if;
          v_real := round((p_vacaciones->>e.id::text)::numeric);
        else
          v_real := 0;
        end if;
      else
        v_real := 0;
      end if;
      v_dif := v_real - v_saldo;
      continue when v_dif = 0;
      v_gasto := public.fn_hr_nomina_cuenta(p_org, public.fn_hr_nomina_cuenta_area(k.c->>'cuenta_debito', public.fn_hr_nomina_area(e.id, v_corte)));
      if v_gasto is null then
        raise exception 'cuenta_no_es_de_movimiento: gasto de % para el vínculo %', k.codigo, e.id using errcode = '55000';
      end if;
      -- Más provisión: gasto contra pasivo. Provisión de más: pasivo contra gasto (mismo año).
      v_lineas := v_lineas
        || jsonb_build_object('cuenta', v_gasto, 'debito', greatest(v_dif, 0), 'credito', greatest(-v_dif, 0), 'nit', e.nit, 'nombre', e.nombre,
                              'cc', public.fn_hr_nomina_centro(e.id, v_corte), 'detalle', 'Ajuste anual ' || k.codigo)
        || jsonb_build_object('cuenta', v_pasivo, 'debito', greatest(-v_dif, 0), 'credito', greatest(v_dif, 0), 'nit', e.nit, 'nombre', e.nombre,
                              'cc', null, 'detalle', 'Ajuste anual ' || k.codigo);
      v_detalle := v_detalle || jsonb_build_object('vinculo_id', e.id, 'concepto', k.codigo, 'saldo', v_saldo, 'real', v_real, 'ajuste', v_dif);
    end loop;
  end loop;

  if jsonb_array_length(v_lineas) > 0 then
    insert into public.journal_entries (organization_id, branch_id, entry_date, memo, source, source_id, posted, fact_key)
    values (p_org, v_sede, v_fecha, 'Ajuste anual de provisiones de nómina ' || p_anio, 'hr_payroll_year_adjustments',
            p_org || ':' || p_anio, true, 'payroll_year_adjustment:' || p_org || ':' || p_anio)
    returning id into v_entry;
    for l in select x->>'cuenta' as cuenta, (x->>'debito')::numeric as debito, (x->>'credito')::numeric as credito,
                    x->>'nit' as nit, x->>'nombre' as nombre, nullif(x->>'cc', '')::uuid as cc, x->>'detalle' as detalle
               from jsonb_array_elements(v_lineas) x loop
      insert into public.journal_lines (journal_entry_id, organization_id, account_code, description, debit, credit, cost_center_id, tercero_nit, tercero_nombre)
      values (v_entry, p_org, l.cuenta, l.detalle, l.debito, l.credito, l.cc, l.nit, l.nombre);
    end loop;
  end if;
  insert into public.hr_payroll_year_adjustments (organization_id, anio, journal_entry_id, detalle, created_by)
  values (p_org, p_anio, v_entry, v_detalle, p_actor);
  return jsonb_build_object('anio', p_anio, 'asiento', v_entry, 'ajustes', v_detalle);
end;
$$;
revoke execute on function public.fn_hr_nomina_ajuste_anual_provisiones(uuid, integer, integer, jsonb) from public, anon, authenticated;

delete from public.hr_payroll_concepts
 where organization_id is null and code = 'RECUPERACION_PROVISIONES';

alter table public.hr_payroll_year_adjustments drop column if exists soporte_vacaciones;
alter table public.hr_payroll_year_adjustments drop column if exists criterio;
alter table public.hr_payroll_year_adjustments drop column if exists fecha_asiento;
