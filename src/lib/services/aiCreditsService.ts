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
 *     el navegador (`credits_reset_at IS NULL`) y delega en la RPC única
 *     `fn_provision_ai_settings` (migración crm_v4_f00_43); el código de aquí
 *     es el respaldo mientras la 43 no esté aplicada.
 *   - `getAIFeaturesForOrganization`: cupo del plan. Con la 43 aplicada lo
 *     responde `fn_ai_plan_quota` (la misma que usan el trigger de
 *     suscripciones y el cron mensual); sin ella, la regla equivalente en Node.
 *     Regla consolidada (QA r2 bajo 6): `custom_config.ai_credits` o
 *     `.aiCredits` si es numérico (incluido 0) → ese valor; si no,
 *     `plans.ai_credits_monthly`; sin suscripción → 0 (antes Node daba 10 000
 *     a una org sin suscripción o con dos suscripciones: `.single()` fallaba).
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

/** PostgREST: la función no existe todavía (migración 43 sin aplicar). */
function isMissingFunction(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === 'PGRST202' || error.code === '42883') return true;
  return /could not find the function|function .* does not exist/i.test(error.message ?? '');
}

const toInt = (v: unknown, fallback: number): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.round(n) : fallback;
};

/** `custom_config.ai_credits` o `.aiCredits` como entero no negativo, o null. */
function customConfigCredits(cc: unknown): number | null {
  if (!cc || typeof cc !== 'object') return null;
  const rec = cc as Record<string, unknown>;
  for (const key of ['ai_credits', 'aiCredits']) {
    const raw = rec[key];
    if (raw === undefined || raw === null || raw === '') continue;
    const txt = String(raw).trim();
    if (/^[0-9]{1,9}$/.test(txt)) return Number(txt);
  }
  return null;
}

interface SubscriptionQuotaRow {
  plan_id: number | null;
  status: string | null;
  metadata: { custom_config?: unknown } | null;
  created_at: string | null;
  plans: { ai_credits_monthly?: number | null; ai_credits_max_rollover?: number | null; ai_model?: string | null; ai_max_tokens?: number | null } | null;
}

/**
 * Cupo del plan en Node — respaldo de `fn_ai_plan_quota` (mig. 43) con la
 * MISMA regla. Una sola consulta (suscripción + plan embebido); si la org
 * tiene varias suscripciones se toma la activa/en prueba más reciente.
 */
async function planQuotaFallback(organizationId: number, supabase: SupabaseClient): Promise<PlanAIFeatures> {
  const none: PlanAIFeatures = { aiCreditsMonthly: 0, aiCreditsMaxRollover: 0, aiModel: DEFAULT_PLAN_MODEL, aiMaxTokens: DEFAULT_PLAN_MAX_TOKENS };
  const { data, error } = await supabase
    .from('subscriptions')
    .select('plan_id, status, metadata, created_at, plans:plan_id(ai_credits_monthly, ai_credits_max_rollover, ai_model, ai_max_tokens)')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(5);
  if (error) {
    // Sin cupo conocido no se regala saldo: 0 (antes: 10 000 por defecto).
    console.error('[aiCredits] No se pudo leer la suscripción:', error.message);
    return none;
  }
  const rows = (data ?? []) as unknown as SubscriptionQuotaRow[];
  const sub = rows.find((r) => r.status === 'active' || r.status === 'trialing') ?? rows[0];
  if (!sub) return none;
  // PostgREST devuelve la relación como objeto (FK única) aunque el tipo diga array.
  const plan = (Array.isArray(sub.plans) ? sub.plans[0] : sub.plans) as SubscriptionQuotaRow['plans'];
  const custom = customConfigCredits(sub.metadata?.custom_config);
  const monthly = custom ?? Math.max(0, toInt(plan?.ai_credits_monthly, 0));
  return {
    aiCreditsMonthly: monthly,
    aiCreditsMaxRollover: custom != null ? Math.min(custom * 2, 100_000) : Math.max(0, toInt(plan?.ai_credits_max_rollover, 0)),
    aiModel: plan?.ai_model || DEFAULT_PLAN_MODEL,
    aiMaxTokens: toInt(plan?.ai_max_tokens, DEFAULT_PLAN_MAX_TOKENS),
  };
}

/**
 * Obtiene las características de IA según el plan de la organización.
 * Fuente única: RPC `fn_ai_plan_quota` (mig. 43). Mientras no exista, la
 * regla equivalente en Node (`planQuotaFallback`).
 */
