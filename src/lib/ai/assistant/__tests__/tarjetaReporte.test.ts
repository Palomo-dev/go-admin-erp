/**
 * GO Asistente — tarjeta de reporte en la respuesta (Figma Reportes 22-03).
 *
 * La arma el servidor con el resultado real del reporte; el panel la valida.
 * Se prueba la forma: pocas columnas y filas, ordenadas por la cifra
 * principal, serie solo si el reporte es por fecha, y que el parser descarta
 * lo que no sirva sin romper.
 */

import { armarTarjetaReporte, MAX_FILAS_TARJETA, parsearTarjetaReporte, puntosSparkline, type MetaTarjeta } from '../tarjetaReporte';
import type { ReporteColumna } from '@/lib/services/reportes/types';

const meta: MetaTarjeta = {
  reporteId: 'ventas-periodo',
  grupo: 'ventas',
  titulo: 'Ventas del periodo',
  periodo: { tipo: 'mensual', fechaInicio: '2026-09-01', fechaFin: '2026-09-30', horaInicio: null, horaFin: null, etiqueta: 'Septiembre 2026' },
  sucursalId: 3,
  vista: 'por-dia',
};

const porDia: ReporteColumna[] = [
  { key: 'fecha', titulo: 'Fecha', tipo: 'fecha' },
  { key: 'num_ventas', titulo: 'N° Ventas', tipo: 'numero' },
  { key: 'total', titulo: 'Total', tipo: 'moneda' },
  { key: 'ticket_promedio', titulo: 'Ticket Prom.', tipo: 'moneda' },
];

const filasDia = [
  { fecha: '2026-09-22', num_ventas: 54, total: 4_980_000, ticket_promedio: 92_222 },
  { fecha: '2026-09-23', num_ventas: 61, total: 5_640_000, ticket_promedio: 92_459 },
  { fecha: '2026-09-24', num_ventas: 58, total: 5_420_000, ticket_promedio: 93_448 },
  { fecha: '2026-09-25', num_ventas: 66, total: 6_260_000, ticket_promedio: 94_848 },
  { fecha: '2026-09-26', num_ventas: 92, total: 8_940_000, ticket_promedio: 97_174 },
  { fecha: '2026-09-27', num_ventas: 118, total: 11_620_000, ticket_promedio: 98_475 },
  { fecha: '2026-09-28', num_ventas: 40, total: '3900000', ticket_promedio: 97_500 },
];

describe('armarTarjetaReporte', () => {
  it('dimensión + dos cifras, filas por la moneda de mayor a menor, serie en el orden del reporte', () => {
    const t = armarTarjetaReporte({ columnas: porDia, filas: filasDia }, meta);
    expect(t.columnas.map((c) => c.key)).toEqual(['fecha', 'num_ventas', 'total']);
    expect(t.filas).toHaveLength(MAX_FILAS_TARJETA);
    expect(t.filas[0]).toEqual({ fecha: '2026-09-27', num_ventas: 118, total: 11_620_000 });
    expect(t.filas.map((f) => f.fecha)).not.toContain('2026-09-28');
    expect(t.serie).toEqual([4_980_000, 5_640_000, 5_420_000, 6_260_000, 8_940_000, 11_620_000, 3_900_000]);
    expect(t.serieTitulo).toBe('Total');
    expect(t.totalFilas).toBe(7);
    expect(t).toMatchObject(meta);
  });

  it('sin fecha como dimensión no hay serie (no se inventa una tendencia entre sucursales)', () => {
    const t = armarTarjetaReporte(
      {
        columnas: [{ key: 'sucursal', titulo: 'Sucursal', tipo: 'texto' }, { key: 'total', titulo: 'Total', tipo: 'moneda' }],
        filas: [{ sucursal: 'Norte', total: 1 }, { sucursal: 'Sur', total: 3 }, { sucursal: 'Centro', total: 2 }],
      },
      meta
    );
    expect(t.serie).toEqual([]);
    expect(t.serieTitulo).toBeNull();
    expect(t.filas.map((f) => f.sucursal)).toEqual(['Sur', 'Centro', 'Norte']);
  });

  it('valores raros se vuelven celdas seguras', () => {
    const t = armarTarjetaReporte(
      { columnas: porDia, filas: [{ fecha: { raro: true }, num_ventas: NaN, total: undefined }] },
      meta
    );
    expect(t.filas[0]).toEqual({ fecha: '[object Object]', num_ventas: null, total: null });
  });
});

describe('parsearTarjetaReporte', () => {
  const buena = () => armarTarjetaReporte({ columnas: porDia, filas: filasDia }, meta);

  it('ida y vuelta por JSON (lo que viaja en el stream)', () => {
    expect(parsearTarjetaReporte(JSON.parse(JSON.stringify(buena())))).toEqual(buena());
  });

  it.each([
    ['null', null],
    ['sin id', { ...buena(), reporteId: '' }],
    ['id con ruta', { ...buena(), reporteId: '../admin' }],
    ['sin columnas', { ...buena(), columnas: [] }],
    ['tipo de columna desconocido', { ...buena(), columnas: [{ key: 'x', titulo: 'X', tipo: 'html' }] }],
    ['fecha inválida', { ...buena(), periodo: { ...buena().periodo, fechaInicio: 'hoy' } }],
    ['sucursal texto', { ...buena(), sucursalId: '3' }],
  ])('rechaza %s', (_caso, valor) => {
    expect(parsearTarjetaReporte(valor)).toBeNull();
  });

  it('acota filas y columnas aunque el servidor mande de más', () => {
    const t = parsearTarjetaReporte({ ...buena(), filas: Array.from({ length: 50 }, () => buena().filas[0]), columnas: [...buena().columnas, { key: 'otra', titulo: 'Otra', tipo: 'numero' }] })!;
    expect(t.filas).toHaveLength(MAX_FILAS_TARJETA);
    expect(t.columnas).toHaveLength(3);
  });
});

describe('puntosSparkline', () => {
  it('escala la serie al lienzo; una serie plana queda a media altura', () => {
    expect(puntosSparkline([1, 3, 2], 100, 40, 0)).toBe('0,40 50,0 100,20');
    expect(puntosSparkline([5, 5, 5], 100, 40, 0)).toBe('0,20 50,20 100,20');
    expect(puntosSparkline([7], 100, 40)).toBe('');
  });
});
