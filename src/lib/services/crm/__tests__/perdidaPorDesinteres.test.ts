/**
 * Oportunidad a «perdida» por desinterés definitivo en una llamada del agente
 * de voz (decisión del dueño, 2026-10-07).
 *
 * Solo se cierra si el objetivo es de venta, el pipeline es de ventas
 * (`pipeline_type = 'sales'`), hay oportunidad y está abierta. El cierre va
 * por `opportunityStageService.changeStage` (el mismo de `POST …/lose`) hacia
 * la etapa `is_lost` del pipeline, con la objeción como motivo.
 */

const changeStage = jest.fn();
jest.mock('@/lib/services/crm/opportunityStageService', () => ({
  changeStage: (...a: unknown[]) => changeStage(...a),
}));
jest.mock('@/lib/services/crm/reunionCorreo.server', () => ({ notificarReunion: jest.fn() }));

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ACCION_PERDIDA,
  marcarPerdidaPorDesinteres,
  objetivoEsVenta,
  type ContextoPerdida,
} from '@/lib/services/crm/voiceAgent/perdidaPorDesinteres';
import type { ObjecionRegistrada } from '@/lib/services/crm/voiceAgent/cierreLlamada';

interface Escritura {
  tabla: string;
  op: 'insert' | 'update';
  fila: Record<string, unknown>;
}

/** Supabase simulado: lecturas por tabla y registro de filtros y escrituras. */
function fakeSupabase(datos: { opp?: Record<string, unknown> | null; pipelineType?: string; etapaPerdida?: string | null }) {
  const escrituras: Escritura[] = [];
  const filtros: Array<[string, string, unknown]> = [];
  const from = (tabla: string) => {
    const b: Record<string, unknown> = {};
    const leer = async () => {
      if (tabla === 'opportunities') return { data: datos.opp ?? null, error: null };
      if (tabla === 'pipelines') return { data: { id: 'pipe-1', pipeline_type: datos.pipelineType ?? 'sales' }, error: null };
      if (tabla === 'stages') return { data: datos.etapaPerdida ? { id: datos.etapaPerdida } : null, error: null };
      return { data: null, error: null };
    };
    Object.assign(b, {
      select: () => b,
      eq: (col: string, val: unknown) => {
        filtros.push([tabla, col, val]);
        return b;
      },
      order: () => b,
      limit: () => b,
      maybeSingle: leer,
      single: async () => ({ data: { id: 'task-1', title: 't', status: 'open' }, error: null }),
      insert: (fila: Record<string, unknown>) => {
        escrituras.push({ tabla, op: 'insert', fila });
        const r = Promise.resolve({ error: null });
        return Object.assign(r, { select: () => b });
      },
      update: (fila: Record<string, unknown>) => {
        escrituras.push({ tabla, op: 'update', fila });
        return b;
      },
    });
    return b;
  };
  return { supabase: { from } as unknown as SupabaseClient, escrituras, filtros };
}

const OPP_ABIERTA = { id: 'opp-1', name: 'Demo GO Admin', pipeline_id: 'pipe-1', status: 'open', salesperson_id: 'u-1' };
const OBJECION: ObjecionRegistrada = { texto: 'No le interesa, su software propio le funciona', detalle: null, tipo: 'desinteres' };

function ctx(supabase: SupabaseClient, extra: Partial<ContextoPerdida> = {}): ContextoPerdida {
  return {
    orgId: 125,
    supabase,
    voiceAgentCallId: 'vac-1',
    customerId: 'c1',
    opportunityId: 'opp-1',
    agentId: 'agent-1',
    objetivo: 'book_meeting',
    politicaEtapa: null,
    ...extra,
  };
}

