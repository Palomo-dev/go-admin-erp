-- HRM fase 0 · paso 4: historial con fecha de efecto («un solo dato, varios procesos»).
-- ADR-001 §3.
--
-- Cada cambio de salario, cargo, sede, área, jefe, jornada o contrato es un
-- evento con effective_from, valor anterior y nuevo, motivo, estado de
-- aprobación y quién lo aprobó. fn_hr_valor_vigente(vínculo, campo, fecha) da
-- el valor vigente en una fecha. Los eventos aprobados con fecha de hoy o
-- anterior se copian a la columna actual de employments (menos el salario,
-- cuya columna está congelada). Los futuros los aplica un job diario.

create table if not exists public.hr_employment_events (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      integer not null references public.organizations(id) on delete cascade,
  employment_id        uuid not null references public.employments(id),
  field                text not null check (field in ('salario','periodo_salario','cargo','sede','area','jefe',
                                                      'jornada_horas_semana','tipo_contrato','fin_contrato',
                                                      'centro_costo','tipo_vinculacion')),
  effective_from       date not null,
  old_value            jsonb,
  new_value            jsonb not null,
  reason               text not null check (length(btrim(reason)) >= 3),
  status               text not null default 'pendiente' check (status in ('pendiente','aprobado','rechazado','anulado')),
  approval_instance_id uuid references public.hr_approval_instances(id),
  requested_by         uuid,
  approved_by          uuid,
  approved_at          timestamptz,
  applied_at           timestamptz,
  source               text not null default 'registro' check (source in ('registro','cambio_directo','backfill')),
  created_at           timestamptz not null default now()
);
comment on table public.hr_employment_events is
  'HRM: historial con fecha de efecto (ADR-001 §3). Inmutable salvo estado/aprobación/aplicación, que solo cambian las funciones.';
create index if not exists hr_employment_events_vigente_idx
  on public.hr_employment_events (employment_id, field, effective_from desc) where status = 'aprobado';
create index if not exists hr_employment_events_pendientes_idx
  on public.hr_employment_events (effective_from) where status = 'aprobado' and applied_at is null;

-- Grupo de datos de cada campo.
create or replace function public.fn_hr_grupo_de_campo(p_campo text)
returns text
language sql immutable
set search_path = public, pg_temp
as $$ select case when p_campo in ('salario','periodo_salario') then 'salario_pago' else 'basico' end $$;

-- Inmutabilidad: solo cambian estado, aprobación y aplicación, y nunca se borra.
create or replace function public.fn_hr_eventos_inmutables()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'hr: el historial no se borra; se anula' using errcode = '42501';
  end if;
  if (new.organization_id, new.employment_id, new.field, new.effective_from, new.old_value, new.new_value, new.reason, new.requested_by, new.created_at, new.source)
     is distinct from
     (old.organization_id, old.employment_id, old.field, old.effective_from, old.old_value, old.new_value, old.reason, old.requested_by, old.created_at, old.source) then
    raise exception 'hr: un evento del historial no se edita; se registra otro' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.fn_hr_eventos_inmutables() from public, anon, authenticated;
drop trigger if exists trg_hr_employment_events_inmutables on public.hr_employment_events;
create trigger trg_hr_employment_events_inmutables before update or delete on public.hr_employment_events
  for each row execute function public.fn_hr_eventos_inmutables();

alter table public.hr_employment_events enable row level security;
revoke all on public.hr_employment_events from anon, public;
revoke insert, update, delete, truncate on public.hr_employment_events from authenticated;
grant select on public.hr_employment_events to authenticated;

-- Por RLS solo salen los eventos básicos; los de salario, por RPC con registro.
drop policy if exists hr_employment_events_select on public.hr_employment_events;
create policy hr_employment_events_select on public.hr_employment_events for select to authenticated
  using (field not in ('salario','periodo_salario')
         and (organization_id in (select public.fn_hr_orgs_con_permiso('hr.employees.view'))
              or employment_id in (select public.fn_hr_mis_empleos())
              or employment_id in (select public.fn_hr_equipo_empleos('hr.employees.view_team'))));

