-- Reversión de 20261125050000_contacto_v2_tiendas_intactas.sql (Contacto v2 en 39 tiendas).
--
-- Lee `website_contacto_v2_respaldo` (filas con resultado = 'aplicada') y devuelve cada página
-- Contacto a sus 3 secciones sembradas exactas, SOLO si sigue tal como la dejó la migración. Si el
-- dueño ya la editó después, esa organización no se toca y se avisa con NOTICE.
--
--   - Legacy: borra las 5 filas nuevas de `website_page_sections` y vuelve a insertar las 3 viejas
--     con sus ids, contenidos, orden y fechas originales.
--   - V2: las revisiones son inmutables; se publica una revisión NUEVA a partir de lo publicado
--     vigente con la página Contacto de antes (nota «Reversión de Contacto v2 (migración
--     2026-11-24)»), se devuelve el borrador (version+1) si su página Contacto sigue igual, y se
--     encola la invalidación de caché de la tienda. La revisión de la migración queda en el
--     historial.
--
-- Al final borra la tabla de respaldo solo si TODAS las organizaciones se revirtieron y no quedan
-- filas de otras migraciones; si no, la tabla se conserva.
--
-- Desde 20261125230000 la tabla tiene la columna `migracion`: esta reversión solo lee sus filas
-- ('20261125050000'). Si se revierten las dos, primero la de 20261125230000.

do $$
declare
  c_nota constant text := 'Reversión de Contacto v2 (migración 2026-11-24)';
  b          public.website_contacto_v2_respaldo%rowtype;
  v_state    public.website_site_states%rowtype;
  v_draft    public.website_site_drafts%rowtype;
  v_pub      public.website_site_revisions%rowtype;
  v_actual   jsonb;
  v_idx      integer;
  v_idx_d    integer;
  v_version  integer;
  v_numero   integer;
  v_revision uuid;
  v_saltadas integer := 0;
begin
  if to_regclass('public.website_contacto_v2_respaldo') is null then
    raise notice 'reversion_contacto_v2: no hay tabla de respaldo; nada que revertir';
    return;
  end if;

  for b in execute format(
    'select * from public.website_contacto_v2_respaldo where resultado = %L %s order by id desc', 'aplicada',
    case when exists (select 1 from information_schema.columns
                       where table_schema = 'public' and table_name = 'website_contacto_v2_respaldo' and column_name = 'migracion')
         then 'and migracion = ''20261125050000''' else '' end) loop
    if b.modelo = 'legacy' then
      perform 1 from public.website_pages where id = b.page_id::uuid for update;
      select coalesce(jsonb_agg(to_jsonb(s) order by s.sort_order, s.created_at, s.id), '[]') into v_actual
        from public.website_page_sections s where s.page_id = b.page_id::uuid;
      if v_actual is distinct from b.secciones_nuevas then
        raise notice 'org %: la página Contacto cambió después de la migración; no se revierte', b.organization_id;
        v_saltadas := v_saltadas + 1;
        continue;
      end if;
      delete from public.website_page_sections where page_id = b.page_id::uuid;
      insert into public.website_page_sections
      select * from jsonb_populate_recordset(null::public.website_page_sections, b.secciones_viejas);
      raise notice 'org %: legacy revertida', b.organization_id;

    else
      select * into v_state from public.website_site_states where id = b.site_state_id for update;
      select * into v_draft from public.website_site_drafts where site_state_id = b.site_state_id for update;
      select * into v_pub from public.website_site_revisions where id = v_state.published_revision_id;
      v_idx := null; v_idx_d := null; v_version := v_draft.version;

      select (o - 1)::integer into v_idx
        from jsonb_array_elements(v_pub.document->'paginas') with ordinality as t(p, o)
       where p->>'id' = b.page_id;
      select (o - 1)::integer into v_idx_d
        from jsonb_array_elements(v_draft.document->'paginas') with ordinality as t(p, o)
       where p->>'id' = b.page_id;

      if v_idx is null or v_pub.document->'paginas'->v_idx->'secciones' is distinct from b.secciones_nuevas then
        raise notice 'org %: la página Contacto publicada cambió después de la migración; no se revierte', b.organization_id;
        v_saltadas := v_saltadas + 1;
        continue;
      end if;

      if v_idx_d is not null and v_draft.document->'paginas'->v_idx_d->'secciones' = b.secciones_nuevas then
        update public.website_site_drafts
           set document = jsonb_set(document, array['paginas', v_idx_d::text, 'secciones'], b.secciones_viejas, false),
               version = v_draft.version + 1
         where site_state_id = b.site_state_id and version = v_draft.version;
        v_version := v_draft.version + 1;
      else
        raise notice 'org %: el borrador tiene otra página Contacto; solo se revierte lo publicado', b.organization_id;
      end if;

      select coalesce(max(r.revision_number), 0) + 1 into v_numero
        from public.website_site_revisions r where r.site_state_id = b.site_state_id;
      insert into public.website_site_revisions (
        site_state_id, organization_id, revision_number, schema_version, document,
        source_draft_version, note, published_by)
      values (
        b.site_state_id, b.organization_id, v_numero, v_pub.schema_version,
        jsonb_set(v_pub.document, array['paginas', v_idx::text, 'secciones'], b.secciones_viejas, false),
        v_version, c_nota, null)
      returning id into v_revision;

      update public.website_site_states set published_revision_id = v_revision where id = b.site_state_id;
      update public.website_site_drafts set base_revision_id = v_revision where site_state_id = b.site_state_id;
      insert into public.website_publication_outbox (organization_id, site_state_id, revision_id)
      values (b.organization_id, b.site_state_id, v_revision);
      raise notice 'org %: V2 revertida (revisión %)', b.organization_id, v_numero;
    end if;
  end loop;

  if v_saltadas = 0
     and not exists (select 1 from public.website_contacto_v2_respaldo where coalesce(to_jsonb(website_contacto_v2_respaldo)->>'migracion', '20261125050000') <> '20261125050000') then
    drop table public.website_contacto_v2_respaldo;
  else
    raise notice 'reversion_contacto_v2: % organizaciones no se revirtieron; se conserva el respaldo', v_saltadas;
  end if;
end
$$;
