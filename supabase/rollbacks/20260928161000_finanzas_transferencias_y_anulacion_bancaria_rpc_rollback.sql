-- Reversión de 20260928161000_finanzas_transferencias_y_anulacion_bancaria_rpc.
--
-- Antes de aplicarla, el código que llama a fn_transferencia_registrar,
-- fn_transferencia_anular y fn_movimiento_banco_anular debe volver a su versión
-- anterior (y, para que las transferencias puedan escribirse, revertir también
-- 20260928160000, que quitó la escritura directa en bank_transfers).
--
-- NO revierte datos: las transferencias registradas o anuladas y los reversos
-- bancarios (import_source = 'anulacion') se quedan.

drop function if exists public.fn_transferencia_registrar(uuid, integer, integer, integer, numeric, date, text, text, integer);
drop function if exists public.fn_transferencia_anular(integer, uuid, text);
drop function if exists public.fn_movimiento_banco_anular(integer, integer, text);
