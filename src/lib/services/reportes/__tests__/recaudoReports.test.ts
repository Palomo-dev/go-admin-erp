/**
 * Reporte «Recaudo por medio de pago» (Figma 3300-421294): con los pagos de Bold de la org 358
 * del 25 nov (5 completos $ 347.600 + 11 anticipos $ 220.000) más un saldo en efectivo cobrado
 * en puerta, las vistas cuadran y nada se cuenta dos veces.
 */
import type { PagoRecaudo } from '@/lib/finanzas/recaudo/recaudoPorMedio';

const mockPagos: PagoRecaudo[] = [];
jest.mock('@/lib/services/recaudoService', () => ({ leerPagosRecaudo: jest.fn(async () => mockPagos) }));
jest.mock('@/lib/services/reportes/rangoPeriodo', () => ({
  rangoDelPeriodo: jest.fn(async () => ({ start: '2026-11-25T00:00:00-05:00', end: '2026-11-25T23:59:59.999-05:00', timezone: 'America/Bogota' })),
}));
jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));

import { recaudoReports } from '../modulos/recaudoReports';
import { getReporteById } from '../reportesCatalogo';

const pago = (id: string, medio: string, monto: number, tipo: PagoRecaudo['tipo'], fecha = '2026-11-25T20:00:00Z', sedeId: number | null = 1): PagoRecaudo => ({
  id,
  fecha,
  sedeId,
  medio,
  metodo: medio,
  submetodo: null,
  tipo,
  monto,
  referencia: null,
  ventaId: null,
  factura: null,
  pedidoId: tipo === 'tienda' ? null : `P${id}`,
  pedidoNumero: null,
});

const cliente = {
  from: () => ({
    select: () => ({ eq: () => ({ in: async () => ({ data: [{ id: 1, name: 'Principal' }], error: null }) }) }),
  }),
};

describe('reporte Recaudo por medio de pago', () => {
  beforeAll(() => {
    mockPagos.push(
      ...[44000, 55900, 28900, 105900, 112900].map((m, i) => pago(`c${i}`, 'bold', m, 'completo')),
      ...Array.from({ length: 11 }, (_, i) => pago(`a${i}`, 'bold', 20000, 'anticipo')),
      pago('p1', 'efectivo', 80000, 'puerta', '2026-11-26T02:30:00Z'), // 25 nov 21:30 en Bogotá
      pago('t1', 'efectivo', 15000, 'tienda'),
    );
  });

  it('está en Reportes › Finanzas con comparativo, sede y franja', () => {
    expect(getReporteById('recaudo-medio-pago')).toMatchObject({ grupo: 'finanzas', filtros: ['comparativo', 'sucursal', 'franja'], alcance: 'sucursal' });
  });

  it('por medio: Bold $ 567.600 = $ 347.600 completos + $ 220.000 anticipos; efectivo separa puerta y tienda', async () => {
    const r = await recaudoReports[0].fetch(358, { tipo: 'diario', fechaInicio: '2026-11-25', fechaFin: '2026-11-25', etiqueta: 'Hoy' }, null, cliente as never);
    const bold = r.filas.find((f) => f.medio === 'Bold')!;
    expect(bold).toMatchObject({ origen: 'Pasarela', completo: 347600, anticipo: 220000, puerta: 0, tienda: 0, pagos: 16, total: 567600 });
    expect(r.filas.find((f) => f.medio === 'Efectivo')).toMatchObject({ origen: 'Caja', puerta: 80000, tienda: 15000, total: 95000 });
    expect(r.totales).toMatchObject({ total: 662600, pagos: 18 });
    expect(r.kpis.map((k) => k.valor)).toEqual([662600, 347600, 220000, 80000, 15000]);
  });

  it('las vistas por día, semana, mes y sede suman lo mismo, en el día de la organización', async () => {
    const r = await recaudoReports[0].fetch(358, { tipo: 'diario', fechaInicio: '2026-11-25', fechaFin: '2026-11-25', etiqueta: 'Hoy' }, null, cliente as never);
    const vista = (id: string) => r.vistas!.find((v) => v.id === id)!;
    expect(vista('por-dia').filas).toHaveLength(1);
    expect(vista('por-dia').filas[0]).toMatchObject({ periodo: '2026-11-25', total: 662600 });
    expect(vista('por-semana').filas[0]).toMatchObject({ periodo: '2026-11-23', total: 662600 });
    expect(vista('por-mes').totales).toMatchObject({ total: 662600 });
    expect(vista('por-sede').filas[0]).toMatchObject({ sede: 'Principal', total: 662600 });
    expect(vista('resumen').totales).toMatchObject({ total: 662600, pagos: 18 });
  });
});
