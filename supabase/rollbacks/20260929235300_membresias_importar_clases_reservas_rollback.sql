-- Rollback de 20260929235300_membresias_importar_clases_reservas.
-- Quita las dos RPC de importación. No toca datos: las clases y reservas ya importadas se conservan
-- (son filas normales de gym_classes y class_reservations). Antes de revertir, las rutas
-- POST /api/membresias/importar/clases y /reservas deben dejar de desplegarse.

drop function if exists public.fn_membresias_importar_clases(integer, jsonb, boolean);
drop function if exists public.fn_membresias_importar_reservas(integer, jsonb, boolean);
