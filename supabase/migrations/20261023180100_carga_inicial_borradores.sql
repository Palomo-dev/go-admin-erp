-- Borradores de las cargas initial que quedaron sin asiento.
-- Un comprobante por organización, posted = false, fecha al inicio del mes
-- en la zona de la organización. No publica. La org 149 y las de prueba
-- no reciben comprobante. Volver a correrlo reemplaza las líneas del mismo
-- borrador. La reversión está en el rollback de este archivo: borra esos
-- borradores si siguen sin publicar.

select public.fn_carga_inicial_borradores();
