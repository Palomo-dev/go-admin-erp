/**
 * Créditos de IA (legacy V3 + puente a F0).
 *
 * Punto único de cobro (CLAUDE.md): `chargeAiCredits` / `refundAiCredits` de
 * `crm/aiCostService.ts`. Lo que queda aquí:
 *   - `checkAICredits`: lectura del saldo con reset mensual (la usan el
 *     asistente y el chat antes de mostrar UI).
 *   - `ensureAiSettings`: auto-provisión de la fila `ai_settings` con el cupo
 *     del plan (extraída de `checkAICredits` en F0-REG r2 para que
 *     `chargeAiCredits` la reutilice: 27 orgs con CRM no tenían fila y recibían
 *     500 en vez de 402). Desde r3 cubre también la fila «vacía» creada desde
 *     el navegador (`credits_reset_at IS NULL`). UNA sola fuente: la RPC
 *     `fn_provision_ai_settings` (migración crm_v4_f00_43, atómica e
 *     idempotente). F0-pulido (qa r4 REG «para el 10» 1): el respaldo en Node
 *     (`ensureAiSettingsFallback`, `insert` + `update … is null`) se retiró
 *     porque la 43 está en producción (verificado por MCP el 2026-09-16:
 *     `fn_provision_ai_settings`, `fn_ai_plan_quota` y `fn_resolve_timezone`
 *     en `pg_proc`). Solo cubría «función ausente» (PGRST202/42883), nunca
 *     errores transitorios: un fallo de red en la RPC fallaba igual en las
 *     consultas del respaldo. Ahora RPC ausente o rota → `Error` → el
 *     llamador (`chargeAiCredits`) responde 402, nunca inventa saldo.
 *   - `getAIFeaturesForOrganization`: cupo del plan = `fn_ai_plan_quota`
 *     (la misma que usan el trigger de suscripciones y el cron mensual).
 *     Regla (QA r2 bajo 6, hoy solo en SQL): `custom_config.ai_credits` o
 *     `.aiCredits` si es numérico (incluido 0) → ese valor; si no,
 *     `plans.ai_credits_monthly`; sin suscripción → 0. El respaldo en Node
 *     (`planQuotaFallback`) también se retiró: RPC rota → cupo 0 y `error`
 *     (fail-closed, igual que hacía el respaldo cuando SU consulta fallaba).
 *   - `consumeAICredits`: débito sin costo en USD; `@deprecated`, solo para los
 *     llamadores V3 que aún no migraron a `withAiCharge`.
 *   - `withAICreditsCheck`: `@deprecated`; delega en `withAiCharge` (cobro
 *     ANTES del proveedor, reembolso en fallo, 402 tipado).
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { withAiCharge } from '@/lib/services/crm/aiCostService';

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

const DEFAULT_PLAN_MODEL = 'gpt-4o-mini'; // = default de plans.ai_model; solo si el plan no lo trae
const DEFAULT_PLAN_MAX_TOKENS = 1000;

const toInt = (v: unknown, fallback: number): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.round(n) : fallback;
};

/** Cupo «desconocido»: 0 créditos y defaults de modelo. Nunca se regala saldo. */
const NO_QUOTA: PlanAIFeatures = { aiCreditsMonthly: 0, aiCreditsMaxRollover: 0, aiModel: DEFAULT_PLAN_MODEL, aiMaxTokens: DEFAULT_PLAN_MAX_TOKENS };

/**
 * Obtiene las características de IA según el plan de la organización.
 * Fuente única: RPC `fn_ai_plan_quota` (mig. 43, en producción). Si la RPC
 * falla o devuelve algo sin `monthly` numérico → cupo 0 (`NO_QUOTA`) y
 * `console.error`: sin cupo conocido no se regala saldo. No hay respaldo en
 * Node (F0-pulido): la regla vive una sola vez, en SQL.
 */
