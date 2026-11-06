-- Reversión de 20261107151000_cuenta_efectiva.
-- Quita las funciones de lectura. El motor no cambió, así que los asientos no se tocan.
-- No borra ver_cuentas_contables de profiles.metadata: queda sin uso y no afecta nada.
-- Las cuentas que alguien haya fijado en productos o categorías tampoco se revierten.
drop function if exists public.fn_preferencia_ver_cuentas_guardar(boolean);
drop function if exists public.fn_preferencia_ver_cuentas();
drop function if exists public.fn_cuenta_catalogo_fijar(integer, text, integer, text, text);
drop function if exists public.fn_cuenta_sugerida_proveedor(integer, integer);
drop function if exists public.fn_cuentas_efectivas(integer, integer, text, jsonb);
drop function if exists public.fn_cuenta_efectiva_resolver(integer, integer, text, text, integer, integer, text, boolean);
drop function if exists public.fn_cuenta_efectiva_defecto(integer, integer, text, text, boolean);
drop function if exists public.fn_cuenta_lectura_asiento(integer, integer, text, boolean);
