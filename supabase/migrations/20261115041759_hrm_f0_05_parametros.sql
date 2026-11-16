-- HRM fase 0 · paso 5: parámetros legales por vigencia (R6, R14). ADR-001 §4.
--
-- - hr_parameter_catalog: qué parámetros existen, su unidad y si la organización
--   puede fijar uno propio (solo lo de la §12-E de la investigación, más B-9,
--   B-11 y C-19, y siempre en el sentido más favorable al trabajador).
-- - hr_legal_parameters: valores de plataforma por país (COL) y vigencia, con
--   estado (vigente/transitorio/litigio/por_confirmar), marca de verificación de
--   la investigación (V/S/NC) y fuente legal.
-- - hr_org_parameters: valores propios de la organización.
-- - fn_hr_parametro(org, code, fecha): organización primero, luego plataforma.
--   Falla con lo que está por confirmar: nunca se calcula con un valor no confirmado.
-- Escala única: fracción (0.04 = 4 %). País canónico: COL (el de organizations,
-- fiscal_uvt y fn_auto_journal_payroll). La UVT sigue en fiscal_uvt (fn_uvt).
-- country_payroll_rules queda como legado de solo lectura (no se modifica).
--
-- Valores cargados: docs/hrm/INVESTIGACION-NORMATIVA-CO-2026-11-14.md §1, §2, §3,
-- §4 y §11, con su norma y URL. Lo [NC] va por_confirmar y sin valor inventado.

-- 1. Catálogo ----------------------------------------------------------------------
create table if not exists public.hr_parameter_catalog (
  code          text primary key check (code ~ '^[a-z][a-z0-9_]{2,60}$'),
  name          text not null,
  description   text,
  unit          text not null check (unit in ('fraccion','cop','smmlv','uvt','horas','hora_del_dia','dias','semanas','entero','tabla','texto','booleano')),
  org_override  text not null default 'no' check (org_override in ('no','libre','no_mayor','no_menor')),
  research_ref  text,
  created_at    timestamptz not null default now()
);
comment on table public.hr_parameter_catalog is
  'HRM: catálogo de parámetros por vigencia (ADR-001 §4). org_override: no | libre | no_mayor (la org solo puede bajarlo) | no_menor (solo subirlo).';

-- 2. Valores de plataforma ------------------------------------------------------------
create table if not exists public.hr_legal_parameters (
  id             uuid primary key default gen_random_uuid(),
  country_code   text not null default 'COL' check (country_code ~ '^[A-Z]{3}$'),
  code           text not null references public.hr_parameter_catalog(code),
  value          numeric,
  value_json     jsonb,
  effective_from date not null,
  effective_to   date,
  status         text not null check (status in ('vigente','transitorio','litigio','por_confirmar')),
  verificacion   text not null check (verificacion in ('V','S','NC')),
  legal_source   text not null,
  source_url     text,
  notes          text,
  created_at     timestamptz not null default now(),
  created_by     uuid,
  constraint hr_legal_parameters_vigencia_chk check (effective_to is null or effective_to >= effective_from),
  constraint hr_legal_parameters_valor_chk check (status = 'por_confirmar' or value is not null or value_json is not null),
  constraint hr_legal_parameters_nc_chk check (verificacion <> 'NC' or status = 'por_confirmar')
);
create index if not exists hr_legal_parameters_busqueda_idx on public.hr_legal_parameters (country_code, code, effective_from desc);

-- 3. Valores propios de la organización ---------------------------------------------
create table if not exists public.hr_org_parameters (
  id              uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  code            text not null references public.hr_parameter_catalog(code),
  value           numeric,
  value_json      jsonb,
  effective_from  date not null,
  effective_to    date,
  reason          text not null check (length(btrim(reason)) >= 3),
  created_by      uuid,
  created_at      timestamptz not null default now(),
  constraint hr_org_parameters_vigencia_chk check (effective_to is null or effective_to >= effective_from),
  constraint hr_org_parameters_valor_chk check (value is not null or value_json is not null)
);
create index if not exists hr_org_parameters_busqueda_idx on public.hr_org_parameters (organization_id, code, effective_from desc);

-- País canónico de una organización.
create or replace function public.fn_hr_pais(p_org integer)
returns text
language sql stable security definer
set search_path = public, pg_temp
as $$
  select case
    when o.country_code is null or upper(o.country_code) in ('CO','COL') then 'COL'
    else upper(o.country_code) end
    from public.organizations o where o.id = p_org;
$$;

-- Sin vigencias solapadas por clave.
create or replace function public.fn_hr_parametros_sin_solape()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_choque boolean;
begin
  if tg_table_name = 'hr_legal_parameters' then
    select exists (select 1 from public.hr_legal_parameters x
                    where x.country_code = new.country_code and x.code = new.code and x.id <> new.id
                      and daterange(x.effective_from, x.effective_to, '[]') && daterange(new.effective_from, new.effective_to, '[]'))
      into v_choque;
  else
    select exists (select 1 from public.hr_org_parameters x
                    where x.organization_id = new.organization_id and x.code = new.code and x.id <> new.id
                      and daterange(x.effective_from, x.effective_to, '[]') && daterange(new.effective_from, new.effective_to, '[]'))
      into v_choque;
  end if;
  if v_choque then
    raise exception 'hr: la vigencia de % se cruza con otra del mismo parámetro', new.code using errcode = '23P01';
  end if;
  return new;
end;
$$;
revoke execute on function public.fn_hr_parametros_sin_solape() from public, anon, authenticated;
drop trigger if exists trg_hr_legal_parameters_sin_solape on public.hr_legal_parameters;
create trigger trg_hr_legal_parameters_sin_solape before insert or update on public.hr_legal_parameters
  for each row execute function public.fn_hr_parametros_sin_solape();
