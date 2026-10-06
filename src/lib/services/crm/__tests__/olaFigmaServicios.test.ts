/**
 * CRM «Figma a código» — lógica pura de los servicios nuevos: formato único
 * del filtro de segmentos, conteo, «hoy» de la campaña de voz, sugerencia de
 * herramientas de la prueba del agente, campañas unificadas, pronóstico por
 * categorías, duplicados excluidos, decisión compartida del motor de
 * automatizaciones y territorios.
 */
jest.mock('svix', () => ({ Webhook: class {} }));

import { filtroDentroDeLimites, filtroParaGuardar, normalizarFiltroSegmento, MAX_GRUPOS } from '../segmentosFiltroLogica';
import { normalizarConteo } from '../segmentosConteoService';
import { idsParaHoy, normalizarHoy, rpcInexistente, MAX_FILAS_HOY } from '../voiceCampaignDetailService';
import { sugerirHerramienta } from '../voiceAgentTestService';
import { filtrarCampanas, proyectarCampana, type CampanaUnificadaRaw } from '../campaignsUnificadasLogica';
import { calcularPronostico, categoriaPronostico, moverTrimestre, trimestreDelDia, type ForecastSnapshot } from '../forecastLogica';
import { sinParejasExcluidas, type GrupoDuplicados } from '../customerMergeLogica';
import { motivoParaNoAplicar, reglaCoincideConEvento } from '../automationService';
import { destinoDelEvento } from '../automation/automationReplay';
import { emptyRuleContext } from '../automation/ruleContext';
import { mejorTerritorio, territoriosQueCoinciden } from '../assignmentService';
import { acumularConteos } from '../territoryCountsService';
import { FAILURE_STREAK_TO_STOP } from '../voiceAgentService';

describe('filtro de segmentos (un solo formato)', () => {
  const regla = { field: 'city', operator: 'equals', value: 'Cali' };
  it('lista → un grupo; {grupos} tal cual; formato viejo con OR → un grupo por regla', () => {
    expect(normalizarFiltroSegmento([regla])).toEqual({ grupos: [[regla]] });
    expect(normalizarFiltroSegmento({ grupos: [[regla], []] })).toEqual({ grupos: [[regla]] });
    expect(normalizarFiltroSegmento({ rules: [regla, regla], operator: 'OR' })).toEqual({ grupos: [[regla], [regla]] });
    expect(normalizarFiltroSegmento({ rules: [regla], groups: [{ rules: [regla] }], operator: 'AND' })).toEqual({ grupos: [[regla, regla]] });
    expect(normalizarFiltroSegmento(null)).toEqual({ grupos: [] });
  });
  it('lo irreconocible es null (falla cerrado, nunca «todos»)', () => {
    expect(normalizarFiltroSegmento('todos')).toBeNull();
    expect(normalizarFiltroSegmento({ otra: 1 })).toBeNull();
    expect(normalizarFiltroSegmento([{ campo: 'x' }])).toBeNull();
  });
  it('un grupo se guarda como lista (compatible); varios, como {grupos}; límites', () => {
    expect(filtroParaGuardar([[regla], []])).toEqual([regla]);
    expect(filtroParaGuardar([[regla], [regla]])).toEqual({ grupos: [[regla], [regla]] });
    expect(filtroDentroDeLimites({ grupos: Array.from({ length: MAX_GRUPOS + 1 }, () => [regla]) })).toBe(false);
  });
  it('conteo normalizado sin NaN', () => {
    expect(normalizarConteo({ base: '10', coinciden: 'x', desglose: { telefono: 2, estimado: true, sobre: 400 } })).toMatchObject({ base: 10, coinciden: 0, desglose: { telefono: 2, correo: 0, estimado: true, sobre: 400 } });
  });
});

describe('«hoy» de la campaña de voz', () => {
  it('ids sin repetir y con tope; RPC inexistente reconocida', () => {
    expect(idsParaHoy([{ id: 'a' }], [{ id: 'a' }, { id: 'b' }])).toEqual(['a', 'b']);
    expect(idsParaHoy([], Array.from({ length: MAX_FILAS_HOY + 5 }, (_, i) => ({ id: String(i) })))).toHaveLength(MAX_FILAS_HOY);
    expect(rpcInexistente({ code: 'PGRST202' })).toBe(true);
    expect(rpcInexistente({ code: '42501' })).toBe(false);
  });
  it('normaliza cupos y filas; el tope de fallos es el del despachador', () => {
    const h = normalizarHoy({ cupos: { dia: '3', tope_dia: 40 }, filas: { x: { estado: 'no_answer', ley2300: true } } });
    expect(h?.cupos).toMatchObject({ dia: 3, tope_dia: 40, tope_fallos: FAILURE_STREAK_TO_STOP });
    expect(h?.filas.x).toMatchObject({ estado: 'no_answer', ley2300: true, no_volver_a_llamar: false });
    expect(normalizarHoy(null)).toBeNull();
  });
});

