-- Reversión de 20260929210000_auth_intentos_acceso.
-- Borra la tabla de intentos (solo contadores temporales, sin datos de negocio) y sus funciones.
-- Antes de aplicarla, el login debe dejar de llamar a esas funciones o POST /api/auth/acceso
-- responderá «inesperado».

drop function if exists public.fn_acceso_limpiar(text);
drop function if exists public.fn_acceso_registrar_fallo(jsonb);
drop function if exists public.fn_acceso_bloqueo_vigente(text[]);
drop table if exists public.auth_intentos_acceso;