drop trigger if exists trg_hr_org_parameters_sin_solape on public.hr_org_parameters;
create trigger trg_hr_org_parameters_sin_solape before insert or update on public.hr_org_parameters
  for each row execute function public.fn_hr_parametros_sin_solape();

-- La organización solo fija lo que el catálogo permite y en el sentido permitido.
create or replace function public.fn_hr_org_parametro_validar()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_regla text;
  v_plat numeric;
begin
  select c.org_override into v_regla from public.hr_parameter_catalog c where c.code = new.code;
  if v_regla is null or v_regla = 'no' then
    raise exception 'hr: la organización no puede fijar el parámetro %', new.code using errcode = '42501';
  end if;
  if v_regla in ('no_mayor','no_menor') then
    select lp.value into v_plat from public.hr_legal_parameters lp
     where lp.country_code = public.fn_hr_pais(new.organization_id) and lp.code = new.code
       and lp.status <> 'por_confirmar'
       and lp.effective_from <= new.effective_from and (lp.effective_to is null or lp.effective_to >= new.effective_from)
     order by lp.effective_from desc limit 1;
    if v_plat is null or new.value is null then
      raise exception 'hr: % no tiene valor de plataforma confirmado para comparar en %', new.code, new.effective_from using errcode = '22023';
    end if;
    if v_regla = 'no_mayor' and new.value > v_plat then
      raise exception 'hr: % no puede ser mayor que el legal (%)', new.code, v_plat using errcode = '22023';
    end if;
    if v_regla = 'no_menor' and new.value < v_plat then
      raise exception 'hr: % no puede ser menor que el legal (%)', new.code, v_plat using errcode = '22023';
    end if;
  end if;
  if tg_op = 'INSERT' then new.created_by := coalesce(auth.uid(), new.created_by); end if;
  return new;
end;
$$;
revoke execute on function public.fn_hr_org_parametro_validar() from public, anon, authenticated;
drop trigger if exists trg_hr_org_parameters_validar on public.hr_org_parameters;
create trigger trg_hr_org_parameters_validar before insert or update on public.hr_org_parameters
  for each row execute function public.fn_hr_org_parametro_validar();

-- 4. RLS -----------------------------------------------------------------------------
alter table public.hr_parameter_catalog enable row level security;
alter table public.hr_legal_parameters enable row level security;
alter table public.hr_org_parameters enable row level security;
revoke all on public.hr_parameter_catalog, public.hr_legal_parameters, public.hr_org_parameters from anon, public;
revoke insert, update, delete, truncate on public.hr_parameter_catalog, public.hr_legal_parameters from authenticated;
grant select on public.hr_parameter_catalog, public.hr_legal_parameters to authenticated;
grant select, insert, update, delete on public.hr_org_parameters to authenticated;

drop policy if exists hr_parameter_catalog_select on public.hr_parameter_catalog;
create policy hr_parameter_catalog_select on public.hr_parameter_catalog for select to authenticated using (true);
drop policy if exists hr_legal_parameters_select on public.hr_legal_parameters;
create policy hr_legal_parameters_select on public.hr_legal_parameters for select to authenticated using (true);

drop policy if exists hr_org_parameters_select on public.hr_org_parameters;
create policy hr_org_parameters_select on public.hr_org_parameters for select to authenticated
  using (organization_id in (select om.organization_id from public.organization_members om
                              where om.user_id = (select auth.uid()) and om.is_active));
drop policy if exists hr_org_parameters_write on public.hr_org_parameters;
create policy hr_org_parameters_write on public.hr_org_parameters for all to authenticated
  using (organization_id in (select public.fn_hr_orgs_con_permiso('hr.parameters.manage')))
  with check (organization_id in (select public.fn_hr_orgs_con_permiso('hr.parameters.manage')));

comment on table public.country_payroll_rules is
  'LEGADO (ADR-001 §4): solo la leen payrollCalculationService.ts (se reemplaza en la fase 3) y la página reglas-pais. La fuente vigente es hr_legal_parameters (fracción, país COL).';

-- 5. Funciones -------------------------------------------------------------------------
create or replace function public.fn_hr_parametro_detalle(p_org integer, p_code text, p_fecha date)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_pais text;
  r_org public.hr_org_parameters;
  r_pl public.hr_legal_parameters;
  v_uvt numeric;
  v_norma text;
begin
  perform public.fn_assert_acceso_org(p_org);
  if p_fecha is null then
    raise exception 'hr: la fecha es obligatoria' using errcode = '22023';
  end if;
  v_pais := public.fn_hr_pais(p_org);
  if v_pais is null then
    raise exception 'hr: la organización no existe' using errcode = 'P0002';
  end if;

  select * into r_org from public.hr_org_parameters x
   where x.organization_id = p_org and x.code = p_code
     and x.effective_from <= p_fecha and (x.effective_to is null or x.effective_to >= p_fecha)
   order by x.effective_from desc limit 1;
  if found then
    return jsonb_build_object('code', p_code, 'origen', 'organizacion', 'valor', r_org.value, 'valor_json', r_org.value_json,
      'status', 'vigente', 'verificacion', null, 'fuente', r_org.reason, 'url', null,
      'desde', r_org.effective_from, 'hasta', r_org.effective_to);
  end if;

  if p_code = 'uvt' then
    select u.value, u.norma into v_uvt, v_norma from public.fiscal_uvt u
     where u.country_code = v_pais and u.year = extract(year from p_fecha)::integer;
    if v_uvt is null then return null; end if;
    return jsonb_build_object('code', 'uvt', 'origen', 'fiscal_uvt', 'valor', v_uvt, 'valor_json', null,
      'status', 'vigente', 'verificacion', 'S', 'fuente', v_norma, 'url', null,
      'desde', make_date(extract(year from p_fecha)::integer, 1, 1), 'hasta', make_date(extract(year from p_fecha)::integer, 12, 31));
  end if;

  select * into r_pl from public.hr_legal_parameters x
   where x.country_code = v_pais and x.code = p_code
     and x.effective_from <= p_fecha and (x.effective_to is null or x.effective_to >= p_fecha)
   order by x.effective_from desc limit 1;
  if not found then return null; end if;
  return jsonb_build_object('code', p_code, 'origen', 'plataforma', 'valor', r_pl.value, 'valor_json', r_pl.value_json,
    'status', r_pl.status, 'verificacion', r_pl.verificacion, 'fuente', r_pl.legal_source, 'url', r_pl.source_url,
    'notas', r_pl.notes, 'desde', r_pl.effective_from, 'hasta', r_pl.effective_to);
