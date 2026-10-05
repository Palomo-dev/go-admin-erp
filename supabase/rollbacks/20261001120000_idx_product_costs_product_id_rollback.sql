-- Reversión de 20261001120000_idx_product_costs_product_id.
-- Solo quita el índice; no toca datos.
drop index if exists public.idx_product_costs_product_id;
