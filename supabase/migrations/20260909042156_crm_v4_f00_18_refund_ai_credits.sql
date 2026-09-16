-- Aplicada el 2026-09-09 vía MCP (apply_migration) como `crm_v4_f00_18_refund_ai_credits`. Archivo reconstruido desde supabase_migrations.schema_migrations el 2026-09-15 (F0-DB ronda 3, B1).
-- Motivo: la migración se aplicó sin dejar su .sql en el repositorio; el cuerpo es statements[1] byte a byte (md5 54f77ec7965658062a2b7ad53dae7069). No reformatear.
-- P11 (REG): RPC explícita de reembolso de créditos de IA.
-- Hoy `refundAiCredits` (src/lib/services/crm/aiCostService.ts:141) llama a
-- `decrement_ai_credits(org, -n)`. Mismo estilo que `decrement_ai_credits`
-- (plpgsql, SECURITY DEFINER, search_path=public, FOR UPDATE sobre ai_settings)
-- pero suma en vez de restar y respeta el techo del plan.
--
-- Techo: plans.ai_credits_max_rollover (free 0, pro 500, business 2000,
-- enterprise 50000, ultimate 20000) + ai_settings.purchased_credits.
-- Si la org no tiene plan o el plan no define techo (NULL) → sin límite.
-- Nunca reduce un saldo que ya estuviera por encima del techo (GREATEST).

CREATE OR REPLACE FUNCTION public.refund_ai_credits(p_org_id integer, p_amount integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_remaining integer;
  v_purchased integer;
  v_cap        integer;
  v_amount     integer := GREATEST(COALESCE(p_amount, 0), 0);
  v_target     integer;
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
    RETURN true; -- nada que hacer
  END IF;

  v_remaining := COALESCE(v_remaining, 0);
  v_target := v_remaining + v_amount;

  -- Techo del plan (si existe el dato)
  SELECT pl.ai_credits_max_rollover
    INTO v_cap
    FROM public.organizations o
    JOIN public.plans pl ON pl.id = o.plan_id
   WHERE o.id = p_org_id;

  IF v_cap IS NOT NULL THEN
    -- nunca por encima de (techo del plan + créditos comprados), y nunca
    -- por debajo del saldo actual (no castigar saldos ya superiores).
    v_target := LEAST(v_target, GREATEST(v_cap + v_purchased, v_remaining));
  END IF;

  UPDATE public.ai_settings
     SET credits_remaining = v_target,
         updated_at = now()
   WHERE organization_id = p_org_id;

  RETURN true;
END;
$function$;

COMMENT ON FUNCTION public.refund_ai_credits(integer, integer) IS
  'Reembolsa créditos de IA (fallo del proveedor tras el débito). Atómica (FOR UPDATE), tope = plans.ai_credits_max_rollover + ai_settings.purchased_credits. Solo service_role.';

REVOKE ALL ON FUNCTION public.refund_ai_credits(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refund_ai_credits(integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.refund_ai_credits(integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.refund_ai_credits(integer, integer) TO service_role;
