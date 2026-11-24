-- Transporte · Fase 2 «Pasajes» (Figma «23 Transporte» › 8: 2881:5394, 2882:5820; › 16:
-- 2900:16461, 2900:17661, 2900:17768; componente PlanoPuestos 2896:10785). Aprobado 2026-11-23.
--
-- 1. Permiso `transporte.vender` («Vender pasajes») para los cargos de Transporte.
-- 2. `seat_maps`: plano de puestos por tipo (bus, buseta, lancha, yate) con su dibujo (jsonb).
--    `vehicles.seat_map_id` (NULL-able) y `fn_transporte_plano_aplicar` que crea los
--    `vehicle_seats` del vehículo desde el plano (los puestos que ya existían se conservan).
-- 3. Retención por canal con los minutos de Configuración › Transporte (`retencion.taquilla|web|pos`,
--    antes fija en 15 min dentro de fn_reserve_seat): `fn_transporte_retener_puesto`. Al vencer,
--    el puesto se libera solo si «Liberar el puesto al vencer la retención» está encendido
--    (cron `transporte-liberar-retenciones`); si no, taquilla lo suelta a mano.
-- 4. `fn_transporte_emitir_boleto`: crea el boleto desde el puesto retenido (número
--    B-AAAA-000001 por organización, código de abordaje) y deja el puesto vendido. NO cobra: el
--    cobro con la caja del POS queda pendiente (ver informe). Sin pago, el boleto nace
--    «reserved» para que el asiento automático de trip_tickets (solo confirmed/paid) no
--    contabilice un pasaje sin cobrar; «Pagado» nace «paid» como en el diálogo de siempre.
-- 5. Cambios y anulaciones con las reglas de Configuración › Transporte:
--    `fn_transporte_cambiar_boleto` (sin costo hasta N min antes; fuera de plazo pide
--    `transporte.manage`) y `fn_transporte_anular_boleto` (reembolso % hasta N h antes; el
--    reembolso queda calculado en `refund_amount`, no se mueve dinero aquí).
--
-- Las RPC nuevas validan organización y permiso (las viejas fn_reserve_seat / fn_release_seat no:
-- se dejan como estaban y se reportan).
--
-- Rollback: supabase/rollbacks/20261124001000_transporte_pasajes_rollback.sql

-- ── 1. Permiso ──────────────────────────────────────────────────────────────

insert into public.permissions (code, name, description, module, category)
values ('transporte.vender', 'Vender pasajes', 'Taquilla: retener puestos, emitir y cambiar boletos', 'transport', 'transporte')
on conflict (code) do nothing;

insert into public.job_position_permissions (job_position_id, permission_id, allowed)
select jp.id, p.id, true
  from public.job_positions jp
  join public.permissions p on p.code = 'transporte.vender'
 where jp.code in ('TRA-DESPACHO', 'TRA-SUPERVISOR')
on conflict (job_position_id, permission_id) do nothing;

create or replace function public.fn_transporte_crear_cargos(p_org integer)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dept uuid;
  v_despachador uuid;
  v_supervisor uuid;
begin
  if p_org is null then
    return;
  end if;

  select d.id into v_dept
    from public.departments d
   where d.organization_id = p_org and d.code = 'OPE'
   order by d.created_at
   limit 1;

  insert into public.job_positions (organization_id, department_id, code, name, description, level, is_active)
  values
    (p_org, v_dept, 'TRA-DESPACHO', 'Despachador de transporte', 'Da salida a los viajes del día e imprime la planilla de despacho', 'junior', true),
    (p_org, v_dept, 'TRA-SUPERVISOR', 'Supervisor de despacho', 'Programa la operación y autoriza excepciones de despacho con su PIN', 'mid', true)
  on conflict (organization_id, code) do nothing;

  select id into v_despachador from public.job_positions where organization_id = p_org and code = 'TRA-DESPACHO';
  select id into v_supervisor from public.job_positions where organization_id = p_org and code = 'TRA-SUPERVISOR';

  insert into public.job_position_permissions (job_position_id, permission_id, allowed)
  select v_despachador, p.id, true from public.permissions p
   where v_despachador is not null and p.code in ('transporte.view', 'transporte.despachar', 'transporte.vender')
  on conflict (job_position_id, permission_id) do nothing;

  insert into public.job_position_permissions (job_position_id, permission_id, allowed)
  select v_supervisor, p.id, true from public.permissions p
   where v_supervisor is not null and p.code in ('transporte.view', 'transporte.manage', 'transporte.despachar', 'transporte.despacho.excepcion', 'transporte.vender')
  on conflict (job_position_id, permission_id) do nothing;