async function getAIFeaturesForOrganization(organizationId: number, supabase: SupabaseClient = getSupabaseClient()): Promise<PlanAIFeatures> {
  const { data, error } = await supabase.rpc('fn_ai_plan_quota', { p_org: organizationId });
  if (error) {
    console.error('[aiCredits] fn_ai_plan_quota falló; cupo 0 (fail-closed):', error.message);
    return NO_QUOTA;
  }
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null | undefined;
  if (!row || typeof row !== 'object' || !Number.isFinite(Number(row.monthly))) {
    console.error('[aiCredits] fn_ai_plan_quota devolvió un valor sin `monthly` numérico; cupo 0 (fail-closed)', { organizationId });
    return NO_QUOTA;
  }
  return {
    aiCreditsMonthly: Math.max(0, toInt(row.monthly, 0)),
    aiCreditsMaxRollover: Math.max(0, toInt(row.max_rollover, 0)),
    aiModel: typeof row.model === 'string' && row.model ? row.model : DEFAULT_PLAN_MODEL,
    aiMaxTokens: toInt(row.max_tokens, DEFAULT_PLAN_MAX_TOKENS),
  };
}

export interface EnsuredAiSettings {
  /** Se insertó la fila en esta llamada. */
  created: boolean;
  /** Se asignó el cupo del plan en esta llamada (fila nueva o fila sin `credits_reset_at`). */
  provisioned: boolean;
  credits_remaining: number;
  aiModel: string;
  aiMaxTokens: number;
}

/**
 * Garantiza que la organización tenga fila `ai_settings` PROVISIONADA:
 *   - sin fila → se crea con el cupo mensual del plan;
 *   - fila con `credits_reset_at IS NULL` (la creó el navegador desde
 *     `/app/chat/ia/configuracion`, que solo puede escribir columnas de
 *     comportamiento: nace con 0 créditos) → se le asigna
 *     `greatest(saldo, cupo)` y `credits_reset_at = now()` (QA r2 medio 1);
 *   - fila ya provisionada → se devuelve tal cual.
 * Todo eso lo hace la RPC `fn_provision_ai_settings` (mig. 43, atómica e
 * idempotente, service role: la columna de saldo no es escribible por sesión
 * desde la migración crm_v4_f00_38). Devuelve el saldo resultante; el
 * llamador decide si alcanza.
 *
 * Fail-closed: RPC con error (incluida «función ausente») o respuesta sin
 * `credits_remaining` numérico → `Error`. Nunca se inventa un saldo ni se
 * cae a una segunda implementación (F0-pulido: el respaldo en Node se retiró
 * con la 43 en producción; ver cabecera).
 *
 * `client` es inyectable para tests y para que `aiCostService` reutilice su
 * propio cliente en la misma petición.
 */
export async function ensureAiSettings(organizationId: number, client?: SupabaseClient): Promise<EnsuredAiSettings> {
  const supabase = client ?? getSupabaseClient();
  const { data, error } = await supabase.rpc('fn_provision_ai_settings', { p_org: organizationId });
  if (error) throw new Error(`fn_provision_ai_settings: ${error.message}`);
  const row = data as Record<string, unknown> | null | undefined;
  if (!row || typeof row !== 'object' || !Number.isFinite(Number(row.credits_remaining))) {
    throw new Error('fn_provision_ai_settings: respuesta sin credits_remaining numérico');
  }
  return {
    created: row.created === true,
    provisioned: row.provisioned === true,
    credits_remaining: Math.max(0, toInt(row.credits_remaining, 0)),
    aiModel: typeof row.model === 'string' && row.model ? row.model : DEFAULT_PLAN_MODEL,
    aiMaxTokens: toInt(row.max_tokens, DEFAULT_PLAN_MAX_TOKENS),
  };
}

/**
 * Verifica si una organización tiene créditos de IA disponibles
 */
