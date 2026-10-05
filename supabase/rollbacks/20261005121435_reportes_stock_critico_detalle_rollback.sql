-- Reversión de 20261005121435_reportes_stock_critico_detalle.
--
-- Borra la función nueva. No toca datos. El reporte «Stock crítico» del
-- frontend (inventarioReports.ts) la llama: revertir también ese código, que
-- volvía a leer stock_levels con sus incrustados desde el navegador.

drop function if exists public.fn_reporte_stock_critico_detalle(bigint, bigint);
