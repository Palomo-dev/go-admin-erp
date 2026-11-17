-- HRM · Marcación M0 · paso 4: lo aprobado el 2026-11-16 (plan §6 y §12).
-- 1. Nombres del plan: hr_clock_method_exceptions (excepción temporal que pasa por el
--    motor de aprobaciones) y hr_qr_codes_used (QR de un solo uso). Las tablas del paso 1
--    con otro nombre se crearon hoy en esta misma fase y tienen 0 filas: se reemplazan.
-- 2. R1 en la base: attendance_events no se edita ni se borra; nadie escribe en ella
--    desde el navegador. Toda corrección es un ajuste con motivo y aprobación.
-- 3. R2: el empleado reclama una marca concreta (ajuste ligado a la marca, origen
--    empleado_reclamo); la foto de evidencia queda retenida mientras el caso esté abierto.
-- 4. R3: una regla de horas extra o de novedades de asistencia no puede quitar al jefe directo.

-- 1. Nombres del plan --------------------------------------------------------------------
drop table if exists public.hr_marcacion_excepciones;
drop table if exists public.hr_qr_usos;

create table if not exists public.hr_clock_method_exceptions (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  employment_id uuid not null references public.employments(id),
  method text not null check (method in ('celular_ubicacion', 'qr', 'nfc_etiqueta', 'carne', 'pin', 'rostro', 'huella')),
  valid_from date not null,
  valid_to date not null,
  reason text not null check (char_length(btrim(reason)) between 5 and 500),
  status text not null default 'pendiente' check (status in ('pendiente', 'aprobada', 'rechazada', 'anulada')),
  requested_by uuid not null references auth.users(id),
  approval_instance_id uuid references public.hr_approval_instances(id),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  check (valid_to >= valid_from and valid_to <= valid_from + 90)
);
comment on table public.hr_clock_method_exceptions is
  'Marcación M0 (D14, Figma 20.27.11). Método que RR. HH. habilita a una persona por unas fechas (p. ej., una lesión le impide usar la huella). Pasa por el motor de aprobaciones (tipo excepcion_marcacion); solo cuenta aprobada, sin revocar y dentro de las fechas (día de la sede). Tope 90 días.';
create index if not exists hr_clock_method_exceptions_vinculo_idx on public.hr_clock_method_exceptions (employment_id, valid_to desc);
create index if not exists hr_clock_method_exceptions_org_idx on public.hr_clock_method_exceptions (organization_id, created_at desc);
drop trigger if exists trg_hr_clock_method_exceptions_org on public.hr_clock_method_exceptions;
create trigger trg_hr_clock_method_exceptions_org before insert on public.hr_clock_method_exceptions
  for each row execute function public.fn_hr_org_del_vinculo();
alter table public.hr_clock_method_exceptions enable row level security;
revoke all on public.hr_clock_method_exceptions from anon;
revoke insert, update, delete, truncate on public.hr_clock_method_exceptions from authenticated;
drop policy if exists hr_clock_method_exceptions_select on public.hr_clock_method_exceptions;
create policy hr_clock_method_exceptions_select on public.hr_clock_method_exceptions for select to authenticated
  using (employment_id in (select public.fn_hr_mis_empleos())
         or organization_id in (select public.fn_hr_orgs_con_permiso('hr.attendance.view')));

create table if not exists public.hr_qr_codes_used (
  time_clock_id uuid not null references public.time_clocks(id) on delete cascade,
  time_step bigint not null,
  code_n integer not null check (code_n between 0 and 999),
  employment_id uuid not null references public.employments(id) on delete cascade,
  attendance_event_id uuid references public.attendance_events(id) on delete set null,
  used_at timestamptz not null default now(),
  primary key (time_clock_id, time_step, code_n)
);
comment on table public.hr_qr_codes_used is
  'Marcación M0 (D9). Código del QR ya usado: paso de 30 s y número del código dentro del paso (la pantalla pasa al siguiente en cuanto alguien marca, así una fila de personas no espera 30 s). Un código sirve una sola vez. Se purga a las 24 h.';
alter table public.hr_qr_codes_used enable row level security;
revoke all on public.hr_qr_codes_used from public, anon, authenticated;

