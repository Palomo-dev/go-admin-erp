-- Reversión de 20260930233200_inv_variantes_huerfanas_limpieza.
--
-- Devuelve cada variante que la limpieza dio de baja a su status y updated_at
-- anteriores EXACTOS, leyendo private.inv_variantes_baja_en_cascada (origen
-- 'limpieza_20260930'), y borra esas filas del rastro.
--   · Solo toca las que siguen en 'deleted': si alguien las cambió después, se respeta.
--   · Las que ya volvieron porque se restauró su padre no están en el rastro
--     (el disparador las quitó al restaurarlas): no se tocan.
--   · Vuelven a quedar como variantes vivas de un padre eliminado: la guarda
--     trg_producto_variante_padre_vigente lo impediría, así que este archivo la
--     permite SOLO en su transacción (inv.permitir_variante_huerfana = on).
-- Ejecutar ANTES que el rollback de 20260930233000 (que borra el rastro).

select set_config('inv.permitir_variante_huerfana', 'on', true);

update public.products v
   set status = r.status_previo,
       updated_at = r.updated_at_previo
  from private.inv_variantes_baja_en_cascada r
 where r.origen = 'limpieza_20260930'
   and v.id = r.variant_id
   and v.status = 'deleted';

delete from private.inv_variantes_baja_en_cascada where origen = 'limpieza_20260930';

select set_config('inv.permitir_variante_huerfana', '', true);
