/**
 * Prueba en seco RETROACTIVA de una regla (Figma CRM 1379:776): «¿qué habría
 * hecho esta regla en los últimos 30 días?». Repite los eventos capturados en
 * `crm_events` contra la regla con la MISMA decisión que el motor
 * (`reglaCoincideConEvento` + `motivoParaNoAplicar`): nunca ejecuta acciones
 * ni escribe `automation_runs`.
 *
 * Honestidad del resultado:
 *  - Las condiciones se evalúan con los datos ACTUALES de cada oportunidad o
 *    cliente (no hay foto histórica): `base_datos = 'actuales'`.
 *  - `run_once` y `cooldown` cuentan las ejecuciones reales ANTERIORES a la
 *    ventana más las simuladas dentro de ella.
 *  - Tope de `MAX_EVENTOS` eventos y `MAX_REGISTROS` registros distintos por
 *    consulta: si se llega, `truncado = true` y la pantalla lo dice.
 *
 * Todas las lecturas van con la sesión del usuario (RLS) y filtran por
 * organización. SOLO servidor.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  motivoParaNoAplicar,
  planDeAcciones,
  reglaCoincideConEvento,
  type AutomationRule,
} from '../automationService';
import { triggerTypeForEvent } from './automationEngine';
import { loadRuleContext, type RuleContext } from './ruleContext';

export const DIAS_REPLAY = 30;
export const MAX_EVENTOS = 1000;
export const MAX_REGISTROS = 300;
export const MAX_MUESTRA = 50;
const LOTE = 250;

interface EventoHistorico {
  id: string;
  event_type: string;
  entity_type: string;
  entity_id: string;
  payload: Record<string, unknown> | null;
  created_at: string;
}

export interface FilaReplay {
  event_id: string;
  event_type: string;
  occurred_at: string;
  opportunity_id: string | null;
  customer_id: string | null;
  nombre: string;
  matched: boolean;
  skip_reason: string | null;
}

export interface ReplayAutomatizacion {
  desde: string;
  hasta: string;
  base_datos: 'actuales';
  regla_activa: boolean;
  evaluados: number;
  aplicaria: number;
  omitidos: number;
  no_disponibles: number;
  /** Motivo → cuántos eventos se omitirían por él. */
  motivos: Record<string, number>;
  truncado: boolean;
  plan: ReturnType<typeof planDeAcciones>;
  muestra: FilaReplay[];
}

/** Oportunidad y cliente a los que apunta un evento (misma lectura que `evaluateRulesForEvent`). */
export function destinoDelEvento(e: Pick<EventoHistorico, 'entity_type' | 'entity_id' | 'payload'>): { opportunityId: string | null; customerId: string | null } {
  const p = e.payload ?? {};
  return {
    opportunityId: e.entity_type === 'opportunity' ? e.entity_id : typeof p.opportunity_id === 'string' ? p.opportunity_id : null,
    customerId: e.entity_type === 'customer' ? e.entity_id : typeof p.customer_id === 'string' ? p.customer_id : null,
  };
}

export async function repetirAutomatizacion(ruleId: string, orgId: number, db: SupabaseClient, ahora = new Date()): Promise<ReplayAutomatizacion> {
  const { data, error } = await db.from('automation_rules').select('*').eq('organization_id', orgId).eq('id', ruleId).maybeSingle();
  if (error) throw new Error(`automation_rules: ${error.message}`);
  if (!data) throw new Error('Regla de automatización no encontrada');
  const regla = data as AutomationRule;

  const hasta = ahora.toISOString();
  const desde = new Date(ahora.getTime() - DIAS_REPLAY * 86_400_000).toISOString();
  const r: ReplayAutomatizacion = {
    desde, hasta, base_datos: 'actuales', regla_activa: regla.is_active === true,
    evaluados: 0, aplicaria: 0, omitidos: 0, no_disponibles: 0, motivos: {}, truncado: false,
    plan: planDeAcciones(regla), muestra: [],
  };
  const contextos = new Map<string, RuleContext>();
  const simuladas = new Map<string, string>();

  const haCorrido = (opportunityId: string) => async (desdeIso?: string) => {
    const simulada = simuladas.get(opportunityId);
    if (simulada && (!desdeIso || simulada >= desdeIso)) return true;
    let q = db.from('automation_runs').select('id').eq('organization_id', orgId).eq('automation_rule_id', ruleId)
      .eq('opportunity_id', opportunityId).in('status', ['running', 'completed']).lt('created_at', desde).limit(1);
    if (desdeIso) q = q.gte('created_at', desdeIso);
    const { data: runs, error: e } = await q;
    if (e) throw new Error(`automation_runs: ${e.message}`);
    return (runs ?? []).length > 0;
  };

  let leidos = 0;
  for (let offset = 0; offset < MAX_EVENTOS; offset += LOTE) {
    let q = db.from('crm_events').select('id,event_type,entity_type,entity_id,payload,created_at')
      .eq('organization_id', orgId).gte('created_at', desde).lte('created_at', hasta);
    if (regla.event) q = q.eq('event_type', regla.event);
    const { data: eventos, error: e } = await q.order('created_at', { ascending: true }).order('id', { ascending: true }).range(offset, offset + LOTE - 1);
    if (e) throw new Error(`crm_events: ${e.message}`);
    const lote = (eventos ?? []) as EventoHistorico[];
    leidos += lote.length;

    for (const ev of lote) {
      const tipo = triggerTypeForEvent(ev.event_type);
      if (tipo !== regla.trigger_type) continue;
      const payload = { ...(ev.payload ?? {}), event_type: ev.event_type };
      if (!reglaCoincideConEvento(regla, tipo, ev.event_type, payload)) continue;
      const { opportunityId, customerId } = destinoDelEvento(ev);
      if (!opportunityId && !customerId) continue;

      const clave = opportunityId ? `o:${opportunityId}` : `c:${customerId}`;
      let base = contextos.get(clave);
      if (!base) {
        if (contextos.size >= MAX_REGISTROS) {
          r.truncado = true;
          continue;
        }
        base = await loadRuleContext({ orgId, opportunityId, customerId }, db);
        contextos.set(clave, base);
      }
      r.evaluados++;
      const momento = new Date(ev.created_at);
      const disponible = opportunityId ? !!base.opportunity : !!base.customer;
      let motivo: string | null = 'record_unavailable';
      if (disponible) {
        const ctx: RuleContext = { ...base, now: momento, event: { event_type: ev.event_type, payload } };
        motivo = (await motivoParaNoAplicar(regla, ctx, opportunityId, momento, opportunityId ? haCorrido(opportunityId) : async () => false)).motivo;
      }
      if (!disponible) r.no_disponibles++;
      if (motivo) {
        r.omitidos++;
        r.motivos[motivo] = (r.motivos[motivo] ?? 0) + 1;
      } else {
        r.aplicaria++;
        if (opportunityId) simuladas.set(opportunityId, ev.created_at);
      }
      if (r.muestra.length < MAX_MUESTRA) {
        r.muestra.push({
          event_id: ev.id, event_type: ev.event_type, occurred_at: ev.created_at, opportunity_id: opportunityId, customer_id: customerId,
          nombre: String(base.opportunity?.name ?? base.customer?.full_name ?? ''), matched: !motivo, skip_reason: motivo,
        });
      }
    }
    if (lote.length < LOTE) return r;
  }
  if (leidos >= MAX_EVENTOS) r.truncado = true;
  return r;
}