-- Vocabulario del plan: «carne» (carné NFC o QR) en la sede, en la excepción y en la marca.
alter table public.hr_branch_clock_methods drop constraint if exists hr_branch_clock_methods_method_check;
alter table public.hr_branch_clock_methods add constraint hr_branch_clock_methods_method_check
  check (method in ('celular_ubicacion', 'qr', 'nfc_etiqueta', 'carne', 'pin', 'rostro', 'huella'));
alter table public.attendance_events drop constraint if exists attendance_events_method_check;
alter table public.attendance_events add constraint attendance_events_method_check
  check (method is null or method in ('celular_ubicacion', 'qr', 'nfc_etiqueta', 'carne', 'carne_nfc', 'carne_qr',
                                      'pin', 'rostro', 'huella', 'remoto', 'manual'));

-- Retención por caso de la foto de evidencia (D5).
alter table public.attendance_events add column if not exists photo_hold boolean not null default false;
comment on column public.attendance_events.photo_hold is
  'Marcación M0 (D5, R2). Verdadero mientras la marca tenga un reclamo o ajuste abierto: la tarea de borrado no toca su foto.';

-- 2. R1: la marca original no se edita ni se borra -----------------------------------------
drop policy if exists attendance_events_insert on public.attendance_events;
drop policy if exists attendance_events_update on public.attendance_events;
drop policy if exists attendance_events_delete on public.attendance_events;
revoke insert, update, delete, truncate on public.attendance_events from anon, authenticated;

create or replace function public.fn_hr_attendance_inmutable()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    -- Solo la cascada al borrar la organización.
    if not exists (select 1 from public.organizations o where o.id = old.organization_id) then
      return old;
    end if;
    raise exception 'marca_inmutable: una marca no se borra; corrígela con un ajuste' using errcode = '42501';
  end if;
  -- Solo columnas técnicas que escribe la base, y solo desde sus funciones.
  if current_user not in ('postgres', 'supabase_admin')
     or (to_jsonb(new) - array['work_date', 'photo_path', 'photo_expires_at', 'photo_hold', 'raw_event_id'])
        is distinct from (to_jsonb(old) - array['work_date', 'photo_path', 'photo_expires_at', 'photo_hold', 'raw_event_id']) then
    raise exception 'marca_inmutable: una marca no se edita; corrígela con un ajuste' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.fn_hr_attendance_inmutable() from public, anon, authenticated;
drop trigger if exists trg_attendance_events_inmutable on public.attendance_events;
create trigger trg_attendance_events_inmutable before update or delete on public.attendance_events
  for each row execute function public.fn_hr_attendance_inmutable();

-- 3. Ajustes ligados a una marca (R1 y R2) -------------------------------------------------
alter table public.timesheet_adjustments add column if not exists attendance_event_id uuid references public.attendance_events(id);
alter table public.timesheet_adjustments add column if not exists origin text not null default 'gestor';
alter table public.timesheet_adjustments add column if not exists claim_kind text;
alter table public.timesheet_adjustments drop constraint if exists timesheet_adjustments_origin_chk;
alter table public.timesheet_adjustments add constraint timesheet_adjustments_origin_chk
  check (origin in ('gestor', 'empleado_reclamo', 'kiosco', 'dispositivo'));
alter table public.timesheet_adjustments drop constraint if exists timesheet_adjustments_claim_kind_chk;
alter table public.timesheet_adjustments add constraint timesheet_adjustments_claim_kind_chk
  check (claim_kind is null or claim_kind in ('hora', 'no_es_mia', 'tipo', 'metodo', 'otro'));
alter table public.timesheet_adjustments drop constraint if exists timesheet_adjustments_adjustment_type_check;
alter table public.timesheet_adjustments add constraint timesheet_adjustments_adjustment_type_check
  check (adjustment_type in ('add_minutes', 'subtract_minutes', 'override_check_in', 'override_check_out', 'add_overtime',
                             'remove_overtime', 'excuse_late', 'other', 'excluir_marca'));
create index if not exists timesheet_adjustments_evento_idx on public.timesheet_adjustments (attendance_event_id)
  where attendance_event_id is not null;
comment on column public.timesheet_adjustments.attendance_event_id is
  'Marcación M0 (R1, R2). La marca que se corrige o se reclama. La marca no cambia: al aprobarse se agrega otra o se excluye (excluir_marca).';

