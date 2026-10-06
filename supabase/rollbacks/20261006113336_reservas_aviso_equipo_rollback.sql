-- Rollback de 20261007100200_reservas_aviso_equipo.
-- Las notificaciones ya creadas se quedan (son historial de la organización).

drop trigger if exists trg_notify_restaurant_reservation_created on public.restaurant_reservations;
drop trigger if exists trg_notify_restaurant_reservation_cancelled on public.restaurant_reservations;
drop function if exists public.fn_notify_restaurant_reservation_created();

do $publicacion$
begin
  if exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'restaurant_reservations'
  ) then
    alter publication supabase_realtime drop table public.restaurant_reservations;
  end if;
end
$publicacion$;
