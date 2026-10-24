-- No borra la revisión (es inmutable). Deja de publicarla y quita `conversion`
-- del borrador. Las columnas countdown_* / checkout_* no se tocaron.

update website_site_states s
set published_revision_id = previa.id, updated_at = now()
from website_site_revisions actual
join website_site_revisions previa
  on previa.site_state_id = actual.site_state_id
 and previa.revision_number = actual.revision_number - 1
where s.published_revision_id = actual.id
  and actual.note = 'Contador legacy en conversion';

update website_site_drafts d
set document = d.document - 'conversion',
    version = d.version + 1,
    updated_at = now()
where d.organization_id in (113, 135, 137, 145)
  and d.document ? 'conversion';
