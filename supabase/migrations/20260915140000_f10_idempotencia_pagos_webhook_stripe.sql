-- ============================================================
-- F10 · idempotencia de pagos registrados por el webhook de Stripe
-- ============================================================
-- Hallazgo del tester de F10 r1: `registerCrmPayment` es check-then-insert y
-- `payments` solo tiene PK + índice por organización. Dos entregas concurrentes
-- del mismo evento de Stripe (`reference = 'stripe:<event.id>'`) producían dos
-- filas y el trigger de balance dejaba la factura en `paid` con el sobrante
-- invisible.
--
-- Un índice único global sobre (organization_id, reference) NO es posible:
-- `reference` es texto libre y hoy hay 10 pares repetidos legítimos
-- («Pago total a…», números de reserva). Por eso el índice es PARCIAL y solo
-- cubre el espacio de nombres del webhook (`stripe:%`), que hoy tiene 0 filas.
-- El código debe tratar el 23505 como «ya registrado» (idempotente), no como
-- error.
-- Aditivo, sin bloqueo relevante (2 299 filas).
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_org_stripe_reference
  ON public.payments (organization_id, reference)
  WHERE reference LIKE 'stripe:%';

COMMENT ON INDEX public.uq_payments_org_stripe_reference IS
  'F10: un pago por evento de Stripe y organización (reference = stripe:<event.id>). Parcial: el resto de referencias es texto libre.';
