-- ============================================================
-- F10 · quotations.payment_link_amount / payment_link_id
-- ============================================================
-- Deuda B1 del tester de F10 (rondas 2–4): el enlace de pago de Stripe se
-- crea con el saldo de la factura en ese momento, pero `quotations` solo
-- guardaba la URL. Si el saldo cambia después (un abono manual), el enlace
-- viejo cobra de más y solo se detecta en el webhook (rechazo con actividad).
-- Con estas dos columnas el servicio puede comparar `balance` con el importe
-- del enlace vigente y regenerarlo (desactivando el anterior por id) antes de
-- mostrarlo. Aditiva, NULL-able, sin backfill (hoy 0 enlaces creados).
-- ============================================================

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS payment_link_amount numeric NULL,
  ADD COLUMN IF NOT EXISTS payment_link_id text NULL;

COMMENT ON COLUMN public.quotations.payment_link_amount IS
  'F10: importe (saldo de la factura) con el que se creó el Payment Link vigente; si difiere del saldo actual, se regenera.';
COMMENT ON COLUMN public.quotations.payment_link_id IS
  'F10: id del Payment Link de Stripe vigente (plink_…), para desactivarlo al regenerar o al cobrar.';
