import { finanzasReports } from '@/lib/services/reportes/modulos/finanzasReports';
import type { PeriodoCierre, ReportesClient } from '@/lib/services/reportes/types';
import { RPC_CARTERA, bandaMasAtrasada, leerCarteraEdades, normalizarCartera, porcentajeVencido, totalesPorBanda } from '../carteraEdades';

jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));

const RPC = {
  tipo: 'cxc',
  corte: '2026-10-31',
  total: 1000,
  vencida: 400,
  buckets: [
    { bucket: 'corriente', total: 600, cantidad: 1 },
    { bucket: '1-30', total: 0, cantidad: 0 },
    { bucket: '31-60', total: 300, cantidad: 1 },
    { bucket: '61-90', total: 0, cantidad: 0 },
    { bucket: '+90', total: 100, cantidad: 1 },
  ],
  terceros: [{ tercero_id: 'a', tercero: 'Tercero de prueba', corriente: 600, d1_30: 0, d31_60: 300, d61_90: 0, d90: 100, total: 1000, cantidad: 3 }],
  detalle: [
    { documento_id: 'd1', numero: 'F-1', tercero_id: 'a', tercero: 'Tercero de prueba', branch_id: 1, fecha: '2026-06-01', vence: '2026-07-01', monto: 100, abonado: 0, saldo: 100, dias_mora: 122, banda: '+90' },
  ],
  anticipos: { origen: 'saldos_a_favor', cuenta: '2805', total: 70, detalle: [] },
  mayor: { cuenta: '1305', saldo: 1200, diferencia: 200, cuadra: false },
};

describe('carteraEdades', () => {
  it('normaliza las cinco bandas y la conciliación', () => {
    const c = normalizarCartera('cxc', '2026-10-31', RPC);
    expect(c.bandas.map((b) => b.banda)).toEqual(['corriente', '1-30', '31-60', '61-90', '+90']);
    expect(c.bandas.reduce((s, b) => s + b.total, 0)).toBe(c.total);
    expect(c.mayor).toEqual({ cuenta: '1305', saldo: 1200, diferencia: 200, cuadra: false });
    expect(c.anticipos.total).toBe(70);
    expect(porcentajeVencido(c)).toBe(40);
    expect(totalesPorBanda(c)['+90']).toBe(100);
    expect(bandaMasAtrasada(c.terceros[0])).toBe('+90');
  });

  it('el anticipo no resta del total', () => {
    const c = normalizarCartera('cxc', '2026-10-31', RPC);
    expect(c.total).toBe(1000);
  });

  it('una respuesta vacía no se vuelve cartera inventada ni NaN', () => {
    const c = normalizarCartera('cxp', '2026-10-31', {});
    expect(c.total).toBe(0);
    expect(c.mayor.cuenta).toBe('2205');
    expect(c.mayor.cuadra).toBe(false);
    expect(porcentajeVencido(c)).toBe(0);
  });

  it('llama a la RPC del tipo pedido con sucursal nula, nunca indefinida', async () => {
    const rpc = jest.fn(async () => ({ data: RPC, error: null }));
    await leerCarteraEdades({ rpc } as never, RPC_CARTERA.cxp, 7, '2026-10-31');
    expect(rpc).toHaveBeenCalledWith('fn_reporte_cxp_aging', { p_organization_id: 7, p_as_of: '2026-10-31', p_branch_id: null });
  });

  it('propaga el error de permiso', async () => {
    const rpc = jest.fn(async () => ({ data: null, error: { code: '42501' } }));
    await expect(leerCarteraEdades({ rpc } as never, RPC_CARTERA.cxc, 7, '2026-10-31')).rejects.toEqual({ code: '42501' });
  });
});

describe('reporte cxc-aging', () => {
  const periodo: PeriodoCierre = { tipo: 'mensual', fechaInicio: '2026-10-01', fechaFin: '2026-10-31', etiqueta: 'octubre' };

  it('lee solo de la RPC: mora y saldo al corte, sin consultar la tabla', async () => {
    const from = jest.fn();
    const rpc = jest.fn(async () => ({ data: RPC, error: null }));
    const def = finanzasReports.find((r) => r.id === 'cxc-aging');
    const datos = await def!.fetch(7, periodo, null, { rpc, from } as unknown as ReportesClient);

    expect(from).not.toHaveBeenCalled();
    expect(datos.kpis.find((k) => k.titulo === 'Total CxC')?.valor).toBe(1000);
    expect(datos.kpis.find((k) => k.titulo === 'Vencido')?.valor).toBe(400);
    expect(datos.kpis.find((k) => k.titulo === 'Diferencia con el mayor')?.valor).toBe(200);
    expect(datos.filas[0]).toMatchObject({ saldo: 100, dias_vencido: 122, rango: '+90 días', vencimiento: '2026-07-01' });
  });
});
