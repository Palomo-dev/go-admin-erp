/**
 * Resultado de cada llamada en categoría fija (`voiceAgent/resultadoLlamada.ts`).
 * Pedido del dueño de la org 125 (2026-10-08): de 83 llamadas contestadas casi
 * ninguna tenía un resultado contable.
 */
import fs from 'fs';
import path from 'path';
import {
  clasificarResultado,
  esResultadoAgente,
  RESULTADOS_AGENTE,
  RESULTADOS_LLAMADA,
} from '@/lib/services/crm/voiceAgent/resultadoLlamada';
import { VOICE_AGENT_TOOL_DEFINITIONS } from '@/lib/services/crm/voiceAgentTools';

const aplicada = (tool: string, args: Record<string, unknown> = {}) => ({ tool, status: 'applied', args });

describe('clasificarResultado: llamadas sin conversación (estado de Twilio)', () => {
  it.each([
    ['voicemail', 'buzon', 'buzon'],
    ['no_answer', 'no-answer', 'no_contesto'],
    ['no_answer', 'fax', 'fax'],
    ['failed', 'busy', 'ocupado'],
    ['failed', 'failed', 'fallida'],
    ['transferred', null, 'transferida'],
  ])('%s / %s → %s', (status, outcome, esperado) => {
    expect(clasificarResultado({ status, outcome })).toBe(esperado);
  });

  it.each(['pending', 'queued', 'in_progress', 'canceled', 'skipped', null])('%s → sin resultado', (status) => {
    expect(clasificarResultado({ status, outcome: null })).toBeNull();
  });
});

describe('clasificarResultado: conversaciones', () => {
  const base = { status: 'completed', outcome: 'completed' };

  it('lo que quedó hecho manda sobre lo que declaró el modelo', () => {
    expect(clasificarResultado({ ...base, herramientas: [aplicada('book_meeting')], resultadoAgente: 'interesado', turnosCliente: 8 })).toBe('cita_agendada');
    expect(clasificarResultado({ ...base, herramientas: [aplicada('book_meeting'), aplicada('log_consent_opt_out')], turnosCliente: 8 })).toBe('no_contactar');
    expect(clasificarResultado({ ...base, herramientas: [aplicada('schedule_callback')], turnosCliente: 3 })).toBe('devolver_llamada');
    expect(clasificarResultado({ ...base, herramientas: [aplicada('transfer_to_human')], turnosCliente: 3 })).toBe('transferida');
  });

  it('una herramienta sugerida, denegada o fallida no cuenta', () => {
    const hs = [{ tool: 'book_meeting', status: 'failed' }, { tool: 'schedule_callback', status: 'denied' }];
    expect(clasificarResultado({ ...base, herramientas: hs, turnosCliente: 5 })).toBe('conversacion_sin_resultado');
  });

  it('usa la categoría que declaró el modelo en end_call', () => {
    expect(clasificarResultado({ ...base, resultadoAgente: 'no_es_encargado', turnosCliente: 3 })).toBe('no_es_encargado');
    expect(clasificarResultado({ ...base, resultadoAgente: 'inventada', turnosCliente: 3 })).toBe('conversacion_sin_resultado');
  });

  it('deduce la categoría del texto libre de llamadas anteriores al campo', () => {
    expect(clasificarResultado({ ...base, outcome: 'Sin interés; el cliente indica que su software propio funciona perfectamente.', turnosCliente: 6 })).toBe('sin_interes');
    expect(clasificarResultado({ ...base, outcome: 'sin_interes_definitivo', turnosCliente: 6 })).toBe('sin_interes');
    expect(clasificarResultado({ ...base, outcome: 'Camilo no es el encargado; devolución programada', turnosCliente: 4 })).toBe('no_es_encargado');
    expect(clasificarResultado({ ...base, outcome: 'callback: El contacto está saliendo', turnosCliente: 3 })).toBe('devolver_llamada');
  });

  it('una objeción de desinterés registrada cuenta como sin interés', () => {
    expect(clasificarResultado({ ...base, herramientas: [aplicada('log_objection', { tipo: 'ya_tiene_solucion' })], turnosCliente: 5 })).toBe('sin_interes');
    expect(clasificarResultado({ ...base, herramientas: [aplicada('log_objection', { tipo: 'precio' })], turnosCliente: 5 })).toBe('conversacion_sin_resultado');
  });

  it('colgó en el saludo: a lo sumo un «¿Aló?»', () => {
    expect(clasificarResultado({ ...base, turnosCliente: 0 })).toBe('colgo_en_saludo');
    expect(clasificarResultado({ ...base, outcome: 'answered_by_human', turnosCliente: 1 })).toBe('colgo_en_saludo');
    expect(clasificarResultado({ ...base, turnosCliente: 2 })).toBe('conversacion_sin_resultado');
  });
});

describe('contrato con la base y con el modelo', () => {
  it('el CHECK de la migración tiene exactamente las categorías del código', () => {
    const sql = fs.readFileSync(
      path.join(process.cwd(), 'supabase/migrations/20261008131856_voz_resultado_llamada_categoria.sql'),
      'utf8'
    );
    const lista = /resultado in \(([^)]*)\)/.exec(sql)?.[1] ?? '';
    const enCheck = lista.split(',').map((v) => v.trim().replace(/'/g, ''));
    expect(enCheck).toEqual([...RESULTADOS_LLAMADA]);
  });

  it('end_call exige la categoría y ofrece solo las del agente', () => {
    const endCall = VOICE_AGENT_TOOL_DEFINITIONS.find((t) => t.function.name === 'end_call')!;
    const params = endCall.function.parameters as { required: string[]; properties: { resultado: { enum: string[] } } };
    expect(params.required).toContain('resultado');
    expect(params.properties.resultado.enum).toEqual([...RESULTADOS_AGENTE]);
    expect(esResultadoAgente('buzon')).toBe(false);
  });
});
