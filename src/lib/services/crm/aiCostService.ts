/**
 * Cobro de créditos de IA y de comunicaciones (D6) — SOLO SERVIDOR.
 *
 * Regla: el RPC atómico se ejecuta ANTES de llamar al proveedor. Si el
 * proveedor falla, se reembolsa con `refundAiCredits`. El costo real en USD
 * se calcula desde `provider_pricing` (pricingService) y se persiste en
 * `ai_usage_logs.metadata.cost_amount` / `comm_usage_logs.metadata.cost_amount`
 * (ver "Necesito de DB": columna `cost_amount numeric` en ambas tablas).
 *
 * RPCs verificados en BD (2026-09-08):
 *   decrement_ai_credits(p_org_id integer, p_cost integer) -> boolean (FOR UPDATE)
 *   deduct_comm_credits(p_org_id integer, p_channel text, p_amount integer) -> boolean
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getUnitCost, round6 } from './pricingService';

export class InsufficientCreditsError extends Error {
  status = 402;
  constructor(kind: 'ai' | 'comm', detail?: string) {
    super(kind === 'ai' ? 'Créditos de IA insuficientes' : `Créditos de comunicación insuficientes${detail ? ` (${detail})` : ''}`);
    this.name = 'InsufficientCreditsError';
  }
}

let clientFactory: (() => SupabaseClient) | null = null;
/** Inyección del cliente (tests). En runtime se usa el service client. */
export function __setAiCostClientFactory(factory: (() => SupabaseClient) | null): void {
  clientFactory = factory;
}
async function resolveClient(): Promise<SupabaseClient> {
  if (clientFactory) return clientFactory();
  const mod = await import('@/lib/supabase/server-service');
  return mod.getServiceClient();
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

/**
 * Debita créditos de IA de forma atómica y registra `ai_usage_logs`.
 * Lanza `InsufficientCreditsError` (402) si no alcanza. NO llama al proveedor.
 */
export async function chargeAiCredits(input: ChargeAiInput): Promise<ChargeAiResult> {
  const sb = await resolveClient();
  const credits = Math.max(0, Math.round(input.credits ?? defaultCreditsForUnits(input.units)));
  const provider = input.provider ?? inferProvider(input.model);

  const { data: ok, error } = await sb.rpc('decrement_ai_credits', { p_org_id: input.orgId, p_cost: credits });
  if (error) throw new Error(`decrement_ai_credits falló: ${error.message}`);
  if (!ok) throw new InsufficientCreditsError('ai');

  let unitCost: number | null = null;
  let costAmount: number | null = null;
  if (input.unitSku) {
    unitCost = await getUnitCost(provider, input.unitSku);
    if (unitCost != null) costAmount = round6(unitCost * input.units);
  }

  let logId: number | null = null;
  try {
    const { data: log } = await sb
      .from('ai_usage_logs')
      .insert({
        organization_id: input.orgId,
        user_id: input.userId ?? null,
        action_type: input.actionType,
        model: input.model,
        total_tokens: Number.isFinite(input.units) ? Math.round(input.units) : null,
        credits_consumed: credits,
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

  return { credits, cost_amount: costAmount, unit_cost_usd: unitCost, logId };
}

/**
 * Reembolsa créditos de IA (fallo del proveedor tras el débito).
 *
 * Usa la RPC dedicada `refund_ai_credits(p_org_id, p_amount)` (DB r3, mig. 18-19):
 * bloquea la fila con FOR UPDATE y suma acotando al cupo del plan. Antes se
 * llamaba a `decrement_ai_credits` con importe negativo, lo que funcionaba pero
 * dependía de un efecto lateral no declarado; la RPC dedicada expresa la
 * intención y permite auditar reembolsos por separado.
 * Registra un log con credits_consumed negativo y action_type '<tipo>:refund'.
 */
export async function refundAiCredits(input: {
  orgId: number;
  credits: number;
  actionType: string;
  model?: string;
  reason?: string;
  logId?: number | null;
}): Promise<boolean> {
  const credits = Math.max(0, Math.round(input.credits));
  if (credits === 0) return true;
  const sb = await resolveClient();
  const { data: ok, error } = await sb.rpc('refund_ai_credits', { p_org_id: input.orgId, p_amount: credits });
  if (error || !ok) {
    console.error('[aiCost] Reembolso falló:', error?.message ?? 'rpc devolvió false');
    return false;
  }
  try {
    await sb.from('ai_usage_logs').insert({
      organization_id: input.orgId,
      action_type: `${input.actionType}:refund`,
      model: input.model ?? 'n/a',
      credits_consumed: -credits,
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
  const sb = await resolveClient();
  const amount = Math.max(1, Math.round(input.amount ?? 1));

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
