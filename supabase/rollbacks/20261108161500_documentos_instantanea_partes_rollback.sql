-- Reversión de supabase/migrations/20261108161500_documentos_instantanea_partes.sql.
-- ADVERTENCIA DE DATOS: borra las instantáneas tomadas al expedir. Después de revertir, el motor de PDF vuelve a armar
-- esos documentos con la respuesta de Factus guardada o con la vigencia por fecha («reconstruido»). Exportar antes la
-- tabla si tiene filas (select * from public.document_party_snapshots).

drop trigger if exists trg_zz_instantanea_partes on public.invoice_sales;
drop trigger if exists trg_zz_instantanea_partes on public.support_documents;
drop trigger if exists trg_zz_instantanea_partes on public.quotations;
drop trigger if exists trg_zz_instantanea_partes on public.payments;
drop trigger if exists trg_zz_instantanea_receptor_xml on public.electronic_invoicing_jobs;

drop function if exists public.fn_document_snapshot_envio_aceptado();
drop function if exists public.fn_document_snapshot_pago();
drop function if exists public.fn_document_snapshot_cotizacion();
drop function if exists public.fn_document_snapshot_soporte();
drop function if exists public.fn_document_snapshot_factura();
drop function if exists public.fn_document_snapshot_proveedor(integer);
drop function if exists public.fn_document_snapshot_cliente(uuid);
drop function if exists public.fn_document_snapshot_guardar(integer, text, uuid, date, jsonb);
drop function if exists public.fn_document_snapshot_dia(integer, timestamptz);
drop function if exists public.fn_document_snapshot_emisor(integer, date);

drop table if exists public.document_party_snapshots;
drop function if exists public.fn_document_party_snapshots_inmutable();
