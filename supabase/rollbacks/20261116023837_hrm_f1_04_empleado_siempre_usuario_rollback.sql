-- Revierte 20261116023837_hrm_f1_04_empleado_siempre_usuario.
-- Vuelve al modelo de la fase 0 y la fase 1: persona sin usuario permitida, FK con
-- ON DELETE SET NULL, alta sin usuario y lista y ficha con «tiene_usuario». Las
-- funciones vuelven a su versión anterior, copiada de las migraciones que las crearon
-- (hrm_f0_02_personas, hrm_f0_07_datos_sensibles y hrm_f1_01_personas_ficha).
-- ADVERTENCIA: lo que se haya dado de alta con la versión nueva conserva su usuario, su
-- miembro (inactivo hasta que acepte) y su invitación pendiente; no se borra nada.
-- El código de la app que llama a fn_hr_alta_empleado con p_acceso deja de funcionar:
-- revertir también el commit del código.

drop trigger if exists trg_hr_people_miembro_coherente on public.hr_people;
drop function if exists public.fn_hr_people_miembro_coherente();

alter table public.employments drop constraint if exists employments_organization_member_id_fkey;
alter table public.employments add constraint employments_organization_member_id_fkey
  foreign key (organization_member_id) references public.organization_members(id) on delete set null;
alter table public.hr_people drop constraint if exists hr_people_organization_member_id_fkey;
alter table public.hr_people add constraint hr_people_organization_member_id_fkey
  foreign key (organization_member_id) references public.organization_members(id) on delete set null;
alter table public.hr_people drop constraint if exists hr_people_user_id_fkey;
alter table public.hr_people add constraint hr_people_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

alter table public.employments alter column organization_member_id drop not null;
alter table public.hr_people alter column organization_member_id drop not null;
alter table public.hr_people alter column user_id drop not null;

comment on column public.hr_people.user_id is null;
comment on column public.hr_people.organization_member_id is null;
comment on column public.employments.organization_member_id is null;
comment on column public.invitations.hr_person_id is
  'HRM: persona-empleado a la que se invita al portal. Al aceptar, el miembro nuevo se enlaza a esa persona y a su vínculo (no se crea otro).';

-- fn_hr_employments_organizacion (hrm_f0_02_personas)
create or replace function public.fn_hr_employments_organizacion()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_org_miembro integer;
  v_user uuid;
  v_org_persona integer;
begin
  if new.organization_member_id is not null then
    select om.organization_id, om.user_id into v_org_miembro, v_user
      from public.organization_members om where om.id = new.organization_member_id;
    if new.organization_id is null then
      new.organization_id := v_org_miembro;
    elsif v_org_miembro is not null and v_org_miembro <> new.organization_id then
      raise exception 'hr: el miembro es de otra organización' using errcode = '42501';
    end if;
  end if;

  if new.organization_id is null then
    raise exception 'hr: el vínculo laboral necesita organization_id o un miembro' using errcode = '23502';
  end if;

  if new.person_id is null and new.organization_member_id is not null then
    select p.id into new.person_id from public.hr_people p
     where p.organization_member_id = new.organization_member_id;
    if new.person_id is null then
      insert into public.hr_people (organization_id, first_name, last_name, work_email, user_id, organization_member_id)
      select new.organization_id,
             coalesce(nullif(btrim(pr.first_name), ''), nullif(split_part(pr.email, '@', 1), ''), 'Sin nombre'),
             nullif(btrim(pr.last_name), ''), pr.email, v_user, new.organization_member_id
        from (select 1) x
        left join public.profiles pr on pr.id = v_user
      returning id into new.person_id;
    end if;
  end if;

  if new.person_id is not null then
    select p.organization_id into v_org_persona from public.hr_people p where p.id = new.person_id;
    if v_org_persona is distinct from new.organization_id then
      raise exception 'hr: la persona es de otra organización' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

