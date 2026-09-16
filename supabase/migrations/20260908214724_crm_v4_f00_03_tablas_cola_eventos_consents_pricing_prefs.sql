-- Aplicada el 2026-09-08 vía MCP (apply_migration) como `crm_v4_f00_03_tablas_cola_eventos_consents_pricing_prefs`. Archivo reconstruido desde supabase_migrations.schema_migrations el 2026-09-15 (F0-DB ronda 3, B1).
-- Motivo: la migración se aplicó sin dejar su .sql en el repositorio; el cuerpo es statements[1] byte a byte (md5 67d7e435c1a7ddd3ac3edb65b25a19a5). No reformatear.
-- M3: outbound_jobs, crm_events, contact_consents, provider_pricing, user_comm_preferences (RLS patrón `calls`)

-- ===== outbound_jobs =====
CREATE TABLE IF NOT EXISTS public.outbound_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id integer NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('email','whatsapp','sms','ai_call','sequence_step','automation',
    'transcribe','analyze','recording_fetch','recording_cleanup','campaign_batch','crm_event','maintenance')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','failed','dead')),
  run_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  last_error text,
  locked_at timestamptz,
  locked_by text,
  dedupe_key text,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- tester #5: dedupe solo entre jobs vivos (permite re-encolar tras done/dead)
CREATE UNIQUE INDEX IF NOT EXISTS outbound_jobs_dedupe_live_uidx ON public.outbound_jobs(organization_id, dedupe_key)
  WHERE status IN ('queued','running') AND dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS outbound_jobs_claim_idx ON public.outbound_jobs(status, run_at) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS outbound_jobs_running_idx ON public.outbound_jobs(locked_at) WHERE status = 'running';
CREATE INDEX IF NOT EXISTS outbound_jobs_org_kind_created_idx ON public.outbound_jobs(organization_id, kind, created_at DESC);
DROP TRIGGER IF EXISTS set_outbound_jobs_updated_at ON public.outbound_jobs;
CREATE TRIGGER set_outbound_jobs_updated_at BEFORE UPDATE ON public.outbound_jobs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.outbound_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS outbound_jobs_select ON public.outbound_jobs;
CREATE POLICY outbound_jobs_select ON public.outbound_jobs FOR SELECT TO authenticated
USING (organization_id IN (SELECT om.organization_id FROM public.organization_members om
                           WHERE om.user_id = auth.uid() AND om.is_active = true));
-- escrituras: solo service_role (sin política INSERT/UPDATE/DELETE para authenticated)
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.outbound_jobs FROM anon, authenticated;
REVOKE ALL ON public.outbound_jobs FROM anon;

-- ===== crm_events (outbox) =====
CREATE TABLE IF NOT EXISTS public.crm_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id integer NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processed','skipped','failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
CREATE INDEX IF NOT EXISTS crm_events_pending_idx ON public.crm_events(status, created_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS crm_events_org_entity_idx ON public.crm_events(organization_id, entity_type, entity_id, created_at DESC);
ALTER TABLE public.crm_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crm_events_select ON public.crm_events;
CREATE POLICY crm_events_select ON public.crm_events FOR SELECT TO authenticated
USING (organization_id IN (SELECT om.organization_id FROM public.organization_members om
                           WHERE om.user_id = auth.uid() AND om.is_active = true));
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.crm_events FROM anon, authenticated;
REVOKE ALL ON public.crm_events FROM anon;

-- ===== contact_consents =====
CREATE TABLE IF NOT EXISTS public.contact_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id integer NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('email','whatsapp','sms','voice')),
  status text NOT NULL DEFAULT 'unknown' CHECK (status IN ('opted_in','opted_out','unknown')),
  source text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  changed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, customer_id, channel)
);
CREATE INDEX IF NOT EXISTS contact_consents_customer_idx ON public.contact_consents(customer_id, channel);
ALTER TABLE public.contact_consents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS contact_consents_select ON public.contact_consents;
CREATE POLICY contact_consents_select ON public.contact_consents FOR SELECT TO authenticated
USING (organization_id IN (SELECT om.organization_id FROM public.organization_members om WHERE om.user_id = auth.uid() AND om.is_active = true));
DROP POLICY IF EXISTS contact_consents_insert ON public.contact_consents;
CREATE POLICY contact_consents_insert ON public.contact_consents FOR INSERT TO authenticated
WITH CHECK (organization_id IN (SELECT om.organization_id FROM public.organization_members om WHERE om.user_id = auth.uid() AND om.is_active = true));
DROP POLICY IF EXISTS contact_consents_update ON public.contact_consents;
CREATE POLICY contact_consents_update ON public.contact_consents FOR UPDATE TO authenticated
USING (organization_id IN (SELECT om.organization_id FROM public.organization_members om WHERE om.user_id = auth.uid() AND om.is_active = true))
WITH CHECK (organization_id IN (SELECT om.organization_id FROM public.organization_members om WHERE om.user_id = auth.uid() AND om.is_active = true));
DROP POLICY IF EXISTS contact_consents_delete ON public.contact_consents;
CREATE POLICY contact_consents_delete ON public.contact_consents FOR DELETE TO authenticated
USING (organization_id IN (SELECT om.organization_id FROM public.organization_members om WHERE om.user_id = auth.uid() AND om.is_active = true));
REVOKE ALL ON public.contact_consents FROM anon;

