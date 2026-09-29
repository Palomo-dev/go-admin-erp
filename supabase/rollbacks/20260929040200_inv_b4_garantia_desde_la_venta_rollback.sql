-- Reversión de 20260929040200_inv_b4_garantia_desde_la_venta.sql.
-- Quita el disparador: cada escritor vuelve a fijar (o no) la garantía por su
-- cuenta. Las garantías ya calculadas no se tocan.

drop trigger if exists trg_serial_garantia_desde_venta on public.serial_numbers;
drop function if exists public.fn_serial_int_garantia_desde_venta();
