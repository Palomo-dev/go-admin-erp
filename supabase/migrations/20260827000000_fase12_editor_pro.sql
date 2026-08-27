-- ============================================================
-- FASE 12 — Editor profesional: borradores, versionado y plantillas
-- ============================================================
-- Añade:
--  · website_pages.draft_content (jsonb)        — borrador en memoria del editor
--  · website_pages.has_unpublished_changes (bool)
--  · website_pages.published_at (timestamptz)
--  · website_page_versions (tabla nueva)       — historial de versiones publicadas
--  · website_section_presets (tabla nueva)     — plantillas de sección por organización
--
-- El flujo:
--   Guardar  → escribe en draft_content (no impacta producción).
--   Publicar → copia draft_content a website_page_sections vivas + crea versión.
--   Revertir → restaura una versión anterior sobre las secciones vivas.
-- ============================================================

-- 1. Columnas nuevas en website_pages
ALTER TABLE public.website_pages
  ADD COLUMN IF NOT EXISTS draft_content jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS has_unpublished_changes boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS published_at timestamptz DEFAULT NULL;

COMMENT ON COLUMN public.website_pages.draft_content IS 'FASE 12: snapshot JSON del borrador ({ sections: [...] }). NULL = sin borrador pendiente.';
COMMENT ON COLUMN public.website_pages.has_unpublished_changes IS 'FASE 12: true cuando hay cambios en draft_content sin publicar.';
COMMENT ON COLUMN public.website_pages.published_at IS 'FASE 12: fecha de la última publicación efectiva.';

-- 2. Tabla website_page_versions — historial de versiones publicadas
CREATE TABLE IF NOT EXISTS public.website_page_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES public.website_pages(id) ON DELETE CASCADE,
  organization_id integer NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  content_snapshot jsonb NOT NULL,          -- snapshot completo: { sections: [...] }
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  note text                                 -- etiqueta opcional (ej. "Antes de campaña navidad")
);

CREATE INDEX IF NOT EXISTS idx_website_page_versions_page
  ON public.website_page_versions(page_id, created_at DESC);

ALTER TABLE public.website_page_versions ENABLE ROW LEVEL SECURITY;

-- Política: miembros de la organización pueden ver/gestionar versiones
CREATE POLICY "website_page_versions_select_org"
  ON public.website_page_versions
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "website_page_versions_insert_org"
  ON public.website_page_versions
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
      AND role_id IN (SELECT id FROM public.roles WHERE name IN ('owner', 'admin'))
    )
  );

CREATE POLICY "website_page_versions_delete_org"
  ON public.website_page_versions
  FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
      AND role_id IN (SELECT id FROM public.roles WHERE name IN ('owner', 'admin'))
    )
  );

-- 3. Tabla website_section_presets — plantillas de sección guardadas por el usuario
CREATE TABLE IF NOT EXISTS public.website_section_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id integer NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  section_type text NOT NULL,
  section_variant text NOT NULL,
  content jsonb NOT NULL DEFAULT '{}',
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_website_section_presets_org
  ON public.website_section_presets(organization_id, created_at DESC);

ALTER TABLE public.website_section_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "website_section_presets_select_org"
  ON public.website_section_presets
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "website_section_presets_insert_org"
  ON public.website_section_presets
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
      AND role_id IN (SELECT id FROM public.roles WHERE name IN ('owner', 'admin'))
    )
  );

CREATE POLICY "website_section_presets_delete_org"
  ON public.website_section_presets
  FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
      AND role_id IN (SELECT id FROM public.roles WHERE name IN ('owner', 'admin'))
    )
  );
