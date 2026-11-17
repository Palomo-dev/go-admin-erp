-- Reversión de 20261117012539_hrm_m0_04_marcacion_r1_reclamos_excepciones
-- (revertir antes 20261117012641_hrm_m0_05; después se pueden revertir 03, 02 y 01).
-- Advertencias:
-- - Se borran con sus filas las excepciones temporales (hr_clock_method_exceptions) y los
--   QR usados (hr_qr_codes_used); se recrean vacías las tablas del paso 1.
-- - Se pierden timesheet_adjustments.attendance_event_id, origin y claim_kind y
--   attendance_events.photo_hold. Un ajuste 'excluir_marca' ya creado impide restaurar
--   el CHECK anterior: hay que resolverlo antes.
-- - Vuelven las políticas de escritura de attendance_events (R1 deja de estar en la base).
-- - fn_hr_excepcion_crear/_revocar y fn_hr_excepciones del paso 3 se recuperan volviendo
--   a aplicar su bloque de 20261117011440 (o revirtiendo ese paso).

drop trigger if exists trg_hr_approval_instances_excepcion on public.hr_approval_instances;
drop function if exists public.fn_hr_excepcion_al_decidir();
drop function if exists public.fn_hr_excepcion_solicitar(uuid, integer, jsonb);
drop function if exists public.fn_hr_excepciones(uuid, integer, uuid);
drop function if exists public.fn_hr_excepcion_revocar(uuid, integer, uuid);
drop table if exists public.hr_clock_method_exceptions;
drop table if exists public.hr_qr_codes_used;

create table if not exists public.hr_marcacion_excepciones (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  employment_id uuid not null references public.employments(id),
  metodo text not null check (metodo in ('celular_ubicacion', 'qr', 'nfc_etiqueta')),
  motivo text not null check (char_length(btrim(motivo)) between 5 and 500),
  vigente_desde timestamptz not null default now(),
  vigente_hasta timestamptz not null,
  aprobado_por uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  revocada_at timestamptz,
  revocada_por uuid references auth.users(id),
  check (vigente_hasta > vigente_desde and vigente_hasta <= vigente_desde + interval '92 days')
);
alter table public.hr_marcacion_excepciones enable row level security;
revoke all on public.hr_marcacion_excepciones from anon;
revoke insert, update, delete, truncate on public.hr_marcacion_excepciones from authenticated;
create table if not exists public.hr_qr_usos (
  time_clock_id uuid not null references public.time_clocks(id) on delete cascade,
  paso bigint not null,
  n integer not null check (n between 0 and 999),
  employment_id uuid not null references public.employments(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (time_clock_id, paso, n)
);
alter table public.hr_qr_usos enable row level security;
revoke all on public.hr_qr_usos from public, anon, authenticated;

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

select pg_temp.fn_parchar('public.fn_hr_mi_asistencia(uuid,integer,date,date)',
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
                            from public.attendance_events a where a.employment_id = v_emp.id and a.work_date = d.dia))$a$,
$a$                                   and a.device_info ? 'revisar'))$a$);

select pg_temp.fn_parchar('public.fn_hr_regla_guardar(integer,jsonb)',
$a$  -- R3 (Marcación M0): quien tiene jefe, lo tiene como aprobador; sin jefe, el motor pasa a RR. HH.
  if coalesce(p_regla->>'tipo', (select r.request_type from public.hr_approval_rules r where r.id = v_id and r.organization_id = p_org))
       in ('horas_extra', 'novedad_asistencia')
     and not exists (select 1 from jsonb_array_elements(p_regla->'pasos') x where x->>'tipo' = 'jefe_directo') then
    raise exception 'jefe_directo_requerido: las horas extra y las novedades de asistencia siempre pasan por el jefe directo'
      using errcode = '22023';
  end if;
  if v_id is null then
    select coalesce(max(priority), 0) + 1 into v_prioridad from public.hr_approval_rules$a$,
$a$  if v_id is null then
    select coalesce(max(priority), 0) + 1 into v_prioridad from public.hr_approval_rules$a$);

