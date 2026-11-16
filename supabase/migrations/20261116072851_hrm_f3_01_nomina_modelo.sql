-- RR. HH., fase 3 (nómina): modelo. ADR-003 §1 y §2.
-- Aditiva: tablas nuevas, columnas NULL-ables o con DEFAULT, permisos y parámetros.
-- Reversión: supabase/rollbacks/20261116100000_hrm_f3_01_nomina_modelo_rollback.sql

-- 1. Permisos -------------------------------------------------------------------------
insert into public.permissions (code, name, description, module, category)
values
  ('hr.payroll.close', 'Cerrar nómina', 'Cierra un período de nómina revisado. Con la nómina apagada solo se preliquida.', 'hr', 'hr'),
  ('hr.payroll.pay', 'Pagar nómina', 'Registra el pago de la nómina en Tesorería y genera el archivo para el banco.', 'hr', 'hr')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_id, allowed)
select r.role_id, p.id, true
  from public.permissions p
  cross join (values (1), (2)) r(role_id)
 where p.code in ('hr.payroll.close', 'hr.payroll.pay')
   and not exists (select 1 from public.role_permissions rp where rp.role_id = r.role_id and rp.permission_id = p.id);

-- 2. Parámetros nuevos ----------------------------------------------------------------
insert into public.hr_parameter_catalog (code, name, description, unit, org_override, research_ref) values
  ('ibc_no_salarial_tope_pct', 'Tope de pagos no salariales fuera del IBC',
   'Los pagos no salariales que pasen de esta fracción de la remuneración total entran al IBC.', 'fraccion', 'no', '§2.1 · Ley 1393 de 2010, art. 30'),
  ('retencion_redondeo_cop', 'Redondeo de la retención en la fuente',
   'La retención se aproxima al múltiplo más cercano de este valor.', 'cop', 'no', '§4'),
  ('cesantias_exenta_tabla', 'Cesantías e intereses exentos',
   'Fracción exenta de cesantías e intereses según el salario promedio mensual en UVT.', 'tabla', 'no', '§4 · ET art. 206 num. 4'),
  ('nomina_alerta_variacion_pct', 'Alerta de variación de la nómina',
   'Avisa cuando el neto o el devengado de un empleado cambia más que esta fracción frente al período anterior.', 'fraccion', 'libre', 'ADR-003 §4')
on conflict (code) do nothing;

insert into public.hr_legal_parameters
  (country_code, code, value, value_json, effective_from, effective_to, status, verificacion, legal_source, source_url, notes)
select v.* from (values
  ('COL', 'ibc_no_salarial_tope_pct', 0.40::numeric, null::jsonb, '2026-01-01'::date, null::date, 'vigente', 'V',
   'Ley 1393 de 2010, art. 30', 'http://www.secretariasenado.gov.co/senado/basedoc/ley_1393_2010.html',
   '[ADR-003] El auxilio de transporte, las vacaciones y las prestaciones no cuentan para el 40 % (criterio UGPP; por confirmar con el Contador).'),
  ('COL', 'retencion_redondeo_cop', 1000::numeric, null::jsonb, '2026-01-01'::date, null::date, 'vigente', 'S',
   'Práctica de aproximación de valores a múltiplos de mil (ET art. 868-1)', null,
   '[ADR-003] Pendiente de confirmar por el Contador: si se redondea la retención o solo la declaración.'),
  ('COL', 'cesantias_exenta_tabla', null::numeric,
   '[{"hasta_uvt":350,"exento":1},{"hasta_uvt":410,"exento":0.9},{"hasta_uvt":470,"exento":0.8},{"hasta_uvt":530,"exento":0.6},{"hasta_uvt":590,"exento":0.4},{"hasta_uvt":650,"exento":0.2},{"hasta_uvt":null,"exento":0}]'::jsonb,
   '2026-01-01'::date, null::date, 'vigente', 'S',
   'Estatuto Tributario, art. 206 num. 4', 'http://www.secretariasenado.gov.co/senado/basedoc/estatuto_tributario_pr008.html',
   '[ADR-003] Salario mensual promedio de los últimos 6 meses, en UVT del año.'),
  ('COL', 'nomina_alerta_variacion_pct', 0.10::numeric, null::jsonb, '2026-01-01'::date, null::date, 'vigente', 'V',
   'Valor por defecto de la plataforma (no es norma)', null,
   '[ADR-003] Cada empresa lo cambia en «Lo que define tu empresa».')
) as v
where not exists (select 1 from public.hr_legal_parameters x where x.country_code = v.column1 and x.code = v.column2 and x.effective_from = v.column5);

