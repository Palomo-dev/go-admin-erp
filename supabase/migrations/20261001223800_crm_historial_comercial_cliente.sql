-- Historial comercial de solo lectura. Conserva importes persistidos y todos
-- los folios de una reserva. No recalcula impuestos, cobros ni contabilidad.
CREATE OR REPLACE VIEW public.crm_customer_financial_history
WITH (security_invoker = true, security_barrier = true) AS
SELECT ('sale_' || s.id::text) COLLATE "C" AS id, 'sale'::text AS kind,
  s.id AS source_id, s.organization_id, c.id AS timeline_customer_id,
  s.sale_date AS occurred_at, s.user_id, s.total AS amount,
  s.status, s.payment_status, s.id::text AS reference, s.notes,
  NULL::timestamptz AS end_at, NULL::date AS checkin, NULL::date AS checkout,
  NULL::text AS delivery_type, '[]'::jsonb AS spaces, '[]'::jsonb AS folios
FROM public.sales s JOIN public.customers c
  ON c.id = s.customer_id AND c.organization_id = s.organization_id
UNION ALL
SELECT ('reservation_' || r.id::text) COLLATE "C", 'reservation',
  r.id, r.organization_id, c.id, r.start_date, NULL::uuid, r.total_estimated,
  r.status::text, NULL::text, r.id::text, r.notes,
  r.end_date, r.checkin, r.checkout, NULL::text,
  COALESCE(sp.entries, '[]'::jsonb), COALESCE(fl.entries, '[]'::jsonb)
FROM public.reservations r JOIN public.customers c
  ON c.id = r.customer_id AND c.organization_id = r.organization_id
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object('id', s.id, 'label', s.label,
    'type', st.name) ORDER BY s.label, s.id) AS entries
  FROM public.spaces s
  JOIN public.branches b ON b.id = s.branch_id AND b.organization_id = r.organization_id
  LEFT JOIN public.space_types st ON st.id = s.space_type_id AND st.organization_id = r.organization_id
  WHERE s.id = r.space_id OR EXISTS (SELECT 1 FROM public.reservation_spaces rs
    WHERE rs.reservation_id = r.id AND rs.space_id = s.id)
) sp ON true
LEFT JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object('id', f.id, 'status', f.status,
    'balance', f.balance, 'items_count', fi.items_count,
    'pending_count', fi.pending_count, 'pending_amount', fi.pending_amount)
    ORDER BY f.created_at, f.id) AS entries
  FROM public.folios f
  LEFT JOIN LATERAL (
    SELECT count(*) AS items_count,
      count(*) FILTER (WHERE i.payment_status = 'pending') AS pending_count,
      COALESCE(sum(i.amount) FILTER (WHERE i.payment_status = 'pending'), 0) AS pending_amount
    FROM public.folio_items i WHERE i.folio_id = f.id
  ) fi ON true
  WHERE f.reservation_id = r.id
) fl ON true
UNION ALL
SELECT ('web_order_' || w.id::text) COLLATE "C", 'web_order',
  w.id, w.organization_id, c.id, w.created_at, w.confirmed_by, w.total,
  w.status, w.payment_status, w.order_number, w.customer_notes,
  NULL::timestamptz, NULL::date, NULL::date, w.delivery_type,
  '[]'::jsonb, '[]'::jsonb
FROM public.web_orders w JOIN public.customers c
  ON c.id = w.customer_id AND c.organization_id = w.organization_id;

REVOKE ALL ON public.crm_customer_financial_history FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.crm_customer_financial_history TO authenticated, service_role;
