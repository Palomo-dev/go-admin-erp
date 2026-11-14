-- Quién editó cada fragmento de conocimiento («v4 · editado por Laura R.»,
-- Figma 94-chat-recuperado-ia-04). Aditiva: columna NULL-able, sin tocar datos.
--
-- `updated_by` es el usuario de la sesión (auth.users.id), no un valor del
-- cliente: lo pone un trigger con `auth.uid()` en cada edición de lo que
-- define el fragmento (título, contenido, etiquetas, prioridad, fuente,
-- activo). Los cambios que no son edición (uso, votos, contador de la fuente)
-- conservan el anterior, y al crear queda NULL (para eso está `created_by`).
-- Si edita el rol de servicio (sin sesión), queda NULL: la pantalla muestra
-- solo la fecha. Las ediciones anteriores a esta migración quedan sin nombre.
--
-- FK a auth.users y no a organization_members (como `created_by`, bigint):
-- auth.uid() da el usuario y así no hace falta resolver la membresía.

alter table public.knowledge_fragments
  add column if not exists updated_by uuid null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'knowledge_fragments_updated_by_fkey') then
    alter table public.knowledge_fragments
      add constraint knowledge_fragments_updated_by_fkey
      foreign key (updated_by) references auth.users (id) on delete set null;
  end if;
end $$;

comment on column public.knowledge_fragments.updated_by is
  'Usuario (auth.users.id) que hizo la última edición del fragmento. Lo pone el trigger trg_knowledge_fragments_updated_by con auth.uid(); NULL si fue el rol de servicio o la edición es anterior al 2026-11-14.';

create or replace function public.fn_knowledge_fragments_updated_by()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.updated_by := null;
  elsif (new.title, new.content, new.tags, new.priority, new.source_id, new.is_active)
        is distinct from (old.title, old.content, old.tags, old.priority, old.source_id, old.is_active) then
    new.updated_by := (select auth.uid());
  else
    new.updated_by := old.updated_by;
  end if;
  return new;
end;
$$;

revoke all on function public.fn_knowledge_fragments_updated_by() from public, anon;

drop trigger if exists trg_knowledge_fragments_updated_by on public.knowledge_fragments;
create trigger trg_knowledge_fragments_updated_by
  before insert or update on public.knowledge_fragments
  for each row execute function public.fn_knowledge_fragments_updated_by();