-- 3. Bandera de activación por organización (apagada por defecto) ---------------------
create table if not exists public.hr_payroll_settings (
  organization_id     integer primary key references public.organizations(id) on delete cascade,
  hr_payroll_enabled  boolean not null default false,
  enabled_at          timestamptz,
  enabled_by          uuid,
  reason              text,
  updated_at          timestamptz not null default now()
);
comment on table public.hr_payroll_settings is
  'Nómina por organización. hr_payroll_enabled = false: solo se preliquida; no se cierra ni se paga. Se enciende después de la ronda del Contador, solo con la service role (fn_hr_nomina_habilitar).';
alter table public.hr_payroll_settings enable row level security;
revoke all on public.hr_payroll_settings from anon;
revoke insert, update, delete, truncate on public.hr_payroll_settings from authenticated;
drop policy if exists hr_payroll_settings_select on public.hr_payroll_settings;
create policy hr_payroll_settings_select on public.hr_payroll_settings
  for select to authenticated
  using (organization_id in (select public.fn_hr_orgs_con_permiso('hr.payroll.view')));

create or replace function public.fn_hr_nomina_habilitada(p_org integer)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$ select coalesce((select s.hr_payroll_enabled from public.hr_payroll_settings s where s.organization_id = p_org), false) $$;
revoke execute on function public.fn_hr_nomina_habilitada(integer) from public, anon;

