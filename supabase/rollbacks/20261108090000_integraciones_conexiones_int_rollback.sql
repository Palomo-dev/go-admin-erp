-- Reversión de 20261108090000_integraciones_conexiones_int.sql.
-- Migración aplicada por el MCP el 2026-11-07 con orden del dueño.
-- Restaura el CHECK enumerado como NOT VALID: las credenciales guardadas con propósitos nuevos
-- (Stripe, PayPal, PayU, Bold, SendGrid, logística) se conservan, pero no se podrán insertar
-- más. Las columnas de webhook_endpoints se eliminan: se pierde el resultado del último envío
-- (dato derivado, no de negocio).

begin;

alter table public.integration_credentials
  drop constraint if exists integration_credentials_purpose_check;
alter table public.integration_credentials
  add constraint integration_credentials_purpose_check
  check (purpose = any (array['primary','backup','legacy','rotation','public_key','private_key',
                              'events_secret','integrity_secret','access_token','refresh_token',
                              'webhook_secret']::text[])) not valid;

alter table public.webhook_endpoints
  drop column if exists consecutive_failures,
  drop column if exists last_response_status,
  drop column if exists last_delivery_at;

commit;
