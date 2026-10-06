-- Aplicada por MCP el 2026-10-06 (reensayo con el sitio en producción be7e3a5, RESERVAS_ENFORCE_REGLAS sin definir en Vercel = observación: ENSAYO_OK). Paquete D · D1 — reglas de la reserva de mesa en el servidor.
--
-- ENSAYO (2026-10-07, revisión; bloques `do` vía execute_sql que aplican la
-- columna de D2 + esta migración, prueban y se deshacen con `raise exception`;
-- org 140 sede 115, 4 mesas de 4 personas, sin filas de configuración):
--   Parte 1 (todas las funciones tal cual, service role como el sitio):
--   ENSAYO_OK firma12_observa=confirmed/regla=[FUERA_DE_HORARIO:] (la firma de
--   12 argumentos ya NO bloquea: crea y devuelve la regla) | solo_tel=confirmed
--   mesa=true cliente=true token=true mismo_cliente=true (mismo celular en otro
--   formato + correo) | solo_correo=confirmed | auto_off=pending mesa=null
--   sede=115 segunda=pending mesa=null tercera=[AFORO:] (fila de la
--   organización con auto_assign_table=false: 2 mesas libres a las 20:00 y la
--   tercera reserva sin mesa ya no cabe).
--   Parte 2 (cancelar y rama del equipo, `authenticated` miembro de la org):
--   ENSAYO_OK cancelar_1h=[ANTICIPACION:] forzar_sin_sesion=[ANTICIPACION:]
--   pasada=[PASADA:] no_show=[No se puede cancelar una reserva marcada como no
--   se presento] | admin_sin_sesion=[ORIGEN:] | admin=confirmed mesa=true
--   solape=[AFORO:] forzar_1h_miembro=cancelled.
--   Nota: un bloque único de ~30 KB hace que el MCP agote los 60 s (el
--   tamaño, no la base: cada parte tarda < 0,2 s); por eso va en dos partes.
--   Ensayo anterior (constructor): bloquea=[FUERA_DE_HORARIO:] con la firma
--   nueva y p_validar_reglas=true, rejilla 19:10 rechazada, cliente por
--   correo sin distinguir mayúsculas, DESHABILITADA con la fila de la org.
--
-- Revisión 2026-10-07:
-- - La firma de 12 argumentos (la que llama HOY el sitio desplegado) delega con
--   `p_validar_reglas => false`: al aplicar D1 nadie empieza a perder reservas
--   por los turnos por defecto (hay 0 filas de configuración). El bloqueo lo
--   pide explícitamente el sitio nuevo con RESERVAS_ENFORCE_REGLAS='true'.
-- - `auto_assign_table = false` ya no asigna mesa: la reserva entra `pending`
--   SIN mesa y el aforo cuenta las reservas vivas sin mesa que se solapan
--   contra las mesas libres (antes asignaba y bloqueaba la mesa igual).

