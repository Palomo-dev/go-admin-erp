-- Reversión de 20260921150100_pos_terminals_code_unico_ci.sql: retira el
-- índice único insensible a mayúsculas y la CHECK de forma canónica. La
-- UNIQUE original (organization_id, branch_id, code) se conserva. No hay
-- datos que revertir.

alter table public.pos_terminals drop constraint if exists pos_terminals_code_mayusculas;
drop index if exists public.pos_terminals_code_unico_ci;
