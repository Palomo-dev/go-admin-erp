-- Rollback de 20261006181513_carta_qr_valoracion.
-- ⚠️ Borra las valoraciones hechas desde la Carta QR (la tabla es nueva): no se restauran.
drop function if exists public.fn_mesa_valorar(integer, uuid, integer, text[], text, text, uuid);
drop table if exists public.table_visit_feedback;