beforeEach(() => {
  changeStage.mockReset();
  changeStage.mockResolvedValue({ ok: true, opportunity: {}, stage: { id: 'st-lost', name: 'Perdida', is_won: false, is_lost: true }, gate: null, overridden: false });
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

describe('oportunidad perdida por desinterés definitivo', () => {
  test('venta + pipeline de ventas + abierta: changeStage a la etapa is_lost con la objeción como motivo', async () => {
    const { supabase, escrituras, filtros } = fakeSupabase({ opp: OPP_ABIERTA, pipelineType: 'sales', etapaPerdida: 'st-lost' });
    const r = await marcarPerdidaPorDesinteres(ctx(supabase), OBJECION);

    expect(r).toEqual({ aplicada: true, stageId: 'st-lost' });
    expect(changeStage).toHaveBeenCalledTimes(1);
    const [orgId, , params, cliente] = changeStage.mock.calls[0];
    expect(orgId).toBe(125);
    expect(cliente).toBe(supabase);
    expect(params).toMatchObject({
      opportunityId: 'opp-1',
      stageId: 'st-lost',
      lossData: { lossReasonLabel: 'Sin interés: No le interesa, su software propio le funciona' },
    });
    expect(params.override).toBeUndefined();
    // La organización filtra la oportunidad y el pipeline.
    expect(filtros).toEqual(expect.arrayContaining([
      ['opportunities', 'organization_id', 125],
      ['pipelines', 'organization_id', 125],
      ['stages', 'is_lost', true],
    ]));
    // Actividad en el timeline y traza de la ejecución.
    expect(escrituras).toEqual(expect.arrayContaining([
      expect.objectContaining({ tabla: 'activities', op: 'insert', fila: expect.objectContaining({ related_id: 'opp-1', outcome: 'opportunity_lost' }) }),
      expect.objectContaining({ tabla: 'voice_agent_tool_runs', op: 'insert', fila: expect.objectContaining({ tool: ACCION_PERDIDA, status: 'applied' }) }),
    ]));
  });

  test.each([
    ['sin oportunidad', { opportunityId: null }, {}, 'sin_oportunidad'],
    ['objetivo de cobranza', { objetivo: 'collect_payment' }, {}, 'objetivo_no_venta'],
    ['objetivo de encuesta', { objetivo: 'nps_survey' }, {}, 'objetivo_no_venta'],
    ['objetivo personalizado', { objetivo: 'custom' }, {}, 'objetivo_no_venta'],
    ['pipeline de onboarding', {}, { pipelineType: 'onboarding' }, 'pipeline_no_ventas'],
    ['pipeline de renovación', {}, { pipelineType: 'renewal' }, 'pipeline_no_ventas'],
    ['oportunidad ya ganada', {}, { opp: { ...OPP_ABIERTA, status: 'won' } }, 'ya_cerrada'],
    ['oportunidad de otra organización (no aparece)', {}, { opp: null }, 'no_encontrada'],
  ])('%s: no se toca la oportunidad', async (_n, extraCtx, extraDatos, motivo) => {
    const { supabase, escrituras } = fakeSupabase({ opp: OPP_ABIERTA, etapaPerdida: 'st-lost', ...extraDatos });
    const r = await marcarPerdidaPorDesinteres(ctx(supabase, extraCtx as Partial<ContextoPerdida>), OBJECION);
    expect(r).toEqual({ aplicada: false, motivo });
    expect(changeStage).not.toHaveBeenCalled();
    expect(escrituras.filter((e) => e.tabla === 'opportunities')).toEqual([]);
  });

  test('etapa con action_policy=suggest: no cierra, deja tarea al vendedor', async () => {
    const { supabase, escrituras } = fakeSupabase({ opp: OPP_ABIERTA, etapaPerdida: 'st-lost' });
    const r = await marcarPerdidaPorDesinteres(ctx(supabase, { politicaEtapa: 'suggest' }), OBJECION);
    expect(r).toMatchObject({ aplicada: false, motivo: 'politica_sugerir', tareaCreada: true });
    expect(changeStage).not.toHaveBeenCalled();
    expect(escrituras).toEqual(expect.arrayContaining([
      expect.objectContaining({ tabla: 'tasks', fila: expect.objectContaining({ related_to_id: 'opp-1', assigned_to: 'u-1' }) }),
    ]));
  });

  test('el gate de la etapa lo impide: no se fuerza (sin override), queda tarea', async () => {
    changeStage.mockResolvedValue({ ok: false, reason: 'gate', gate: { ok: false, missing: ['x'] }, stage: { id: 'st-lost', name: 'Perdida' } });
    const { supabase } = fakeSupabase({ opp: OPP_ABIERTA, etapaPerdida: 'st-lost' });
    const r = await marcarPerdidaPorDesinteres(ctx(supabase), OBJECION);
    expect(r).toMatchObject({ aplicada: false, motivo: 'no_aplicada', detalle: 'gate' });
  });

  test('pipeline sin etapa de pérdida: queda tarea, no se cierra', async () => {
    const { supabase } = fakeSupabase({ opp: OPP_ABIERTA, etapaPerdida: null });
    const r = await marcarPerdidaPorDesinteres(ctx(supabase), OBJECION);
    expect(r).toMatchObject({ aplicada: false, motivo: 'sin_etapa_perdida' });
    expect(changeStage).not.toHaveBeenCalled();
  });

  test('objetivos de venta', () => {
    for (const o of ['sell_product', 'book_meeting', 'qualify_lead', 'recover_cart', 'confirm_demo', 'follow_up_proposal', 'reactivate_cold']) {
      expect(objetivoEsVenta(o)).toBe(true);
    }
    for (const o of ['collect_payment', 'nps_survey', 'renewal_reminder', 'custom', null, '']) {
      expect(objetivoEsVenta(o)).toBe(false);
    }
  });
});
