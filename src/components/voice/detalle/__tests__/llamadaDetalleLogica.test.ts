/**
 * Detalle de una llamada (Figma 1363:20, 1365:800947, 1365:801445, 1368:17):
 * lógica pura de la tarjeta «Grabación», la onda, el sentimiento, el minuto de
 * cada objeción y las tareas pendientes; y las acciones de transcripción y
 * análisis contra las rutas del servidor.
 */

import {
  barrasOnda,
  estadoGrabacion,
  formatoDuracionCorta,
  formatoReloj,
  instanteDeCita,
  notaVendedor,
  porcentaje,
  porcentajeSentimiento,
  tareasPendientes,
  velocidadSiguiente,
  type GrabacionDetalle,
} from '../llamadaDetalleLogica';
import { aplicarAnalisis, pedirTranscripcion } from '@/components/crm/calls/accionesInteligencia';

const HOY = '2026-11-15';
const AHORA = Date.parse('2026-11-15T15:00:00Z');
const grab = (g: Partial<GrabacionDetalle>): GrabacionDetalle => ({ id: 'r1', status: 'ready', duration_seconds: 278, retention_until: '2026-12-28', created_at: '2026-11-15T14:00:00Z', ...g });
const base = { recording_enabled: true, consent_given: true, consents: [], recordings: [] as GrabacionDetalle[], ended_at: '2026-11-15T14:00:00Z', status: 'completed' };

describe('estadoGrabacion', () => {
  test('grabación lista: se conserva hasta retention_until', () => {
    expect(estadoGrabacion({ ...base, recordings: [grab({})] }, HOY, AHORA)).toEqual({ tipo: 'lista', grabacion: grab({}), conservaHasta: '2026-12-28' });
  });
  test('retención vencida o fila borrada → sin grabación con la fecha', () => {
    expect(estadoGrabacion({ ...base, recordings: [grab({ retention_until: '2026-11-01' })] }, HOY, AHORA)).toEqual({ tipo: 'sin', motivo: 'vencida', eliminadaEl: '2026-11-01' });
    expect(estadoGrabacion({ ...base, recordings: [grab({ status: 'deleted', retention_until: '2026-10-01' })] }, HOY, AHORA)).toMatchObject({ tipo: 'sin', motivo: 'vencida', eliminadaEl: '2026-10-01' });
  });
  test('en proceso: fila processing o llamada recién colgada sin fila', () => {
    expect(estadoGrabacion({ ...base, recordings: [grab({ status: 'processing' })] }, HOY, AHORA).tipo).toBe('procesando');
    expect(estadoGrabacion({ ...base, ended_at: '2026-11-15T14:58:00Z' }, HOY, AHORA).tipo).toBe('procesando');
  });
  test('grabación apagada o consentimiento negado', () => {
    expect(estadoGrabacion({ ...base, recording_enabled: false }, HOY, AHORA)).toMatchObject({ tipo: 'sin', motivo: 'apagada' });
    expect(estadoGrabacion({ ...base, recording_enabled: false, consent_given: false }, HOY, AHORA)).toMatchObject({ tipo: 'sin', motivo: 'consentimiento' });
  });
  test('grabación fallida y llamada vieja sin fila', () => {
    expect(estadoGrabacion({ ...base, recordings: [grab({ status: 'failed' })] }, HOY, AHORA)).toMatchObject({ tipo: 'sin', motivo: 'fallida' });
    expect(estadoGrabacion({ ...base, ended_at: '2026-11-10T14:00:00Z' }, HOY, AHORA)).toMatchObject({ tipo: 'sin', motivo: 'apagada' });
  });
});

