-- HRM fase 0 · paso 16: «Lo que define tu empresa», clase de riesgo ARL,
-- historial de vigencias y cierre de nómina sin parámetros (diseño 10.RH.1).
-- Decisiones del dueño del 2026-11-15:
-- - Clase ARL: cargo en sede, luego cargo, luego sede y al final el valor por defecto.
-- - Una nómina de 2027 no cierra sin el SMMLV y la UVT de 2027, pero sí permite preliquidar.
-- - Lo marcado [S] en la investigación queda con su valor y su estado.

-- 1. Estado «suspendido» y vigencias que muestra el detalle ----------------------------
alter table public.hr_legal_parameters drop constraint if exists hr_legal_parameters_status_check;
alter table public.hr_legal_parameters add constraint hr_legal_parameters_status_check
  check (status in ('vigente','transitorio','litigio','suspendido','por_confirmar'));

-- SMMLV 2026: rigió el Decreto 1469 de 2025 hasta su suspensión; desde el
-- 19-feb-2026 rige el transitorio 0159 con el mismo valor.
update public.hr_legal_parameters
   set effective_from = '2026-02-19'
 where country_code = 'COL' and code = 'smmlv' and effective_from = '2026-01-01' and status = 'transitorio';
insert into public.hr_legal_parameters
  (country_code, code, value, effective_from, effective_to, status, verificacion, legal_source, source_url, notes)
select 'COL', 'smmlv', 1750905, '2026-01-01', '2026-02-18', 'suspendido', 'S',
       'Decreto 1469 del 29-dic-2025 (suspendido por el Consejo de Estado, auto del 12-feb-2026)',
       'https://ayuda.miplanilla.com/hc/es-419/articles/46278928365204-Suspensi%C3%B3n-provisional-del-decreto-de-salario-m%C3%ADnimo-2026',
       '[ADR-001] Mismo valor que el decreto transitorio que lo reemplazó.'
 where not exists (select 1 from public.hr_legal_parameters where country_code = 'COL' and code = 'smmlv' and effective_from = '2026-01-01');

-- Jornada: escalones anteriores del calendario de la Ley 2101 (V; el divisor es práctica, S).
insert into public.hr_legal_parameters
  (country_code, code, value, effective_from, effective_to, status, verificacion, legal_source, source_url, notes)
select v.* from (values
  ('COL','jornada_max_semanal',47::numeric,'2023-07-15'::date,'2024-07-14'::date,'vigente','V','Ley 2101 de 2021, art. 3','http://www.secretariasenado.gov.co/senado/basedoc/ley_2101_2021.html','[ADR-001]'),
  ('COL','jornada_max_semanal',46,'2024-07-15','2025-07-14','vigente','V','Ley 2101 de 2021, art. 3','http://www.secretariasenado.gov.co/senado/basedoc/ley_2101_2021.html','[ADR-001]'),
  ('COL','divisor_hora_mensual',235,'2023-07-15','2024-07-14','vigente','S','Práctica contable: horas semanales / 6 × 30 (no está en la ley)','https://actualicese.com/liquidacion-de-nomina-con-la-jornada-laboral-de-42-horas/','[ADR-001]'),
  ('COL','divisor_hora_mensual',230,'2024-07-15','2025-07-14','vigente','S','Práctica contable: horas semanales / 6 × 30 (no está en la ley)','https://actualicese.com/liquidacion-de-nomina-con-la-jornada-laboral-de-42-horas/','[ADR-001]')
) v(country_code, code, value, effective_from, effective_to, status, verificacion, legal_source, source_url, notes)
where not exists (select 1 from public.hr_legal_parameters x where x.country_code = v.country_code and x.code = v.code and x.effective_from = v.effective_from);

-- Topes de horas extra: rigen desde la promulgación de la Ley 2466 (25-jun-2025).
update public.hr_legal_parameters set effective_from = '2025-06-25'
 where country_code = 'COL' and code in ('horas_extra_max_dia','horas_extra_max_semana') and effective_from = '2026-01-01';

