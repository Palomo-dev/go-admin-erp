-- Aplicada por MCP el 2026-10-06 (reensayo: ENSAYO_OK; la ruta /api/cron/reservas-mesas aún no está en el ERP desplegado 995026ed, así que el cron de recordatorios responde 404 hasta desplegarla: no hay ajustes con recordatorio, no se pierde nada). Paquete D · D5 — recordatorio al cliente y aviso de «no ha llegado».
--
-- ENSAYO (2026-10-07, revisión; bloque `do` vía execute_sql que aplica la
-- columna de D2, `fn_ajustes_reserva` de D1 y esta migración, prueba y se
-- deshace con `raise exception`; org 140 sede 115; sin claims de sesión, como
-- pg_cron: `auth.role()` NULL):
--   ENSAYO_OK recordatorios_1a=1 2a=0 | avisos_retraso_1a=1 2a=0 notif_D=1
--   titulo=[No ha llegado · Ensayo D · <hora>] href_ok=true | cron_jobs=2
--   (A: confirmada, con correo, en 3 h, creada hace 2 días → se reclama una sola
--   vez. B: creada dentro de la ventana de 4 h → no. C: sin correo → no.
--   D: 20 min tarde → un aviso por `fn_create_org_notification` (deja pasar a
--   pg_cron), y el segundo barrido no repite. E: 7 h tarde → no. Los dos
--   `cron.schedule` dentro de la transacción del ensayo se deshacen.)
--
-- ENSAYO 2 (2026-10-07, con `arrival_wait_until`; misma técnica):
--   ENSAYO_OK avisos_retraso=1 notif=1 | esperar_miembro_filas=1
--   no_show_miembro_filas=1 | anon_filas=0
--   (como `authenticated` miembro de la org 140 el ERP escribe
--   `arrival_wait_until` y `no_show_at` con la RLS de siempre; `anon` no toca
--   ninguna fila).
--
-- Revisión 2026-10-07: la zona sale de `fn_timezone_for` (sede → organización
-- → organization_settings → America/Bogota, con validación de la zona) y el
-- aviso se crea con `fn_create_org_notification`, igual que D3: ya no hay una
-- segunda regla de zona ni un INSERT directo en `notifications`.
--
-- Depende de D2 (manage_token) y de D1 (fn_ajustes_reserva).
--
-- Problema: `reminder_hours_before`, `send_customer_email` y la idea de
-- no-show existían en la configuración pero nada los usaba. Marcar «No se
-- presentó» escribía `cancelled_at`, mezclando inasistencias con cancelaciones.
--
-- Qué hace:
-- 1. Columnas NULL: `reminder_sent_at`, `no_show_at`, `late_alert_sent_at`,
--    `arrival_wait_until` («Esperar 15 min» compartido entre puestos), e
--    índice parcial (status, reservation_date) para reservas vivas.
-- 2. `fn_reservas_mesa_recordatorios_reclamar(p_limite)`: reclama (marca
--    `reminder_sent_at` con UPDATE … WHERE reminder_sent_at IS NULL RETURNING)
--    las reservas `confirmed` con correo cuya hora, en la zona de la sede, menos
--    `reminder_hours_before` ya pasó. Solo sedes que configuraron el
--    recordatorio (opt-in: `reminder_hours_before` no nulo y
--    `send_customer_email`). No recuerda reservas hechas dentro de la ventana.
--    Devuelve lo necesario para el correo (sede, organización, zona, token).
--    La llama `/api/cron/reservas-mesas` del ERP (service role); si el correo
--    falla, la ruta devuelve `reminder_sent_at` a NULL.
-- 3. `fn_reservas_mesa_avisos_retraso()`: reservas `confirmed` sin sentar 15
--    minutos después de su hora (y de menos de 6 h) → una notificación
--    `restaurant_reservation_late` a la organización, marcando
--    `late_alert_sent_at`. No cambia el estado: «No se presentó» lo decide el
--    equipo (pantalla de reservas: Llamar · Esperar 15 min · No se presentó).
-- 4. pg_cron: `reservas-mesas-retraso` cada 5 min (SQL directo) y
--    `reservas-mesas-recordatorios` cada 15 min con
--    `fn_crm_cron_post('/api/cron/reservas-mesas')`, la misma vía que los demás
--    cron del ERP: la URL y el secreto salen de Vault (`crm_app_url`,
--    `crm_cron_secret`), nunca de este archivo.
--
-- Decisión: el plan pedía una Edge Function; se usa la ruta de cron del ERP con
-- `withCron` + `fn_crm_cron_post` porque ya existe y ya tiene su secreto en
-- Vault: una segunda vía de cron con su propio secreto sería lógica duplicada.
-- WhatsApp del recordatorio: fuera de esta ronda (necesita plantilla aprobada).

alter table public.restaurant_reservations
  add column if not exists reminder_sent_at timestamptz null,
  add column if not exists no_show_at timestamptz null,
  add column if not exists late_alert_sent_at timestamptz null,
  add column if not exists arrival_wait_until timestamptz null;

create index if not exists idx_restaurant_reservations_vivas
  on public.restaurant_reservations (status, reservation_date)
  where status in ('pending', 'confirmed');

comment on column public.restaurant_reservations.reminder_sent_at is 'Cuándo se envió (o reclamó para enviar) el recordatorio al cliente.';
comment on column public.restaurant_reservations.no_show_at is 'Cuándo el equipo marcó «No se presentó». Ya no se usa cancelled_at para esto.';
comment on column public.restaurant_reservations.late_alert_sent_at is 'Cuándo se avisó al equipo de que el cliente no ha llegado.';
comment on column public.restaurant_reservations.arrival_wait_until is '«Esperar 15 min»: hasta cuándo el equipo pospone el aviso de no ha llegado (lo ven todos los puestos).';

