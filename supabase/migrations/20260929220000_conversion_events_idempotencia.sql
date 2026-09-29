-- Migración: Tabla de idempotencia para eventos de conversión (Meta CAPI / GA4 MP)
-- Autor: Sistema
-- Fecha: 2026-09-29
-- Ticket: Tracking de conversiones Meta y Google Ads (Ley 1581)

-- Descripción:
-- Tabla para registrar eventos de conversión enviados y evitar duplicados.
-- Usada principalmente para E8 (Purchase) en webhooks de Stripe para garantizar
-- que un mismo invoice no se envíe dos veces a Meta/GA4.

CREATE TABLE IF NOT EXISTS public.conversion_events_sent (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Tipo de evento: 'CompleteRegistration', 'StartTrial', 'Purchase'
  event_type text NOT NULL,
  
  -- ID único del evento (user.id, subscription.id, invoice.id)
  event_id text NOT NULL,
  
  -- Stripe event ID del webhook (para trazabilidad)
  stripe_event_id text,
  
  -- Organización y usuario relacionados
  organization_id bigint REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  
  -- Estado de envío a cada plataforma
  sent_to_meta boolean DEFAULT false,
  sent_to_ga4 boolean DEFAULT false,
  
  -- Metadatos
  created_at timestamptz DEFAULT now() NOT NULL,
  
  -- Índices
  CONSTRAINT conversion_events_sent_event_type_event_id_unique UNIQUE (event_type, event_id)
);

-- Índices para búsquedas eficientes
CREATE INDEX IF NOT EXISTS idx_conversion_events_sent_organization_id 
  ON public.conversion_events_sent(organization_id);
CREATE INDEX IF NOT EXISTS idx_conversion_events_sent_user_id 
  ON public.conversion_events_sent(user_id);
CREATE INDEX IF NOT EXISTS idx_conversion_events_sent_created_at 
  ON public.conversion_events_sent(created_at DESC);

-- RLS: Solo administradores de GO Admin pueden ver estos registros
ALTER TABLE public.conversion_events_sent ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conversion_events_sent_select_admin"
  ON public.conversion_events_sent
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.user_id = auth.uid()
        AND om.organization_id = 1 -- GO Admin (plataforma)
        AND om.is_active = true
        AND om.role_id IN (1, 2) -- Super Admin o Admin
    )
  );

-- Comentarios
COMMENT ON TABLE public.conversion_events_sent IS 
  'Registro de eventos de conversión enviados a Meta CAPI y GA4 MP para idempotencia';
COMMENT ON COLUMN public.conversion_events_sent.event_type IS 
  'Tipo de evento: CompleteRegistration, StartTrial, Purchase';
COMMENT ON COLUMN public.conversion_events_sent.event_id IS 
  'ID único del evento usado para deduplicación (user.id, subscription.id, invoice.id)';
COMMENT ON COLUMN public.conversion_events_sent.stripe_event_id IS 
  'ID del evento de Stripe webhook (para trazabilidad)';
COMMENT ON COLUMN public.conversion_events_sent.sent_to_meta IS 
  'Si el evento fue enviado exitosamente a Meta CAPI';
COMMENT ON COLUMN public.conversion_events_sent.sent_to_ga4 IS 
  'Si el evento fue enviado exitosamente a GA4 Measurement Protocol';