select pg_temp.fn_parchar('public.fn_hr_aprobacion_plan(integer,text,uuid,uuid,jsonb)',
$a$  -- Excepción temporal de marcación (Marcación M0, D14): sin regla, RR. HH.
  if p_tipo = 'excepcion_marcacion' then
    if cardinality(v_rrhh) > 0 then
      v_pasos := jsonb_build_array(jsonb_build_object('orden', 1, 'tipo', 'rrhh', 'aprobadores', to_jsonb(v_rrhh), 'respaldo', false, 'cargo', null));
    end if;
    return jsonb_build_object('regla', null, 'otras', '[]'::jsonb, 'pasos', v_pasos, 'por_defecto', true,
                              'sin_aprobador', case when jsonb_array_length(v_pasos) = 0 then 1 end);
  end if;

  -- Sin regla: jefe directo y, si no tiene (o es quien pide), RR. HH.$a$,
$a$  -- Sin regla: jefe directo y, si no tiene (o es quien pide), RR. HH.$a$);

select pg_temp.fn_parchar('public.fn_hr_ajustes_aplicar_interno(integer)',
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
  return v_out;$a$,
$a$  end loop;
  return v_out;$a$);

select pg_temp.fn_parchar('public.fn_hr_jornada_insumos(uuid,integer,uuid,date)',
$a$    from public.attendance_events ae where ae.employment_id = p_employment and ae.work_date = p_fecha
     and not exists (select 1 from public.timesheet_adjustments x
                      where x.attendance_event_id = ae.id and x.adjustment_type = 'excluir_marca' and x.status = 'approved');$a$,
$a$    from public.attendance_events ae where ae.employment_id = p_employment and ae.work_date = p_fecha;$a$);

select pg_temp.fn_parchar('public.fn_hr_marcacion_estado(uuid,integer)',
$a$    'excepciones', coalesce(v_met->'excepciones_vigentes', '[]'::jsonb));$a$,
$a$    'excepciones', coalesce((select jsonb_agg(jsonb_build_object('metodo', x.metodo, 'hasta', x.vigente_hasta) order by x.vigente_hasta)
                               from public.hr_marcacion_excepciones x
                              where x.employment_id = v_emp.id and x.revocada_at is null
                                and x.vigente_desde <= now() and x.vigente_hasta > now()), '[]'::jsonb));$a$);

select pg_temp.fn_parchar('public.fn_hr_metodos_vinculo(uuid)',
$a$    'excepciones', to_jsonb(v_exc),
    'excepciones_vigentes', (select coalesce(jsonb_agg(jsonb_build_object('metodo', x.method, 'hasta', x.valid_to) order by x.valid_to), '[]'::jsonb)
                               from public.hr_clock_method_exceptions x
                              where x.employment_id = v_emp.id and x.status = 'aprobada' and x.revoked_at is null
                                and public.fn_today_for(v_emp.organization_id, v_emp.branch_id) between x.valid_from and x.valid_to),$a$,
$a$    'excepciones', to_jsonb(v_exc),$a$);

select pg_temp.fn_parchar('public.fn_hr_metodos_vinculo(uuid)',
$a$  select coalesce(array_agg(distinct x.method), '{}') into v_exc
    from public.hr_clock_method_exceptions x
   where x.employment_id = v_emp.id and x.status = 'aprobada' and x.revoked_at is null
     and public.fn_today_for(v_emp.organization_id, v_emp.branch_id) between x.valid_from and x.valid_to;$a$,
$a$  select coalesce(array_agg(distinct x.metodo), '{}') into v_exc
    from public.hr_marcacion_excepciones x
   where x.employment_id = v_emp.id and x.revocada_at is null
     and x.vigente_desde <= now() and x.vigente_hasta > now();$a$);

select pg_temp.fn_parchar('public.fn_hr_pantalla_qr_usos(uuid,integer,uuid,bigint)',
$a$(select max(u.code_n) from public.hr_qr_codes_used u where u.time_clock_id = c.id and u.time_step = p_paso)$a$,
$a$(select max(u.n) from public.hr_qr_usos u where u.time_clock_id = c.id and u.paso = p_paso)$a$);

select pg_temp.fn_parchar('public.fn_hr_marcar(uuid,integer,jsonb,text,text)',
$a$  if v_paso is not null then
    update public.hr_qr_codes_used set attendance_event_id = v_ev.id
     where time_clock_id = v_reloj.id and time_step = v_paso and code_n = v_n;
  end if;
  if v_reloj.id is not null then
    update public.time_clocks set last_seen_at = now()$a$,
$a$  if v_reloj.id is not null then
    update public.time_clocks set last_seen_at = now()$a$);

