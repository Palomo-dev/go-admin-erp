-- Coordinate rollback with application code: assignment now orders by sort_order.
DROP FUNCTION IF EXISTS public.crm_team_management_write(integer,uuid,text,uuid,timestamptz,jsonb);
DROP FUNCTION IF EXISTS public.crm_validate_territory_criteria(jsonb);
DROP FUNCTION IF EXISTS public.crm_territory_counts(integer,uuid,integer,timestamptz);
DROP FUNCTION IF EXISTS public.crm_team_management_snapshot(integer,uuid,timestamptz,timestamptz);
-- Keep additive sort_order: dropping it would erase saved territory priorities.
-- Older runtime ignores the column; outer dry-run ROLLBACK still restores the original schema.
NOTIFY pgrst,'reload schema';
