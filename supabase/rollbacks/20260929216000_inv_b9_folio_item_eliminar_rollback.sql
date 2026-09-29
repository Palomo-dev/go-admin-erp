-- Reversión de 20260929216000_inv_b9_folio_item_eliminar.
-- Antes de aplicarla, foliosService.deleteFolioItem debe volver a borrar desde el navegador.
-- No revierte movimientos de stock ya registrados.

drop function if exists public.fn_folio_item_eliminar(uuid, integer);
