/**
 * Pasajes (Fase 2, Figma «23 Transporte» › 8 y 16): plantillas de planos, estados del plano,
 * plazos de cambio y anulación y lectura de las RPC.
 */
import { existsSync } from 'fs';
import { join } from 'path';
import {
  cambioSinCosto,
  columnasPlano,
  formatoCuenta,
  leerPuestos,
  leerRespuesta,
  plantilla,
  puestosDe,
  reembolsoAlAnular,
  resumenPuestos,
  segundosRestantes,
  vistaPuesto,
} from '../pasajes';

describe('plantillas de planos', () => {
  test('bus 40 (2+2), buseta 19, lancha 24 y yate 12', () => {
    expect(puestosDe(plantilla('bus40'))).toBe(40);
    expect(puestosDe(plantilla('buseta19'))).toBe(19);
    expect(puestosDe(plantilla('lancha24'))).toBe(24);
    expect(puestosDe(plantilla('yate12'))).toBe(12);
  });

  test('bus 2+2: pasillo en la columna 3, conductor y puerta arriba, ventanillas a los lados', () => {
    const p = plantilla('bus40');
    expect(p.cols).toBe(5);
    expect(p.layout.filter((c) => c.tipo === 'pasillo').every((c) => c.col === 3)).toBe(true);
    expect(p.layout.find((c) => c.tipo === 'conductor')).toMatchObject({ fila: 1, col: 1 });
    expect(p.layout.find((c) => c.tipo === 'puerta')).toMatchObject({ fila: 1, col: 5 });
    const primera = p.layout.filter((c) => c.tipo === 'puesto' && c.fila === 2);
    expect(primera.map((c) => [c.etiqueta, c.ventana])).toEqual([['1', true], ['2', false], ['3', false], ['4', true]]);
    // Etiquetas únicas.
    const etiquetas = p.layout.filter((c) => c.tipo === 'puesto').map((c) => c.etiqueta);
    expect(new Set(etiquetas).size).toBe(etiquetas.length);
  });
});

describe('plano del viaje', () => {
  const puestos = leerPuestos([
    { etiqueta: '1', fila: 2, col: 1, estado: 'available', retenido_hasta: null, mio: false, canal: null, ventana: true, boleto: null },
    { etiqueta: '2', fila: 2, col: 2, estado: 'sold', mio: false },
    { etiqueta: '3', fila: 2, col: 4, estado: 'reserved', mio: true, canal: 'taquilla', retenido_hasta: '2026-11-23T12:05:00Z' },
    { etiqueta: '4', fila: 2, col: 5, estado: 'reserved', mio: false, canal: 'web' },
    { etiqueta: '5', fila: 3, col: 1, estado: 'vencido' },
    { etiqueta: '6', fila: 3, col: 2, estado: 'raro' },
    { sin: 'etiqueta' },
  ]);

  test('se lee y cada puesto toma su vista', () => {
    expect(puestos).toHaveLength(6);
    expect(puestos.map((p) => vistaPuesto(p, null))).toEqual(['libre', 'vendido', 'seleccionado', 'retenido', 'libre', 'bloqueado']);
    expect(vistaPuesto(puestos[0], '1')).toBe('seleccionado');
  });

  test('resumen y pasillo', () => {
    expect(resumenPuestos(puestos)).toEqual({ total: 6, vendidos: 1, retenidos: 2, libres: 2 });
    expect(columnasPlano(puestos)).toEqual({ cols: 5, pasillos: [3] });
  });

  test('cuenta regresiva de la retención', () => {
    expect(segundosRestantes('2026-11-23T12:05:00Z', new Date('2026-11-23T12:00:28Z'))).toBe(272);
    expect(segundosRestantes('2026-11-23T12:05:00Z', new Date('2026-11-23T12:06:00Z'))).toBe(0);
    expect(segundosRestantes(null, new Date())).toBe(0);
    expect(formatoCuenta(272)).toBe('4:32');
  });
});

describe('cambios y anulaciones (mismas reglas que la base)', () => {
  const salida = '2026-11-23T17:00:00Z';
  test('cambio sin costo hasta N minutos antes', () => {
    expect(cambioSinCosto(salida, new Date('2026-11-23T16:30:00Z'), 30)).toBe(true);
    expect(cambioSinCosto(salida, new Date('2026-11-23T16:31:00Z'), 30)).toBe(false);
  });

  test('reembolso % hasta N horas antes y solo si estaba pagado', () => {
    expect(reembolsoAlAnular({ salida, ahora: new Date('2026-11-23T14:00:00Z'), horas: 2, porcentaje: 90, total: 38000, pagado: true })).toEqual({ aTiempo: true, reembolso: 34200 });
    expect(reembolsoAlAnular({ salida, ahora: new Date('2026-11-23T15:30:00Z'), horas: 2, porcentaje: 90, total: 38000, pagado: true })).toEqual({ aTiempo: false, reembolso: 0 });
    expect(reembolsoAlAnular({ salida, ahora: new Date('2026-11-23T14:00:00Z'), horas: 2, porcentaje: 90, total: 38000, pagado: false })).toEqual({ aTiempo: true, reembolso: 0 });
  });

  test('respuestas de las RPC', () => {
    expect(leerRespuesta({ estado: 'emitido', boleto: 'b', numero: 'B-2026-000001' })).toMatchObject({ estado: 'emitido', numero: 'B-2026-000001' });
    expect(leerRespuesta({ estado: 'anulado', reembolso: '34200.00', a_tiempo: true })).toMatchObject({ estado: 'anulado', reembolso: 34200, aTiempo: true });
    expect(leerRespuesta({ estado: 'otra' }).estado).toBe('error');
  });
});

test('la pantalla Vender pasaje existe dentro de Boletos', () => {
  expect(existsSync(join(process.cwd(), 'src/app/app/transporte/boletos/vender/page.tsx'))).toBe(true);
});
