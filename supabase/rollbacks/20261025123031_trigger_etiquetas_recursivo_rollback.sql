-- Rollback de 20261025123000_trigger_etiquetas_recursivo: vuelve a la versión de 20261025122448
-- (solo primer nivel, btrim). El trigger trg_revision_sitio_exigir_etiquetas no cambia.

create or replace function public.fn_revision_sitio_exigir_etiquetas()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  n int;
begin
  select count(*) into n
  from jsonb_array_elements(case when jsonb_typeof(new.document->'menus') = 'array' then new.document->'menus' else '[]'::jsonb end) m,
       jsonb_array_elements(case when jsonb_typeof(m->'items') = 'array' then m->'items' else '[]'::jsonb end) it
  where jsonb_typeof(it->'etiqueta') is distinct from 'string'
     or btrim(it->>'etiqueta') = '';
  if n > 0 then
    raise exception 'documento_invalido: % ítem(s) de menú sin etiqueta', n
      using errcode = '22023', hint = 'Corrige el borrador (Menús) y vuelve a publicar.';
  end if;
  return new;
end;
$$;

revoke all on function public.fn_revision_sitio_exigir_etiquetas() from public;
