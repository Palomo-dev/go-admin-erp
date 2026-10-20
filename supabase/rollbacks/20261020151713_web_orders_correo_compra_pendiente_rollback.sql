-- Rollback de 20261020151713_web_orders_correo_compra_pendiente.sql
--
-- Quita la marca del correo de compra pendiente. ADVERTENCIA: no restaura el
-- momento en que cada pedido ya fue evaluado. Si la columna se vuelve a crear,
-- un pedido dentro de la ventana de 48 horas podría recibir el correo otra vez.

drop index if exists public.idx_web_orders_correo_pendiente;
alter table public.web_orders drop column if exists abandoned_email_sent_at;
