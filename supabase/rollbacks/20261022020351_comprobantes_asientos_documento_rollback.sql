-- Reversa de 20261022020351_comprobantes_asientos_documento.
--
-- Quita el armado y la publicacion del asiento por lineas. Correrla despues
-- de 20261022020752, cuando facturas y notas ya no llaman a estas funciones,
-- y despues de 20261022020425, cuando la vista previa ya no llama a fn_armar.

drop function if exists public.fn_asiento_documento_por_lineas(uuid, text, text);
drop function if exists public.fn_armar_asiento_documento(text, uuid, jsonb);
