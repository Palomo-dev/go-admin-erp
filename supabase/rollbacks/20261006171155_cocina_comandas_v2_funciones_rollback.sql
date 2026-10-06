-- Reversión de 20261006171155_cocina_comandas_v2_funciones.sql.
-- Quita las RPC de Comandas v2. El estado de las comandas (status) NO se
-- revierte: queda como lo dejaron las RPC, que es un estado válido para el
-- código anterior.
-- Orden de reversión de cocina_comandas_v2: 171208 → 171155 → 171048.

drop function if exists public.pos_cocina_rondas_mesa(integer, uuid, uuid);
drop function if exists public.pos_cocina_avisar_mesero(integer, uuid, integer);
drop function if exists public.pos_cocina_cerrar_anteriores(integer, uuid, integer, timestamptz, text);
drop function if exists public.pos_cocina_mover_item(integer, uuid, integer, text);
drop function if exists public.pos_cocina_cancelar(integer, uuid, integer, text);
drop function if exists public.pos_cocina_marcar_item(integer, uuid, integer, boolean);
drop function if exists public.pos_cocina_cambiar_estado(integer, uuid, integer, text, text, text);
drop function if exists public.fn_pos_cocina_aplicar_derivado(integer);
drop function if exists public.fn_pos_cocina_estado_derivado(integer);
drop function if exists public.fn_pos_cocina_puede(integer, uuid, text);
