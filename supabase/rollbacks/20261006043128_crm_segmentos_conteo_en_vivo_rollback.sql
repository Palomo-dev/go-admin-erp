-- Reversión de 20261006230100_crm_segmentos_conteo_en_vivo.
-- Función nueva y de solo lectura: se borra. La ruta
-- POST /api/crm/segments/preview responde 503 `conteo_no_disponible` y el
-- constructor muestra «No pudimos contar… puedes guardar igual».
drop function if exists public.crm_segment_preview(integer, jsonb, integer);
