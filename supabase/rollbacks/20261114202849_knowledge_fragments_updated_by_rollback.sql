-- Revierte 20261114202849_knowledge_fragments_updated_by.sql.
-- Borra la columna: se pierde quién editó cada fragmento (no hay copia).

drop trigger if exists trg_knowledge_fragments_updated_by on public.knowledge_fragments;
drop function if exists public.fn_knowledge_fragments_updated_by();
alter table public.knowledge_fragments drop constraint if exists knowledge_fragments_updated_by_fkey;
alter table public.knowledge_fragments drop column if exists updated_by;
