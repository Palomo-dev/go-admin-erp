-- Reversión de 20260929225000_peso_pos_reporte_pesos_manuales.
-- Solo estructura: la función y el índice no guardan datos.

drop function if exists public.pos_reporte_pesos_manuales(integer, date, date, integer);
drop index if exists public.idx_sale_items_pesaje_manual;
