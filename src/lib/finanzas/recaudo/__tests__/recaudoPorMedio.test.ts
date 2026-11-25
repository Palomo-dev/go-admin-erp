import {
  agruparPorPeriodo,
  claveGrupo,
  filtrarPorMedio,
  lunesDe,
  medioDeCodigo,
  medioDelPago,
  mediosDeCodigos,
  mediosPorPedido,
  pagoDeFila,
  resumenRecaudo,
  tipoDelPago,
  totalesPorMedio,
  totalesPorSede,
  type FilaRecaudoBD,
} from '../recaudoPorMedio';

const base: FilaRecaudoBD = {
  pago_id: 'p',
  fecha: '2026-11-25T15:00:00Z',
  branch_id: 1,
  origen: 'invoice_sales',
  metodo: 'cash',
  procesador: null,
  pasarela_manual: null,
  bold_metodo: null,
  wompi_tipo: null,
  mp_metodo: null,
  monto: 0,
  referencia: null,
  cuenta_bancaria_id: null,
  venta_id: null,
  factura_numero: null,
  pedido_id: null,
  pedido_numero: null,
  pedido_estado: null,
  pedido_estado_pago: null,
  pedido_metodo: null,
  pedido_referencia: null,
  pedido_entrega: null,
  pedido_anticipo: null,
  pedido_anticipo_estado: null,
  pedido_total: null,
};

const fila = (x: Partial<FilaRecaudoBD>): FilaRecaudoBD => ({ ...base, ...x });

/** Pedido contraentrega con anticipo de $20.000 pagado por Bold (forma real de la org 358). */
const anticipoBold = (id: string, metodo = 'nequi'): FilaRecaudoBD =>
  fila({
    pago_id: `a-${id}`,
    origen: 'web_order',
    metodo,
    procesador: 'bold',
    monto: '20000.00',
    pedido_id: id,
    pedido_numero: `WO-${id}`,
    pedido_estado: 'confirmed',
    pedido_estado_pago: 'partial',
    pedido_metodo: 'cash',
    pedido_entrega: 'delivery_own',
    pedido_anticipo: '20000.00',
    pedido_anticipo_estado: 'paid',
    pedido_total: '100000.00',
  });

/** Pedido pagado completo por el link de Bold: el pago queda en la factura de su venta. */
const completoBold = (id: string, monto: number): FilaRecaudoBD =>
  fila({
    pago_id: `c-${id}`,
    origen: 'invoice_sales',
    metodo: 'bold_link',
    procesador: 'bold',
    monto,
    venta_id: `v-${id}`,
    pedido_id: id,
    pedido_numero: `WO-${id}`,
    pedido_estado: 'confirmed',
    pedido_estado_pago: 'paid',
    pedido_metodo: 'bold_link',
    pedido_entrega: 'delivery_own',
    pedido_total: monto,
  });

describe('medio del pago', () => {
  it('la pasarela manda aunque el método sea el submétodo (Nequi o PSE por Bold)', () => {
    expect(medioDelPago(fila({ metodo: 'nequi', procesador: 'bold' }))).toBe('bold');
    expect(medioDelPago(fila({ metodo: 'pse', procesador: 'mercadopago' }))).toBe('mercadopago');
    expect(medioDelPago(fila({ metodo: 'bold_qr' }))).toBe('bold');
    expect(medioDelPago(fila({ metodo: 'mp' }))).toBe('mercadopago');
  });

  it('sin pasarela, el tipo del método', () => {
    expect(medioDelPago(fila({ metodo: 'cash' }))).toBe('efectivo');
    expect(medioDelPago(fila({ metodo: 'card' }))).toBe('datafono');
    expect(medioDelPago(fila({ metodo: 'transfer' }))).toBe('transferencia');
    expect(medioDelPago(fila({ metodo: 'sistecredito' }))).toBe('sistecredito');
  });

  it('los códigos del filtro de Ventas se agrupan en su medio', () => {
    expect(medioDeCodigo('bold_link')).toBe('bold');
    expect(mediosDeCodigos(['bold_link', 'bold_qr', 'cash'])).toEqual(['bold', 'efectivo']);
  });
});

describe('tipo del cobro', () => {
  it('anticipo de contraentrega, pago completo, cobro en puerta y tienda', () => {
    expect(tipoDelPago(anticipoBold('1'))).toBe('anticipo');
    expect(tipoDelPago(completoBold('2', 44000))).toBe('completo');
    const puerta = fila({ ...anticipoBold('1'), pago_id: 'z', origen: 'invoice_sales', metodo: 'cash', procesador: null, monto: 80000, venta_id: 'v1' });
    expect(tipoDelPago(puerta)).toBe('puerta');
    expect(tipoDelPago(fila({ metodo: 'cash', monto: 1000 }))).toBe('tienda');
  });

  it('un pedido de pasarela pagado en la tienda (sin anticipo) es completo, no anticipo', () => {
    const pagoPedido = fila({ ...completoBold('3', 50000), origen: 'web_order' });
    expect(tipoDelPago(pagoPedido)).toBe('completo');
  });
});

