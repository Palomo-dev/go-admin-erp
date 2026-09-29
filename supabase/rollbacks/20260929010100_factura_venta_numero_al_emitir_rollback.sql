-- Reversión de 20260929010100_factura_venta_numero_al_emitir.sql.
-- ADVERTENCIA: falla si quedan borradores sin número. Antes de revertir,
-- numerarlos (por ejemplo, emitiéndolos o asignando un consecutivo interno)
-- o eliminarlos.

comment on column public.invoice_sales.number is null;
alter table public.invoice_sales alter column number set not null;
