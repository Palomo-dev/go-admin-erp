-- Reversión de 20261108020000_documento_soporte_guardar.sql.
--
-- ATENCIÓN: los CHECK viejos NO admiten líneas `support_document`. Si ya se
-- guardó algún documento soporte con líneas, restaurarlos fallaría: se dejan
-- NOT VALID (las filas existentes no se revisan; las nuevas sí) para no borrar
-- datos. La política, el índice y las funciones se quitan sin tocar filas.

drop function if exists public.fn_documento_soporte_guardar(integer, uuid, jsonb);
drop function if exists public.fn_documento_soporte_referencia(integer);

drop index if exists public.uq_support_documents_org_referencia;

drop policy if exists invoice_items_soporte_select on public.invoice_items;

alter table public.invoice_items
  add constraint invoice_items_invoice_type_check
  check (invoice_type = any (array['sale'::text, 'purchase'::text])) not valid;
alter table public.invoice_items drop constraint if exists invoice_items_invoice_type_check_v2;

alter table public.invoice_items
  add constraint chk_invoice_items_type_sales
  check (
    (invoice_type = 'sale' and invoice_sales_id is not null and invoice_purchase_id is null)
    or (invoice_type = 'purchase' and invoice_purchase_id is not null and invoice_sales_id is null)
  ) not valid;
alter table public.invoice_items drop constraint if exists chk_invoice_items_documento;
