-- Rollback de 20260930190004_hora_servidor_revision.sql
-- Solo quita la función de lectura; no hay datos que revertir.

drop function if exists public.pos_hora_en_revision(integer, timestamptz, timestamptz);