-- La foto se libera cuando no queda ningún caso abierto sobre la marca.
create or replace function public.fn_hr_ajuste_retencion_foto()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.attendance_event_id is null then
    return new;
  end if;
  if new.status = 'pending' then
    update public.attendance_events set photo_hold = true where id = new.attendance_event_id and not photo_hold;
  elsif not exists (select 1 from public.timesheet_adjustments x
                     where x.attendance_event_id = new.attendance_event_id and x.status = 'pending' and x.id <> new.id) then
    update public.attendance_events set photo_hold = false where id = new.attendance_event_id and photo_hold;
  end if;
  return new;
end;
$$;
revoke all on function public.fn_hr_ajuste_retencion_foto() from public, anon, authenticated;
drop trigger if exists trg_timesheet_adjustments_foto on public.timesheet_adjustments;
create trigger trg_timesheet_adjustments_foto after insert or update of status on public.timesheet_adjustments
  for each row execute function public.fn_hr_ajuste_retencion_foto();
-- 4. Parches puntuales a funciones existentes ---------------------------------------------
-- Cada parche reemplaza un fragmento exacto del cuerpo vigente y falla si no lo encuentra
-- (así una versión distinta de la función no se pisa en silencio). CREATE OR REPLACE
-- conserva los permisos de cada función.
create or replace function pg_temp.fn_parchar(p_fn regprocedure, p_viejo text, p_nuevo text)
returns void
language plpgsql
as $$
declare
  v text := pg_get_functiondef(p_fn);
begin
  if position(p_viejo in v) = 0 then
    raise exception 'parche_no_aplica: % no tiene el fragmento esperado', p_fn;
  end if;
  execute replace(v, p_viejo, p_nuevo);
end;
$$;

-- R1: en una actualización (solo columnas técnicas) no se vuelve a validar ni a tocar la marca.
select pg_temp.fn_parchar('public.fn_hr_attendance_validar()',
$a$begin
  select e.organization_id, e.branch_id into v_org, v_branch from public.employments e where e.id = new.employment_id;$a$,
$a$begin
  -- R1 (Marcación M0): una marca no se edita; si llega aquí es una columna técnica.
  if tg_op = 'UPDATE' then
    return new;
  end if;
  select e.organization_id, e.branch_id into v_org, v_branch from public.employments e where e.id = new.employment_id;$a$);

-- QR de un solo uso con la tabla del plan y el código de error del plan.
select pg_temp.fn_parchar('public.fn_hr_marcar(uuid,integer,jsonb,text,text)',
$a$      insert into public.hr_qr_usos (time_clock_id, paso, n, employment_id)
      values (v_reloj.id, v_paso, v_n, v_emp.id)$a$,
$a$      insert into public.hr_qr_codes_used (time_clock_id, time_step, code_n, employment_id)
      values (v_reloj.id, v_paso, v_n, v_emp.id)$a$);
select pg_temp.fn_parchar('public.fn_hr_marcar(uuid,integer,jsonb,text,text)',
$a$raise exception 'qr_usado: $a$, $a$raise exception 'qr_ya_usado: $a$);
select pg_temp.fn_parchar('public.fn_hr_marcar(uuid,integer,jsonb,text,text)',
$a$      delete from public.hr_qr_usos u where u.time_clock_id = v_reloj.id and u.paso < v_paso_ahora - 2880;$a$,
$a$      delete from public.hr_qr_codes_used u where u.time_clock_id = v_reloj.id and u.used_at < now() - interval '24 hours';$a$);
select pg_temp.fn_parchar('public.fn_hr_marcar(uuid,integer,jsonb,text,text)',
$a$  if v_reloj.id is not null then
    update public.time_clocks set last_seen_at = now()$a$,
$a$  if v_paso is not null then
    update public.hr_qr_codes_used set attendance_event_id = v_ev.id
     where time_clock_id = v_reloj.id and time_step = v_paso and code_n = v_n;
  end if;
  if v_reloj.id is not null then
    update public.time_clocks set last_seen_at = now()$a$);
select pg_temp.fn_parchar('public.fn_hr_pantalla_qr_usos(uuid,integer,uuid,bigint)',
$a$(select max(u.n) from public.hr_qr_usos u where u.time_clock_id = c.id and u.paso = p_paso)$a$,
$a$(select max(u.code_n) from public.hr_qr_codes_used u where u.time_clock_id = c.id and u.time_step = p_paso)$a$);

