-- Rollback de 20260924040000_codigos_barras_unicos_por_organizacion.
--
-- 1. Quita el índice único (primero: si no, devolver los códigos repetidos
--    violaría el índice).
-- 2. Devuelve a cada variante el código que tenía antes, desde la auditoría,
--    solo si su código actual sigue siendo el que puso la migración (si alguien
--    lo cambió a mano después, se respeta el cambio).
-- 3. La tabla de auditoría NO se borra: es el registro de lo que pasó.
--
-- La numeración de cada organización (organization_barcode_settings) no
-- retrocede: los números consumidos no se reutilizan, no importa.

drop index if exists public.ux_products_org_barcode;

update public.products p
set barcode = a.barcode_anterior, updated_at = now()
from public.products_barcode_auditoria a
where a.migracion = '20260924040000_codigos_barras_unicos_por_organizacion'
  and a.product_id = p.id
  and p.barcode is not distinct from a.barcode_nuevo;