-- Depende de D2 (20261007100000_reservas_token_gestion): devuelve `manage_token`.
--
-- Problemas verificados por MCP (2026-10-07):
-- - `create_restaurant_reservation` no valida horario de servicio, anticipación,
--   franja, zona, aforo ni datos de contacto: el sitio podía crear una reserva a
--   las 03:00 con `reservation_cta` (hora libre).
-- - `if v_settings is not null` sobre un `record` solo es verdadero si TODAS las
--   columnas son no nulas: con `max_covers_per_slot` o `deposit_amount` en NULL
--   (lo normal) la configuración se ignoraba entera.
-- - Con sede, solo leía la fila EXACTA de la sede: la de la organización
--   (`branch_id` NULL) no hacía de respaldo. `cancel_restaurant_reservation`
--   tomaba la fila de una sede cualquiera.
-- - Cancelar calculaba el plazo en UTC (`reservation_date::timestamptz`) y con
--   `v_hours_until > 0` dejaba cancelar una reserva ya pasada. No comprobaba la
--   organización de quien llama y dejaba «cancelar» un `no_show`.
-- - Solo se ligaba el cliente del CRM por correo exacto: las reservas con solo
--   celular quedaban sin cliente.
-- - El ERP creaba reservas con un INSERT directo (sin aforo, sin solape, mesa
--   marcada `reserved` a mano): ahora llama a esta RPC con `p_source='admin'`.
--
-- Qué hace:
-- 1. `fn_ajustes_reserva(p_org, p_branch)`: la fila de la sede gana y la de la
--    organización es el respaldo. Una sola regla para las tres RPC.
-- 2. `fn_restaurant_franjas(service_hours, fecha, intervalo, turno)`: las franjas
--    del día con los mismos defaults que `get_restaurant_availability`
--    (12:00-15:00 y 18:00-22:30). La disponibilidad (del otro frente) debe
--    pasar a consumir esta función: coordinado en el plan, sin duplicar.
-- 3. `fn_restaurant_slot_valido(...)`: NULL o un error con prefijo
--    (`PERSONAS:`, `CONTACTO:`, `ZONA:`, `ANTICIPACION:`, `FUERA_DE_HORARIO:`,
--    `AFORO:`). La hora vale si es una franja del día en una rejilla de
--    gcd(slot_interval_minutes, 15) minutos: el editor del sitio deja elegir
--    intervalos de 15/30/60/90 y la configuración de la sede manda en el resto.
--    La configuración del ERP solo admite múltiplos de 15 (15/30/45/60/90/120,
--    zod + selector): con ellos la rejilla es de 15 y toda franja que ofrece
--    la disponibilidad (inicio del turno + k·intervalo) cae en ella.
-- 4. `create_restaurant_reservation`: sobrecarga nueva con `p_table_id`,
--    `p_customer_id`, `p_duration_minutes` y `p_validar_reglas` SIN default (en
--    6.ª-9.ª posición). La firma de 12 argumentos se conserva y delega en la
--    nueva: el sitio la llama por nombre de parámetro (verificado en
--    goadmin-websites/app/api/restaurant-reservations/route.ts) y sigue cayendo
--    en ella, antes y después de aplicar. Sin borrar la firma vieja (fuera de esta ronda): con
--    default en las dos firmas, una llamada sin los nuevos sería ambigua.
--    - Rama web (`p_source='website'`): `is_enabled`, reglas, zona permitida,
--      `require_confirmation`, `large_party_threshold` y `auto_assign_table`
--      (false = la reserva entra `pending` y SIN mesa: el equipo la elige al
--      confirmar; el aforo descuenta las reservas sin mesa que se solapan).
--      Bloquea las mesas de la sede antes de validar el aforo.
--      `p_validar_reglas=false` = modo observación: crea la reserva y devuelve
--      `regla_incumplida` (interruptor RESERVAS_ENFORCE_REGLAS del sitio: solo
--      'true' bloquea; sin la variable, observa). La firma de 12 argumentos
--      delega en observación.
--    - Rama admin (cualquier otro origen, exige sesión): sin `is_enabled` ni
--      reglas de horario, `confirmed`, mesa opcional validada contra la
--      organización y la sede con `FOR UPDATE` y solape con buffer,
--      `created_by = auth.uid()`, `p_customer_id` si es de la organización.
--    - Cliente: `p_customer_id` → correo sin distinguir mayúsculas → últimos 10
--      dígitos del teléfono → alta (también con solo celular). Si se encuentra
--      por teléfono y no tiene correo, se completa. Nunca se sobrescribe.
--    - Devuelve además `manage_token` y `regla_incumplida`.
-- 5. `cancel_restaurant_reservation(p_reservation_id, p_forzar, p_reason)`:
--    zona de la sede (`fn_timezone_for`), ajustes de la sede con respaldo,
--    rechaza la reserva ya pasada (`PASADA:`) y la de dentro del plazo
--    (`ANTICIPACION:`), `no_show` no se cancela, y con sesión exige pertenecer
--    a la organización. `p_forzar` (default false) solo cuenta con sesión de un
--    miembro: el equipo cancela fuera de plazo. La firma (uuid, text) se
--    conserva y delega con `p_forzar => false` (llamarla por nombre).
--
-- `fn_timezone_for` → `fn_assert_acceso_org`: con service role (`auth.uid()`
-- NULL y rol distinto de anon/authenticated) deja pasar. Comprobado en el ensayo.
-- Hoy hay 0 filas en `restaurant_reservations` y 0 en
-- `restaurant_booking_settings`: ninguna reserva histórica queda fuera de reglas.

