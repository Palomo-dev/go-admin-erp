-- ROLLBACK de 20260915140000_f10_idempotencia_pagos_webhook_stripe
-- Efecto: dos entregas concurrentes del mismo evento de Stripe vuelven a poder
-- registrar dos pagos.
DROP INDEX IF EXISTS public.uq_payments_org_stripe_reference;
