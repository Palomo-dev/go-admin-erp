-- Reversión de 20261116050000_hrm_cargos_salario_solo_en_escalas.
-- Quita el trigger y devuelve a job_positions los valores de la escala «todas las sedes»
-- más antigua de cada cargo (la que copió hrm_f1_02_estructura).
drop trigger if exists trg_hr_cargo_salario_a_escala on public.job_positions;
drop function if exists public.fn_hr_cargo_salario_a_escala();

update public.job_positions jp
   set min_salary = s.min_amount, max_salary = s.max_amount
  from (select distinct on (position_id) position_id, min_amount, max_amount
          from public.hr_position_salary_scales
         where branch_id is null
         order by position_id, effective_from, created_at) s
 where s.position_id = jp.id;

comment on column public.job_positions.min_salary is null;
comment on column public.job_positions.max_salary is null;
