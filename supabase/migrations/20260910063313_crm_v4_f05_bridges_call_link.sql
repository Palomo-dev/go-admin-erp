-- Aplicada el 2026-09-10 vía MCP (apply_migration) como `crm_v4_f05_bridges_call_link`. Archivo reconstruido desde supabase_migrations.schema_migrations el 2026-09-15 (F0-DB ronda 3, B1).
-- Motivo: la migración se aplicó sin dejar su .sql en el repositorio; el cuerpo es statements[1] byte a byte (md5 085eb8d2cd59bf5fd9d70c23b285d15d). No reformatear.
-- FASE-05 §3.1 — enlace bridge↔calls, cancelación trazable, ajustes por org y Realtime.
ALTER TABLE public.mobile_call_bridges
  ADD COLUMN IF NOT EXISTS call_id uuid REFERENCES public.calls(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancel_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text;

CREATE INDEX IF NOT EXISTS idx_bridges_call ON public.mobile_call_bridges (call_id) WHERE call_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bridges_agent_leg ON public.mobile_call_bridges (agent_leg_sid) WHERE agent_leg_sid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bridges_org_active ON public.mobile_call_bridges (organization_id, user_id)
  WHERE status IN ('initiating','agent_ringing','agent_answered','customer_dialing','in_progress');

-- Solo el DUEÑO puede escribir su bridge (antes: cualquier miembro de la org
-- podía cortar la llamada de otro por PostgREST). El resto de escrituras las
-- hace el servidor con service role, que no pasa por RLS.
DROP POLICY IF EXISTS mcb_update ON public.mobile_call_bridges;
CREATE POLICY mcb_update ON public.mobile_call_bridges FOR UPDATE
  USING (
    user_id = auth.uid()
    AND organization_id IN (
      SELECT om.organization_id FROM public.organization_members om
       WHERE om.user_id = auth.uid() AND om.is_active = true
    )
  )
  WITH CHECK (user_id = auth.uid());

-- `updated_at` automático (F3 nunca creó `fn_touch_updated_at`).
CREATE OR REPLACE FUNCTION public.fn_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public.fn_touch_updated_at() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_mcb_touch ON public.mobile_call_bridges;
CREATE TRIGGER trg_mcb_touch BEFORE UPDATE ON public.mobile_call_bridges
  FOR EACH ROW EXECUTE FUNCTION public.fn_touch_updated_at();

ALTER TABLE public.comm_settings
  ADD COLUMN IF NOT EXISTS voice_mobile_ivr_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS voice_bridge_confirm_digit boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS voice_bridge_agent_timeout integer NOT NULL DEFAULT 25;

DO $do$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.comm_settings'::regclass AND conname = 'comm_settings_voice_bridge_agent_timeout_check'
  ) THEN
    ALTER TABLE public.comm_settings
      ADD CONSTRAINT comm_settings_voice_bridge_agent_timeout_check
      CHECK (voice_bridge_agent_timeout BETWEEN 10 AND 60);
  END IF;
END $do$;

DO $do$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='mobile_call_bridges'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.mobile_call_bridges;
  END IF;
END $do$;