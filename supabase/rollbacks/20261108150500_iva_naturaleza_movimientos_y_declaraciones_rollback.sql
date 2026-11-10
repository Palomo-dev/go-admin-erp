-- Reversión de 20261108150500_iva_naturaleza_movimientos_y_declaraciones.sql (escrita, no aplicada).
-- ADVERTENCIA: borra las naturalezas de asientos (con los expedientes y decisiones de corrección de error de la ronda 4,
-- la verificación de la contingencia, la consulta del CUFE/CUDE y la aprobación de los cierres de la ronda 5) y los
-- períodos declarados registrados por las personas, con su vencimiento y firmeza (esta reversión no restaura datos).
-- Revertir antes 20261108151000 (el borrador v2 las lee).

drop function if exists public.fn_iva_correccion_error_decidir(integer, integer, jsonb);
drop function if exists public.fn_iva_naturaleza_asiento_aprobar(integer, integer, boolean, text);
drop function if exists public.fn_iva_naturaleza_asiento_guardar(integer, integer, jsonb);
drop function if exists public.fn_tributario_iva_declaracion_guardar(integer, date, date, jsonb);
drop function if exists public.fn_iva_contingencia_descartada(public.tributario_iva_naturaleza_asiento, timestamptz);
drop function if exists public.fn_iva_correccion_expediente_faltantes(public.tributario_iva_naturaleza_asiento);
drop table if exists public.tributario_iva_naturaleza_asiento;
drop table if exists public.tributario_iva_declaraciones;