-- Excepciones: solo aprobadas, sin revocar y dentro de las fechas (día de la sede).
select pg_temp.fn_parchar('public.fn_hr_metodos_vinculo(uuid)',
$a$  select coalesce(array_agg(distinct x.metodo), '{}') into v_exc
    from public.hr_marcacion_excepciones x
   where x.employment_id = v_emp.id and x.revocada_at is null
     and x.vigente_desde <= now() and x.vigente_hasta > now();$a$,
$a$  select coalesce(array_agg(distinct x.method), '{}') into v_exc
    from public.hr_clock_method_exceptions x
   where x.employment_id = v_emp.id and x.status = 'aprobada' and x.revoked_at is null
     and public.fn_today_for(v_emp.organization_id, v_emp.branch_id) between x.valid_from and x.valid_to;$a$);
select pg_temp.fn_parchar('public.fn_hr_metodos_vinculo(uuid)',
$a$    'excepciones', to_jsonb(v_exc),$a$,
$a$    'excepciones', to_jsonb(v_exc),
    'excepciones_vigentes', (select coalesce(jsonb_agg(jsonb_build_object('metodo', x.method, 'hasta', x.valid_to) order by x.valid_to), '[]'::jsonb)
                               from public.hr_clock_method_exceptions x
                              where x.employment_id = v_emp.id and x.status = 'aprobada' and x.revoked_at is null
                                and public.fn_today_for(v_emp.organization_id, v_emp.branch_id) between x.valid_from and x.valid_to),$a$);
select pg_temp.fn_parchar('public.fn_hr_marcacion_estado(uuid,integer)',
$a$    'excepciones', coalesce((select jsonb_agg(jsonb_build_object('metodo', x.metodo, 'hasta', x.vigente_hasta) order by x.vigente_hasta)
                               from public.hr_marcacion_excepciones x
                              where x.employment_id = v_emp.id and x.revocada_at is null
                                and x.vigente_desde <= now() and x.vigente_hasta > now()), '[]'::jsonb));$a$,
$a$    'excepciones', coalesce(v_met->'excepciones_vigentes', '[]'::jsonb));$a$);

-- R1/R2: una marca excluida por un ajuste aprobado no cuenta para la jornada (sigue en la base).
select pg_temp.fn_parchar('public.fn_hr_jornada_insumos(uuid,integer,uuid,date)',
$a$    from public.attendance_events ae where ae.employment_id = p_employment and ae.work_date = p_fecha;$a$,
$a$    from public.attendance_events ae where ae.employment_id = p_employment and ae.work_date = p_fecha
     and not exists (select 1 from public.timesheet_adjustments x
                      where x.attendance_event_id = ae.id and x.adjustment_type = 'excluir_marca' and x.status = 'approved');$a$);

-- Una exclusión aprobada se «aplica» sin insertar nada y el día se vuelve a clasificar.
select pg_temp.fn_parchar('public.fn_hr_ajustes_aplicar_interno(integer)',
$a$  end loop;
  return v_out;$a$,
$a$  end loop;
  for r in
    select a.id, t.employment_id, t.work_date
      from public.timesheet_adjustments a
      join public.timesheets t on t.id = a.timesheet_id
      join public.hr_approval_instances i on i.id = a.approval_instance_id and i.status = 'aprobada'
     where a.status = 'approved' and a.adjustment_type = 'excluir_marca' and a.applied_at is null
       and t.status <> 'locked' and (p_org is null or t.organization_id = p_org)
     for update of a skip locked
  loop
    update public.timesheet_adjustments set applied_at = now() where id = r.id;
    v_out := v_out || jsonb_build_object('ajuste_id', r.id, 'employment_id', r.employment_id, 'fecha', r.work_date);
  end loop;
  return v_out;$a$);

-- Excepción de marcación: sin regla la aprueba RR. HH. (nunca quien la pide).
select pg_temp.fn_parchar('public.fn_hr_aprobacion_plan(integer,text,uuid,uuid,jsonb)',
$a$  -- Sin regla: jefe directo y, si no tiene (o es quien pide), RR. HH.$a$,
$a$  -- Excepción temporal de marcación (Marcación M0, D14): sin regla, RR. HH.
  if p_tipo = 'excepcion_marcacion' then
    if cardinality(v_rrhh) > 0 then
      v_pasos := jsonb_build_array(jsonb_build_object('orden', 1, 'tipo', 'rrhh', 'aprobadores', to_jsonb(v_rrhh), 'respaldo', false, 'cargo', null));
    end if;
    return jsonb_build_object('regla', null, 'otras', '[]'::jsonb, 'pasos', v_pasos, 'por_defecto', true,
                              'sin_aprobador', case when jsonb_array_length(v_pasos) = 0 then 1 end);
  end if;

  -- Sin regla: jefe directo y, si no tiene (o es quien pide), RR. HH.$a$);

