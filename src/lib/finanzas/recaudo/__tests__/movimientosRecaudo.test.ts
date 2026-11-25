import { filaDeAbono, filaDeCobroPasarela, filtrarFilasRecaudo, tarjetasMovimientos } from '../movimientosRecaudo';
import { resumenRecaudo, type PagoRecaudo } from '../recaudoPorMedio';
import { accionesFila, unirMovimientos, type FilaMovimiento } from '@/lib/finanzas/tesoreria/movimientosLista';
import { toPlainDate } from '@/lib/utils/dateCore';

const ZONA = 'America/Bogota';
const diaDe = (iso: string) => toPlainDate(new Date(iso), ZONA);

const pago = (id: string, medio: string, monto: number, fecha: string, tipo: PagoRecaudo['tipo'] = 'completo'): PagoRecaudo => ({
  id,
  fecha,
  sedeId: 1,
  medio,
  metodo: medio,
  submetodo: null,
  tipo,
  monto,
  referencia: null,
  ventaId: null,
  factura: null,
  pedidoId: `P${id}`,
  pedidoNumero: `WO-${id}`,
});

const textos = {
  concepto: (p: PagoRecaudo) => `Pedido online · ${p.pedidoNumero}`,
  detalle: () => null,
  cuenta: (p: PagoRecaudo) => `${p.medio} · 138020`,
};

describe('cobros de pasarela el día del cobro', () => {
  const pagos = [
    pago('1', 'bold', 75900, '2026-11-26T02:40:00Z'), // 25 nov 21:40 en Bogotá
    pago('2', 'bold', 20000, '2026-11-25T17:12:00Z', 'anticipo'),
    pago('3', 'efectivo', 139000, '2026-11-25T20:30:00Z', 'puerta'),
    pago('4', 'datafono', 59600, '2026-11-25T21:31:00Z', 'tienda'),
  ];

  it('una fila «Por abonar» por pago, con el día de la organización (no el UTC)', () => {
    const f = filaDeCobroPasarela(pagos[0], textos);
    expect(f).toMatchObject({ fuente: 'pasarela', tipo: 'entrada', importe: 75900, conciliacion: 'porAbonar', href: '/app/pos/pedidos-online/P1' });
    expect(diaDe(f.fecha)).toBe('2026-11-25');
    expect(accionesFila(f)).toEqual({ duplicar: false, anular: false });
  });

  it('las tarjetas: lo cobrado por pasarela y datáfono queda por abonar', () => {
    const t = tarjetasMovimientos([], pagos);
    expect(t.porAbonar).toBe(75900 + 20000 + 59600);
    expect(t.conteoPorAbonar).toBe(3);
    expect(t.mediosPorAbonar.sort()).toEqual(['bold', 'datafono']);
  });

  it('Recaudado incluye los anticipos y se ven aparte', () => {
    const r = resumenRecaudo(pagos);
    expect(r.total.monto).toBe(294500);
    expect(r.porTipo.anticipo.monto).toBe(20000);
  });
});

describe('abonos de la pasarela al banco', () => {
  const abono = filaDeAbono(
    { id: 'a1', procesador: 'wompi', fecha: '2026-11-25T17:00:00Z', neto: 2381400, bruto: 2450000, referencia: 'ABN-52', banco: 'Bancolombia' },
    { concepto: () => 'Abono de Wompi', procesador: (c) => c, nota: 'No suma a Recaudado' },
  );

  it('son traslados (de la pasarela al banco) y no suman a Recaudado', () => {
    expect(abono).toMatchObject({ fuente: 'abono', tipo: 'traslado', cuenta: 'wompi', cuentaDestino: 'Bancolombia', importe: 2381400 });
    const t = tarjetasMovimientos([abono], []);
    expect(t.abonos).toBe(2381400);
    expect(t.porAbonar).toBe(0);
    // Recaudado sale de los pagos, nunca de las filas: el abono no está ahí.
    expect(resumenRecaudo([]).total.monto).toBe(0);
    expect(accionesFila(abono)).toEqual({ duplicar: false, anular: false });
  });
});

describe('filtro de fecha y medio de la lista', () => {
  const caja: FilaMovimiento[] = unirMovimientos(
    [
      { id: 1, uuid: 'u1', source: 'cash', concept: 'Venta POS', amount: 218000, created_at: '2026-11-26T01:48:00Z' }, // 25 nov 20:48
      { id: 2, uuid: 'u2', source: 'bank', concept: 'Transferencia', amount: 815900, created_at: '2026-11-25T23:02:00Z', bank_account_name: 'Banco' },
      { id: 3, uuid: 'u3', source: 'cash', concept: 'Ayer', amount: 5, created_at: '2026-11-25T03:00:00Z' }, // 24 nov 22:00
    ],
    [{ id: 4, uuid: 'u4', source: 'cash', concept: 'Gasto', amount: 412000, created_at: '2026-11-25T16:00:00Z' }],
  );
  const cobro = filaDeCobroPasarela(pago('9', 'bold', 75900, '2026-11-25T18:00:00Z'), textos);
  const filas = [...caja, cobro];
  const medios = new Map([[cobro.id, 'bold']]);
  const hoy = { desde: '2026-11-25', hasta: '2026-11-25' };

  it('«Hoy» usa el día de la organización', () => {
    expect(filtrarFilasRecaudo(filas, hoy, diaDe, [], medios).map((f) => f.concepto).sort()).toEqual(['Gasto', 'Pedido online · WO-9', 'Transferencia', 'Venta POS']);
  });

  it('por medio: caja es efectivo, banco transferencia, el cobro su pasarela', () => {
    expect(filtrarFilasRecaudo(filas, hoy, diaDe, ['efectivo'], medios).map((f) => f.concepto).sort()).toEqual(['Gasto', 'Venta POS']);
    expect(filtrarFilasRecaudo(filas, hoy, diaDe, ['bold'], medios).map((f) => f.concepto)).toEqual(['Pedido online · WO-9']);
    expect(filtrarFilasRecaudo(filas, null, diaDe, ['transferencia'], medios)).toHaveLength(1);
  });

  it('salidas del periodo filtrado', () => {
    const t = tarjetasMovimientos(filtrarFilasRecaudo(filas, hoy, diaDe, [], medios), []);
    expect(t).toMatchObject({ salidas: 412000, conteoSalidas: 1 });
  });
});
