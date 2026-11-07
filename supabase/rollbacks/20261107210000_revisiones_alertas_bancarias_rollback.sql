-- Reversión de 20261107210000_revisiones_alertas_bancarias.sql
-- ADVERTENCIA: borra la tabla y con ella el historial de revisiones de alertas.
-- No restaura datos. Los movimientos anulados desde «Es un duplicado» siguen
-- anulados (son movimientos contrarios en bank_transactions, no viven aquí).

drop policy if exists bank_alert_reviews_alta on public.bank_alert_reviews;
drop policy if exists bank_alert_reviews_lectura on public.bank_alert_reviews;
drop index if exists public.bank_alert_reviews_cuenta_idx;
drop table if exists public.bank_alert_reviews;
