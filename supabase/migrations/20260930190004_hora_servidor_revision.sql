-- Hora oficial del servidor · M4 — reporte de operaciones con la hora en revisión.
-- Análisis: docs/design/HORA-SERVIDOR-ANALISIS.md §4.5
--
-- Ventas y aperturas de caja cuya hora oficial es dudosa (time_review_reason no nulo):
-- se hicieron sin conexión con el reloj desfasado o sin desfase medido. No se bloquearon;
-- aquí se listan para revisarlas. SECURITY INVOKER: RLS de sales y cash_sessions filtra
-- por pertenencia; además se exige p_organization_id explícito.
-- Rollback: supabase/rollbacks/20260930190004_hora_servidor_revision_rollback.sql

create or replace function public.pos_hora_en_revision(
  p_organization_id integer,
  p_desde timestamptz default now() - interval '30 days',
  p_hasta timestamptz default now()
)
returns table (
  tipo text,
  id text,
  branch_id integer,
  hora_oficial timestamptz,
  hora_equipo timestamptz,
  recibida_en timestamptz,
  desfase_segundos integer,
  motivo text,
  total numeric
)
language sql
stable
security invoker
set search_path to 'public', 'pg_temp'
as $$
  select 'venta'::text, s.id::text, s.branch_id, s.sale_date, s.device_created_at, s.server_received_at,
         s.clock_skew_seconds, s.time_review_reason, s.total
    from public.sales s
   where s.organization_id = p_organization_id
     and s.time_review_reason is not null
     and s.sale_date >= p_desde and s.sale_date < p_hasta
  union all
  select 'caja'::text, c.id::text, c.branch_id, c.opened_at, c.device_opened_at, c.server_received_at,
         (c.device_clock_offset_ms / 1000)::integer, c.time_review_reason, c.initial_amount
    from public.cash_sessions c
   where c.organization_id = p_organization_id
     and c.time_review_reason is not null
     and c.opened_at >= p_desde and c.opened_at < p_hasta
  order by 4 desc
  limit 1000;
$$;

comment on function public.pos_hora_en_revision(integer, timestamptz, timestamptz) is
  'Ventas y aperturas de caja sin conexión cuya hora oficial quedó en revisión (time_review_reason). Lectura con RLS.';

revoke all on function public.pos_hora_en_revision(integer, timestamptz, timestamptz) from public, anon;
grant execute on function public.pos_hora_en_revision(integer, timestamptz, timestamptz) to authenticated, service_role;
