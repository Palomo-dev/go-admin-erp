-- Rollback: backfill_organizations_timezone
-- Reverte P0-2: quita NOT NULL y DEFAULT, y deja los timezone en NULL
-- (no restaura los valores individuales porque no se puede saber cuales eran NULL antes)

ALTER TABLE public.organizations
  ALTER COLUMN timezone DROP NOT NULL;

ALTER TABLE public.organizations
  ALTER COLUMN timezone DROP DEFAULT;

-- Nota: no revertimos los valores backfilados porque no sabemos cuales eran NULL.
-- Si se necesita revertir completamente, restaurar desde un backup previo a la migracion.
