-- Rollback de 20261021154124_subscriptions_livemode.sql
--
-- Quita la columna. Si ya se escribió livemode en altas nuevas, ese dato
-- se pierde. No toca status ni los id de Stripe.

alter table public.subscriptions
  drop column if exists livemode;
