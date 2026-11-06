-- Quita la búsqueda y la creación automática de la cuenta de caja.
-- No borra auxiliares «Caja general» ni mapeos de sede que la función
-- haya creado: eso ya es plan de cuentas de la organización.
-- Aplicar después de revertir 20261024035748, que es quien la llama.

drop function if exists public.fn_cuenta_caja(integer, integer, text);
drop function if exists public.fn_cuenta_caja_existente(integer, integer, text);
drop function if exists public.fn_cuenta_movimiento_o_detalle(integer, integer, text);
