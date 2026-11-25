-- Contacto v2 en las páginas Contacto intactas de 39 tiendas (16 con sitio V2 + 23 legacy).
--
-- Aprobado por el dueño (2026-11-24/25): pasar a «Contacto v2» solo las páginas Contacto que siguen
-- con las tres secciones y los textos con que se sembraron; las que algún dueño cambió se quedan
-- como están. La org 358 ya se hizo en 20261125034500_contacto_v2_org358.sql.
--
-- Cada organización se vuelve a comprobar AQUÍ, en el momento de aplicar (pudo cambiar desde la
-- revisión). La que no cumple se salta y queda anotada en el respaldo con el motivo.
--
-- «Intacta» = exactamente 3 secciones, en este orden y sin ningún otro dato:
--   1. hero · minimal con uno de los títulos del sembrado (también los del sembrado viejo que puso
--      el título de otra página: «Productos», «Nuestra Carta», «Nuestras Habitaciones»,
--      «Nuestros Servicios», «Nuestras Clases») con su subtítulo; como único extra admite
--      `section_background: {padding_top: 0}`, que también venía del sembrado.
--   2. contact_form · split con «Escríbenos» o «Contáctanos» y su subtítulo.
--   3. map · full_width | embedded | default con «Encuéntranos» / «Visítanos en nuestra sede».
--   - Legacy (`website_pages` / `website_page_sections`): página global (branch_id null) publicada,
--     sin borrador pendiente (`draft_content` null, `has_unpublished_changes` no true), secciones
--     visibles, `settings` vacío y nunca editadas (updated_at = created_at).
--   - V2 (documento publicado): `diseno` vacío, visible en móvil y escritorio, `version` 1, y la
--     página Contacto del borrador igual a la publicada.
--
-- Qué cambia:
--   - Las 5 secciones de `seccionesContactoPorDefecto()` (src/lib/website/contrato/paginaContacto.ts,
--     versión vigente tras a1779998e; sin FAQ): hero·page_header, contact_channels·cards,
--     contact_form·card_hours, hours_location·hours_map, social_networks·row.
--   - Legacy: se borran las 3 filas y se insertan las 5 (sort_order 0..4). La tienda las ve al
--     vencer su caché de páginas (CONTENT_TTL, 60 s).
--   - V2 (como la org 358, equivalente de guardar + `publish_site_revision`, que exige auth.uid()):
--     revisión NUEVA = documento publicado vigente con solo la página Contacto reemplazada, nota
--     «Contacto v2 (migración 2026-11-24)»; borrador con la misma página reemplazada y version+1;
--     el sitio apunta a la revisión nueva; fila en `website_publication_outbox` para invalidar la
--     caché de la tienda. Las revisiones anteriores no se tocan (son historial). Partir de lo
--     publicado (no del borrador) evita publicar cambios del borrador que el dueño no publicó.
--
-- Respaldo para la reversión: tabla nueva `website_contacto_v2_respaldo` (aditiva, solo
-- service_role) con las secciones viejas exactas (filas completas en legacy) y las nuevas.
-- Reversión: supabase/rollbacks/20261125050000_contacto_v2_tiendas_intactas_rollback.sql
-- Idempotente: una organización ya aplicada no se vuelve a tocar.

create table if not exists public.website_contacto_v2_respaldo (
  id                 bigserial primary key,
  organization_id    integer not null references public.organizations(id) on delete cascade,
  modelo             text not null check (modelo in ('legacy', 'v2')),
  resultado          text not null check (resultado in ('aplicada', 'saltada')),
  motivo             text,
  page_id            text,
  site_state_id      uuid,
  revision_previa_id uuid,
  revision_id        uuid,
  secciones_viejas   jsonb,
  secciones_nuevas   jsonb,
  creado_at          timestamptz not null default now()
);

comment on table public.website_contacto_v2_respaldo is
  'Respaldo de la migración Contacto v2 (2026-11-25): secciones viejas y nuevas de la página Contacto por organización, y las saltadas con su motivo. Lo usa el rollback 20261125050000.';