describe('totales (datos reales de la org 358 el 25 nov, al diseñar)', () => {
  // 5 completos por Bold = $347.600 y 11 anticipos por Bold = $220.000 → $567.600.
  const completos = [44000, 55900, 28900, 105900, 112900].map((m, i) => completoBold(`c${i}`, m));
  const anticipos = [
    ...Array.from({ length: 8 }, (_, i) => anticipoBold(`n${i}`, 'nequi')),
    anticipoBold('q1', 'bold_qr'),
    anticipoBold('q2', 'bold_qr'),
    anticipoBold('s1', 'pse'),
  ];
  const mp = [fila({ ...anticipoBold('m1', 'pse'), procesador: 'mercadopago' }), completoBold('m2', 24900)].map((f) => ({ ...f, procesador: 'mercadopago', metodo: f.metodo === 'bold_link' ? 'mp' : f.metodo }));
  const pagos = [...completos, ...anticipos, ...mp].map(pagoDeFila);

  it('Bold: 16 pagos, $567.600 = $347.600 completos + $220.000 anticipos', () => {
    const bold = totalesPorMedio(pagos).find((t) => t.medio === 'bold')!;
    expect(bold.pagos).toBe(16);
    expect(bold.monto).toBe(567600);
    expect(bold.porTipo.completo).toEqual({ pagos: 5, monto: 347600 });
    expect(bold.porTipo.anticipo).toEqual({ pagos: 11, monto: 220000 });
    expect(bold.pedidos).toBe(16);
  });

  it('filtrar por medio deja solo lo de ese medio', () => {
    const r = resumenRecaudo(filtrarPorMedio(pagos, ['bold']));
    expect(r.total).toEqual({ pagos: 16, monto: 567600 });
    expect(resumenRecaudo(filtrarPorMedio(pagos, [])).total.pagos).toBe(18);
  });

  it('el orden es de mayor a menor monto', () => {
    expect(totalesPorMedio(pagos).map((t) => t.medio)).toEqual(['bold', 'mercadopago']);
  });
});

describe('sin doble conteo', () => {
  it('un pedido pagado por partes aparece en cada medio y cada uno suma solo lo suyo', () => {
    const anticipo = anticipoBold('X');
    const saldo = fila({ ...anticipo, pago_id: 'saldo', origen: 'invoice_sales', metodo: 'cash', procesador: null, monto: 80000, venta_id: 'vX', pedido_estado_pago: 'paid' });
    const pagos = [anticipo, saldo].map(pagoDeFila);
    const t = totalesPorMedio(pagos);
    expect(t.find((x) => x.medio === 'bold')).toMatchObject({ pagos: 1, monto: 20000, pedidos: 1 });
    expect(t.find((x) => x.medio === 'efectivo')).toMatchObject({ pagos: 1, monto: 80000, pedidos: 1 });
    // El total es la suma de los pagos, no el total del pedido dos veces.
    expect(resumenRecaudo(pagos).total.monto).toBe(100000);
    expect(mediosPorPedido(pagos).get('X')).toEqual(new Set(['bold', 'efectivo']));
  });
});

describe('agrupar por día, semana y mes en la zona de la organización', () => {
  it('lunes de la semana (lunes a domingo)', () => {
    expect(lunesDe('2026-11-25')).toBe('2026-11-23'); // miércoles
    expect(lunesDe('2026-11-23')).toBe('2026-11-23'); // lunes
    expect(lunesDe('2026-11-29')).toBe('2026-11-23'); // domingo
    expect(lunesDe('2026-03-01')).toBe('2026-02-23'); // cruza el mes
  });

  it('un pago de las 21:30 de Bogotá es de ese día aunque en UTC ya sea el siguiente', () => {
    const iso = '2026-11-26T02:30:00Z'; // 25 nov 21:30 en Bogotá
    expect(claveGrupo(iso, 'dia', 'America/Bogota')).toBe('2026-11-25');
    expect(claveGrupo(iso, 'dia', 'UTC')).toBe('2026-11-26');
    expect(claveGrupo(iso, 'semana', 'America/Bogota')).toBe('2026-11-23');
    expect(claveGrupo('2026-12-01T03:00:00Z', 'mes', 'America/Bogota')).toBe('2026-11-01');
  });

  it('suma por grupo sin perder pagos', () => {
    const pagos = [
      pagoDeFila(fila({ pago_id: '1', fecha: '2026-11-24T15:00:00Z', monto: 100 })),
      pagoDeFila(fila({ pago_id: '2', fecha: '2026-11-25T15:00:00Z', monto: 50 })),
      pagoDeFila(fila({ pago_id: '3', fecha: '2026-11-26T02:00:00Z', monto: 25 })),
    ];
    const dias = agruparPorPeriodo(pagos, 'dia', 'America/Bogota');
    expect(dias.map((d) => [d.clave, d.total.monto])).toEqual([
      ['2026-11-24', 100],
      ['2026-11-25', 75],
    ]);
    expect(agruparPorPeriodo(pagos, 'semana', 'America/Bogota')).toHaveLength(1);
    expect(totalesPorSede(pagos)[0].total.monto).toBe(175);
  });
});
