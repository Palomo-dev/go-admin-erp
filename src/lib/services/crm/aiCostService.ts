/**
 * Cobro de créditos de IA y de comunicaciones (D6) — SOLO SERVIDOR.
 *
 * Punto único de cobro (CLAUDE.md): `chargeAiCredits` / `refundAiCredits`,
 * atómicos vía `decrement_ai_credits` / `refund_ai_credits`. El RPC se ejecuta
 * ANTES de llamar al proveedor; si el proveedor falla se reembolsa. El costo
 * real en USD se calcula desde `provider_pricing` (pricingService) y se
 * persiste en la COLUMNA `ai_usage_logs.cost_amount` /
 * `comm_usage_logs.cost_amount` (ambas existen en BD desde F0-DB); se sigue
 * escribiendo también `metadata.cost_amount` una ronda más por compatibilidad
 * del panel Créditos, que ya lee `coalesce(columna, metadata)`.
 *
 * Guardas de esta ronda (QA r1):
 *   - importe no finito o negativo → `RangeError` antes del RPC (nunca
 *     `p_cost: null`, que dejaba la organización ilimitada);
 *   - organización sin fila en `ai_settings` → `ensureAiSettings` con el cupo
 *     del plan y un reintento; sin cupo → 402, nunca 500;
 *   - presupuesto mensual (`provider_configs.llm.settings.monthly_budget_usd`,
 *     §8): si el gasto del mes más el estimado lo supera →
 *     `BudgetExceededError` (402, `code: 'budget_exceeded'`);
 *   - reembolso idempotente por `logId` (memoria + `ai_usage_logs`), y
 *     `p_previous` para que `refund_ai_credits` no recorte por debajo del
 *     saldo previo al cobro.
 *
 * RPCs verificados en BD (2026-09-15):
 *   decrement_ai_credits(p_org_id integer, p_cost integer) -> boolean (FOR UPDATE)
 *   refund_ai_credits(p_org_id integer, p_amount integer[, p_previous integer]) -> boolean
 *   deduct_comm_credits(p_org_id integer, p_channel text, p_amount integer) -> boolean
 *   fn_ai_usage_month(p_org, p_since, p_tz) -> jsonb (migración crm_v4_f00_39)
 *   fn_provision_ai_settings(p_org) -> jsonb (migración crm_v4_f00_43; la usa
 *     `ensureAiSettings`, con respaldo en Node mientras no esté aplicada)
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getUnitCost, round6 } from './pricingService';
import { getAiUsageMonth, monthStartInTz } from './aiUsageStatsService';
import { getOrgTimezoneServer } from './revenueOsService';

export class InsufficientCreditsError extends Error {
  status = 402;
  code: 'insufficient_credits' | 'budget_exceeded' = 'insufficient_credits';
  constructor(kind: 'ai' | 'comm', detail?: string) {
    super(kind === 'ai' ? `Créditos de IA insuficientes${detail ? ` (${detail})` : ''}` : `Créditos de comunicación insuficientes${detail ? ` (${detail})` : ''}`);
    this.name = 'InsufficientCreditsError';
  }
}

/**
 * Presupuesto mensual agotado (§8). Extiende `InsufficientCreditsError` a
 * propósito: los handlers de jobs (`transcribe`, `analyze`) ya mapean esa
 * clase a `JobFatalError` (no reintentable) y las rutas la devuelven como 402,
 * así que el bloqueo por presupuesto llega a todos los consumidores sin tocar
 * archivos de otras fases. El mensaje lleva `budget_exceeded` para que el
 * `last_error` del job lo diga.
 */
export class BudgetExceededError extends InsufficientCreditsError {
  constructor(public readonly spentUsd: number, public readonly budgetUsd: number) {
    super('ai', `budget_exceeded: ${round6(spentUsd)} de ${budgetUsd} USD del presupuesto mensual`);
    this.name = 'BudgetExceededError';
    this.code = 'budget_exceeded';
  }
}

