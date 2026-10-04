-- Revertir primero el consumidor. No borra ventas, reservas, folios, pedidos
-- ni importes: únicamente retira la vista de lectura. Sin CASCADE.
DROP VIEW IF EXISTS public.crm_customer_financial_history;
