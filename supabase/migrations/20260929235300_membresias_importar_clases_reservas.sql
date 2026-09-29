-- Membresías fase 3 · Importación CSV de clases y de reservas (docs/design/MEMBRESIAS-FASE-1-2.md §13).
--
-- Dos RPC transaccionales, TODO O NADA: validan todas las filas contra la base y, si alguna tiene un
-- error, no escriben nada y devuelven el reporte por fila. Con `p_solo_validar = true` solo validan
-- (vista previa del diálogo). El navegador ya normalizó el archivo (fechas `YYYY-MM-DD`, horas `HH:MM`,
-- valores de la base); aquí se vuelve a validar todo porque el cuerpo viene del cliente.
--   - organización: la del parámetro, que la ruta toma de la sesión; fn_membresias_int_exigir
--     comprueba pertenencia (fn_assert_acceso_org) y el permiso memberships.classes.manage;
--   - máximo 500 filas por importación;
--   - fecha + hora se interpretan en la zona de la sede (fn_timezone_for), nunca en la del navegador;
--   - clases: sede por nombre, código o id (opcional si la organización tiene una sola sede activa),
--     instructor por correo de un miembro activo de la organización; duplicadas en el archivo o ya
--     existentes (misma sede, título e inicio, no canceladas) se rechazan;
--   - reservas: miembro por documento (identification_number) o correo; clase por título + fecha y hora
--     (+ sede opcional para desempatar); cupo, clase cancelada/no programada, reserva ya existente
--     (UNIQUE clase-cliente) y duplicadas en el archivo se rechazan; la sede debe ser accesible para
--     quien importa (app_branch_access, igual que la política restrictiva de class_reservations).
-- Reservas importadas como `checked_in` no crean filas en member_checkins (histórico, sin validar
-- membresía): la entrada con reglas es la de fn_membresia_registrar_checkin.

create or replace function public.fn_membresias_importar_clases(
  p_organization_id integer,
  p_filas jsonb,
  p_solo_validar boolean default false)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  c_max constant integer := 500;
  v_total integer;
  v_fila jsonb;
  v_n integer;
  v_num integer;
  v_err text[];
  v_titulo text;
  v_sede_txt text;
  v_instr_txt text;
  v_fecha text;
  v_hora text;
  v_txt text;
  v_duracion integer;
  v_capacidad integer;
  v_nivel text;
  v_estado text;
  v_sede integer;
  v_unica integer;
  v_cuantas integer;
  v_instr uuid;
  v_tz text;
  v_inicio timestamptz;
  v_clave text;
  v_claves text[] := '{}';
  v_reporte jsonb := '[]'::jsonb;
  v_validas jsonb := '[]'::jsonb;
  v_con_error integer := 0;
  v_ids integer[] := '{}';
  v_id integer;
