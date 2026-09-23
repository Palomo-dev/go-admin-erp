-- Rollback de 20260924001500_clientes_ids_por_criterio.sql
-- Sin datos que restaurar: solo una función de lectura y un privilegio.

drop function if exists public.fn_clientes_ids(integer, integer, text, text, text, text, uuid, text, text);
grant execute on function public.fn_clientes_exigir_permiso(integer, text[]) to authenticated;
