-- Nómina (fase 3): ronda 3 del Contador (2026-11-16). La nómina sigue apagada.
--
-- 1. fsp_tabla de 2026 (Ley 797, art. 8; Decreto 3771 de 2007, art. 6): los 17, 18, 19 y 20
--    SMMLV exactos van al tramo de abajo («de 16 hasta 17 inclusive, más de 17 hasta 18…»),
--    y cada tramo lleva la subcuenta de solidaridad (0,5 % del IBC) para que el motor
--    redondee por separado los campos 51 (solidaridad) y 52 (subsistencia) de la PILA
--    (Resolución 2388 de 2016, Anexo Técnico 2).
-- 2. fn_hr_nomina_variables_vacaciones: la bonificación salarial habitual entra al promedio
--    de las vacaciones (CST 192, 127 y 128).

update public.hr_legal_parameters
   set value_json = '[{"tarifa": 0.01, "desde_smmlv": 4, "hasta_smmlv": 16, "solidaridad": 0.005}, {"tarifa": 0.012, "desde_smmlv": 16, "hasta_smmlv": 17, "hasta_incluido": true, "solidaridad": 0.005}, {"tarifa": 0.014, "desde_smmlv": 17, "hasta_smmlv": 18, "hasta_incluido": true, "solidaridad": 0.005}, {"tarifa": 0.016, "desde_smmlv": 18, "hasta_smmlv": 19, "hasta_incluido": true, "solidaridad": 0.005}, {"tarifa": 0.018, "desde_smmlv": 19, "hasta_smmlv": 20, "hasta_incluido": true, "solidaridad": 0.005}, {"tarifa": 0.02, "desde_smmlv": 20, "hasta_smmlv": null, "solidaridad": 0.005}]'::jsonb,
       legal_source = 'Ley 100 de 1993, art. 27 (Ley 797 de 2003, art. 8); Decreto 3771 de 2007, art. 6; Resolución 2388 de 2016, Anexo Técnico 2, campos 51 y 52',
       notes = 'Ronda 3 del Contador (2026-11-16): 17, 18, 19 y 20 SMMLV exactos al tramo de abajo; solidaridad 0,5 % y subsistencia el resto, cada una redondeada aparte.'
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
     and i.code in ('RECARGO_NOCTURNO', 'COMISIONES', 'RETROACTIVO', 'SALARIO_HORAS', 'BONIFICACION_SALARIAL');
$$;
revoke execute on function public.fn_hr_nomina_variables_vacaciones(uuid, date, date) from public, anon, authenticated;