let clientFactory: (() => SupabaseClient) | null = null;
/**
 * Inyección del cliente (tests). En runtime se usa el service client.
 * `null` además limpia el estado en memoria (dedupe de reembolsos), para que
 * cada test parta de cero.
 */
export function __setAiCostClientFactory(factory: (() => SupabaseClient) | null): void {
  clientFactory = factory;
  if (!factory) refundedLogIds.clear();
}
async function resolveClient(): Promise<SupabaseClient> {
  if (clientFactory) return clientFactory();
  const mod = await import('@/lib/supabase/server-service');
  return mod.getServiceClient();
}

/**
 * Importe de créditos válido: finito y no negativo. QA r1 alto 3: `NaN`
 * llegaba al RPC como `p_cost: null`, `v_remaining < NULL` no entraba en el
 * `RETURN false` y el UPDATE dejaba `credits_remaining = NULL` (ilimitado).
 * Un negativo por esta vía sería un abono disfrazado: también se rechaza.
 */
function assertValidCredits(value: number, what: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`importe inválido de ${what}: ${String(value)}`);
  }
  return Math.round(value);
}

export interface ChargeAiInput {
  orgId: number;
  /** p. ej. 'call_analysis', 'email_draft', 'transcription' */
  actionType: string;
  model: string;
  /** Cantidad en la unidad del sku (tokens, segundos, chars…) */
  units: number;
  /** sku de provider_pricing (p. ej. 'gpt_5_6_luna_in'); opcional si no hay precio. */
  unitSku?: string;
  /** provider de provider_pricing (default: inferido del sku/modelo → 'openai'). */
  provider?: string;
  /** Créditos a debitar. Default: max(1, ceil(units / 1000)). */
  credits?: number;
  userId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ChargeAiResult {
  credits: number;
  cost_amount: number | null;
  unit_cost_usd: number | null;
  logId: number | null;
  /** Saldo antes del cobro (null si no se pudo leer). Lo usa el reembolso. */
  previousBalance: number | null;
}

/** Créditos por defecto: 1 crédito por cada 1 000 unidades (tokens), mínimo 1. */
export function defaultCreditsForUnits(units: number): number {
  return Math.max(1, Math.ceil(Math.max(0, units) / 1000));
}

function inferProvider(model: string): string {
  const m = model.toLowerCase();
  if (m.startsWith('gemini')) return 'google';
  if (m.startsWith('scribe') || m.startsWith('eleven')) return 'elevenlabs';
  return 'openai';
}

/** Mensaje del RPC anterior a la migración 39 cuando la org no tiene fila. */
const MISSING_ROW_RE = /ai_settings no encontrada/i;

type DecrementOutcome =
  | { ok: true }
  | {
      ok: false;
      /** No hay fila en ai_settings. */
      missingRow: boolean;
      /**
       * Hay fila pero `credits_reset_at IS NULL`: la creó el navegador
       * (`/app/chat/ia/configuracion`, solo columnas de comportamiento) y nunca
       * recibió el cupo del plan. QA r2 medio 1.
       */
      unprovisioned: boolean;
    };

async function callDecrement(sb: SupabaseClient, orgId: number, credits: number): Promise<DecrementOutcome> {
  const { data: ok, error } = await sb.rpc('decrement_ai_credits', { p_org_id: orgId, p_cost: credits });
  if (error) {
    if (MISSING_ROW_RE.test(error.message ?? '')) return { ok: false, missingRow: true, unprovisioned: false };
    throw new Error(`decrement_ai_credits falló: ${error.message}`);
  }
  if (ok) return { ok: true };
  // Con la migración 39 el RPC devuelve false también sin fila: una sola
  // consulta para distinguir "sin saldo" de "sin fila" (QA r1 alto 4) y de
  // "fila sin provisionar" (QA r2 medio 1).
  const { data: row } = await sb
    .from('ai_settings')
    .select('organization_id, credits_reset_at')
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!row) return { ok: false, missingRow: true, unprovisioned: false };
  return { ok: false, missingRow: false, unprovisioned: (row as { credits_reset_at?: string | null }).credits_reset_at == null };
}