-- Solo la plataforma la enciende o la apaga (después de la ronda del Contador).
create or replace function public.fn_hr_nomina_habilitar(p_org integer, p_encendida boolean, p_motivo text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then
    raise exception 'motivo_obligatorio' using errcode = '22023';
  end if;
  insert into public.hr_payroll_settings (organization_id, hr_payroll_enabled, enabled_at, reason, updated_at)
  values (p_org, p_encendida, case when p_encendida then now() end, p_motivo, now())
  on conflict (organization_id) do update
    set hr_payroll_enabled = excluded.hr_payroll_enabled,
        enabled_at = case when excluded.hr_payroll_enabled then now() else public.hr_payroll_settings.enabled_at end,
        reason = excluded.reason, updated_at = now();
  return jsonb_build_object('organization_id', p_org, 'hr_payroll_enabled', p_encendida);
end;
$$;
revoke execute on function public.fn_hr_nomina_habilitar(integer, boolean, text) from public, anon, authenticated;

-- 4. Catálogo de conceptos (plataforma + organización) --------------------------------
create table if not exists public.hr_payroll_concepts (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    integer references public.organizations(id) on delete cascade,
  code               text not null check (code ~ '^[A-Z][A-Z0-9_]{2,40}$'),
  name               text not null,
  kind               text not null check (kind in ('devengado','deduccion','aporte_empleador','provision','informativo')),
  is_salarial        boolean not null default false,
  base_ss            boolean not null default false,
  cuenta_40          boolean not null default false,
  is_prestacional    boolean not null default false,
  base_retencion     boolean not null default false,
  base_parafiscales  boolean not null default false,
  debit_account      text,
  credit_account     text,
  dian_code          text,
  is_system          boolean not null default false,
  is_active          boolean not null default true,
  created_by         uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create unique index if not exists hr_payroll_concepts_org_code_uq
  on public.hr_payroll_concepts (organization_id, code) nulls not distinct;
comment on table public.hr_payroll_concepts is
  'Conceptos de nómina. organization_id NULL = plataforma. Una fila de la organización con el código de un concepto de sistema solo cambia las cuentas contables (trg_hr_payroll_concepts_validar).';

-- Semilla de la plataforma: copia exacta de src/lib/hrm/nomina/conceptos.ts (una prueba las compara).
insert into public.hr_payroll_concepts
  (organization_id, code, name, kind, is_salarial, base_ss, cuenta_40, is_prestacional, base_retencion, base_parafiscales, debit_account, credit_account, dian_code, is_system)
select null, v.* , true from (values
  ('SALARIO', 'Salario', 'devengado', true, true, false, true, true, true, '5105', null, 'Basico'),
  ('SALARIO_INTEGRAL', 'Salario integral', 'devengado', true, true, false, false, true, true, '5105', null, 'Basico'),
  ('SALARIO_HORAS', 'Horas ordinarias (salario por hora)', 'devengado', true, true, false, true, true, true, '5105', null, 'Basico'),
  ('DESCUENTO_TIEMPO', 'Tiempo no trabajado sin justificar', 'devengado', true, true, false, true, true, true, '5105', null, 'Basico'),
  ('RECARGO_NOCTURNO', 'Recargo nocturno', 'devengado', true, true, false, true, true, true, '5105', null, 'HRN'),
  ('RECARGO_DOMINICAL', 'Recargo dominical o festivo', 'devengado', true, true, false, true, true, true, '5105', null, 'HRDDF'),
  ('RECARGO_DOMINICAL_NOCTURNO', 'Recargo dominical o festivo nocturno', 'devengado', true, true, false, true, true, true, '5105', null, 'HRNDF'),
  ('HORA_EXTRA_DIURNA', 'Hora extra diurna', 'devengado', true, true, false, true, true, true, '5105', null, 'HED'),
  ('HORA_EXTRA_NOCTURNA', 'Hora extra nocturna', 'devengado', true, true, false, true, true, true, '5105', null, 'HEN'),
  ('HORA_EXTRA_DOMINICAL_DIURNA', 'Hora extra dominical o festiva diurna', 'devengado', true, true, false, true, true, true, '5105', null, 'HEDDF'),
  ('HORA_EXTRA_DOMINICAL_NOCTURNA', 'Hora extra dominical o festiva nocturna', 'devengado', true, true, false, true, true, true, '5105', null, 'HENDF'),
  ('AUXILIO_TRANSPORTE', 'Auxilio de transporte', 'devengado', false, false, false, true, true, false, '5105', null, 'AuxilioTransporte'),
  ('COMISIONES', 'Comisiones', 'devengado', true, true, false, true, true, true, '5105', null, 'Comision'),
  ('BONIFICACION_SALARIAL', 'Bonificación salarial', 'devengado', true, true, false, true, true, true, '5105', null, 'BonificacionS'),
  ('BONIFICACION_NO_SALARIAL', 'Bonificación no salarial', 'devengado', false, false, true, false, true, false, '5105', null, 'BonificacionNS'),
  ('AUXILIO_NO_SALARIAL', 'Auxilio no salarial', 'devengado', false, false, true, false, true, false, '5105', null, 'AuxilioNS'),
  ('RETROACTIVO', 'Retroactivo salarial', 'devengado', true, true, false, true, true, true, '5105', null, 'Reintegro'),
  ('VACACIONES_DISFRUTADAS', 'Vacaciones disfrutadas', 'devengado', true, true, false, false, true, true, '2525', null, 'VacacionesComunes'),
  ('VACACIONES_COMPENSADAS', 'Vacaciones compensadas en dinero', 'devengado', false, false, false, false, true, true, '2525', null, 'VacacionesCompensadas'),
  ('INCAPACIDAD_COMUN', 'Incapacidad de origen común', 'devengado', false, true, false, false, true, false, '5105', null, 'Incapacidad'),
  ('INCAPACIDAD_LABORAL', 'Incapacidad de origen laboral', 'devengado', false, true, false, false, true, false, '5105', null, 'Incapacidad'),
  ('LICENCIA_MATERNIDAD', 'Licencia de maternidad', 'devengado', false, true, false, false, true, false, '5105', null, 'LicenciaMP'),
  ('LICENCIA_PATERNIDAD', 'Licencia de paternidad', 'devengado', false, true, false, false, true, false, '5105', null, 'LicenciaMP'),
  ('LICENCIA_REMUNERADA', 'Licencia remunerada', 'devengado', true, true, false, true, true, true, '5105', null, 'LicenciaR'),
  ('PRIMA_SERVICIOS', 'Prima de servicios', 'devengado', false, false, false, false, true, false, '2520', null, 'Primas'),
  ('INTERESES_CESANTIAS', 'Intereses sobre cesantías', 'devengado', false, false, false, false, true, false, '2515', null, 'Cesantias'),
  ('SALUD_EMPLEADO', 'Salud (trabajador)', 'deduccion', false, false, false, false, false, false, null, '2370', 'Salud'),
  ('PENSION_EMPLEADO', 'Pensión (trabajador)', 'deduccion', false, false, false, false, false, false, null, '2370', 'FondoPension'),
  ('FONDO_SOLIDARIDAD', 'Fondo de solidaridad pensional', 'deduccion', false, false, false, false, false, false, null, '2370', 'FondoSP'),
  ('RETENCION_FUENTE', 'Retención en la fuente', 'deduccion', false, false, false, false, false, false, null, '23650501', 'RetencionFuente'),
  ('EMBARGO_ALIMENTOS', 'Embargo por alimentos', 'deduccion', false, false, false, false, false, false, null, '2380', 'EmbargoFiscal'),
  ('EMBARGO_COOPERATIVA', 'Embargo de cooperativa', 'deduccion', false, false, false, false, false, false, null, '2380', 'EmbargoFiscal'),
  ('EMBARGO_ORDINARIO', 'Embargo ordinario', 'deduccion', false, false, false, false, false, false, null, '2380', 'EmbargoFiscal'),
  ('PRESTAMO', 'Préstamo a empleado', 'deduccion', false, false, false, false, false, false, null, '1365', 'Deuda'),
  ('LIBRANZA', 'Libranza', 'deduccion', false, false, false, false, false, false, null, '2380', 'Libranza'),
  ('OTRO_DESCUENTO', 'Otro descuento autorizado', 'deduccion', false, false, false, false, false, false, null, '2380', 'OtraDeduccion'),
  ('SALUD_EMPLEADOR', 'Salud (empleador)', 'aporte_empleador', false, false, false, false, false, false, '5105', '2370', null),
  ('PENSION_EMPLEADOR', 'Pensión (empleador)', 'aporte_empleador', false, false, false, false, false, false, '5105', '2370', null),
  ('ARL', 'Riesgos laborales (ARL)', 'aporte_empleador', false, false, false, false, false, false, '5105', '2370', null),
  ('CAJA_COMPENSACION', 'Caja de compensación', 'aporte_empleador', false, false, false, false, false, false, '5105', '2370', null),
  ('ICBF', 'ICBF', 'aporte_empleador', false, false, false, false, false, false, '5105', '2370', null),
  ('SENA', 'SENA', 'aporte_empleador', false, false, false, false, false, false, '5105', '2370', null),
  ('PROVISION_CESANTIAS', 'Provisión de cesantías', 'provision', false, false, false, false, false, false, '5105', '2510', null),
  ('PROVISION_INTERESES', 'Provisión de intereses sobre cesantías', 'provision', false, false, false, false, false, false, '5105', '2515', null),
  ('PROVISION_PRIMA', 'Provisión de prima de servicios', 'provision', false, false, false, false, false, false, '5105', '2520', null),
  ('PROVISION_VACACIONES', 'Provisión de vacaciones', 'provision', false, false, false, false, false, false, '5105', '2525', null),
  ('CESANTIAS_CONSIGNAR', 'Cesantías por consignar al fondo', 'informativo', false, false, false, false, false, false, '2510', '2380', 'Cesantias')
) as v(code, name, kind, is_salarial, base_ss, cuenta_40, is_prestacional, base_retencion, base_parafiscales, debit_account, credit_account, dian_code)
on conflict (organization_id, code) do nothing;

-- Una organización no cambia la naturaleza de un concepto de sistema: solo sus cuentas.
create or replace function public.fn_hr_payroll_concepts_validar()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  b public.hr_payroll_concepts;
begin
  -- Las filas de plataforma solo las escribe una migración (la RLS no deja a authenticated).
  if new.organization_id is null then
    return new;
  end if;
  select * into b from public.hr_payroll_concepts where organization_id is null and code = new.code;
  if found then
    if (new.kind, new.is_salarial, new.base_ss, new.cuenta_40, new.is_prestacional, new.base_retencion, new.base_parafiscales)
       is distinct from (b.kind, b.is_salarial, b.base_ss, b.cuenta_40, b.is_prestacional, b.base_retencion, b.base_parafiscales) then
      raise exception 'concepto_de_sistema: la empresa solo cambia las cuentas contables de %', new.code using errcode = '22023';
    end if;
    new.is_system := true;
  else
    new.is_system := false;
    if new.is_salarial and new.cuenta_40 then
      raise exception 'concepto_invalido: un pago salarial no cuenta en la regla del 40 %%' using errcode = '22023';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function public.fn_hr_payroll_concepts_validar() from public, anon, authenticated;
drop trigger if exists trg_hr_payroll_concepts_validar on public.hr_payroll_concepts;
create trigger trg_hr_payroll_concepts_validar before insert or update on public.hr_payroll_concepts
  for each row execute function public.fn_hr_payroll_concepts_validar();

alter table public.hr_payroll_concepts enable row level security;
revoke all on public.hr_payroll_concepts from anon;
revoke delete, truncate on public.hr_payroll_concepts from authenticated;
drop policy if exists hr_payroll_concepts_select on public.hr_payroll_concepts;
create policy hr_payroll_concepts_select on public.hr_payroll_concepts
  for select to authenticated
  using (organization_id is null or organization_id in (select public.fn_hr_orgs_con_permiso('hr.payroll.view')));
drop policy if exists hr_payroll_concepts_insert on public.hr_payroll_concepts;
create policy hr_payroll_concepts_insert on public.hr_payroll_concepts
  for insert to authenticated
  with check (organization_id in (select public.fn_hr_orgs_con_permiso('hr.payroll.process')));
drop policy if exists hr_payroll_concepts_update on public.hr_payroll_concepts;
create policy hr_payroll_concepts_update on public.hr_payroll_concepts
  for update to authenticated
  using (organization_id in (select public.fn_hr_orgs_con_permiso('hr.payroll.process')))
  with check (organization_id in (select public.fn_hr_orgs_con_permiso('hr.payroll.process')));

-- Catálogo resuelto para una organización: la fila propia gana a la de plataforma.
create or replace function public.fn_hr_nomina_conceptos(p_org integer)
returns jsonb
language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_object_agg(c.code, jsonb_build_object(
           'codigo', c.code, 'nombre', c.name, 'tipo', c.kind, 'salarial', c.is_salarial, 'base_ss', c.base_ss,
           'cuenta_40', c.cuenta_40, 'prestacional', c.is_prestacional, 'base_retencion', c.base_retencion,
           'base_parafiscales', c.base_parafiscales, 'cuenta_debito', c.debit_account, 'cuenta_credito', c.credit_account,
           'codigo_dian', c.dian_code)), '{}'::jsonb)
    from (select distinct on (x.code) x.*
            from public.hr_payroll_concepts x
           where x.is_active and (x.organization_id = p_org or x.organization_id is null)
           order by x.code, x.organization_id nulls last) c;
$$;
revoke execute on function public.fn_hr_nomina_conceptos(integer) from public, anon, authenticated;

-- 5. Ajustes de nómina por vínculo (grupo salario_pago: sin acceso directo) ------------
create table if not exists public.hr_payroll_employee_settings (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       integer not null references public.organizations(id) on delete cascade,
  employment_id         uuid not null references public.employments(id),
  effective_from        date not null,
  salario_integral      boolean not null default false,
  retencion_procedimiento smallint not null default 1 check (retencion_procedimiento in (1, 2)),
  retencion_porcentaje_fijo numeric check (retencion_porcentaje_fijo is null or (retencion_porcentaje_fijo >= 0 and retencion_porcentaje_fijo < 1)),
  dependientes          boolean not null default false,
  medicina_prepagada    numeric not null default 0 check (medicina_prepagada >= 0),
  intereses_vivienda    numeric not null default 0 check (intereses_vivienda >= 0),
  aportes_voluntarios   numeric not null default 0 check (aportes_voluntarios >= 0),
  reason                text,
  created_by            uuid,
  created_at            timestamptz not null default now(),
  unique (employment_id, effective_from)
);
comment on table public.hr_payroll_employee_settings is
  'Datos de nómina por vínculo con fecha de efecto: salario integral y retención (procedimiento, porcentaje fijo y depuración). Grupo salario_pago: solo por RPC con registro de accesos.';
alter table public.hr_payroll_employee_settings enable row level security;
revoke all on public.hr_payroll_employee_settings from anon, authenticated;

-- 6. Novedades de nómina (bonos, auxilios, descuentos autorizados, vacaciones compensadas…)
create table if not exists public.hr_payroll_novelties (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       integer not null references public.organizations(id) on delete cascade,
  employment_id         uuid not null references public.employments(id),
  period_id             uuid not null references public.payroll_periods(id),
  concept_code          text not null,
  amount                numeric check (amount is null or amount > 0),
  quantity              numeric check (quantity is null or quantity > 0),
  description           text,
  status                text not null default 'pendiente' check (status in ('pendiente','aprobada','rechazada','anulada')),
  approval_instance_id  uuid references public.hr_approval_instances(id),
  requested_by          uuid not null,
  decided_at            timestamptz,
  created_at            timestamptz not null default now(),
  check (amount is not null or quantity is not null)
);
create index if not exists hr_payroll_novelties_periodo_idx on public.hr_payroll_novelties (period_id, status);
alter table public.hr_payroll_novelties enable row level security;
revoke all on public.hr_payroll_novelties from anon;
revoke insert, update, delete, truncate on public.hr_payroll_novelties from authenticated;
drop policy if exists hr_payroll_novelties_select on public.hr_payroll_novelties;
create policy hr_payroll_novelties_select on public.hr_payroll_novelties
  for select to authenticated
  using (organization_id in (select public.fn_hr_orgs_con_permiso('hr.payroll.view')));

-- 7. Embargos (grupo salario_pago: sin acceso directo) ---------------------------------
create table if not exists public.hr_garnishments (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    integer not null references public.organizations(id) on delete cascade,
  employment_id      uuid not null references public.employments(id),
  kind               text not null check (kind in ('alimentos','cooperativa','ordinario')),
  received_on        date not null,
  mode               text not null check (mode in ('fijo','porcentaje')),
  value              numeric not null check (value > 0 and (mode = 'fijo' or value <= 1)),
  total_amount       numeric check (total_amount is null or total_amount > 0),
  applied_total      numeric not null default 0,
  starts_on          date not null,
  ends_on            date,
  court_reference    text,
  beneficiary        text,
  status             text not null default 'activo' check (status in ('activo','suspendido','terminado')),
  created_by         uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
comment on table public.hr_garnishments is
  'Embargos judiciales sobre el salario. Prelación: alimentos, cooperativas, ordinarios por fecha de recibo. Límites en el motor (CST 154-156). Solo por RPC.';
alter table public.hr_garnishments enable row level security;
revoke all on public.hr_garnishments from anon, authenticated;

-- 8. Columnas nuevas de las tablas de nómina ------------------------------------------
alter table public.payroll_periods add column if not exists kind text not null default 'ordinaria';
alter table public.payroll_periods drop constraint if exists payroll_periods_kind_check;
alter table public.payroll_periods add constraint payroll_periods_kind_check check (kind in ('ordinaria','prima','cesantias'));
comment on column public.payroll_periods.kind is 'ordinaria, prima (semestre) o cesantias (año: cesantías al fondo e intereses al trabajador).';
comment on column public.payroll_periods.status is
  'Estados de la fase 3 (ADR-003 §1): open = abierto; calculated = preliquidado; reviewing = en revisión; approved = cerrado; paid = pagado; closed = contabilizado. calculating, paying y cancelled quedan de la versión anterior.';

alter table public.payroll_runs add column if not exists run_type text not null default 'calculo';
alter table public.payroll_runs drop constraint if exists payroll_runs_run_type_check;
alter table public.payroll_runs add constraint payroll_runs_run_type_check check (run_type in ('calculo','ajuste'));
alter table public.payroll_runs add column if not exists engine_version text;
alter table public.payroll_runs add column if not exists input_hash text;
alter table public.payroll_runs add column if not exists parameters_snapshot jsonb;
alter table public.payroll_runs add column if not exists alerts jsonb not null default '[]'::jsonb;
alter table public.payroll_runs add column if not exists reason text;
alter table public.payroll_runs add column if not exists adjusts_run_id uuid references public.payroll_runs(id);
comment on column public.payroll_runs.parameters_snapshot is 'Parámetros y conceptos con que se calculó: un período cerrado nunca se recalcula con reglas nuevas.';
create unique index if not exists payroll_runs_idempotencia_uq
  on public.payroll_runs (payroll_period_id, input_hash)
  where run_type = 'calculo' and status = 'completed' and superseded_by is null and input_hash is not null;

alter table public.payroll_slips add column if not exists branch_id integer references public.branches(id);
alter table public.payroll_slips add column if not exists input_hash text;
alter table public.payroll_slips add column if not exists inputs jsonb;
alter table public.payroll_slips add column if not exists alerts jsonb not null default '[]'::jsonb;
comment on column public.payroll_slips.branch_id is 'Sede del empleado al cierre del período: es la sede del asiento (R8).';
comment on column public.payroll_slips.inputs is 'Entrada del motor (sin parámetros, que van en el run): permite el ajuste controlado con las reglas originales.';

create index if not exists payroll_items_slip_code_idx on public.payroll_items (payroll_slip_id, code);
