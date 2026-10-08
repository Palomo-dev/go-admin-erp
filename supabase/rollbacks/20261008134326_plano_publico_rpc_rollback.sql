-- Rollback de 20261008134326_plano_publico_rpc (M3).
--
-- El sitio tiene que dejar de llamar a GET /api/restaurant-tables/plan (la
-- variante `floor_plan` de la reserva cae a «Pasos»). No toca datos.

drop function if exists public.get_restaurant_floor_plan_public(integer, integer);