-- R3: horas extra y novedades de asistencia siempre pasan por el jefe directo.
select pg_temp.fn_parchar('public.fn_hr_regla_guardar(integer,jsonb)',
$a$  if v_id is null then
    select coalesce(max(priority), 0) + 1 into v_prioridad from public.hr_approval_rules$a$,
$a$  -- R3 (Marcación M0): quien tiene jefe, lo tiene como aprobador; sin jefe, el motor pasa a RR. HH.
  if coalesce(p_regla->>'tipo', (select r.request_type from public.hr_approval_rules r where r.id = v_id and r.organization_id = p_org))
       in ('horas_extra', 'novedad_asistencia')
     and not exists (select 1 from jsonb_array_elements(p_regla->'pasos') x where x->>'tipo' = 'jefe_directo') then
    raise exception 'jefe_directo_requerido: las horas extra y las novedades de asistencia siempre pasan por el jefe directo'
      using errcode = '22023';
  end if;
  if v_id is null then
    select coalesce(max(priority), 0) + 1 into v_prioridad from public.hr_approval_rules$a$);

-- Mi asistencia: cada marca con su método y su reclamo (R2, Figma 20.31.4–20.31.8).
select pg_temp.fn_parchar('public.fn_hr_mi_asistencia(uuid,integer,date,date)',
$a$                                   and a.device_info ? 'revisar'))$a$,
$a$                                   and a.device_info ? 'revisar'),
               'metodo_exacto', (select a.method from public.attendance_events a where a.employment_id = v_emp.id and a.work_date = d.dia
                                   and a.event_type = 'check_in' order by a.event_at limit 1),
               'reclamo_abierto', exists (select 1 from public.timesheet_adjustments x
                                           join public.attendance_events a on a.id = x.attendance_event_id
                                          where a.employment_id = v_emp.id and a.work_date = d.dia and x.status = 'pending'),
               'marcas', (select coalesce(jsonb_agg(jsonb_build_object(
                              'id', a.id, 'tipo', a.event_type, 'hora', a.event_at,
                              'metodo', coalesce(a.method, case when a.is_manual_entry or a.source = 'manual' then 'manual'
                                                                when a.work_mode = 'remoto' then 'remoto'
                                                                when a.source = 'qr' then 'qr' when a.source = 'nfc' then 'nfc_etiqueta'
                                                                else 'celular_ubicacion' end),
                              'punto', (select c.name from public.time_clocks c where c.id = a.time_clock_id),
                              'reclamo', (select x.status from public.timesheet_adjustments x where x.attendance_event_id = a.id
                                           order by x.created_at desc limit 1))
                            order by a.event_at), '[]'::jsonb)
                            from public.attendance_events a where a.employment_id = v_emp.id and a.work_date = d.dia))$a$);