/**
 * Presupuesto mensual en USD de la categoría LLM (`settings.monthly_budget_usd`
 * del primer proveedor activo que lo tenga, por prioridad). Lee solo `settings`
 * (nunca `credentials`). `null` si no hay presupuesto o la lectura falla: un
 * fallo aquí no debe bloquear cobros legítimos. La usa también GET /credits
 * para que el panel y el bloqueo miren el mismo valor.
 */
export async function getMonthlyBudgetUsd(sb: SupabaseClient, orgId: number): Promise<number | null> {
  try {
    const { data } = await sb
      .from('provider_configs')
      .select('settings, priority')
      .eq('organization_id', orgId)
      .eq('category', 'llm')
      .eq('is_active', true)
      .order('priority', { ascending: true })
      .limit(20);
    for (const row of (data ?? []) as Array<{ settings: Record<string, unknown> | null }>) {
      const v = Number(row.settings?.monthly_budget_usd);
      if (Number.isFinite(v) && v > 0) return v;
    }
  } catch (err) {
    console.warn('[aiCost] No se pudo leer monthly_budget_usd:', err instanceof Error ? err.message : err);
  }
  return null;
}

/**
 * Bloqueo por presupuesto (§8): gasto del mes en la zona horaria de la org +
 * costo estimado de esta llamada > presupuesto → `BudgetExceededError`.
 * Solo consulta la BD cuando hay presupuesto configurado.
 */
async function assertWithinBudget(sb: SupabaseClient, orgId: number, estimatedUsd: number): Promise<void> {
  const budget = await getMonthlyBudgetUsd(sb, orgId);
  if (budget == null) return;
  const tz = await getOrgTimezoneServer(orgId, sb);
  const usage = await getAiUsageMonth(sb, orgId, monthStartInTz(tz), tz);
  if (usage.spent_usd + Math.max(0, estimatedUsd) > budget) {
    throw new BudgetExceededError(usage.spent_usd, budget);
  }
}

/**
 * Debita créditos de IA de forma atómica y registra `ai_usage_logs`.
 * Lanza `InsufficientCreditsError` (402) si no alcanza, `BudgetExceededError`
 * (402) si el presupuesto mensual está agotado y `RangeError` si el importe es
 * inválido. NO llama al proveedor.
 */