select pg_temp.fn_parchar('public.fn_hr_marcar(uuid,integer,jsonb,text,text)',
$a$      delete from public.hr_qr_codes_used u where u.time_clock_id = v_reloj.id and u.used_at < now() - interval '24 hours';$a$,
$a$      delete from public.hr_qr_usos u where u.time_clock_id = v_reloj.id and u.paso < v_paso_ahora - 2880;$a$);

select pg_temp.fn_parchar('public.fn_hr_marcar(uuid,integer,jsonb,text,text)',
$a$raise exception 'qr_ya_usado: $a$,
$a$raise exception 'qr_usado: $a$);

select pg_temp.fn_parchar('public.fn_hr_marcar(uuid,integer,jsonb,text,text)',
$a$      insert into public.hr_qr_codes_used (time_clock_id, time_step, code_n, employment_id)
      values (v_reloj.id, v_paso, v_n, v_emp.id)$a$,
$a$      insert into public.hr_qr_usos (time_clock_id, paso, n, employment_id)
      values (v_reloj.id, v_paso, v_n, v_emp.id)$a$);

select pg_temp.fn_parchar('public.fn_hr_attendance_validar()',
$a$begin
  -- R1 (Marcación M0): una marca no se edita; si llega aquí es una columna técnica.
  if tg_op = 'UPDATE' then
    return new;
  end if;
  select e.organization_id, e.branch_id into v_org, v_branch from public.employments e where e.id = new.employment_id;$a$,
$a$begin
  select e.organization_id, e.branch_id into v_org, v_branch from public.employments e where e.id = new.employment_id;$a$);

-- fn_hr_marcacion_manual y fn_hr_ajuste_solicitar vuelven a su versión de la fase 2.
create or replace function public.fn_hr_marcacion_manual(p_actor uuid, p_org integer, p_employment uuid, p_tipo text, p_hora timestamp with time zone, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_ev public.attendance_events;
  v_branch integer;
begin
  if not public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.manage') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  select e.branch_id into v_branch from public.employments e where e.id = p_employment and e.organization_id = p_org;
  if not found then
    raise exception 'hr: el vínculo no existe' using errcode = 'P0002';
  end if;
  if p_tipo not in ('check_in', 'check_out', 'break_start', 'break_end') then
    raise exception 'tipo_invalido' using errcode = '22023';
  end if;
  if p_hora is null or p_hora > now() + interval '5 minutes' or p_hora < now() - interval '62 days' then
    raise exception 'hora_invalida: entre hace 62 días y ahora' using errcode = '22023';
  end if;
  if char_length(coalesce(btrim(p_motivo), '')) not between 5 and 500 then
    raise exception 'motivo_requerido: de 5 a 500 caracteres' using errcode = '22023';
  end if;
  insert into public.attendance_events
    (organization_id, branch_id, employment_id, event_type, event_at, source, is_manual_entry, manual_reason, created_by)
  values (p_org, v_branch, p_employment, p_tipo, p_hora, 'manual', true, btrim(p_motivo), p_actor)
  returning * into v_ev;
  return jsonb_build_object('evento_id', v_ev.id, 'tipo', v_ev.event_type, 'hora', v_ev.event_at, 'fecha_trabajo', v_ev.work_date);
end;
$function$;

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
  v_ts public.timesheets;
  v_prev timestamptz;
  v_id uuid;
  v_inst uuid;
begin
  select * into e from public.employments where id = v_emp and organization_id = p_org;
  if not found then
    raise exception 'hr: el vínculo no existe' using errcode = 'P0002';
  end if;
  if not (public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.manage')
          or public.fn_hr_vinculo_es_del_actor(p_actor, v_emp)
          or v_emp in (select public.fn_hr_asistencia_vinculos(p_actor, p_org))) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if v_tipo is null or v_tipo not in ('check_in', 'check_out', 'break_start', 'break_end') then
    raise exception 'tipo_invalido' using errcode = '22023';
  end if;
  if v_fecha is null or v_hora is null or v_hora > now() + interval '5 minutes' or v_hora < now() - interval '62 days' then
    raise exception 'hora_invalida: entre hace 62 días y ahora' using errcode = '22023';
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
  if exists (select 1 from public.timesheet_adjustments a where a.timesheet_id = v_ts.id
              and a.status = 'pending' and a.event_type = v_tipo) then
    raise exception 'ajuste_ya_pendiente' using errcode = '23505';
  end if;

  select max(a.event_at) into v_prev from public.attendance_events a
   where a.employment_id = v_emp and a.work_date = v_fecha and a.event_type = v_tipo;

  insert into public.timesheet_adjustments (timesheet_id, adjustment_type, previous_value, new_value, reason, note,
                                            event_type, event_at, created_by, status)
  values (v_ts.id,
          case v_tipo when 'check_in' then 'override_check_in' when 'check_out' then 'override_check_out' else 'other' end,
          v_prev::text, v_hora::text, v_motivo, v_nota, v_tipo, v_hora, p_actor, 'pending')
  returning id into v_id;

  begin
    v_inst := public.fn_hr_aprobacion_iniciar(p_org, 'novedad_asistencia', 'timesheet_adjustments', v_id, v_emp, p_actor,
                jsonb_build_object('novedad', 'ajuste_marca', 'fecha', v_fecha, 'evento', v_tipo, 'hora', v_hora,
                                   'motivo', v_motivo, 'branch_id', e.branch_id, 'department_id', e.department_id,
                                   'position_id', e.position_id));
  exception when sqlstate '22023' then
    v_inst := null;  -- nadie a quien llegue: queda pendiente; nunca se aprueba por omisión
  end;
  update public.timesheet_adjustments set approval_instance_id = v_inst where id = v_id;
  return jsonb_build_object('id', v_id, 'estado', 'pendiente', 'instancia_id', v_inst, 'timesheet_id', v_ts.id);
end;
$function$;

drop trigger if exists trg_timesheet_adjustments_foto on public.timesheet_adjustments;
drop function if exists public.fn_hr_ajuste_retencion_foto();
drop index if exists public.timesheet_adjustments_evento_idx;
alter table public.timesheet_adjustments drop constraint if exists timesheet_adjustments_adjustment_type_check;
alter table public.timesheet_adjustments add constraint timesheet_adjustments_adjustment_type_check
  check (adjustment_type in ('add_minutes', 'subtract_minutes', 'override_check_in', 'override_check_out', 'add_overtime',
                             'remove_overtime', 'excuse_late', 'other'));
alter table public.timesheet_adjustments drop constraint if exists timesheet_adjustments_claim_kind_chk;
alter table public.timesheet_adjustments drop constraint if exists timesheet_adjustments_origin_chk;
alter table public.timesheet_adjustments
  drop column if exists claim_kind,
  drop column if exists origin,
  drop column if exists attendance_event_id;

drop trigger if exists trg_attendance_events_inmutable on public.attendance_events;
drop function if exists public.fn_hr_attendance_inmutable();
grant insert, update, delete on public.attendance_events to authenticated;
create policy attendance_events_insert on public.attendance_events for insert to authenticated
  with check ((employment_id in (select public.fn_hr_mis_empleos()))
              or (organization_id in (select public.fn_hr_orgs_con_permiso('hr.attendance.manage'))));
create policy attendance_events_update on public.attendance_events for update to authenticated
  using (organization_id in (select public.fn_hr_orgs_con_permiso('hr.attendance.manage')))
  with check (organization_id in (select public.fn_hr_orgs_con_permiso('hr.attendance.manage')));
create policy attendance_events_delete on public.attendance_events for delete to authenticated
  using (organization_id in (select public.fn_hr_orgs_con_permiso('hr.attendance.manage')));

alter table public.attendance_events drop column if exists photo_hold;
alter table public.attendance_events drop constraint if exists attendance_events_method_check;
alter table public.attendance_events add constraint attendance_events_method_check
  check (method is null or method in ('celular_ubicacion', 'qr', 'nfc_etiqueta', 'carne_nfc', 'carne_qr',
                                      'pin', 'rostro', 'huella', 'remoto', 'manual'));
alter table public.hr_branch_clock_methods drop constraint if exists hr_branch_clock_methods_method_check;
alter table public.hr_branch_clock_methods add constraint hr_branch_clock_methods_method_check
  check (method in ('celular_ubicacion', 'qr', 'nfc_etiqueta', 'carne_nfc', 'pin', 'rostro', 'huella'));