-- fn_hr_persona_crear (hrm_f0_07_datos_sensibles)
create or replace function public.fn_hr_persona_crear(p_actor uuid, p_org integer, p_datos jsonb, p_ip text, p_ua text, p_ruta text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if not public.fn_hr_puede_actor(p_actor, p_org, 'hr.employees.create') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if jsonb_typeof(p_datos->'identificacion') = 'object'
     and not public.fn_hr_puede_actor(p_actor, p_org, 'hr.data.identificacion.edit') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  insert into public.hr_people (organization_id, first_name, second_name, last_name, second_last_name, preferred_name,
                                work_email, work_phone, created_by, updated_by)
  values (p_org, btrim(p_datos->>'first_name'), p_datos->>'second_name', p_datos->>'last_name', p_datos->>'second_last_name',
          p_datos->>'preferred_name', p_datos->>'work_email', p_datos->>'work_phone', p_actor, p_actor)
  returning id into v_id;
  if jsonb_typeof(p_datos->'identificacion') = 'object' then
    perform public.fn_hr_datos_sensibles_guardar(p_actor, p_org, v_id, 'identificacion',
      jsonb_build_object('identificacion', p_datos->'identificacion'), p_ip, p_ua, p_ruta);
  end if;
  return jsonb_build_object('id', v_id);
end;
$$;

-- fn_hr_empleados_listar y fn_hr_ficha_leer (hrm_f1_01_personas_ficha)
create or replace function public.fn_hr_empleados_listar(p_actor uuid, p_org integer, p_ip text, p_ua text, p_ruta text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_hoy date := public.fn_today_for(p_org, null);
  v_dias integer := public.fn_hr_dias_aviso(p_org);
  v_todos boolean;
  v_doc_todos boolean;
  v_ver_salario boolean;
  v_filas jsonb;
  v_docs integer;
begin
  if not exists (select 1 from public.organization_members om where om.user_id = p_actor and om.organization_id = p_org and om.is_active) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  v_todos := public.fn_hr_puede_actor(p_actor, p_org, 'hr.employees.view');
  if not v_todos and not public.fn_hr_puede_actor(p_actor, p_org, 'hr.employees.view_team')
     and not public.fn_hr_puede_actor(p_actor, p_org, 'hr.employees.view_branch') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  v_doc_todos := public.fn_hr_puede_actor(p_actor, p_org, 'hr.data.identificacion.view');
  v_ver_salario := public.fn_hr_puede_actor(p_actor, p_org, 'hr.data.salario_pago.view');

  with alcance as (
    select e.* from public.employments e
     where e.organization_id = p_org and e.person_id is not null
       and (v_todos or e.id in (select public.fn_hr_equipo_empleos_actor(p_actor, 'hr.employees.view_team')))
  ),
  ultimo as (
    select distinct on (a.person_id) a.* from alcance a order by a.person_id, a.hire_date desc, a.created_at desc
  ),
  equipo_doc as (
    select x from public.fn_hr_equipo_empleos_actor(p_actor, 'hr.data.identificacion.view_team') x
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'persona_id', p.id,
      'vinculo_id', u.id,
      'nombre', public.fn_hr_nombre_persona(p.id),
      'doc_tipo', case when v_doc_todos or u.id in (select x from equipo_doc) then i.doc_type end,
      'doc_numero', case when v_doc_todos or u.id in (select x from equipo_doc) then i.doc_number end,
      'cargo_id', u.position_id, 'cargo', j.name,
      'area_id', u.department_id, 'area', d.name,
      'sede_id', u.branch_id, 'sede', b.name,
      'tipo_contrato', u.contract_type, 'fin_contrato', u.contract_end_date,
      'ingreso', u.hire_date, 'retiro', u.termination_date,
      'estado', public.fn_hr_estado_vinculo(u, v_hoy),
      'tiene_usuario', (p.user_id is not null or u.organization_member_id is not null),
      'invitacion_pendiente', exists (select 1 from public.invitations iv where iv.hr_person_id = p.id and iv.status = 'pending'
                                        and (iv.expires_at is null or iv.expires_at > now())),
      'tiene_correo', coalesce(nullif(btrim(p.work_email), ''), nullif(btrim(i.personal_email), '')) is not null,
      'alertas', public.fn_hr_alertas_persona(p_org, p.id, u.id, v_hoy, v_dias, v_ver_salario)
    ) order by public.fn_hr_nombre_persona(p.id)), '[]'::jsonb),
    count(i.doc_number) filter (where v_doc_todos or u.id in (select x from equipo_doc))
    into v_filas, v_docs
    from ultimo u
    join public.hr_people p on p.id = u.person_id
    left join public.hr_people_identification i on i.person_id = p.id
    left join public.job_positions j on j.id = u.position_id
    left join public.departments d on d.id = u.department_id
    left join public.branches b on b.id = u.branch_id;

  if v_docs > 0 then
    perform public.fn_hr_registrar_acceso_interno(p_actor, p_org, null, null, 'identificacion', 'ver', p_ip, p_ua, p_ruta,
      jsonb_build_object('lista', 'empleados', 'personas', v_docs, 'campos', jsonb_build_array('doc_type','doc_number')));
  end if;
  return jsonb_build_object('hoy', v_hoy, 'dias_aviso', v_dias, 'alcance', case when v_todos then 'organizacion' else 'equipo' end,
                            'empleados', v_filas);