begin
  perform public.fn_membresias_int_exigir(p_organization_id, array['memberships.classes.manage']);
  if p_filas is null or jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) = 0 then
    raise exception 'importacion_sin_filas' using errcode = '22023';
  end if;
  v_total := jsonb_array_length(p_filas);
  if v_total > c_max then
    raise exception 'importacion_demasiadas_filas' using errcode = '22023';
  end if;

  select case when count(*) = 1 then min(b.id) end into v_unica
    from public.branches b
   where b.organization_id = p_organization_id and coalesce(b.is_active, true);

  for v_fila, v_n in select e, o::integer from jsonb_array_elements(p_filas) with ordinality as t(e, o) loop
    v_err := '{}';
    v_num := case when (v_fila->>'fila') ~ '^\d{1,6}$' then (v_fila->>'fila')::integer else v_n end;
    v_sede := null; v_instr := null; v_inicio := null;

    -- Título
    v_titulo := nullif(btrim(v_fila->>'titulo'), '');
    if v_titulo is null then
      v_err := array_append(v_err, 'titulo_requerido');
    elsif length(v_titulo) > 200 then
      v_err := array_append(v_err, 'titulo_muy_largo');
    end if;

    -- Sede: id, nombre o código; opcional si la organización tiene una sola sede activa.
    v_sede_txt := nullif(btrim(v_fila->>'sede'), '');
    if v_sede_txt is null then
      if v_unica is null then v_err := array_append(v_err, 'sede_requerida'); else v_sede := v_unica; end if;
    else
      select count(*), min(b.id) into v_cuantas, v_sede
        from public.branches b
       where b.organization_id = p_organization_id and coalesce(b.is_active, true)
         and (b.id::text = v_sede_txt or lower(btrim(b.name)) = lower(v_sede_txt)
              or lower(btrim(coalesce(b.branch_code, ''))) = lower(v_sede_txt));
      if v_cuantas = 0 then
        v_err := array_append(v_err, 'sede_no_encontrada'); v_sede := null;
      elsif v_cuantas > 1 then
        v_err := array_append(v_err, 'sede_ambigua'); v_sede := null;
      end if;
    end if;

    -- Instructor: correo de un miembro activo de la organización (gym_classes.instructor_id es NOT NULL).
    v_instr_txt := lower(nullif(btrim(v_fila->>'instructor'), ''));
    if v_instr_txt is null then
      v_err := array_append(v_err, 'instructor_requerido');
    else
      select count(distinct om.user_id), (array_agg(om.user_id))[1] into v_cuantas, v_instr
        from public.organization_members om
        join public.profiles p on p.id = om.user_id
       where om.organization_id = p_organization_id and om.is_active = true
         and lower(btrim(p.email)) = v_instr_txt;
      if v_cuantas = 0 then
        v_err := array_append(v_err, 'instructor_no_encontrado'); v_instr := null;
      end if;
    end if;

    -- Fecha y hora de pared en la zona de la sede.
    v_fecha := btrim(coalesce(v_fila->>'fecha', ''));
    v_hora := btrim(coalesce(v_fila->>'hora', ''));
    if v_fecha !~ '^\d{4}-\d{2}-\d{2}$' then
      v_err := array_append(v_err, 'fecha_invalida');
    elsif v_hora !~ '^\d{2}:\d{2}$' then
      v_err := array_append(v_err, 'hora_invalida');
    else
      v_tz := public.fn_timezone_for(p_organization_id, v_sede);
      begin
        v_inicio := (v_fecha || ' ' || v_hora)::timestamp at time zone v_tz;
      exception when others then
        v_inicio := null;
        v_err := array_append(v_err, 'fecha_invalida');
      end;
    end if;

    -- Duración (min) y cupo.
    v_txt := nullif(btrim(v_fila->>'duracion'), '');
    if v_txt is null then
      v_duracion := 60;
    elsif v_txt ~ '^\d{1,4}$' and v_txt::integer between 5 and 480 then
      v_duracion := v_txt::integer;
    else
      v_duracion := null; v_err := array_append(v_err, 'duracion_invalida');
    end if;
    v_txt := nullif(btrim(v_fila->>'capacidad'), '');
    if v_txt is null then
      v_capacidad := 10;
    elsif v_txt ~ '^\d{1,5}$' and v_txt::integer between 1 and 1000 then
      v_capacidad := v_txt::integer;
    else
      v_capacidad := null; v_err := array_append(v_err, 'capacidad_invalida');
    end if;

    v_nivel := nullif(btrim(v_fila->>'nivel'), '');
    if v_nivel is not null and v_nivel not in ('beginner', 'intermediate', 'advanced', 'all_levels') then
      v_err := array_append(v_err, 'nivel_invalido');
    end if;
    v_estado := coalesce(nullif(btrim(v_fila->>'estado'), ''), 'active');
    if v_estado not in ('active', 'completed') then
      v_err := array_append(v_err, 'estado_invalido');
    end if;

    -- Duplicadas: en el archivo y en la base (misma sede, título e inicio; las canceladas no cuentan).
    if v_titulo is not null and v_sede is not null and v_inicio is not null then
      v_clave := lower(v_titulo) || '|' || v_sede || '|' || extract(epoch from v_inicio)::text;
      if v_clave = any(v_claves) then
        v_err := array_append(v_err, 'duplicada_en_archivo');
      else
        v_claves := v_claves || v_clave;
        if exists (select 1 from public.gym_classes g
                    where g.organization_id = p_organization_id and g.branch_id = v_sede
                      and lower(btrim(g.title)) = lower(v_titulo) and g.start_at = v_inicio
                      and g.status is distinct from 'cancelled') then
          v_err := array_append(v_err, 'clase_ya_existe');
        end if;
      end if;
    end if;

    if cardinality(v_err) > 0 then
      v_con_error := v_con_error + 1;
    else
      v_validas := v_validas || jsonb_build_object(
        'branch_id', v_sede, 'title', v_titulo, 'instructor_id', v_instr, 'capacity', v_capacidad,
        'start_at', v_inicio, 'end_at', v_inicio + make_interval(mins => v_duracion), 'duration_minutes', v_duracion,
        'class_type', left(nullif(btrim(v_fila->>'tipo'), ''), 60),
        'room', left(nullif(btrim(v_fila->>'sala'), ''), 120),
        'location', left(nullif(btrim(v_fila->>'ubicacion'), ''), 200),
        'description', left(nullif(btrim(v_fila->>'descripcion'), ''), 2000),
        'equipment_needed', left(nullif(btrim(v_fila->>'equipo'), ''), 500),
        'difficulty_level', v_nivel, 'status', v_estado);
    end if;
    v_reporte := v_reporte || jsonb_build_object('fila', v_num, 'errores', to_jsonb(v_err), 'inicio', v_inicio,
                                                 'sede_id', v_sede);
  end loop;

  if v_con_error > 0 or coalesce(p_solo_validar, false) then
    return jsonb_build_object('ok', v_con_error = 0, 'importadas', 0, 'validas', v_total - v_con_error,
                              'con_error', v_con_error, 'solo_validar', coalesce(p_solo_validar, false),
                              'filas', v_reporte);
  end if;

  for v_fila in select e from jsonb_array_elements(v_validas) as t(e) loop
    insert into public.gym_classes (organization_id, branch_id, title, instructor_id, capacity, start_at, end_at,
                                    duration_minutes, class_type, room, location, description, equipment_needed,
                                    difficulty_level, status)
    values (p_organization_id, (v_fila->>'branch_id')::integer, v_fila->>'title', (v_fila->>'instructor_id')::uuid,
            (v_fila->>'capacity')::integer, (v_fila->>'start_at')::timestamptz, (v_fila->>'end_at')::timestamptz,
            (v_fila->>'duration_minutes')::integer, v_fila->>'class_type', v_fila->>'room', v_fila->>'location',
            v_fila->>'description', v_fila->>'equipment_needed', v_fila->>'difficulty_level', v_fila->>'status')
    returning id into v_id;
    v_ids := v_ids || v_id;
  end loop;

  return jsonb_build_object('ok', true, 'importadas', cardinality(v_ids), 'validas', v_total, 'con_error', 0,
                            'solo_validar', false, 'ids', to_jsonb(v_ids), 'filas', v_reporte);