end;
$$;
revoke all on function public.fn_transporte_crear_cargos(integer) from public, anon, authenticated;
grant execute on function public.fn_transporte_crear_cargos(integer) to service_role;

-- ── 2. Planos de puestos ────────────────────────────────────────────────────

create table if not exists public.seat_maps (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('bus', 'minibus', 'boat', 'yacht', 'other')),
  rows integer not null check (rows between 1 and 40),
  cols integer not null check (cols between 1 and 8),
  -- [{ "fila": 1, "col": 1, "tipo": "puesto"|"conductor"|"puerta"|"bano"|"pasillo"|"vacio", "etiqueta": "1", "ventana": true }]
  layout jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);
alter table public.seat_maps enable row level security;

drop policy if exists seat_maps_select on public.seat_maps;
create policy seat_maps_select on public.seat_maps
  for select to authenticated
  using (organization_id in (select om.organization_id from public.organization_members om where om.user_id = (select auth.uid()) and om.is_active));

drop policy if exists seat_maps_write on public.seat_maps;
create policy seat_maps_write on public.seat_maps
  for all to authenticated
  using (
    organization_id in (select om.organization_id from public.organization_members om where om.user_id = (select auth.uid()) and om.is_active)
    and public.fn_caja_puede(organization_id, 'transporte.manage')
  )
  with check (
    organization_id in (select om.organization_id from public.organization_members om where om.user_id = (select auth.uid()) and om.is_active)
    and public.fn_caja_puede(organization_id, 'transporte.manage')
  );
revoke all on public.seat_maps from anon;

comment on table public.seat_maps is 'Transporte: plano de puestos (bus, buseta, lancha, yate). layout es la cuadrícula dibujada; los puestos reales del vehículo están en vehicle_seats.';

alter table public.vehicles add column if not exists seat_map_id uuid references public.seat_maps(id) on delete set null;
comment on column public.vehicles.seat_map_id is 'Plano de puestos aplicado al vehículo (fn_transporte_plano_aplicar).';

create or replace function public.fn_transporte_plano_aplicar(p_vehicle uuid, p_map uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v public.vehicles;
  m public.seat_maps;
  n integer;
begin
  select * into v from public.vehicles where id = p_vehicle;
  select * into m from public.seat_maps where id = p_map;
  if v.id is null or m.id is null or v.organization_id <> m.organization_id
     or not public.fn_caja_puede(v.organization_id, 'transporte.manage') then
    raise exception 'transporte: sin permiso o plano ajeno' using errcode = '42501';
  end if;

  insert into public.vehicle_seats (organization_id, vehicle_id, seat_label, seat_row, seat_column, seat_type, is_available, position_x, position_y, metadata)
  select v.organization_id, v.id, c ->> 'etiqueta', (c ->> 'fila')::integer, (c ->> 'col'), 'passenger', true,
         (c ->> 'col')::integer, (c ->> 'fila')::integer, jsonb_build_object('ventana', coalesce((c ->> 'ventana')::boolean, false), 'plano', m.id)
    from jsonb_array_elements(m.layout) c
   where c ->> 'tipo' = 'puesto' and coalesce(c ->> 'etiqueta', '') <> ''
  on conflict (vehicle_id, seat_label) do update
    set seat_row = excluded.seat_row, seat_column = excluded.seat_column, is_available = true,
        position_x = excluded.position_x, position_y = excluded.position_y, metadata = excluded.metadata, updated_at = now();
  get diagnostics n = row_count;

  -- Puestos que el plano nuevo ya no tiene: quedan fuera de venta (no se borran: pueden tener historial).
  update public.vehicle_seats vs set is_available = false, updated_at = now()
   where vs.vehicle_id = v.id
     and not exists (select 1 from jsonb_array_elements(m.layout) c where c ->> 'tipo' = 'puesto' and c ->> 'etiqueta' = vs.seat_label);

  update public.vehicles
     set seat_map_id = m.id,
         passenger_capacity = (select count(*) from jsonb_array_elements(m.layout) c where c ->> 'tipo' = 'puesto'),
         updated_at = now()
   where id = v.id;
  return n;
end;
$$;
revoke all on function public.fn_transporte_plano_aplicar(uuid, uuid) from public, anon;
grant execute on function public.fn_transporte_plano_aplicar(uuid, uuid) to authenticated, service_role;

-- ── 3. Retención por canal ──────────────────────────────────────────────────

create or replace function public.fn_transporte_ajuste_entero(p_org integer, p_ruta text[], p_defecto integer)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select case when (s.settings #>> p_ruta) ~ '^[0-9]+$' then (s.settings #>> p_ruta)::integer end
       from public.organization_settings s where s.organization_id = p_org and s.key = 'transporte' limit 1),
    p_defecto
  );
