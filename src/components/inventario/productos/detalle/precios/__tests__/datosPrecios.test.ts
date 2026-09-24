import type { EventoHistorial } from '@/lib/services/productoService';
import { aFilasVigencia, estadoVigencia, programadoDe, serieGrafico } from '../datosPrecios';

const AHORA = new Date('2026-09-23T15:00:00Z').getTime();

function ev(clave: string, tipo: 'precio' | 'costo', detalle: Record<string, unknown>, productId = 1): EventoHistorial {
  return {
    clave,
    fecha: String(detalle.desde),
    tipo,
    product_id: productId,
    producto_nombre: 'Producto',
    usuario_id: null,
    usuario: null,
    detalle,
  };
}

const eventos: EventoHistorial[] = [
  ev('p1', 'precio', { precio: 100, comparacion: null, desde: '2026-01-01T00:00:00Z', hasta: '2026-06-01T00:00:00Z', anterior: null, cancelado: false }),
  ev('p2', 'precio', { precio: '120.00', comparacion: 150, desde: '2026-06-01T00:00:00Z', hasta: null, anterior: 100, cancelado: false }),
  ev('p3', 'precio', { precio: 130, desde: '2026-10-01T05:00:00Z', hasta: null, anterior: 120, cancelado: false }),
  ev('p0', 'precio', { precio: 90, desde: '2026-12-01T05:00:00Z', hasta: '2026-12-01T05:00:00Z', anterior: 130, cancelado: true }),
  ev('c1', 'costo', { costo: 60, desde: '2026-02-01T00:00:00Z', hasta: null, anterior: null, proveedor: 'Proveedor A', cancelado: false }),
  ev('v1', 'precio', { precio: 999, desde: '2026-01-01T00:00:00Z', hasta: null, cancelado: false }, 2),
];

describe('datosPrecios', () => {
  const filas = aFilasVigencia(eventos);

  it('normaliza números que llegan como texto', () => {
    expect(filas.find((f) => f.clave === 'p2')).toMatchObject({ valor: 120, comparacion: 150, anterior: 100 });
    expect(filas.find((f) => f.clave === 'c1')).toMatchObject({ valor: 60, comparacion: null, proveedor: 'Proveedor A' });
  });

  it('clasifica la vigencia', () => {
    const por = (c: string) => estadoVigencia(filas.find((f) => f.clave === c)!, AHORA);
    expect(por('p1')).toBe('cerrado');
    expect(por('p2')).toBe('vigente');
    expect(por('p3')).toBe('programado');
    expect(por('p0')).toBe('cancelado');
  });

  it('encuentra el próximo programado sin contar cancelados ni variantes', () => {
    expect(programadoDe(filas, 'precio', 1, AHORA)?.clave).toBe('p3');
    expect(programadoDe(filas, 'costo', 1, AHORA)).toBeNull();
  });

  it('arma la serie escalonada con precio y costo vigentes en cada cambio', () => {
    const serie = serieGrafico(filas, 1, AHORA);
    expect(serie.map((p) => p.t)).toEqual([
      new Date('2026-01-01T00:00:00Z').getTime(),
      new Date('2026-02-01T00:00:00Z').getTime(),
      new Date('2026-06-01T00:00:00Z').getTime(),
      AHORA,
      new Date('2026-10-01T05:00:00Z').getTime(),
    ]);
    expect(serie.map((p) => p.precio)).toEqual([100, 100, 120, 120, 130]);
    expect(serie.map((p) => p.costo)).toEqual([null, 60, 60, 60, 60]);
  });

  it('sin filas no hay serie', () => {
    expect(serieGrafico([], 1, AHORA)).toEqual([]);
  });
});