-- ── 1. Ajustes efectivos ────────────────────────────────────────────────────
create or replace function public.fn_ajustes_reserva(p_org integer, p_branch integer)
returns public.restaurant_booking_settings
language sql
stable
security definer
set search_path to 'public'
as $function$
  select s.*
    from public.restaurant_booking_settings s
   where s.organization_id = p_org
     and (s.branch_id = p_branch or s.branch_id is null)
   order by s.branch_id nulls last
   limit 1
$function$;

comment on function public.fn_ajustes_reserva(integer, integer) is
  'Ajustes de reserva de mesa efectivos: la fila de la sede gana, la de la organización (branch_id NULL) es el respaldo. Fila nula si no hay ninguna.';

revoke all on function public.fn_ajustes_reserva(integer, integer) from public, anon, authenticated;
grant execute on function public.fn_ajustes_reserva(integer, integer) to service_role;

-- ── 2. Franjas del día ──────────────────────────────────────────────────────
create or replace function public.fn_restaurant_franjas(
  p_service_hours jsonb,
  p_date date,
  p_interval integer,
  p_turn integer
)
returns setof integer
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  v_weekday text := lower(to_char(p_date, 'Dy'));
  v_shifts  jsonb;
  v_shift   jsonb;
  v_from    integer;
  v_to      integer;
  v_slot    integer;
  v_step    integer := greatest(coalesce(p_interval, 30), 5);
  v_turn    integer := greatest(coalesce(p_turn, 90), 1);
begin
  if p_service_hours is not null and p_service_hours <> '{}'::jsonb and p_service_hours ? v_weekday then
    v_shifts := p_service_hours -> v_weekday;
  else
    v_shifts := '[{"from":"12:00","to":"15:00"},{"from":"18:00","to":"22:30"}]'::jsonb;
  end if;

  if jsonb_typeof(v_shifts) <> 'array' then
    return;
  end if;

  for v_shift in select * from jsonb_array_elements(v_shifts)
  loop
    begin
      v_from := (substring(v_shift->>'from' from 1 for 2))::integer * 60
              + (substring(v_shift->>'from' from 4 for 2))::integer;
      v_to := (substring(v_shift->>'to' from 1 for 2))::integer * 60
            + (substring(v_shift->>'to' from 4 for 2))::integer;
    exception when others then
      continue;
    end;
    v_slot := v_from;
    while v_slot + v_turn <= v_to loop
      return next v_slot;
      v_slot := v_slot + v_step;
    end loop;
  end loop;
end;
$function$;

comment on function public.fn_restaurant_franjas(jsonb, date, integer, integer) is
  'Minutos desde medianoche de cada franja de reserva del día (service_hours con claves mon..sun). Sin turnos para el día: 12:00-15:00 y 18:00-22:30, igual que get_restaurant_availability.';

revoke all on function public.fn_restaurant_franjas(jsonb, date, integer, integer) from public, anon;
grant execute on function public.fn_restaurant_franjas(jsonb, date, integer, integer) to authenticated, service_role;

