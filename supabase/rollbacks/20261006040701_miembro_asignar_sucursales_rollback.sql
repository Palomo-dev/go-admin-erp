-- Reversión de 20261006150400_miembro_asignar_sucursales. Solo estructura: las asignaciones hechas
-- con la función se quedan como están (son filas normales de member_branches).
drop function if exists public.fn_miembro_asignar_sucursales(bigint, integer[], boolean);
