-- HRM · Marcación M0 · paso 3: pantallas de RR. HH. (Figma 20.26–20.28 y 20.31).
-- «En vivo», métodos por sede, puntos de marcación (pantalla de QR y etiqueta NFC),
-- pantalla del QR, excepciones temporales y el método de cada marca en Asistencia.
-- Lecturas con hr.attendance.view (o el equipo del jefe); escrituras con
-- hr.attendance.manage. Todas para service_role: las llama el servidor con el actor
-- de getServerOrgContext().

-- 1. Asistencia › Hoy: «Cómo» usa el método exacto cuando existe --------------------------
create or replace function public.fn_hr_asistencia_hoy(p_actor uuid, p_org integer, p_branch integer default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_amb text := public.fn_hr_asistencia_ambito(p_actor, p_org);
  v_salud boolean := public.fn_hr_puede_actor(p_actor, p_org, 'hr.data.salud.view');
  v_hoy date := public.fn_today_for(p_org, p_branch);
  v_tol numeric;
  v_filas jsonb;
begin
  if v_amb is null then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if p_branch is not null and not exists (select 1 from public.branches b where b.id = p_branch and b.organization_id = p_org) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  -- La tolerancia es de la empresa (libre); sin valor vigente, cualquier minuto cuenta como tarde.
  begin
    v_tol := public.fn_hr_parametro(p_org, 'tardanza_tolerancia_minutos', v_hoy);
  exception when others then
    v_tol := 0;
  end;

  with vis as (
    select e.* from public.employments e
     where e.id in (select public.fn_hr_asistencia_vinculos(p_actor, p_org))
       and coalesce(e.status, 'active') = 'active'
  ),
  turno as (
    select distinct on (s.employment_id) s.*, st.name as plantilla
      from public.shift_assignments s
      join vis on vis.id = s.employment_id
      left join public.shift_templates st on st.id = s.shift_template_id
     where s.work_date = v_hoy and not s.is_draft
       and coalesce(s.status, 'scheduled') not in ('cancelled', 'swapped')
     order by s.employment_id, s.is_rest_day, s.start_at
  ),
  ev as (
    select a.employment_id,
           min(a.event_at) filter (where a.event_type = 'check_in') as entrada,
           max(a.event_at) filter (where a.event_type = 'check_out') as salida,
           (array_agg(a.event_type order by a.event_at desc, a.created_at desc))[1] as ultimo,
           (array_agg(a.source order by a.event_at) filter (where a.event_type = 'check_in'))[1] as fuente,
           (array_agg(a.method order by a.event_at) filter (where a.event_type = 'check_in'))[1] as metodo,
           (array_agg(a.geo is not null order by a.event_at) filter (where a.event_type = 'check_in'))[1] as con_ubicacion,
           bool_or(a.work_mode = 'remoto') as remoto
      from public.attendance_events a
      join vis on vis.id = a.employment_id
     where a.work_date = v_hoy
     group by a.employment_id
  ),
  aus as (
    select distinct on (l.employment_id) l.employment_id, lt.data_group, lt.legal_class, lt.name,
           public.fn_hr_vinculo_es_del_actor(p_actor, l.employment_id) as propio
      from public.leave_requests l
      join public.leave_types lt on lt.id = l.leave_type_id
      join vis on vis.id = l.employment_id
     where l.status in ('approved', 'taken') and v_hoy between l.start_date and l.end_date
     order by l.employment_id, l.start_date
  ),
  filas as (
    select vis.id, vis.branch_id, t.employment_id is not null and not t.is_rest_day as con_turno,
           t.plantilla, t.start_at, t.end_at, ev.entrada, ev.salida, ev.ultimo, ev.fuente, ev.metodo, ev.con_ubicacion,
           coalesce(ev.remoto, false) as remoto,
           aus.employment_id is not null as ausente, aus.data_group, aus.legal_class, aus.name as ausencia_nombre, aus.propio
      from vis
      left join turno t on t.employment_id = vis.id
      left join ev on ev.employment_id = vis.id
      left join aus on aus.employment_id = vis.id
     where (t.employment_id is not null and not t.is_rest_day) or ev.employment_id is not null or aus.employment_id is not null
  )
  select coalesce(jsonb_agg(
           public.fn_hr_asistencia_persona(f.id) || jsonb_build_object(
             'turno', case when f.con_turno then jsonb_build_object('nombre', f.plantilla, 'inicio', f.start_at, 'fin', f.end_at) end,
             'entrada', f.entrada, 'salida', f.salida,
             'como', case when f.entrada is null then null
                          when f.remoto then 'remoto'
                          when f.fuente = 'manual' or f.metodo = 'manual' then 'manual'
                          when f.metodo = 'nfc_etiqueta' or f.fuente = 'nfc' then 'nfc'
                          when f.metodo in ('carne_nfc', 'carne_qr') then 'carne'
                          when f.metodo in ('pin', 'rostro', 'huella') then f.metodo
                          when f.fuente = 'qr' then 'qr'
                          when f.con_ubicacion then 'ubicacion'
                          else 'app' end,
             'tarde_minutos', case when f.entrada is not null and f.start_at is not null
                                        and f.entrada > f.start_at + make_interval(mins => v_tol::integer)
                                   then floor(extract(epoch from (f.entrada - f.start_at)) / 60)::integer end,
             'estado', case
                 when f.ausente and f.entrada is null then 'ausencia'
                 when f.ultimo = 'break_start' then 'descanso'
                 when f.entrada is not null and f.ultimo = 'check_out' then 'salio'
                 when f.entrada is not null and f.start_at is not null
                      and f.entrada > f.start_at + make_interval(mins => v_tol::integer) then 'tarde'
                 when f.entrada is not null then 'presente'
                 when f.con_turno and f.start_at <= now() then 'falta'
                 else 'por_llegar' end,
             'remoto', f.remoto,
             -- Salud: el tipo solo con el grupo en toda la organización (o lo propio).
             'ausencia', case when not f.ausente then null
                 when f.data_group = 'salud' and not ((v_amb = 'organizacion' and v_salud) or f.propio)
                   then jsonb_build_object('clase', case when v_amb = 'organizacion' then 'incapacidad' else 'justificada' end)
                 else jsonb_build_object('clase', coalesce(f.legal_class, 'licencia'), 'nombre', f.ausencia_nombre) end)
         ), '[]'::jsonb)
    into v_filas
    from filas f
   where p_branch is null or f.branch_id = p_branch;

  return jsonb_build_object(
    'fecha', v_hoy, 'ahora', now(), 'zona', public.fn_timezone_for(p_org, p_branch), 'ambito', v_amb,
    'puede_gestionar', public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.manage'),
    'festivo', (select h.name from public.hr_holidays h where h.country_code = public.fn_hr_pais(p_org) and h.holiday_date = v_hoy limit 1),
    'tolerancia_minutos', v_tol,
    'filas', v_filas);
end;
$function$;

-- 2. Marcación › En vivo (Figma 20.26) ------------------------------------------------------
create or replace function public.fn_hr_marcacion_en_vivo(p_actor uuid, p_org integer, p_branch integer default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_amb text := public.fn_hr_asistencia_ambito(p_actor, p_org);
  v_hoy date := public.fn_today_for(p_org, p_branch);
  v_tz text := public.fn_timezone_for(p_org, p_branch);
  v_tol numeric;
  v_marcas jsonb;
  v_intentos jsonb;
  v_ind jsonb;
  v_vis uuid[];
begin
  if v_amb is null then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if p_branch is not null and not exists (select 1 from public.branches b where b.id = p_branch and b.organization_id = p_org) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  begin
    v_tol := public.fn_hr_parametro(p_org, 'tardanza_tolerancia_minutos', v_hoy);
  exception when others then
    v_tol := 0;
  end;

  v_vis := array(select e.id from public.employments e
                  where e.id in (select public.fn_hr_asistencia_vinculos(p_actor, p_org))
                    and (p_branch is null or e.branch_id = p_branch));

  select coalesce(jsonb_agg(m order by (m->>'hora') desc), '[]'::jsonb) into v_marcas
    from (
      select public.fn_hr_asistencia_persona(a.employment_id) || jsonb_build_object(
               'id', a.id,
               'tipo', a.event_type,
               'hora', a.event_at,
               'metodo', coalesce(a.method,
                            case when a.is_manual_entry or a.source = 'manual' then 'manual'
                                 when a.work_mode = 'remoto' then 'remoto'
                                 when a.source = 'qr' then 'qr'
                                 when a.source = 'nfc' then 'nfc_etiqueta'
                                 else 'celular_ubicacion' end),
               'punto', c.name,
               'punto_id', c.id,
               'punto_tipo', c.kind,
               'sede_marca', b.name,
               'distancia_m', case when a.geo is not null and b.latitude is not null and b.longitude is not null then
                   round(2 * 6371000 * asin(sqrt(
                     power(sin(radians((b.latitude - (a.geo->>'lat')::numeric) / 2)), 2)
                   + cos(radians((a.geo->>'lat')::numeric)) * cos(radians(b.latitude))
                   * power(sin(radians((b.longitude - (a.geo->>'lng')::numeric) / 2)), 2)))) end,
               'ubicacion_validada', a.geo_validated,
               'revisar', a.device_info->>'revisar',
               'manual', coalesce(a.is_manual_entry, false),
               'registrada_por', case when a.is_manual_entry then
                   (select nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), '') from public.profiles p where p.id = a.created_by) end,
               'tarde_minutos', case when a.event_type = 'check_in' and s.start_at is not null
                                          and a.event_at > s.start_at + make_interval(mins => coalesce(v_tol, 0)::integer)
                                     then floor(extract(epoch from (a.event_at - s.start_at)) / 60)::integer end) as m
        from public.attendance_events a
        left join public.time_clocks c on c.id = a.time_clock_id
        left join public.branches b on b.id = a.branch_id
        left join lateral (
          select s.start_at from public.shift_assignments s
           where s.employment_id = a.employment_id and s.work_date = a.work_date and not s.is_draft and not s.is_rest_day
             and coalesce(s.status, 'scheduled') not in ('cancelled', 'swapped')
           order by s.start_at limit 1) s on true
       where a.organization_id = p_org and a.work_date = v_hoy and a.employment_id = any (v_vis)
         and (p_branch is null or a.branch_id = p_branch or a.branch_id is null)
       order by a.event_at desc
       limit 500) x(m);

  select coalesce(jsonb_agg(i order by (i->>'hora') desc), '[]'::jsonb) into v_intentos
    from (
      select public.fn_hr_asistencia_persona(t.employment_id) || jsonb_build_object(
               'id', t.id, 'hora', t.created_at, 'metodo', t.metodo, 'motivo', t.motivo,
               'distancia_m', t.detalle->'distancia_m', 'punto', c.name) as i
        from public.hr_marcacion_intentos t
        left join public.time_clocks c on c.id = t.time_clock_id
       where t.organization_id = p_org and t.employment_id = any (v_vis) and (t.created_at at time zone v_tz)::date = v_hoy
         and t.created_at > now() - interval '2 days'
       order by t.created_at desc
       limit 200) y(i);

  with turnos as (
    select distinct on (s.employment_id) s.employment_id, s.start_at
      from public.shift_assignments s
     where s.employment_id = any (v_vis) and s.work_date = v_hoy and not s.is_draft and not s.is_rest_day
       and coalesce(s.status, 'scheduled') not in ('cancelled', 'swapped')
     order by s.employment_id, s.start_at
  ),
  entradas as (
    select distinct a.employment_id from public.attendance_events a
     where a.organization_id = p_org and a.employment_id = any (v_vis) and a.work_date = v_hoy and a.event_type = 'check_in'
  )
  select jsonb_build_object(
           'con_turno', (select count(*) from turnos),
           'marcaron', (select count(*) from entradas),
           'sin_marcar', (select count(*) from turnos t where t.start_at <= now()
                           and not exists (select 1 from entradas e where e.employment_id = t.employment_id)),
           'por_revisar', (select count(*) from jsonb_array_elements(v_marcas) x
                            where x->>'revisar' is not null or (x->>'manual')::boolean),
           'sin_senal', (select count(*) from jsonb_array_elements(v_marcas) x where x->>'revisar' = 'fuera_de_linea'),
           'rechazadas', jsonb_array_length(v_intentos),
           'puntos', (select count(*) from public.time_clocks c
                       where c.organization_id = p_org and c.kind in ('pantalla_qr', 'etiqueta_nfc')
                         and coalesce(c.is_active, false) and c.disabled_at is null
                         and (p_branch is null or c.branch_id = p_branch)),
           'pantallas', (select count(*) from public.time_clocks c
                          where c.organization_id = p_org and c.kind = 'pantalla_qr'
                            and coalesce(c.is_active, false) and c.disabled_at is null
                            and (p_branch is null or c.branch_id = p_branch)),
           'pantallas_en_linea', (select count(*) from public.time_clocks c
                          where c.organization_id = p_org and c.kind = 'pantalla_qr'
                            and coalesce(c.is_active, false) and c.disabled_at is null
                            and c.last_seen_at > now() - interval '2 minutes'
                            and (p_branch is null or c.branch_id = p_branch)))
    into v_ind;

  return jsonb_build_object(
    'fecha', v_hoy, 'ahora', now(), 'zona', v_tz, 'ambito', v_amb,
    'puede_gestionar', public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.manage'),
    'indicadores', v_ind,
    'por_metodo', coalesce((select jsonb_object_agg(k, n) from (
                     select x->>'metodo' as k, count(*) as n from jsonb_array_elements(v_marcas) x
                      where x->>'tipo' = 'check_in' group by 1) z), '{}'::jsonb),
    'marcas', v_marcas,
    'intentos', v_intentos);
