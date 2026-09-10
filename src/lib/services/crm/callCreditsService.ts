/**
 * Créditos y costo de llamadas (FASE-03 §8, D6). SOLO servidor.
 *
 * - Reserva: `deduct_comm_credits(org,'voice',1)` ANTES de marcar (twiml/outbound).
 * - Liquidación (dial-complete): minutos = ceil(duration/60); si > 1 debita la
 *   diferencia; `comm_usage_logs` (channel 'voice', credits_used = minutos,
 *   metadata {call_id, cost_usd, cost_breakdown, sku}); `calls.cost_amount/cost_currency`.
 * - Precios reales desde `provider_pricing` vía `fn_unit_cost('twilio', sku)`.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type VoiceSku = 'voice_out_co_mobile' | 'voice_out_co_landline' | 'voice_in_local_co';

/** Colombia: móvil = +573xx; fijo = +571 / +57[2-8]; fuera de CO → tarifa móvil CO como estimación. */
export function classifyDestinationSku(e164: string, direction: 'inbound' | 'outbound' = 'outbound'): VoiceSku {
  if (direction === 'inbound') return 'voice_in_local_co';
  const n = String(e164 || '').replace(/[^\d+]/g, '');
  if (/^\+573\d{9}$/.test(n)) return 'voice_out_co_mobile';
  if (/^\+57[1-8]\d{7}$/.test(n) || /^\+5760\d{7}$/.test(n)) return 'voice_out_co_landline';
  return 'voice_out_co_mobile';
}

export function billableMinutes(durationSeconds: number | null | undefined): number {
  const s = Number(durationSeconds);
  if (!Number.isFinite(s) || s <= 0) return 0;
  return Math.ceil(s / 60);
}

export interface SettlementInput {
  durationSeconds: number | null | undefined;
  reservedMinutes: number;
  mode: 'browser' | 'bridge' | 'ai_agent' | 'manual' | 'inbound';
  recordingEnabled: boolean;
  unitCosts: { pstn: number | null; sdk: number | null; recording: number | null };
  /**
   * Patas PSTN facturables (F5 §8). Un bridge móvil son DOS llamadas reales
   * (vendedor + cliente), así que el coste PSTN se paga dos veces; por defecto
   * se deduce del modo (`bridge` → 2, resto → 1).
   */
  legs?: number;
}

export interface Settlement {
  minutes: number;
  /** Minutos adicionales a debitar (puede ser 0). */
  extraMinutes: number;
  costUsd: number;
  breakdown: { pstn: number; sdk: number; recording: number };
}

/** Cálculo puro de la liquidación (testeable). */
export function defaultLegsForMode(mode: SettlementInput['mode']): number {
  return mode === 'bridge' ? 2 : 1;
}