end;
$$;

create or replace function public.fn_hr_ficha_leer(p_actor uuid, p_org integer, p_person uuid)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_hoy date := public.fn_today_for(p_org, null);
  v_dias integer := public.fn_hr_dias_aviso(p_org);
  p public.hr_people;
  e public.employments;
  v_ver_salario boolean;
  v_laboral jsonb := '[]'::jsonb;
  v_campo text;
  v_permisos jsonb := '{}'::jsonb;
  g text;
  v_jefe jsonb;
begin
  if not public.fn_hr_actor_ve_persona(p_actor, p_org, p_person) then
    if not exists (select 1 from public.hr_people x where x.id = p_person and x.organization_id = p_org) then
      raise exception 'hr: la persona no existe' using errcode = 'P0002';
    end if;
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  select * into p from public.hr_people where id = p_person;
  select * into e from public.employments where id = public.fn_hr_vinculo_actual(p_person);
  v_ver_salario := public.fn_hr_actor_puede_grupo(p_actor, p_org, p_person, 'salario_pago', 'ver');

  foreach g in array public.fn_hr_grupos_datos() loop
    v_permisos := v_permisos || jsonb_build_object(g, jsonb_build_object(
      'ver', public.fn_hr_actor_puede_grupo(p_actor, p_org, p_person, g, 'ver'),
      'editar', public.fn_hr_actor_puede_grupo(p_actor, p_org, p_person, g, 'editar')));
  end loop;

  if e.id is not null then
    foreach v_campo in array array['cargo','jefe','area','sede','centro_costo','jornada_horas_semana'] loop
      v_laboral := v_laboral || (
        select jsonb_build_object('campo', v_campo,
                 'valor', public.fn_hr_valor_vigente_interno(e.id, v_campo, v_hoy),
                 'nombre', public.fn_hr_nombre_valor(v_campo, public.fn_hr_valor_vigente_interno(e.id, v_campo, v_hoy)),
                 'desde', coalesce(ev.effective_from, e.hire_date),
                 'motivo', ev.reason, 'source', ev.source,
                 'aprobo', public.fn_hr_nombre_usuario(ev.approved_by))
          from (select 1) x
          left join lateral (select * from public.hr_employment_events z
                              where z.employment_id = e.id and z.field = v_campo and z.status = 'aprobado' and z.effective_from <= v_hoy
                              order by z.effective_from desc, z.approved_at desc nulls last limit 1) ev on true);
    end loop;
    select jsonb_build_object('persona_id', je.person_id, 'vinculo_id', je.id, 'nombre', public.fn_hr_nombre_persona(je.person_id),
                              'cargo', jj.name, 'sede', jb.name)
      into v_jefe
      from public.employments je
      left join public.job_positions jj on jj.id = je.position_id
      left join public.branches jb on jb.id = je.branch_id
     where je.id = e.manager_id;
  end if;

  return jsonb_build_object(
    'hoy', v_hoy, 'dias_aviso', v_dias,
    'persona', jsonb_build_object('id', p.id, 'nombre', public.fn_hr_nombre_persona(p.id), 'first_name', p.first_name,
                 'second_name', p.second_name, 'last_name', p.last_name, 'second_last_name', p.second_last_name,
                 'preferred_name', p.preferred_name, 'work_email', p.work_email, 'work_phone', p.work_phone,
                 'tiene_usuario', (p.user_id is not null or e.organization_member_id is not null),
                 'invitacion_pendiente', exists (select 1 from public.invitations iv where iv.hr_person_id = p.id and iv.status = 'pending'
                                                   and (iv.expires_at is null or iv.expires_at > now())),
                 'actualizado', p.updated_at, 'actualizado_por', public.fn_hr_nombre_usuario(p.updated_by)),
    'vinculo', case when e.id is null then null else jsonb_build_object(
                 'id', e.id, 'estado', public.fn_hr_estado_vinculo(e, v_hoy),
                 'cargo_id', e.position_id, 'cargo', (select j.name from public.job_positions j where j.id = e.position_id),
                 'area_id', e.department_id, 'area', (select d.name from public.departments d where d.id = e.department_id),
                 'sede_id', e.branch_id, 'sede', (select b.name from public.branches b where b.id = e.branch_id),
                 'centro_costo_id', e.cost_center_id, 'jefe_id', e.manager_id,
                 'tipo_contrato', e.contract_type, 'fin_contrato', e.contract_end_date, 'tipo_vinculacion', e.employment_type,
                 'ingreso', e.hire_date, 'fin_prueba', e.probation_end_date, 'retiro', e.termination_date,
                 'motivo_retiro', e.termination_reason, 'jornada', e.work_hours_per_week, 'periodo_salario', e.salary_period,
                 'clase_arl', public.fn_hr_clase_arl(e.id)) end,
    'jefe', v_jefe,
    'laboral', v_laboral,
    'afiliaciones', case when e.id is null then '[]'::jsonb else (
        select jsonb_agg(jsonb_build_object('subsistema', s.c,
                 'entidad_id', public.fn_hr_valor_vigente_interno(e.id, s.c, v_hoy) #>> '{}',
                 'entidad', public.fn_hr_nombre_valor(s.c, public.fn_hr_valor_vigente_interno(e.id, s.c, v_hoy)),
                 'desde', (select max(z.effective_from) from public.hr_employment_events z
                            where z.employment_id = e.id and z.field = s.c and z.status = 'aprobado' and z.effective_from <= v_hoy),
                 'pendiente', exists (select 1 from public.hr_employment_events z where z.employment_id = e.id and z.field = s.c and z.status = 'pendiente'))
               order by s.o)
          from unnest(array['eps','afp','arl','ccf','cesantias']) with ordinality as s(c, o)) end,
    'historial', coalesce((select jsonb_agg(jsonb_build_object(
                   'id', z.id, 'campo', z.field, 'desde', z.effective_from,
                   'anterior', case when z.field in ('salario','periodo_salario') then null else z.old_value end,
                   'nuevo', case when z.field in ('salario','periodo_salario') then null else z.new_value end,
                   'anterior_nombre', public.fn_hr_nombre_valor(z.field, case when z.field in ('salario','periodo_salario') then null else z.old_value end),
                   'nuevo_nombre', public.fn_hr_nombre_valor(z.field, case when z.field in ('salario','periodo_salario') then null else z.new_value end),
                   'motivo', z.reason, 'estado', z.status, 'source', z.source,
                   'programado', z.status = 'aprobado' and z.effective_from > v_hoy,
                   'registro', public.fn_hr_nombre_usuario(z.requested_by), 'creado', z.created_at,
                   'aprobo', public.fn_hr_nombre_usuario(z.approved_by), 'aprobado_en', z.approved_at,
                   'instancia_id', z.approval_instance_id,
                   'nota', (select ai.context->>'nota' from public.hr_approval_instances ai where ai.id = z.approval_instance_id),
                   'espera', case when z.status = 'pendiente' then (
                        select jsonb_agg(public.fn_hr_nombre_usuario(u)) from public.hr_approval_instances ai
                          join public.hr_approval_steps st on st.instance_id = ai.id and st.step_order = ai.current_step
                          cross join lateral unnest(st.approver_user_ids) u
                         where ai.id = z.approval_instance_id) end,
                   'rechazo', case when z.status = 'rechazado' then (
                        select jsonb_build_object('por', public.fn_hr_nombre_usuario(dd.actor_user_id), 'en', dd.decided_at, 'comentario', dd.comment)
                          from public.hr_approval_decisions dd where dd.instance_id = z.approval_instance_id and dd.decision = 'rechazar'
                         order by dd.decided_at desc limit 1) end)
                 order by z.effective_from desc, z.created_at desc)
                 from public.hr_employment_events z join public.employments ze on ze.id = z.employment_id
                where ze.person_id = p_person), '[]'::jsonb),
    'alertas', case when e.id is null then '[]'::jsonb else public.fn_hr_alertas_persona(p_org, p_person, e.id, v_hoy, v_dias, v_ver_salario) end,
    'expediente', case when e.id is null then null else jsonb_build_object(
                   'exigidos', to_jsonb(public.fn_hr_documentos_exigidos(e.position_id)),
                   'subidos', (select coalesce(jsonb_agg(distinct d.category), '[]'::jsonb) from public.hr_documents d
                                where d.person_id = p_person and d.status = 'activo'
                                  and d.category = any (public.fn_hr_documentos_exigidos(e.position_id)))) end,
    'documentos_total', (select count(*) from public.hr_documents d where d.person_id = p_person and d.status = 'activo'),
    'certificaciones', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'nombre', c.name, 'entidad', c.issuer,
                          'expedicion', c.issued_on, 'vence', c.expires_on, 'documento_id', c.document_id,
                          'documento_nombre', (select dd.file_name from public.hr_documents dd where dd.id = c.document_id))
                          order by c.expires_on nulls last, c.name)
                        from public.hr_person_certifications c where c.person_id = p_person and c.is_active), '[]'::jsonb),
    'permisos', jsonb_build_object(
                  'grupos', v_permisos,
                  'editar_basico', public.fn_hr_puede_actor(p_actor, p_org, 'hr.employees.edit'),
                  'crear', public.fn_hr_puede_actor(p_actor, p_org, 'hr.employees.create'),
                  'registrar_cambio', e.id is not null and (public.fn_hr_actor_puede_empleo(p_actor, e.id, 'basico', 'editar')
                                       or e.id in (select public.fn_hr_equipo_empleos_actor(p_actor, 'hr.employees.view_team'))),
                  'ver_contactos', public.fn_hr_actor_puede_grupo(p_actor, p_org, p_person, 'identificacion', 'ver')
                                   or (e.id is not null and e.id in (select public.fn_hr_equipo_empleos_actor(p_actor, 'hr.employees.view_team'))),
                  'ver_registro', public.fn_hr_puede_actor(p_actor, p_org, 'hr.access_log.view'),
                  'es_propio', p.user_id = p_actor));
