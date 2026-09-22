-- POS de doble pantalla — Fase 2, parte A (ronda 3, QA bajo #3)
-- La unicidad del código de terminal pasa a ser INSENSIBLE a mayúsculas en la
-- base. Hasta ahora la CHECK pos_terminals_code_formato admitía [A-Za-z0-9_-]
-- y la UNIQUE (organization_id, branch_id, code) distinguía mayúsculas: la
-- normalización a MAYÚSCULAS vivía solo en el servicio y la ruta
-- (normalizeTerminalCode), y cualquier escritura que no pasara por ellos
-- (PostgREST directo con sesión, un cliente offline futuro) podía crear
-- «qa-x» junto a «QA-X» (verificado por el tester con DO/RAISE).
--
--   1. Índice único sobre (organization_id, branch_id, upper(code)): dos
--      códigos iguales salvo mayúsculas chocan con 23505, el mismo código que
--      ya mapea isDuplicateCodeError. Se conserva pos_terminals_code_unico.
--   2. CHECK code = upper(code): la forma canónica también se exige en la
--      base (23514 si alguien escribe minúsculas sin normalizar). Se crea
--      NOT VALID y se valida después, patrón aditivo aunque hoy la tabla
--      tenga 0 filas.
--
-- Aditiva e idempotente.

create unique index if not exists pos_terminals_code_unico_ci
  on public.pos_terminals (organization_id, branch_id, upper(code));

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'pos_terminals_code_mayusculas'
       and conrelid = 'public.pos_terminals'::regclass
  ) then
    alter table public.pos_terminals
      add constraint pos_terminals_code_mayusculas check (code = upper(code)) not valid;
  end if;
end $$;

alter table public.pos_terminals validate constraint pos_terminals_code_mayusculas;