alter table public.website_contacto_v2_respaldo enable row level security;
revoke all on table public.website_contacto_v2_respaldo from anon, authenticated, public;
revoke all on sequence public.website_contacto_v2_respaldo_id_seq from anon, authenticated, public;

do $$
declare
  c_nota constant text := 'Contacto v2 (migración 2026-11-24)';

  c_v2     constant integer[] := array[333,335,337,338,339,340,341,342,345,346,347,348,349,388,389,391];
  c_legacy constant integer[] := array[1,120,137,138,139,140,144,198,368,369,370,371,372,373,375,376,377,378,382,383,387,392,393];

  -- Contenidos del sembrado (sin ids).
  c_heroes constant jsonb := $j$[
    {"title":"Contacto","subtitle":"Estamos aquí para ayudarte"},
    {"title":"Productos","subtitle":"Explora nuestro catálogo completo"},
    {"title":"Nuestros Servicios","subtitle":"Conoce lo que podemos hacer por ti"},
    {"title":"Nuestras Habitaciones","subtitle":"Confort y elegancia en cada detalle"},
    {"title":"Nuestra Carta","subtitle":"Explora todos nuestros platos"},
    {"title":"Nuestras Clases","subtitle":"Entrena con los mejores"}
  ]$j$;
  c_forms constant jsonb := $j$[
    {"title":"Escríbenos","subtitle":"Te respondemos lo antes posible."},
    {"title":"Contáctanos","subtitle":"Estamos aquí para ayudarte. Envíanos un mensaje y te responderemos lo antes posible."}
  ]$j$;
  c_mapa constant jsonb := '{"title":"Encuéntranos","subtitle":"Visítanos en nuestra sede"}';
  c_fondo constant jsonb := '{"padding_top":0}';

  -- seccionesContactoPorDefecto() (tipo, variante, contenido), en orden.
  c_plantilla constant jsonb := $j$[
    {"tipo":"hero","variante":"page_header","contenido":{"title":"Hablemos","subtitle":"Escríbenos por el canal que prefieras. Te respondemos lo antes posible.","show_breadcrumb":true}},
    {"tipo":"contact_channels","variante":"cards","contenido":{"title":"Elige cómo hablar con nosotros","subtitle":"Todos los canales llegan al mismo equipo."}},
    {"tipo":"contact_form","variante":"card_hours","contenido":{"title":"Envíanos un mensaje","subtitle":"Déjanos tus datos y te respondemos al correo o por WhatsApp.","anchor_id":"formulario"}},
    {"tipo":"hours_location","variante":"hours_map","contenido":{"eyebrow":"","title":"Nuestras sedes","show_whatsapp":true,"show_reserve":false,"show_order":false}},
    {"tipo":"social_networks","variante":"row","contenido":{"title":"Síguenos en redes","subtitle":""}}
  ]$j$;

  v_org      integer;
  v_modelo   text;
  v_esperado text;
  v_state    public.website_site_states%rowtype;
  v_draft    public.website_site_drafts%rowtype;
  v_pub      public.website_site_revisions%rowtype;
  v_page     public.website_pages%rowtype;
  v_secs     jsonb;
  v_norm     jsonb;
  v_nuevas   jsonb;
  v_idx      integer;
  v_idx_d    integer;
  v_numero   integer;
  v_revision uuid;
  v_motivo   text;
  v_n        integer;