end;
$$;

-- fn_hr_alta_empleado de 6 argumentos (hrm_f1_01_personas_ficha)
drop function if exists public.fn_hr_alta_empleado(uuid, integer, jsonb, jsonb, text, text, text);
create or replace function public.fn_hr_alta_empleado(p_actor uuid, p_org integer, p_datos jsonb, p_ip text, p_ua text, p_ruta text)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_person uuid := nullif(p_datos->>'persona_id', '')::uuid;
  v_existente uuid;
  v_emp uuid;
  v_hire date := (p_datos->>'hire_date')::date;
  v_hoy date := public.fn_today_for(p_org, null);
  v_salario boolean := public.fn_hr_puede_actor(p_actor, p_org, 'hr.data.salario_pago.edit');
  v_campo text;
  v_valor jsonb;
  v_tareas integer := 0;
  v_u uuid;
  e_prev public.employments;
  v_ident jsonb;
begin
  if not public.fn_hr_puede_actor(p_actor, p_org, 'hr.employees.create') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if not public.fn_hr_puede_actor(p_actor, p_org, 'hr.data.identificacion.edit') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if coalesce(btrim(p_datos->>'first_name'), '') = '' or coalesce(btrim(p_datos->>'last_name'), '') = '' then
    raise exception 'nombre_obligatorio' using errcode = '22023';
  end if;
  if coalesce(p_datos->>'doc_type', '') = '' or coalesce(btrim(p_datos->>'doc_number'), '') = '' then
    raise exception 'documento_obligatorio' using errcode = '22023';
  end if;
  if v_hire is null then
    raise exception 'fecha_ingreso_obligatoria' using errcode = '22023';
  end if;
  if nullif(p_datos->>'branch_id', '') is null or not exists (select 1 from public.branches b where b.id = (p_datos->>'branch_id')::integer and b.organization_id = p_org) then
    raise exception 'sede_invalida' using errcode = '22023';
  end if;

  select i.person_id into v_existente from public.hr_people_identification i
   where i.organization_id = p_org and i.doc_type = p_datos->>'doc_type'
     and regexp_replace(i.doc_number, '[^0-9A-Za-z]', '', 'g') = regexp_replace(p_datos->>'doc_number', '[^0-9A-Za-z]', '', 'g');
  if v_existente is not null then
    select * into e_prev from public.employments where id = public.fn_hr_vinculo_actual(v_existente);
    if e_prev.id is not null and public.fn_hr_estado_vinculo(e_prev, v_hoy) <> 'retirado' then
      raise exception 'documento_duplicado: la persona está activa' using errcode = '23505';
    end if;
    if v_person is distinct from v_existente then
      raise exception 'documento_retirado: la persona está retirada; registra un reingreso' using errcode = '55000';
    end if;
  elsif v_person is not null then
    raise exception 'hr: la persona del reingreso no coincide con el documento' using errcode = '22023';
  end if;

  v_ident := jsonb_strip_nulls(jsonb_build_object(
    'doc_type', p_datos->>'doc_type', 'doc_number', regexp_replace(btrim(p_datos->>'doc_number'), '[.\s]', '', 'g'),
    'birth_date', nullif(p_datos->>'birth_date', ''), 'personal_phone', nullif(btrim(coalesce(p_datos->>'personal_phone', '')), ''),
    'personal_email', nullif(lower(btrim(coalesce(p_datos->>'personal_email', ''))), '')));

  if v_person is null then
    insert into public.hr_people (organization_id, first_name, second_name, last_name, second_last_name, work_email, created_by, updated_by)
    values (p_org, btrim(p_datos->>'first_name'), nullif(btrim(coalesce(p_datos->>'second_name', '')), ''),
            btrim(p_datos->>'last_name'), nullif(btrim(coalesce(p_datos->>'second_last_name', '')), ''),
            nullif(lower(btrim(coalesce(p_datos->>'work_email', ''))), ''), p_actor, p_actor)
    returning id into v_person;
  else
    update public.hr_people set status = 'activo', updated_by = p_actor where id = v_person;
  end if;
  perform public.fn_hr_datos_sensibles_guardar(p_actor, p_org, v_person, 'identificacion',
    jsonb_build_object('identificacion', v_ident), p_ip, p_ua, p_ruta);

  insert into public.employments (organization_id, person_id, status, hire_date, employment_type, contract_type, contract_end_date,
                                  position_id, department_id, manager_id, branch_id, work_hours_per_week, salary_period, cost_center_id,
                                  probation_end_date)
  values (p_org, v_person, 'active', v_hire,
          case when p_datos->>'contract_type' = 'apprenticeship' then 'intern' else 'employee' end,
          coalesce(nullif(p_datos->>'contract_type', ''), 'indefinite'), nullif(p_datos->>'contract_end_date', '')::date,
          nullif(p_datos->>'position_id', '')::uuid, nullif(p_datos->>'department_id', '')::uuid, nullif(p_datos->>'manager_id', '')::uuid,
          (p_datos->>'branch_id')::integer, coalesce(nullif(p_datos->>'work_hours_per_week', '')::numeric, 42),
          coalesce(nullif(p_datos->>'salary_period', ''), 'monthly'), nullif(p_datos->>'cost_center_id', '')::uuid,
          nullif(p_datos->>'probation_end_date', '')::date)
  returning id into v_emp;
  -- Valida que cargo, área, jefe y centro de costo sean de la organización.
  foreach v_campo in array array['cargo','area','jefe','centro_costo'] loop
    v_valor := public.fn_hr_valor_columna((select x from public.employments x where x.id = v_emp), v_campo);
    if v_valor is not null and jsonb_typeof(v_valor) <> 'null' then
      perform public.fn_hr_validar_valor(p_org, v_emp, v_campo, v_valor);
    end if;
  end loop;

  -- Valores iniciales con fecha de ingreso: salario (con permiso) y seguridad social.
  if v_salario and nullif(p_datos->>'salario', '') is not null then
    v_valor := public.fn_hr_validar_valor(p_org, v_emp, 'salario', p_datos->'salario');
    insert into public.hr_employment_events (organization_id, employment_id, field, effective_from, old_value, new_value, reason,
                                             status, requested_by, approved_by, approved_at, applied_at)
    values (p_org, v_emp, 'salario', v_hire, null, v_valor, 'Ingreso', 'aprobado', p_actor, p_actor, now(), now());
    perform public.fn_hr_registrar_acceso_interno(p_actor, p_org, v_person, v_emp, 'salario_pago', 'editar', p_ip, p_ua, p_ruta,
      jsonb_build_object('campos', jsonb_build_array('salario'), 'alta', true));
  end if;
  foreach v_campo in array array['eps','afp','arl','ccf','cesantias'] loop
    if nullif(p_datos->>v_campo, '') is not null then
      v_valor := public.fn_hr_validar_valor(p_org, v_emp, v_campo, p_datos->v_campo);
      insert into public.hr_employment_events (organization_id, employment_id, field, effective_from, old_value, new_value, reason,
                                               status, requested_by, approved_by, approved_at, applied_at)
      values (p_org, v_emp, v_campo, v_hire, null, v_valor, 'Ingreso', 'aprobado', p_actor, p_actor, now(), now());
    end if;
  end loop;

  -- Sin permiso de salario: tarea a quien lo tiene (decisión 12).
  if not v_salario or nullif(p_datos->>'salario', '') is null then
    for v_u in select om.user_id from public.organization_members om
                where om.organization_id = p_org and om.is_active and om.user_id <> p_actor
                  and public.fn_hr_puede_actor(om.user_id, p_org, 'hr.data.salario_pago.edit')
                limit 5 loop
      insert into public.tasks (organization_id, title, description, assigned_to, priority, status, created_by, related_to_id, related_to_type, due_date)
      values (p_org, 'Completar el salario de ' || public.fn_hr_nombre_persona(v_person),
              'Recursos humanos › Empleados: el empleado se creó sin salario. Regístralo desde su ficha.',
              v_u, 'high', 'open', p_actor, v_person, 'hr_person', (v_hire::timestamp at time zone public.fn_hr_zona_horaria(p_org, null)));
      v_tareas := v_tareas + 1;
    end loop;
  end if;

  perform public.fn_hr_registrar_acceso_interno(p_actor, p_org, v_person, v_emp, 'basico', 'editar', p_ip, p_ua, p_ruta,
    jsonb_build_object('alta', true, 'reingreso', v_existente is not null));
  return jsonb_build_object('persona_id', v_person, 'vinculo_id', v_emp, 'reingreso', v_existente is not null,
                            'por_ingresar', v_hire > v_hoy, 'tareas', v_tareas, 'salario', v_salario and nullif(p_datos->>'salario', '') is not null);
