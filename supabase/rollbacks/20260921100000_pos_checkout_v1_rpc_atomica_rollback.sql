-- Rollback de 20260921100000_pos_checkout_v1_rpc_atomica.sql
--
-- Elimina la RPC de checkout atómico. No toca datos: las ventas creadas por la
-- RPC son filas normales de sales/invoice_sales/payments/… y siguen siendo
-- válidas. Tras revertir, `POSService.checkout` detecta la función ausente
-- (PGRST202) y vuelve al camino de N inserts desde el cliente (fase 4B).

drop function if exists public.pos_checkout_v1(jsonb);
