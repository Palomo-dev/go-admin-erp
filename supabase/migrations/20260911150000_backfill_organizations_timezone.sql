-- Migration: backfill_organizations_timezone
-- Date: 2026-09-11
-- Ronda 3, P0-2: Backfill de organizations.timezone para las 82 orgs sin timezone.
-- Ademas: NOT NULL + DEFAULT 'America/Bogota' para que ninguna org nueva nazca sin zona horaria.

-- 1. Backfill desde organization_settings key='calendar' cuando exista
UPDATE public.organizations o
SET timezone = (os.settings->>'timezone')::text
FROM public.organization_settings os
WHERE os.organization_id = o.id
  AND os.key = 'calendar'
  AND os.settings ? 'timezone'
  AND btrim(os.settings->>'timezone') != ''
  AND o.timezone IS NULL;

-- 2. Backfill restantes con America/Bogota
UPDATE public.organizations
SET timezone = 'America/Bogota'
WHERE timezone IS NULL;

-- 3. Agregar DEFAULT para nuevas orgs
ALTER TABLE public.organizations
  ALTER COLUMN timezone SET DEFAULT 'America/Bogota';

-- 4. Agregar NOT NULL (ya no hay NULLs)
ALTER TABLE public.organizations
  ALTER COLUMN timezone SET NOT NULL;
