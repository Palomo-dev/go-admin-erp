import { createClient } from '@supabase/supabase-js';

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Variables de entorno de Supabase no configuradas');
  }
  
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

interface AICheckResult {
  allowed: boolean;
  creditsRemaining: number;
  error?: string;
  aiModel?: string;
  aiMaxTokens?: number;
}

interface PlanAIFeatures {
  aiCreditsMonthly: number;
  aiCreditsMaxRollover: number;
  aiModel: string;
  aiMaxTokens: number;
}

/**
 * Obtiene las características de IA del plan desde la tabla plans
 */
async function getPlanAIFeaturesFromDB(planCode: string): Promise<PlanAIFeatures | null> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('plans')
    .select('ai_credits_monthly, ai_credits_max_rollover, ai_model, ai_max_tokens')
    .eq('code', planCode)
    .single();

  if (error || !data) {
    console.error('Error fetching plan AI features:', error);
    return null;
  }

  return {
    aiCreditsMonthly: data.ai_credits_monthly || 0,
    aiCreditsMaxRollover: data.ai_credits_max_rollover || 0,
    aiModel: data.ai_model || 'gpt-4o-mini',
    aiMaxTokens: data.ai_max_tokens || 1000,
  };
}

/**
 * Obtiene las características de IA según el plan de la organización
 */
async function getAIFeaturesForOrganization(organizationId: number): Promise<PlanAIFeatures> {
  const supabase = getSupabaseClient();

  const { data: subscription, error } = await supabase
    .from('subscriptions')
    .select('plan_id, metadata, plans:plan_id(code, is_custom_enterprise)')
    .eq('organization_id', organizationId)
    .single();

  if (error || !subscription) {
    console.error('Error getting plan code:', error);
    return {
      aiCreditsMonthly: 10000,
      aiCreditsMaxRollover: 50000,
      aiModel: 'gpt-4o',
      aiMaxTokens: 4000,
    };
  }

  const planData = subscription.plans as any;
  const planCode = planData?.code || 'enterprise';
  const isEnterprise = planData?.is_custom_enterprise === true || planCode === 'enterprise';

  if (isEnterprise) {
    const customConfig = subscription.metadata?.custom_config;
    const aiCreditsFromConfig = customConfig?.ai_credits || customConfig?.aiCredits || 10000;
    
    return {
      aiCreditsMonthly: aiCreditsFromConfig,
      aiCreditsMaxRollover: Math.min(aiCreditsFromConfig * 2, 100000),
      aiModel: 'gpt-4o',
      aiMaxTokens: 4000,
    };
  } else {
    const planFeatures = await getPlanAIFeaturesFromDB(planCode);
    return planFeatures || {
      aiCreditsMonthly: 0,
      aiCreditsMaxRollover: 0,
      aiModel: 'gpt-4o-mini',
      aiMaxTokens: 500,
    };
  }
}

/**
 * Verifica si una organización tiene créditos de IA disponibles
 */
