-- Rollback de 20261008134614_plano_disponibilidad_por_mesa (M4).
--
-- Orden: revierte ANTES 20261008135016_plano_reserva_con_mesa (M5), porque la
-- versión de M5 de create_restaurant_reservation llama a fn_mesa_libre y a
-- fn_reservas_sin_mesa_solapadas. El sitio tiene que dejar de pedir la
-- disponibilidad por mesa (`byTable=1`). No toca datos.

drop function if exists public.get_restaurant_table_availability(integer, integer, date, time, integer, boolean);
drop function if exists public.fn_reservas_sin_mesa_solapadas(integer, integer, date, time, integer, integer, integer);
drop function if exists public.fn_mesa_libre(uuid, date, time, integer, integer, integer);