$$;
revoke all on function public.fn_transporte_ajuste_entero(integer, text[], integer) from public, anon, authenticated;
grant execute on function public.fn_transporte_ajuste_entero(integer, text[], integer) to service_role;

create or replace function public.fn_transporte_libera_al_vencer(p_org integer)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select (s.settings ->> 'liberarAlVencer') <> 'false' from public.organization_settings s where s.organization_id = p_org and s.key = 'transporte' limit 1), true);
$$;
revoke all on function public.fn_transporte_libera_al_vencer(integer) from public, anon, authenticated;
grant execute on function public.fn_transporte_libera_al_vencer(integer) to service_role;

/** Recalcula los libres del viaje desde trip_seats (si el viaje ya tiene puestos). */
create or replace function public.fn_transporte_recontar_puestos(p_trip uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.trips t
     set available_seats = least(t.total_seats, (select count(*) from public.trip_seats s where s.trip_id = t.id and s.status = 'available')),
         updated_at = now()
   where t.id = p_trip and exists (select 1 from public.trip_seats s where s.trip_id = t.id);
$$;
revoke all on function public.fn_transporte_recontar_puestos(uuid) from public, anon, authenticated;

/** Libera retenciones vencidas (organizaciones con «Liberar al vencer» encendido). */
create or replace function public.fn_transporte_liberar_retenciones(p_trip uuid default null)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_viajes uuid[];
  v_id uuid;
begin
  with liberados as (
    update public.trip_seats s
       set status = 'available', reserved_until = null, reserved_by = null, metadata = coalesce(s.metadata, '{}'::jsonb) - 'canal', updated_at = now()
     where s.status = 'reserved' and s.ticket_id is null and s.reserved_until is not null and s.reserved_until < now()
       and (p_trip is null or s.trip_id = p_trip)
       and public.fn_transporte_libera_al_vencer(s.organization_id)
    returning s.trip_id
  )
  select array_agg(distinct trip_id) into v_viajes from liberados;
  foreach v_id in array coalesce(v_viajes, '{}'::uuid[]) loop
    perform public.fn_transporte_recontar_puestos(v_id);
  end loop;
  return coalesce(array_length(v_viajes, 1), 0);
end;
$$;
revoke all on function public.fn_transporte_liberar_retenciones(uuid) from public, anon, authenticated;
grant execute on function public.fn_transporte_liberar_retenciones(uuid) to service_role;

create or replace function public.fn_transporte_guarda_viaje(p_trip uuid, p_permiso text)
returns public.trips
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  t public.trips;
begin
  select * into t from public.trips where id = p_trip;
  if t.id is null or not exists (select 1 from public.organization_members om where om.user_id = auth.uid() and om.organization_id = t.organization_id and om.is_active) then
    raise exception 'transporte: viaje no encontrado' using errcode = 'P0002';
  end if;
  if not (public.fn_caja_puede(t.organization_id, p_permiso) or public.fn_caja_puede(t.organization_id, 'transporte.manage')) then
    raise exception 'transporte: sin permiso' using errcode = '42501';
  end if;
  return t;
end;
$$;
revoke all on function public.fn_transporte_guarda_viaje(uuid, text) from public, anon, authenticated;

/** Plano del viaje: puestos con su estado (crea los trip_seats si faltan y suelta lo vencido). */
create or replace function public.fn_transporte_puestos_viaje(p_trip uuid)
returns table (etiqueta text, fila integer, col integer, estado text, retenido_hasta timestamptz, mio boolean, canal text, ventana boolean, boleto uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  t public.trips;
begin
  t := public.fn_transporte_guarda_viaje(p_trip, 'transporte.view');
  if not exists (select 1 from public.trip_seats s where s.trip_id = t.id) and t.vehicle_id is not null then
    perform public.fn_initialize_trip_seats(t.id);
  end if;
  perform public.fn_transporte_liberar_retenciones(t.id);
  return query
    select s.seat_label, vs.seat_row, coalesce(nullif(regexp_replace(vs.seat_column, '\D', '', 'g'), '')::integer, 1),
           case when s.status = 'reserved' and s.reserved_until is not null and s.reserved_until < now() then 'vencido' else s.status end,
           s.reserved_until, s.reserved_by = auth.uid(), s.metadata ->> 'canal',
           coalesce((vs.metadata ->> 'ventana')::boolean, false), s.ticket_id
      from public.trip_seats s
      join public.vehicle_seats vs on vs.id = s.vehicle_seat_id
     where s.trip_id = t.id
     order by vs.seat_row, 3;
end;
$$;
revoke all on function public.fn_transporte_puestos_viaje(uuid) from public, anon;
grant execute on function public.fn_transporte_puestos_viaje(uuid) to authenticated, service_role;

create or replace function public.fn_transporte_retener_puesto(p_trip uuid, p_etiqueta text, p_canal text default 'taquilla')
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  t public.trips;
  v_min integer;
  v_hasta timestamptz;
  v_id uuid;
begin
  if p_canal not in ('taquilla', 'web', 'pos') then
    raise exception 'transporte: canal inválido' using errcode = '22023';
  end if;
  t := public.fn_transporte_guarda_viaje(p_trip, 'transporte.vender');
  if coalesce(t.status, 'scheduled') not in ('scheduled', 'boarding', 'delayed') then
    return jsonb_build_object('estado', 'viaje_cerrado');
  end if;
  perform public.fn_transporte_liberar_retenciones(t.id);
  v_min := least(greatest(public.fn_transporte_ajuste_entero(t.organization_id, array['retencion', p_canal], case p_canal when 'web' then 15 else 5 end), 1), 120);
  v_hasta := now() + make_interval(mins => v_min);
  update public.trip_seats
     set status = 'reserved', reserved_until = v_hasta, reserved_by = auth.uid(),
         metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('canal', p_canal), updated_at = now()
   where trip_id = t.id and seat_label = p_etiqueta
     and (status = 'available' or (status = 'reserved' and ticket_id is null and reserved_by = auth.uid()))
  returning id into v_id;
  if v_id is null then
    return jsonb_build_object('estado', 'ocupado');
  end if;
  perform public.fn_transporte_recontar_puestos(t.id);
  return jsonb_build_object('estado', 'retenido', 'hasta', v_hasta, 'minutos', v_min);
end;
$$;
revoke all on function public.fn_transporte_retener_puesto(uuid, text, text) from public, anon;
grant execute on function public.fn_transporte_retener_puesto(uuid, text, text) to authenticated, service_role;

create or replace function public.fn_transporte_soltar_puesto(p_trip uuid, p_etiqueta text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  t public.trips;
  v_id uuid;
begin
  t := public.fn_transporte_guarda_viaje(p_trip, 'transporte.vender');
  update public.trip_seats
     set status = 'available', reserved_until = null, reserved_by = null, metadata = coalesce(metadata, '{}'::jsonb) - 'canal', updated_at = now()
   where trip_id = t.id and seat_label = p_etiqueta and status = 'reserved' and ticket_id is null
     and (reserved_by = auth.uid() or public.fn_caja_puede(t.organization_id, 'transporte.manage') or reserved_until < now())
  returning id into v_id;
  perform public.fn_transporte_recontar_puestos(t.id);
  return v_id is not null;
end;
$$;
revoke all on function public.fn_transporte_soltar_puesto(uuid, text) from public, anon;
grant execute on function public.fn_transporte_soltar_puesto(uuid, text) to authenticated, service_role;

-- ── 4. Emitir el boleto ─────────────────────────────────────────────────────

create or replace function public.fn_transporte_emitir_boleto(p_trip uuid, p_etiqueta text, p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  t public.trips;
  v_seat uuid;
  v_ticket uuid;
  v_numero text;
  v_anio text := to_char(now(), 'YYYY');
  v_tarifa numeric;
  v_nombre text := btrim(coalesce(p_datos ->> 'nombre', ''));
  v_pago text := coalesce(p_datos ->> 'pago', 'pending');
begin
  t := public.fn_transporte_guarda_viaje(p_trip, 'transporte.vender');
  if coalesce(t.status, 'scheduled') not in ('scheduled', 'boarding', 'delayed') then
    return jsonb_build_object('estado', 'viaje_cerrado');
  end if;
  if length(v_nombre) < 3 or v_pago not in ('pending', 'paid') then
    return jsonb_build_object('estado', 'datos_invalidos');
  end if;
  v_tarifa := case when (p_datos ->> 'tarifa') ~ '^[0-9]+(\.[0-9]+)?$' then (p_datos ->> 'tarifa')::numeric else t.base_fare end;

  -- El puesto tiene que estar libre o retenido por quien vende.
  select id into v_seat from public.trip_seats
   where trip_id = t.id and seat_label = p_etiqueta
     and (status = 'available' or (status = 'reserved' and ticket_id is null and (reserved_by = auth.uid() or reserved_until < now())))
   for update;
  if v_seat is null then
    return jsonb_build_object('estado', 'ocupado');
  end if;

  perform pg_advisory_xact_lock(hashtext('transporte_boleto'), t.organization_id);
  select 'B-' || v_anio || '-' || lpad((coalesce(max(substring(x.ticket_number from 8)::integer), 0) + 1)::text, 6, '0')
    into v_numero
    from public.trip_tickets x
   where x.organization_id = t.organization_id and x.ticket_number ~ ('^B-' || v_anio || '-[0-9]{6}$');

  insert into public.trip_tickets (organization_id, trip_id, ticket_number, passenger_name, passenger_doc_type, passenger_doc_number,
                                   passenger_phone, boarding_stop_id, alighting_stop_id, seat_number, fare, discount, total, currency,
                                   status, payment_status, checkin_code, metadata)
  values (t.organization_id, t.id, v_numero, v_nombre, nullif(p_datos ->> 'doc_tipo', ''), nullif(p_datos ->> 'documento', ''),
          nullif(p_datos ->> 'telefono', ''), nullif(p_datos ->> 'sube', '')::uuid, nullif(p_datos ->> 'baja', '')::uuid, p_etiqueta,
          v_tarifa, 0, v_tarifa, t.currency, case when v_pago = 'paid' then 'paid' else 'reserved' end, v_pago,
          upper(substring(md5(gen_random_uuid()::text) from 1 for 6)),
          jsonb_build_object('canal', coalesce(nullif(p_datos ->> 'canal', ''), 'taquilla'), 'tarifa_nombre', p_datos ->> 'tarifa_nombre', 'vendido_por', auth.uid()))
  returning id into v_ticket;

  update public.trip_seats set status = 'sold', ticket_id = v_ticket, reserved_until = null, updated_at = now() where id = v_seat;
  perform public.fn_transporte_recontar_puestos(t.id);
  return jsonb_build_object('estado', 'emitido', 'boleto', v_ticket, 'numero', v_numero);
end;
$$;
revoke all on function public.fn_transporte_emitir_boleto(uuid, text, jsonb) from public, anon;
grant execute on function public.fn_transporte_emitir_boleto(uuid, text, jsonb) to authenticated, service_role;

-- ── 5. Cambios y anulaciones ────────────────────────────────────────────────

create or replace function public.fn_transporte_cambiar_boleto(p_ticket uuid, p_trip uuid, p_etiqueta text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  b public.trip_tickets;
  t_viejo public.trips;
  t public.trips;
  v_seat uuid;
  v_plazo integer;
  v_a_tiempo boolean;
begin
  select * into b from public.trip_tickets where id = p_ticket for update;
  if b.id is null then
    raise exception 'transporte: boleto no encontrado' using errcode = 'P0002';
  end if;
  t_viejo := public.fn_transporte_guarda_viaje(b.trip_id, 'transporte.vender');
  t := public.fn_transporte_guarda_viaje(p_trip, 'transporte.vender');
  if t.organization_id <> b.organization_id then
    raise exception 'transporte: viaje ajeno' using errcode = '42501';
  end if;
  if b.status not in ('reserved', 'confirmed', 'paid') then
    return jsonb_build_object('estado', 'no_cambiable');
  end if;
  if coalesce(t.status, 'scheduled') not in ('scheduled', 'boarding', 'delayed') then
    return jsonb_build_object('estado', 'viaje_cerrado');
  end if;
  v_plazo := public.fn_transporte_ajuste_entero(b.organization_id, array['cambioSinCostoMin'], 30);
  v_a_tiempo := now() <= t_viejo.scheduled_departure - make_interval(mins => v_plazo);
  if not v_a_tiempo and not public.fn_caja_puede(b.organization_id, 'transporte.manage') then
    return jsonb_build_object('estado', 'fuera_de_plazo', 'plazo_min', v_plazo);
  end if;

  select id into v_seat from public.trip_seats
   where trip_id = t.id and seat_label = p_etiqueta
     and (status = 'available' or (status = 'reserved' and ticket_id is null and (reserved_by = auth.uid() or reserved_until < now())))
   for update;
  if v_seat is null then
    return jsonb_build_object('estado', 'ocupado');
  end if;

  update public.trip_seats set status = 'available', ticket_id = null, reserved_until = null, reserved_by = null, updated_at = now()
   where ticket_id = b.id;
  update public.trip_seats set status = 'sold', ticket_id = b.id, reserved_until = null, updated_at = now() where id = v_seat;
  update public.trip_tickets
     set trip_id = t.id, seat_number = p_etiqueta, updated_at = now(),
         metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('cambios', coalesce(metadata -> 'cambios', '[]'::jsonb) ||
           jsonb_build_array(jsonb_build_object('de_viaje', b.trip_id, 'de_puesto', b.seat_number, 'en', now(), 'por', auth.uid(), 'sin_costo', v_a_tiempo)))
   where id = b.id;
  perform public.fn_transporte_recontar_puestos(b.trip_id);
  perform public.fn_transporte_recontar_puestos(t.id);
  return jsonb_build_object('estado', 'cambiado', 'sin_costo', v_a_tiempo);
end;
$$;
revoke all on function public.fn_transporte_cambiar_boleto(uuid, uuid, text) from public, anon;
grant execute on function public.fn_transporte_cambiar_boleto(uuid, uuid, text) to authenticated, service_role;

create or replace function public.fn_transporte_anular_boleto(p_ticket uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  b public.trip_tickets;
  t public.trips;
  v_horas integer;
  v_pct integer;
  v_reembolso numeric := 0;
  v_a_tiempo boolean;
begin
  select * into b from public.trip_tickets where id = p_ticket for update;
  if b.id is null then
    raise exception 'transporte: boleto no encontrado' using errcode = 'P0002';
  end if;
  t := public.fn_transporte_guarda_viaje(b.trip_id, 'transporte.manage');
  if b.status in ('cancelled', 'refunded', 'boarded', 'completed') then
    return jsonb_build_object('estado', 'no_anulable');
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 5 then
    return jsonb_build_object('estado', 'motivo_invalido');
  end if;
  v_horas := public.fn_transporte_ajuste_entero(b.organization_id, array['anulacionHoras'], 2);
  v_pct := least(greatest(public.fn_transporte_ajuste_entero(b.organization_id, array['reembolsoPct'], 90), 0), 100);
  v_a_tiempo := now() <= t.scheduled_departure - make_interval(hours => v_horas);
  if v_a_tiempo and b.payment_status = 'paid' then
    v_reembolso := round(coalesce(b.total, 0) * v_pct / 100.0, 2);
  end if;

  update public.trip_seats set status = 'available', ticket_id = null, reserved_until = null, reserved_by = null, updated_at = now()
   where ticket_id = b.id;
  update public.trip_tickets
     set status = 'cancelled', cancelled_at = now(), cancellation_reason = btrim(p_motivo), refund_amount = v_reembolso,
         payment_status = case when v_reembolso > 0 then 'refunded' else payment_status end, updated_at = now()
   where id = b.id;
  perform public.fn_transporte_recontar_puestos(b.trip_id);
  return jsonb_build_object('estado', 'anulado', 'reembolso', v_reembolso, 'a_tiempo', v_a_tiempo, 'porcentaje', v_pct);
end;
$$;
revoke all on function public.fn_transporte_anular_boleto(uuid, text) from public, anon;
grant execute on function public.fn_transporte_anular_boleto(uuid, text) to authenticated, service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'transporte-liberar-retenciones') then
    perform cron.unschedule('transporte-liberar-retenciones');
  end if;
  perform cron.schedule('transporte-liberar-retenciones', '*/2 * * * *', 'select public.fn_transporte_liberar_retenciones(null);');
end $$;
