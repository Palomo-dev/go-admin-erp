-- ============================================================
-- ROLLBACK de 20260909045132_crm_v4_f00_31_backfill_stages_is_won_is_lost
-- ============================================================
-- Escrito el 2026-09-15 (F0-DB ronda 3, B1): la migración se aplicó por MCP
-- sin dejar rollback; este archivo deshace su DDL en orden inverso.
-- Deshace el backfill: pone a false is_won/is_lost SOLO en las etapas cuyo
-- nombre normalizado coincide con la heurística de la migración. Es la
-- inversa exacta salvo en un caso: las etapas que YA tenían el flag a true
-- antes del backfill y además coinciden por nombre (p. ej. "Ganado" con
-- is_won=true puesto a mano) también se ponen a false, porque la migración no
-- guardó qué filas tocó (14 filas en 5 organizaciones, según §13.1).
--
-- SOBRE LOS DATOS: es un backfill: este rollback NO restaura el estado exacto anterior (ver
-- arriba). Tras revertir, fn_sync_status_from_stage deja de cerrar oportunidades
-- en esas etapas hasta que se vuelvan a marcar a mano.
-- ============================================================

begin;
update stages s set is_won = false
 where coalesce(s.is_won, false) = true
   and btrim(lower(translate(s.name, 'áéíóúÁÉÍÓÚàèìòùäëïöüÄËÏÖÜñÑ','aeiouAEIOUaeiouaeiouAEIOUnN')))
       ~ '^(ganad[oa]|won|cerrad[oa] ?ganad[oa]|closed[ _-]?won|venta ganada)$';
update stages s set is_lost = false
 where coalesce(s.is_lost, false) = true
   and btrim(lower(translate(s.name, 'áéíóúÁÉÍÓÚàèìòùäëïöüÄËÏÖÜñÑ','aeiouAEIOUaeiouaeiouAEIOUnN')))
       ~ '^(perdid[oa]|lost|cerrad[oa] ?perdid[oa]|closed[ _-]?lost|cancelad[oa]|anulad[oa]|descartad[oa])$';
comment on column public.stages.is_won is null;
comment on column public.stages.is_lost is null;
commit;