-- 2. Parámetros nuevos que fija la empresa ----------------------------------------------
insert into public.hr_parameter_catalog (code, name, unit, org_override, research_ref) values
  ('pila_operador', 'Operador PILA donde la empresa carga la planilla', 'texto', 'libre', '§6, §12-D-31'),
  ('retencion_procedimiento', 'Procedimiento de retención por defecto (1 o 2)', 'entero', 'libre', '§4.2, §12-C-23')
on conflict (code) do update set name = excluded.name, unit = excluded.unit, org_override = excluded.org_override, research_ref = excluded.research_ref;

-- Guardar lo que define la empresa: cada cambio rige desde su fecha y cierra el
-- valor anterior un día antes; los valores programados después de esa fecha se
-- reemplazan. `activo = false` deja de aplicar el valor propio desde la fecha.
create or replace function public.fn_hr_parametros_empresa_guardar(p_org integer, p_cambios jsonb)
returns integer
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  c jsonb;
  v_desde date;
  n integer := 0;
begin
  perform public.fn_assert_acceso_org(p_org);
  if not public.fn_hr_puede(p_org, 'hr.parameters.manage') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if jsonb_typeof(p_cambios) <> 'array' then
    raise exception 'hr: se esperaba una lista de cambios' using errcode = '22023';
  end if;
  for c in select * from jsonb_array_elements(p_cambios) loop
    v_desde := coalesce(nullif(c->>'desde', '')::date, public.fn_today_for(p_org, null));
    delete from public.hr_org_parameters
     where organization_id = p_org and code = c->>'code' and effective_from >= v_desde;
    update public.hr_org_parameters set effective_to = v_desde - 1
     where organization_id = p_org and code = c->>'code'
       and effective_from < v_desde and (effective_to is null or effective_to >= v_desde);
    if coalesce((c->>'activo')::boolean, true) then
      insert into public.hr_org_parameters (organization_id, code, value, value_json, effective_from, reason)
      values (p_org, c->>'code', nullif(c->>'valor', '')::numeric, case when c ? 'valor_json' then c->'valor_json' end, v_desde,
              coalesce(nullif(btrim(c->>'motivo'), ''), 'Definido en Configuración › Recursos humanos'));
    end if;
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke execute on function public.fn_hr_parametros_empresa_guardar(integer, jsonb) from public, anon;
grant execute on function public.fn_hr_parametros_empresa_guardar(integer, jsonb) to authenticated;

