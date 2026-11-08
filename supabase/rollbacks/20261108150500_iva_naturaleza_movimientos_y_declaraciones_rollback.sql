-- Reversión de 20261108150500_iva_naturaleza_movimientos_y_declaraciones.sql (escrita, no aplicada).
-- ADVERTENCIA: borra las naturalezas de asientos y los períodos declarados registrados por las personas
-- (esta reversión no restaura datos). Revertir antes 20261108151000 (el borrador v2 las lee).

drop function if exists public.fn_iva_naturaleza_asiento_guardar(integer, integer, jsonb);
drop function if exists public.fn_tributario_iva_declaracion_guardar(integer, date, date, jsonb);
drop table if exists public.tributario_iva_naturaleza_asiento;
drop table if exists public.tributario_iva_declaraciones;
