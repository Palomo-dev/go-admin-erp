/**
 * Cartera — consulta del listado (listas blancas), orden y plan de cuotas
 * (plan §2 L6, L7 y P11). La RPC vuelve a validar todo; aquí se fija lo que la
 * ruta deja pasar y la propuesta de cuotas que la pantalla envía.
 */
import { consultaCarteraDesde, ordenCarteraRpc } from '@/lib/finanzas/cartera/listadoCartera';
import { consultaFacturasDesde, ordenFacturasRpc } from '@/lib/finanzas/ventas/listadoFacturas';
import { generarPlanCuotas } from '@/lib/finanzas/cartera/cuotas';
import { proximaCuota, type CuotaCartera } from '@/lib/finanzas/cartera/contratoCartera';
import { vistaDesdePayload } from '@/lib/finanzas/cartera/estadoCuentaVista';
import type { DocumentoPayload } from '@/lib/documents/tipos';

describe('estado de cuenta: payload del motor → vista del kit (mismo cálculo que el PDF)', () => {
  test('movimientos con día de la organización, tipo y saldo; vencido y por vencer desde la antigüedad', () => {
    const payload = {
      zonaHoraria: 'America/Bogota',
      resumen: [
        { clave: 'saldoInicial', valor: { tipo: 'dinero', v: 100 } },
        { clave: 'cargos', valor: { tipo: 'dinero', v: 500 } },
        { clave: 'abonos', valor: { tipo: 'dinero', v: 200 } },
        { clave: 'saldoFinal', valor: { tipo: 'dinero', v: 400 } },
      ],
      secciones: [
        {
          titulo: 'movimientos',
          columnas: [],
          filas: [
            // 02:00 UTC del día 2 = día 1 en Bogotá.
            ['2026-09-02T02:00:00.000Z', 'movimientos.factura', 'FACT-1', 500, null, 600],
            ['2026-09-10T15:00:00.000Z', 'movimientos.pago', null, null, 200, 400],
          ],
        },
        { titulo: 'antiguedad', columnas: [], filas: [[150, 100, 50, 60, 40]] },
      ],
    } as unknown as DocumentoPayload;
    const v = vistaDesdePayload(payload);
    expect(v).toMatchObject({ saldoInicial: 100, saldoFinal: 400, totalCargos: 500, totalAbonos: 200, porVencer: 150, vencido: 250 });
    expect(v.movimientos.map((m) => [m.dia, m.tipo, m.documento, m.cargo, m.abono, m.saldo])).toEqual([
      ['2026-09-01', 'factura', 'FACT-1', 500, 0, 600],
      ['2026-09-10', 'pago', null, 0, 200, 400],
    ]);
  });
});

describe('consultaCarteraDesde', () => {
  test('solo pasan filtros conocidos y con forma válida', () => {
    const c = consultaCarteraDesde(
      new URLSearchParams('q=ana&estado=overdue&tramo=d31_60&cliente=3852a174-db17-477e-9c0c-cbd1cb09e431&sucursal=7&origen=pos&pagina=2&tamano=50&orden=saldo_desc&organization_id=9'),
    );
    expect(c).toEqual({
      filtros: { q: 'ana', estado: 'overdue', tramo: 'd31_60', cliente: '3852a174-db17-477e-9c0c-cbd1cb09e431', sucursal: 7, origen: 'pos' },
      orden: 'saldo_desc',
      pagina: 2,
      tamano: 50,
      origen: 'pos',
    });
  });

  test('valores fuera de la lista se descartan; límites de página', () => {
    const c = consultaCarteraDesde(new URLSearchParams('estado=raro&tramo=d500&cliente=abc&tamano=9999&pagina=-3&orden=drop'));
    expect(c.filtros).toEqual({ origen: 'todos' });
    expect(c.tamano).toBe(200);
    expect(c.pagina).toBe(1);
    expect(c.orden).toBe('vencimiento_asc');
  });

  test('orden del kit → orden de la RPC', () => {
    expect(ordenCarteraRpc('saldo', 'asc')).toBe('saldo_desc');
    expect(ordenCarteraRpc(null, null)).toBe('vencimiento_asc');
    expect(ordenCarteraRpc('inventado', 'desc')).toBe('vencimiento_asc');
  });
});

describe('consultaFacturasDesde', () => {
  test('filtros, fechas y montos validados', () => {
    const c = consultaFacturasDesde(new URLSearchParams('q=FV&estado_pago=vencida&desde=2026-09-01&hasta=2026-09-30&monto_min=100&fe=accepted&incluir_nc=1'));
    expect(c.filtros).toEqual({ q: 'FV', estado_pago: 'vencida', desde: '2026-09-01', hasta: '2026-09-30', monto_min: 100, fe: 'accepted', incluir_nc: true });
    expect(consultaFacturasDesde(new URLSearchParams('desde=ayer&estado_doc=pagada&moneda=pesos')).filtros).toEqual({});
  });

  test('orden', () => {
    expect(ordenFacturasRpc('total', 'asc')).toBe('total_asc');
    expect(ordenFacturasRpc('cliente', 'desc')).toBe('cliente_asc');
    expect(ordenFacturasRpc(undefined, undefined)).toBe('emision_desc');
  });
});

describe('generarPlanCuotas', () => {
  test('cuotas iguales; la última absorbe el redondeo; suman el saldo', () => {
    const p = generarPlanCuotas(1000, 3, '2026-10-31', 'mensual', 0);
    expect(p.map((c) => c.valor)).toEqual([333, 333, 334]);
    expect(p.reduce((s, c) => s + c.capital, 0)).toBe(1000);
    // fin de mes: noviembre no tiene 31
    expect(p.map((c) => c.vence)).toEqual(['2026-10-31', '2026-11-30', '2026-12-31']);
  });

  test('quincenal y semanal; decimales de la moneda', () => {
    expect(generarPlanCuotas(100, 2, '2026-09-24', 'quincenal', 2).map((c) => c.vence)).toEqual(['2026-09-24', '2026-10-09']);
    expect(generarPlanCuotas(10, 3, '2026-12-28', 'semanal', 2).map((c) => [c.vence, c.valor])).toEqual([
      ['2026-12-28', 3.33],
      ['2027-01-04', 3.33],
      ['2027-01-11', 3.34],
    ]);
  });

  test('entradas inválidas → sin propuesta', () => {
    expect(generarPlanCuotas(0, 3, '2026-10-01', 'mensual')).toEqual([]);
    expect(generarPlanCuotas(100, 0, '2026-10-01', 'mensual')).toEqual([]);
    expect(generarPlanCuotas(100, 2, '01/10/2026', 'mensual')).toEqual([]);
  });

  test('próxima cuota: la primera pendiente con saldo', () => {
    const q = (numero: number, estado: string, saldo: number): CuotaCartera => ({ id: String(numero), numero, vencimiento: '2026-10-01', monto: 100, pagado: 100 - saldo, saldo, estado, dias: 0 });
    expect(proximaCuota([q(1, 'paid', 0), q(3, 'pending', 100), q(2, 'partial', 40)])?.numero).toBe(2);
    expect(proximaCuota([q(1, 'paid', 0)])).toBeNull();
  });
});
