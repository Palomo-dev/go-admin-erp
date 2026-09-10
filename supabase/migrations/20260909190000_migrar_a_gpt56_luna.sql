-- =============================================================================
-- Todas las organizaciones, presentes y futuras, pasan a gpt-5.6-luna
--
-- Motivo: con las tarifas ya cargadas se ve que las 29 organizaciones en gpt-4o
-- estaban en el modelo MAS CARO del catalogo.
--
--   gpt-4o        $6,053 por 1.000 respuestas   <- 29 organizaciones
--   gpt-5.6-terra $5,066
--   gemini-3.8    $1,858
--   gpt-5.6-luna  $0,507                        <- destino
--   gpt-4o-mini   $0,363                        <-  9 organizaciones
--
-- Historico: $14,59 gastados; con Luna habrian sido $1,22.
--
-- Luna es mas cara que gpt-4o-mini en tarifa nominal, pero es la gama barata de
-- la familia vigente (ANEXO-B §4.2: "reemplazo oficial de gpt-4.1-nano") y
-- admite prompt caching al 0,1x sobre prefijos >=1024 tokens. Como el 87% del
-- gasto es el prompt del sistema, ahi esta el ahorro real.
--
-- REQUISITO: la Edge Function debe estar desplegada con soporte de Responses
-- API ANTES de aplicar esta migracion. La familia 5.6 no vive en Chat
-- Completions. Si se aplica antes, la funcion caeria al reintento por Chat
-- Completions en cada respuesta.
-- =============================================================================

-- 1) Organizaciones existentes
update public.ai_settings
   set model      = 'gpt-5.6-luna',
       provider   = 'openai',
       updated_at = now()
 where model is distinct from 'gpt-5.6-luna';

-- 2) Valor por defecto de la columna (estaba en 'gpt-4-turbo-preview', apagado)
alter table public.ai_settings alter column model set default 'gpt-5.6-luna';

-- 3) Los planes, que son de donde toma el modelo cada organizacion nueva
update public.plans
   set ai_model = 'gpt-5.6-luna'
 where ai_model is distinct from 'gpt-5.6-luna';

-- 4) El trigger que sincroniza plan -> ai_settings
--
--    Ademas de actualizar el modelo por defecto, se corrige un problema
--    preexistente: el ON CONFLICT reescribia `model` y `max_tokens` en CADA
--    actualizacion de la suscripcion, asi que si una organizacion elegia otro
--    modelo en /crm/ia, el siguiente webhook de Stripe se lo revertia sin
--    avisar. El selector prometia algo que el sistema deshacia.
--
--    Ahora el modelo solo se fija al CREAR la fila; despues manda la eleccion
--    de la organizacion.
create or replace function public.sync_ai_credits_on_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
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
      -- `model` y `max_tokens` NO se tocan: son eleccion de la organizacion.
      is_active = true;
  END IF;

  RETURN NEW;
END;
$fn$;

comment on function public.sync_ai_credits_on_subscription() is
  'Sincroniza los creditos del plan hacia ai_settings. NO reescribe el modelo elegido por la organizacion: solo lo fija al crear la fila.';