-- 5. Ajuste: también sobre una marca concreta (corregir o excluir) y como reclamo ------------
create or replace function public.fn_hr_ajuste_solicitar(p_actor uuid, p_org integer, p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  e public.employments;
  v_emp uuid := nullif(p_datos->>'employment_id', '')::uuid;
  v_fecha date := nullif(p_datos->>'fecha', '')::date;
  v_tipo text := p_datos->>'tipo';
  v_hora timestamptz := nullif(p_datos->>'hora', '')::timestamptz;
  v_motivo text := btrim(coalesce(p_datos->>'motivo', ''));
  v_nota text := nullif(btrim(coalesce(p_datos->>'nota', '')), '');
  v_evento uuid := nullif(p_datos->>'evento_id', '')::uuid;
  v_excluir boolean := coalesce((p_datos->>'excluir')::boolean, false);
  v_origen text := coalesce(nullif(p_datos->>'origen', ''), 'gestor');
  v_que text := nullif(p_datos->>'que', '');
  v_ev public.attendance_events;
  v_ts public.timesheets;
  v_prev timestamptz;
  v_id uuid;
  v_inst uuid;
begin
  -- Sobre una marca: el vínculo, el día y el tipo salen de la marca, nunca del cuerpo.
  if v_evento is not null then
    select * into v_ev from public.attendance_events a where a.id = v_evento and a.organization_id = p_org;
    if v_ev.id is null then
      raise exception 'hr: la marca no existe' using errcode = 'P0002';
    end if;
    v_emp := v_ev.employment_id;
    v_fecha := v_ev.work_date;
    v_tipo := coalesce(v_tipo, v_ev.event_type);
  end if;
  select * into e from public.employments where id = v_emp and organization_id = p_org;
  if not found then
    raise exception 'hr: el vínculo no existe' using errcode = 'P0002';
  end if;
  if not (public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.manage')
          or public.fn_hr_vinculo_es_del_actor(p_actor, v_emp)
          or v_emp in (select public.fn_hr_asistencia_vinculos(p_actor, p_org))) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if v_origen not in ('gestor', 'empleado_reclamo') then
    raise exception 'datos_invalidos: origen' using errcode = '22023';
  end if;
  -- El reclamo es del empleado sobre una marca suya.
  if v_origen = 'empleado_reclamo' and (v_evento is null or not public.fn_hr_vinculo_es_del_actor(p_actor, v_emp)) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if v_que is not null and v_que not in ('hora', 'no_es_mia', 'tipo', 'metodo', 'otro') then
    raise exception 'datos_invalidos: que' using errcode = '22023';
  end if;
  if v_tipo is null or v_tipo not in ('check_in', 'check_out', 'break_start', 'break_end') then
    raise exception 'tipo_invalido' using errcode = '22023';
  end if;
  if v_excluir then
    if v_evento is null then
      raise exception 'datos_invalidos: excluir exige la marca' using errcode = '22023';
    end if;
    v_hora := null;
  elsif v_evento is not null and v_hora is null then
    -- Reclamo sin hora correcta: lo resuelve quien aprueba; no agrega marca.
    null;
  elsif v_fecha is null or v_hora is null or v_hora > now() + interval '5 minutes' or v_hora < now() - interval '62 days' then
    raise exception 'hora_invalida: entre hace 62 días y ahora' using errcode = '22023';
  end if;
  if v_hora is not null and (v_hora > now() + interval '5 minutes' or v_hora < now() - interval '62 days') then
    raise exception 'hora_invalida: entre hace 62 días y ahora' using errcode = '22023';
  end if;
  if v_evento is not null and v_ev.event_at < now() - interval '62 days' then
    raise exception 'marca_antigua: solo se reclaman marcas de los últimos 62 días' using errcode = '22023';
  end if;
  if char_length(v_motivo) not between 5 and 500 or char_length(coalesce(v_nota, '')) > 500 then
    raise exception 'motivo_requerido: de 5 a 500 caracteres' using errcode = '22023';
  end if;

  insert into public.timesheets (organization_id, branch_id, employment_id, work_date)
  values (p_org, e.branch_id, v_emp, v_fecha)
  on conflict (employment_id, work_date) do nothing;
  select * into v_ts from public.timesheets where employment_id = v_emp and work_date = v_fecha for update;
  if v_ts.status = 'locked' then
    raise exception 'jornada_cerrada: el día ya lo consumió la nómina' using errcode = '55000';
  end if;
  if v_evento is not null then
    if exists (select 1 from public.timesheet_adjustments a where a.attendance_event_id = v_evento and a.status = 'pending') then
      raise exception 'ajuste_ya_pendiente' using errcode = '23505';
    end if;
  elsif exists (select 1 from public.timesheet_adjustments a where a.timesheet_id = v_ts.id
                 and a.status = 'pending' and a.event_type = v_tipo and a.attendance_event_id is null) then
    raise exception 'ajuste_ya_pendiente' using errcode = '23505';
  end if;

  select max(a.event_at) into v_prev from public.attendance_events a
   where a.employment_id = v_emp and a.work_date = v_fecha and a.event_type = v_tipo;
  if v_evento is not null then
    v_prev := v_ev.event_at;
  end if;

  insert into public.timesheet_adjustments (timesheet_id, adjustment_type, previous_value, new_value, reason, note,
                                            event_type, event_at, created_by, status, attendance_event_id, origin, claim_kind)
  values (v_ts.id,
          case when v_excluir then 'excluir_marca'
               when v_hora is null then 'other'
               when v_tipo = 'check_in' then 'override_check_in' when v_tipo = 'check_out' then 'override_check_out' else 'other' end,
          v_prev::text, v_hora::text, v_motivo, v_nota,
          case when v_excluir or v_hora is null then null else v_tipo end, v_hora,
          p_actor, 'pending', v_evento, v_origen, v_que)
  returning id into v_id;

  begin
    v_inst := public.fn_hr_aprobacion_iniciar(p_org, 'novedad_asistencia', 'timesheet_adjustments', v_id, v_emp, p_actor,
                jsonb_build_object('novedad', case when v_origen = 'empleado_reclamo' then 'reclamo_marca'
                                                   when v_excluir then 'excluir_marca' else 'ajuste_marca' end,
                                   'fecha', v_fecha, 'evento', v_tipo, 'hora', v_hora, 'marca', v_evento,
                                   'motivo', v_motivo, 'branch_id', e.branch_id, 'department_id', e.department_id,
                                   'position_id', e.position_id));
  exception when sqlstate '22023' then
    v_inst := null;  -- nadie a quien llegue: queda pendiente; nunca se aprueba por omisión
  end;
  update public.timesheet_adjustments set approval_instance_id = v_inst where id = v_id;
  return jsonb_build_object('id', v_id, 'estado', 'pendiente', 'instancia_id', v_inst, 'timesheet_id', v_ts.id,
                            'fecha_trabajo', v_fecha);
end;
$function$;

-- Marca manual de RR. HH.: deja de insertar directo; nace como ajuste con aprobación (R1, D14).
create or replace function public.fn_hr_marcacion_manual(p_actor uuid, p_org integer, p_employment uuid, p_tipo text, p_hora timestamp with time zone, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_branch integer;
  v_r jsonb;
begin
  if not public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.manage') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  select e.branch_id into v_branch from public.employments e where e.id = p_employment and e.organization_id = p_org;
  if not found then
    raise exception 'hr: el vínculo no existe' using errcode = 'P0002';
  end if;
  if p_hora is null then
    raise exception 'hora_invalida: entre hace 62 días y ahora' using errcode = '22023';
  end if;
  v_r := public.fn_hr_ajuste_solicitar(p_actor, p_org, jsonb_build_object(
           'employment_id', p_employment, 'tipo', p_tipo, 'hora', p_hora, 'motivo', p_motivo,
           'fecha', (p_hora at time zone public.fn_timezone_for(p_org, v_branch))::date));
  return jsonb_build_object('ajuste_id', v_r->'id', 'estado', 'pendiente', 'instancia_id', v_r->'instancia_id',
                            'tipo', p_tipo, 'hora', p_hora, 'fecha_trabajo', v_r->'fecha_trabajo');
end;
$function$;

-- 6. Excepción temporal por el motor de aprobaciones ---------------------------------------
drop function if exists public.fn_hr_excepcion_crear(uuid, integer, jsonb);

create or replace function public.fn_hr_excepcion_solicitar(p_actor uuid, p_org integer, p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  e public.employments;
  v_desde date;
  v_hasta date;
  v_x public.hr_clock_method_exceptions;
  v_inst uuid;
begin
  if not public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.manage') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  begin
    select * into e from public.employments where id = (p_datos->>'vinculo_id')::uuid and organization_id = p_org;
    v_desde := (p_datos->>'desde')::date;
    v_hasta := (p_datos->>'hasta')::date;
  exception when others then
    raise exception 'datos_invalidos' using errcode = '22023';
  end;
  if e.id is null then
    raise exception 'hr: el vínculo no existe' using errcode = 'P0002';
  end if;
  if public.fn_hr_vinculo_es_del_actor(p_actor, e.id) then
    raise exception 'no_propio: una excepción para ti la pide otra persona de RR. HH.' using errcode = '42501';
  end if;
  if coalesce(p_datos->>'metodo', '') not in ('celular_ubicacion', 'qr', 'nfc_etiqueta', 'carne', 'pin', 'rostro', 'huella') then
    raise exception 'metodo_invalido' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_datos->>'motivo', ''))) not between 5 and 500 then
    raise exception 'motivo_requerido: de 5 a 500 caracteres' using errcode = '22023';
  end if;
  if v_desde is null or v_hasta is null or v_hasta < v_desde or v_hasta > v_desde + 90
     or v_hasta < public.fn_today_for(p_org, e.branch_id) then
    raise exception 'vigencia_invalida: hasta 90 días y que no termine en el pasado' using errcode = '22023';
  end if;
  insert into public.hr_clock_method_exceptions (organization_id, employment_id, method, valid_from, valid_to, reason, requested_by)
  values (p_org, e.id, p_datos->>'metodo', v_desde, v_hasta, btrim(p_datos->>'motivo'), p_actor)
  returning * into v_x;
  begin
    v_inst := public.fn_hr_aprobacion_iniciar(p_org, 'excepcion_marcacion', 'hr_clock_method_exceptions', v_x.id, e.id, p_actor,
                jsonb_build_object('metodo', v_x.method, 'desde', v_desde, 'hasta', v_hasta, 'motivo', v_x.reason,
                                   'branch_id', e.branch_id, 'department_id', e.department_id, 'position_id', e.position_id));
  exception when sqlstate '22023' then
    v_inst := null;  -- nadie a quien llegue: queda pendiente; nunca se aprueba por omisión
  end;
  update public.hr_clock_method_exceptions set approval_instance_id = v_inst where id = v_x.id returning * into v_x;
  return to_jsonb(v_x);
