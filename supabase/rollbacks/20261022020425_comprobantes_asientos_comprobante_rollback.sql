-- Reversa de 20261022020425_comprobantes_asientos_comprobante.
--
-- Quita la vista previa, el guardado de cuentas de catalogo, los disparadores
-- de validacion, el consecutivo al insertar y el tercero automatico de la linea.
-- Correrla despues de 20261022020701, cuando el asiento manual ya no llama
-- a fn_exigir_cuenta_movimiento ni a fn_tomar_consecutivo_comprobante.
-- Los numeros ya asignados quedan en journal_entries hasta la reversa de
-- 20261022020232.

drop trigger if exists trg_products_cuentas_catalogo on public.products;
drop trigger if exists trg_categories_cuentas_catalogo on public.categories;
drop trigger if exists trg_invoice_items_cuenta_contable on public.invoice_items;
drop trigger if exists trg_comprobante_al_insertar on public.journal_entries;
drop trigger if exists trg_tercero_linea_asiento on public.journal_lines;

drop function if exists public.fn_exigir_cuenta_movimiento(integer, text);
drop function if exists public.fn_trg_tercero_linea_asiento();
drop function if exists public.fn_trg_comprobante_al_insertar();
drop function if exists public.fn_tomar_consecutivo_comprobante(integer, text, text);
drop function if exists public.fn_validar_cuenta_linea_documento();
drop function if exists public.fn_validar_cuentas_catalogo();
drop function if exists public.fn_cuentas_catalogo_guardar(integer, text, integer, text, text, text, text);
drop function if exists public.fn_vista_previa_asiento_documento(text, uuid, jsonb);