exception
  when unique_violation then
    raise exception 'documento_duplicado: ya hay una persona con ese documento' using errcode = '23505';
end;
$$;
revoke execute on function public.fn_hr_alta_empleado(uuid, integer, jsonb, text, text, text) from public, anon, authenticated;
grant execute on function public.fn_hr_alta_empleado(uuid, integer, jsonb, text, text, text) to service_role;

-- create_employment_for_new_member (hrm_f1_01_personas_ficha)
create or replace function public.create_employment_for_new_member()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_branch_id integer;
  v_person uuid;
  v_email text;
begin
  if exists (select 1 from public.employments where organization_member_id = new.id) then
    return new;
  end if;

  -- Invitación al portal del empleado (RR. HH.): la persona ya existe sin usuario.
  select lower(u.email) into v_email from auth.users u where u.id = new.user_id;
  if v_email is not null then
    select iv.hr_person_id into v_person
      from public.invitations iv join public.hr_people p on p.id = iv.hr_person_id
     where iv.organization_id = new.organization_id and lower(iv.email) = v_email and iv.hr_person_id is not null
       and p.organization_id = new.organization_id and p.user_id is null
     order by iv.created_at desc limit 1;
  end if;
  if v_person is not null then
    update public.hr_people set user_id = new.user_id, organization_member_id = new.id where id = v_person;
    update public.employments set organization_member_id = new.id
     where id = public.fn_hr_vinculo_actual(v_person) and organization_member_id is null;
    if found then
      return new;
    end if;
  end if;

  select mb.branch_id into v_branch_id from public.member_branches mb
   where mb.organization_member_id = new.id order by mb.id asc limit 1;
  if v_branch_id is null then
    select b.id into v_branch_id from public.branches b
     where b.organization_id = new.organization_id and b.is_main = true and b.is_active = true limit 1;
  end if;
  insert into public.employments (organization_member_id, person_id, status, hire_date, employment_type, contract_type, work_location,
                                  work_hours_per_week, currency_code, salary_period, branch_id)
  values (new.id, v_person, 'active', public.fn_today_for(new.organization_id, v_branch_id), 'employee', 'indefinite', 'onsite',
          48, public.fn_moneda_base_organizacion(new.organization_id), 'monthly', v_branch_id);
  return new;
end;
$$;

drop function if exists public.fn_hr_estado_acceso(uuid);