export async function chargeAiCredits(input: ChargeAiInput): Promise<ChargeAiResult> {
  assertValidCredits(input.units, 'unidades');
  const credits = assertValidCredits(input.credits ?? defaultCreditsForUnits(input.units), 'créditos de IA');
  const sb = await resolveClient();
  const provider = input.provider ?? inferProvider(input.model);

  // Precio unitario antes del cobro: hace falta para el presupuesto y se reutiliza en el log.
  let unitCost: number | null = null;
  let costAmount: number | null = null;
  if (input.unitSku) {
    unitCost = await getUnitCost(provider, input.unitSku);
    if (unitCost != null) costAmount = round6(unitCost * input.units);
  }

  await assertWithinBudget(sb, input.orgId, costAmount ?? 0);

  let outcome = await callDecrement(sb, input.orgId, credits);
  if (!outcome.ok && (outcome.missingRow || outcome.unprovisioned)) {
    // Auto-provisión con el cupo del plan (una sola fuente: RPC
    // `fn_provision_ai_settings`, mig. 43, con respaldo en Node en
    // `ensureAiSettings`) y un único reintento. Cubre la fila ausente y la
    // fila «vacía» creada desde el navegador (credits_reset_at NULL). Si
    // tampoco así hay saldo: 402, no 500.
    try {
      const { ensureAiSettings } = await import('@/lib/services/aiCreditsService');
      const ensured = await ensureAiSettings(input.orgId, sb);
      outcome = ensured.credits_remaining > 0 ? await callDecrement(sb, input.orgId, credits) : { ok: false, missingRow: false, unprovisioned: false };
    } catch (err) {
      console.warn('[aiCost] No se pudo auto-provisionar ai_settings:', err instanceof Error ? err.message : err);
      throw new InsufficientCreditsError('ai', 'la organización no tiene configuración de IA');
    }
    if (!outcome.ok && outcome.missingRow) throw new InsufficientCreditsError('ai', 'la organización no tiene configuración de IA');
  }
  if (!outcome.ok) throw new InsufficientCreditsError('ai');

  // Saldo tras el cobro (best-effort): alimenta credits_before/after del log y
  // el p_previous del reembolso. No es atómico con el RPC; un desfase por
  // concurrencia solo afecta al techo del reembolso, nunca al saldo.
  let creditsAfter: number | null = null;
  try {
    const { data: after } = await sb.from('ai_settings').select('credits_remaining').eq('organization_id', input.orgId).maybeSingle();
    const v = after?.credits_remaining;
    creditsAfter = typeof v === 'number' && Number.isFinite(v) ? v : null;
  } catch {
    /* best-effort */
  }
  const previousBalance = creditsAfter == null ? null : creditsAfter + credits;

  let logId: number | null = null;
  try {
    const { data: log } = await sb
      .from('ai_usage_logs')
      .insert({
        organization_id: input.orgId,
        user_id: input.userId ?? null,
        action_type: input.actionType,
        model: input.model,
        total_tokens: Math.round(input.units),
        credits_consumed: credits,
        credits_before: previousBalance,
        credits_after: creditsAfter,
        cost_amount: costAmount,
        metadata: {
          ...(input.metadata ?? {}),
          provider,
          unit_sku: input.unitSku ?? null,
          units: input.units,
          unit_cost_usd: unitCost,
          cost_amount: costAmount,
          cost_currency: 'USD',
        },
      })
      .select('id')
      .single();
    logId = (log?.id as number) ?? null;
  } catch (err) {
    console.warn('[aiCost] No se pudo registrar ai_usage_logs:', err instanceof Error ? err.message : err);
  }

  return { credits, cost_amount: costAmount, unit_cost_usd: unitCost, logId, previousBalance };
}

/**
 * Reembolsos ya aplicados en este proceso, por `org:logId`. Un reintento del
 * job tras un timeout de red llega normalmente a la misma instancia; la BD
 * cubre el resto (`alreadyRefunded`). Acotado para no crecer sin límite.
 */
const refundedLogIds = new Set<string>();
const REFUNDED_MEMORY_MAX = 2000;
function rememberRefund(key: string): void {
  if (refundedLogIds.size >= REFUNDED_MEMORY_MAX) {
    const first = refundedLogIds.values().next().value;
    if (first !== undefined) refundedLogIds.delete(first);
  }
  refundedLogIds.add(key);
}

/** ¿Ya existe una fila `:refund` para este `logId` en la BD? */
async function alreadyRefunded(sb: SupabaseClient, orgId: number, actionType: string, logId: number): Promise<boolean> {
  try {
    const { data } = await sb
      .from('ai_usage_logs')
      .select('id')
      .eq('organization_id', orgId)
      .eq('action_type', `${actionType}:refund`)
      .eq('metadata->>refunded_log_id', String(logId))
      .limit(1)
      .maybeSingle();
    return !!(data && (data as { id?: unknown }).id != null);
  } catch {
    return false; // ante la duda se reembolsa (ver nota en refundAiCredits)
  }
}

/**
 * Reembolsa créditos de IA (fallo del proveedor tras el débito).
 *
 * Usa la RPC dedicada `refund_ai_credits(p_org_id, p_amount[, p_previous])`
 * (DB r3, mig. 18-19; `p_previous` desde crm_v4_f00_39): bloquea la fila con
 * FOR UPDATE y suma acotando al cupo del plan sin recortar por debajo del saldo
 * previo al cobro. Registra un log con credits_consumed negativo y action_type
 * '<tipo>:refund'.
 *
 * Idempotente por `logId` (QA r1 medio 10): si ya se reembolsó ese cobro (en
 * memoria o con fila `:refund` en BD) devuelve `true` sin abonar. Si la
 * consulta de dedupe falla, se reembolsa igualmente: la deuda con la org pesa
 * más que un posible doble abono, que además queda trazado en los logs.
 */
