-- Reparo QA 25-oct: fn_revision_sitio_exigir_etiquetas solo revisaba ítems de primer nivel;
-- un sub-ítem (`hijos`) sin etiqueta se escapaba. Ahora recorre recursivamente items + hijos
-- a cualquier profundidad. Alineado con el contrato zod (etiqueta: z.string().max(..).min(1)):
-- inválida solo si no es string o es la cadena vacía real; las de solo espacios SÍ son válidas.
-- NO aplicar sin OK de Juan.
-- Rollback: supabase/rollbacks/20261025123000_trigger_etiquetas_recursivo_rollback.sql

create or replace function public.fn_revision_sitio_exigir_etiquetas()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  n int;
begin
  with recursive arbol(it) as (
    select it
    from jsonb_array_elements(case when jsonb_typeof(new.document->'menus') = 'array' then new.document->'menus' else '[]'::jsonb end) m,
         jsonb_array_elements(case when jsonb_typeof(m->'items') = 'array' then m->'items' else '[]'::jsonb end) it
    union all
    select h
    from arbol a,
         jsonb_array_elements(case when jsonb_typeof(a.it->'hijos') = 'array' then a.it->'hijos' else '[]'::jsonb end) h
  )
  select count(*) into n
  from arbol
  where jsonb_typeof(it->'etiqueta') is distinct from 'string'
     or length(it->>'etiqueta') = 0;
  if n > 0 then
    raise exception 'documento_invalido: % ítem(s) de menú sin etiqueta', n
      using errcode = '22023', hint = 'Corrige el borrador (Menús) y vuelve a publicar.';
  end if;
  return new;
end;
$$;

revoke all on function public.fn_revision_sitio_exigir_etiquetas() from public;