describe('prueba del agente: las herramientas solo se sugieren', () => {
  it('permitida → suggested; no permitida o argumentos rotos → denied', () => {
    expect(sugerirHerramienta({ id: '1', name: 'schedule_meeting', arguments: '{"dia":"lunes"}' }, ['schedule_meeting'])).toEqual({ id: '1', name: 'schedule_meeting', args: { dia: 'lunes' }, status: 'suggested' });
    expect(sugerirHerramienta({ id: '2', name: 'send_email', arguments: '{}' }, ['schedule_meeting']).status).toBe('denied');
    expect(sugerirHerramienta({ id: '3', name: 'schedule_meeting', arguments: '[1]' }, ['schedule_meeting']).status).toBe('denied');
  });
});

describe('campañas unificadas', () => {
  const voz: CampanaUnificadaRaw = { id: 'v', name: 'Reactivación', source: 'voice', channel: 'voice', status: 'running', created_at: '2026-10-05', scheduled_at: null, stats: null, segment_name: 'Leads', content_name: 'Ana', emergency_stop: false, stopped_reason: null, voice_counts: { completed: 2, transferred: 1, skipped: 1, queued: 6 } };
  const msg: CampanaUnificadaRaw = { id: 'm', name: 'Boletín', source: 'message', channel: 'email', status: 'scheduled', created_at: '2026-10-01', scheduled_at: null, stats: { state: 'paused', total_contacts: 4, counts: { sent: 1, failed: 1, skipped: 0, delivered: 1, read: 0, replied: 0 } } as never, segment_name: '', content_name: null, emergency_stop: null, stopped_reason: null, voice_counts: null };
  it('progreso de voz con terminales + transferidas + omitidas; mensajes con el estado efectivo (pausa en stats)', () => {
    expect(proyectarCampana(voz).progress).toEqual({ done: 4, total: 10, pct: 40 });
    expect(proyectarCampana(voz).result).toMatchObject({ completed: 3 });
    const m = proyectarCampana(msg);
    expect(m.status).toBe('paused');
    expect(m.progress).toEqual({ done: 2, total: 4, pct: 50 });
    expect(m.segmentName).toBeNull();
  });
  it('filtra por canal y búsqueda (nombre o segmento) y cuenta por canal', () => {
    const filas = [proyectarCampana(voz), proyectarCampana(msg)];
    expect(filtrarCampanas(filas, { channel: 'messages', q: '', page: 1 }).rows.map((r) => r.id)).toEqual(['m']);
    expect(filtrarCampanas(filas, { channel: 'all', q: 'leads', page: 1 })).toMatchObject({ total: 1, porCanal: { all: 1, voice: 1, messages: 0 } });
  });
});

describe('pronóstico por categorías', () => {
  it('trimestres', () => {
    expect(trimestreDelDia('2026-10-06')).toBe('2026-Q4');
    expect(moverTrimestre('2026-Q4', 1)).toBe('2027-Q1');
    expect(moverTrimestre('2026-Q1', -1)).toBe('2025-Q4');
  });
  it('categoría elegida o sugerida por la probabilidad de la etapa', () => {
    expect(categoriaPronostico({ forecast_category: 'omitted', probability: 90 })).toBe('omitted');
    expect(categoriaPronostico({ forecast_category: null, probability: 70 })).toBe('commit');
    expect(categoriaPronostico({ forecast_category: null, probability: 30 })).toBe('best_case');
    expect(categoriaPronostico({ forecast_category: null, probability: 10 })).toBe('pipeline');
  });
  it('compromiso con ajuste, moneda sin tasa fuera del total y cobertura', () => {
    const op = (id: string, amount: number, currency: string, probability: number, extra = {}) => ({ id, name: id, salesperson_id: 'u', amount, currency, status: 'open', expected_close_date: '2026-10-10', closed_at: null, updated_at: null, forecast_category: null, probability, is_won: false, is_lost: false, stage_name: 'x', ...extra });
    const s: ForecastSnapshot = {
      period: '2026-Q4', start: '', end: '', date: '2026-10-06', timezone: 'America/Bogota', base: 'COP',
      users: [], targets: [{ id: 't', user_id: 'u', period: 'quarterly', target_amount: 100, target_currency: 'COP' }], teamQuotas: [],
      opportunities: [op('a', 40, 'COP', 80), op('b', 30, 'COP', 30), op('c', 5, 'USD', 80), op('d', 10, 'COP', 100, { status: 'won', is_won: true })],
      rates: [], adjustments: [{ id: 'j', user_id: 'u', amount_before: 50, amount_after: 60, currency: 'COP', reason_code: 'upside', reason_text: 'x', adjusted_by: 'u', created_at: '', reverses_id: null }],
      snapshotToken: 't', canViewAll: true, canAdjust: true, canEditAny: true, currentUser: 'u',
    };
    const { rows, summary } = calcularPronostico(s);
    const fila = rows.find((r) => r.userId === 'u')!;
    // 10 ganado + 40 compromiso + ajuste 10; los 5 USD no tienen tasa.
    expect(fila.commit.total).toBe(60);
    expect(fila.commit.sinTasa.map((g) => g.moneda)).toEqual(['USD']);
    expect(fila.coverage).toBeNull();
    expect(fila.bestCase.total).toBe(90);
    expect(summary.quota.total).toBe(100);
  });
});

