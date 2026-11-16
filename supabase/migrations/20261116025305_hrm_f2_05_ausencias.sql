-- HRM fase 2 · paso 5: vacaciones, incapacidades y licencias; consumo para la nómina y ausencias sin aviso
-- (ADR-002 §4, §5 y §6). leave_types, leave_requests y leave_balances tienen 0 filas.

-- 1. Tipos de ausencia: clase legal, grupo sensible y forma de contar -------------------
alter table public.leave_types
  add column if not exists legal_class text,
  add column if not exists data_group text,
  add column if not exists counts_days text not null default 'calendario',
  add column if not exists is_system boolean not null default false;
alter table public.leave_types drop constraint if exists leave_types_legal_class_chk;
alter table public.leave_types add constraint leave_types_legal_class_chk
  check (legal_class is null or legal_class in ('vacaciones', 'incapacidad_comun', 'incapacidad_laboral', 'maternidad',
                                                'paternidad', 'luto', 'calamidad', 'licencia_remunerada', 'licencia_no_remunerada'));
alter table public.leave_types drop constraint if exists leave_types_data_group_chk;
alter table public.leave_types add constraint leave_types_data_group_chk check (data_group is null or data_group = 'salud');
alter table public.leave_types drop constraint if exists leave_types_counts_days_chk;
alter table public.leave_types add constraint leave_types_counts_days_chk check (counts_days in ('habiles', 'calendario'));
comment on column public.leave_types.data_group is
  'ADR-002 §6. «salud» en las incapacidades: el jefe ve «ausente por incapacidad», nunca el tipo exacto ni el diagnóstico.';

-- 2. Solicitudes: aprobación, prórroga y soporte -----------------------------------------
alter table public.leave_requests
  add column if not exists approval_instance_id uuid references public.hr_approval_instances(id),
  add column if not exists extends_leave_id uuid references public.leave_requests(id),
  add column if not exists document_id uuid references public.hr_documents(id);
create index if not exists leave_requests_vinculo_fechas_idx on public.leave_requests (employment_id, start_date, end_date);
create index if not exists leave_requests_org_fechas_idx on public.leave_requests (organization_id, start_date);
comment on column public.leave_requests.extends_leave_id is
  'ADR-002 §6. Prórroga: incapacidad contigua de la misma clase. El conteo de días para los tramos de pago sigue la cadena.';

