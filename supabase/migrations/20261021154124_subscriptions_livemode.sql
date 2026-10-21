-- Si el id de Stripe nació en la cuenta live. Las filas anteriores quedan
-- en null a propósito: no se rellenan en masa.
-- Sin credenciales.

alter table public.subscriptions
  add column if not exists livemode boolean;

comment on column public.subscriptions.livemode is
  'true si el id se creó con la cuenta live de Stripe; null si la fila es anterior y no se rellenó.';