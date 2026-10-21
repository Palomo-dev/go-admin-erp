-- Aplicada el 2026-10-20 con apply_migration (versión 20261020151713).
--
-- Marca del correo de compra pendiente: un pedido web cancelado o expirado
-- se evalúa una sola vez. NULL = todavía no se decidió. La ventana del envío
-- (dos horas después, y no más de 48) vive en el cron del sitio, no aquí:
-- los pedidos anteriores a esa ventana no se actualizan.
--
-- Idempotente. Rollback: supabase/rollbacks/20261020151713_web_orders_correo_compra_pendiente_rollback.sql

set lock_timeout = '10s';
alter table public.web_orders
  add column if not exists abandoned_email_sent_at timestamptz;
comment on column public.web_orders.abandoned_email_sent_at is
  'Momento en que se decidió el correo de compra pendiente: enviado, o dejado pasar a propósito (ya pagó después, o el pago no era por pasarela). NULL: todavía no se evaluó. Una sola vez por pedido.';
create index if not exists idx_web_orders_correo_pendiente
  on public.web_orders (cancelled_at)
  where abandoned_email_sent_at is null
    and payment_status = 'failed'
    and status in ('expired', 'cancelled');
