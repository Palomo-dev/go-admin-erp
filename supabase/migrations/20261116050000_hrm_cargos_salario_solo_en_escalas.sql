-- RR. HH.: el salario de un cargo vive SOLO en hr_position_salary_scales (protegida:
-- se lee por RPC con permiso y registro de accesos). job_positions.min_salary/max_salary
-- los podía leer cualquier miembro por RLS. Los 840 valores ya se copiaron idénticos a
-- las escalas en hrm_f1_02_estructura (verificado: 0 cargos sin escala, 0 diferencias).
-- 1) Trigger: si alguien (p. ej. fn_create_default_org_structure al crear una organización)
--    escribe min_salary/max_salary, se pasan a una escala «todas las sedes» vigente desde
--    hoy (en la zona de la organización) y las columnas quedan en NULL.
-- 2) Se vacían las columnas en las filas existentes.
-- Reversión: supabase/rollbacks/20261116050000_hrm_cargos_salario_solo_en_escalas_rollback.sql

create or replace function public.fn_hr_cargo_salario_a_escala()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_min numeric := new.min_salary;
  v_max numeric := new.max_salary;
  v_dia date;
begin
  if v_min is null and v_max is null then
    return null;
  end if;
  -- Día de hoy en la zona de la organización. Nunca bloquea: al crear una organización
  -- (fn_create_default_org_structure) puede no existir aún el miembro que pide fn_timezone_for.
  begin
    v_dia := public.fn_today_for_org(new.organization_id);
  exception when others then
    v_dia := current_date;
  end;
  v_min := coalesce(v_min, v_max);
  v_max := coalesce(v_max, v_min);
  if v_min > 0 and v_min <= v_max
     and not exists (select 1 from public.hr_position_salary_scales s
                      where s.position_id = new.id and s.branch_id is null and s.effective_to is null) then
    insert into public.hr_position_salary_scales
      (organization_id, position_id, branch_id, min_amount, mid_amount, max_amount, effective_from, reason)
    values
      (new.organization_id, new.id, null, v_min, round((v_min + v_max) / 2, 2), v_max,
       v_dia, 'Escala inicial del cargo');
  end if;
  update public.job_positions set min_salary = null, max_salary = null where id = new.id;
  return null;
end;
$$;

revoke execute on function public.fn_hr_cargo_salario_a_escala() from public, anon, authenticated;

drop trigger if exists trg_hr_cargo_salario_a_escala on public.job_positions;
create trigger trg_hr_cargo_salario_a_escala
  after insert or update of min_salary, max_salary on public.job_positions
  for each row
  when (new.min_salary is not null or new.max_salary is not null)
  execute function public.fn_hr_cargo_salario_a_escala();

update public.job_positions set min_salary = null, max_salary = null
 where min_salary is not null or max_salary is not null;

comment on column public.job_positions.min_salary is 'Obsoleta: siempre NULL. El salario del cargo vive en hr_position_salary_scales (trigger trg_hr_cargo_salario_a_escala).';
comment on column public.job_positions.max_salary is 'Obsoleta: siempre NULL. El salario del cargo vive en hr_position_salary_scales (trigger trg_hr_cargo_salario_a_escala).';
