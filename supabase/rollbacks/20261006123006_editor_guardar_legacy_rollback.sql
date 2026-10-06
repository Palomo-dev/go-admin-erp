-- Reversión de 20261009090000_editor_guardar_legacy.sql (SIN APLICAR).
-- Quita la función. POST /api/sitio-web/editor/guardar vuelve a su respaldo (escrituras
-- con el cliente de la sesión, no atómicas); no se pierden datos.

drop function if exists public.fn_editor_guardar_legacy(integer, uuid, integer, jsonb);
