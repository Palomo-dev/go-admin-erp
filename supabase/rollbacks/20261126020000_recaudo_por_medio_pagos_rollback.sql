-- Rollback de 20261126020000_recaudo_por_medio_pagos.sql.
-- Quita la función de lectura y el índice parcial. No hay datos que restaurar (la migración no
-- escribió filas). Las pantallas de recaudo dejan de mostrar el desglose por medio hasta que se
-- vuelva a aplicar.
drop function if exists public.fn_recaudo_pagos(integer, timestamptz, timestamptz, integer);
drop index if exists public.idx_web_orders_sale_id;
