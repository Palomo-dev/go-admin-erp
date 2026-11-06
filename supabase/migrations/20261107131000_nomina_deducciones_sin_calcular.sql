-- Nómina: una deducción sin calcular no es un cero (hallazgo 9 de la auditoría del Contador).
--
-- payrollCalculationService grababa tax_withholding = 0 y loan_deductions = 0 con un TODO:
-- un cálculo que no existe se veía como «sin retención». payroll_slips y payroll_periods
-- estaban vacías al aplicar, así que nada de esto cambia datos.
--
-- Regla nueva:
--  * tax_withholding NULL = retención sin calcular. La regla de cálculo no está verificada:
--    el valor lo escribe una persona. Escribir 0 es decir «no aplica», y queda registrado.
--  * loan_deductions NULL = hay cuota de préstamo en el periodo y nadie la ha confirmado.
--    Sin cuotas el valor es 0 de verdad.
--  * Con alguna de las dos en NULL, la colilla no se aprueba y el periodo no se cierra.
--  * Se escriben solo por fn_nomina_fijar_deduccion, con permiso y rastro.
--
-- Rollback: supabase/rollbacks/20261107131000_nomina_deducciones_sin_calcular_rollback.sql

alter table public.payroll_slips alter column tax_withholding drop default;

comment on column public.payroll_slips.tax_withholding is
  'Retención en la fuente. NULL = sin calcular: bloquea la aprobación. 0 = una persona dijo que no aplica.';
comment on column public.payroll_slips.loan_deductions is
  'Cuotas de préstamo del periodo. NULL = hay cuota sin confirmar: bloquea la aprobación.';

-- La ejecución que manda en un periodo: la final; si no hay, la última.
create or replace function public.fn_nomina_run_vigente(p_period_id uuid)
returns uuid
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  select r.id
    from public.payroll_runs r
   where r.payroll_period_id = p_period_id
   order by coalesce(r.is_final, false) desc, r.run_number desc
   limit 1;
$function$;

revoke all on function public.fn_nomina_run_vigente(uuid) from public, anon;
grant execute on function public.fn_nomina_run_vigente(uuid) to authenticated, service_role;

create or replace function public.fn_trg_nomina_colilla_deducciones()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  if tg_op = 'UPDATE'
     and (new.tax_withholding is distinct from old.tax_withholding
          or new.loan_deductions is distinct from old.loan_deductions)
     and coalesce(current_setting('app.nomina_deduccion', true), '') <> 'on' then
    raise exception 'NOMINA_DEDUCCION_SOLO_POR_RPC: la retención y los préstamos se escriben con fn_nomina_fijar_deduccion'
      using errcode = '42501';
  end if;

  if new.status in ('approved', 'paid')
     and (tg_op = 'INSERT' or new.status is distinct from old.status)
     and (new.tax_withholding is null or new.loan_deductions is null) then
    raise exception 'NOMINA_DEDUCCION_SIN_CALCULAR: la colilla % tiene una deducción sin calcular', new.id
      using errcode = '23514';
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_nomina_colilla_deducciones on public.payroll_slips;
create trigger trg_nomina_colilla_deducciones
  before insert or update on public.payroll_slips
  for each row execute function public.fn_trg_nomina_colilla_deducciones();

create or replace function public.fn_trg_nomina_periodo_bloquear_cierre()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_pendientes integer;
begin
  if new.status in ('approved', 'paying', 'paid', 'closed')
     and new.status is distinct from old.status then
    select count(*) into v_pendientes
      from public.payroll_slips s
     where s.payroll_run_id = public.fn_nomina_run_vigente(new.id)
       and coalesce(s.status, '') <> 'cancelled'
       and (s.tax_withholding is null or s.loan_deductions is null);

    if v_pendientes > 0 then
      raise exception 'NOMINA_CIERRE_BLOQUEADO: % colillas con deducciones sin calcular', v_pendientes
        using errcode = '23514',
              detail = jsonb_build_object('pendientes', v_pendientes)::text;
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_nomina_periodo_bloquear_cierre on public.payroll_periods;
create trigger trg_nomina_periodo_bloquear_cierre
  before update on public.payroll_periods
  for each row execute function public.fn_trg_nomina_periodo_bloquear_cierre();