begin
  foreach v_org in array c_v2 || c_legacy loop
    v_esperado := case when v_org = any (c_v2) then 'v2' else 'legacy' end;
    v_motivo := null;
    v_state := null; v_draft := null; v_pub := null; v_page := null;
    v_secs := null; v_norm := null; v_nuevas := null; v_idx := null; v_idx_d := null;

    if exists (select 1 from public.website_contacto_v2_respaldo
                where organization_id = v_org and resultado = 'aplicada') then
      raise notice 'org %: ya aplicada, sin cambios', v_org;
      continue;
    end if;

    select * into v_state from public.website_site_states
     where organization_id = v_org and branch_id is null for update;
    v_modelo := case when found and v_state.v2_adopted then 'v2' else 'legacy' end;

    if v_modelo <> v_esperado then
      v_motivo := format('cambió de modelo: se esperaba %s y ahora es %s', v_esperado, v_modelo);
    end if;

    -- ── V2 ──────────────────────────────────────────────────────────────────────────────────
    if v_motivo is null and v_modelo = 'v2' then
      select * into v_draft from public.website_site_drafts where site_state_id = v_state.id for update;
      select * into v_pub from public.website_site_revisions where id = v_state.published_revision_id;
      if v_draft.site_state_id is null or v_pub.id is null then
        v_motivo := 'sin borrador o sin revisión publicada';
      end if;

      if v_motivo is null then
        select (o - 1)::integer into v_idx
          from jsonb_array_elements(v_pub.document->'paginas') with ordinality as t(p, o)
         where p->>'slug' = 'contacto';
        select (o - 1)::integer into v_idx_d
          from jsonb_array_elements(v_draft.document->'paginas') with ordinality as t(p, o)
         where p->>'slug' = 'contacto';
        if v_idx is null then
          v_motivo := 'la página Contacto no está en lo publicado';
        elsif v_idx_d is null
              or v_draft.document->'paginas'->v_idx_d is distinct from v_pub.document->'paginas'->v_idx then
          v_motivo := 'la página Contacto del borrador no es igual a la publicada (edición sin publicar)';
        end if;
      end if;

      if v_motivo is null then
        v_secs := v_pub.document->'paginas'->v_idx->'secciones';
        if exists (select 1 from jsonb_array_elements(v_secs) s
                    where s->'diseno' is distinct from '{}'::jsonb
                       or s->'visibilidad' is distinct from '{"movil":true,"escritorio":true}'::jsonb
                       or s->>'version' is distinct from '1'
                       or s ? 'fuente') then
          v_motivo := 'alguna sección tiene diseño, visibilidad o datos propios';
        end if;
        select coalesce(jsonb_agg(jsonb_build_object('tipo', s->>'tipo', 'variante', s->>'variante', 'contenido', s->'contenido') order by o), '[]')
          into v_norm from jsonb_array_elements(v_secs) with ordinality as t(s, o);
      end if;

    -- ── Legacy ──────────────────────────────────────────────────────────────────────────────
    elsif v_motivo is null then
      select * into v_page from public.website_pages
       where organization_id = v_org and slug = 'contacto' and branch_id is null for update;
      if not found then
        v_motivo := 'sin página Contacto';
      elsif v_page.is_published is not true then
        v_motivo := 'la página Contacto no está publicada';
      elsif v_page.draft_content is not null or v_page.has_unpublished_changes is true then
        v_motivo := 'la página Contacto tiene cambios sin publicar';
      end if;

      if v_motivo is null then
        perform 1 from public.website_page_sections where page_id = v_page.id for update;
        select coalesce(jsonb_agg(to_jsonb(s) order by s.sort_order, s.created_at, s.id), '[]') into v_secs
          from public.website_page_sections s where s.page_id = v_page.id;
        if exists (select 1 from public.website_page_sections s
                    where s.page_id = v_page.id
                      and (s.is_visible is not true
                           or coalesce(s.settings, '{}'::jsonb) <> '{}'::jsonb
                           or s.updated_at <> s.created_at
                           or s.branch_id is not null)) then
          v_motivo := 'alguna sección está oculta, tiene ajustes propios o fue editada';
        end if;
        select coalesce(jsonb_agg(jsonb_build_object('tipo', s->>'section_type', 'variante', s->>'section_variant', 'contenido', s->'content') order by o), '[]')
          into v_norm from jsonb_array_elements(v_secs) with ordinality as t(s, o);
      end if;
    end if;

    -- ── Firma del sembrado (común) ──────────────────────────────────────────────────────────
    if v_motivo is null then
      if jsonb_array_length(v_norm) <> 3 then
        v_motivo := format('tiene %s secciones, no las 3 del sembrado', jsonb_array_length(v_norm));
      elsif not (
            v_norm->0->>'tipo' = 'hero' and v_norm->0->>'variante' = 'minimal'
        and exists (select 1 from jsonb_array_elements(c_heroes) h
                     where h = (v_norm->0->'contenido') - 'section_background')
        and coalesce(v_norm->0->'contenido'->'section_background', c_fondo) = c_fondo
        and v_norm->1->>'tipo' = 'contact_form' and v_norm->1->>'variante' = 'split'
        and exists (select 1 from jsonb_array_elements(c_forms) f where f = v_norm->1->'contenido')
        and v_norm->2->>'tipo' = 'map' and v_norm->2->>'variante' in ('full_width', 'embedded', 'default')
        and v_norm->2->'contenido' = c_mapa) then
        v_motivo := 'las secciones o sus textos ya no son los del sembrado';
      end if;
    end if;

    if v_motivo is not null then
      insert into public.website_contacto_v2_respaldo (organization_id, modelo, resultado, motivo, page_id, site_state_id)
      values (v_org, v_modelo, 'saltada', v_motivo,
              case when v_modelo = 'legacy' then v_page.id::text end,
              case when v_modelo = 'v2' then v_state.id end);
      raise notice 'org %: saltada (%)', v_org, v_motivo;
      continue;
    end if;

    -- ── Aplicar ─────────────────────────────────────────────────────────────────────────────
    if v_modelo = 'v2' then
      select jsonb_agg(jsonb_build_object(
               'id', gen_random_uuid()::text, 'tipo', s->>'tipo', 'variante', s->>'variante', 'version', 1,
               'contenido', s->'contenido', 'diseno', '{}'::jsonb,
               'visibilidad', '{"movil":true,"escritorio":true}'::jsonb) order by o)
        into v_nuevas from jsonb_array_elements(c_plantilla) with ordinality as t(s, o);

      update public.website_site_drafts
         set document = jsonb_set(document, array['paginas', v_idx_d::text, 'secciones'], v_nuevas, false),
             version  = v_draft.version + 1
       where site_state_id = v_state.id and version = v_draft.version;
      get diagnostics v_n = row_count;
      if v_n <> 1 then
        raise exception 'org %: conflicto al guardar el borrador', v_org;
      end if;

      select coalesce(max(r.revision_number), 0) + 1 into v_numero
        from public.website_site_revisions r where r.site_state_id = v_state.id;
      insert into public.website_site_revisions (
        site_state_id, organization_id, revision_number, schema_version, document,
        source_draft_version, note, published_by)
      values (
        v_state.id, v_org, v_numero, v_pub.schema_version,
        jsonb_set(v_pub.document, array['paginas', v_idx::text, 'secciones'], v_nuevas, false),
        v_draft.version + 1, c_nota, null)
      returning id into v_revision;

      update public.website_site_states set published_revision_id = v_revision where id = v_state.id;
      update public.website_site_drafts set base_revision_id = v_revision where site_state_id = v_state.id;
      insert into public.website_publication_outbox (organization_id, site_state_id, revision_id)
      values (v_org, v_state.id, v_revision);

      insert into public.website_contacto_v2_respaldo (
        organization_id, modelo, resultado, page_id, site_state_id, revision_previa_id, revision_id,
        secciones_viejas, secciones_nuevas)
      values (v_org, 'v2', 'aplicada', v_pub.document->'paginas'->v_idx->>'id', v_state.id, v_pub.id, v_revision,
              v_secs, v_nuevas);
    else
      delete from public.website_page_sections where page_id = v_page.id;

      with nuevas as (
        insert into public.website_page_sections (
          id, page_id, organization_id, section_type, section_variant, content, settings, sort_order, is_visible)
        select gen_random_uuid(), v_page.id, v_org, s->>'tipo', s->>'variante', s->'contenido', '{}'::jsonb, (o - 1)::integer, true
          from jsonb_array_elements(c_plantilla) with ordinality as t(s, o)
        returning *)
      select jsonb_agg(to_jsonb(n) order by n.sort_order) into v_nuevas from nuevas n;

      insert into public.website_contacto_v2_respaldo (
        organization_id, modelo, resultado, page_id, secciones_viejas, secciones_nuevas)
      values (v_org, 'legacy', 'aplicada', v_page.id::text, v_secs, v_nuevas);
    end if;

    raise notice 'org %: Contacto v2 aplicado (%)', v_org, v_modelo;
  end loop;
end
$$;
