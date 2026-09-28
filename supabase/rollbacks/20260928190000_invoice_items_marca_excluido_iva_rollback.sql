-- Rollback de 20260928190000_invoice_items_marca_excluido_iva.
-- Quita el disparador y la función. La plantilla IVA_EXCLUIDO solo se borra si
-- ninguna organización la usa (si la usan, quitarla rompería su impuesto). Las
-- líneas ya marcadas conservan tax_code / is_excluded: son datos de documentos.

drop trigger if exists trg_invoice_items_marca_excluido on public.invoice_items;
drop function if exists public.fn_invoice_items_marca_excluido();

delete from public.tax_templates t
 where t.code = 'IVA_EXCLUIDO'
   and not exists (select 1 from public.organization_taxes ot where ot.template_id = t.id);