-- Valor actual de la columna de employments que corresponde a un campo.
create or replace function public.fn_hr_valor_columna(p_e public.employments, p_campo text)
returns jsonb
language sql immutable
set search_path = public, pg_temp
as $$
  select case p_campo
    when 'periodo_salario'      then to_jsonb(p_e.salary_period)
    when 'cargo'                then to_jsonb(p_e.position_id)
    when 'sede'                 then to_jsonb(p_e.branch_id)
    when 'area'                 then to_jsonb(p_e.department_id)
    when 'jefe'                 then to_jsonb(p_e.manager_id)
    when 'jornada_horas_semana' then to_jsonb(p_e.work_hours_per_week)
    when 'tipo_contrato'        then to_jsonb(p_e.contract_type)
    when 'fin_contrato'         then to_jsonb(p_e.contract_end_date)
    when 'centro_costo'         then to_jsonb(p_e.cost_center_id)
    when 'tipo_vinculacion'     then to_jsonb(p_e.employment_type)
    else null end;
$$;

-- Valor vigente sin controles (uso interno de otras funciones DEFINER).
create or replace function public.fn_hr_valor_vigente_interno(p_employment uuid, p_campo text, p_fecha date)
returns jsonb
language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select ev.new_value from public.hr_employment_events ev
      where ev.employment_id = p_employment and ev.field = p_campo and ev.status = 'aprobado'
        and ev.effective_from <= p_fecha
      order by ev.effective_from desc, ev.approved_at desc nulls last, ev.created_at desc
      limit 1),
    (select public.fn_hr_valor_columna(e, p_campo) from public.employments e where e.id = p_employment));
$$;

-- ¿Puede el actor ver/editar el grupo del campo para este vínculo?
create or replace function public.fn_hr_actor_puede_empleo(p_actor uuid, p_employment uuid, p_grupo text, p_accion text)
returns boolean
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_org integer;
  v_base text;
begin
  select e.organization_id into v_org from public.employments e where e.id = p_employment;
  if v_org is null or p_actor is null then return false; end if;
  v_base := case when p_grupo = 'basico' then 'hr.employees' else 'hr.data.' || p_grupo end;
  if p_accion = 'editar' then
    return public.fn_hr_puede_actor(p_actor, v_org, v_base || '.edit');
  end if;
  return public.fn_hr_puede_actor(p_actor, v_org, v_base || '.view')
      or p_employment in (select public.fn_hr_equipo_empleos_actor(p_actor, v_base || '.view_team'))
      or exists (select 1 from public.employments e
                   left join public.organization_members om on om.id = e.organization_member_id
                   left join public.hr_people p on p.id = e.person_id
                  where e.id = p_employment
                    and (om.user_id = p_actor or p.user_id = p_actor)
                    and exists (select 1 from public.organization_members m
                                 where m.user_id = p_actor and m.organization_id = v_org and m.is_active));
end;
$$;

-- Valor vigente con controles. El salario exige permiso o ser la persona, y deja
-- registro (por eso es VOLATILE).
create or replace function public.fn_hr_valor_vigente(p_employment uuid, p_campo text, p_fecha date)
returns jsonb
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_grupo text := public.fn_hr_grupo_de_campo(p_campo);
  v_e public.employments;
begin
  select * into v_e from public.employments where id = p_employment;
  if not found then
    raise exception 'hr: el vínculo no existe' using errcode = 'P0002';
  end if;
  if v_uid is not null then
    if not public.fn_hr_actor_puede_empleo(v_uid, p_employment, v_grupo, 'ver') then
      raise exception 'sin_permiso' using errcode = '42501';
    end if;
    if v_grupo = 'salario_pago' then
      perform public.fn_hr_registrar_acceso_interno(v_uid, v_e.organization_id, v_e.person_id, v_e.id,
        'salario_pago', 'ver', null, null, 'rpc:fn_hr_valor_vigente', jsonb_build_object('campos', jsonb_build_array(p_campo)));
    end if;
  elsif coalesce(auth.role(), '') in ('anon', 'authenticated') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  return public.fn_hr_valor_vigente_interno(p_employment, p_campo, p_fecha);
end;
$$;