async function getAIFeaturesForOrganization(organizationId: number, supabase: SupabaseClient = getSupabaseClient()): Promise<PlanAIFeatures> {
  const { data, error } = await supabase.rpc('fn_ai_plan_quota', { p_org: organizationId });
  if (!error) {
    const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null | undefined;
    if (row && typeof row === 'object' && Number.isFinite(Number(row.monthly))) {
      return {
        aiCreditsMonthly: Math.max(0, toInt(row.monthly, 0)),
        aiCreditsMaxRollover: Math.max(0, toInt(row.max_rollover, 0)),
        aiModel: typeof row.model === 'string' && row.model ? row.model : DEFAULT_PLAN_MODEL,
        aiMaxTokens: toInt(row.max_tokens, DEFAULT_PLAN_MAX_TOKENS),
      };
    }
  } else if (!isMissingFunction(error)) {
    console.error('[aiCredits] fn_ai_plan_quota falló:', error.message);
  }
  return planQuotaFallback(organizationId, supabase);
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

interface AiSettingsRow {
  credits_remaining: number | null;
  credits_reset_at: string | null;
  model: string | null;
  max_tokens: number | null;
}

function toEnsured(row: AiSettingsRow | null | undefined, flags: { created: boolean; provisioned: boolean }): EnsuredAiSettings {
  return {
    ...flags,
    credits_remaining: Math.max(0, toInt(row?.credits_remaining, 0)),
    aiModel: row?.model ?? DEFAULT_PLAN_MODEL,
    aiMaxTokens: toInt(row?.max_tokens, DEFAULT_PLAN_MAX_TOKENS),
  };
}

/**
 * Garantiza que la organización tenga fila `ai_settings` PROVISIONADA:
 *   - sin fila → se crea con el cupo mensual del plan;
 *   - fila con `credits_reset_at IS NULL` (la creó el navegador desde
 *     `/app/chat/ia/configuracion`, que solo puede escribir columnas de
 *     comportamiento: nace con 0 créditos) → se le asigna
 *     `greatest(saldo, cupo)` y `credits_reset_at = now()` (QA r2 medio 1);
 *   - fila ya provisionada → se devuelve tal cual.
 * Usa service role (la columna de saldo no es escribible por sesión desde la
 * migración crm_v4_f00_38). Devuelve el saldo resultante; el llamador decide
 * si alcanza. Si la lectura falla, lanza: no se inventa un saldo.
 *
 * Fuente única: RPC `fn_provision_ai_settings` (mig. 43, atómica e
 * idempotente). Mientras no esté aplicada, el respaldo en Node hace lo mismo
 * con `insert` (23505 → releer) y `update … is('credits_reset_at', null)`
 * (0 filas → releer): dos peticiones concurrentes no provisionan dos veces.
 *
 * `client` es inyectable para tests y para que `aiCostService` reutilice su
 * propio cliente en la misma petición.
 */
export async function ensureAiSettings(organizationId: number, client?: SupabaseClient): Promise<EnsuredAiSettings> {
  const supabase = client ?? getSupabaseClient();
  const viaRpc = await provisionViaRpc(organizationId, supabase);
  if (viaRpc) return viaRpc;
  return ensureAiSettingsFallback(organizationId, supabase, 0);
}

async function provisionViaRpc(organizationId: number, supabase: SupabaseClient): Promise<EnsuredAiSettings | null> {
  const { data, error } = await supabase.rpc('fn_provision_ai_settings', { p_org: organizationId });
  if (error) {
    if (isMissingFunction(error)) return null; // migración 43 sin aplicar → respaldo en Node
    throw new Error(`fn_provision_ai_settings: ${error.message}`);
  }
  const row = data as Record<string, unknown> | null | undefined;
  if (!row || typeof row !== 'object' || !Number.isFinite(Number(row.credits_remaining))) return null;
  return toEnsured(
    { credits_remaining: toInt(row.credits_remaining, 0), credits_reset_at: null, model: typeof row.model === 'string' ? row.model : null, max_tokens: toInt(row.max_tokens, DEFAULT_PLAN_MAX_TOKENS) },
    { created: row.created === true, provisioned: row.provisioned === true },
  );
}

async function ensureAiSettingsFallback(organizationId: number, supabase: SupabaseClient, attempt: number): Promise<EnsuredAiSettings> {
  const { data: existing, error } = await supabase
    .from('ai_settings')
    .select('credits_remaining, credits_reset_at, model, max_tokens')
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (error) throw new Error(`ai_settings: ${error.message}`);
  const row = existing as AiSettingsRow | null;

  if (row && row.credits_reset_at != null) {
    return toEnsured(row, { created: false, provisioned: false });
  }

  const aiFeatures = await getAIFeaturesForOrganization(organizationId, supabase);
  const initialCredits = Math.max(0, Math.round(aiFeatures.aiCreditsMonthly || 0));
  const now = new Date().toISOString();

  if (!row) {
    const { error: insertError } = await supabase.from('ai_settings').insert({
      organization_id: organizationId,
      credits_remaining: initialCredits,
      credits_reset_at: now,
      provider: 'openai',
      model: aiFeatures.aiModel,
      max_tokens: aiFeatures.aiMaxTokens,
      is_active: true,
    });
    if (insertError) {
      // Carrera benigna: otra petición creó la fila entre el select y el insert.
      if (insertError.code === '23505' && attempt < 2) return ensureAiSettingsFallback(organizationId, supabase, attempt + 1);
      throw new Error(`ai_settings insert: ${insertError.message}`);
    }
    return { created: true, provisioned: true, credits_remaining: initialCredits, aiModel: aiFeatures.aiModel, aiMaxTokens: aiFeatures.aiMaxTokens };
  }

  // Fila sin provisionar: el filtro `is('credits_reset_at', null)` hace la
  // escritura idempotente frente a dos peticiones concurrentes.
  const { data: updated, error: updateError } = await supabase
    .from('ai_settings')
    .update({
      credits_remaining: Math.max(Math.max(0, toInt(row.credits_remaining, 0)), initialCredits),
      credits_reset_at: now,
      updated_at: now,
    })
    .eq('organization_id', organizationId)
    .is('credits_reset_at', null)
    .select('credits_remaining, credits_reset_at, model, max_tokens')
    .maybeSingle();
  if (updateError) throw new Error(`ai_settings provision: ${updateError.message}`);
  if (updated) return toEnsured(updated as AiSettingsRow, { created: false, provisioned: true });
  // 0 filas: otra petición la provisionó entre el select y el update → releer.
  if (attempt < 2) return ensureAiSettingsFallback(organizationId, supabase, attempt + 1);
  throw new Error('ai_settings: no se pudo provisionar la fila');
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
