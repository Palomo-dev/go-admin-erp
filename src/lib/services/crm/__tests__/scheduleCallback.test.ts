/**
 * `schedule_callback` durante la llamada (org 125, 2026-09-30): insertar otra
 * fila `pending` del mismo cliente mientras la llamada seguía `in_progress`
 * chocaba SIEMPRE con `voice_agent_calls_una_viva_por_cliente`. Ahora la hora
 * se guarda en la propia llamada (`callback_at`) y el trigger de la migración
 * 20260930240000 encola la devolución al cerrarse.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { scheduleCallback } from '../voiceAgentTools';

type Llamada = { tipo: 'update' | 'insert'; valores: Record<string, unknown>; filtros: [string, unknown][] };

function supabaseFalso(fila: Record<string, unknown> | null) {
  const llamadas: Llamada[] = [];
  const from = () => {
    const filtros: [string, unknown][] = [];
    let tipo: Llamada['tipo'] | null = null;
    let valores: Record<string, unknown> = {};
    const q: Record<string, unknown> = {
      select: () => q,
      eq: (c: string, v: unknown) => {
        filtros.push([c, v]);
        return q;
      },
      maybeSingle: async () => ({ data: fila, error: null }),
      single: async () => ({ data: { id: 'nueva', scheduled_at: valores.scheduled_at }, error: null }),
      update: (v: Record<string, unknown>) => {
        tipo = 'update';
        valores = v;
        llamadas.push({ tipo, valores, filtros });
        return q;
      },
      insert: (v: Record<string, unknown>) => {
        tipo = 'insert';
        valores = v;
        llamadas.push({ tipo, valores, filtros });
        return q;
      },
      then: (res: (x: { error: null }) => unknown) => res({ error: null }),
    };
    return q;
  };
  return { cliente: { from } as unknown as SupabaseClient, llamadas };
}

const base = { voice_agent_id: 'a', campaign_id: 'c', customer_id: 'cl', opportunity_id: null, stage_agent_id: null };
const manana = new Date(Date.now() + 24 * 3600_000).toISOString();

test('llamada en curso: guarda callback_at en la propia fila, sin insertar', async () => {
  const { cliente, llamadas } = supabaseFalso({ ...base, status: 'in_progress' });
  const r = await scheduleCallback(
    { orgId: 125, supabase: cliente, voiceAgentCallId: 'vac-1' },
    { when: manana, reason: 'el encargado llega después del mediodía' }
  );
  expect(r.success).toBe(true);
  expect(llamadas.filter((l) => l.tipo === 'insert')).toHaveLength(0);
  const upd = llamadas.find((l) => l.tipo === 'update')!;
  expect(upd.valores.callback_at).toBe(new Date(manana).toISOString());
  expect(upd.valores.outcome).toBe('callback: el encargado llega después del mediodía');
  expect(upd.filtros).toEqual(expect.arrayContaining([['id', 'vac-1'], ['organization_id', 125]]));
});

test('fila ya cerrada: inserta la pending como antes', async () => {
  const { cliente, llamadas } = supabaseFalso({ ...base, status: 'completed' });
  const r = await scheduleCallback({ orgId: 125, supabase: cliente, voiceAgentCallId: 'vac-1' }, { when: manana });
  expect(r.success).toBe(true);
  const ins = llamadas.find((l) => l.tipo === 'insert')!;
  expect(ins.valores).toMatchObject({ organization_id: 125, status: 'pending', customer_id: 'cl', outcome: 'callback' });
});

test('hora pasada o inválida: se rechaza sin tocar la base', async () => {
  const { cliente, llamadas } = supabaseFalso({ ...base, status: 'in_progress' });
  const ctx = { orgId: 125, supabase: cliente, voiceAgentCallId: 'vac-1' };
  expect((await scheduleCallback(ctx, { when: '2020-01-01T10:00:00-05:00' })).success).toBe(false);
  expect((await scheduleCallback(ctx, { when: 'mañana' })).success).toBe(false);
  expect(llamadas).toHaveLength(0);
});

// ─── Re-encolado de campañas (mismo día, mismo caso de org 125) ─────────────
import { clientesNoReencolables } from '../voiceAgentService';

describe('clientesNoReencolables', () => {
  const ahora = Date.parse('2026-09-30T17:00:00Z');
  const retry = { maxAttempts: 3, backoffMinutes: 60 };
  const fila = (customer_id: string, status: string, completed_at = '2026-09-30T12:00:00Z') => ({ customer_id, status, completed_at });

  test('lista manual: una llamada contestada no se vuelve a encolar', () => {
    expect(clientesNoReencolables([fila('a', 'completed', '2026-09-30T16:43:09Z')], 'manual_list', retry, ahora).has('a')).toBe(true);
  });

  test('no contestada: espera el backoff y respeta el máximo de intentos', () => {
    expect(clientesNoReencolables([fila('a', 'no_answer', '2026-09-30T16:30:00Z')], 'manual_list', retry, ahora).has('a')).toBe(true);
    expect(clientesNoReencolables([fila('a', 'no_answer')], 'manual_list', retry, ahora).has('a')).toBe(false);
    const tres = [fila('a', 'no_answer'), fila('a', 'voicemail'), fila('a', 'failed')];
    expect(clientesNoReencolables(tres, 'manual_list', retry, ahora).has('a')).toBe(true);
  });

  test('etapa del embudo: omitida no la saca; seguimiento vencido no filtra', () => {
    expect(clientesNoReencolables([fila('a', 'skipped')], 'pipeline_stage', retry, ahora).has('a')).toBe(false);
    expect(clientesNoReencolables([fila('a', 'completed')], 'pipeline_stage', retry, ahora).has('a')).toBe(true);
    expect(clientesNoReencolables([fila('a', 'completed')], 'followup_due', retry, ahora).size).toBe(0);
  });
});
