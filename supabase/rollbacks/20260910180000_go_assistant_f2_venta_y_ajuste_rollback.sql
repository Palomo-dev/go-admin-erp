-- Reversión de 20260910180000_go_assistant_f2_venta_y_ajuste.sql
--
-- Solo elimina las dos funciones. NO revierte ventas ni ajustes ya registrados:
-- eso tiene contraparte contable (los disparadores fn_auto_journal_* generan
-- asientos) y borrarlos a ciegas descuadraría los libros. Si hay que anular un
-- documento concreto, se anula por su camino de negocio, no por aquí.

drop function if exists public.assistant_register_sale(integer, integer, uuid, jsonb);
drop function if exists public.assistant_create_adjustment(integer, integer, uuid, jsonb);