-- Tramos de un campo dentro de un período (cuando el período cruza un cambio).
create or replace function public.fn_hr_valor_tramos(p_employment uuid, p_campo text, p_desde date, p_hasta date)
returns table (desde date, hasta date, valor jsonb)
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare
  v_cortes date[];
  i integer;
begin
  if p_hasta < p_desde then
    raise exception 'hr: período inválido' using errcode = '22023';
  end if;
  -- Valida permiso y deja registro (una vez) con la lectura del inicio.
  perform public.fn_hr_valor_vigente(p_employment, p_campo, p_desde);
  select array_agg(d order by d) into v_cortes from (
    select p_desde as d
    union
    select ev.effective_from from public.hr_employment_events ev
     where ev.employment_id = p_employment and ev.field = p_campo and ev.status = 'aprobado'
       and ev.effective_from > p_desde and ev.effective_from <= p_hasta) x;
  for i in 1 .. cardinality(v_cortes) loop
    desde := v_cortes[i];
    hasta := case when i < cardinality(v_cortes) then v_cortes[i + 1] - 1 else p_hasta end;
    valor := public.fn_hr_valor_vigente_interno(p_employment, p_campo, desde);
    return next;
  end loop;
end;
$$;

-- Copia un evento aprobado y ya vigente a la columna actual de employments.
create or replace function public.fn_hr_aplicar_evento(p_evento uuid)
returns boolean
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_ev public.hr_employment_events;
  v public.employments;
  v_hoy date;