end;
$function$;
revoke all on function public.fn_hr_excepcion_solicitar(uuid, integer, jsonb) from public, anon, authenticated;
grant execute on function public.fn_hr_excepcion_solicitar(uuid, integer, jsonb) to service_role;

-- Al cerrarse la aprobación, la excepción queda aprobada (con quién y cuándo) o rechazada.
create or replace function public.fn_hr_excepcion_al_decidir()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.subject_table <> 'hr_clock_method_exceptions' or new.status = old.status or new.status = 'pendiente' then
    return new;
  end if;
  update public.hr_clock_method_exceptions x
     set status = case new.status when 'aprobada' then 'aprobada' when 'rechazada' then 'rechazada' else 'anulada' end,
         approved_by = case when new.status = 'aprobada' then
                         (select s.decided_by from public.hr_approval_steps s
                           where s.instance_id = new.id and s.status = 'aprobado' order by s.step_order desc limit 1) end,
         approved_at = case when new.status = 'aprobada' then now() end
   where x.id = new.subject_id and x.approval_instance_id = new.id and x.status = 'pendiente';
  return new;
end;
$$;
revoke all on function public.fn_hr_excepcion_al_decidir() from public, anon, authenticated;
drop trigger if exists trg_hr_approval_instances_excepcion on public.hr_approval_instances;
create trigger trg_hr_approval_instances_excepcion after update of status on public.hr_approval_instances
  for each row execute function public.fn_hr_excepcion_al_decidir();