create or replace function public.fn_reservas_mesa_recordatorios_reclamar(p_limite integer default 50)
returns table (
  reservation_id uuid,
  organization_id integer,
  branch_id integer,
  customer_name text,
  customer_email text,
  party_size integer,
  reservation_date date,
  reservation_time time,
  manage_token uuid,
  sede text,
  sede_direccion text,
  organizacion text,
  zona_horaria text
)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  return query
  with candidatas as (
    select r.id,
           s.reminder_hours_before as horas,
           public.fn_timezone_for(r.organization_id, r.branch_id) as tz
      from public.restaurant_reservations r
      cross join lateral public.fn_ajustes_reserva(r.organization_id, r.branch_id) s
     where r.status = 'confirmed'
       and r.reminder_sent_at is null
       and nullif(btrim(coalesce(r.customer_email, '')), '') is not null
       and r.reservation_date between (now() at time zone 'UTC')::date - 1 and (now() at time zone 'UTC')::date + 8
       and s.id is not null
       and s.send_customer_email
       and s.reminder_hours_before is not null
       and s.reminder_hours_before > 0
  ), vencidas as (
    select c.id, c.tz
      from candidatas c
      join public.restaurant_reservations r on r.id = c.id
     where ((r.reservation_date + r.reservation_time) at time zone c.tz) - make_interval(hours => c.horas) <= now()
       and ((r.reservation_date + r.reservation_time) at time zone c.tz) > now()
       and r.created_at < ((r.reservation_date + r.reservation_time) at time zone c.tz) - make_interval(hours => c.horas)
     order by r.reservation_date, r.reservation_time
     limit greatest(coalesce(p_limite, 50), 1)
  ), reclamadas as (
    update public.restaurant_reservations r
       set reminder_sent_at = now()
      from vencidas v
     where r.id = v.id
       and r.reminder_sent_at is null
    returning r.id, r.organization_id, r.branch_id, r.customer_name, r.customer_email, r.party_size,
              r.reservation_date, r.reservation_time, r.manage_token, v.tz
  )
  select rc.id, rc.organization_id, rc.branch_id, rc.customer_name, rc.customer_email, rc.party_size,
         rc.reservation_date, rc.reservation_time, rc.manage_token,
         b.name::text, b.address::text, o.name::text, rc.tz::text
    from reclamadas rc
    join public.organizations o on o.id = rc.organization_id
    left join public.branches b on b.id = rc.branch_id;
end;
$function$;

comment on function public.fn_reservas_mesa_recordatorios_reclamar(integer) is
  'Reclama (marca reminder_sent_at) y devuelve las reservas de mesa a recordar ya. Solo sedes con reminder_hours_before y send_customer_email. Para /api/cron/reservas-mesas.';

revoke all on function public.fn_reservas_mesa_recordatorios_reclamar(integer) from public, anon, authenticated;
grant execute on function public.fn_reservas_mesa_recordatorios_reclamar(integer) to service_role;

create or replace function public.fn_reservas_mesa_avisos_retraso()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_r     record;
  v_n     integer := 0;
begin
  for v_r in
    with vivas as (
      select r.*,
             (r.reservation_date + r.reservation_time)
               at time zone public.fn_timezone_for(r.organization_id, r.branch_id) as inicio,
             b.name as sede
        from public.restaurant_reservations r
        left join public.branches b on b.id = r.branch_id
       where r.status = 'confirmed'
         and r.seated_at is null
         and r.late_alert_sent_at is null
         and r.reservation_date between (now() at time zone 'UTC')::date - 1 and (now() at time zone 'UTC')::date + 1
    )
    select v.* from vivas v
     where v.inicio + interval '15 minutes' < now()
       and v.inicio > now() - interval '6 hours'
  loop
    update public.restaurant_reservations
       set late_alert_sent_at = now()
     where id = v_r.id and late_alert_sent_at is null;
    if found then
      begin
        perform public.fn_create_org_notification(
          p_organization_id   => v_r.organization_id,
          p_recipient_user_id => null,
          p_channel           => 'app',
          p_type              => 'restaurant_reservation_late',
          p_title             => 'No ha llegado · ' || v_r.customer_name || ' · ' || to_char(v_r.reservation_time, 'HH24:MI'),
          p_content           => coalesce(v_r.sede, 'Sede') || ' · ' || v_r.party_size
                                 || case when v_r.party_size = 1 then ' persona' else ' personas' end
                                 || coalesce(' · ' || v_r.customer_phone, ''),
          p_metadata          => jsonb_build_object(
            'reservation_id', v_r.id,
            'branch_id', v_r.branch_id,
            'href', '/app/pos/reservas-mesas?reserva=' || v_r.id
          )
        );
        v_n := v_n + 1;
      exception when others then
        raise warning 'fn_reservas_mesa_avisos_retraso: % (%)', sqlerrm, sqlstate;
      end;
    end if;
  end loop;
  return v_n;
end;
$function$;

comment on function public.fn_reservas_mesa_avisos_retraso() is
  'Avisa a la organización de las reservas confirmadas que no han llegado 15 minutos después de su hora (una vez por reserva). No cambia el estado.';

revoke all on function public.fn_reservas_mesa_avisos_retraso() from public, anon, authenticated;
grant execute on function public.fn_reservas_mesa_avisos_retraso() to service_role;

select cron.schedule('reservas-mesas-retraso', '*/5 * * * *', $cron$select public.fn_reservas_mesa_avisos_retraso()$cron$);
select cron.schedule('reservas-mesas-recordatorios', '*/15 * * * *', $cron$select public.fn_crm_cron_post('/api/cron/reservas-mesas')$cron$);