end;
$function$;
revoke all on function public.fn_hr_marcacion_en_vivo(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.fn_hr_marcacion_en_vivo(uuid, integer, integer) to service_role;

-- 3. Métodos por sede (Figma 20.27) --------------------------------------------------------
create or replace function public.fn_hr_metodos_sede_leer(p_actor uuid, p_org integer, p_branch integer default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_branch integer := p_branch;
  v_sede public.branches;
begin
  if not (public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.view')
          or public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.manage')) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if v_branch is null then
    select b.id into v_branch from public.branches b
     where b.organization_id = p_org and coalesce(b.is_active, true)
     order by b.is_main desc nulls last, b.id limit 1;
  end if;
  select * into v_sede from public.branches b where b.id = v_branch and b.organization_id = p_org;
  if v_sede.id is null then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'sede', jsonb_build_object('id', v_sede.id, 'nombre', v_sede.name, 'direccion', v_sede.address,
                               'con_ubicacion', v_sede.latitude is not null and v_sede.longitude is not null),
    'sedes', (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'nombre', b.name) order by b.name), '[]'::jsonb)
                from public.branches b where b.organization_id = p_org and coalesce(b.is_active, true)),
    'puede_gestionar', public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.manage'),
    'metodos', public.fn_hr_metodos_sede(p_org, v_sede.id),
    'etiquetas', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'nombre', c.name) order by c.name), '[]'::jsonb)
                    from public.time_clocks c where c.organization_id = p_org and c.branch_id = v_sede.id
                     and c.kind = 'etiqueta_nfc' and coalesce(c.is_active, false) and c.disabled_at is null),
    'pantallas', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'nombre', c.name) order by c.name), '[]'::jsonb)
                    from public.time_clocks c where c.organization_id = p_org and c.branch_id = v_sede.id
                     and c.kind = 'pantalla_qr' and coalesce(c.is_active, false) and c.disabled_at is null),
    'personas', (select count(*) from public.employments e
                  where e.organization_id = p_org and e.branch_id = v_sede.id and e.status = 'active'),
    'personas_remoto', (select count(*) from public.employments e
                         join public.hr_attendance_settings s on s.employment_id = e.id
                        where e.organization_id = p_org and e.branch_id = v_sede.id and e.status = 'active'
                          and s.modalidad in ('remoto', 'hibrido')));
