-- Rollback de 20260930230200_inicio_actividad: quita la función. La ruta
-- `GET /api/inicio/actividad` responde entonces 500 y la tarjeta «Actividad
-- reciente» muestra su error con «Reintentar». No toca datos.

drop function if exists public.fn_inicio_actividad(integer, timestamptz, timestamptz, integer, text, integer, integer);