-- ===== provider_pricing (catálogo global) =====
CREATE TABLE IF NOT EXISTS public.provider_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  sku text NOT NULL,
  unit text NOT NULL,
  unit_cost_usd numeric(12,6) NOT NULL CHECK (unit_cost_usd >= 0),
  credits_per_unit numeric(12,4),
  currency text NOT NULL DEFAULT 'USD',
  valid_from date NOT NULL DEFAULT current_date,
  verified boolean NOT NULL DEFAULT false,
  source_url text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, sku, valid_from)
);
ALTER TABLE public.provider_pricing ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS provider_pricing_select ON public.provider_pricing;
CREATE POLICY provider_pricing_select ON public.provider_pricing FOR SELECT TO authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.provider_pricing FROM anon, authenticated;
REVOKE ALL ON public.provider_pricing FROM anon;

CREATE OR REPLACE FUNCTION public.fn_unit_cost(p_provider text, p_sku text, p_at date DEFAULT current_date)
RETURNS numeric LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT unit_cost_usd FROM public.provider_pricing
   WHERE provider = p_provider AND sku = p_sku AND valid_from <= p_at
   ORDER BY valid_from DESC LIMIT 1;
$$;

-- ===== user_comm_preferences =====
CREATE TABLE IF NOT EXISTS public.user_comm_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id integer NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mobile_phone_e164 text,
  mobile_verified_at timestamptz,
  default_call_mode text NOT NULL DEFAULT 'browser' CHECK (default_call_mode IN ('browser','mobile')),
  default_caller_id_id uuid REFERENCES public.phone_numbers(id) ON DELETE SET NULL,
  voice_id uuid,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);
DROP TRIGGER IF EXISTS set_user_comm_preferences_updated_at ON public.user_comm_preferences;
CREATE TRIGGER set_user_comm_preferences_updated_at BEFORE UPDATE ON public.user_comm_preferences FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.user_comm_preferences ENABLE ROW LEVEL SECURITY;
-- cada usuario ve/edita su fila; admins de la org (is_super_admin o role_id 1/2) leen todas las de su org
DROP POLICY IF EXISTS user_comm_preferences_select ON public.user_comm_preferences;
CREATE POLICY user_comm_preferences_select ON public.user_comm_preferences FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR organization_id IN (SELECT om.organization_id FROM public.organization_members om
                          WHERE om.user_id = auth.uid() AND om.is_active = true
                            AND (om.is_super_admin = true OR om.role_id IN (1,2)))
);
DROP POLICY IF EXISTS user_comm_preferences_insert ON public.user_comm_preferences;
CREATE POLICY user_comm_preferences_insert ON public.user_comm_preferences FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND organization_id IN (SELECT om.organization_id FROM public.organization_members om WHERE om.user_id = auth.uid() AND om.is_active = true)
);
DROP POLICY IF EXISTS user_comm_preferences_update ON public.user_comm_preferences;
CREATE POLICY user_comm_preferences_update ON public.user_comm_preferences FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (
  user_id = auth.uid()
  AND organization_id IN (SELECT om.organization_id FROM public.organization_members om WHERE om.user_id = auth.uid() AND om.is_active = true)
);
DROP POLICY IF EXISTS user_comm_preferences_delete ON public.user_comm_preferences;
CREATE POLICY user_comm_preferences_delete ON public.user_comm_preferences FOR DELETE TO authenticated
USING (user_id = auth.uid());
REVOKE ALL ON public.user_comm_preferences FROM anon;