end;
$function$;

create or replace function public.fn_membresias_importar_reservas(
  p_organization_id integer,
  p_filas jsonb,
  p_solo_validar boolean default false)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  c_max constant integer := 500;
  v_total integer;
  v_fila jsonb;
  v_n integer;
  v_num integer;
  v_err text[];
  v_doc text;
  v_correo text;
  v_cli uuid;
  v_cli_doc uuid;
  v_cli_correo uuid;
  v_mapa_doc jsonb;
  v_mapa_correo jsonb;
  v_arr jsonb;
  v_nombre text;
  v_clase_txt text;
  v_fecha text;
  v_hora text;
  v_local timestamp;
  v_sede_txt text;
  v_sede integer;
  v_cuantas integer;
  v_clase_titulo text;
  v_clase_estado text;
  v_clase_cap integer;
  v_clase_sede integer;
  v_clase_inicio timestamptz;
  v_clase_id integer;
  v_estado text;
  v_origen text;
  v_ocupadas integer;
  v_en_archivo jsonb := '{}'::jsonb;
  v_clave text;
  v_claves text[] := '{}';
  v_reporte jsonb := '[]'::jsonb;
  v_validas jsonb := '[]'::jsonb;
  v_con_error integer := 0;
  v_ids integer[] := '{}';
  v_id integer;