describe('duplicados', () => {
  it('quita solo las parejas de dos excluidas (en cualquier orden)', () => {
    const g = (ids: string[]): GrupoDuplicados => ({ identity_type: 'email', identity_value: ids.join(), customers: ids.map((id) => ({ id }) as never) });
    expect(sinParejasExcluidas([g(['a', 'b']), g(['c', 'd']), g(['a', 'b', 'e'])], [{ customer_a: 'b', customer_b: 'a' }]).map((x) => x.identity_value)).toEqual(['c,d', 'a,b,e']);
  });
});

describe('motor de automatizaciones: una sola decisión para ejecutar y simular', () => {
  const regla = { event: 'opportunity.stage_changed', trigger_config: {}, pipeline_id: null, stage_id: 's2' };
  it('evento y ámbito', () => {
    expect(reglaCoincideConEvento(regla, 'stage_change', 'opportunity.stage_changed', { to_stage_id: 's2' })).toBe(true);
    expect(reglaCoincideConEvento(regla, 'stage_change', 'opportunity.won', { to_stage_id: 's2' })).toBe(false);
    expect(reglaCoincideConEvento(regla, 'stage_change', 'opportunity.stage_changed', { to_stage_id: 's3' })).toBe(false);
  });
  it('condiciones → run_once → cooldown, en ese orden', async () => {
    const ctx = emptyRuleContext(1);
    const base = { conditions: null, run_once_per_opportunity: true, cooldown_hours: 0 };
    expect((await motivoParaNoAplicar(base, ctx, 'o', new Date(), async () => true)).motivo).toBe('run_once_per_opportunity');
    expect((await motivoParaNoAplicar(base, ctx, null, new Date(), async () => true)).motivo).toBeNull();
    const desde: (string | undefined)[] = [];
    const r = await motivoParaNoAplicar({ ...base, run_once_per_opportunity: false, cooldown_hours: 2 }, ctx, 'o', new Date('2026-10-06T12:00:00Z'), async (d) => (desde.push(d), true));
    expect(r.motivo).toBe('cooldown');
    expect(desde).toEqual(['2026-10-06T10:00:00.000Z']);
  });
  it('destino del evento: oportunidad o cliente, de la entidad o del payload', () => {
    expect(destinoDelEvento({ entity_type: 'opportunity', entity_id: 'o', payload: { customer_id: 'c' } })).toEqual({ opportunityId: 'o', customerId: 'c' });
    expect(destinoDelEvento({ entity_type: 'call', entity_id: 'x', payload: null })).toEqual({ opportunityId: null, customerId: null });
  });
});

describe('territorios: el mismo motor para asignar y contar', () => {
  const territorios = [
    { id: 'ant', name: 'Antioquia', criteria: { rules: [{ field_key: 'customers.city', operator: 'eq' as const, value: 'Medellín', is_required: true }], assigned_user_id: 'u1' } },
    { id: 'todo', name: 'Grandes', criteria: { rules: [{ field_key: 'customers.branches_count', operator: 'gte' as const, value: 5, is_required: true }] } },
    { id: 'vacio', name: 'Sin reglas', criteria: null },
  ];
  it('coincidencias y ganador', () => {
    expect(territoriosQueCoinciden(1, territorios, { city: 'Medellín', branches_count: 8 }).map((t) => t.id)).toEqual(['ant', 'todo']);
    expect(mejorTerritorio(1, territorios, { city: 'Cali', branches_count: 1 })).toBeNull();
    expect(mejorTerritorio(1, territorios, { city: 'Medellín', branches_count: 1 })?.assigned_user_id).toBe('u1');
  });
  it('conteos con solapados y sin territorio', () => {
    const acc = new Map<string, { clientes: number; solapados: number }>();
    const sin = acumularConteos(1, territorios, [{ city: 'Medellín', branches_count: 8 }, { city: 'Medellín', branches_count: 0 }, { city: 'Cali', branches_count: 0 }], acc);
    expect(sin).toBe(1);
    expect(acc.get('ant')).toEqual({ clientes: 2, solapados: 1 });
    expect(acc.get('todo')).toEqual({ clientes: 1, solapados: 1 });
  });
});
