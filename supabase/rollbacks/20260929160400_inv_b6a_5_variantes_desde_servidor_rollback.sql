-- Reversión de 20260929160400_inv_b6a_5_variantes_desde_servidor.sql
-- La ruta POST /api/inventario/variantes deja de funcionar (500) hasta que se
-- revierta también el código. `fn_variantes_int_valores_de` vuelve a la
-- versión de 20260929160150 al reaplicar ese archivo.

drop function if exists public.fn_variantes_como_actor(uuid, integer, text, jsonb);
