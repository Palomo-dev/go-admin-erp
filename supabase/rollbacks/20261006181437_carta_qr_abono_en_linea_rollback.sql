-- Rollback de 20261006181437_carta_qr_abono_en_linea.
-- Requiere revertir antes 20261006181513 (table_visit_feedback referencia table_online_payments).
-- ⚠️ Borra el registro de abonos en línea (tabla nueva). Los pagos ya aplicados a las ventas de
-- mesa (payments, sale_items.paid_amount, pos_cobros, tips) NO se tocan: son cobros reales.
drop function if exists public.fn_mesa_abono_resultado(integer, text, text, text, numeric, text, text, text, jsonb);
drop function if exists public.fn_mesa_abono_iniciar(integer, uuid, text, integer, text, numeric, numeric, text, text);
drop function if exists public.fn_mesa_cuenta_publica(integer, uuid);
drop function if exists public.fn_mesa_comensal_linea(integer, public.sale_items);
drop table if exists public.table_online_payments;