export async function refundAiCredits(input: {
  orgId: number;
  credits: number;
  actionType: string;
  model?: string;
  reason?: string;
  logId?: number | null;
  /** Saldo antes del cobro; permite a la RPC no recortar por debajo de él. */
  previousBalance?: number | null;
}): Promise<boolean> {
  // QA r2 bajo 4: simetría con el cobro. Un negativo o NaN por aquí no es
  // «nada que reembolsar», es un error del llamador: RangeError, no `true`.
  // (Antes: negativo → 0 → `true` silencioso.) La RPC de la 39 devuelve
  // `false` con NULL/negativo por la misma razón.
  const credits = assertValidCredits(input.credits, 'créditos de IA a reembolsar');
  if (credits === 0) return true;
  const sb = await resolveClient();

  const dedupeKey = input.logId != null ? `${input.orgId}:${input.logId}` : null;
  if (dedupeKey) {
    if (refundedLogIds.has(dedupeKey)) return true;
    if (await alreadyRefunded(sb, input.orgId, input.actionType, input.logId as number)) {
      rememberRefund(dedupeKey);
      return true;
    }
  }

  const args: Record<string, number> = { p_org_id: input.orgId, p_amount: credits };
  if (typeof input.previousBalance === 'number' && Number.isFinite(input.previousBalance)) args.p_previous = input.previousBalance;
  const { data: ok, error } = await sb.rpc('refund_ai_credits', args);
  if (error || !ok) {
    console.error('[aiCost] Reembolso falló:', error?.message ?? 'rpc devolvió false');
    return false;
  }
  if (dedupeKey) rememberRefund(dedupeKey);
  try {
    await sb.from('ai_usage_logs').insert({
      organization_id: input.orgId,
      action_type: `${input.actionType}:refund`,
      model: input.model ?? 'n/a',
      credits_consumed: -credits,
      cost_amount: 0,
      metadata: { reason: input.reason ?? 'provider_error', refunded_log_id: input.logId ?? null, cost_amount: 0 },
    });
  } catch {
    /* no crítico */
  }
  return true;
}

/**
 * Patrón cobro → proveedor → reembolso en fallo.
 *
 * `refundAiCredits` devuelve `false` en vez de lanzar (a propósito: si lanzara
 * aquí, enmascararía el error original del proveedor, que es la información que
 * el llamador necesita). Pero ignorar ese booleano era una pérdida silenciosa de
 * créditos: la organización pagaba, el proveedor fallaba y el reembolso podía
 * rechazarse sin que nadie se enterara. Detectado por el tester de F4 (ronda 3,
 * fallo N1) en el camino gemelo de `transcriptionService`; aquí afecta a F7
 * (`crm/email/aiDraftService.ts`), el otro usuario de esta función.
 *
 * Se comprueba el resultado y, si el reembolso no se aplicó, queda registrado de
 * forma visible antes de volver a lanzar el error original intacto.
 */
export async function withAiCharge<T>(input: ChargeAiInput, fn: (charge: ChargeAiResult) => Promise<T>): Promise<T> {
  const charge = await chargeAiCredits(input);
  try {
    return await fn(charge);
  } catch (err) {
    const reason = err instanceof Error ? err.message.slice(0, 200) : 'provider_error';
    const refunded = await refundAiCredits({
      orgId: input.orgId,
      credits: charge.credits,
      actionType: input.actionType,
      model: input.model,
      reason,
      logId: charge.logId,
      previousBalance: charge.previousBalance,
    });
    if (!refunded) await recordFailedRefund(input, charge, reason);
    throw err;
  }
}