-- Escribir a mano la retención o la cuota de préstamo de una colilla en borrador.
create or replace function public.fn_nomina_fijar_deduccion(
  p_slip_id uuid,
  p_concepto text,
  p_valor numeric,
  p_nota text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_slip public.payroll_slips%rowtype;
  v_org integer;
  v_period uuid;
  v_estado_periodo text;
  v_valor numeric := round(p_valor, 2);
  v_tax numeric;
  v_loan numeric;
  v_total numeric;
  v_neto numeric;
  v_nota text := nullif(btrim(coalesce(p_nota, '')), '');
begin
  if v_uid is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;
  if p_concepto not in ('retencion', 'prestamo') then
    raise exception 'concepto_invalido' using errcode = '22023';
  end if;
  if v_valor is null or v_valor < 0 then
    raise exception 'valor_invalido' using errcode = '22023';
  end if;

  select pp.organization_id, pp.id, pp.status
    into v_org, v_period, v_estado_periodo
    from public.payroll_slips s
    join public.payroll_runs r on r.id = s.payroll_run_id
    join public.payroll_periods pp on pp.id = r.payroll_period_id
   where s.id = p_slip_id;
  if v_org is null then
    raise exception 'colilla_no_encontrada' using errcode = 'P0002';
  end if;

  perform public.fn_assert_acceso_org(v_org);
  if not public.fn_tiene_permiso(v_org, 'hr.payroll.process') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;

  select * into v_slip from public.payroll_slips where id = p_slip_id for update;
  if coalesce(v_slip.status, 'draft') <> 'draft' then
    raise exception 'colilla_no_editable' using errcode = '22023';
  end if;
  if v_estado_periodo in ('approved', 'paying', 'paid', 'closed', 'cancelled') then
    raise exception 'periodo_no_editable' using errcode = '22023';
  end if;

  v_tax := case when p_concepto = 'retencion' then v_valor else v_slip.tax_withholding end;
  v_loan := case when p_concepto = 'prestamo' then v_valor else v_slip.loan_deductions end;

  v_total := coalesce(v_slip.health_deduction, 0) + coalesce(v_slip.pension_deduction, 0)
           + coalesce(v_slip.solidarity_fund, 0) + coalesce(v_slip.advance_deductions, 0)
           + coalesce(v_slip.other_deductions, 0) + coalesce(v_tax, 0) + coalesce(v_loan, 0);
  v_neto := v_slip.gross_pay - v_total;
  if v_neto < 0 then
    raise exception 'neto_negativo' using errcode = '22023';
  end if;

  perform set_config('app.nomina_deduccion', 'on', true);
  update public.payroll_slips
     set tax_withholding = v_tax,
         loan_deductions = v_loan,
         total_deductions = v_total,
         net_pay = v_neto,
         metadata = jsonb_set(
           jsonb_set(coalesce(metadata, '{}'::jsonb), '{deducciones_manuales}',
                     coalesce(metadata->'deducciones_manuales', '{}'::jsonb), true),
           array['deducciones_manuales', p_concepto],
           jsonb_build_object('valor', v_valor, 'por', v_uid, 'en', now(), 'nota', v_nota),
           true),
         updated_at = now()
   where id = p_slip_id;
  perform set_config('app.nomina_deduccion', '', true);

  if v_slip.payroll_run_id = public.fn_nomina_run_vigente(v_period) then
    update public.payroll_periods pp
       set total_deductions = t.deducciones,
           total_net = t.neto,
           updated_at = now()
      from (
        select coalesce(sum(s.total_deductions), 0) as deducciones, coalesce(sum(s.net_pay), 0) as neto
          from public.payroll_slips s
         where s.payroll_run_id = v_slip.payroll_run_id
           and coalesce(s.status, '') <> 'cancelled'
      ) t
     where pp.id = v_period;
  end if;

  insert into public.finance_audit_log (organization_id, entity, entity_id, action, user_id, diff, reason)
  values (v_org, 'payroll_slips', p_slip_id::text, 'update', v_uid,
          jsonb_build_object('concepto', p_concepto, 'antes',
            case when p_concepto = 'retencion' then v_slip.tax_withholding else v_slip.loan_deductions end,
            'despues', v_valor),
          v_nota);

  return jsonb_build_object(
    'slip_id', p_slip_id,
    'tax_withholding', v_tax,
    'loan_deductions', v_loan,
    'total_deductions', v_total,
    'net_pay', v_neto,
    'pendientes', (
      select count(*) from public.payroll_slips s
       where s.payroll_run_id = v_slip.payroll_run_id
         and coalesce(s.status, '') <> 'cancelled'
         and (s.tax_withholding is null or s.loan_deductions is null)
    )
  );
end;
$function$;

revoke all on function public.fn_nomina_fijar_deduccion(uuid, text, numeric, text) from public, anon;
grant execute on function public.fn_nomina_fijar_deduccion(uuid, text, numeric, text) to authenticated, service_role;
