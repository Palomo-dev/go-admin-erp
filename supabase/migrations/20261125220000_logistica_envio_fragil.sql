-- Logística: «Frágil — manipular con cuidado» como dato real del envío (2026-11-25).
--
-- La guía de envío estándar (Figma «21 Logística» 3223:15627, variante 3224:15741 «con
-- contraentrega y frágil») pinta el bloque «FRÁGIL · MANIPULAR CON CUIDADO · ESTE LADO ARRIBA».
-- Hasta hoy el formulario del envío guardaba el interruptor solo dentro de `shipments.metadata`
-- (clave `is_fragile`, 0 filas con el valor al 2026-11-25) y no había columna: no se podía filtrar,
-- ni marcar desde «Imprimir guías» sin reescribir toda la metadata del envío.
--
-- Columna y no metadata: es un dato operativo de primera (lo leen el rótulo, el despacho y mañana
-- los reportes), un booleano de dos estados sin texto libre, y se cambia con un UPDATE de una
-- columna (sin leer-modificar-escribir la metadata, que la escriben también la tienda y el POS).
-- Si más adelante hace falta una nota libre de manipulación, irá aparte.
--
-- Aditiva: NOT NULL con DEFAULT false (en Postgres 11+ no reescribe la tabla). Toma los envíos
-- que ya traían `metadata.is_fragile = true`. La RLS de `shipments` no cambia: marcarlo sigue
-- exigiendo el permiso de Logística (`fn_logistica_ve_todo`), igual que editar el envío.

alter table public.shipments
  add column if not exists is_fragile boolean not null default false;

comment on column public.shipments.is_fragile is
  'Frágil: la guía imprime «FRÁGIL · MANIPULAR CON CUIDADO · ESTE LADO ARRIBA». Se marca en el envío (formulario o «Imprimir guías»).';

update public.shipments
   set is_fragile = true
 where is_fragile = false
   and coalesce(metadata->>'is_fragile', '') = 'true';