describe('formatos y onda', () => {
  test('reloj mm:ss y duración corta', () => {
    expect(formatoReloj(72_000)).toBe('01:12');
    expect(formatoReloj(null)).toBe('00:00');
    expect(formatoDuracionCorta(252)).toBe('4:12');
  });
  test('la onda es estable por llamada y está en 0,2–1', () => {
    const a = barrasOnda('llamada-1', 48);
    expect(a).toHaveLength(48);
    expect(barrasOnda('llamada-1', 48)).toEqual(a);
    expect(barrasOnda('llamada-2', 48)).not.toEqual(a);
    expect(Math.min(...a)).toBeGreaterThanOrEqual(0.2);
    expect(Math.max(...a)).toBeLessThanOrEqual(1);
  });
  test('velocidades 1x → 1,5x → 2x → 1x', () => {
    expect(velocidadSiguiente(1)).toBe(1.5);
    expect(velocidadSiguiente(1.5)).toBe(2);
    expect(velocidadSiguiente(2)).toBe(1);
  });
  test('sentimiento de -1 a 1 en % de intensidad; proporciones en %', () => {
    expect(porcentajeSentimiento(0.72)).toBe(72);
    expect(porcentajeSentimiento(-0.4)).toBe(40);
    expect(porcentajeSentimiento(null)).toBeNull();
    expect(porcentaje(0.42)).toBe(42);
    expect(porcentaje(undefined)).toBeNull();
  });
});

describe('objeciones, notas y tareas', () => {
  const segs = [
    { start_ms: 4_000, text: 'Buenos días, le habla el vendedor.' },
    { start_ms: 130_000, text: 'La revisé, pero el precio está por encima de lo que pagamos hoy.' },
  ];
  test('el minuto de una objeción sale del segmento que contiene la cita (sin tildes ni signos)', () => {
    expect(instanteDeCita(segs, 'el precio esta por encima de lo que pagamos')).toBe(130_000);
    expect(instanteDeCita(segs, 'otra cosa')).toBeNull();
    expect(instanteDeCita(segs, '')).toBeNull();
  });
  test('la nota de la disposición manda sobre la nota en vivo', () => {
    expect(notaVendedor({ disposition_note: 'Confirma interés', live_note: 'borrador', disposition_at: '2026-11-15T15:47:00Z' })).toEqual({ texto: 'Confirma interés', en: '2026-11-15T15:47:00Z' });
    expect(notaVendedor({ live_note: 'borrador' })).toEqual({ texto: 'borrador', en: null });
    expect(notaVendedor(null)).toEqual({ texto: null, en: null });
  });
  test('tareas pendientes: las que no están en applied_actions', () => {
    expect(tareasPendientes(3, new Set(['task:1', 'stage']))).toEqual([0, 2]);
  });
});

describe('accionesInteligencia', () => {
  const original = global.fetch;
  afterEach(() => {
    global.fetch = original;
  });
  const responder = (status: number, body: unknown) => {
    const fn = jest.fn(async () => ({ status, json: async () => body }) as unknown as Response);
    global.fetch = fn as unknown as typeof fetch;
    return fn;
  };

  test('transcribir: 202 encolado; deduped se reutiliza; error lanza', async () => {
    const f = responder(202, { success: true, data: {} });
    await expect(pedirTranscripcion('c1', true)).resolves.toBe('encolado');
    expect(f).toHaveBeenCalledWith('/api/crm/calls/c1/transcribe', expect.objectContaining({ method: 'POST', body: JSON.stringify({ force: true }) }));
    responder(200, { success: true, data: { deduped: true } });
    await expect(pedirTranscripcion('c1', false)).resolves.toBe('reutilizado');
    responder(402, { success: false, error: 'Sin créditos' });
    await expect(pedirTranscripcion('c1', false)).rejects.toThrow('Sin créditos');
  });

  test('aplicar: 409 con gate → criterios faltantes; 200 → aplicadas', async () => {
    responder(409, { success: false, data: { gate: { missing: [{ label: 'Presupuesto', detail: 'Falta el presupuesto' }] } } });
    await expect(aplicarAnalisis('c1', 'a1', { stage: true })).resolves.toEqual({ tipo: 'criterios', faltan: ['Falta el presupuesto'] });
    const f = responder(200, { success: true, data: { applied: ['task:0'], skipped: [] } });
    await expect(aplicarAnalisis('c1', 'a1', { tasks: [0] })).resolves.toEqual({ tipo: 'aplicado', aplicadas: ['task:0'], omitidas: [] });
    expect(f).toHaveBeenCalledWith('/api/crm/calls/c1/analysis/apply', expect.objectContaining({ body: JSON.stringify({ analysisId: 'a1', actions: { tasks: [0] }, ignore_gate: false }) }));
  });
});
