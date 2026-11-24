import {
  FORM_INICIAL,
  configAudiencia,
  cuerpoCampana,
  FUENTES_NO_DISPONIBLES,
  NOMBRE_MAX,
  diasParaTerminar,
  entradaDesdeUrl,
  erroresPaso,
  formDesdeCampana,
  franjaSabado,
  horasHasta,
  minutosEstimados,
  politicaValida,
  primerPasoIncompleto,
  textoHorario,
  type FormAsistente,
} from '../asistenteVozLogica';
import { clasificarAudiencia, enmascararTelefono } from '@/lib/services/crm/campanaVozAudiencia';

const ctx = { politicaLista: true, bloqueosOrganizacion: 0 };
const lleno: FormAsistente = {
  ...FORM_INICIAL,
  name: 'Reactivación',
  goal: 'reuniones',
  stageId: 'st-1',
  agenteId: 'ag-1',
};

describe('asistente de campañas de voz · lógica', () => {
  it('cada paso exige lo suyo', () => {
    expect(erroresPaso('objetivo', FORM_INICIAL, ctx)).toEqual(['nombre', 'objetivo']);
    expect(erroresPaso('audiencia', FORM_INICIAL, ctx)).toEqual(['audiencia']);
    expect(erroresPaso('agente', FORM_INICIAL, ctx)).toEqual(['agente']);
    expect(erroresPaso('cumplimiento', lleno, { ...ctx, politicaLista: false })).toEqual(['politica']);
    expect(primerPasoIncompleto(lleno, ctx)).toBeNull();
    expect(primerPasoIncompleto({ ...lleno, agenteId: null }, ctx)).toBe('agente');
  });

  it('el horario no sale de la ventana legal ni acepta domingos', () => {
    expect(erroresPaso('horario', { ...lleno, dias: [0, 1] }, ctx)).toContain('dias');
    expect(erroresPaso('horario', { ...lleno, desde: 6 }, ctx)).toContain('franja');
    expect(erroresPaso('horario', { ...lleno, porHora: 300, porDia: 200 }, ctx)).toContain('porHora');
    expect(horasHasta(18)).toEqual([19]);
    expect(franjaSabado(9, 18)).toEqual({ desde: 9, hasta: 15 });
    expect(franjaSabado(16, 18)).toBeNull();
  });

  it('la audiencia arma el target_config del CHECK', () => {
    expect(configAudiencia({ fuente: 'pipeline_stage', stageId: 's', customerIds: [], stepId: null })).toEqual({ stage_id: 's' });
    expect(configAudiencia({ fuente: 'followup_due', stageId: null, customerIds: [], stepId: null })).toEqual({});
    expect(configAudiencia({ fuente: 'manual_list', stageId: null, customerIds: [], stepId: null })).toBeNull();
    expect(configAudiencia({ fuente: 'segment', stageId: null, customerIds: [], stepId: null })).toBeNull();
  });

  it('el cuerpo lleva el objetivo en target_config.goal y la franja en schedule', () => {
    const c = cuerpoCampana({ ...lleno, dias: [6, 1, 0] }, '2026-10-06T14:00:00.000Z');
    expect(c.target_config).toEqual({ stage_id: 'st-1', goal: 'reuniones' });
    expect(c.schedule).toEqual({ days: [1, 6], start_hour: 9, end_hour: 18, start_at: '2026-10-06T14:00:00.000Z' });
    expect(c.max_calls_per_day).toBe(200);
  });

  it('reabre un borrador', () => {
    const f = formDesdeCampana({
      id: 'c1', name: 'X', objective: 'Agendar', status: 'draft', voice_agent_id: 'ag', target_source: 'pipeline_stage',
      target_config: { stage_id: 's', goal: 'reactivar' }, schedule: { days: [1, 2], start_hour: 8, end_hour: 12 },
      max_calls_per_day: 100, max_calls_per_hour: 10, max_concurrent: 2,
    });
    expect(f).toMatchObject({ id: 'c1', goal: 'reactivar', stageId: 's', dias: [1, 2], desde: 8, hasta: 12, porDia: 100 });
  });

  it('estimaciones y textos', () => {
    expect(minutosEstimados(1106, 132)).toBe(2434);
    expect(minutosEstimados(1106, null)).toBeNull();
    expect(diasParaTerminar(1106, 200)).toBe(6);
    const abrev = (d: number) => ['D', 'L', 'M', 'X', 'J', 'V', 'S'][d];
    expect(textoHorario(lleno, abrev, (d, h) => `Sáb ${d}–${h}`)).toBe('L–V 9–18 · Sáb 9–15');
    expect(politicaValida('https://x.co/p')).toBe(true);
    expect(politicaValida('http://x.co')).toBe(false);
  });
});

describe('vista previa de la audiencia', () => {
  it('enmascara y clasifica con la precedencia de la cola', () => {
    expect(enmascararTelefono('+573004521234')).toBe('+57 300 *** 1234');
    const objetivos = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ customer_id: id, stage_id: 's' }));
    const clientes = new Map([
      ['a', { id: 'a', full_name: 'A', phone: '3001111111' }],
      ['b', { id: 'b', full_name: 'B', phone: '3002222222' }],
      ['c', { id: 'c', full_name: 'C', phone: '3003333333' }],
      ['d', { id: 'd', full_name: 'D', phone: null }],
      ['e', { id: 'e', full_name: 'E', phone: '3005555555' }],
    ]);
    const r = clasificarAudiencia(objetivos, clientes, new Set(['b']), new Set(['+573003333333']), new Set(['+573005555555']), false);
    expect(r.a_llamar).toBe(2);
    expect(r.excluidos).toEqual({ baja: 1, lista: 1, sin_telefono: 1 });
    expect(r.muestra.map((m) => m.estado)).toEqual(['llamar', 'baja', 'lista', 'sin_telefono', 'prueba']);
  });
});

// «Usar en campaña» desde un segmento → «Nueva campaña» → canal voz (`rutaAsistenteVoz`: ?segment=&nombre=).
describe('asistente de voz · lo que llega por la URL', () => {
  it('usa el nombre ya escrito (recortado) y deja el resto como un formulario nuevo', () => {
    const { form } = entradaDesdeUrl({ nombre: '  Reactivación  ', segment: null });
    expect(form).toEqual({ ...FORM_INICIAL, name: 'Reactivación' });
    expect(entradaDesdeUrl({ nombre: 'x'.repeat(NOMBRE_MAX + 10), segment: null }).form.name).toHaveLength(NOMBRE_MAX);
    expect(entradaDesdeUrl({ nombre: null, segment: null })).toEqual({ form: FORM_INICIAL, segmentoSinUsar: false });
  });

  it('el segmento no se convierte en audiencia mientras la cola no lo resuelva: solo enciende el aviso', () => {
    expect(FUENTES_NO_DISPONIBLES.has('segment')).toBe(true);
    const r = entradaDesdeUrl({ nombre: 'Clientes VIP', segment: 'seg-1' });
    expect(r.segmentoSinUsar).toBe(true);
    expect(r.form.fuente).toBe(FORM_INICIAL.fuente);
    expect(configAudiencia({ ...r.form, fuente: 'segment' })).toBeNull();
    expect(entradaDesdeUrl({ nombre: 'Clientes VIP', segment: '  ' }).segmentoSinUsar).toBe(false);
  });
});