-- 3. Detalle médico: sin acceso directo -----------------------------------------------------
create table if not exists public.hr_leave_health_details (
  leave_request_id uuid primary key references public.leave_requests(id) on delete cascade,
  organization_id integer not null references public.organizations(id) on delete cascade,
  diagnosis_code text check (diagnosis_code is null or diagnosis_code ~ '^[A-Z][0-9]{2}(\.?[0-9A-Z]{1,4})?$'),
  diagnosis_text text check (diagnosis_text is null or char_length(diagnosis_text) <= 500),
  issuer text check (issuer is null or char_length(issuer) <= 200),
  origin text check (origin is null or origin in ('comun', 'laboral')),
  notes text check (notes is null or char_length(notes) <= 1000),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
comment on table public.hr_leave_health_details is
  'ADR-002 §6. Diagnóstico (CIE-10) y entidad que expide la incapacidad. Grupo «salud»: sin políticas; solo por fn_hr_ausencia_detalle_salud, con registro de acceso. Nunca la historia clínica.';
alter table public.hr_leave_health_details enable row level security;
revoke all on public.hr_leave_health_details from anon, authenticated;

-- 4. Validación de la solicitud -------------------------------------------------------------
create or replace function public.fn_hr_ausencia_validar()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  t public.leave_types;
  v_person uuid;
  d public.hr_documents;
  p public.leave_requests;
begin
  select * into t from public.leave_types where id = new.leave_type_id;
  if t.id is null or t.organization_id <> new.organization_id then
    raise exception 'hr: el tipo de ausencia es de otra organización' using errcode = '42501';
  end if;
  if new.end_date < new.start_date then
    raise exception 'fechas_invalidas: la ausencia termina antes de empezar' using errcode = '22023';
  end if;
  if t.data_group = 'salud' and (coalesce(btrim(new.reason), '') <> '' or new.document_path is not null) then
    raise exception 'motivo_va_en_salud: el motivo y el soporte de una incapacidad van en su detalle de salud' using errcode = '22023';
  end if;
  if new.document_id is not null then
    select e.person_id into v_person from public.employments e where e.id = new.employment_id;
    select * into d from public.hr_documents where id = new.document_id;
    if d.id is null or d.organization_id <> new.organization_id or d.person_id is distinct from v_person
       or (t.data_group = 'salud' and d.data_group <> 'salud') then
      raise exception 'documento_invalido: el soporte debe ser de la misma persona y, en una incapacidad, del grupo salud' using errcode = '22023';
    end if;
  end if;
  if new.extends_leave_id is not null then
    select * into p from public.leave_requests where id = new.extends_leave_id;
    if p.id is null or p.employment_id <> new.employment_id or p.end_date <> new.start_date - 1
       or (select lt.legal_class from public.leave_types lt where lt.id = p.leave_type_id) is distinct from t.legal_class then
      raise exception 'prorroga_invalida: la prórroga empieza el día siguiente a la anterior y es de la misma clase' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.fn_hr_ausencia_validar() from public, anon, authenticated;
drop trigger if exists trg_leave_requests_00_org on public.leave_requests;
create trigger trg_leave_requests_00_org before insert or update on public.leave_requests
  for each row execute function public.fn_hr_org_del_vinculo();
drop trigger if exists trg_leave_requests_01_validar on public.leave_requests;
create trigger trg_leave_requests_01_validar before insert or update on public.leave_requests
  for each row execute function public.fn_hr_ausencia_validar();

-- El saldo de leave_balances (pantallas viejas) en días hábiles cuando el tipo los cuenta.
create or replace function public.hrm_update_leave_balance_on_request()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_year integer := extract(year from new.start_date);
  v_dias numeric;
  v_antes text := case when tg_op = 'INSERT' then null else old.status end;
begin
  select case when lt.counts_days = 'habiles' then coalesce(new.business_days, new.total_days) else new.total_days end
    into v_dias
    from public.leave_types lt where lt.id = new.leave_type_id;
  v_dias := coalesce(v_dias, new.total_days);
  if new.status = 'approved' and v_antes is distinct from 'approved' then
    insert into public.leave_balances (organization_id, employment_id, leave_type_id, year)
    values (new.organization_id, new.employment_id, new.leave_type_id, v_year)
    on conflict (employment_id, leave_type_id, year) do nothing;
    update public.leave_balances set pending = pending + v_dias, updated_at = now()
     where employment_id = new.employment_id and leave_type_id = new.leave_type_id and year = v_year;
  end if;
  if new.status = 'taken' and v_antes = 'approved' then
    update public.leave_balances set pending = pending - v_dias, used = used + v_dias, updated_at = now()
     where employment_id = new.employment_id and leave_type_id = new.leave_type_id and year = v_year;
  end if;
  if new.status = 'cancelled' and v_antes = 'approved' then
    update public.leave_balances set pending = pending - v_dias, updated_at = now()
     where employment_id = new.employment_id and leave_type_id = new.leave_type_id and year = v_year;
  end if;
  return new;
end;
$$;
revoke all on function public.hrm_update_leave_balance_on_request() from public, anon, authenticated;
drop trigger if exists trg_leave_request_balance on public.leave_requests;
create trigger trg_leave_request_balance after insert or update on public.leave_requests
  for each row execute function public.hrm_update_leave_balance_on_request();

-- 5. El jefe no ve las filas de salud por RLS (las ve como «incapacidad» por RPC) -------
drop policy if exists leave_requests_select on public.leave_requests;
create policy leave_requests_select on public.leave_requests for select to authenticated
  using (employment_id in (select public.fn_hr_mis_empleos())
         or organization_id in (select public.fn_hr_orgs_con_permiso('hr.leaves.view'))
         or organization_id in (select public.fn_hr_orgs_con_permiso('hr.leaves.approve'))
         or (employment_id in (select public.fn_hr_equipo_empleos('hr.employees.view_team'))
             and leave_type_id in (select lt.id from public.leave_types lt where lt.data_group is null)));

-- 6. Tipos de sistema ---------------------------------------------------------------------
create or replace function public.fn_hr_tipos_ausencia_asegurar(p_org integer)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  n integer;
begin
  insert into public.leave_types
    (organization_id, code, name, description, paid, affects_attendance, requires_document, requires_approval,
     legal_class, data_group, counts_days, is_system, color)
  select p_org, v.code, v.name, v.description, v.paid, true, v.doc, true, v.clase, v.grupo, v.cuenta, true, v.color
    from (values
      ('VAC', 'Vacaciones', '15 días hábiles por año de servicio (CST 186).', true, false, 'vacaciones', null::text, 'habiles', '#2563eb'),
      ('INC_EG', 'Incapacidad por enfermedad general', 'Origen común (CST 227).', true, true, 'incapacidad_comun', 'salud', 'calendario', '#dc2626'),
      ('INC_AT', 'Incapacidad por accidente o enfermedad laboral', 'Origen laboral (Ley 776 de 2002).', true, true, 'incapacidad_laboral', 'salud', 'calendario', '#b91c1c'),
      ('LMA', 'Licencia de maternidad', 'CST 236 (Ley 2114 de 2021).', true, true, 'maternidad', null, 'calendario', '#db2777'),
      ('LPA', 'Licencia de paternidad', 'CST 236 parágrafo 2 (Ley 2114 de 2021).', true, true, 'paternidad', null, 'calendario', '#7c3aed'),
      ('LUT', 'Licencia de luto', 'Ley 1280 de 2009.', true, true, 'luto', null, 'habiles', '#475569'),
      ('CAL', 'Calamidad doméstica', 'CST 57 num. 6.', true, false, 'calamidad', null, 'calendario', '#ea580c'),
      ('LRE', 'Licencia remunerada', 'CST 57 num. 6: citas médicas, obligaciones escolares, citaciones y las demás de ley.', true, false, 'licencia_remunerada', null, 'calendario', '#0891b2'),
      ('LNR', 'Licencia no remunerada', 'Suspende el contrato (CST 51): no cuenta para vacaciones ni prestaciones.', false, false, 'licencia_no_remunerada', null, 'calendario', '#64748b')
    ) as v(code, name, description, paid, doc, clase, grupo, cuenta, color)
  on conflict (organization_id, code) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.fn_hr_tipos_ausencia_asegurar(integer) from public, anon, authenticated;
grant execute on function public.fn_hr_tipos_ausencia_asegurar(integer) to service_role;

-- 7. Días: base 360 y días hábiles ------------------------------------------------------------
create or replace function public.fn_hr_dias360(p_desde date, p_hasta date)
returns integer
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  d1 integer := extract(day from p_desde);
  d2 integer := extract(day from p_hasta);
begin
  if p_desde is null or p_hasta is null or p_hasta < p_desde then
    return 0;
  end if;
  if d1 = 31 then d1 := 30; end if;
  -- Mes comercial de 30 días: el último día del mes (también febrero) cuenta como el 30.
  if d2 = 31 or p_hasta = (date_trunc('month', p_hasta) + interval '1 month - 1 day')::date then d2 := 30; end if;
  return (extract(year from p_hasta)::integer - extract(year from p_desde)::integer) * 360
       + (extract(month from p_hasta)::integer - extract(month from p_desde)::integer) * 30
       + (d2 - d1) + 1;
end;
$$;
revoke all on function public.fn_hr_dias360(date, date) from public, anon;
grant execute on function public.fn_hr_dias360(date, date) to authenticated, service_role;

create or replace function public.fn_hr_dias_habiles(p_org integer, p_desde date, p_hasta date, p_branch integer default null,
                                                     p_dias_laborables smallint[] default array[1, 2, 3, 4, 5, 6]::smallint[])
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(sum(case
           when exists (select 1 from public.hr_org_holidays o
                         where o.organization_id = p_org and o.holiday_date = d::date and not o.half_day
                           and (o.branch_ids is null or p_branch = any (o.branch_ids))) then 0
           when exists (select 1 from public.hr_org_holidays o
                         where o.organization_id = p_org and o.holiday_date = d::date and o.half_day
                           and (o.branch_ids is null or p_branch = any (o.branch_ids))) then 0.5
           else 1 end), 0)
    from generate_series(p_desde, least(p_hasta, p_desde + 800), interval '1 day') d
   where extract(dow from d)::smallint = any (coalesce(p_dias_laborables, array[1, 2, 3, 4, 5, 6]::smallint[]))
     and not exists (select 1 from public.hr_holidays h
                      where h.country_code = public.fn_hr_pais(p_org) and h.holiday_date = d::date);
$$;
revoke all on function public.fn_hr_dias_habiles(integer, date, date, integer, smallint[]) from public, anon, authenticated;
grant execute on function public.fn_hr_dias_habiles(integer, date, date, integer, smallint[]) to service_role;

-- 8. Saldo de vacaciones por causación ------------------------------------------------------
create or replace function public.fn_hr_vacaciones_saldo_interno(p_employment uuid, p_fecha date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  e public.employments;
  v_hasta date;
  v_por_anio numeric;
  v_servicio integer;
  v_lnr integer;
  v_causados numeric;
  v_disfrutados numeric;
  v_programados numeric;
  v_pendientes numeric;
begin
  select * into e from public.employments where id = p_employment;
  if e.id is null then
    raise exception 'hr: el vínculo no existe' using errcode = 'P0002';
  end if;
  v_por_anio := public.fn_hr_parametro(e.organization_id, 'vacaciones_dias_habiles_anio', p_fecha);
  v_hasta := least(p_fecha, coalesce(e.termination_date, p_fecha));
  if e.hire_date is null or v_hasta < e.hire_date then
    v_servicio := 0;
  else
    v_servicio := public.fn_hr_dias360(e.hire_date, v_hasta);
  end if;
  -- La licencia no remunerada suspende el contrato (CST 51): no causa vacaciones.
  select coalesce(sum(least(l.end_date, v_hasta) - greatest(l.start_date, e.hire_date) + 1), 0)
    into v_lnr
    from public.leave_requests l join public.leave_types lt on lt.id = l.leave_type_id
   where l.employment_id = p_employment and lt.legal_class = 'licencia_no_remunerada'
     and l.status in ('approved', 'taken') and l.start_date <= v_hasta and l.end_date >= coalesce(e.hire_date, l.start_date);
  v_causados := round(v_por_anio * greatest(v_servicio - v_lnr, 0) / 360.0, 2);
  select coalesce(sum(coalesce(l.business_days, l.total_days)) filter (where l.status in ('approved', 'taken') and l.start_date <= p_fecha), 0),
         coalesce(sum(coalesce(l.business_days, l.total_days)) filter (where l.status = 'approved' and l.start_date > p_fecha), 0),
         coalesce(sum(coalesce(l.business_days, l.total_days)) filter (where l.status = 'requested'), 0)
    into v_disfrutados, v_programados, v_pendientes
    from public.leave_requests l join public.leave_types lt on lt.id = l.leave_type_id
   where l.employment_id = p_employment and lt.legal_class = 'vacaciones';
  return jsonb_build_object(
    'fecha', p_fecha, 'dias_por_anio', v_por_anio, 'dias_servicio', v_servicio, 'dias_suspension', v_lnr,
    'causados', v_causados, 'disfrutados', v_disfrutados, 'programados', v_programados, 'pendientes_aprobacion', v_pendientes,
    'disponibles', round(v_causados - v_disfrutados - v_programados - v_pendientes, 2));
end;
$$;
revoke all on function public.fn_hr_vacaciones_saldo_interno(uuid, date) from public, anon, authenticated;
grant execute on function public.fn_hr_vacaciones_saldo_interno(uuid, date) to service_role;

create or replace function public.fn_hr_vacaciones_saldo(p_actor uuid, p_org integer, p_employment uuid, p_fecha date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from public.employments e where e.id = p_employment and e.organization_id = p_org) then
    raise exception 'hr: el vínculo no existe' using errcode = 'P0002';
  end if;
  if not (public.fn_hr_vinculo_es_del_actor(p_actor, p_employment)
          or public.fn_hr_puede_actor(p_actor, p_org, 'hr.leaves.view')
          or public.fn_hr_puede_actor(p_actor, p_org, 'hr.leaves.approve')
          or p_employment in (select public.fn_hr_equipo_empleos_actor(p_actor, 'hr.employees.view_team'))) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  return public.fn_hr_vacaciones_saldo_interno(p_employment, coalesce(p_fecha, public.fn_today_for(p_org, null)));
end;
$$;
revoke all on function public.fn_hr_vacaciones_saldo(uuid, integer, uuid, date) from public, anon, authenticated;
grant execute on function public.fn_hr_vacaciones_saldo(uuid, integer, uuid, date) to service_role;

-- 9. Solicitar y cancelar --------------------------------------------------------------------
create or replace function public.fn_hr_ausencia_solicitar(p_actor uuid, p_org integer, p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_emp uuid := nullif(p_datos->>'employment_id', '')::uuid;
  e public.employments;
  t public.leave_types;
  aj public.hr_attendance_settings;
  v_desde date := (p_datos->>'desde')::date;
  v_hasta date := (p_datos->>'hasta')::date;
  v_medio_ini boolean := coalesce((p_datos->>'medio_dia_inicio')::boolean, false);
  v_medio_fin boolean := coalesce((p_datos->>'medio_dia_fin')::boolean, false);
  v_aprobador boolean := public.fn_hr_puede_actor(p_actor, p_org, 'hr.leaves.approve');
  v_propio boolean;
  v_total numeric;
  v_habiles numeric;
  v_saldo jsonb;
  v_lim numeric;
  v_estado text := 'requested';
  v_id uuid;
  v_inst uuid;
  v_cruces jsonb := '[]'::jsonb;
  v_salud jsonb := case when jsonb_typeof(p_datos->'salud') = 'object' then p_datos->'salud' end;
begin
  if p_actor is null or not exists (select 1 from public.organization_members om
                                     where om.user_id = p_actor and om.organization_id = p_org and om.is_active) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if v_emp is null then
    select e2.id into v_emp from public.employments e2
      left join public.organization_members om on om.id = e2.organization_member_id
      left join public.hr_people p on p.id = e2.person_id
     where e2.organization_id = p_org and e2.status = 'active' and (om.user_id = p_actor or p.user_id = p_actor)
     order by e2.hire_date desc nulls last, e2.created_at desc limit 1;
  end if;
  select * into e from public.employments where id = v_emp and organization_id = p_org;
  if e.id is null then
    raise exception 'sin_vinculo_activo' using errcode = '42501';
  end if;
  v_propio := public.fn_hr_vinculo_es_del_actor(p_actor, e.id);
  if not (v_propio or v_aprobador) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;

  perform public.fn_hr_tipos_ausencia_asegurar(p_org);
  select * into t from public.leave_types lt
   where lt.organization_id = p_org and lt.is_active
     and (lt.id::text = coalesce(p_datos->>'tipo_id', '') or lt.code = coalesce(p_datos->>'tipo', ''))
   limit 1;
  if t.id is null then
    raise exception 'tipo_invalido: el tipo de ausencia no existe' using errcode = '22023';
  end if;
  if v_desde is null or v_hasta is null or v_hasta < v_desde or v_hasta - v_desde > 540 then
    raise exception 'fechas_invalidas: de 1 a 541 días' using errcode = '22023';
  end if;
  if exists (select 1 from public.leave_requests l
              where l.employment_id = e.id and l.status in ('requested', 'approved', 'taken')
                and l.start_date <= v_hasta and l.end_date >= v_desde) then
    raise exception 'ausencia_cruzada: ya hay otra ausencia en esas fechas' using errcode = '23P01';
  end if;

  aj := public.fn_hr_ajustes_asistencia(e.id);
  v_total := (v_hasta - v_desde + 1) - case when v_medio_ini then 0.5 else 0 end
             - case when v_medio_fin and v_hasta <> v_desde then 0.5 else 0 end;
  v_habiles := greatest(0, public.fn_hr_dias_habiles(p_org, v_desde, v_hasta, e.branch_id, aj.dias_laborables)
             - case when v_medio_ini then 0.5 else 0 end
             - case when v_medio_fin and v_hasta <> v_desde then 0.5 else 0 end);

  if t.legal_class = 'vacaciones' then
    if v_habiles <= 0 then
      raise exception 'sin_dias_habiles: en esas fechas no hay días hábiles' using errcode = '22023';
    end if;
    v_saldo := public.fn_hr_vacaciones_saldo_interno(e.id, v_desde);
    if (v_saldo->>'disponibles')::numeric < v_habiles then
      raise exception 'saldo_insuficiente: tienes % días disponibles y pides %', v_saldo->>'disponibles', v_habiles
        using errcode = '22023';
    end if;
  elsif t.legal_class in ('maternidad', 'paternidad') then
    v_lim := 7 * public.fn_hr_parametro(p_org, case t.legal_class when 'maternidad' then 'licencia_maternidad_semanas'
                                                                   else 'licencia_paternidad_semanas' end, v_desde);
    if v_total > v_lim then
      raise exception 'supera_duracion_legal: la licencia es de % días', v_lim using errcode = '22023';
    end if;
  elsif t.legal_class = 'luto' then
    begin
      v_lim := public.fn_hr_parametro(p_org, 'licencia_luto_dias_habiles', v_desde);
    exception when others then
      v_lim := null;  -- por confirmar: no limita
    end;
    if v_lim is not null and v_habiles > v_lim then
      raise exception 'supera_duracion_legal: la licencia es de % días hábiles', v_lim using errcode = '22023';
    end if;
  end if;
  if t.max_consecutive_days is not null and v_total > t.max_consecutive_days then
    raise exception 'supera_maximo_del_tipo: máximo % días seguidos', t.max_consecutive_days using errcode = '22023';
  end if;
  if coalesce(t.min_notice_days, 0) > 0 and not v_aprobador
     and v_desde - public.fn_today_for(p_org, e.branch_id) < t.min_notice_days then
    raise exception 'preaviso_insuficiente: este tipo pide % días de aviso', t.min_notice_days using errcode = '22023';
  end if;

  -- RR. HH. registra directamente las de ley con soporte (incapacidades, maternidad, paternidad, luto).
  if v_aprobador and not v_propio and t.legal_class in ('incapacidad_comun', 'incapacidad_laboral', 'maternidad', 'paternidad', 'luto') then
    v_estado := 'approved';
  end if;

  insert into public.leave_requests
    (organization_id, employment_id, leave_type_id, start_date, end_date, start_half_day, end_half_day, half_day_period,
     total_days, business_days, reason, status, reviewed_by, reviewed_at, document_id, extends_leave_id, metadata)
  values
    (p_org, e.id, t.id, v_desde, v_hasta, v_medio_ini, v_medio_fin, nullif(p_datos->>'medio_dia_jornada', ''),
     v_total, v_habiles,
     case when t.data_group = 'salud' then null else left(nullif(btrim(coalesce(p_datos->>'motivo', '')), ''), 1000) end,
     v_estado,
     case when v_estado = 'approved' then p_actor end, case when v_estado = 'approved' then now() end,
     nullif(p_datos->>'documento_id', '')::uuid, nullif(p_datos->>'prorroga_de', '')::uuid,
     jsonb_build_object('registrado_por', p_actor, 'canal', case when v_propio then 'empleado' else 'rrhh' end))
  returning id into v_id;

  if t.data_group = 'salud' and v_salud is not null then
    insert into public.hr_leave_health_details (leave_request_id, organization_id, diagnosis_code, diagnosis_text, issuer, origin, notes, created_by)
    values (v_id, p_org, nullif(upper(btrim(coalesce(v_salud->>'diagnostico_codigo', ''))), ''),
            left(nullif(btrim(coalesce(v_salud->>'diagnostico', '')), ''), 500),
            left(nullif(btrim(coalesce(v_salud->>'entidad', '')), ''), 200),
            case when t.legal_class = 'incapacidad_laboral' then 'laboral' else 'comun' end,
            left(nullif(btrim(coalesce(v_salud->>'notas', coalesce(p_datos->>'motivo', ''))), ''), 1000),
            p_actor);
  end if;

  -- Cruces del equipo: mismo jefe o misma área, con vacaciones en las mismas fechas.
  if t.legal_class = 'vacaciones' then
    select coalesce(jsonb_agg(jsonb_build_object('employment_id', o.id, 'nombre', public.fn_hr_nombre_persona(o.person_id),
                                                 'desde', l.start_date, 'hasta', l.end_date, 'estado', l.status)), '[]'::jsonb)
      into v_cruces
      from public.leave_requests l
      join public.employments o on o.id = l.employment_id
      join public.leave_types lt on lt.id = l.leave_type_id
     where o.organization_id = p_org and o.id <> e.id and lt.legal_class = 'vacaciones'
       and l.status in ('requested', 'approved', 'taken') and l.start_date <= v_hasta and l.end_date >= v_desde
       and ((e.manager_id is not null and o.manager_id = e.manager_id)
            or (e.department_id is not null and o.department_id = e.department_id));
  end if;

  if v_estado = 'requested' then
    begin
      v_inst := public.fn_hr_aprobacion_iniciar(
        p_org, 'ausencia', 'leave_requests', v_id, e.id,
        case when v_propio then p_actor else public.fn_hr_usuario_de_empleo(e.id) end,
        jsonb_build_object('dias', case when t.counts_days = 'habiles' then v_habiles else v_total end,
                           'tipo', t.code, 'clase', case when t.data_group = 'salud' then 'incapacidad' else t.legal_class end,
                           'desde', v_desde, 'hasta', v_hasta, 'cruces_equipo', jsonb_array_length(v_cruces),
                           'branch_id', e.branch_id, 'department_id', e.department_id, 'position_id', e.position_id));
    exception when sqlstate '22023' then
      v_inst := null;
    end;
    update public.leave_requests set approval_instance_id = v_inst where id = v_id;
  end if;

  return jsonb_build_object('id', v_id, 'estado', v_estado, 'tipo', t.code, 'dias_calendario', v_total, 'dias_habiles', v_habiles,
                            'saldo', v_saldo, 'cruces_equipo', v_cruces, 'aprobacion_id', v_inst);
end;
$$;
revoke all on function public.fn_hr_ausencia_solicitar(uuid, integer, jsonb) from public, anon, authenticated;
grant execute on function public.fn_hr_ausencia_solicitar(uuid, integer, jsonb) to service_role;

create or replace function public.fn_hr_ausencia_cancelar(p_actor uuid, p_org integer, p_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  l public.leave_requests;
  v_aprobador boolean := public.fn_hr_puede_actor(p_actor, p_org, 'hr.leaves.approve');
begin
  select * into l from public.leave_requests where id = p_id and organization_id = p_org for update;
  if l.id is null then
    raise exception 'hr: la ausencia no existe' using errcode = 'P0002';
  end if;
  if not (v_aprobador or public.fn_hr_vinculo_es_del_actor(p_actor, l.employment_id)) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if not (l.status = 'requested'
          or (l.status = 'approved' and (v_aprobador or l.start_date > public.fn_today_for(p_org, null)))) then
    raise exception 'ausencia_no_cancelable: ya empezó o ya se cerró' using errcode = '55000';
  end if;
  perform public.fn_hr_aprobacion_anular_interna(l.approval_instance_id, 'ausencia_cancelada');
  update public.leave_requests
     set status = 'cancelled', cancelled_by = p_actor, cancelled_at = now(),
         cancellation_reason = left(nullif(btrim(coalesce(p_motivo, '')), ''), 500)
   where id = l.id;
  return jsonb_build_object('id', l.id, 'estado', 'cancelled');
end;
$$;
revoke all on function public.fn_hr_ausencia_cancelar(uuid, integer, uuid, text) from public, anon, authenticated;
grant execute on function public.fn_hr_ausencia_cancelar(uuid, integer, uuid, text) to service_role;

-- 10. Consecuencia de la aprobación (se conservan las ramas anteriores) --------------------
create or replace function public.fn_hr_aprobacion_al_cerrar(p_inst uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inst public.hr_approval_instances;
  v_ultimo uuid;
  v_ev uuid;
  v_estado text;
  v_nov public.hr_attendance_novelties;
begin
  select * into v_inst from public.hr_approval_instances where id = p_inst;
  if not found or v_inst.status = 'pendiente' then return; end if;
  v_estado := case v_inst.status when 'aprobada' then 'aprobado' when 'rechazada' then 'rechazado' else 'anulado' end;
  select s.decided_by into v_ultimo from public.hr_approval_steps s
   where s.instance_id = p_inst and s.status in ('aprobado','rechazado')
   order by s.step_order desc limit 1;
  if v_inst.subject_table = 'hr_employment_events' then
    -- Todos los eventos de la solicitud (cargo + salario enlazados): juntos.
    update public.hr_employment_events ev
       set status = v_estado,
           approved_by = case when v_inst.status = 'aprobada' then v_ultimo else ev.approved_by end,
           approved_at = case when v_inst.status = 'aprobada' then now() else ev.approved_at end
     where ev.approval_instance_id = p_inst and ev.status = 'pendiente';
    if v_inst.status = 'aprobada' then
      for v_ev in select ev.id from public.hr_employment_events ev where ev.approval_instance_id = p_inst order by ev.created_at loop
        perform public.fn_hr_aplicar_evento(v_ev);
      end loop;
    end if;
  elsif v_inst.subject_table = 'hr_bank_account_requests' then
    update public.hr_bank_account_requests set status = v_estado
     where id = v_inst.subject_id and approval_instance_id = p_inst and status = 'pendiente';
    if v_inst.status = 'aprobada' then
      perform public.fn_hr_banco_aplicar_solicitud(v_inst.subject_id);
    end if;
  elsif v_inst.subject_table = 'hr_attendance_novelties' then
    -- ADR-002 §4: horas extra se pagan; tardanza, salida o ausencia quedan justificadas; el cambio de turno se aplica.
    update public.hr_attendance_novelties n
       set status = case v_inst.status when 'aprobada' then 'aprobada' when 'rechazada' then 'rechazada' else 'anulada' end,
           decided_at = now()
     where n.id = v_inst.subject_id and n.approval_instance_id = p_inst and n.status = 'pendiente'
     returning * into v_nov;
    if v_nov.id is not null and v_nov.kind = 'cambio_turno' and v_inst.status = 'aprobada' then
      perform public.fn_hr_cambio_turno_aplicar(v_nov.id, v_ultimo);
    end if;
  elsif v_inst.subject_table = 'leave_requests' then
    -- ADR-002 §5 y §6: vacaciones, licencias e incapacidades.
    update public.leave_requests
       set status = case v_inst.status when 'aprobada' then 'approved' when 'rechazada' then 'rejected' else 'cancelled' end,
           reviewed_by = v_ultimo, reviewed_at = now()
     where id = v_inst.subject_id and approval_instance_id = p_inst and status = 'requested';
  end if;
end;
$$;
revoke all on function public.fn_hr_aprobacion_al_cerrar(uuid) from public, anon, authenticated;
grant execute on function public.fn_hr_aprobacion_al_cerrar(uuid) to service_role;

-- 11. Lo que ve el equipo, el detalle de salud y los tramos de pago -----------------------
create or replace function public.fn_hr_ausencias_equipo(p_actor uuid, p_org integer, p_desde date, p_hasta date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_todo boolean := public.fn_hr_puede_actor(p_actor, p_org, 'hr.leaves.view') or public.fn_hr_puede_actor(p_actor, p_org, 'hr.leaves.approve');
  v_salud boolean := public.fn_hr_puede_actor(p_actor, p_org, 'hr.data.salud.view');
begin
  if p_actor is null or not exists (select 1 from public.organization_members om
                                     where om.user_id = p_actor and om.organization_id = p_org and om.is_active) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde or p_hasta - p_desde > 370 then
    raise exception 'rango_invalido' using errcode = '22023';
  end if;
  return coalesce((
    select jsonb_agg(x order by x->>'desde', x->>'nombre')
      from (
        select jsonb_build_object(
                 'id', l.id, 'employment_id', l.employment_id, 'nombre', public.fn_hr_nombre_persona(e.person_id),
                 'desde', l.start_date, 'hasta', l.end_date, 'estado', l.status,
                 -- Salud: fuera de quien tiene el grupo en toda la organización y del titular, solo «incapacidad».
                 'tipo', case when lt.data_group = 'salud' and not (v_todo and v_salud) and not propio then null else lt.code end,
                 'clase', case when lt.data_group = 'salud' and not (v_todo and v_salud) and not propio then 'incapacidad' else lt.legal_class end,
                 'etiqueta', case when lt.data_group = 'salud' and not (v_todo and v_salud) and not propio then 'Ausente por incapacidad' else lt.name end) as x
          from (select l0.*, public.fn_hr_vinculo_es_del_actor(p_actor, l0.employment_id) as propio from public.leave_requests l0
                 where l0.organization_id = p_org and l0.status in ('requested', 'approved', 'taken')
                   and l0.start_date <= p_hasta and l0.end_date >= p_desde) l
          join public.employments e on e.id = l.employment_id
          join public.leave_types lt on lt.id = l.leave_type_id
         where v_todo or l.propio
            or l.employment_id in (select public.fn_hr_equipo_empleos_actor(p_actor, 'hr.employees.view_team'))
      ) s), '[]'::jsonb);
end;
$$;
revoke all on function public.fn_hr_ausencias_equipo(uuid, integer, date, date) from public, anon, authenticated;
grant execute on function public.fn_hr_ausencias_equipo(uuid, integer, date, date) to service_role;

create or replace function public.fn_hr_ausencia_detalle_salud(p_actor uuid, p_org integer, p_id uuid,
                                                               p_ip text default null, p_ua text default null, p_ruta text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  l public.leave_requests;
  lt public.leave_types;
  e public.employments;
  h public.hr_leave_health_details;
begin
  select * into l from public.leave_requests where id = p_id and organization_id = p_org;
  if l.id is null then
    raise exception 'hr: la ausencia no existe' using errcode = 'P0002';
  end if;
  select * into lt from public.leave_types where id = l.leave_type_id;
  if lt.data_group is distinct from 'salud' then
    raise exception 'ausencia_sin_detalle_de_salud' using errcode = '22023';
  end if;
  select * into e from public.employments where id = l.employment_id;
  if not (public.fn_hr_vinculo_es_del_actor(p_actor, l.employment_id)
          or public.fn_hr_actor_puede_grupo(p_actor, p_org, e.person_id, 'salud', 'ver')) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  select * into h from public.hr_leave_health_details where leave_request_id = l.id;
  perform public.fn_hr_registrar_acceso_interno(p_actor, p_org, e.person_id, l.employment_id, 'salud', 'ver', p_ip, p_ua, p_ruta,
            jsonb_build_object('campos', jsonb_build_array('diagnostico', 'entidad', 'soporte'), 'ausencia', l.id));
  return jsonb_build_object('id', l.id, 'tipo', lt.code, 'clase', lt.legal_class, 'desde', l.start_date, 'hasta', l.end_date,
                            'diagnostico_codigo', h.diagnosis_code, 'diagnostico', h.diagnosis_text, 'entidad', h.issuer,
                            'origen', h.origin, 'notas', h.notes, 'documento_id', l.document_id, 'prorroga_de', l.extends_leave_id);
end;
$$;
revoke all on function public.fn_hr_ausencia_detalle_salud(uuid, integer, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.fn_hr_ausencia_detalle_salud(uuid, integer, uuid, text, text, text) to service_role;

-- Tramos de pago: incapacidades por días de la cadena de prórrogas; licencias por clase.
create or replace function public.fn_hr_ausencia_tramos_pago(p_org integer, p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  l public.leave_requests;
  lt public.leave_types;
  v_prev uuid;
  v_inicio date;
  v_offset integer := 0;
  v_tabla jsonb;
  v_tramo jsonb;
  v_ini integer;
  v_fin integer;
  v_a integer;
  v_b integer;
  v_out jsonb := '[]'::jsonb;
  v_pago jsonb;
  v_n integer := 0;
begin
  select * into l from public.leave_requests where id = p_id and organization_id = p_org;
  if l.id is null then
    return '[]'::jsonb;
  end if;
  select * into lt from public.leave_types where id = l.leave_type_id;
  if lt.legal_class in ('incapacidad_comun', 'incapacidad_laboral') then
    v_inicio := l.start_date;
    v_prev := l.extends_leave_id;
    while v_prev is not null and v_n < 100 loop
      select r.extends_leave_id, r.start_date, v_offset + (r.end_date - r.start_date + 1)
        into v_prev, v_inicio, v_offset
        from public.leave_requests r where r.id = v_prev;
      v_n := v_n + 1;
    end loop;
    v_tabla := public.fn_hr_parametro_json(p_org, 'incapacidad_tramos', v_inicio)
               -> case when lt.legal_class = 'incapacidad_laboral' then 'laboral' else 'comun' end;
    v_ini := v_offset + 1;
    v_fin := v_offset + (l.end_date - l.start_date + 1);
    for v_tramo in select value from jsonb_array_elements(coalesce(v_tabla, '[]'::jsonb)) loop
      v_a := greatest(v_ini, (v_tramo->>'desde_dia')::integer);
      v_b := least(v_fin, coalesce(nullif(v_tramo->>'hasta_dia', '')::integer, v_fin));
      if v_a <= v_b then
        v_out := v_out || jsonb_build_object('desde', l.start_date + (v_a - v_ini), 'hasta', l.start_date + (v_b - v_ini),
                                             'dias', v_b - v_a + 1, 'dia_de_la_incapacidad', v_a,
                                             'paga', v_tramo->>'paga', 'fraccion', (v_tramo->>'fraccion')::numeric,
                                             'piso', v_tramo->>'piso');
      end if;
    end loop;
    return v_out;
  end if;
  begin
    v_pago := public.fn_hr_parametro_json(p_org, 'licencias_pago', l.start_date) -> lt.legal_class;
  exception when others then
    v_pago := null;
  end;
  return jsonb_build_array(jsonb_build_object('desde', l.start_date, 'hasta', l.end_date, 'dias', l.total_days,
                                              'paga', v_pago->>'paga', 'fraccion', coalesce((v_pago->>'fraccion')::numeric, case when lt.paid then 1 else 0 end)));
end;
$$;
revoke all on function public.fn_hr_ausencia_tramos_pago(integer, uuid) from public, anon, authenticated;
grant execute on function public.fn_hr_ausencia_tramos_pago(integer, uuid) to service_role;

-- 12. Lo que consume la nómina (fase 3) ------------------------------------------------------
create or replace function public.fn_hr_jornada_para_nomina(p_actor uuid, p_org integer, p_desde date, p_hasta date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_umbral numeric;
begin
  if not (public.fn_hr_puede_actor(p_actor, p_org, 'hr.payroll.view')
          or public.fn_hr_puede_actor(p_actor, p_org, 'hr.payroll.process')
          or public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.view')) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde or p_hasta - p_desde > 62 then
    raise exception 'rango_invalido: el rango va de 1 a 63 días' using errcode = '22023';
  end if;
  v_umbral := public.fn_hr_parametro(p_org, 'dominical_habitual_umbral_dias', p_hasta);

  return jsonb_build_object(
    'desde', p_desde, 'hasta', p_hasta,
    -- Horas de días «lista para nómina»; la extra, limitada a lo aprobado.
    'horas', coalesce((
      select jsonb_agg(jsonb_build_object('employment_id', h.employment_id, 'categoria', h.category, 'recargo', h.surcharge,
                                          'divisor', h.hour_divisor, 'minutos', h.minutos) order by h.employment_id, h.category, h.surcharge)
        from (
          select l.employment_id, l.category, l.surcharge, l.hour_divisor,
                 sum(case when l.category like 'extra%'
                          then round(l.minutes * least(1, coalesce(ap.aprobadas, 0)::numeric / nullif(ex.extra, 0)))
                          else l.minutes end)::integer as minutos
            from public.hr_timesheet_lines l
            join public.timesheets t on t.id = l.timesheet_id and t.status in ('approved', 'locked')
            left join (select n.timesheet_id, sum(n.minutes) as aprobadas from public.hr_attendance_novelties n
                        where n.organization_id = p_org and n.kind = 'horas_extra' and n.status = 'aprobada'
                        group by n.timesheet_id) ap on ap.timesheet_id = t.id
            left join (select x.timesheet_id, sum(x.minutes) as extra from public.hr_timesheet_lines x
                        where x.organization_id = p_org and x.category like 'extra%'
                        group by x.timesheet_id) ex on ex.timesheet_id = t.id
           where l.organization_id = p_org and l.local_date between p_desde and p_hasta
           group by 1, 2, 3, 4
        ) h where h.minutos > 0), '[]'::jsonb),
    -- Tardanzas, salidas tempranas y ausencias sin justificar (rechazadas): se descuentan.
    'descuentos', coalesce((
      select jsonb_agg(jsonb_build_object('employment_id', n.employment_id, 'tipo', n.kind, 'fecha', n.work_date, 'minutos', n.minutes)
                       order by n.employment_id, n.work_date)
        from public.hr_attendance_novelties n
       where n.organization_id = p_org and n.kind in ('tardanza', 'salida_temprana', 'ausencia') and n.status = 'rechazada'
         and n.work_date between p_desde and p_hasta), '[]'::jsonb),
    -- Ausencias aprobadas con su tramo de pago (incapacidades por días de la cadena).
    'ausencias', coalesce((
      select jsonb_agg(jsonb_build_object('id', l.id, 'employment_id', l.employment_id, 'tipo', lt.code, 'clase', lt.legal_class,
                                          'pagada', lt.paid, 'desde', l.start_date, 'hasta', l.end_date,
                                          'desde_en_periodo', greatest(l.start_date, p_desde), 'hasta_en_periodo', least(l.end_date, p_hasta),
                                          'dias_habiles', l.business_days, 'dias_calendario', l.total_days,
                                          'tramos', public.fn_hr_ausencia_tramos_pago(p_org, l.id))
                       order by l.employment_id, l.start_date)
        from public.leave_requests l join public.leave_types lt on lt.id = l.leave_type_id
       where l.organization_id = p_org and l.status in ('approved', 'taken')
         and l.start_date <= p_hasta and l.end_date >= p_desde), '[]'::jsonb),
    -- Días de descanso obligatorio trabajados por mes (ocasional u habitual, CST 179).
    'dominicales', coalesce((
      select jsonb_agg(jsonb_build_object('employment_id', d.employment_id, 'mes', d.mes, 'dias', d.dias,
                                          'habitual', d.dias >= v_umbral))
        from (select l.employment_id, to_char(l.local_date, 'YYYY-MM') as mes, count(distinct l.local_date) as dias
                from public.hr_timesheet_lines l
                join public.timesheets t on t.id = l.timesheet_id and t.status in ('approved', 'locked')
               where l.organization_id = p_org and l.local_date between date_trunc('month', p_desde)::date and p_hasta
                 and (l.category like 'dom%' or l.category like 'extra_dom%')
               group by 1, 2) d), '[]'::jsonb),
    -- Días del período que todavía no están listos: la nómina no debe cerrar sin ellos.
    'dias_no_listos', coalesce((
      select jsonb_agg(jsonb_build_object('employment_id', t.employment_id, 'fecha', t.work_date, 'estado', t.status)
                       order by t.employment_id, t.work_date)
        from public.timesheets t
       where t.organization_id = p_org and t.work_date between p_desde and p_hasta
         and t.status not in ('approved', 'locked')), '[]'::jsonb));
end;
$$;
revoke all on function public.fn_hr_jornada_para_nomina(uuid, integer, date, date) from public, anon, authenticated;
grant execute on function public.fn_hr_jornada_para_nomina(uuid, integer, date, date) to service_role;

-- 13. Ausencias sin aviso: turno publicado sin marcaciones ni ausencia aprobada ---------
create or replace function public.fn_hr_detectar_ausencias(p_fecha date default null)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  v_id uuid;
  n integer := 0;
begin
  for r in
    select s.id, s.organization_id, s.employment_id, s.work_date, s.planned_minutes
      from public.shift_assignments s
      join public.employments e on e.id = s.employment_id and e.status = 'active'
     where (case when p_fecha is null
                 then s.work_date between current_date - 2 and current_date
                      and s.work_date = public.fn_today_for(s.organization_id, s.branch_id) - 1
                 else s.work_date = p_fecha end)
       and not s.is_draft and not s.is_rest_day
       and coalesce(s.status, 'scheduled') not in ('cancelled', 'swapped')
       and not exists (select 1 from public.attendance_events a where a.employment_id = s.employment_id and a.work_date = s.work_date)
       and not exists (select 1 from public.leave_requests l
                        where l.employment_id = s.employment_id and l.status in ('requested', 'approved', 'taken')
                          and s.work_date between l.start_date and l.end_date)
       and not exists (select 1 from public.hr_attendance_novelties x
                        where x.employment_id = s.employment_id and x.work_date = s.work_date
                          and x.kind = 'ausencia' and x.status <> 'anulada')
       and not ('sin_marcacion' = any ((public.fn_hr_ajustes_asistencia(s.employment_id)).mecanismos))
  loop
    insert into public.hr_attendance_novelties (organization_id, employment_id, work_date, kind, minutes, origin, requested_by, detail)
    values (r.organization_id, r.employment_id, r.work_date, 'ausencia', r.planned_minutes, 'automatica',
            public.fn_hr_usuario_de_empleo(r.employment_id), jsonb_build_object('asignacion_id', r.id))
    returning id into v_id;
    perform public.fn_hr_novedad_iniciar_aprobacion(v_id);
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function public.fn_hr_detectar_ausencias(date) from public, anon, authenticated;
grant execute on function public.fn_hr_detectar_ausencias(date) to service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'hrm-detectar-ausencias') then
    perform cron.unschedule('hrm-detectar-ausencias');
  end if;
  -- 11:30 UTC: después de la medianoche en todas las zonas de América.
  perform cron.schedule('hrm-detectar-ausencias', '30 11 * * *', 'select public.fn_hr_detectar_ausencias();');
end;
$$;
