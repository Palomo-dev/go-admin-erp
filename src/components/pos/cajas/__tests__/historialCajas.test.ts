/**
 * Lógica pura de las pestañas «Cajas abiertas» e «Historial» de
 * /app/pos/cajas (Figma 680:404392) y regla de quién cierra una caja.
 */
import {
  cajaCoincide,
  celdaCsv,
  dinero,
  dineroConSigno,
  haceCuanto,
  historialACsv,
  nombreContieneTodas,
  numeroDeCaja,
  resultadoDiferencia,
  resumenCajasAbiertas,
  resumenDiferencias,
  sanitizarBusqueda,
} from '../historialCajas';
import { puedeCerrarCaja } from '@/lib/pos/cajas/reglasCierre';

describe('resultadoDiferencia', () => {
  it('clasifica faltante, sobrante y cuadrada con media unidad de tolerancia', () => {
    expect(resultadoDiferencia(-12000)).toBe('faltante');
    expect(resultadoDiferencia(8500)).toBe('sobrante');
    expect(resultadoDiferencia(0)).toBe('cuadrada');
    expect(resultadoDiferencia(0.4)).toBe('cuadrada');
    expect(resultadoDiferencia(-0.4)).toBe('cuadrada');
    expect(resultadoDiferencia(-0.5)).toBe('faltante');
  });

  it('sin diferencia (caja sin cerrar) no hay resultado', () => {
    expect(resultadoDiferencia(null)).toBeNull();
    expect(resultadoDiferencia(undefined)).toBeNull();
  });
});

describe('resumenDiferencias (franja del historial)', () => {
  it('suma faltantes, sobrantes y la neta, y cuenta las cuadradas', () => {
    const r = resumenDiferencias([-12000, 0, 8500, -3200, 0, 5700, -4000, null]);
    expect(r.sesiones).toBe(8);
    expect(r.faltantes).toBe(-19200);
    expect(r.cajasConFaltante).toBe(3);
    expect(r.sobrantes).toBe(14200);
    expect(r.cajasConSobrante).toBe(2);
    expect(r.cuadradas).toBe(2);
    expect(r.neta).toBe(-5000);
  });

  it('sin sesiones todo es cero', () => {
    expect(resumenDiferencias([])).toEqual({
      sesiones: 0,
      faltantes: 0,
      cajasConFaltante: 0,
      sobrantes: 0,
      cajasConSobrante: 0,
      neta: 0,
      cuadradas: 0,
    });
  });
});

describe('búsqueda', () => {
  it('sanitizarBusqueda quita lo que rompería un or() de PostgREST', () => {
    expect(sanitizarBusqueda('ana,(gómez)*%')).toBe('ana gómez');
    expect(sanitizarBusqueda('  maría   ')).toBe('maría');
    expect(sanitizarBusqueda(null)).toBe('');
  });

  it('numeroDeCaja reconoce «#1285» y «1285», nada más', () => {
    expect(numeroDeCaja('#1285')).toBe(1285);
    expect(numeroDeCaja('1285')).toBe(1285);
    expect(numeroDeCaja('ana')).toBeNull();
    expect(numeroDeCaja('12a')).toBeNull();
  });

  it('nombreContieneTodas ignora tildes y mayúsculas', () => {
    expect(nombreContieneTodas('María Gómez', ['maria', 'GOMEZ'])).toBe(true);
    expect(nombreContieneTodas('María Gómez', ['maria', 'rios'])).toBe(false);
  });

  it('cajaCoincide busca por cajero, sucursal o número', () => {
    const caja = { id: 1284, opened_by_name: 'María Gómez', branch_name: 'Sucursal Principal' };
    expect(cajaCoincide(caja, '')).toBe(true);
    expect(cajaCoincide(caja, 'maria')).toBe(true);
    expect(cajaCoincide(caja, 'principal')).toBe(true);
    expect(cajaCoincide(caja, '#1284')).toBe(true);
    expect(cajaCoincide(caja, 'norte')).toBe(false);
  });
});

