-- ROLLBACK de 20260916030000_f10_quotations_payment_link_amount
-- Efecto: el servicio deja de poder comparar el saldo con el importe del
-- enlace; vuelve al comportamiento previo (enlace de un solo uso, rechazo en
-- el webhook si el importe no coincide).
ALTER TABLE public.quotations
  DROP COLUMN IF EXISTS payment_link_amount,
  DROP COLUMN IF EXISTS payment_link_id;
