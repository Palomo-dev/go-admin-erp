-- URGENTE 25-oct (org 341): publish_site_revision solo revisa schemaVersion y aceptó una
-- revisión con 5 ítems de menú con etiqueta null (el sitio cayó a legacy). El ERP ya valida
-- con validarDocumentoSitio antes de publicar/programar; esta guarda cubre cualquier otra vía
-- (cron de programadas, SQL manual). Solo afecta inserts nuevos; no toca filas existentes.
-- Rollback: supabase/rollbacks/20261025122448_revisiones_sitio_sin_etiquetas_nulas_rollback.sql

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

drop trigger if exists trg_revision_sitio_exigir_etiquetas on public.website_site_revisions;
create trigger trg_revision_sitio_exigir_etiquetas
  before insert on public.website_site_revisions
  for each row execute function public.fn_revision_sitio_exigir_etiquetas();
