-- Reversión de 20260925130000_pos_caja_esperado_y_arqueo_servidor.sql
--
-- Advertencia: quitar `method_breakdown` borra el desglose por método de los
-- arqueos guardados desde esta migración (el efectivo sigue en
-- counted_amount/expected_amount). Sin las funciones, «Guardar arqueo» y
-- POST /api/pos/cajas/[id]/cerrar fallan: revertir también el código.

drop function if exists public.pos_caja_registrar_arqueo(integer, text, numeric, jsonb, jsonb, text);
drop function if exists public.pos_caja_esperado(integer);
alter table public.cash_counts drop column if exists method_breakdown;
