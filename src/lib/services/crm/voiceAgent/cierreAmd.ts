/**
 * Cierre de una llamada del agente cuando contestó una máquina o un fax.
 *
 * Una sola implementación para los dos sitios que reciben el veredicto de AMD:
 *  - `/api/voice/ai-agent/amd` (AMD ASÍNCRONO, el modo actual: ver `amd.ts`).
 *  - `/api/voice/twiml/ai-agent` (AMD síncrono: llamadas creadas antes del
 *    despliegue que aún traen `AnsweredBy` en la petición del TwiML).
 *
 * Carreras: el veredicto asíncrono puede llegar antes o después de la 2ª
 * pasada del TwiML y del `completed` del `statusCallback`. Por eso:
 *  - El cierre va con `.in('status', ESTADOS_VIVOS_VAC)` en el WHERE (misma
 *    guarda atómica que el TwiML y el `statusCallback`, incidente 2026-10-06):
 *    una fila ya cerrada no se toca, y la 2ª pasada del TwiML que llegue
 *    después ya no la encuentra viva y cuelga sin abrir el ConversationRelay.
 *  - La devolución de la reserva se RECLAMA en esa misma escritura
 *    (`credits_settled_at` con `.is(null)`), así que ni el `statusCallback` ni
 *    la conciliación del ws-server pueden devolverla o cobrarla dos veces.
 *
 * SOLO servidor, con la organización ya resuelta desde la fila persistida.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { cierrePorAmd } from './amd';
import { ESTADOS_VIVOS_VAC } from './callStatusMap';
import { reembolsarMinutosReservados } from './reservaCreditos';
import { updateCall } from '@/lib/services/crm/callManagementService';

export interface FilaVacParaAmd {
  id: string;
  organization_id: number;
  call_id: string | null;
  provider_call_sid: string | null;
  credits_reserved: number | null;
  credits_settled_at: string | null;
}

export type ResultadoCierreAmd =
  | { cerrada: true; status: 'voicemail' | 'no_answer'; outcome: string; reembolsado: number }
  | { cerrada: false; motivo: 'no_es_maquina' | 'ya_cerrada' };

export async function cerrarLlamadaPorAmd(
  supabase: SupabaseClient,
  vac: FilaVacParaAmd,
  answeredBy: string | null | undefined,
  callSid: string | null
): Promise<ResultadoCierreAmd> {
  const cierre = cierrePorAmd(answeredBy);
  if (!cierre) return { cerrada: false, motivo: 'no_es_maquina' };

  const ahora = new Date().toISOString();
  const base: Record<string, unknown> = {
    status: cierre.status,
    outcome: cierre.outcome,
    completed_at: ahora,
    locked_by: null,
    updated_at: ahora,
  };
  if (callSid && !vac.provider_call_sid) base.provider_call_sid = callSid;

  const reservado = vac.credits_reserved ?? 0;
  let reclamar = reservado > 0 && !vac.credits_settled_at;

  const cerrar = async (conReserva: boolean) => {
    const patch = conReserva ? { ...base, credits_reserved: 0, credits_settled_at: ahora } : base;
    let q = supabase
      .from('voice_agent_calls')
      .update(patch)
      .eq('id', vac.id)
      .eq('organization_id', vac.organization_id)
      .in('status', ESTADOS_VIVOS_VAC);
    if (conReserva) q = q.is('credits_settled_at', null);
    const { data, error } = await q.select('id');
    if (error) throw error;
    return Array.isArray(data) && data.length > 0;
  };

  let cerrada = await cerrar(reclamar);
  if (!cerrada && reclamar) {
    // Otro (el ws-server al colgar) concilió la reserva entre la lectura y
    // esta escritura: se cierra igual, sin tocar los créditos.
    reclamar = false;
    cerrada = await cerrar(false);
  }
  if (!cerrada) return { cerrada: false, motivo: 'ya_cerrada' };

  let reembolsado = 0;
  if (reclamar) {
    try {
      await reembolsarMinutosReservados(supabase, vac.organization_id, reservado);
      reembolsado = reservado;
    } catch (err) {
      // La reserva queda sin conciliar (reconciliable), no dada por devuelta.
      console.error('[AMD] no se pudo devolver la reserva; queda pendiente de conciliar:', err instanceof Error ? err.message : err, {
        org: vac.organization_id,
        vac: vac.id,
      });
      const { error: revertError } = await supabase
        .from('voice_agent_calls')
        .update({ credits_reserved: reservado, credits_settled_at: null })
        .eq('id', vac.id)
        .eq('organization_id', vac.organization_id);
      if (revertError) console.error('[AMD] no se pudo revertir la marca de conciliación:', revertError.message, { vac: vac.id });
    }
  }

  if (vac.call_id) {
    await updateCall(
      vac.call_id,
      vac.organization_id,
      { status: 'voicemail', answered_by: cierre.outcome === 'fax' ? 'fax' : 'machine', ended_at: ahora },
      supabase
    );
  }

  return { cerrada: true, status: cierre.status, outcome: cierre.outcome, reembolsado };
}