begin
  perform public.fn_membresias_int_exigir(p_organization_id, array['memberships.classes.manage']);
  if p_filas is null or jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) = 0 then
    raise exception 'importacion_sin_filas' using errcode = '22023';
  end if;
  v_total := jsonb_array_length(p_filas);
  if v_total > c_max then
    raise exception 'importacion_demasiadas_filas' using errcode = '22023';
  end if;

  for v_fila, v_n in select e, o::integer from jsonb_array_elements(p_filas) with ordinality as t(e, o) loop
    v_err := '{}';
    v_num := case when (v_fila->>'fila') ~ '^\d{1,6}$' then (v_fila->>'fila')::integer else v_n end;
    v_cli := null; v_cli_doc := null; v_cli_correo := null; v_nombre := null;
    v_sede := null; v_clase_id := null; v_local := null;
    v_clase_titulo := null; v_clase_estado := null; v_clase_cap := null; v_clase_sede := null; v_clase_inicio := null;

    -- Miembro: documento o correo (si vienen los dos, deben ser la misma persona). Primero la
    -- coincidencia exacta (índices únicos por organización); si no, la normalizada: «1.020.304» y
    -- «1020304» son el mismo documento, y el correo no distingue mayúsculas. Los mapas normalizados se
    -- arman una sola vez por llamada (una pasada por los clientes de la organización), no por fila.
    v_doc := nullif(btrim(v_fila->>'documento'), '');
    v_correo := nullif(btrim(v_fila->>'correo'), '');
    if v_doc is null and v_correo is null then
      v_err := array_append(v_err, 'miembro_requerido');
    end if;
    if v_doc is not null then
      select c.id into v_cli_doc from public.customers c
       where c.organization_id = p_organization_id and c.identification_number = v_doc;
      if v_cli_doc is null then
        if v_mapa_doc is null then
          select coalesce(jsonb_object_agg(s.k, s.ids), '{}'::jsonb) into v_mapa_doc
            from (select upper(regexp_replace(c.identification_number, '[^0-9A-Za-z]', '', 'g')) as k, jsonb_agg(c.id) as ids
                    from public.customers c
                   where c.organization_id = p_organization_id and c.identification_number is not null
                   group by 1) s
           where s.k <> '';
        end if;
        v_arr := v_mapa_doc -> upper(regexp_replace(v_doc, '[^0-9A-Za-z]', '', 'g'));
        v_cuantas := coalesce(jsonb_array_length(v_arr), 0);
        if v_cuantas = 0 then
          v_err := array_append(v_err, 'miembro_no_encontrado');
        elsif v_cuantas > 1 then
          v_err := array_append(v_err, 'miembro_ambiguo');
        else
          v_cli_doc := (v_arr->>0)::uuid;
        end if;
      end if;
    end if;
    if v_correo is not null then
      select c.id into v_cli_correo from public.customers c
       where c.organization_id = p_organization_id and c.email = v_correo;
      if v_cli_correo is null then
        if v_mapa_correo is null then
          select coalesce(jsonb_object_agg(s.k, s.ids), '{}'::jsonb) into v_mapa_correo
            from (select lower(btrim(c.email)) as k, jsonb_agg(c.id) as ids
                    from public.customers c
                   where c.organization_id = p_organization_id and c.email is not null
                   group by 1) s
           where s.k <> '';
        end if;
        v_arr := v_mapa_correo -> lower(v_correo);
        v_cuantas := coalesce(jsonb_array_length(v_arr), 0);
        if v_cuantas = 1 then
          v_cli_correo := (v_arr->>0)::uuid;
        elsif v_doc is null then
          v_err := array_append(v_err, case when v_cuantas = 0 then 'miembro_no_encontrado' else 'miembro_ambiguo' end);
        end if;
      end if;
    end if;
    if v_cli_doc is not null and v_cli_correo is not null and v_cli_doc <> v_cli_correo then
      v_err := array_append(v_err, 'miembro_no_coincide');
    else
      v_cli := coalesce(v_cli_doc, v_cli_correo);
    end if;
    if v_cli is not null then
      select c.full_name into v_nombre from public.customers c where c.id = v_cli;
    end if;

    -- Sede (opcional: solo desempata clases con el mismo título a la misma hora en dos sedes).
    v_sede_txt := nullif(btrim(v_fila->>'sede'), '');
    if v_sede_txt is not null then
      select count(*), min(b.id) into v_cuantas, v_sede
        from public.branches b
       where b.organization_id = p_organization_id
         and (b.id::text = v_sede_txt or lower(btrim(b.name)) = lower(v_sede_txt)
              or lower(btrim(coalesce(b.branch_code, ''))) = lower(v_sede_txt));
      if v_cuantas = 0 then
        v_err := array_append(v_err, 'sede_no_encontrada'); v_sede := null;
      elsif v_cuantas > 1 then
        v_err := array_append(v_err, 'sede_ambigua'); v_sede := null;
      end if;
    end if;

    -- Clase: título + fecha y hora de pared en la zona de SU sede.
    v_clase_txt := nullif(btrim(v_fila->>'clase'), '');
    v_fecha := btrim(coalesce(v_fila->>'fecha', ''));
    v_hora := btrim(coalesce(v_fila->>'hora', ''));
    if v_clase_txt is null then
      v_err := array_append(v_err, 'clase_requerida');
    end if;
    if v_fecha !~ '^\d{4}-\d{2}-\d{2}$' then
      v_err := array_append(v_err, 'fecha_invalida');
    elsif v_hora !~ '^\d{2}:\d{2}$' then
      v_err := array_append(v_err, 'hora_invalida');
    else
      begin
        v_local := (v_fecha || ' ' || v_hora)::timestamp;
      exception when others then
        v_local := null;
        v_err := array_append(v_err, 'fecha_invalida');
      end;
    end if;
    if v_clase_txt is not null and v_local is not null and not ('sede_no_encontrada' = any(v_err) or 'sede_ambigua' = any(v_err)) then
      select count(*), (array_agg(g.id order by g.id))[1] into v_cuantas, v_clase_id
        from public.gym_classes g
       where g.organization_id = p_organization_id
         and lower(btrim(g.title)) = lower(v_clase_txt)
         and (v_sede is null or g.branch_id = v_sede)
         and g.start_at = (v_local at time zone public.fn_timezone_for(p_organization_id, g.branch_id));
      if v_cuantas = 0 then
        v_err := array_append(v_err, 'clase_no_encontrada'); v_clase_id := null;
      elsif v_cuantas > 1 then
        v_err := array_append(v_err, 'clase_ambigua'); v_clase_id := null;
      end if;
    end if;
    if v_clase_id is not null then
      select g.title, g.status, g.capacity, g.branch_id, g.start_at
        into v_clase_titulo, v_clase_estado, v_clase_cap, v_clase_sede, v_clase_inicio
        from public.gym_classes g where g.id = v_clase_id;
    end if;

    -- Estado y origen (valores de las CHECK de class_reservations).
    v_estado := coalesce(nullif(btrim(v_fila->>'estado'), ''), 'booked');
    if v_estado not in ('booked', 'checked_in', 'no_show', 'cancelled') then
      v_err := array_append(v_err, 'estado_invalido');
    end if;
    v_origen := coalesce(nullif(btrim(v_fila->>'origen'), ''), 'staff');
    if v_origen not in ('app', 'web', 'staff', 'kiosk') then
      v_err := array_append(v_err, 'origen_invalido');
    end if;

    if v_clase_id is not null then
      if v_clase_estado = 'cancelled' then
        v_err := array_append(v_err, 'clase_cancelada');
      elsif v_estado = 'booked' and v_clase_estado is distinct from 'active' then
        v_err := array_append(v_err, 'clase_no_programada');
      end if;
      if auth.uid() is not null and not public.app_branch_access(v_clase_sede) then
        v_err := array_append(v_err, 'sede_sin_acceso');
      end if;
    end if;

    -- Duplicadas (archivo y base) y cupo (todas las reservas ocupan cupo menos las canceladas).
    if v_cli is not null and v_clase_id is not null then
      v_clave := v_cli::text || '|' || v_clase_id;
      if v_clave = any(v_claves) then
        v_err := array_append(v_err, 'duplicada_en_archivo');
      else
        v_claves := v_claves || v_clave;
        if exists (select 1 from public.class_reservations r where r.gym_class_id = v_clase_id and r.customer_id = v_cli) then
          v_err := array_append(v_err, 'reserva_ya_existe');
        end if;
      end if;
      if cardinality(v_err) = 0 and v_estado <> 'cancelled' then
        select count(*) into v_ocupadas from public.class_reservations r
         where r.gym_class_id = v_clase_id and r.status <> 'cancelled';
        v_ocupadas := v_ocupadas + coalesce((v_en_archivo->>v_clase_id::text)::integer, 0);
        if v_ocupadas + 1 > v_clase_cap then
          v_err := array_append(v_err, 'clase_sin_cupo');
        else
          v_en_archivo := v_en_archivo || jsonb_build_object(v_clase_id::text, coalesce((v_en_archivo->>v_clase_id::text)::integer, 0) + 1);
        end if;
      end if;
    end if;

    if cardinality(v_err) > 0 then
      v_con_error := v_con_error + 1;
    else
      v_validas := v_validas || jsonb_build_object(
        'gym_class_id', v_clase_id, 'customer_id', v_cli, 'status', v_estado, 'reservation_source', v_origen,
        'notes', left(nullif(btrim(v_fila->>'notas'), ''), 1000), 'branch_id', v_clase_sede,
        'start_at', v_clase_inicio);
    end if;
    v_reporte := v_reporte || jsonb_build_object(
      'fila', v_num, 'errores', to_jsonb(v_err), 'miembro', v_nombre,
      'clase', v_clase_titulo, 'inicio', v_clase_inicio);
  end loop;

  if v_con_error > 0 or coalesce(p_solo_validar, false) then
    return jsonb_build_object('ok', v_con_error = 0, 'importadas', 0, 'validas', v_total - v_con_error,
                              'con_error', v_con_error, 'solo_validar', coalesce(p_solo_validar, false),
                              'filas', v_reporte);
  end if;

  for v_fila in select e from jsonb_array_elements(v_validas) as t(e) loop
    insert into public.class_reservations (organization_id, gym_class_id, customer_id, status, reservation_source,
                                           notes, branch_id, booked_at, checkin_time, cancelled_at)
    values (p_organization_id, (v_fila->>'gym_class_id')::integer, (v_fila->>'customer_id')::uuid, v_fila->>'status',
            v_fila->>'reservation_source', v_fila->>'notes', (v_fila->>'branch_id')::integer, now(),
            case when v_fila->>'status' = 'checked_in' then (v_fila->>'start_at')::timestamptz end,
            case when v_fila->>'status' = 'cancelled' then now() end)
    returning id into v_id;
    v_ids := v_ids || v_id;
  end loop;

  return jsonb_build_object('ok', true, 'importadas', cardinality(v_ids), 'validas', v_total, 'con_error', 0,
                            'solo_validar', false, 'ids', to_jsonb(v_ids), 'filas', v_reporte);
end;
$function$;

revoke all on function public.fn_membresias_importar_clases(integer, jsonb, boolean) from public, anon;
revoke all on function public.fn_membresias_importar_reservas(integer, jsonb, boolean) from public, anon;
grant execute on function public.fn_membresias_importar_clases(integer, jsonb, boolean) to authenticated, service_role;
grant execute on function public.fn_membresias_importar_reservas(integer, jsonb, boolean) to authenticated, service_role;

comment on function public.fn_membresias_importar_clases(integer, jsonb, boolean) is
  'Importación CSV de clases (todo o nada, máx. 500 filas; p_solo_validar = vista previa). Requiere memberships.classes.manage.';
comment on function public.fn_membresias_importar_reservas(integer, jsonb, boolean) is
  'Importación CSV de reservas (todo o nada, máx. 500 filas; p_solo_validar = vista previa). Requiere memberships.classes.manage.';
