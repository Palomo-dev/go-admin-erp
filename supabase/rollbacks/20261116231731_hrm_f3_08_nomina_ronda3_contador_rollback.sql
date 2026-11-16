-- Reversión de 20261116231731_hrm_f3_08_nomina_ronda3_contador.sql.

update public.hr_legal_parameters
   set value_json = '[{"tarifa": 0.01, "desde_smmlv": 4, "hasta_smmlv": 16}, {"tarifa": 0.012, "desde_smmlv": 16, "hasta_smmlv": 17}, {"tarifa": 0.014, "desde_smmlv": 17, "hasta_smmlv": 18}, {"tarifa": 0.016, "desde_smmlv": 18, "hasta_smmlv": 19}, {"tarifa": 0.018, "desde_smmlv": 19, "hasta_smmlv": 20}, {"tarifa": 0.02, "desde_smmlv": 20, "hasta_smmlv": null}]'::jsonb,
       legal_source = 'Ley 100 de 1993, art. 27 (Ley 797 de 2003); UGPP 2026',
       notes = '[ADR-001] Rango [desde, hasta). Termina cuando entra la Ley 2381 de 2024 (fecha con riesgo de aplazamiento).'
 where country_code = 'COL' and code = 'fsp_tabla' and effective_from = '2026-01-01';

create or replace function public.fn_hr_nomina_variables_vacaciones(p_employment uuid, p_desde date, p_hasta date)
returns numeric
language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce(sum(i.amount), 0)
    from public.payroll_periods pp
    join public.payroll_slips s on s.payroll_run_id = public.fn_nomina_run_vigente(pp.id) and s.employment_id = p_employment
    join public.payroll_items i on i.payroll_slip_id = s.id
   where pp.organization_id = (select e.organization_id from public.employments e where e.id = p_employment)
     and pp.kind = 'ordinaria'
     and pp.status in ('approved', 'paid', 'closed')
     and pp.period_end between p_desde and p_hasta
     and i.item_type = 'earning'
     and i.code in ('RECARGO_NOCTURNO', 'COMISIONES', 'RETROACTIVO', 'SALARIO_HORAS');
$$;
revoke execute on function public.fn_hr_nomina_variables_vacaciones(uuid, date, date) from public, anon, authenticated;