-- 3. Clase de riesgo ARL por sede o cargo ------------------------------------------------
create table if not exists public.hr_arl_assignments (
  id              uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  branch_id       integer references public.branches(id) on delete cascade,
  position_id     uuid references public.job_positions(id) on delete cascade,
  risk_class      smallint not null check (risk_class between 1 and 5),
  created_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index if not exists hr_arl_assignments_uq
  on public.hr_arl_assignments (organization_id, coalesce(branch_id, 0), coalesce(position_id, '00000000-0000-0000-0000-000000000000'::uuid));
comment on table public.hr_arl_assignments is
  'HRM: clase de riesgo ARL por sede y/o cargo. Gana la más específica: cargo en sede › cargo › sede › por defecto (ambos NULL).';

create or replace function public.fn_hr_arl_validar()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if new.branch_id is not null and not exists (select 1 from public.branches b where b.id = new.branch_id and b.organization_id = new.organization_id) then
    raise exception 'hr: la sede es de otra organización' using errcode = '42501';
  end if;
  if new.position_id is not null and not exists (select 1 from public.job_positions j where j.id = new.position_id and j.organization_id = new.organization_id) then
    raise exception 'hr: el cargo es de otra organización' using errcode = '42501';
  end if;
  new.updated_at := now();
  if tg_op = 'INSERT' then new.created_by := coalesce(auth.uid(), new.created_by); end if;
  return new;
end;
$$;
revoke execute on function public.fn_hr_arl_validar() from public, anon, authenticated;
drop trigger if exists trg_hr_arl_assignments_validar on public.hr_arl_assignments;
create trigger trg_hr_arl_assignments_validar before insert or update on public.hr_arl_assignments
  for each row execute function public.fn_hr_arl_validar();

alter table public.hr_arl_assignments enable row level security;
revoke all on public.hr_arl_assignments from anon, public;
grant select, insert, update, delete on public.hr_arl_assignments to authenticated;
drop policy if exists hr_arl_assignments_select on public.hr_arl_assignments;
create policy hr_arl_assignments_select on public.hr_arl_assignments for select to authenticated
  using (organization_id in (select om.organization_id from public.organization_members om
                              where om.user_id = (select auth.uid()) and om.is_active));
drop policy if exists hr_arl_assignments_write on public.hr_arl_assignments;
create policy hr_arl_assignments_write on public.hr_arl_assignments for all to authenticated
  using (organization_id in (select public.fn_hr_orgs_con_permiso('hr.parameters.manage')))
  with check (organization_id in (select public.fn_hr_orgs_con_permiso('hr.parameters.manage')));

-- Clase que aplica a un vínculo: cargo en sede › cargo › sede › por defecto › I.
create or replace function public.fn_hr_clase_arl(p_employment uuid)
returns smallint
language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select a.risk_class from public.employments e join public.hr_arl_assignments a
        on a.organization_id = e.organization_id and a.branch_id = e.branch_id and a.position_id = e.position_id
      where e.id = p_employment),
    (select a.risk_class from public.employments e join public.hr_arl_assignments a
        on a.organization_id = e.organization_id and a.branch_id is null and a.position_id = e.position_id
      where e.id = p_employment),
    (select a.risk_class from public.employments e join public.hr_arl_assignments a
        on a.organization_id = e.organization_id and a.branch_id = e.branch_id and a.position_id is null
      where e.id = p_employment),
    (select a.risk_class from public.employments e join public.hr_arl_assignments a
        on a.organization_id = e.organization_id and a.branch_id is null and a.position_id is null
      where e.id = p_employment),
    1::smallint);
$$;
revoke execute on function public.fn_hr_clase_arl(uuid) from public, anon, authenticated;
grant execute on function public.fn_hr_clase_arl(uuid) to service_role;

-- 4. Cerrar una nómina exige SMMLV y UVT confirmados en su fecha (preliquidar sí) --------
create or replace function public.fn_hr_parametros_para_cierre(p_org integer, p_fecha date)
returns text[]
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_falta text[] := '{}';
  c text;
  d jsonb;
begin
  foreach c in array array['smmlv','uvt'] loop
    d := public.fn_hr_parametro_detalle(p_org, c, p_fecha);
    if d is null or d->>'status' = 'por_confirmar' then
      v_falta := v_falta || c;
    end if;
  end loop;
  return v_falta;
end;
$$;
revoke execute on function public.fn_hr_parametros_para_cierre(integer, date) from public, anon;
grant execute on function public.fn_hr_parametros_para_cierre(integer, date) to authenticated, service_role;

create or replace function public.fn_hr_nomina_bloquear_cierre_sin_parametros()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_falta text[];
begin
  if new.status in ('approved','paying','paid','closed') and new.status is distinct from old.status then
    v_falta := public.fn_hr_parametros_para_cierre(new.organization_id, new.period_end);
    if cardinality(v_falta) > 0 then
      raise exception 'parametros_pendientes: la nómina de % no cierra sin %; puedes preliquidarla', to_char(new.period_end, 'YYYY'), array_to_string(v_falta, ' y ')
        using errcode = '55000';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.fn_hr_nomina_bloquear_cierre_sin_parametros() from public, anon, authenticated;
drop trigger if exists trg_payroll_periods_parametros_cierre on public.payroll_periods;
create trigger trg_payroll_periods_parametros_cierre before update of status on public.payroll_periods
  for each row execute function public.fn_hr_nomina_bloquear_cierre_sin_parametros();
