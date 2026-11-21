-- Reversión de 20261121223000_finanzas_impuestos_uso_productos.sql.
-- La función es de solo lectura: quitarla no toca datos. La pantalla
-- Finanzas › Impuestos deja de mostrar los conteos de productos (muestra «—»).
drop function if exists public.fn_impuestos_uso_productos(integer);