begin
  select * into v_ev from public.hr_employment_events where id = p_evento for update;
  if not found or v_ev.status <> 'aprobado' or v_ev.applied_at is not null then
    return false;
  end if;
  select * into v from public.employments where id = v_ev.employment_id;
  v_hoy := public.fn_today_for(v_ev.organization_id, v.branch_id);
  if v_ev.effective_from > v_hoy then
    return false;
  end if;
  -- Solo se copia si es el evento vigente hoy de ese campo (uno posterior ya aprobado manda).
  if public.fn_hr_valor_vigente_interno(v_ev.employment_id, v_ev.field, v_hoy) is distinct from v_ev.new_value then
    update public.hr_employment_events set applied_at = now() where id = v_ev.id;
    return false;
  end if;
  perform set_config('hrm.aplicando_evento', 'on', true);
  update public.employments e set
    salary_period       = case when v_ev.field = 'periodo_salario' then v_ev.new_value #>> '{}' else e.salary_period end,
    position_id         = case when v_ev.field = 'cargo' then (v_ev.new_value #>> '{}')::uuid else e.position_id end,
    branch_id           = case when v_ev.field = 'sede' then (v_ev.new_value #>> '{}')::integer else e.branch_id end,
    department_id       = case when v_ev.field = 'area' then (v_ev.new_value #>> '{}')::uuid else e.department_id end,
    manager_id          = case when v_ev.field = 'jefe' then (v_ev.new_value #>> '{}')::uuid else e.manager_id end,
    work_hours_per_week = case when v_ev.field = 'jornada_horas_semana' then (v_ev.new_value #>> '{}')::numeric else e.work_hours_per_week end,
    contract_type       = case when v_ev.field = 'tipo_contrato' then v_ev.new_value #>> '{}' else e.contract_type end,
    contract_end_date   = case when v_ev.field = 'fin_contrato' then (v_ev.new_value #>> '{}')::date else e.contract_end_date end,
    cost_center_id      = case when v_ev.field = 'centro_costo' then (v_ev.new_value #>> '{}')::uuid else e.cost_center_id end,
    employment_type     = case when v_ev.field = 'tipo_vinculacion' then v_ev.new_value #>> '{}' else e.employment_type end
   where e.id = v_ev.employment_id;
  perform set_config('hrm.aplicando_evento', 'off', true);
  update public.hr_employment_events set applied_at = now() where id = v_ev.id;
  return true;
end;
$$;

-- Job diario: aplica los eventos aprobados cuya fecha ya llegó.
create or replace function public.fn_hr_aplicar_eventos_vigentes()
returns integer
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  n integer := 0;
begin
  for r in select ev.id from public.hr_employment_events ev
            where ev.status = 'aprobado' and ev.applied_at is null and ev.effective_from <= current_date + 1
            order by ev.effective_from, ev.approved_at loop
    if public.fn_hr_aplicar_evento(r.id) then n := n + 1; end if;
  end loop;
  return n;
end;
$$;

-- Validación y normalización del valor nuevo según el campo.
create or replace function public.fn_hr_validar_valor(p_org integer, p_employment uuid, p_campo text, p_valor jsonb)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_txt text := p_valor #>> '{}';
  v_num numeric;
begin
  if p_valor is null or jsonb_typeof(p_valor) = 'null' then
    if p_campo in ('jefe','fin_contrato','centro_costo','area') then return 'null'::jsonb; end if;
    raise exception 'hr: el valor es obligatorio para %', p_campo using errcode = '22023';
  end if;
  case p_campo
    when 'salario' then
      v_num := v_txt::numeric;
      if v_num is null or v_num <= 0 then raise exception 'hr: el salario debe ser mayor que cero' using errcode = '22023'; end if;
      return to_jsonb(round(v_num, 2));
    when 'jornada_horas_semana' then
      v_num := v_txt::numeric;
      if v_num is null or v_num <= 0 or v_num > 48 then raise exception 'hr: la jornada debe estar entre 0 y 48 horas' using errcode = '22023'; end if;
      return to_jsonb(v_num);
    when 'periodo_salario' then
      if v_txt not in ('monthly','biweekly','weekly','daily','hourly') then raise exception 'hr: periodicidad inválida' using errcode = '22023'; end if;
    when 'tipo_contrato' then
      if v_txt not in ('indefinite','fixed_term','service','hourly','project') then raise exception 'hr: tipo de contrato inválido' using errcode = '22023'; end if;
    when 'tipo_vinculacion' then
      if v_txt not in ('employee','contractor','intern','temporary','part_time') then raise exception 'hr: tipo de vinculación inválido' using errcode = '22023'; end if;
    when 'fin_contrato' then
      perform v_txt::date;
    when 'cargo' then
      if not exists (select 1 from public.job_positions j where j.id = v_txt::uuid and j.organization_id = p_org) then
        raise exception 'hr: el cargo no es de la organización' using errcode = '22023'; end if;
    when 'sede' then
      if not exists (select 1 from public.branches b where b.id = v_txt::integer and b.organization_id = p_org) then
        raise exception 'hr: la sede no es de la organización' using errcode = '22023'; end if;
      return to_jsonb(v_txt::integer);
    when 'area' then
      if not exists (select 1 from public.departments d where d.id = v_txt::uuid and d.organization_id = p_org) then
        raise exception 'hr: el área no es de la organización' using errcode = '22023'; end if;
    when 'jefe' then
      if v_txt::uuid = p_employment or not exists (select 1 from public.employments e where e.id = v_txt::uuid and e.organization_id = p_org) then
        raise exception 'hr: el jefe debe ser otro vínculo de la organización' using errcode = '22023'; end if;
    when 'centro_costo' then
      if not exists (select 1 from public.cost_centers c where c.id = v_txt::uuid and c.organization_id = p_org) then
        raise exception 'hr: el centro de costo no es de la organización' using errcode = '22023'; end if;
    else
      raise exception 'hr: campo desconocido %', p_campo using errcode = '22023';
  end case;
  return to_jsonb(v_txt);
end;
$$;

-- Registra un cambio. Con permiso edit: aprobado al instante, o pendiente si una
-- regla aplica. Un jefe sin edit, sobre su equipo, solo propone (exige regla).
create or replace function public.fn_hr_registrar_cambio(
  p_employment uuid, p_campo text, p_efectivo date, p_valor jsonb, p_motivo text, p_contexto jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_e public.employments;
  v_grupo text := public.fn_hr_grupo_de_campo(p_campo);
  v_edita boolean;
  v_valor jsonb;
  v_anterior jsonb;
  v_ev uuid;
  v_inst uuid;
  v_tipo text;
  v_status text;
begin
  if v_uid is null then
    raise exception 'hr: se necesita una sesión' using errcode = '42501';
  end if;
  select * into v_e from public.employments where id = p_employment for update;
  if not found or not exists (select 1 from public.organization_members om
                               where om.user_id = v_uid and om.organization_id = v_e.organization_id and om.is_active) then
    raise exception 'hr: el vínculo no existe' using errcode = 'P0002';
  end if;
  if p_efectivo is null then
    raise exception 'hr: la fecha de efecto es obligatoria' using errcode = '22023';
  end if;

  v_edita := public.fn_hr_actor_puede_empleo(v_uid, p_employment, v_grupo, 'editar');
  if not v_edita and not (p_employment in (select public.fn_hr_equipo_empleos_actor(v_uid,
                            case when v_grupo = 'basico' then 'hr.employees.view_team' else 'hr.data.' || v_grupo || '.view_team' end))) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;

  v_valor := public.fn_hr_validar_valor(v_e.organization_id, p_employment, p_campo, p_valor);
  v_anterior := public.fn_hr_valor_vigente_interno(p_employment, p_campo, p_efectivo);

  insert into public.hr_employment_events
    (organization_id, employment_id, field, effective_from, old_value, new_value, reason, requested_by)
  values (v_e.organization_id, p_employment, p_campo, p_efectivo, v_anterior, v_valor, btrim(p_motivo), v_uid)
  returning id into v_ev;

  v_tipo := case p_campo
              when 'salario' then 'cambio_salario' when 'periodo_salario' then 'cambio_salario'
              when 'cargo' then 'cambio_cargo' when 'sede' then 'cambio_sede'
              when 'area' then 'cambio_area' when 'centro_costo' then 'cambio_area'
              when 'jefe' then 'cambio_jefe' when 'jornada_horas_semana' then 'cambio_jornada'
              else 'cambio_contrato' end;

  v_inst := public.fn_hr_aprobacion_iniciar(v_e.organization_id, v_tipo, 'hr_employment_events', v_ev, p_employment, v_uid,
              jsonb_build_object('branch_id', v_e.branch_id, 'department_id', v_e.department_id,
                                 'campo', p_campo,
                                 'monto', case when p_campo = 'salario' then v_valor else null end));

  if v_inst is not null then
    update public.hr_employment_events set approval_instance_id = v_inst where id = v_ev;
    v_status := 'pendiente';
  elsif v_edita then
    update public.hr_employment_events set status = 'aprobado', approved_by = v_uid, approved_at = now() where id = v_ev;
    perform public.fn_hr_aplicar_evento(v_ev);
    v_status := 'aprobado';
  else
    raise exception 'requiere_regla_de_aprobacion: un jefe sin permiso de edición solo propone cambios cuando hay una regla de %', v_tipo
      using errcode = '42501';
  end if;

  if v_grupo = 'salario_pago' then
    perform public.fn_hr_registrar_acceso_interno(v_uid, v_e.organization_id, v_e.person_id, v_e.id, 'salario_pago', 'editar',
      p_contexto->>'ip', p_contexto->>'user_agent', coalesce(p_contexto->>'ruta', 'rpc:fn_hr_registrar_cambio'),
      jsonb_build_object('campos', jsonb_build_array(p_campo), 'evento', v_ev));
  end if;

  return jsonb_build_object('id', v_ev, 'status', v_status, 'approval_instance_id', v_inst);
end;
$$;

-- Consecuencia de cerrar una aprobación (reemplaza la base del paso 3).
create or replace function public.fn_hr_aprobacion_al_cerrar(p_inst uuid)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_inst public.hr_approval_instances;
  v_ultimo uuid;
begin
  select * into v_inst from public.hr_approval_instances where id = p_inst;
  if not found or v_inst.status = 'pendiente' then return; end if;
  if v_inst.subject_table = 'hr_employment_events' then
    select s.decided_by into v_ultimo from public.hr_approval_steps s
     where s.instance_id = p_inst and s.status in ('aprobado','rechazado')
     order by s.step_order desc limit 1;
    update public.hr_employment_events ev
       set status = case v_inst.status when 'aprobada' then 'aprobado' when 'rechazada' then 'rechazado' else 'anulado' end,
           approved_by = case when v_inst.status = 'aprobada' then v_ultimo else ev.approved_by end,
           approved_at = case when v_inst.status = 'aprobada' then now() else ev.approved_at end
     where ev.id = v_inst.subject_id and ev.approval_instance_id = p_inst and ev.status = 'pendiente';
    if v_inst.status = 'aprobada' then
      perform public.fn_hr_aplicar_evento(v_inst.subject_id);
    end if;
  end if;
end;
$$;

-- Cambios directos en employments (pantallas viejas): quedan en el historial.
create or replace function public.fn_hr_employments_historial_directo()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_campo text;
  v_hoy date;
begin
  if coalesce(current_setting('hrm.aplicando_evento', true), 'off') = 'on' then
    return new;
  end if;
  v_hoy := public.fn_today_for(new.organization_id, new.branch_id);
  foreach v_campo in array array['periodo_salario','cargo','sede','area','jefe','jornada_horas_semana',
                                 'tipo_contrato','fin_contrato','centro_costo','tipo_vinculacion'] loop
    if public.fn_hr_valor_columna(new, v_campo) is distinct from public.fn_hr_valor_columna(old, v_campo) then
      insert into public.hr_employment_events
        (organization_id, employment_id, field, effective_from, old_value, new_value, reason, status,
         requested_by, approved_by, approved_at, applied_at, source)
      values (new.organization_id, new.id, v_campo, v_hoy, public.fn_hr_valor_columna(old, v_campo),
              coalesce(public.fn_hr_valor_columna(new, v_campo), 'null'::jsonb),
              'Cambio directo en el vínculo (pantalla anterior a la fase 1)', 'aprobado',
              auth.uid(), auth.uid(), now(), now(), 'cambio_directo');
    end if;
  end loop;
  return new;
end;
$$;
drop trigger if exists trg_employments_historial_directo on public.employments;
create trigger trg_employments_historial_directo after update on public.employments
  for each row execute function public.fn_hr_employments_historial_directo();

revoke execute on function public.fn_hr_grupo_de_campo(text) from public, anon;
revoke execute on function public.fn_hr_valor_columna(public.employments, text) from public, anon, authenticated;
revoke execute on function public.fn_hr_valor_vigente_interno(uuid, text, date) from public, anon, authenticated;
revoke execute on function public.fn_hr_actor_puede_empleo(uuid, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.fn_hr_valor_vigente(uuid, text, date) from public, anon;
revoke execute on function public.fn_hr_valor_tramos(uuid, text, date, date) from public, anon;
revoke execute on function public.fn_hr_aplicar_evento(uuid) from public, anon, authenticated;
revoke execute on function public.fn_hr_aplicar_eventos_vigentes() from public, anon, authenticated;
revoke execute on function public.fn_hr_validar_valor(integer, uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public.fn_hr_registrar_cambio(uuid, text, date, jsonb, text, jsonb) from public, anon;
revoke execute on function public.fn_hr_aprobacion_al_cerrar(uuid) from public, anon, authenticated;
revoke execute on function public.fn_hr_employments_historial_directo() from public, anon, authenticated;
grant execute on function public.fn_hr_grupo_de_campo(text) to authenticated, service_role;
grant execute on function public.fn_hr_valor_vigente_interno(uuid, text, date) to service_role;
grant execute on function public.fn_hr_actor_puede_empleo(uuid, uuid, text, text) to service_role;
grant execute on function public.fn_hr_valor_vigente(uuid, text, date) to authenticated, service_role;
grant execute on function public.fn_hr_valor_tramos(uuid, text, date, date) to authenticated, service_role;
grant execute on function public.fn_hr_aplicar_eventos_vigentes() to service_role;
grant execute on function public.fn_hr_registrar_cambio(uuid, text, date, jsonb, text, jsonb) to authenticated;

-- Job diario (05:10 UTC = 00:10 en Bogotá): aplica los cambios cuya fecha llegó.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'hrm-aplicar-eventos') then
    perform cron.unschedule('hrm-aplicar-eventos');
  end if;
  perform cron.schedule('hrm-aplicar-eventos', '10 5 * * *', 'select public.fn_hr_aplicar_eventos_vigentes();');
end $$;
