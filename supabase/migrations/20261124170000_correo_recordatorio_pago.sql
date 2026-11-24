-- Correo «Termina tu pago» de la tienda web (2026-11-24).
-- La tienda (goadmin-websites, cron /api/cron/recordatorio-pago) registra cada recordatorio en
-- web_order_email_log con tipo 'recordatorio_pago'. Uno solo por pedido: el índice único hace
-- atómico el reclamo entre corridas (el código trata 23505 como «otra corrida lo tomó»).
-- Aditiva: amplía el CHECK y agrega un índice parcial.

alter table public.web_order_email_log drop constraint if exists web_order_email_log_tipo_check;
alter table public.web_order_email_log add constraint web_order_email_log_tipo_check
  check (tipo = any (array['pedido_pagado', 'compra_pendiente', 'recordatorio_pago']));

create unique index if not exists uq_web_order_email_log_recordatorio
  on public.web_order_email_log (web_order_id) where tipo = 'recordatorio_pago';
