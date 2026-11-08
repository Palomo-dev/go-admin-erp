-- Reversión de 20261108151000_tributario_borrador_iva_300.sql (escrita, no aplicada). La función es de solo
-- lectura: quitarla deja la vista por casillas del «Borrador de IVA» en «pendiente de activar»; el borrador
-- v1 (fn_tributario_borrador_iva, 20261108101000) no se toca y sigue funcionando.

drop function if exists public.fn_tributario_borrador_iva_300(integer, date, date);
