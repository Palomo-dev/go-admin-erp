-- Aplicada el 2026-09-09 vía MCP (apply_migration) como `crm_v4_f00_19_refund_ai_credits_tope_realista`. Archivo reconstruido desde supabase_migrations.schema_migrations el 2026-09-15 (F0-DB ronda 3, B1).
-- Motivo: la migración se aplicó sin dejar su .sql en el repositorio; el cuerpo es statements[1] byte a byte (md5 0e1e123bfb90c6846997a09a4f6266a6). No reformatear.
-- Corrección de crm_v4_f00_17..18 (P11). Datos medidos en producción:
--   SELECT count(*) FILTER (WHERE s.credits_remaining > pl.ai_credits_max_rollover
--                                 + coalesce(s.purchased_credits,0)) FROM ai_settings s …  -> 27 de 38
-- 27 de 38 organizaciones tienen HOY un saldo por encima del techo de su plan
-- (saldos concedidos a mano / plan_id desactualizado). Con un tope duro, el
-- reembolso quedaría en no-op para el 71% de las orgs y se perderían créditos
-- reales. Regla definitiva:
--   * si el saldo actual está por DEBAJO del techo -> el reembolso no lo supera;
--   * si ya está por ENCIMA (o el plan no define techo) -> se reembolsa íntegro.

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
$function$;

COMMENT ON FUNCTION public.refund_ai_credits(integer, integer) IS
  'Reembolsa créditos de IA tras un fallo del proveedor. Atómica (FOR UPDATE sobre ai_settings). Tope = plans.ai_credits_max_rollover + ai_settings.purchased_credits, aplicado solo si el saldo actual no lo supera ya. p_amount<=0 = no-op. Devuelve false si la org no tiene ai_settings. Solo service_role.';

REVOKE ALL ON FUNCTION public.refund_ai_credits(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refund_ai_credits(integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.refund_ai_credits(integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.refund_ai_credits(integer, integer) TO service_role;
