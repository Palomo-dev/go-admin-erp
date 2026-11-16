-- Reversión de 20261116140433_hrm_f3_04_nomina_comisiones: la función vuelve a leer solo metadata.commission_ids
-- (las colillas del motor dejan de marcar sus comisiones pagadas) y authenticated recupera EXECUTE sobre
-- fn_hr_nomina_habilitada. No revierte datos.

create or replace function public.fn_comisiones_pagar_por_nomina(p_slip_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_org integer;
  v_estado text;
  v_ids jsonb;
  v_empleado uuid;
  v_n integer := 0;
begin
  if auth.uid() is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  select pp.organization_id, s.status, s.metadata->'commission_ids', om.user_id
    into v_org, v_estado, v_ids, v_empleado
    from public.payroll_slips s
    join public.payroll_runs r on r.id = s.payroll_run_id
    join public.payroll_periods pp on pp.id = r.payroll_period_id
    left join public.employments e on e.id = s.employment_id
    left join public.organization_members om on om.id = e.organization_member_id
   where s.id = p_slip_id;
  if not found then
    raise exception 'colilla_no_encontrada' using errcode = 'P0002';
  end if;
  if not public.fn_comisiones_es_gestor(v_org) then
    perform public.fn_finanzas_exigir_permiso(v_org, array['hr.payroll.process', 'finance.approve']);
  end if;
  if v_estado is distinct from 'paid' then
    raise exception 'colilla_no_pagada' using errcode = '22023';
  end if;
  if v_ids is null or jsonb_typeof(v_ids) <> 'array' or v_empleado is null then
    return 0;
  end if;

  -- payroll_slip_id va en la misma escritura: fn_auto_journal_commission no
  -- asienta el pago de una comisión pagada por nómina (lo asienta la nómina).
  update public.commissions c
     set status = 'paid',
         paid_at = now(),
         updated_at = now(),
         metadata = coalesce(c.metadata, '{}'::jsonb) || jsonb_build_object('payroll_slip_id', p_slip_id)
   where c.organization_id = v_org
     and c.status = 'accrued'
     and c.payee_id = v_empleado
     and c.id::text in (select jsonb_array_elements_text(v_ids));
  get diagnostics v_n = row_count;
  return v_n;
end;
$function$;

grant execute on function public.fn_hr_nomina_habilitada(integer) to authenticated;