export async function checkAICredits(organizationId: number): Promise<AICheckResult> {
  const supabase = getSupabaseClient();

  const { data: settings, error: settingsError } = await supabase
    .from('ai_settings')
    .select('credits_remaining, credits_reset_at')
    .eq('organization_id', organizationId)
    .single();

  const aiFeatures = await getAIFeaturesForOrganization(organizationId);

  if (settingsError && settingsError.code !== 'PGRST116') {
    console.error('Error checking AI credits:', settingsError);
    return { 
      allowed: false, 
      creditsRemaining: 0, 
      error: 'Error al verificar créditos',
      aiModel: aiFeatures.aiModel,
      aiMaxTokens: aiFeatures.aiMaxTokens,
    };
  }

  if (!settings) {
    const initialCredits = aiFeatures.aiCreditsMonthly;
    
    await supabase.from('ai_settings').insert({
      organization_id: organizationId,
      credits_remaining: initialCredits,
      credits_reset_at: new Date().toISOString(),
      provider: 'openai',
      model: aiFeatures.aiModel,
      max_tokens: aiFeatures.aiMaxTokens,
      is_active: true,
    });

    return { 
      allowed: initialCredits > 0, 
      creditsRemaining: initialCredits,
      aiModel: aiFeatures.aiModel,
      aiMaxTokens: aiFeatures.aiMaxTokens,
    };
  }

  const lastReset = new Date(settings.credits_reset_at || 0);
  const now = new Date();
  const shouldReset = lastReset.getMonth() !== now.getMonth() || 
                     lastReset.getFullYear() !== now.getFullYear();

  if (shouldReset) {
    const unusedCredits = settings.credits_remaining || 0;
    const rolloverCredits = Math.min(unusedCredits, aiFeatures.aiCreditsMaxRollover);
    const newCredits = aiFeatures.aiCreditsMonthly + rolloverCredits;

    await supabase.from('ai_settings').update({
      credits_remaining: newCredits,
      credits_reset_at: now.toISOString(),
      model: aiFeatures.aiModel,
      max_tokens: aiFeatures.aiMaxTokens,
    }).eq('organization_id', organizationId);

    return { 
      allowed: newCredits > 0, 
      creditsRemaining: newCredits,
      aiModel: aiFeatures.aiModel,
      aiMaxTokens: aiFeatures.aiMaxTokens,
    };
  }

  const creditsRemaining = settings.credits_remaining || 0;
  
  if (creditsRemaining <= 0) {
    return { 
      allowed: false, 
      creditsRemaining: 0, 
      error: 'Créditos de IA agotados. Mejora tu plan o contacta soporte.',
      aiModel: aiFeatures.aiModel,
      aiMaxTokens: aiFeatures.aiMaxTokens,
    };
  }

  return { 
    allowed: true, 
    creditsRemaining,
    aiModel: aiFeatures.aiModel,
    aiMaxTokens: aiFeatures.aiMaxTokens,
  };
}

/**
 * Consume créditos de IA actualizando directamente la tabla ai_settings
 */
export async function consumeAICredits(
  organizationId: number, 
  amount: number = 1
): Promise<boolean> {
  console.log('🔥 consumeAICredits called:', { organizationId, amount });
  
  try {
    const supabase = getSupabaseClient();

    const { data: settings, error: getError } = await supabase
      .from('ai_settings')
      .select('credits_remaining')
      .eq('organization_id', organizationId)
      .single();

    if (getError || !settings) {
      console.error('❌ Error getting AI settings:', getError);
      return false;
    }

    const currentCredits = settings.credits_remaining || 0;
    
    if (currentCredits < amount) {
      console.warn('⚠️ Insufficient AI credits:', { currentCredits, required: amount });
      return false;
    }

    const newCredits = currentCredits - amount;
    const { error: updateError } = await supabase
      .from('ai_settings')
      .update({ 
        credits_remaining: newCredits,
        updated_at: new Date().toISOString()
      })
      .eq('organization_id', organizationId);

    if (updateError) {
      console.error('❌ Error updating AI credits:', updateError);
      return false;
    }

    try {
      await supabase.from('ai_usage_logs').insert({
        organization_id: organizationId,
        credits_used: amount,
        model: 'gpt-4o-mini',
        created_at: new Date().toISOString()
      });
    } catch (logErr) {
      console.warn('⚠️ Failed to log AI usage (non-critical):', logErr);
    }

    console.log('✅ AI credits consumed:', { organizationId, amount, newCredits });
    return true;
  } catch (err) {
    console.error('❌ Exception in consumeAICredits:', err);
    return false;
  }
}

/**
 * Estima créditos necesarios basado en tokens
 */
export function estimateCredits(tokens: number): number {
  return Math.max(1, Math.ceil(tokens / 1000));
}

/**
 * Wrapper para funciones de IA con validación de créditos
 */
export async function withAICreditsCheck<T>(
  organizationId: number,
  estimatedCredits: number,
  fn: () => Promise<T>
): Promise<T> {
  const check = await checkAICredits(organizationId);
  
  if (!check.allowed) {
    throw new Error(check.error || 'Créditos de IA insuficientes');
  }

  const result = await fn();

  const consumed = await consumeAICredits(organizationId, estimatedCredits);
  
  if (!consumed) {
    console.warn('Failed to consume AI credits for org:', organizationId);
  }

  return result;
}