end;
$function$;
revoke all on function public.fn_hr_metodos_sede_leer(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.fn_hr_metodos_sede_leer(uuid, integer, integer) to service_role;

-- Guardar: solo los métodos que existen en M0. Kiosco y terminales llegan con M1 y M2.
create or replace function public.fn_hr_metodos_sede_guardar(p_actor uuid, p_org integer, p_branch integer, p_metodos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_m text;
  v_d jsonb;
  v_activo boolean;
  v_reglas jsonb;
  v_radio integer;
  v_activos integer := 0;
  v_actual jsonb;
begin
  if not public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.manage') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if p_branch is null or not exists (select 1 from public.branches b where b.id = p_branch and b.organization_id = p_org) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if jsonb_typeof(p_metodos) <> 'object' then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  for v_m in select jsonb_object_keys(p_metodos) loop
    if v_m not in ('celular_ubicacion', 'qr', 'nfc_etiqueta') then
      raise exception 'metodo_no_disponible: % llega con el kiosco o los terminales', v_m using errcode = '22023';
    end if;
  end loop;

  v_actual := public.fn_hr_metodos_sede(p_org, p_branch);
  foreach v_m in array array['celular_ubicacion', 'qr', 'nfc_etiqueta'] loop
    v_d := coalesce(p_metodos->v_m, jsonb_build_object('activo', (v_actual->v_m->>'activo')::boolean, 'reglas', v_actual->v_m->'reglas'));
    if jsonb_typeof(v_d->'activo') <> 'boolean' then
      raise exception 'datos_invalidos: activo' using errcode = '22023';
    end if;
    v_activo := (v_d->>'activo')::boolean;
    v_reglas := '{}'::jsonb;
    if v_m = 'celular_ubicacion' then
      begin
        v_radio := coalesce((v_d->'reglas'->>'radio_m')::numeric, 150)::integer;
      exception when others then
        raise exception 'radio_invalido: entre 20 y 2000 m' using errcode = '22023';
      end;
      if v_radio not between 20 and 2000 then
        raise exception 'radio_invalido: entre 20 y 2000 m' using errcode = '22023';
      end if;
      v_reglas := jsonb_build_object('radio_m', v_radio,
                                     'permitir_computador', coalesce((v_d->'reglas'->>'permitir_computador')::boolean, true));
    elsif v_m = 'qr' then
      v_reglas := jsonb_build_object('exigir_ubicacion', coalesce((v_d->'reglas'->>'exigir_ubicacion')::boolean, false));
    end if;
    if v_activo then
      v_activos := v_activos + 1;
    end if;
    insert into public.hr_branch_clock_methods (organization_id, branch_id, method, enabled, rules, updated_by, updated_at)
    values (p_org, p_branch, v_m, v_activo, v_reglas, p_actor, now())
    on conflict (branch_id, method) do update
      set enabled = excluded.enabled, rules = excluded.rules, updated_by = excluded.updated_by, updated_at = now();
  end loop;
  if v_activos = 0 then
    raise exception 'sin_metodos: la sede necesita al menos un método activo (celular, QR o etiqueta)' using errcode = '22023';
  end if;
  return public.fn_hr_metodos_sede(p_org, p_branch);
end;
$function$;
revoke all on function public.fn_hr_metodos_sede_guardar(uuid, integer, integer, jsonb) from public, anon, authenticated;
grant execute on function public.fn_hr_metodos_sede_guardar(uuid, integer, integer, jsonb) to service_role;

-- 4. Puntos de marcación: pantalla de QR y etiqueta NFC (Figma 20.28, parte de M0) ----------
create or replace function public.fn_hr_dispositivos(p_actor uuid, p_org integer, p_branch integer default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_hoy date := public.fn_today_for(p_org, p_branch);
begin
  if not (public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.view')
          or public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.manage')) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if p_branch is not null and not exists (select 1 from public.branches b where b.id = p_branch and b.organization_id = p_org) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'puede_gestionar', public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.manage'),
    'ahora', now(),
    'dispositivos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id, 'nombre', c.name, 'tipo', c.kind, 'tipo_legado', c.type,
               'sede_id', c.branch_id, 'sede', b.name, 'descripcion', c.location_description,
               'activo', coalesce(c.is_active, false) and c.disabled_at is null,
               'ultima_conexion', c.last_seen_at,
               'chip', c.settings->>'chip',
               'hoy', (select count(*) from public.attendance_events a where a.time_clock_id = c.id and a.work_date = v_hoy))
             order by (coalesce(c.is_active, false) and c.disabled_at is null) desc, c.name)
        from public.time_clocks c
        left join public.branches b on b.id = c.branch_id
       where c.organization_id = p_org and (p_branch is null or c.branch_id = p_branch)), '[]'::jsonb));
