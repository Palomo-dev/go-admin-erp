/**
 * RNE (Registro de Números Excluidos, CRC) y detección de contestadora (AMD de
 * Twilio): lógica pura del agente de voz.
 */

import {
  filtrarContraRne,
  leerArchivoRne,
  normalizarNumeroRne,
  verificacionRneVigente,
  vigenciaRneHasta,
  VIGENCIA_RNE_DIAS,
} from '../rne';
import { cierrePorAmd, clasificarAnsweredBy, debeColgarPorAmd, parametrosAmd } from '../amd';

describe('RNE: normalización de números', () => {
  test.each([
    ['3001234567', '+573001234567'],
    ['573001234567', '+573001234567'],
    ['+57 300 123 4567', '+573001234567'],
    ['(300) 123-4567', '+573001234567'],
    ['03001234567', '+573001234567'],
    ['6041234567', '+576041234567'],
    ['+14155552671', '+14155552671'],
  ])('%s → %s', (raw, e164) => {
    expect(normalizarNumeroRne(raw)).toBe(e164);
  });

  test.each([[''], ['   '], [null], [undefined], ['numero'], ['12345'], ['1234567890123']])('%p no es un número', (raw) => {
    expect(normalizarNumeroRne(raw as string | null | undefined)).toBeNull();
  });
});

describe('RNE: lectura del archivo', () => {
  test('CSV con cabecera, separadores mixtos, comillas, BOM y repetidos', () => {
    const csv = '﻿numero;fecha\n"3001112233";2026-09-01\n573004445566,2026-09-02\n3001112233\n\n+57 300 777 8899\t2026\n';
    const r = leerArchivoRne(csv);
    expect(r.numeros.sort()).toEqual(['+573001112233', '+573004445566', '+573007778899']);
    expect(r.descartados).toBe(0);
  });

  test('cuenta como descartado lo que parece número y no se puede normalizar', () => {
    const r = leerArchivoRne('3001112233\n1234567890123\n');
    expect(r.numeros).toEqual(['+573001112233']);
    expect(r.descartados).toBe(1);
  });

  test('un archivo sin números devuelve lista vacía', () => {
    expect(leerArchivoRne('hola\nmundo').numeros).toEqual([]);
  });
});

describe('RNE: filtrado de los objetivos de la campaña', () => {
  test('separa los excluidos sin importar el formato del teléfono en la ficha', () => {
    const objetivos = [
      { customer_id: 'a', phone: '300 111 2233' },
      { customer_id: 'b', phone: '+573004445566' },
      { customer_id: 'c', phone: null },
      { customer_id: 'd', phone: '573009990000' },
    ];
    const r = filtrarContraRne(objetivos, ['+573001112233', '+573009990000']);
    expect(r.excluidos.map((o) => o.customer_id)).toEqual(['a', 'd']);
    expect(r.permitidos.map((o) => o.customer_id)).toEqual(['b', 'c']);
  });
});

describe('RNE: vigencia de la verificación', () => {
  test(`dura ${VIGENCIA_RNE_DIAS} días`, () => {
    const hecha = new Date('2026-09-30T15:00:00Z');
    const hasta = vigenciaRneHasta(hecha);
    expect(hasta.toISOString()).toBe('2026-10-30T15:00:00.000Z');
    expect(verificacionRneVigente(hasta, new Date('2026-10-30T14:59:59Z'))).toBe(true);
    expect(verificacionRneVigente(hasta, new Date('2026-10-30T15:00:00Z'))).toBe(false);
  });

  test('sin verificación o con fecha ilegible no hay vigencia (falla cerrado)', () => {
    expect(verificacionRneVigente(null)).toBe(false);
    expect(verificacionRneVigente(undefined)).toBe(false);
    expect(verificacionRneVigente('no-es-fecha')).toBe(false);
  });
});

describe('AMD: clasificación de AnsweredBy', () => {
  test.each([
    ['human', 'humano', false],
    ['machine_start', 'buzon', true],
    ['machine_end_beep', 'buzon', true],
    ['machine_end_silence', 'buzon', true],
    ['machine_end_other', 'buzon', true],
    ['fax', 'fax', true],
    ['unknown', 'desconocido', false],
    ['', 'desconocido', false],
    [null, 'desconocido', false],
  ])('%p → %s (colgar: %s)', (answeredBy, clase, colgar) => {
    expect(clasificarAnsweredBy(answeredBy)).toBe(clase);
    expect(debeColgarPorAmd(answeredBy)).toBe(colgar);
  });

  test('cierre de la fila: buzón → voicemail/buzon; fax → no_answer/fax; humano → nada', () => {
    expect(cierrePorAmd('machine_start')).toEqual({ status: 'voicemail', outcome: 'buzon' });
    expect(cierrePorAmd('fax')).toEqual({ status: 'no_answer', outcome: 'fax' });
    expect(cierrePorAmd('human')).toBeNull();
    expect(cierrePorAmd('unknown')).toBeNull();
  });

  test('parámetros de calls.create: Enable sin mensaje de buzón, DetectMessageEnd con mensaje', () => {
    const url = 'https://app.example.com/api/voice/ai-agent/amd?callId=v1';
    const asincrono = { asyncAmd: 'true', asyncAmdStatusCallback: url, asyncAmdStatusCallbackMethod: 'POST' };
    // AMD ASÍNCRONO (2026-10-07): el síncrono retenía a la persona en silencio hasta 30 s.
    expect(parametrosAmd(url)).toEqual({ machineDetection: 'Enable', ...asincrono });
    expect(parametrosAmd(url, '   ')).toEqual({ machineDetection: 'Enable', ...asincrono });
    expect(parametrosAmd(url, 'Le llamamos de…')).toEqual({ machineDetection: 'DetectMessageEnd', ...asincrono });
  });
});
