-- Reversión de 20261124170000_correo_recordatorio_pago.sql
drop index if exists public.uq_web_order_email_log_recordatorio;
delete from public.web_order_email_log where tipo = 'recordatorio_pago';
alter table public.web_order_email_log drop constraint if exists web_order_email_log_tipo_check;
alter table public.web_order_email_log add constraint web_order_email_log_tipo_check
  check (tipo = any (array['pedido_pagado', 'compra_pendiente']));
