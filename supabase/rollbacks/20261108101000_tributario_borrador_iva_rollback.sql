-- Reversión de 20261108101000_tributario_borrador_iva.sql. La función es solo de lectura: quitarla deja
-- el «Borrador de IVA» y el valor estimado del IVA del Centro tributario en «pendiente de activar».
-- Migración aplicada por el MCP el 2026-11-07 con orden del dueño.

drop function if exists public.fn_tributario_borrador_iva(integer, date, date);