-- ── 3. Validación de una franja ─────────────────────────────────────────────
create or replace function public.fn_restaurant_slot_valido(
  p_org integer,
  p_branch integer,
  p_date date,
  p_time time,
  p_party integer,
  p_zone text default null,
  p_phone text default null,
  p_email text default null
)
returns text
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_s          public.restaurant_booking_settings;
  v_hay        boolean;
  v_tz         text;
  v_hoy        date;
  v_inicio     timestamptz;
  v_min_adv    integer := 60;
  v_max_dias   integer := 60;
  v_min        integer := 1;
  v_max        integer := 12;
  v_turn       integer := 90;
  v_interval   integer := 30;
  v_minutos    integer;
  v_cubiertos  integer;
begin
  v_s := public.fn_ajustes_reserva(p_org, p_branch);
  v_hay := v_s.id is not null;

  if v_hay then
    v_min := coalesce(v_s.min_party_size, 1);
    v_max := coalesce(v_s.max_party_size, 12);
    v_min_adv := coalesce(v_s.min_advance_minutes, 60);
    v_max_dias := coalesce(v_s.max_advance_days, 60);
    v_turn := coalesce(v_s.turn_duration_minutes, 90);
    v_interval := coalesce(v_s.slot_interval_minutes, 30);
  end if;

  if p_party is null or p_party < v_min then
    return format('PERSONAS: El numero minimo de personas es %s', v_min);
  end if;
  if p_party > v_max then
    return format('PERSONAS: El numero maximo de personas es %s', v_max);
  end if;

  if v_hay and v_s.require_phone and nullif(btrim(coalesce(p_phone, '')), '') is null then
    return 'CONTACTO: El celular es obligatorio';
  end if;
  if v_hay and v_s.require_email and nullif(btrim(coalesce(p_email, '')), '') is null then
    return 'CONTACTO: El correo es obligatorio';
  end if;

  if v_hay and v_s.allow_zone_choice and p_zone is not null
     and coalesce(array_length(v_s.allowed_zones, 1), 0) > 0
     and not (p_zone = any (v_s.allowed_zones)) then
    return 'ZONA: La zona elegida no admite reservas';
  end if;

  v_tz := public.fn_timezone_for(p_org, p_branch);
  v_hoy := (now() at time zone v_tz)::date;
  v_inicio := (p_date + p_time) at time zone v_tz;

  if p_date > v_hoy + v_max_dias then
    return format('ANTICIPACION: Solo se reserva con hasta %s dias de anticipacion', v_max_dias);
  end if;
  if v_inicio < now() + make_interval(mins => v_min_adv) then
    return format('ANTICIPACION: Reserva con al menos %s minutos de anticipacion', v_min_adv);
  end if;

  v_minutos := extract(hour from p_time)::integer * 60 + extract(minute from p_time)::integer;
  if extract(second from p_time) <> 0 or not exists (
    select 1
      from public.fn_restaurant_franjas(
             case when v_hay then v_s.service_hours else null end,
             p_date, gcd(v_interval, 15), v_turn) f
     where f = v_minutos
  ) then
    return 'FUERA_DE_HORARIO: La hora elegida esta fuera del horario de reservas';
  end if;

  if v_hay and v_s.max_covers_per_slot is not null then
    select coalesce(sum(r.party_size), 0) into v_cubiertos
      from public.restaurant_reservations r
     where r.organization_id = p_org
       and (p_branch is null or r.branch_id = p_branch)
       and r.reservation_date = p_date
       and r.reservation_time = p_time
       and r.status in ('pending', 'confirmed', 'seated');
    if v_cubiertos + p_party > v_s.max_covers_per_slot then
      return 'AFORO: No hay mesas disponibles para la fecha y hora seleccionadas (cupo de la franja completo)';
    end if;
  end if;

  return null;
end;
$function$;

comment on function public.fn_restaurant_slot_valido(integer, integer, date, time, integer, text, text, text) is
  'NULL si la reserva cumple las reglas de la sede (o los defaults), si no un mensaje con prefijo PERSONAS:/CONTACTO:/ZONA:/ANTICIPACION:/FUERA_DE_HORARIO:/AFORO:.';