/**
 * Deja rastro de un reembolso que NO se aplicó: sin esto, la única señal era una
 * línea de consola que nadie lee. La fila lleva `credits_consumed: 0` porque no
 * hubo movimiento de saldo; la deuda viva va en `pending_refund_credits`.
 * Mismo formato que usa F4, para que ambas deudas se consulten con una sola query.
 */
async function recordFailedRefund(input: ChargeAiInput, charge: ChargeAiResult, reason: string): Promise<void> {
  console.error(
    `[aiCost] Reembolso NO aplicado: org=${input.orgId} accion=${input.actionType} creditos=${charge.credits}`,
  );
  try {
    const sb = await resolveClient();
    await sb.from('ai_usage_logs').insert({
      organization_id: input.orgId,
      user_id: input.userId ?? null,
      action_type: `${input.actionType}:refund_failed`,
      model: input.model,
      credits_consumed: 0,
      cost_amount: 0,
      metadata: {
        stage: 'with_ai_charge',
        pending_refund_credits: charge.credits,
        reason,
        refunded_log_id: charge.logId ?? null,
        cost_amount: 0,
      },
    });
  } catch (err) {
    // El registro es best-effort; la consola ya dejó constancia de la deuda.
    console.error('[aiCost] Tampoco se pudo registrar el reembolso fallido:', err instanceof Error ? err.message : err);
  }
}

export type CommChannel = 'sms' | 'whatsapp' | 'voice';

export interface ChargeCommInput {
  orgId: number;
  channel: CommChannel;
  /** Créditos (SMS/WA: mensajes; voice: minutos). Default 1. */
  amount?: number;
  recipient: string;
  module?: string;
  direction?: 'outbound' | 'inbound';
  /** provider/sku de provider_pricing para el costo real. */
  provider?: string;
  unitSku?: string;
  units?: number;
  twilioMessageSid?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ChargeCommResult {
  amount: number;
  cost_amount: number | null;
  logId: string | null;
}

/**
 * Debita créditos de comunicación (RPC atómico) y registra `comm_usage_logs`.
 * `deduct_comm_credits` devuelve true también cuando la org es ilimitada (NULL).
 */
export async function chargeCommCredits(input: ChargeCommInput): Promise<ChargeCommResult> {
  const amount = Math.max(1, assertValidCredits(input.amount ?? 1, 'créditos de comunicación'));
  if (input.units != null) assertValidCredits(input.units, 'unidades');
  const sb = await resolveClient();

  const { data: ok, error } = await sb.rpc('deduct_comm_credits', {
    p_org_id: input.orgId,
    p_channel: input.channel,
    p_amount: amount,
  });
  if (error) throw new Error(`deduct_comm_credits falló: ${error.message}`);
  if (!ok) throw new InsufficientCreditsError('comm', input.channel);

  let costAmount: number | null = null;
  if (input.unitSku) {
    const unit = await getUnitCost(input.provider ?? 'twilio', input.unitSku);
    if (unit != null) costAmount = round6(unit * (input.units ?? amount));
  }

  let logId: string | null = null;
  try {
    const { data: log } = await sb
      .from('comm_usage_logs')
      .insert({
        organization_id: input.orgId,
        channel: input.channel,
        credits_used: amount,
        twilio_message_sid: input.twilioMessageSid ?? null,
        recipient: input.recipient,
        status: 'charged',
        direction: input.direction ?? 'outbound',
        module: input.module ?? 'crm',
        cost_amount: costAmount,
        metadata: {
          ...(input.metadata ?? {}),
          provider: input.provider ?? 'twilio',
          unit_sku: input.unitSku ?? null,
          units: input.units ?? amount,
          cost_amount: costAmount,
          cost_currency: 'USD',
        },
      })
      .select('id')
      .single();
    logId = (log?.id as string) ?? null;
  } catch (err) {
    console.warn('[aiCost] No se pudo registrar comm_usage_logs:', err instanceof Error ? err.message : err);
  }

  return { amount, cost_amount: costAmount, logId };
}
