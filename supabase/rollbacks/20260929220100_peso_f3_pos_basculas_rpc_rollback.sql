-- Reversión de 20260929220100_peso_f3_pos_basculas_rpc.
-- Revertir antes 20260929220200 (el parche de fn_pos_validar_pesaje no usa
-- estas funciones, pero sí la tabla). No toca datos.

drop function if exists public.pos_basculas_para_pos(integer, integer, uuid, uuid);
drop function if exists public.pos_basculas_registrar_prueba(integer, uuid, boolean);
drop function if exists public.pos_basculas_archivar(integer, uuid, boolean);
drop function if exists public.pos_basculas_guardar(integer, jsonb);
drop function if exists public.pos_basculas_listar(integer, integer);
drop function if exists public.fn_pos_bascula_json(uuid);
drop function if exists public.fn_pos_basculas_exigir_permiso(integer);
drop function if exists public.fn_pos_basculas_puede_configurar(integer, uuid);
