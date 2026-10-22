-- Backfill de datos, no de esquema. Idempotente: no toca un documento que ya
-- tenga `conversion`, ni borra las columnas countdown_* / checkout_*.
-- Orgs con contador legacy y sitio V2 adoptado. Las que aún no tienen
-- documento V2 no entran; el importador las cubre cuando adopten.
--
-- OJO: el contrato en producción es estricto. Publicar esta revisión antes
-- de desplegar el código que acepta `conversion` hace que el lector V2
-- rechace el documento y sirva el sitio legacy. Aplicar junto con ese despliegue.

with origen as (
  select s.id as site_state_id, s.organization_id, r.schema_version, r.source_draft_version, r.document,
    case when ws.countdown_mode = 'custom' then jsonb_build_object('tipo','fecha','fin', left(coalesce(ws.countdown_end_date,''),40), 'zona', left(coalesce(nullif(ws.countdown_timezone,''),'America/Bogota'),64))
         else jsonb_build_object('tipo','diario','hora', least(greatest(coalesce(ws.countdown_reset_hour,0),0),23), 'zona', left(coalesce(nullif(ws.countdown_timezone,''),'America/Bogota'),64)) end as modo,
    coalesce((
      select jsonb_agg(u.nombre) from (
        select 'topbar' as nombre where ws.countdown_show_in_header is true
        union all select 'carrito' where ws.countdown_show_in_cart is true
        union all select 'checkout' where ws.checkout_show_countdown is true
        union all select 'producto' where ws.countdown_show_in_product is true
        union all select 'hero' where ws.countdown_show_in_hero is true
      ) u
    ), '[]'::jsonb) as ubicaciones,
    left(coalesce(ws.countdown_title,''),200) as titulo,
    coalesce(ws.checkout_show_stock_warning, false) as aviso,
    least(greatest(coalesce(ws.checkout_stock_warning_threshold,5),1),999) as umbral,
    coalesce(ws.countdown_enabled, false) as activo
  from website_site_states s
  join website_site_revisions r on r.id = s.published_revision_id
  join website_settings ws on ws.organization_id = s.organization_id and ws.branch_id is null
  where s.organization_id in (113, 135, 137, 145)
    and s.v2_adopted
    and not (r.document ? 'conversion')
    and not exists (
      select 1 from website_site_revisions y
      where y.site_state_id = s.id and y.note = 'Contador legacy en conversion'
    )
), construido as (
  select site_state_id, organization_id, schema_version, source_draft_version, document,
    jsonb_build_object(
      'contadores', case when activo then jsonb_build_array(jsonb_build_object(
        'id','legacy','activo', true, 'ubicaciones', ubicaciones, 'modo', modo,
        'formato', jsonb_build_object('dias', false, 'horas', true, 'minutos', true, 'segundos', true, 'etiquetas', true),
        'estilo', jsonb_build_object('forma','pastilla','sombra', false, 'tamano','sm','cajas','linea'),
        'textoAntes', titulo, 'textoDespues', '',
        'alTerminar', jsonb_build_object('tipo','ocultar')
      )) else '[]'::jsonb end,
      'urgencia', jsonb_build_object(
        'stockBajo', jsonb_build_object('activo', aviso, 'umbral', umbral, 'plantilla', 'Quedan {n}', 'ubicaciones', case when aviso then jsonb_build_array('checkout') else '[]'::jsonb end),
        'reservaCarrito', jsonb_build_object('activo', false),
        'personasViendo', jsonb_build_object('activo', false)
      )
    ) as conversion
  from origen
)
insert into website_site_revisions (site_state_id, organization_id, revision_number, schema_version, document, source_draft_version, note)
select c.site_state_id, c.organization_id,
  (select coalesce(max(x.revision_number),0)+1 from website_site_revisions x where x.site_state_id = c.site_state_id),
  c.schema_version,
  c.document || jsonb_build_object('conversion', c.conversion),
  c.source_draft_version,
  'Contador legacy en conversion'
from construido c;

-- Activar DESPUÉS de desplegar el código que acepta `conversion`.
-- La revisión de la org 137 ya existe (nota «Contador legacy en conversion»)
-- y NO está publicada: el lector en producción rechazaría la clave.
--
-- update website_site_states s
-- set published_revision_id = r.id, updated_at = now()
-- from website_site_revisions r
-- where r.site_state_id = s.id
--   and r.note = 'Contador legacy en conversion'
--   and s.organization_id in (113, 135, 137, 145);
--
-- update website_site_drafts d
-- set document = d.document || jsonb_build_object('conversion', r.document->'conversion'),
--     version = d.version + 1,
--     base_revision_id = r.id,
--     updated_at = now()
-- from website_site_states s
-- join website_site_revisions r on r.site_state_id = s.id and r.note = 'Contador legacy en conversion'
-- where d.site_state_id = s.id
--   and s.organization_id in (113, 135, 137, 145)
--   and not (d.document ? 'conversion');