export function computeSettlement(input: SettlementInput): Settlement {
  const minutes = billableMinutes(input.durationSeconds);
  const legs = Math.max(1, Math.round(input.legs ?? defaultLegsForMode(input.mode)));
  const pstn = round6((input.unitCosts.pstn ?? 0) * minutes * legs);
  const sdk = input.mode === 'browser' || input.mode === 'inbound' ? round6((input.unitCosts.sdk ?? 0) * minutes) : 0;
  const recording = input.recordingEnabled ? round6((input.unitCosts.recording ?? 0) * minutes) : 0;
  return {
    minutes,
    extraMinutes: Math.max(0, minutes - input.reservedMinutes),
    costUsd: round6(pstn + sdk + recording),
    breakdown: { pstn, sdk, recording },
  };
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/** Reserva `minutes` de voz. `true` si hay saldo (o la org es ilimitada). */
export async function reserveVoiceMinutes(orgId: number, minutes: number, client: SupabaseClient): Promise<boolean> {
  const { data, error } = await client.rpc('deduct_comm_credits', {
    p_org_id: orgId,
    p_channel: 'voice',
    p_amount: Math.max(1, Math.round(minutes)),
  });
  if (error) {
    console.error('[callCredits] deduct_comm_credits error:', error.message);
    return false;
  }
  return Boolean(data);
}

/**
 * Devuelve `minutes` de voz a la organización (F5 §8).
 *
 * `deduct_comm_credits` ya acepta importes negativos y acota el abono al cupo
 * del plan (verificado en `pg_proc` el 2026-09-10), así que NO hace falta la
 * RPC `refund_comm_credits` que planteaba el documento.
 */
export async function refundVoiceMinutes(orgId: number, minutes: number, client: SupabaseClient): Promise<boolean> {
  const amount = Math.round(minutes);
  if (!Number.isFinite(amount) || amount <= 0) return true;
  const { data, error } = await client.rpc('deduct_comm_credits', {
    p_org_id: orgId,
    p_channel: 'voice',
    p_amount: -amount,
  });
  if (error) {
    console.error('[callCredits] refund deduct_comm_credits error:', error.message);
    return false;
  }
  return Boolean(data);
}

async function unitCost(client: SupabaseClient, sku: string): Promise<number | null> {
  const { data, error } = await client.rpc('fn_unit_cost', { p_provider: 'twilio', p_sku: sku });
  if (error || data === null || data === undefined) return null;
  const n = Number(data);
  return Number.isFinite(n) ? n : null;
}

export interface CallForSettlement {
  id: string;
  organization_id: number;
  direction: 'inbound' | 'outbound';
  mode: SettlementInput['mode'];
  to_number: string;
  from_number: string;
  duration_seconds: number | null;
  recording_enabled: boolean;
  metadata: Record<string, unknown>;
}

/**
 * Liquida una llamada terminada: debita minutos extra, registra `comm_usage_logs`
 * y actualiza `calls.cost_amount`. Idempotente por `metadata.settled_at`.
 *
 * `opts.reconcile` (ronda 2): permite RE-liquidar una llamada ya liquidada
 * cuando el desenlace final trae más minutos de los cobrados (p. ej. el buzón
 * se liquidó con 0 y luego llegó el cierre con la duración real, o
 * `dial-complete` corrige la duración del status callback). Solo cobra la
 * diferencia: los minutos ya cobrados actúan como "reserva". Nunca devuelve
 * créditos automáticamente (no hay RPC de abono): si la nueva duración es
 * menor, deja constancia en `metadata.settlement_overcharge_min` y ajusta
 * `cost_amount`.
 */
export async function settleVoiceCall(
  call: CallForSettlement,
  client: SupabaseClient,
  opts?: { reconcile?: boolean }
): Promise<Settlement | null> {
  const alreadySettled = Boolean(call.metadata?.settled_at);
  if (alreadySettled && !opts?.reconcile) return null;
  const chargedMinutes = alreadySettled ? Number(call.metadata?.credits_final_min ?? 0) || 0 : 0;
  if (alreadySettled && billableMinutes(call.duration_seconds) === chargedMinutes) return null;
  const sku = classifyDestinationSku(call.direction === 'inbound' ? call.from_number : call.to_number, call.direction);
  const [pstn, sdk, recording] = await Promise.all([
    unitCost(client, sku),
    unitCost(client, 'voice_sdk_client'),
    unitCost(client, 'recording'),
  ]);
  // En una reconciliación los minutos YA cobrados hacen de reserva: solo se
  // debita (y se registra) la diferencia.
  const reserved = alreadySettled ? chargedMinutes : Number(call.metadata?.credits_reserved_min ?? 0) || 0;
  const s = computeSettlement({
    durationSeconds: call.duration_seconds,
    reservedMinutes: reserved,
    mode: call.mode,
    recordingEnabled: call.recording_enabled,
    unitCosts: { pstn, sdk, recording },
  });

  let overrun = false;
  if (s.extraMinutes > 0) {
    const ok = await reserveVoiceMinutes(call.organization_id, s.extraMinutes, client);
    if (!ok) overrun = true; // nunca se corta una llamada por créditos; se marca
  }

  const loggedMinutes = alreadySettled ? s.minutes - chargedMinutes : s.minutes;
  if (loggedMinutes > 0) {
    const { error } = await client.from('comm_usage_logs').insert({
      organization_id: call.organization_id,
      channel: 'voice',
      credits_used: loggedMinutes,
      twilio_message_sid: null,
      recipient: call.direction === 'inbound' ? call.from_number : call.to_number,
      status: 'charged',
      direction: call.direction,
      module: 'crm_voice',
      metadata: {
        call_id: call.id,
        cost_usd: s.costUsd,
        cost_amount: s.costUsd,
        cost_currency: 'USD',
        cost_breakdown: s.breakdown,
        sku,
        provider: 'twilio',
        units: loggedMinutes,
        credits_overrun: overrun,
        ...(alreadySettled ? { adjustment_of: chargedMinutes, reason: 'settlement_reconcile' } : {}),
      },
    });
    if (error) console.warn('[callCredits] comm_usage_logs insert:', error.message);
  }

  const meta = {
    ...(call.metadata ?? {}),
    settled_at: new Date().toISOString(),
    credits_final_min: s.minutes,
    cost_breakdown: s.breakdown,
    sku,
    ...(overrun ? { credits_overrun: true } : {}),
    ...(alreadySettled
      ? {
          settlement_reconciled_at: new Date().toISOString(),
          settlement_previous_min: chargedMinutes,
          ...(s.minutes < chargedMinutes ? { settlement_overcharge_min: chargedMinutes - s.minutes } : {}),
        }
      : {}),
  };
  await client
    .from('calls')
    .update({ cost_amount: s.costUsd, cost_currency: 'USD', metadata: meta })
    .eq('id', call.id)
    .eq('organization_id', call.organization_id);

  return s;
}
