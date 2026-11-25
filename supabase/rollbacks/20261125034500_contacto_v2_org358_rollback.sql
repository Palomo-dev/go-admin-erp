-- Reversión de 20261125034500_contacto_v2_org358.sql (Contacto v2 en la org 358).
--
-- Las revisiones son inmutables (trigger `fn_website_site_revisions_inmutable`): la revisión que
-- creó la migración se queda en el historial. Revertir = publicar una revisión NUEVA con la página
-- Contacto de antes (las 3 secciones sembradas, con sus ids y textos exactos), igual que hace
-- «Restaurar» en el ERP, y devolver el borrador a esas mismas secciones.
--
-- Cuidado con lo que el dueño haya hecho después:
--   - La revisión nueva parte del documento PUBLICADO vigente (no del borrador), para no publicar
--     cambios del borrador que el dueño aún no haya publicado. Solo cambia la página Contacto.
--   - Solo se revierte donde la página Contacto sigue con las 5 secciones v2 de la migración, sin
--     editar. Si el dueño ya la cambió (en el borrador o en lo publicado), esa parte no se toca y
--     se avisa con NOTICE.

do $$
declare
  c_org       constant integer := 358;
  c_sitio     constant uuid    := 'c2695ca5-2d13-42fc-bf54-c3d7604fdb87';
  c_pagina_id constant text    := '0d7b7a11-15a7-46b6-8f3a-77056af97657';
  c_nota      constant text    := 'Reversión de Contacto v2 (migración 2026-11-24)';

  c_viejas constant jsonb := $j$[
    {"id":"ab75f004-06ba-4ecb-ab37-5514bb13ebec","tipo":"hero","diseno":{},"version":1,"variante":"minimal","contenido":{"title":"Contacto","subtitle":"Estamos aquí para ayudarte","section_background":{"padding_top":0}},"visibilidad":{"movil":true,"escritorio":true}},
    {"id":"5812b4a4-afad-4138-8ad4-4cdbc141609b","tipo":"contact_form","diseno":{},"version":1,"variante":"split","contenido":{"title":"Escríbenos","subtitle":"Te respondemos lo antes posible."},"visibilidad":{"movil":true,"escritorio":true}},
    {"id":"f89ecaa1-f393-492f-8f7f-5649a6dd6af7","tipo":"map","diseno":{},"version":1,"variante":"full_width","contenido":{"title":"Encuéntranos","subtitle":"Visítanos en nuestra sede"},"visibilidad":{"movil":true,"escritorio":true}}
  ]$j$;

  c_nuevas constant jsonb := $j$[
    {"id":"33334f1a-2112-46f6-9ce5-27ed6f8b5649","tipo":"hero","variante":"page_header","version":1,"contenido":{"title":"Hablemos","subtitle":"Escríbenos por el canal que prefieras. Te respondemos lo antes posible.","show_breadcrumb":true},"diseno":{},"visibilidad":{"movil":true,"escritorio":true}},
    {"id":"86553216-4537-4594-ac1a-ae6e7d191e51","tipo":"contact_channels","variante":"cards","version":1,"contenido":{"title":"Elige cómo hablar con nosotros","subtitle":"Todos los canales llegan al mismo equipo."},"diseno":{},"visibilidad":{"movil":true,"escritorio":true}},
    {"id":"b816b797-d803-4373-aa63-361dba7bed95","tipo":"contact_form","variante":"card_hours","version":1,"contenido":{"title":"Envíanos un mensaje","subtitle":"Déjanos tus datos y te respondemos al correo o por WhatsApp.","anchor_id":"formulario"},"diseno":{},"visibilidad":{"movil":true,"escritorio":true}},
    {"id":"28714bdb-e55c-4b46-b9ca-57474a1b0d0b","tipo":"hours_location","variante":"hours_map","version":1,"contenido":{"eyebrow":"","title":"Nuestras sedes","show_whatsapp":true,"show_reserve":false,"show_order":false},"diseno":{},"visibilidad":{"movil":true,"escritorio":true}},
    {"id":"a81b192d-c45a-40ba-82d9-8e374a1b9f76","tipo":"social_networks","variante":"row","version":1,"contenido":{"title":"Síguenos en redes","subtitle":""},"diseno":{},"visibilidad":{"movil":true,"escritorio":true}}
  ]$j$;

  v_state   public.website_site_states%rowtype;
  v_draft   public.website_site_drafts%rowtype;
  v_pub     public.website_site_revisions%rowtype;
  v_idx     integer;
  v_idx_pub integer;
  v_version integer;
  v_numero  integer;
  v_revision uuid;
begin
  select * into v_state from public.website_site_states
   where id = c_sitio and organization_id = c_org for update;
  if not found then
    raise exception 'reversion_contacto_v2: sitio no encontrado';
  end if;
  select * into v_draft from public.website_site_drafts where site_state_id = c_sitio for update;
  select * into v_pub from public.website_site_revisions where id = v_state.published_revision_id;

  v_version := v_draft.version;

  -- Borrador.
  select (ord - 1)::integer into v_idx
    from jsonb_array_elements(v_draft.document->'paginas') with ordinality as x(p, ord)
   where p->>'id' = c_pagina_id;
  if v_idx is not null and v_draft.document->'paginas'->v_idx->'secciones' = c_nuevas then
    update public.website_site_drafts
       set document = jsonb_set(document, array['paginas', v_idx::text, 'secciones'], c_viejas, false),
           version = v_draft.version + 1
     where site_state_id = c_sitio and version = v_draft.version;
    v_version := v_draft.version + 1;
  else
    raise notice 'reversion_contacto_v2: la página Contacto del borrador ya no es la de la migración; no se toca';
  end if;

  -- Publicado: revisión nueva a partir de lo publicado vigente.
  select (ord - 1)::integer into v_idx_pub
    from jsonb_array_elements(v_pub.document->'paginas') with ordinality as x(p, ord)
   where p->>'id' = c_pagina_id;
  if v_idx_pub is not null and v_pub.document->'paginas'->v_idx_pub->'secciones' = c_nuevas then
    select coalesce(max(r.revision_number), 0) + 1 into v_numero
      from public.website_site_revisions r where r.site_state_id = c_sitio;
    insert into public.website_site_revisions (
      site_state_id, organization_id, revision_number, schema_version, document,
      source_draft_version, note, published_by)
    values (
      c_sitio, c_org, v_numero, v_pub.schema_version,
      jsonb_set(v_pub.document, array['paginas', v_idx_pub::text, 'secciones'], c_viejas, false),
      v_version, c_nota, null)
    returning id into v_revision;

    update public.website_site_states set published_revision_id = v_revision where id = c_sitio;
    update public.website_site_drafts set base_revision_id = v_revision where site_state_id = c_sitio;
    insert into public.website_publication_outbox (organization_id, site_state_id, revision_id)
    values (c_org, c_sitio, v_revision);
    raise notice 'reversion_contacto_v2: publicada la revisión % (número %)', v_revision, v_numero;
  else
    raise notice 'reversion_contacto_v2: la página Contacto publicada ya no es la de la migración; no se publica nada';
  end if;
end
$$;
