-- Rollback de 20260924031000_etiquetas_producto_tags.
--
-- Quita las cuatro funciones. NO restaura datos: las etiquetas fusionadas o
-- eliminadas con ellas no vuelven (las relaciones se movieron o cayeron por
-- cascada). La pantalla /app/inventario/etiquetas deja de funcionar hasta que
-- se revierta también su código (EtiquetasService).

drop function if exists public.etiquetas_producto_eliminar(integer, integer[]);
drop function if exists public.etiquetas_producto_fusionar(integer, integer, integer[]);
drop function if exists public.etiquetas_producto_resumen(integer);
drop function if exists public.etiquetas_producto_listado(integer);
