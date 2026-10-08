-- Rollback de 20261008135016_plano_reserva_con_mesa (M5).
--
-- Vuelve a la definición ANTERIOR de create_restaurant_reservation (16
-- argumentos), guardada con pg_get_functiondef antes de cambiarla:
-- md5(pg_get_functiondef) = f2fcc1d4ca41e66e54b3b0b9dc66edf5.
--
-- Efecto: la rama web vuelve a ignorar p_table_id (asigna la primera mesa libre
-- que alcance). Antes de aplicarlo, el sitio tiene que dejar de mandar
-- `tableId` o aceptará que la mesa asignada no sea la elegida.
-- No toca datos: las reservas creadas con mesa elegida conservan su mesa.
--
-- Orden: este rollback va ANTES que el de M4 (20261008134614), que borra
-- fn_mesa_libre y fn_reservas_sin_mesa_solapadas; la definición de abajo no las usa.

CREATE OR REPLACE FUNCTION public.create_restaurant_reservation(p_organization_id integer, p_reservation_date date, p_reservation_time time without time zone, p_party_size integer, p_customer_name text, p_table_id uuid, p_customer_id uuid, p_duration_minutes integer, p_validar_reglas boolean, p_branch_id integer DEFAULT NULL::integer, p_customer_phone text DEFAULT NULL::text, p_customer_email text DEFAULT NULL::text, p_zone text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_special_requests text DEFAULT NULL::text, p_source text DEFAULT 'website'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_settings        public.restaurant_booking_settings;
  v_hay             boolean;
  v_admin           boolean;
  v_turn_duration   integer := 90;
  v_buffer          integer := 15;
  v_duration        integer;
  v_slot_minutes    integer;
  v_slot_end        integer;
  v_assigned_table  uuid;
  v_customer_id     uuid;
  v_reservation_id  uuid;
  v_token           uuid;
  v_status          text := 'confirmed';
  v_conflict        boolean;
  v_table_rec       record;
  v_branch          integer;
  v_zone            text := nullif(btrim(coalesce(p_zone, '')), '');
  v_email           text := nullif(lower(btrim(coalesce(p_customer_email, ''))), '');
  v_phone           text := nullif(btrim(coalesce(p_customer_phone, '')), '');
  v_phone_norm      text;
  v_regla           text;
  v_nombre          text := btrim(coalesce(p_customer_name, ''));
  v_libres          integer := 0;
  v_sin_mesa        integer := 0;
  v_primera_libre   uuid;
begin
  perform public.fn_assert_acceso_org(p_organization_id::integer);

  if v_nombre = '' then
    raise exception 'CONTACTO: El nombre es obligatorio';
  end if;
  if p_party_size is null or p_party_size < 1 then
    raise exception 'PERSONAS: El numero minimo de personas es 1';
  end if;

  v_admin := coalesce(p_source, 'website') <> 'website';
  if v_admin and auth.uid() is null then
    -- Las ramas del equipo exigen sesión: el sitio (service role) siempre es web.
    raise exception 'ORIGEN: Solo el equipo puede crear reservas con origen %', p_source using errcode = '42501';
  end if;

  if p_branch_id is not null and not exists (
    select 1 from public.branches b where b.id = p_branch_id and b.organization_id = p_organization_id
  ) then
    raise exception 'SEDE: La sede no pertenece a la organizacion' using errcode = '42501';
  end if;

  v_settings := public.fn_ajustes_reserva(p_organization_id, p_branch_id);
  v_hay := v_settings.id is not null;
  if v_hay then
    v_turn_duration := coalesce(v_settings.turn_duration_minutes, 90);
    v_buffer := coalesce(v_settings.buffer_minutes, 15);
  end if;
  v_duration := coalesce(nullif(p_duration_minutes, 0), v_turn_duration);
  v_slot_minutes := extract(hour from p_reservation_time) * 60 + extract(minute from p_reservation_time);
  v_slot_end := v_slot_minutes + v_duration + v_buffer;

  if not v_admin then
    -- ── Rama web ──
    if v_hay and v_settings.is_enabled = false then
      raise exception 'DESHABILITADA: Las reservas online estan deshabilitadas para este restaurante';
    end if;

    -- Zona: si la sede no deja elegir, se ignora la del formulario.
    if v_hay and not v_settings.allow_zone_choice then
      v_zone := null;
    end if;

    -- Serializa las reservas de la sede antes de contar el aforo.
    perform 1 from public.restaurant_tables t
     where t.organization_id = p_organization_id
       and (p_branch_id is null or t.branch_id = p_branch_id)
     order by t.id
     for update of t;

    v_regla := public.fn_restaurant_slot_valido(
      p_organization_id, p_branch_id, p_reservation_date, p_reservation_time,
      p_party_size, v_zone, v_phone, v_email);
    if v_regla is not null then
      if coalesce(p_validar_reglas, true) then
        raise exception '%', v_regla;
      end if;
      raise warning 'create_restaurant_reservation (observacion) org=% sede=% regla=%', p_organization_id, p_branch_id, v_regla;
    end if;

    if v_hay and (
         v_settings.require_confirmation
      or not v_settings.auto_assign_table
      or (v_settings.large_party_threshold is not null and p_party_size > v_settings.large_party_threshold)
    ) then
      v_status := 'pending';
    end if;

    -- Mesas que caben y no tienen una reserva con mesa que se solape.
    v_libres := 0;
    for v_table_rec in
      select t.id, t.capacity, t.branch_id
        from public.restaurant_tables t
       where t.organization_id = p_organization_id
         and coalesce(t.capacity, 4) >= p_party_size
         and (v_zone is null or t.zone = v_zone)
         and (p_branch_id is null or t.branch_id = p_branch_id)
       order by t.capacity asc, t.id
       for update of t
    loop
      select exists(
        select 1
          from public.restaurant_reservations r
         where r.restaurant_table_id = v_table_rec.id
           and r.reservation_date = p_reservation_date
           and r.status in ('pending', 'confirmed', 'seated')
           and (extract(hour from r.reservation_time) * 60 + extract(minute from r.reservation_time)) < v_slot_end
           and (extract(hour from r.reservation_time) * 60 + extract(minute from r.reservation_time)
                + coalesce(r.duration_minutes, v_turn_duration) + v_buffer) > v_slot_minutes
      ) into v_conflict;

      if not v_conflict then
        v_libres := v_libres + 1;
        if v_primera_libre is null then
          v_primera_libre := v_table_rec.id;
          v_branch := v_table_rec.branch_id;
        end if;
      end if;
    end loop;

    -- Reservas vivas SIN mesa que se solapan (las que dejó `auto_assign_table
    -- = false`): cada una ocupará una mesa cuando el equipo la asigne, así
    -- que cuentan contra las libres. Sin esto, la franja admitiría reservas
    -- sin límite mientras nadie elige mesa.
    select count(*) into v_sin_mesa
      from public.restaurant_reservations r
     where r.organization_id = p_organization_id
       and (p_branch_id is null or r.branch_id = p_branch_id)
       and r.restaurant_table_id is null
       and r.reservation_date = p_reservation_date
       and r.status in ('pending', 'confirmed', 'seated')
       and (extract(hour from r.reservation_time) * 60 + extract(minute from r.reservation_time)) < v_slot_end
       and (extract(hour from r.reservation_time) * 60 + extract(minute from r.reservation_time)
            + coalesce(r.duration_minutes, v_turn_duration) + v_buffer) > v_slot_minutes;

    if v_libres <= v_sin_mesa then
      raise exception 'AFORO: No hay mesas disponibles para la fecha y hora seleccionadas';
    end if;

    if v_hay and not v_settings.auto_assign_table then
      -- «Asignar mesa automáticamente» apagado: la reserva entra pendiente y
      -- SIN mesa; el equipo la elige al confirmar («Confirmar y asignar mesa»).
      v_assigned_table := null;
      v_branch := coalesce(p_branch_id, v_branch);
    else
      v_assigned_table := v_primera_libre;
    end if;
  else
    -- ── Rama del equipo (ERP) ──
    if p_table_id is not null then
      select t.id, t.capacity, t.branch_id into v_table_rec
        from public.restaurant_tables t
       where t.id = p_table_id
         and t.organization_id = p_organization_id
         and (p_branch_id is null or t.branch_id = p_branch_id)
       for update of t;
      if not found then
        raise exception 'MESA: La mesa no pertenece a la sede' using errcode = '42501';
      end if;

      if exists (
        select 1
          from public.restaurant_reservations r
         where r.restaurant_table_id = p_table_id
           and r.reservation_date = p_reservation_date
           and r.status in ('pending', 'confirmed', 'seated')
           and (extract(hour from r.reservation_time) * 60 + extract(minute from r.reservation_time)) < v_slot_end
           and (extract(hour from r.reservation_time) * 60 + extract(minute from r.reservation_time)
                + coalesce(r.duration_minutes, v_turn_duration) + v_buffer) > v_slot_minutes
      ) then
        raise exception 'AFORO: La mesa ya tiene una reserva en ese horario';
      end if;
      v_assigned_table := p_table_id;
      v_branch := v_table_rec.branch_id;
    else
      if p_branch_id is null then
        raise exception 'SEDE: Elige la sede de la reserva';
      end if;
      v_branch := p_branch_id;
    end if;
  end if;

  -- ── Cliente del CRM ──
  if p_customer_id is not null then
    select c.id into v_customer_id
      from public.customers c
     where c.id = p_customer_id and c.organization_id = p_organization_id;
  end if;

  if v_customer_id is null and v_email is not null then
    select c.id into v_customer_id
      from public.customers c
     where c.organization_id = p_organization_id
       and lower(c.email) = v_email
     order by c.created_at
     limit 1;
  end if;

  v_phone_norm := right(regexp_replace(coalesce(v_phone, ''), '\D', '', 'g'), 10);
  if v_customer_id is null and length(v_phone_norm) >= 7 then
    select c.id into v_customer_id
      from public.customers c
     where c.organization_id = p_organization_id
       and c.phone is not null
       and right(regexp_replace(c.phone, '\D', '', 'g'), 10) = v_phone_norm
     order by c.created_at
     limit 1;
    if v_customer_id is not null and v_email is not null then
      -- Completar el correo sin pisar uno existente.
      update public.customers c
         set email = v_email, updated_at = now()
       where c.id = v_customer_id
         and c.email is null
         and not exists (
           select 1 from public.customers o
            where o.organization_id = p_organization_id and lower(o.email) = v_email
         );
    end if;
  end if;

  if v_customer_id is null and (v_email is not null or length(v_phone_norm) >= 7) then
    insert into public.customers (organization_id, first_name, last_name, email, phone, is_registered)
    values (
      p_organization_id,
      split_part(v_nombre, ' ', 1),
      nullif(btrim(substr(v_nombre, length(split_part(v_nombre, ' ', 1)) + 1)), ''),
      v_email,
      v_phone,
      false
    )
    returning id into v_customer_id;
  end if;

  insert into public.restaurant_reservations (
    organization_id, branch_id, restaurant_table_id,
    customer_name, customer_phone, customer_email, customer_id,
    party_size, reservation_date, reservation_time, duration_minutes,
    status, source, notes, special_requests,
    created_by, confirmed_at
  )
  values (
    p_organization_id, v_branch, v_assigned_table,
    v_nombre, v_phone, nullif(btrim(coalesce(p_customer_email, '')), ''), v_customer_id,
    p_party_size, p_reservation_date, p_reservation_time, v_duration,
    v_status, coalesce(p_source, 'website'), p_notes, p_special_requests,
    auth.uid(), case when v_status = 'confirmed' then now() else null end
  )
  returning id, manage_token into v_reservation_id, v_token;

  return jsonb_build_object(
    'success', true,
    'reservation_id', v_reservation_id,
    'table_id', v_assigned_table,
    'branch_id', v_branch,
    'customer_id', v_customer_id,
    'status', v_status,
    'code', upper(substring(v_reservation_id::text, 1, 8)),
    'manage_token', v_token,
    'regla_incumplida', v_regla
  );
end;
$function$
;

revoke all on function public.create_restaurant_reservation(integer, date, time without time zone, integer, text, uuid, uuid, integer, boolean, integer, text, text, text, text, text, text) from public, anon;