create or replace function public.fn_hr_excepcion_revocar(p_actor uuid, p_org integer, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_x public.hr_clock_method_exceptions;
begin
  if not public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.manage') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  update public.hr_clock_method_exceptions x
     set revoked_at = now(), revoked_by = p_actor
   where x.id = p_id and x.organization_id = p_org and x.revoked_at is null
  returning * into v_x;
  if v_x.id is null then
    raise exception 'hr: la excepción no existe o ya se revocó' using errcode = 'P0002';
  end if;
  -- Si seguía pendiente, la solicitud de aprobación se cancela.
  if v_x.status = 'pendiente' and v_x.approval_instance_id is not null then
    perform public.fn_hr_aprobacion_anular_interna(v_x.approval_instance_id, 'excepción revocada');
  end if;
  return to_jsonb(v_x);
end;
$function$;

create or replace function public.fn_hr_excepciones(p_actor uuid, p_org integer, p_vinculo uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
begin
  if not (public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.view')
          or public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.manage')) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(public.fn_hr_asistencia_persona(x.employment_id) || jsonb_build_object(
             'id', x.id, 'metodo', x.method, 'motivo', x.reason, 'desde', x.valid_from, 'hasta', x.valid_to,
             'estado', case when x.revoked_at is not null then 'revocada' else x.status end,
             'vigente', x.status = 'aprobada' and x.revoked_at is null
                        and public.fn_today_for(p_org, e.branch_id) between x.valid_from and x.valid_to,
             'aprobado_por', (select nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), '') from public.profiles p where p.id = x.approved_by),
             'aprobado_en', x.approved_at)
           order by x.created_at desc)
      from public.hr_clock_method_exceptions x
      join public.employments e on e.id = x.employment_id
     where x.organization_id = p_org and (p_vinculo is null or x.employment_id = p_vinculo)
       and x.valid_to >= public.fn_today_for(p_org, e.branch_id) - 30), '[]'::jsonb);
end;
$function$;