revoke all on function public.fn_restaurant_slot_valido(integer, integer, date, time, integer, text, text, text) from public, anon, authenticated;
grant execute on function public.fn_restaurant_slot_valido(integer, integer, date, time, integer, text, text, text) to service_role;

-- ── 4. Crear la reserva (una sola vía: sitio y ERP) ─────────────────────────
create or replace function public.create_restaurant_reservation(
  p_organization_id integer,
  p_reservation_date date,
  p_reservation_time time without time zone,
  p_party_size integer,
  p_customer_name text,
  p_table_id uuid,
  p_customer_id uuid,
  p_duration_minutes integer,
  p_validar_reglas boolean,
  p_branch_id integer default null,
  p_customer_phone text default null,
  p_customer_email text default null,
  p_zone text default null,
  p_notes text default null,
  p_special_requests text default null,
  p_source text default 'website'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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
$function$;

comment on function public.create_restaurant_reservation(integer, date, time without time zone, integer, text, uuid, uuid, integer, boolean, integer, text, text, text, text, text, text) is
  'Única vía para crear una reserva de mesa (sitio con p_source=website y ERP con admin/phone/whatsapp). Errores con prefijo: DESHABILITADA:, PERSONAS:, CONTACTO:, ZONA:, ANTICIPACION:, FUERA_DE_HORARIO:, AFORO:, MESA:, SEDE:, ORIGEN:.';

revoke all on function public.create_restaurant_reservation(integer, date, time without time zone, integer, text, uuid, uuid, integer, boolean, integer, text, text, text, text, text, text) from public, anon;
grant execute on function public.create_restaurant_reservation(integer, date, time without time zone, integer, text, uuid, uuid, integer, boolean, integer, text, text, text, text, text, text) to authenticated, service_role;

-- La firma de 12 argumentos (la que llama hoy el sitio, por nombre) se
-- conserva y delega: misma llamada antes y después de aplicar, una sola
-- implementación. Los cuatro parámetros nuevos NO llevan default en la firma
-- nueva a propósito: con default en las dos, una llamada sin ellos sería
-- ambigua (PGRST203). Quitar la firma vieja exige borrarla, fuera de esta ronda.
create or replace function public.create_restaurant_reservation(
  p_organization_id integer,
  p_reservation_date date,
  p_reservation_time time without time zone,
  p_party_size integer,
  p_customer_name text,
  p_branch_id integer default null,
  p_customer_phone text default null,
  p_customer_email text default null,
  p_zone text default null,
  p_notes text default null,
  p_special_requests text default null,
  p_source text default 'website'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  return public.create_restaurant_reservation(
    p_organization_id => p_organization_id,
    p_reservation_date => p_reservation_date,
    p_reservation_time => p_reservation_time,
    p_party_size => p_party_size,
    p_customer_name => p_customer_name,
    p_table_id => null::uuid,
    p_customer_id => null::uuid,
    p_duration_minutes => null::integer,
    -- Modo observación por defecto (revisión 2026-10-07): esta firma es la que
    -- llama el sitio desplegado HOY. Al aplicar D1 no debe empezar a rechazar
    -- reservas con los turnos por defecto: valida, registra la regla en
    -- `regla_incumplida` y crea. El bloqueo lo pide el sitio nuevo con la
    -- firma de 16 argumentos y `p_validar_reglas => true` solo cuando
    -- RESERVAS_ENFORCE_REGLAS='true'.
    p_validar_reglas => false,
    p_branch_id => p_branch_id,
    p_customer_phone => p_customer_phone,
    p_customer_email => p_customer_email,
    p_zone => p_zone,
    p_notes => p_notes,
    p_special_requests => p_special_requests,
    p_source => p_source
  );
end;
$function$;

revoke all on function public.create_restaurant_reservation(integer, date, time without time zone, integer, text, integer, text, text, text, text, text, text) from public, anon;
grant execute on function public.create_restaurant_reservation(integer, date, time without time zone, integer, text, integer, text, text, text, text, text, text) to authenticated, service_role;

-- ── 5. Cancelar ─────────────────────────────────────────────────────────────
create or replace function public.cancel_restaurant_reservation(
  p_reservation_id uuid,
  p_forzar boolean,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_reservation        public.restaurant_reservations;
  v_settings           public.restaurant_booking_settings;
  v_cancellation_hours integer := 4;
  v_tz                 text;
  v_inicio             timestamptz;
  v_hours_until        numeric;
  v_forzar             boolean := false;
begin
  select * into v_reservation
    from public.restaurant_reservations
   where id = p_reservation_id
   for update;

  if v_reservation.id is null then
    raise exception 'Reserva no encontrada' using errcode = 'P0002';
  end if;

  -- Con sesión, solo un miembro de la organización. Service role (sitio) pasa.
  perform public.fn_assert_acceso_org(v_reservation.organization_id);
  v_forzar := coalesce(p_forzar, false) and auth.uid() is not null;

  if v_reservation.status = 'cancelled' then
    raise exception 'La reserva ya esta cancelada';
  end if;
  if v_reservation.status in ('completed', 'seated') then
    raise exception 'No se puede cancelar una reserva que ya fue completada o sentada';
  end if;
  if v_reservation.status = 'no_show' then
    raise exception 'No se puede cancelar una reserva marcada como no se presento';
  end if;

  if not v_forzar then
    v_settings := public.fn_ajustes_reserva(v_reservation.organization_id, v_reservation.branch_id);
    if v_settings.id is not null then
      v_cancellation_hours := coalesce(v_settings.cancellation_hours, 4);
    end if;

    v_tz := public.fn_timezone_for(v_reservation.organization_id, v_reservation.branch_id);
    v_inicio := (v_reservation.reservation_date + v_reservation.reservation_time) at time zone v_tz;
    v_hours_until := extract(epoch from (v_inicio - now())) / 3600;

    if v_hours_until <= 0 then
      raise exception 'PASADA: La hora de la reserva ya paso. Escribe al restaurante para cualquier cambio';
    end if;
    if v_hours_until < v_cancellation_hours then
      raise exception 'ANTICIPACION: No se puede cancelar con menos de % horas de anticipacion', v_cancellation_hours;
    end if;
  end if;

  update public.restaurant_reservations
     set status = 'cancelled',
         cancelled_at = now(),
         cancellation_reason = left(p_reason, 500),
         updated_at = now()
   where id = p_reservation_id;

  return jsonb_build_object(
    'success', true,
    'reservation_id', p_reservation_id,
    'status', 'cancelled'
  );
end;
$function$;

comment on function public.cancel_restaurant_reservation(uuid, boolean, text) is
  'Cancela una reserva de mesa con el plazo de la sede en su zona horaria. p_forzar solo vale con sesión de un miembro (el equipo cancela fuera de plazo).';

revoke all on function public.cancel_restaurant_reservation(uuid, boolean, text) from public, anon;
grant execute on function public.cancel_restaurant_reservation(uuid, boolean, text) to authenticated, service_role;

-- La firma (uuid, text) que usan el sitio y D2 se conserva y delega sin forzar.
-- Llamarla con nombres: con dos argumentos posicionales sería ambigua.
create or replace function public.cancel_restaurant_reservation(
  p_reservation_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  return public.cancel_restaurant_reservation(
    p_reservation_id => p_reservation_id,
    p_forzar => false,
    p_reason => p_reason
  );
end;
$function$;

revoke all on function public.cancel_restaurant_reservation(uuid, text) from public, anon;
grant execute on function public.cancel_restaurant_reservation(uuid, text) to authenticated, service_role;
