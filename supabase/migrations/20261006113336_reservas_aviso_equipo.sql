-- Aplicada por MCP el 2026-10-06 (reensayo con el ERP 995026ed y el sitio be7e3a5: ENSAYO_OK). Paquete D · D3 — el equipo se entera de la reserva web.
--
-- ENSAYO (2026-10-07, bloque `do` que aplica esta migración, prueba y se
-- deshace con `raise exception`, vía execute_sql, org 140 sede 115):
--   ENSAYO_OK web=1 tipo=restaurant_reservation_created titulo=[Nueva reserva
--   web · <sede de la org 140> · por confirmar] contenido=[10/10/2026 19:30 ·
--   2 personas · Ensayo D3] href_ok=t | admin=0 (origen admin no avisa) |
--   cancelada_cliente=1 (service role cancela) | realtime=t
--
-- Problema: una reserva que entra por el sitio no avisaba a nadie: ni trigger,
-- ni realtime (`restaurant_reservations` no estaba en `supabase_realtime`).
--
-- Qué hace:
-- 1. `fn_notify_restaurant_reservation_created()` (trigger AFTER INSERT, solo
--    `source = 'website'`): una notificación de la organización con
--    `fn_create_org_notification` (canal `app`, el que admite el CHECK de
--    `notifications`; `in_app` no existe), tipo `restaurant_reservation_created`,
--    título «Nueva reserva web · <sede> · por confirmar|confirmada», contenido
--    con día, hora (la de la reserva: ya es hora local de la sede) y personas, y
--    en el payload `reservation_id`, `branch_id`, `status` y `href` a
--    /app/pos/reservas-mesas. La campana (paquete E, dueño del archivo) mapea el
--    tipo a su icono. Un fallo del aviso NUNCA tumba la reserva (`exception`).
-- 2. Mismo patrón para la cancelación hecha por el cliente (sin sesión: el
--    sitio cancela con service role): tipo `restaurant_reservation_cancelled`.
-- 3. `restaurant_reservations` entra en `supabase_realtime`. La RLS de SELECT
--    (miembros activos de la organización) ya existe: cada sesión solo recibe
--    lo de su organización. El ERP se suscribe filtrando `organization_id`.
--
-- Volumen: hoy hay 0 reservas web en total (2026-10-07): el aviso no cambia el
-- volumen de `notifications` de nadie hasta que una organización reciba reservas.

create or replace function public.fn_notify_restaurant_reservation_created()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_sede   text;
  v_titulo text;
  v_cuerpo text;
begin
  begin
    select b.name into v_sede from public.branches b where b.id = new.branch_id;

    if tg_op = 'INSERT' then
      v_titulo := 'Nueva reserva web · ' || coalesce(v_sede, 'Sede') || ' · '
                  || case when new.status = 'pending' then 'por confirmar' else 'confirmada' end;
      v_cuerpo := to_char(new.reservation_date, 'DD/MM/YYYY') || ' ' || to_char(new.reservation_time, 'HH24:MI')
                  || ' · ' || new.party_size || case when new.party_size = 1 then ' persona' else ' personas' end
                  || ' · ' || new.customer_name;
      perform public.fn_create_org_notification(
        p_organization_id   => new.organization_id,
        p_recipient_user_id => null,
        p_channel           => 'app',
        p_type              => 'restaurant_reservation_created',
        p_title             => v_titulo,
        p_content           => v_cuerpo,
        p_metadata          => jsonb_build_object(
          'reservation_id', new.id,
          'branch_id', new.branch_id,
          'status', new.status,
          'href', '/app/pos/reservas-mesas?reserva=' || new.id
        )
      );
    elsif new.status = 'cancelled' and old.status is distinct from 'cancelled' and auth.uid() is null then
      v_titulo := 'Reserva cancelada por el cliente · ' || coalesce(v_sede, 'Sede');
      v_cuerpo := to_char(new.reservation_date, 'DD/MM/YYYY') || ' ' || to_char(new.reservation_time, 'HH24:MI')
                  || ' · ' || new.party_size || case when new.party_size = 1 then ' persona' else ' personas' end
                  || ' · ' || new.customer_name;
      perform public.fn_create_org_notification(
        p_organization_id   => new.organization_id,
        p_recipient_user_id => null,
        p_channel           => 'app',
        p_type              => 'restaurant_reservation_cancelled',
        p_title             => v_titulo,
        p_content           => v_cuerpo,
        p_metadata          => jsonb_build_object(
          'reservation_id', new.id,
          'branch_id', new.branch_id,
          'status', new.status,
          'href', '/app/pos/reservas-mesas?reserva=' || new.id
        )
      );
    end if;
  exception when others then
    raise warning 'fn_notify_restaurant_reservation_created: % (%)', sqlerrm, sqlstate;
  end;
  return new;
end;
$function$;

comment on function public.fn_notify_restaurant_reservation_created() is
  'Aviso a la organización de una reserva de mesa web nueva (restaurant_reservation_created) o cancelada por el cliente (restaurant_reservation_cancelled). Nunca bloquea la escritura.';

revoke all on function public.fn_notify_restaurant_reservation_created() from public, anon, authenticated;

create or replace trigger trg_notify_restaurant_reservation_created
  after insert on public.restaurant_reservations
  for each row
  when (new.source = 'website')
  execute function public.fn_notify_restaurant_reservation_created();

create or replace trigger trg_notify_restaurant_reservation_cancelled
  after update of status on public.restaurant_reservations
  for each row
  when (new.source = 'website' and new.status = 'cancelled' and old.status is distinct from 'cancelled')
  execute function public.fn_notify_restaurant_reservation_created();

do $publicacion$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'restaurant_reservations'
  ) then
    alter publication supabase_realtime add table public.restaurant_reservations;
  end if;
end
$publicacion$;