export async function checkAICredits(organizationId: number): Promise<AICheckResult> {
  const supabase = getSupabaseClient();

  const { data: settings, error: settingsError } = await supabase
    .from('ai_settings')
    .select('credits_remaining, credits_reset_at, purchased_credits')
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
    // Auto-provisión compartida con chargeAiCredits (F0-REG r2).
    const ensured = await ensureAiSettings(organizationId, supabase);
    return {
      allowed: ensured.credits_remaining > 0,
      creditsRemaining: ensured.credits_remaining,
      aiModel: aiFeatures.aiModel,
      aiMaxTokens: aiFeatures.aiMaxTokens,
    };
  }

  const lastReset = new Date(settings.credits_reset_at || 0);
  const now = new Date();
  const shouldReset = lastReset.getMonth() !== now.getMonth() ||
                     lastReset.getFullYear() !== now.getFullYear();

  if (shouldReset) {
    const purchasedCredits = settings.purchased_credits || 0;
    const totalRemaining = settings.credits_remaining || 0;
    const unusedMonthly = Math.max(0, totalRemaining - purchasedCredits);
    const rolloverCredits = Math.min(unusedMonthly, aiFeatures.aiCreditsMaxRollover);
    const newCredits = aiFeatures.aiCreditsMonthly + rolloverCredits + purchasedCredits;

    await supabase.from('ai_settings').update({
      credits_remaining: newCredits,
      credits_reset_at: now.toISOString(),
      last_rollover_amount: rolloverCredits,
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
 * Consume créditos de IA de forma ATÓMICA vía RPC `decrement_ai_credits`
 * (FOR UPDATE en ai_settings). Sustituye el read-modify-write anterior
 * (C-10, F0 §4.2).
 *
 * @deprecated Cobra DESPUÉS del proveedor y sin costo en USD. Usar
 * `withAiCharge` / `chargeAiCredits` de `crm/aiCostService.ts` (punto único
 * de cobro). Los llamadores V3 existentes están en la allow-list del
 * guardarraíl #18; ningún archivo nuevo debe importarla.
 */
export async function consumeAICredits(
  organizationId: number,
  amount: number = 1,
  options?: { actionType?: string; model?: string; userId?: string | null; metadata?: Record<string, unknown> }
): Promise<boolean> {
  // QA r1 alto 3: NaN llegaba al RPC como `p_cost: null` y dejaba la org ilimitada.
  if (!Number.isFinite(amount) || amount < 0) {
    throw new RangeError(`importe inválido de créditos de IA: ${String(amount)}`);
  }
  const credits = Math.round(amount);
  if (credits === 0) return true;

  try {
    const supabase = getSupabaseClient();

    const { data: decremented, error: rpcError } = await supabase.rpc('decrement_ai_credits', {
      p_org_id: organizationId,
      p_cost: credits,
    });

    if (rpcError) {
      console.error('❌ decrement_ai_credits error:', rpcError.message);
      return false;
    }
    if (!decremented) {
      console.warn('⚠️ Insufficient AI credits:', { organizationId, required: credits });
      return false;
    }

    try {
      const { data: after } = await supabase
        .from('ai_settings')
        .select('credits_remaining')
        .eq('organization_id', organizationId)
        .maybeSingle();
      const creditsAfter = after?.credits_remaining ?? null;
      await supabase.from('ai_usage_logs').insert({
        organization_id: organizationId,
        user_id: options?.userId ?? null,
        action_type: options?.actionType ?? 'generic',
        credits_consumed: credits,
        credits_before: creditsAfter != null ? creditsAfter + credits : null,
        credits_after: creditsAfter,
        model: options?.model ?? 'unknown',
        metadata: options?.metadata ?? {},
      });
    } catch (logErr) {
      console.warn('⚠️ Failed to log AI usage (non-critical):', logErr);
    }

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
 * Wrapper para funciones de IA con validación de créditos.
 *
 * @deprecated Delegar directamente en `withAiCharge` de `crm/aiCostService.ts`.
 * Se mantiene la firma `(orgId, estimatedCredits, fn)` para no tocar a los
 * llamadores V3 en esta ronda, pero por debajo ya es el punto único de cobro:
 * el RPC atómico se ejecuta ANTES del proveedor, si el proveedor falla se
 * reembolsa, y sin saldo lanza `InsufficientCreditsError` (402) en vez de un
 * `Error` genérico. Antes cobraba después y, si el RPC devolvía `false`, la
 * generación salía gratis (QA r1 alto 6).
 */
export async function withAICreditsCheck<T>(
  organizationId: number,
  estimatedCredits: number,
  fn: () => Promise<T>,
  options?: { actionType?: string; model?: string; userId?: string | null }
): Promise<T> {
  return withAiCharge(
    {
      orgId: organizationId,
      actionType: options?.actionType ?? 'generic',
      model: options?.model ?? 'unknown',
      units: Math.max(0, estimatedCredits) * 1000,
      credits: estimatedCredits,
      userId: options?.userId ?? null,
    },
    () => fn(),
  );
}
