-- Rollback de 20261007100000_reservas_token_gestion.
-- Revertir D1 (20261007100100) ANTES que esto: su create_restaurant_reservation devuelve manage_token.
-- Pierde los tokens emitidos: los enlaces de los correos ya enviados dejan de funcionar.

drop function if exists public.cancel_restaurant_reservation_by_token(uuid, integer, text);
drop index if exists public.idx_restaurant_reservations_manage_token;
alter table public.restaurant_reservations drop column if exists manage_token;
