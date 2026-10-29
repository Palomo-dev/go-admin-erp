-- Rastro del envío del link de pago por correo en los cambios de pedidos web.
-- Solo columnas nuevas; no toca grants ni políticas (heredan las de la tabla).
alter table public.web_order_changes
  add column if not exists email_sent_at timestamptz,
  add column if not exists email_sent_count integer not null default 0,
  add column if not exists email_message_id text,
  add column if not exists email_sent_to_masked text;

comment on column public.web_order_changes.email_sent_at is 'Último envío del link de pago por correo.';
comment on column public.web_order_changes.email_sent_count is 'Veces que se envió el link por correo.';
comment on column public.web_order_changes.email_message_id is 'Id del último correo en el proveedor (Resend).';
comment on column public.web_order_changes.email_sent_to_masked is 'Destinatario enmascarado (l***@dominio.com).';