end;
$$;

create or replace function public.fn_hr_parametro_confirmado(p_org integer, p_code text, p_fecha date)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  d jsonb := public.fn_hr_parametro_detalle(p_org, p_code, p_fecha);
begin
  if d is null then
    raise exception 'parametro_no_configurado: % en %', p_code, p_fecha using errcode = 'P0002';
  end if;
  if d->>'status' = 'por_confirmar' then
    raise exception 'parametro_por_confirmar: % en % (%)', p_code, p_fecha, d->>'fuente' using errcode = '22023';
  end if;
  return d;
end;
$$;

create or replace function public.fn_hr_parametro(p_org integer, p_code text, p_fecha date)
returns numeric
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  d jsonb := public.fn_hr_parametro_confirmado(p_org, p_code, p_fecha);
begin
  if d->'valor' is null or jsonb_typeof(d->'valor') = 'null' then
    raise exception 'parametro_es_tabla: % se lee con fn_hr_parametro_json', p_code using errcode = '22023';
  end if;
  return (d->>'valor')::numeric;
end;
$$;

create or replace function public.fn_hr_parametro_json(p_org integer, p_code text, p_fecha date)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  d jsonb := public.fn_hr_parametro_confirmado(p_org, p_code, p_fecha);
begin
  return coalesce(nullif(d->'valor_json', 'null'::jsonb), d->'valor');
end;
$$;

-- Tramos de un parámetro dentro de un período: un período puede necesitar dos valores.
create or replace function public.fn_hr_parametro_tramos(p_org integer, p_code text, p_desde date, p_hasta date)
returns table (desde date, hasta date, valor numeric, valor_json jsonb, origen text, status text, fuente text)
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_pais text;
  v_cortes date[];
  d jsonb;
  i integer;
begin
  perform public.fn_assert_acceso_org(p_org);
  if p_hasta < p_desde then
    raise exception 'hr: período inválido' using errcode = '22023';
  end if;
  v_pais := public.fn_hr_pais(p_org);
  select array_agg(c order by c) into v_cortes from (
    select p_desde as c
    union select x.effective_from from public.hr_legal_parameters x
     where x.country_code = v_pais and x.code = p_code and x.effective_from > p_desde and x.effective_from <= p_hasta
    union select x.effective_to + 1 from public.hr_legal_parameters x
     where x.country_code = v_pais and x.code = p_code and x.effective_to + 1 > p_desde and x.effective_to + 1 <= p_hasta
    union select x.effective_from from public.hr_org_parameters x
     where x.organization_id = p_org and x.code = p_code and x.effective_from > p_desde and x.effective_from <= p_hasta
    union select x.effective_to + 1 from public.hr_org_parameters x
     where x.organization_id = p_org and x.code = p_code and x.effective_to + 1 > p_desde and x.effective_to + 1 <= p_hasta
    union select make_date(y, 1, 1) from generate_series(extract(year from p_desde)::integer + 1, extract(year from p_hasta)::integer) y
     where p_code = 'uvt'
  ) z;
  for i in 1 .. cardinality(v_cortes) loop
    desde := v_cortes[i];
    hasta := case when i < cardinality(v_cortes) then v_cortes[i + 1] - 1 else p_hasta end;
    d := public.fn_hr_parametro_detalle(p_org, p_code, desde);
    valor := nullif(d->>'valor', '')::numeric;
    valor_json := nullif(d->'valor_json', 'null'::jsonb);
    origen := coalesce(d->>'origen', 'sin_valor');
    status := d->>'status';
    fuente := d->>'fuente';
    return next;
  end loop;
end;
$$;

revoke execute on function public.fn_hr_pais(integer) from public, anon;
revoke execute on function public.fn_hr_parametro_detalle(integer, text, date) from public, anon;
revoke execute on function public.fn_hr_parametro_confirmado(integer, text, date) from public, anon;
revoke execute on function public.fn_hr_parametro(integer, text, date) from public, anon;
revoke execute on function public.fn_hr_parametro_json(integer, text, date) from public, anon;
revoke execute on function public.fn_hr_parametro_tramos(integer, text, date, date) from public, anon;
grant execute on function public.fn_hr_pais(integer) to authenticated, service_role;
grant execute on function public.fn_hr_parametro_detalle(integer, text, date) to authenticated, service_role;
grant execute on function public.fn_hr_parametro_confirmado(integer, text, date) to authenticated, service_role;
grant execute on function public.fn_hr_parametro(integer, text, date) to authenticated, service_role;
grant execute on function public.fn_hr_parametro_json(integer, text, date) to authenticated, service_role;
grant execute on function public.fn_hr_parametro_tramos(integer, text, date, date) to authenticated, service_role;