end;
$function$;
revoke all on function public.fn_hr_dispositivos(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.fn_hr_dispositivos(uuid, integer, integer) to service_role;

-- Alta. La etiqueta devuelve su código UNA vez (se guarda solo el hash); la pantalla
-- guarda su clave del QR y la lee después con fn_hr_pantalla_qr.
create or replace function public.fn_hr_dispositivo_crear(p_actor uuid, p_org integer, p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_tipo text := p_datos->>'tipo';
  v_nombre text := btrim(coalesce(p_datos->>'nombre', ''));
  v_sede integer;
  v_chip text := coalesce(nullif(p_datos->>'chip', ''), 'ntag215');
  v_desc text := nullif(btrim(coalesce(p_datos->>'descripcion', '')), '');
  v_id uuid;
  v_codigo text;
begin
  if not public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.manage') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if v_tipo not in ('pantalla_qr', 'etiqueta_nfc') then
    raise exception 'tipo_no_disponible: en esta fase se agregan pantallas de QR y etiquetas NFC' using errcode = '22023';
  end if;
  if char_length(v_nombre) not between 2 and 80 then
    raise exception 'nombre_invalido: de 2 a 80 caracteres' using errcode = '22023';
  end if;
  if v_desc is not null and char_length(v_desc) > 200 then
    raise exception 'descripcion_invalida: hasta 200 caracteres' using errcode = '22023';
  end if;
  begin
    v_sede := (p_datos->>'sede_id')::integer;
  exception when others then
    v_sede := null;
  end;
  if v_sede is null or not exists (select 1 from public.branches b where b.id = v_sede and b.organization_id = p_org) then
    raise exception 'sede_invalida' using errcode = '22023';
  end if;
  if v_tipo = 'etiqueta_nfc' and v_chip not in ('ntag215', 'ntag213', 'ntag424') then
    raise exception 'chip_invalido' using errcode = '22023';
  end if;

  insert into public.time_clocks (organization_id, branch_id, name, type, kind, protocol, location_description,
                                  settings, is_active, paired_at)
  values (p_org, v_sede, v_nombre, case v_tipo when 'pantalla_qr' then 'qr_dynamic' else 'nfc' end, v_tipo, 'ninguno', v_desc,
          case when v_tipo = 'etiqueta_nfc' then jsonb_build_object('chip', v_chip) else '{}'::jsonb end, true, now())
  returning id into v_id;

  if v_tipo = 'pantalla_qr' then
    insert into public.hr_clock_secrets (time_clock_id, organization_id, qr_secret)
    values (v_id, p_org, encode(extensions.gen_random_bytes(32), 'hex'));
  else
    v_codigo := translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/', '-_');
    insert into public.hr_clock_secrets (time_clock_id, organization_id, tag_hash)
    values (v_id, p_org, encode(extensions.digest(v_codigo, 'sha256'), 'hex'));
  end if;
  return jsonb_build_object('id', v_id, 'tipo', v_tipo, 'codigo', v_codigo);
end;
$function$;
revoke all on function public.fn_hr_dispositivo_crear(uuid, integer, jsonb) from public, anon, authenticated;
grant execute on function public.fn_hr_dispositivo_crear(uuid, integer, jsonb) to service_role;

-- Regenerar la clave: la pantalla vieja y la etiqueta vieja dejan de servir al instante.
create or replace function public.fn_hr_dispositivo_regenerar(p_actor uuid, p_org integer, p_reloj uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  c public.time_clocks;
  v_codigo text;
begin
  if not public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.manage') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  select * into c from public.time_clocks t where t.id = p_reloj and t.organization_id = p_org for update;
  if c.id is null or c.kind not in ('pantalla_qr', 'etiqueta_nfc') then
    raise exception 'hr: el punto de marcación no existe' using errcode = 'P0002';
  end if;
  if c.kind = 'pantalla_qr' then
    insert into public.hr_clock_secrets (time_clock_id, organization_id, qr_secret, rotated_at)
    values (c.id, p_org, encode(extensions.gen_random_bytes(32), 'hex'), now())
    on conflict (time_clock_id) do update set qr_secret = excluded.qr_secret, rotated_at = now();
  else
    v_codigo := translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/', '-_');
    insert into public.hr_clock_secrets (time_clock_id, organization_id, tag_hash, rotated_at)
    values (c.id, p_org, encode(extensions.digest(v_codigo, 'sha256'), 'hex'), now())
    on conflict (time_clock_id) do update set tag_hash = excluded.tag_hash, rotated_at = now();
  end if;
  update public.time_clocks set updated_at = now() where id = c.id;
  return jsonb_build_object('id', c.id, 'tipo', c.kind, 'codigo', v_codigo);
end;
$function$;
revoke all on function public.fn_hr_dispositivo_regenerar(uuid, integer, uuid) from public, anon, authenticated;
grant execute on function public.fn_hr_dispositivo_regenerar(uuid, integer, uuid) to service_role;

-- Desactivar o reactivar. Nunca se borra: las marcas lo referencian.
create or replace function public.fn_hr_dispositivo_activar(p_actor uuid, p_org integer, p_reloj uuid, p_activo boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  c public.time_clocks;
begin
  if not public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.manage') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if p_activo is null then
    raise exception 'datos_invalidos' using errcode = '22023';
  end if;
  update public.time_clocks t
     set is_active = p_activo, disabled_at = case when p_activo then null else now() end
   where t.id = p_reloj and t.organization_id = p_org
  returning * into c;
  if c.id is null then
    raise exception 'hr: el punto de marcación no existe' using errcode = 'P0002';
  end if;
  return jsonb_build_object('id', c.id, 'activo', p_activo);
end;
$function$;
revoke all on function public.fn_hr_dispositivo_activar(uuid, integer, uuid, boolean) from public, anon, authenticated;
grant execute on function public.fn_hr_dispositivo_activar(uuid, integer, uuid, boolean) to service_role;

-- 5. Pantalla del QR ----------------------------------------------------------------------
-- La abre RR. HH. (hr.attendance.manage) en un televisor o monitor. Con la clave calcula
-- el código en el navegador cada 30 s, también sin internet. La vinculación con clave
-- propia del dispositivo (sin sesión de una persona) llega con el kiosco (M1).
create or replace function public.fn_hr_pantalla_qr(p_actor uuid, p_org integer, p_reloj uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  c public.time_clocks;
  v_secreto text;
begin
  if not public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.manage') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  select * into c from public.time_clocks t where t.id = p_reloj and t.organization_id = p_org;
  if c.id is null or c.kind is distinct from 'pantalla_qr' then
    raise exception 'hr: el punto de marcación no existe' using errcode = 'P0002';
  end if;
  if not coalesce(c.is_active, false) or c.disabled_at is not null then
    raise exception 'punto_inactivo: la pantalla está desactivada' using errcode = '55000';
  end if;
  select s.qr_secret into v_secreto from public.hr_clock_secrets s where s.time_clock_id = c.id;
  update public.time_clocks set last_seen_at = now() where id = c.id;
  return jsonb_build_object(
    'reloj_id', c.id, 'org', p_org, 'nombre', c.name,
    'sede', (select b.name from public.branches b where b.id = c.branch_id),
    'zona', public.fn_timezone_for(p_org, c.branch_id),
    'clave', v_secreto, 'segundos', 30, 'ahora', now());
end;
$function$;
revoke all on function public.fn_hr_pantalla_qr(uuid, integer, uuid) from public, anon, authenticated;
grant execute on function public.fn_hr_pantalla_qr(uuid, integer, uuid) to service_role;

-- La pantalla pregunta qué códigos del paso ya se usaron para pasar al siguiente.
-- Marca la conexión como mucho una vez por minuto.
create or replace function public.fn_hr_pantalla_qr_usos(p_actor uuid, p_org integer, p_reloj uuid, p_paso bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  c public.time_clocks;
begin
  if not public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.manage') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  select * into c from public.time_clocks t where t.id = p_reloj and t.organization_id = p_org;
  if c.id is null or c.kind is distinct from 'pantalla_qr' then
    raise exception 'hr: el punto de marcación no existe' using errcode = 'P0002';
  end if;
  if c.last_seen_at is null or c.last_seen_at < now() - interval '1 minute' then
    update public.time_clocks set last_seen_at = now() where id = c.id;
  end if;
  return jsonb_build_object(
    'paso', p_paso,
    'usado_hasta', (select max(u.n) from public.hr_qr_usos u where u.time_clock_id = c.id and u.paso = p_paso),
    'activo', coalesce(c.is_active, false) and c.disabled_at is null,
    'ahora', now());
end;
$function$;
revoke all on function public.fn_hr_pantalla_qr_usos(uuid, integer, uuid, bigint) from public, anon, authenticated;
grant execute on function public.fn_hr_pantalla_qr_usos(uuid, integer, uuid, bigint) to service_role;

-- 6. Excepción temporal (decisión del 2026-11-16) -----------------------------------------
create or replace function public.fn_hr_excepcion_crear(p_actor uuid, p_org integer, p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_vinculo uuid;
  v_desde timestamptz;
  v_hasta timestamptz;
  v_x public.hr_marcacion_excepciones;
begin
  if not public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.manage') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  begin
    v_vinculo := (p_datos->>'vinculo_id')::uuid;
    v_desde := coalesce((p_datos->>'desde')::timestamptz, now());
    v_hasta := (p_datos->>'hasta')::timestamptz;
  exception when others then
    raise exception 'datos_invalidos' using errcode = '22023';
  end;
  if v_vinculo is null or not exists (select 1 from public.employments e where e.id = v_vinculo and e.organization_id = p_org) then
    raise exception 'hr: el vínculo no existe' using errcode = 'P0002';
  end if;
  -- Nadie se aprueba su propia excepción.
  if public.fn_hr_vinculo_es_del_actor(p_actor, v_vinculo) then
    raise exception 'no_propio: una excepción para ti la aprueba otra persona de RR. HH.' using errcode = '42501';
  end if;
  if coalesce(p_datos->>'metodo', '') not in ('celular_ubicacion', 'qr', 'nfc_etiqueta') then
    raise exception 'metodo_invalido' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_datos->>'motivo', ''))) not between 5 and 500 then
    raise exception 'motivo_requerido: de 5 a 500 caracteres' using errcode = '22023';
  end if;
  if v_hasta is null or v_hasta <= now() or v_hasta <= v_desde or v_hasta > v_desde + interval '92 days'
     or v_desde < now() - interval '1 day' then
    raise exception 'vigencia_invalida: hasta 92 días desde hoy' using errcode = '22023';
  end if;
  insert into public.hr_marcacion_excepciones (organization_id, employment_id, metodo, motivo, vigente_desde, vigente_hasta, aprobado_por)
  values (p_org, v_vinculo, p_datos->>'metodo', btrim(p_datos->>'motivo'), v_desde, v_hasta, p_actor)
  returning * into v_x;
  return to_jsonb(v_x);
end;
$function$;
revoke all on function public.fn_hr_excepcion_crear(uuid, integer, jsonb) from public, anon, authenticated;
grant execute on function public.fn_hr_excepcion_crear(uuid, integer, jsonb) to service_role;

create or replace function public.fn_hr_excepcion_revocar(p_actor uuid, p_org integer, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_x public.hr_marcacion_excepciones;
begin
  if not public.fn_hr_puede_actor(p_actor, p_org, 'hr.attendance.manage') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  update public.hr_marcacion_excepciones x
     set revocada_at = now(), revocada_por = p_actor
   where x.id = p_id and x.organization_id = p_org and x.revocada_at is null
  returning * into v_x;
  if v_x.id is null then
    raise exception 'hr: la excepción no existe o ya se revocó' using errcode = 'P0002';
  end if;
  return to_jsonb(v_x);
end;
$function$;
revoke all on function public.fn_hr_excepcion_revocar(uuid, integer, uuid) from public, anon, authenticated;
grant execute on function public.fn_hr_excepcion_revocar(uuid, integer, uuid) to service_role;

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
             'id', x.id, 'metodo', x.metodo, 'motivo', x.motivo, 'desde', x.vigente_desde, 'hasta', x.vigente_hasta,
             'vigente', x.revocada_at is null and x.vigente_desde <= now() and x.vigente_hasta > now(),
             'revocada_at', x.revocada_at,
             'aprobado_por', (select nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), '') from public.profiles p where p.id = x.aprobado_por))
           order by x.created_at desc)
      from public.hr_marcacion_excepciones x
     where x.organization_id = p_org and (p_vinculo is null or x.employment_id = p_vinculo)
       and x.created_at > now() - interval '180 days'), '[]'::jsonb);
end;
$function$;
revoke all on function public.fn_hr_excepciones(uuid, integer, uuid) from public, anon, authenticated;
grant execute on function public.fn_hr_excepciones(uuid, integer, uuid) to service_role;
