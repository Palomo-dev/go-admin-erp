-- Reversión de 20261009120000_guardar_carta_y_sedes.sql.
-- Solo quita la función: no toca datos. El servidor vuelve solo al respaldo
-- (guardar_carta y después un único upsert de todas las sedes).
drop function if exists public.guardar_carta_y_sedes(integer, uuid, jsonb, jsonb);
