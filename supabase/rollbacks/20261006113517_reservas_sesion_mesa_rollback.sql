-- Rollback de 20261007100300_reservas_sesion_mesa.
-- Antes: el ERP debe volver a sentar con abrirSesion + changeStatus (sin pos_reserva_sentar).

drop trigger if exists trg_reserva_completar_al_cerrar_mesa on public.table_sessions;
drop function if exists public.fn_reserva_completar_al_cerrar_mesa();
drop function if exists public.pos_reserva_sentar(integer, uuid, uuid, integer);
drop index if exists public.idx_restaurant_reservations_table_session;
alter table public.restaurant_reservations drop column if exists table_session_id;