-- 6. Catálogo y valores ------------------------------------------------------------------
insert into public.hr_parameter_catalog (code, name, unit, org_override, research_ref) values
  ('smmlv', 'Salario mínimo mensual legal vigente', 'cop', 'no', '§2, §12-A-1'),
  ('auxilio_transporte', 'Auxilio de transporte', 'cop', 'no', '§2, §12-A-2'),
  ('auxilio_transporte_tope_smmlv', 'Tope de salario para el auxilio de transporte', 'smmlv', 'no', '§2, §12-A-2'),
  ('auxilio_conectividad_tope_smmlv', 'Tope de salario para el auxilio de conectividad', 'smmlv', 'no', '§1.7, §12-A-3'),
  ('uvt', 'Unidad de valor tributario (se lee de fiscal_uvt)', 'cop', 'no', '§2, §12-A-4'),
  ('salario_integral_minimo_smmlv', 'Salario integral mínimo', 'smmlv', 'no', '§2, §12-A-5'),
  ('salario_integral_factor_ibc', 'Factor del IBC del salario integral', 'fraccion', 'no', '§2'),
  ('ibc_tope_smmlv', 'Tope del IBC', 'smmlv', 'no', '§2, §12-A-5'),
  ('exoneracion_114_1_umbral_smmlv', 'Umbral de la exoneración del art. 114-1 ET', 'smmlv', 'no', '§2.1, §12-C-19'),
  ('aporte_salud_empleador', 'Aporte a salud del empleador', 'fraccion', 'no', '§2.1, §12-C-18'),
  ('aporte_salud_trabajador', 'Aporte a salud del trabajador', 'fraccion', 'no', '§2.1, §12-C-18'),
  ('aporte_pension_empleador', 'Aporte a pensión del empleador', 'fraccion', 'no', '§2.1, §12-C-18'),
  ('aporte_pension_trabajador', 'Aporte a pensión del trabajador', 'fraccion', 'no', '§2.1, §12-C-18'),
  ('aporte_ccf', 'Aporte a caja de compensación', 'fraccion', 'no', '§2.1, §12-C-18'),
  ('aporte_icbf', 'Aporte al ICBF', 'fraccion', 'no', '§2.1, §12-C-18'),
  ('aporte_sena', 'Aporte al SENA', 'fraccion', 'no', '§2.1, §12-C-18'),
  ('arl_tarifas', 'Tarifas ARL por clase de riesgo', 'tabla', 'no', '§2.1, §12-C-20'),
  ('fsp_tabla', 'Fondo de Solidaridad Pensional por rango de IBC', 'tabla', 'no', '§2.1, §12-B-15'),
  ('jornada_max_semanal', 'Jornada máxima semanal', 'horas', 'no_mayor', '§1.1, §12-B-9'),
  ('divisor_hora_mensual', 'Divisor de hora mensual (práctica contable)', 'horas', 'no_mayor', '§1.1, §12-B-9'),
  ('nocturno_hora_inicio', 'Hora de inicio del trabajo nocturno', 'hora_del_dia', 'no', '§1.2, §12-B-10'),
  ('nocturno_hora_fin', 'Hora de fin del trabajo nocturno', 'hora_del_dia', 'no', '§1.2, §12-B-10'),
  ('recargo_nocturno', 'Recargo nocturno', 'fraccion', 'no', '§1.2, §12-B-12'),
  ('recargo_extra_diurna', 'Recargo de hora extra diurna', 'fraccion', 'no', '§1.2, §12-B-12'),
  ('recargo_extra_nocturna', 'Recargo de hora extra nocturna', 'fraccion', 'no', '§1.2, §12-B-12'),
  ('recargo_dominical_festivo', 'Recargo dominical y festivo', 'fraccion', 'no_menor', '§1.3, §12-B-11'),
  ('dominical_habitual_umbral_dias', 'Días de descanso trabajados en el mes para ser habitual', 'dias', 'no', '§1.3, §12-B-13'),
  ('horas_extra_max_dia', 'Máximo de horas extra por día', 'horas', 'no', '§1.1, §12-B-14'),
  ('horas_extra_max_semana', 'Máximo de horas extra por semana', 'horas', 'no', '§1.1, §12-B-14'),
  ('incapacidad_tramos', 'Incapacidades: quién paga y cuánto por tramo de días', 'tabla', 'no', '§11.1, §12-C-24'),
  ('licencia_maternidad_semanas', 'Licencia de maternidad', 'semanas', 'no', '§11.2, §12-C-25'),
  ('licencia_paternidad_semanas', 'Licencia de paternidad', 'semanas', 'no', '§11.2, §12-C-25'),
  ('intereses_cesantias_tasa', 'Intereses sobre cesantías (anual)', 'fraccion', 'no', '§3, §12-C-27'),
  ('retencion_art383_tabla', 'Tabla de retención del art. 383 ET (en UVT)', 'tabla', 'no', '§4.1, §12-C-21'),
  ('dep_dependientes_pct', 'Deducción por dependientes (% del ingreso bruto laboral)', 'fraccion', 'no', '§4.3, §12-C-22'),
  ('dep_dependientes_tope_uvt_mes', 'Tope mensual de la deducción por dependientes', 'uvt', 'no', '§4.3, §12-C-22'),
  ('dep_medicina_prepagada_tope_uvt_mes', 'Tope mensual de medicina prepagada', 'uvt', 'no', '§4.3, §12-C-22'),
  ('dep_intereses_vivienda_tope_uvt_mes', 'Tope mensual de intereses de vivienda', 'uvt', 'no', '§4.3, §12-C-22'),
  ('renta_exenta_voluntarios_pct', 'Tope de aportes voluntarios (AFC, FVP) sobre el ingreso laboral', 'fraccion', 'no', '§4.3, §12-C-22'),
  ('renta_exenta_voluntarios_tope_uvt_anio', 'Tope anual de aportes voluntarios', 'uvt', 'no', '§4.3, §12-C-22'),
  ('renta_exenta_25_pct', 'Renta exenta del art. 206 num. 10', 'fraccion', 'no', '§4.3, §12-C-22'),
  ('renta_exenta_25_tope_uvt_anio', 'Tope anual de la renta exenta del 25 %', 'uvt', 'no', '§4.3, §12-C-22'),
  ('limite_global_pct', 'Límite global de deducciones y rentas exentas', 'fraccion', 'no', '§4.3, §12-C-22'),
  ('limite_global_tope_uvt_anio', 'Tope anual del límite global', 'uvt', 'no', '§4.3, §12-C-22'),
  ('embargo_fraccion_excedente', 'Parte embargable del excedente sobre el mínimo', 'fraccion', 'no', '§11.3, §12-C-28'),
  ('embargo_alimentos_max', 'Máximo embargable por alimentos o cooperativas', 'fraccion', 'no', '§11.3, §12-C-28'),
  ('libranza_neto_minimo', 'Salario neto mínimo que debe recibir con libranzas', 'fraccion', 'no', '§11.3, §12-C-28'),
  ('indemnizacion_art64', 'Indemnización por despido sin justa causa (CST 64)', 'tabla', 'no', '§3.4, §12-C-26'),
  ('aprendiz_apoyo', 'Apoyo de sostenimiento del aprendiz (fracción del SMMLV)', 'tabla', 'no', '§1.5, §12-B-16'),
  ('aprendiz_monetizacion_smmlv', 'Monetización de la cuota de aprendices', 'smmlv', 'no', '§1.5, §12-A-5'),
  ('periodicidad_pago', 'Periodicidad de pago de la nómina', 'texto', 'libre', '§12-E-32'),
  ('sst_estandares', 'Estándares mínimos del SG-SST que aplican (7, 21 o 60)', 'entero', 'libre', '§10.1, §12-E-33'),
  ('retencion_documental', 'Política de retención documental por tipo (años)', 'tabla', 'libre', '§9.4, §12-E-34'),
  ('banco_hojas_vida_meses', 'Plazo de conservación del banco de hojas de vida', 'entero', 'libre', '§9.1, §12-E-34'),
  ('marcacion_mecanismos', 'Mecanismos de marcación habilitados', 'tabla', 'libre', '§9.2, §12-E-35'),
  ('exoneracion_114_1_aplica', 'El empleador cumple los requisitos de la exoneración del 114-1', 'booleano', 'libre', '§2.1, §12-C-19')
