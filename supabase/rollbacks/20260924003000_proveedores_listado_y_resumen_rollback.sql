-- Rollback de 20260924003000_proveedores_listado_y_resumen.
-- Solo crea funciones de lectura: quitarlas no toca datos. El listado, el
-- detalle y el diálogo de borrado de proveedores dejan de funcionar hasta que
-- se revierta también el código que las llama (supplierService).

drop function if exists public.proveedor_resumen(integer, integer);
drop function if exists public.proveedores_resumen(integer);
drop function if exists public.proveedores_listado(integer, integer, integer, text, text, text, text, boolean, text, text, integer[]);
