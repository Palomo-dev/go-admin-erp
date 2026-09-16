-- ============================================================
-- ROLLBACK de 20260909042307_crm_v4_f00_19_refund_ai_credits_tope_realista
-- ============================================================
-- Escrito el 2026-09-15 (F0-DB ronda 3, B1): la migración se aplicó por MCP
-- sin dejar rollback; este archivo deshace su DDL en orden inverso.
-- Restaura la versión de f00_18 de refund_ai_credits (tope duro: LEAST(v_target, GREATEST(cap + purchased, remaining))).
-- ============================================================

begin;
create or replace function public.refund_ai_credits(p_org_id integer, p_amount integer)
returns boolean language plpgsql security definer set search_path to 'public' as $function$
DECLARE
  v_remaining integer;
  v_purchased integer;
  v_cap        integer;
  v_amount     integer := GREATEST(COALESCE(p_amount, 0), 0);
  v_target     integer;
BEGIN
  IF p_org_id IS NULL THEN RETURN false; END IF;
  SELECT credits_remaining, COALESCE(purchased_credits, 0) INTO v_remaining, v_purchased
    FROM public.ai_settings WHERE organization_id = p_org_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF v_amount = 0 THEN RETURN true; END IF;
  v_remaining := COALESCE(v_remaining, 0);
  v_target := v_remaining + v_amount;
  SELECT pl.ai_credits_max_rollover INTO v_cap
    FROM public.organizations o JOIN public.plans pl ON pl.id = o.plan_id WHERE o.id = p_org_id;
  IF v_cap IS NOT NULL THEN
    v_target := LEAST(v_target, GREATEST(v_cap + v_purchased, v_remaining));
  END IF;
  UPDATE public.ai_settings SET credits_remaining = v_target, updated_at = now() WHERE organization_id = p_org_id;
  RETURN true;
END;
$function$;
comment on function public.refund_ai_credits(integer, integer) is
  'Reembolsa créditos de IA (fallo del proveedor tras el débito). Atómica (FOR UPDATE), tope = plans.ai_credits_max_rollover + ai_settings.purchased_credits. Solo service_role.';
revoke all on function public.refund_ai_credits(integer, integer) from public, anon, authenticated;
grant execute on function public.refund_ai_credits(integer, integer) to service_role;
commit;