on conflict (code) do update set name = excluded.name, unit = excluded.unit,
  org_override = excluded.org_override, research_ref = excluded.research_ref;

-- Idempotente: se recarga el bloque de plataforma de COL que trae esta migración.
delete from public.hr_legal_parameters where country_code = 'COL' and created_by is null and notes like '[ADR-001]%';

insert into public.hr_legal_parameters
  (country_code, code, value, value_json, effective_from, effective_to, status, verificacion, legal_source, source_url, notes)
values
  ('COL','smmlv',1750905,null,'2026-01-01','2026-12-31','transitorio','S',
   'Decreto transitorio 0159 del 19-feb-2026 (el Decreto 1469 de 2025 está suspendido por el Consejo de Estado, auto del 12-feb-2026)',
   'https://www.larepublica.co/economia/mintrabajo-publico-decreto-transitorio-que-mantiene-minimo-de-1-75-millones-en-2026-4331878',
   '[ADR-001] Litigio abierto: nulidad en la Sección Segunda y solicitud de suspender también el 0159. Un cambio se aplica desde su fecha sin tocar períodos cerrados.'),
  ('COL','smmlv',null,null,'2027-01-01',null,'por_confirmar','NC',
   'Se decreta en diciembre de 2026', null, '[ADR-001] Sin valor: no se ha decretado.'),
  ('COL','auxilio_transporte',249095,null,'2026-01-01','2026-12-31','transitorio','S',
   'Decreto 1470 de 2025 y decreto transitorio de 2026', 'https://www.eltiempo.com/economia/sectores/gobierno-expide-el-nuevo-decreto-del-salario-minimo-2026-tras-la-suspension-del-consejo-de-estado-3534019',
   '[ADR-001] Ligado al litigio del SMMLV 2026.'),
  ('COL','auxilio_transporte',null,null,'2027-01-01',null,'por_confirmar','NC',
   'Se decreta en diciembre de 2026', null, '[ADR-001] Sin valor: no se ha decretado.'),
  ('COL','auxilio_transporte_tope_smmlv',2,null,'2026-01-01',null,'vigente','S',
   'Ley 15 de 1959 y decreto anual del auxilio', null, '[ADR-001] Hasta 2 SMMLV.'),
  ('COL','auxilio_conectividad_tope_smmlv',2,null,'2026-01-01',null,'vigente','V',
   'Ley 2466 de 2025, art. 53 (art. 6A de la Ley 1221 de 2008)', 'https://incp.org.co/wp-content/uploads/2025/09/Ley-2466-de-2025.pdf',
   '[ADR-001] Teletrabajadores con menos de 2 SMMLV; reemplaza al auxilio de transporte por el mismo valor.'),
  ('COL','salario_integral_minimo_smmlv',13,null,'2026-01-01',null,'vigente','V',
   'CST art. 132; UGPP', 'https://www.ugpp.gov.co/wp-content/uploads/2026/02/ABC-Trabajadores-dependientes-que-devengan-salario-integral.pdf', '[ADR-001]'),
  ('COL','salario_integral_factor_ibc',0.70,null,'2026-01-01',null,'vigente','V',
   'CST art. 132; UGPP', 'https://www.ugpp.gov.co/wp-content/uploads/2026/02/ABC-Trabajadores-dependientes-que-devengan-salario-integral.pdf', '[ADR-001]'),
  ('COL','ibc_tope_smmlv',25,null,'2026-01-01',null,'vigente','V',
   'Decreto 1072 de 2015, art. 2.2.4.3.3; UGPP', 'https://normativa.colpensiones.gov.co/colpens/docs/decreto_1072_2015.htm', '[ADR-001]'),
  ('COL','exoneracion_114_1_umbral_smmlv',10,null,'2026-01-01',null,'vigente','V',
   'Estatuto Tributario art. 114-1; UGPP', 'https://www.ugpp.gov.co/wp-content/uploads/2026/02/ABC-Trabajadores-dependientes-que-devengan-salario-integral.pdf',
   '[ADR-001] Exonera salud del empleador, SENA e ICBF por quienes devengan menos de 10 SMMLV. No aplica a caja ni a salario integral.'),
  ('COL','aporte_salud_empleador',0.085,null,'2026-01-01',null,'vigente','V','Ley 100 de 1993, art. 204; UGPP',null,'[ADR-001]'),
  ('COL','aporte_salud_trabajador',0.04,null,'2026-01-01',null,'vigente','V','Ley 100 de 1993, art. 204; UGPP',null,'[ADR-001]'),
  ('COL','aporte_pension_empleador',0.12,null,'2026-01-01',null,'vigente','V','Ley 100 de 1993, art. 20; UGPP',null,'[ADR-001]'),
  ('COL','aporte_pension_trabajador',0.04,null,'2026-01-01',null,'vigente','V','Ley 100 de 1993, art. 20; UGPP',null,'[ADR-001]'),
  ('COL','aporte_ccf',0.04,null,'2026-01-01',null,'vigente','V','Ley 21 de 1982; UGPP',null,'[ADR-001]'),
  ('COL','aporte_icbf',0.03,null,'2026-01-01',null,'vigente','V','UGPP',null,'[ADR-001]'),
  ('COL','aporte_sena',0.02,null,'2026-01-01',null,'vigente','V','UGPP',null,'[ADR-001]'),
  ('COL','arl_tarifas',null,
   '{"I":{"minimo":0.00348,"inicial":0.00522,"maximo":0.00696},"II":{"minimo":0.00435,"inicial":0.01044,"maximo":0.01653},"III":{"minimo":0.00783,"inicial":0.02436,"maximo":0.04089},"IV":{"minimo":0.0174,"inicial":0.0435,"maximo":0.0606},"V":{"minimo":0.03219,"inicial":0.0696,"maximo":0.087}}',
   '2026-01-01',null,'vigente','V','Decreto 1072 de 2015, art. 2.2.4.3.5 (Decreto 1772 de 1994, art. 13)',
   'https://normativa.colpensiones.gov.co/colpens/docs/decreto_1072_2015.htm',
   '[ADR-001] La clase la asigna la ARL por actividad económica; va por centro de trabajo o cargo (fase 1).'),
  ('COL','fsp_tabla',null,
   '[{"desde_smmlv":4,"hasta_smmlv":16,"tarifa":0.01},{"desde_smmlv":16,"hasta_smmlv":17,"tarifa":0.012},{"desde_smmlv":17,"hasta_smmlv":18,"tarifa":0.014},{"desde_smmlv":18,"hasta_smmlv":19,"tarifa":0.016},{"desde_smmlv":19,"hasta_smmlv":20,"tarifa":0.018},{"desde_smmlv":20,"hasta_smmlv":null,"tarifa":0.02}]',
   '2026-01-01','2027-03-31','vigente','V','Ley 100 de 1993, art. 27 (Ley 797 de 2003); UGPP 2026',null,
   '[ADR-001] Rango [desde, hasta). Termina cuando entra la Ley 2381 de 2024 (fecha con riesgo de aplazamiento).'),
  ('COL','fsp_tabla',null,
   '[{"desde_smmlv":4,"hasta_smmlv":7,"tarifa":0.015},{"desde_smmlv":7,"hasta_smmlv":11,"tarifa":0.018},{"desde_smmlv":11,"hasta_smmlv":19,"tarifa":0.025},{"desde_smmlv":19,"hasta_smmlv":20,"tarifa":0.028},{"desde_smmlv":20,"hasta_smmlv":null,"tarifa":0.03}]',
   '2027-04-01',null,'por_confirmar','NC','Ley 2381 de 2024 (reforma pensional); Corte Constitucional, Sentencia C-264 de 2026',
   'https://siemprealdia.co/colombia/derecho-laboral/aportes-al-fondo-de-solidaridad-pensional/',
   '[ADR-001] Tabla de fuentes secundarias, sin confirmar el artículo ni la versión final. Colpensiones pidió aplazar a 2028.'),
  ('COL','jornada_max_semanal',44,null,'2025-07-15','2026-07-14','vigente','V',
   'Ley 2101 de 2021, art. 3; CST art. 161 (Ley 2466 de 2025, art. 11)','http://www.secretariasenado.gov.co/senado/basedoc/ley_2101_2021.html','[ADR-001]'),
  ('COL','jornada_max_semanal',42,null,'2026-07-15',null,'vigente','V',
   'Ley 2101 de 2021, art. 3; CST art. 161 (Ley 2466 de 2025, art. 11)','http://www.secretariasenado.gov.co/senado/basedoc/ley_2101_2021.html',
   '[ADR-001] El 15-jul sale de la vigencia de la Ley 2101; un medio dice 16-jul.'),
  ('COL','divisor_hora_mensual',220,null,'2025-07-15','2026-07-14','vigente','S',
   'Práctica contable: horas semanales / 6 × 30 (no está en la ley)','https://actualicese.com/liquidacion-de-nomina-con-la-jornada-laboral-de-42-horas/','[ADR-001] Validar con el Contador.'),
  ('COL','divisor_hora_mensual',210,null,'2026-07-15',null,'vigente','S',
   'Práctica contable: horas semanales / 6 × 30 (no está en la ley)','https://actualicese.com/liquidacion-de-nomina-con-la-jornada-laboral-de-42-horas/','[ADR-001] Validar con el Contador.'),
  ('COL','nocturno_hora_inicio',19,null,'2025-12-25',null,'vigente','V',
   'CST art. 160 (Ley 2466 de 2025, art. 10)','http://www.secretariasenado.gov.co/senado/basedoc/codigo_sustantivo_trabajo_pr005.html',
   '[ADR-001] Rige 6 meses después de la sanción. El día exacto (25-dic-2025, 26-dic o 1-ene-2026) no está confirmado. Antes: 21:00.'),
  ('COL','nocturno_hora_fin',6,null,'2025-12-25',null,'vigente','V',
   'CST art. 160 (Ley 2466 de 2025, art. 10)','http://www.secretariasenado.gov.co/senado/basedoc/codigo_sustantivo_trabajo_pr005.html','[ADR-001]'),
  ('COL','recargo_nocturno',0.35,null,'2026-01-01',null,'vigente','V','CST art. 168','http://www.secretariasenado.gov.co/senado/basedoc/codigo_sustantivo_trabajo_pr005.html','[ADR-001] Los recargos no se acumulan entre sí.'),
  ('COL','recargo_extra_diurna',0.25,null,'2026-01-01',null,'vigente','V','CST art. 168','http://www.secretariasenado.gov.co/senado/basedoc/codigo_sustantivo_trabajo_pr005.html','[ADR-001]'),
  ('COL','recargo_extra_nocturna',0.75,null,'2026-01-01',null,'vigente','V','CST art. 168','http://www.secretariasenado.gov.co/senado/basedoc/codigo_sustantivo_trabajo_pr005.html','[ADR-001]'),
  ('COL','recargo_dominical_festivo',0.80,null,'2025-07-01','2026-06-30','vigente','V','CST art. 179 (Ley 2466 de 2025, art. 14)','https://incp.org.co/wp-content/uploads/2025/09/Ley-2466-de-2025.pdf','[ADR-001]'),
  ('COL','recargo_dominical_festivo',0.90,null,'2026-07-01','2027-06-30','vigente','V','CST art. 179 (Ley 2466 de 2025, art. 14)','https://incp.org.co/wp-content/uploads/2025/09/Ley-2466-de-2025.pdf','[ADR-001]'),
  ('COL','recargo_dominical_festivo',1.00,null,'2027-07-01',null,'vigente','V','CST art. 179 (Ley 2466 de 2025, art. 14)','https://incp.org.co/wp-content/uploads/2025/09/Ley-2466-de-2025.pdf','[ADR-001] Programado por ley.'),
  ('COL','dominical_habitual_umbral_dias',3,null,'2026-01-01',null,'vigente','V','CST art. 179 (Ley 2466 de 2025, art. 14)',null,'[ADR-001] Ocasional: hasta 2 días de descanso trabajados en el mes; habitual: 3 o más.'),
  ('COL','horas_extra_max_dia',2,null,'2026-01-01',null,'vigente','V','Ley 50 de 1990, art. 22 (Ley 2466 de 2025, art. 13)',null,'[ADR-001]'),
  ('COL','horas_extra_max_semana',12,null,'2026-01-01',null,'vigente','V','Ley 50 de 1990, art. 22 (Ley 2466 de 2025, art. 13)',null,'[ADR-001]'),
  ('COL','incapacidad_tramos',null,
   '{"comun":[{"desde_dia":1,"hasta_dia":2,"paga":"empleador","fraccion":0.6667,"piso":"smmlv_diario"},{"desde_dia":3,"hasta_dia":90,"paga":"eps","fraccion":0.6667,"piso":"smmlv_diario"},{"desde_dia":91,"hasta_dia":180,"paga":"eps","fraccion":0.5,"piso":"smmlv_diario"},{"desde_dia":181,"hasta_dia":540,"paga":"fondo_pensiones","fraccion":0.5},{"desde_dia":541,"hasta_dia":null,"paga":"eps","fraccion":0.5}],"laboral":[{"desde_dia":1,"hasta_dia":1,"paga":"empleador","fraccion":1},{"desde_dia":2,"hasta_dia":null,"paga":"arl","fraccion":1}],"semanas_cotizadas_minimas":4}',
   '2026-01-01',null,'vigente','S','CST art. 227; Decreto 780 de 2016 (Decreto 1427 de 2022); Ley 776 de 2002, art. 3; Decreto Ley 019 de 2012, art. 142',
   'https://normativa.colpensiones.gov.co/colpens/compilacion/docs/decreto_1427_2022.htm',
   '[ADR-001] El piso del SMMLV diario y el tramo 181-540 tienen fuente secundaria.'),
  ('COL','licencia_maternidad_semanas',18,null,'2026-01-01',null,'vigente','V','CST art. 236 (Ley 2114 de 2021)',null,'[ADR-001]'),
  ('COL','licencia_paternidad_semanas',2,null,'2026-01-01',null,'vigente','V','CST art. 236, parágrafo 2 (Ley 2114 de 2021)',null,
   '[ADR-001] Ampliable hasta 5 semanas según la tasa de desempleo; no se encontró ningún acto que active el aumento.'),
  ('COL','intereses_cesantias_tasa',0.12,null,'2026-01-01',null,'vigente','S','Ley 52 de 1975',null,'[ADR-001] Pago mensual al 1 % por acuerdo (Ley 2466, art. 64).'),
  ('COL','retencion_art383_tabla',null,
   '[{"desde_uvt":0,"hasta_uvt":95,"tarifa":0,"base_uvt":0,"suma_uvt":0},{"desde_uvt":95,"hasta_uvt":150,"tarifa":0.19,"base_uvt":95,"suma_uvt":0},{"desde_uvt":150,"hasta_uvt":360,"tarifa":0.28,"base_uvt":150,"suma_uvt":10},{"desde_uvt":360,"hasta_uvt":640,"tarifa":0.33,"base_uvt":360,"suma_uvt":69},{"desde_uvt":640,"hasta_uvt":945,"tarifa":0.35,"base_uvt":640,"suma_uvt":162},{"desde_uvt":945,"hasta_uvt":2300,"tarifa":0.37,"base_uvt":945,"suma_uvt":268},{"desde_uvt":2300,"hasta_uvt":null,"tarifa":0.39,"base_uvt":2300,"suma_uvt":770}]',
   '2026-01-01',null,'vigente','S','Estatuto Tributario art. 383 (Ley 2010 de 2019)','https://siemprealdia.co/colombia/impuestos/retencion-en-la-fuente-por-salarios/',
   '[ADR-001] Rango (desde, hasta]. Impuesto = (base − base_uvt) × tarifa + suma_uvt. La tabla oficial es una imagen; valores de fuente secundaria. fn_retencion_art383 no cambia.'),
  ('COL','dep_dependientes_pct',0.10,null,'2026-01-01',null,'vigente','V','Estatuto Tributario art. 387',null,'[ADR-001]'),
  ('COL','dep_dependientes_tope_uvt_mes',32,null,'2026-01-01',null,'vigente','V','Estatuto Tributario art. 387',null,'[ADR-001]'),
  ('COL','dep_medicina_prepagada_tope_uvt_mes',16,null,'2026-01-01',null,'vigente','V','Estatuto Tributario art. 387',null,'[ADR-001]'),
  ('COL','dep_intereses_vivienda_tope_uvt_mes',100,null,'2026-01-01',null,'vigente','S','Estatuto Tributario art. 119',null,'[ADR-001] Tope de fuente secundaria.'),
  ('COL','renta_exenta_voluntarios_pct',0.30,null,'2026-01-01',null,'vigente','S','Estatuto Tributario arts. 126-1 y 126-4',null,'[ADR-001]'),
  ('COL','renta_exenta_voluntarios_tope_uvt_anio',3800,null,'2026-01-01',null,'vigente','S','Estatuto Tributario arts. 126-1 y 126-4',null,'[ADR-001]'),
  ('COL','renta_exenta_25_pct',0.25,null,'2026-01-01',null,'vigente','V','Estatuto Tributario art. 206 num. 10 (Ley 2277 de 2022)',null,'[ADR-001]'),
  ('COL','renta_exenta_25_tope_uvt_anio',790,null,'2026-01-01',null,'vigente','V','Estatuto Tributario art. 206 num. 10 (Ley 2277 de 2022)',null,'[ADR-001]'),
  ('COL','limite_global_pct',0.40,null,'2026-01-01',null,'vigente','V','Estatuto Tributario art. 336 num. 3',null,'[ADR-001]'),
  ('COL','limite_global_tope_uvt_anio',1340,null,'2026-01-01',null,'vigente','V','Estatuto Tributario art. 336 num. 3',null,'[ADR-001]'),
  ('COL','embargo_fraccion_excedente',0.20,null,'2026-01-01',null,'vigente','V','CST art. 155','http://www.secretariasenado.gov.co/senado/basedoc/codigo_sustantivo_trabajo_pr005.html','[ADR-001] 1/5 del excedente sobre el SMMLV; el mínimo es inembargable (CST 154).'),
  ('COL','embargo_alimentos_max',0.50,null,'2026-01-01',null,'vigente','V','CST art. 156','http://www.secretariasenado.gov.co/senado/basedoc/codigo_sustantivo_trabajo_pr005.html','[ADR-001]'),
  ('COL','libranza_neto_minimo',0.50,null,'2026-01-01',null,'vigente','V','Ley 1527 de 2012, art. 3 num. 5','http://www.secretariasenado.gov.co/senado/basedoc/ley_1527_2012.html','[ADR-001]'),
  ('COL','indemnizacion_art64',null,
   '{"umbral_smmlv":10,"indefinido_menor_umbral":{"primer_anio_dias":30,"anio_siguiente_dias":20},"indefinido_mayor_igual_umbral":{"primer_anio_dias":20,"anio_siguiente_dias":15},"obra_labor_minimo_dias":15,"termino_fijo":"salarios_del_tiempo_faltante","transicion":{"corte":"2002-12-27","anios_minimos":10,"primer_anio_dias":45,"nota":"30 o 40 días por año siguiente según el texto anterior"}}',
   '2026-01-01',null,'vigente','V','CST art. 64 (Ley 789 de 2002)','http://www.secretariasenado.gov.co/senado/basedoc/codigo_sustantivo_trabajo_pr001.html','[ADR-001] La Ley 2466 no lo modificó.'),
  ('COL','aprendiz_apoyo',null,
   '{"dual":{"anio_1":0.75,"anio_2":1.0},"tradicional":{"lectiva":0.75,"practica":1.0},"universitario":{"minimo":1.0}}',
   '2026-01-01',null,'vigente','V','CST art. 81 (Ley 2466 de 2025, art. 21)','https://incp.org.co/wp-content/uploads/2025/09/Ley-2466-de-2025.pdf','[ADR-001] Fracciones del SMMLV.'),
  ('COL','aprendiz_monetizacion_smmlv',1.5,null,'2026-01-01',null,'vigente','V','Ley 2466 de 2025, art. 23','https://incp.org.co/wp-content/uploads/2025/09/Ley-2466-de-2025.pdf','[ADR-001]');
