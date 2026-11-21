-- Reversión de 20261120180425_pos_cargos_servicio_impuesto_y_archivo.sql.
-- Los cargos archivados vuelven a verse como inactivos; el impuesto elegido se pierde
-- (is_taxable conserva el último valor derivado).
drop trigger if exists trg_service_charges_impuesto_y_archivo on public.service_charges;
drop function if exists public.fn_service_charges_impuesto_y_archivo();
drop index if exists public.idx_service_charges_tax_id;
alter table public.service_charges drop column if exists archived_at;
alter table public.service_charges drop column if exists tax_id;
