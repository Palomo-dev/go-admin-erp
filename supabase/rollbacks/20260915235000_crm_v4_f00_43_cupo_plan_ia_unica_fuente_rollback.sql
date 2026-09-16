-- =============================================================================
-- ROLLBACK de crm_v4_f00_43_cupo_plan_ia_unica_fuente
-- Elimina fn_provision_ai_settings y fn_ai_plan_quota y restaura
-- sync_ai_credits_on_subscription y fn_reset_monthly_ai_credits con el texto
-- LITERAL de pg_get_functiondef en BD el 2026-09-15 (MCP, SELECT), de modo que
-- `md5(pg_get_functiondef(oid))` coincide con el previo a la 43:
--   sync_ai_credits_on_subscription()  1ead735d7b2f1df2c2571717c7ed2ba5
--   fn_reset_monthly_ai_credits()      1639c30c7347a0792e8316bab9cabb8a
-- Los comentarios (obj_description) se restauran tal cual.
--
-- ADVERTENCIA: al revertir, el cupo del plan vuelve a calcularse en tres sitios
-- con reglas distintas (ver cabecera de la migración) y `ensureAiSettings`
-- (Node) cae a su respaldo local, que sí trata la fila con
-- `credits_reset_at NULL`; el cron vuelve a ignorar `custom_config.aiCredits`.
-- No toca datos: los saldos ya provisionados se conservan.
--
-- ACL: la 43 revoca EXECUTE de fn_reset_monthly_ai_credits a
-- public/anon/authenticated (antes estaba abierta). Este rollback NO la
-- reabre: la migración 40 (crm_v4_f00_40_cerrar_rpc_crm_anon) la cierra
-- igualmente y reabrirla sería un retroceso de seguridad.
-- Comprobación tras el rollback:
--   select p.oid::regprocedure::text, md5(pg_get_functiondef(p.oid))
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and p.proname in ('sync_ai_credits_on_subscription','fn_reset_monthly_ai_credits');
--   select count(*) from pg_proc where proname in ('fn_ai_plan_quota','fn_provision_ai_settings');  -- 0
-- =============================================================================

begin;

drop function if exists public.fn_provision_ai_settings(integer);
drop function if exists public.fn_ai_plan_quota(integer);

-- No retocar mayúsculas, espacios finales ni líneas en blanco: el md5 debe coincidir.
CREATE OR REPLACE FUNCTION public.sync_ai_credits_on_subscription()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  plan_credits INTEGER;
  plan_model TEXT;
  plan_max_tokens INTEGER;
BEGIN
  IF NEW.status IN ('active', 'trialing') THEN
    SELECT
      COALESCE(ai_credits_monthly, 0),
      COALESCE(ai_model, 'gpt-5.6-luna'),
      COALESCE(ai_max_tokens, 1000)
    INTO plan_credits, plan_model, plan_max_tokens
    FROM plans
    WHERE id = NEW.plan_id;

    INSERT INTO ai_settings (
      organization_id, credits_remaining, credits_reset_at,
      model, max_tokens, provider, is_active
    )
    VALUES (
      NEW.organization_id, plan_credits, NOW(),
      plan_model, plan_max_tokens, 'openai', true
    )
    ON CONFLICT (organization_id)
    DO UPDATE SET
      credits_remaining = CASE
        WHEN plan_credits > ai_settings.credits_remaining THEN plan_credits
        ELSE ai_settings.credits_remaining
      END,
      is_active = true;
  END IF;

  RETURN NEW;
END;
$function$
;

comment on function public.sync_ai_credits_on_subscription() is
  'Sincroniza los creditos del plan hacia ai_settings. NO reescribe el modelo elegido por la organizacion: solo lo fija al crear la fila.';

CREATE OR REPLACE FUNCTION public.fn_reset_monthly_ai_credits()
 RETURNS TABLE(organization_id_updated integer, monthly_credits integer, rollover_applied integer, purchased_preserved integer, new_total integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  rec RECORD;
  monthly_credits integer;
  max_rollover integer;
  purchased_credits integer;
  current_remaining integer;
  unused_monthly integer;
  rollover_amount integer;
  new_credits_total integer;
BEGIN
  -- Iterar sobre todas las organizaciones con ai_settings
  FOR rec IN
    SELECT 
      s.organization_id,
      s.credits_remaining,
      s.purchased_credits,
      s.credits_reset_at,
      COALESCE(p.ai_credits_monthly, 0) as plan_monthly,
      COALESCE(p.ai_credits_max_rollover, 0) as plan_max_rollover,
      COALESCE(sub.metadata->'custom_config'->>'ai_credits', '') as enterprise_ai_credits
    FROM ai_settings s
    LEFT JOIN subscriptions sub ON sub.organization_id = s.organization_id
    LEFT JOIN plans p ON p.id = sub.plan_id
  LOOP
    -- Determinar créditos mensuales (enterprise usa custom_config)
    IF rec.enterprise_ai_credits IS NOT NULL AND rec.enterprise_ai_credits != '' THEN
      monthly_credits := rec.enterprise_ai_credits::integer;
      max_rollover := LEAST(monthly_credits * 2, 100000);
    ELSE
      monthly_credits := COALESCE(rec.plan_monthly, 0);
      max_rollover := COALESCE(rec.plan_max_rollover, 0);
    END IF;

    -- Skip si no tiene créditos mensuales y no tiene purchased
    IF monthly_credits = 0 AND COALESCE(rec.purchased_credits, 0) = 0 THEN
      CONTINUE;
    END IF;

    purchased_credits := COALESCE(rec.purchased_credits, 0);
    current_remaining := COALESCE(rec.credits_remaining, 0);
    
    -- Separar créditos mensuales no usados de los comprados
    unused_monthly := GREATEST(0, current_remaining - purchased_credits);
    
    -- Aplicar rollover limitado
    rollover_amount := LEAST(unused_monthly, max_rollover);
    
    -- Nuevo total = mensual + rollover + comprados (preservados)
    new_credits_total := monthly_credits + rollover_amount + purchased_credits;

    -- Actualizar ai_settings
    UPDATE ai_settings
    SET 
      credits_remaining = new_credits_total,
      credits_reset_at = NOW(),
      last_rollover_amount = rollover_amount,
      updated_at = NOW()
    WHERE organization_id = rec.organization_id;

    -- Retornar resultado
    organization_id_updated := rec.organization_id;
    monthly_credits := monthly_credits;
    rollover_applied := rollover_amount;
    purchased_preserved := purchased_credits;
    new_total := new_credits_total;
    
    RETURN NEXT;
    
    RAISE NOTICE 'Org %: monthly=%, rollover=%, purchased=%, total=%', 
      rec.organization_id, monthly_credits, rollover_amount, purchased_credits, new_credits_total;
  END LOOP;
END;
$function$
;

comment on function public.fn_reset_monthly_ai_credits() is
  'Resetea créditos IA mensualmente. Preserva purchased_credits. Aplica rollover según plan.';

commit;
