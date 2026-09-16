-- =============================================================================
-- ROLLBACK de crm_v4_f00_39_decrement_ai_credits_guardas
-- Restaura decrement_ai_credits y refund_ai_credits a su definición del
-- 2026-09-15 con el texto LITERAL de pg_get_functiondef (MCP, SELECT), de
-- modo que `md5(pg_get_functiondef(oid))` coincide con el previo a la 39:
--   decrement_ai_credits(integer,integer)  a68f25987e9543ffbf0cfb812f11d92e
--   refund_ai_credits(integer,integer)     f0c1222c7a429941892d70cf348be395
-- y elimina las dos funciones de agregado y el helper fn_resolve_timezone
-- (nuevo en la 39; no existía antes, verificado por MCP el 2026-09-16). No
-- toca datos.
-- Comprobación tras el rollback:
--   select p.oid::regprocedure::text, md5(pg_get_functiondef(p.oid))
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname in ('decrement_ai_credits','refund_ai_credits');
--     -- 2 filas con los md5 de arriba.
--   select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname in ('fn_ai_usage_month','fn_comm_usage_month','fn_resolve_timezone');
--     -- 0.
--
-- ADVERTENCIA: al revertir, `decrement_ai_credits(org, null)` vuelve a dejar
-- credits_remaining = NULL (org ilimitada) y la app vuelve a recibir una
-- excepción (500) para organizaciones sin fila en ai_settings. GET /credits y
-- el presupuesto en aiCostService caen al camino de respaldo en Node.
-- =============================================================================

begin;

drop function if exists public.fn_ai_usage_month(integer, timestamptz, text);
drop function if exists public.fn_comm_usage_month(integer, timestamptz);
-- Helper nuevo en la 39: fn_ai_usage_month lo usa, por eso se dropea después.
drop function if exists public.fn_resolve_timezone(text);

-- refund_ai_credits: de vuelta a la firma de dos parámetros.
drop function if exists public.refund_ai_credits(integer, integer, integer);

-- Texto LITERAL de `pg_get_functiondef` en BD el 2026-09-15 (MCP, SELECT):
-- md5(pg_get_functiondef(oid)) = f0c1222c7a429941892d70cf348be395.
-- No retocar mayúsculas ni espacios: tras el rollback, el md5 debe coincidir.
CREATE OR REPLACE FUNCTION public.refund_ai_credits(p_org_id integer, p_amount integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_remaining integer;
  v_purchased integer;
  v_cap       integer;
  v_ceiling   integer;
  v_amount    integer := GREATEST(COALESCE(p_amount, 0), 0);
  v_target    integer;
BEGIN
  IF p_org_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT credits_remaining, COALESCE(purchased_credits, 0)
    INTO v_remaining, v_purchased
    FROM public.ai_settings
   WHERE organization_id = p_org_id
   FOR UPDATE; -- mismo bloqueo de fila que decrement_ai_credits

  IF NOT FOUND THEN
    RETURN false; -- sin ai_settings no hay saldo que reembolsar
  END IF;

  IF v_amount = 0 THEN
    RETURN true;
  END IF;

  v_remaining := COALESCE(v_remaining, 0);
  v_target    := v_remaining + v_amount;

  SELECT pl.ai_credits_max_rollover
    INTO v_cap
    FROM public.organizations o
    JOIN public.plans pl ON pl.id = o.plan_id
   WHERE o.id = p_org_id;

  IF v_cap IS NOT NULL THEN
    v_ceiling := v_cap + v_purchased;
    -- Solo se aplica si el saldo actual todavía no supera el techo.
    IF v_remaining <= v_ceiling THEN
      v_target := LEAST(v_target, v_ceiling);
    END IF;
  END IF;

  UPDATE public.ai_settings
     SET credits_remaining = v_target,
         updated_at = now()
   WHERE organization_id = p_org_id;

  RETURN true;
END;
$function$
;

revoke all on function public.refund_ai_credits(integer, integer) from public, anon, authenticated;
grant execute on function public.refund_ai_credits(integer, integer) to service_role;

-- decrement_ai_credits: definición original (sin guardas). Texto LITERAL de
-- `pg_get_functiondef` el 2026-09-15; md5 = a68f25987e9543ffbf0cfb812f11d92e.
CREATE OR REPLACE FUNCTION public.decrement_ai_credits(p_org_id integer, p_cost integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_remaining integer;
BEGIN
  SELECT credits_remaining INTO v_remaining
    FROM ai_settings
    WHERE organization_id = p_org_id
    FOR UPDATE; -- bloqueo a nivel fila para evitar race condition

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ai_settings no encontrada para organization_id %', p_org_id;
  END IF;

  IF v_remaining < p_cost THEN
    RETURN false;
  END IF;

  UPDATE ai_settings
    SET credits_remaining = v_remaining - p_cost
    WHERE organization_id = p_org_id;

  RETURN true;
END;
$function$
;

revoke all on function public.decrement_ai_credits(integer, integer) from public, anon, authenticated;
grant execute on function public.decrement_ai_credits(integer, integer) to service_role;

-- Comentarios como estaban (obj_description, MCP 2026-09-15): decrement no
-- tenía; refund_ai_credits(int,int) sí, y el DROP de la 39 lo perdió.
comment on function public.decrement_ai_credits(integer, integer) is null;
comment on function public.refund_ai_credits(integer, integer) is
  'Reembolsa créditos de IA tras un fallo del proveedor. Atómica (FOR UPDATE sobre ai_settings). Tope = plans.ai_credits_max_rollover + ai_settings.purchased_credits, aplicado solo si el saldo actual no lo supera ya. p_amount<=0 = no-op. Devuelve false si la org no tiene ai_settings. Solo service_role.';

commit;
