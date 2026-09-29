-- Reversión de 20260929170000_inv_b8_1_recepciones_esquema.sql.
-- Revertir antes 20260929170100_inv_b8_2_recepcionar (fn_oc_recepcionar escribe
-- estas tablas).
-- ADVERTENCIA: borra el documento de cada recepción (qué llegó, en qué lote, con
-- qué seriales y con qué clave). Las cantidades recibidas de la orden, el kardex,
-- los lotes y los seriales NO se tocan.

drop table if exists public.purchase_receipt_items;
drop table if exists public.purchase_receipts;
