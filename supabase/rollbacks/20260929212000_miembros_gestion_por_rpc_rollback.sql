-- Reversión de 20260929212000_miembros_gestion_por_rpc.
-- Borra las funciones de gestión de miembros. Las pantallas que las llaman quedarán sin poder
-- cambiar rol, estado ni retirar miembros (como antes, cuando RLS lo filtraba en silencio).

drop function if exists public.fn_miembro_retirar(bigint);
drop function if exists public.fn_miembro_cambiar_estado(bigint, boolean);
drop function if exists public.fn_miembro_cambiar_rol(bigint, integer);
drop function if exists public.fn_miembro_gestion_guarda(bigint, text);
