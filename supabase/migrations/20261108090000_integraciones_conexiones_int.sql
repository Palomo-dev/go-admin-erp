-- Frente INT · Integraciones (ronda 4, 2026-11-07). Aplicada por el MCP el 2026-11-07 con orden del dueño.
-- Aditiva; no toca filas existentes ni secretos.
--
-- 1. integration_credentials.purpose: el CHECK enumerado solo admite 11 propósitos y deja fuera
--    los que el código ya usa (Stripe publishable_key/secret_key, PayPal client_id/client_secret/
--    webhook_id, PayU api_key/api_login/merchant_id/account_id, Bold identity_key/secret_key,
--    SendGrid api_key/from_email/from_name, y los campos de logística: apikey, token, clave_*).
--    Hoy esas conexiones no se pueden guardar (0 filas: verificado por MCP el 2026-11-07).
--    Se sustituye por un CHECK de forma (snake_case), que es un superconjunto: las 16 filas de
--    Wompi (public_key, private_key, events_secret, integrity_secret) siguen siendo válidas.
-- 2. webhook_endpoints: resultado del último envío real (la prueba deja de ser simulada).

begin;

alter table public.integration_credentials
  drop constraint if exists integration_credentials_purpose_check;
alter table public.integration_credentials
  add constraint integration_credentials_purpose_check
  check (purpose ~ '^[a-z][a-z0-9_]{1,62}$');

alter table public.webhook_endpoints
  add column if not exists last_delivery_at timestamptz null,
  add column if not exists last_response_status integer null,
  add column if not exists consecutive_failures integer not null default 0;

comment on column public.webhook_endpoints.last_delivery_at is
  'Último envío real (prueba o evento) al target_url. Lo escribe el servidor.';
comment on column public.webhook_endpoints.last_response_status is
  'Código HTTP de la última respuesta; 0 si no hubo respuesta (tiempo agotado o red).';
comment on column public.webhook_endpoints.consecutive_failures is
  'Envíos fallidos seguidos; vuelve a 0 con una respuesta 2xx.';

commit;

-- Verificación (dentro de begin; … rollback;):
--   select count(*) from public.integration_credentials where purpose !~ '^[a-z][a-z0-9_]{1,62}$'; -- 0
--   select column_name from information_schema.columns
--    where table_name = 'webhook_endpoints' and column_name like 'last_%';                      -- 2 filas
