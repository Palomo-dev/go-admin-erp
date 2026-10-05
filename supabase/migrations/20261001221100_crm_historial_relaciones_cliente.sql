-- Lecturas de historial directo y de oportunidades del cliente. Sin nuevas
-- tablas ni privilegios sobre las originales: el llamante conserva su RLS.
CREATE OR REPLACE VIEW public.crm_customer_activities
WITH (security_invoker = true, security_barrier = true) AS
SELECT a.*, c.id AS timeline_customer_id
FROM public.activities a JOIN public.customers c
  ON a.related_type = 'customer' AND a.related_id = c.id
 AND a.organization_id = c.organization_id
UNION ALL
SELECT a.*, c.id AS timeline_customer_id
FROM public.activities a JOIN public.opportunities o
  ON a.related_type = 'opportunity' AND a.related_id = o.id
 AND a.organization_id = o.organization_id
JOIN public.customers c ON c.id = o.customer_id AND c.organization_id = o.organization_id;

CREATE OR REPLACE VIEW public.crm_customer_notes
WITH (security_invoker = true, security_barrier = true) AS
SELECT n.*, c.id AS timeline_customer_id
FROM public.notes n JOIN public.customers c
  ON n.related_type = 'customer' AND n.related_id = c.id
 AND n.organization_id = c.organization_id
UNION ALL
SELECT n.*, c.id AS timeline_customer_id
FROM public.notes n JOIN public.opportunities o
  ON n.related_type = 'opportunity' AND n.related_id = o.id
 AND n.organization_id = o.organization_id
JOIN public.customers c ON c.id = o.customer_id AND c.organization_id = o.organization_id;

CREATE OR REPLACE VIEW public.crm_customer_tasks
WITH (security_invoker = true, security_barrier = true) AS
SELECT t.*, c.id AS timeline_customer_id
FROM public.tasks t JOIN public.customers c
  ON t.related_to_type = 'customer' AND t.related_to_id = c.id
 AND t.organization_id = c.organization_id
UNION ALL
SELECT t.*, c.id AS timeline_customer_id
FROM public.tasks t JOIN public.opportunities o
  ON t.related_to_type = 'opportunity' AND t.related_to_id = o.id
 AND t.organization_id = o.organization_id
JOIN public.customers c ON c.id = o.customer_id AND c.organization_id = o.organization_id
UNION ALL
SELECT t.*, c.id AS timeline_customer_id
FROM public.tasks t JOIN public.customers c
  ON t.customer_id = c.id AND t.organization_id = c.organization_id
WHERE t.related_to_type IS NULL OR t.related_to_type NOT IN ('customer', 'opportunity');

CREATE OR REPLACE VIEW public.crm_customer_stage_history
WITH (security_invoker = true, security_barrier = true) AS
SELECT h.*, c.id AS timeline_customer_id
FROM public.opportunity_stage_history h JOIN public.opportunities o
  ON h.opportunity_id = o.id AND h.organization_id = o.organization_id
JOIN public.customers c ON c.id = o.customer_id AND c.organization_id = o.organization_id;

-- related_id del correo es TEXT. Comparar con UUID::text evita castear datos
-- antiguos no UUID y no inventa un destinatario a partir del body/metadata.
CREATE OR REPLACE VIEW public.crm_customer_email_messages
WITH (security_invoker = true, security_barrier = true) AS
SELECT e.*, c.id AS timeline_customer_id
FROM public.email_messages e JOIN public.customers c
  ON e.related_type = 'customer' AND e.related_id = c.id::text
 AND e.organization_id = c.organization_id
UNION ALL
SELECT e.*, c.id AS timeline_customer_id
FROM public.email_messages e JOIN public.opportunities o
  ON e.related_type = 'opportunity' AND e.related_id = o.id::text
 AND e.organization_id = o.organization_id
JOIN public.customers c ON c.id = o.customer_id AND c.organization_id = o.organization_id;

REVOKE ALL ON public.crm_customer_activities, public.crm_customer_notes,
  public.crm_customer_tasks, public.crm_customer_stage_history,
  public.crm_customer_email_messages FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.crm_customer_activities, public.crm_customer_notes,
  public.crm_customer_tasks, public.crm_customer_stage_history,
  public.crm_customer_email_messages TO authenticated, service_role;