describe('resumenCajasAbiertas', () => {
  it('cuenta sucursales (la global aparte) y suma solo los resúmenes ya calculados', () => {
    const sesiones = [
      { id: 1, branch_id: 10 },
      { id: 2, branch_id: 10 },
      { id: 3, branch_id: 20 },
      { id: 4, branch_id: null },
    ];
    const resumenes = new Map([
      [1, { expected_amount: 1198400, cash_in_count: 2, cash_out_count: 1 }],
      [3, { expected_amount: 352000, cash_in_count: 2, cash_out_count: 0 }],
    ]);
    const r = resumenCajasAbiertas(sesiones, resumenes);
    expect(r).toEqual({ cajas: 4, sucursales: 3, esperado: 1550400, movimientos: 5, ingresos: 4, egresos: 1 });
  });
});

describe('formato', () => {
  it('dinero sin centavos y con signo visible', () => {
    const limpiar = (s: string) => s.replace(/\s/g, ' ');
    expect(limpiar(dinero(1068400))).toBe('$ 1.068.400');
    expect(limpiar(dineroConSigno(30000))).toBe('+$ 30.000');
    expect(limpiar(dineroConSigno(-12000))).toBe('−$ 12.000');
    expect(limpiar(dineroConSigno(0))).toBe('$ 0');
  });

  it('haceCuanto', () => {
    const ahora = new Date('2026-09-22T15:00:00Z');
    expect(haceCuanto('2026-09-22T14:59:30Z', ahora)).toBe('hace un momento');
    expect(haceCuanto('2026-09-22T14:55:00Z', ahora)).toBe('hace 5 min');
    expect(haceCuanto('2026-09-22T11:40:00Z', ahora)).toBe('hace 3 h 20 min');
    expect(haceCuanto('2026-09-22T12:00:00Z', ahora)).toBe('hace 3 h');
    expect(haceCuanto('2026-09-20T15:00:00Z', ahora)).toBe('hace 2 días');
  });
});

describe('CSV del historial', () => {
  it('celdaCsv entrecomilla y neutraliza fórmulas', () => {
    expect(celdaCsv('Gómez; Ana')).toBe('"Gómez; Ana"');
    expect(celdaCsv('=SUMA(A1)')).toBe("'=SUMA(A1)");
    expect(celdaCsv(-12000)).toBe('-12000');
    expect(celdaCsv(null)).toBe('');
  });

  it('lleva BOM, cabecera y resultado; en cierre ciego oculta final y diferencia', () => {
    const fila = {
      caja: 1282,
      apertura: '21/09/2026 07:45',
      cierre: '21/09/2026 20:12',
      cerro: 'Ana Gómez',
      cajero: 'Ana Gómez',
      sucursal: 'Todas las sucursales',
      inicial: 200000,
      final: 2488400,
      diferencia: -12000,
    };
    const csv = historialACsv([fila], false);
    expect(csv.startsWith('﻿Caja;Apertura;Cierre;Cerró;Cajero;Sucursal;Inicial;Final;Diferencia;Resultado')).toBe(true);
    expect(csv).toContain('1282;21/09/2026 07:45;21/09/2026 20:12;Ana Gómez;Ana Gómez;Todas las sucursales;200000;2488400;-12000;Faltante');

    const ciego = historialACsv([fila], true);
    expect(ciego).toContain(';200000;Oculto;Oculto;');
    expect(ciego).not.toContain('2488400');
  });
});

describe('puedeCerrarCaja (misma regla en la pantalla y en POST /api/pos/cajas/[id]/cerrar)', () => {
  const caja = { opened_by: 'u-cajera', status: 'open' };

  it('quien abrió la caja la cierra sin permiso extra', () => {
    expect(puedeCerrarCaja(caja, 'u-cajera', false)).toBe(true);
  });

  it('la caja de otro solo con el permiso resuelto en el servidor', () => {
    expect(puedeCerrarCaja(caja, 'u-otro', false)).toBe(false);
    expect(puedeCerrarCaja(caja, 'u-otro', true)).toBe(true);
  });

  it('sin sesión o con la caja ya cerrada, nadie', () => {
    expect(puedeCerrarCaja(caja, null, true)).toBe(false);
    expect(puedeCerrarCaja({ ...caja, status: 'closed' }, 'u-cajera', true)).toBe(false);
  });
});
