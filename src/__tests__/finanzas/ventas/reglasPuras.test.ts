/**
 * Facturas de venta y cartera — lógica pura extraída antes del rediseño
 * (plan docs/implementacion/FACTURAS-VENTA-CXC-PLAN.md, P0 y §2).
 *
 * L3 debeDescontarStock · L4 puedeAnular · L6 tramoAntiguedad · L9 repartirFifo.
 * Las mismas reglas las vuelve a aplicar la base (fn_registrar_pago,
 * fn_factura_venta_anular); aquí se fija el contrato que la interfaz consume.
 */
import {
  monedaComun,
  ordenarFifo,
  repartirFifo,
  validarAplicaciones,
  type DocumentoAbierto,
} from '@/lib/finanzas/pagos/reparto';
import { rangoTramo, resumirAntiguedad, tramoAntiguedad } from '@/lib/finanzas/cartera/antiguedad';
import {
  accionesFactura,
  debeDescontarStock,
  estadoPagoFactura,
  puedeAnular,
  tienePagosAplicados,
} from '@/lib/finanzas/ventas/reglasFactura';

const doc = (id: string, saldo: number, vencimiento: string | null, extra: Partial<DocumentoAbierto> = {}): DocumentoAbierto => ({
  id,
  saldo,
  moneda: 'COP',
  vencimiento,
  emision: '2026-01-01',
  ...extra,
});

describe('L9 · repartirFifo', () => {
  const docs = [doc('c', 300, '2026-03-01'), doc('a', 100, '2026-01-15'), doc('b', 200, '2026-02-01')];

  test('una sola factura, pago parcial', () => {
    const r = repartirFifo(50, [doc('x', 100, '2026-01-01')]);
    expect(r).toEqual({ ok: true, aplicaciones: [{ id: 'x', monto: 50 }], aplicado: 50, sobrante: 0, moneda: 'COP' });
  });

  test('varias: de la más antigua a la más nueva', () => {
    const r = repartirFifo(250, docs);
    expect(r.ok && r.aplicaciones).toEqual([
      { id: 'a', monto: 100 },
      { id: 'b', monto: 150 },
    ]);
  });

  test('saldo exacto de todas', () => {
    const r = repartirFifo(600, docs);
    expect(r.ok && r.sobrante).toBe(0);
    expect(r.ok && r.aplicaciones.map((a) => a.id)).toEqual(['a', 'b', 'c']);
  });

  test('sobrante sin casilla → excede; con casilla → saldo a favor', () => {
    expect(repartirFifo(700, docs)).toEqual({ ok: false, error: 'excede' });
    const r = repartirFifo(700, docs, { permitirSobrante: true });
    expect(r.ok && r.sobrante).toBe(100);
    expect(r.ok && r.aplicado).toBe(600);
  });

  test('moneda distinta bloquea', () => {
    expect(repartirFifo(10, [doc('a', 10, null), doc('b', 10, null, { moneda: 'USD' })])).toEqual({ ok: false, error: 'moneda_distinta' });
  });

  test('monto inválido y sin documentos abiertos', () => {
    expect(repartirFifo(0, docs)).toEqual({ ok: false, error: 'monto_invalido' });
    expect(repartirFifo(Number.NaN, docs)).toEqual({ ok: false, error: 'monto_invalido' });
    expect(repartirFifo(10, [doc('a', 0, null)])).toEqual({ ok: false, error: 'sin_documentos' });
  });

  test('desempate por emisión y por id; sin vencimiento al final', () => {
    const orden = ordenarFifo([
      doc('z', 1, null),
      doc('y', 1, '2026-01-01', { emision: '2025-12-02' }),
      doc('x', 1, '2026-01-01', { emision: '2025-12-01' }),
      doc('w', 1, '2026-01-01', { emision: '2025-12-01' }),
    ]);
    expect(orden.map((d) => d.id)).toEqual(['w', 'x', 'y', 'z']);
  });

  test('centavos: sin errores de coma flotante', () => {
    const r = repartirFifo(0.3, [doc('a', 0.1, '2026-01-01'), doc('b', 0.2, '2026-01-02')]);
    expect(r.ok && r.aplicaciones).toEqual([
      { id: 'a', monto: 0.1 },
      { id: 'b', monto: 0.2 },
    ]);
    expect(r.ok && r.sobrante).toBe(0);
  });

  test('validarAplicaciones: monto por fila ≤ saldo, sin repetidos', () => {
    expect(validarAplicaciones([{ id: 'a', monto: 100 }, { id: 'b', monto: 5 }], docs)).toEqual({ ok: true, total: 105 });
    expect(validarAplicaciones([{ id: 'a', monto: 101 }], docs)).toEqual({ ok: false, id: 'a', error: 'excede_saldo' });
    expect(validarAplicaciones([{ id: 'a', monto: 1 }, { id: 'a', monto: 1 }], docs)).toEqual({ ok: false, id: 'a', error: 'repetido' });
    expect(validarAplicaciones([{ id: 'q', monto: 1 }], docs)).toEqual({ ok: false, id: 'q', error: 'documento_desconocido' });
    expect(validarAplicaciones([{ id: 'a', monto: 0 }], docs)).toEqual({ ok: false, id: 'a', error: 'monto_invalido' });
  });

  test('monedaComun', () => {
    expect(monedaComun([{ moneda: 'cop' }, { moneda: 'COP' }])).toBe('COP');
    expect(monedaComun([{ moneda: 'COP' }, { moneda: 'USD' }])).toBeNull();
  });
});

describe('L6 · tramoAntiguedad (compartido con CxP)', () => {
  test('cinco tramos', () => {
    expect([-3, 0, 1, 30, 31, 60, 61, 90, 91, 400].map(tramoAntiguedad)).toEqual([
      'al_dia', 'al_dia', 'd1_30', 'd1_30', 'd31_60', 'd31_60', 'd61_90', 'd61_90', 'd90_mas', 'd90_mas',
    ]);
    expect(tramoAntiguedad(null)).toBe('al_dia');
  });

  test('resumen por tramo en orden fijo; pagadas no cuentan', () => {
    const r = resumirAntiguedad([
      { saldo: 100, dias: 0 },
      { saldo: 50.5, dias: 12 },
      { saldo: 49.5, dias: 29 },
      { saldo: 0, dias: 200 },
      { saldo: 10, dias: 95 },
    ]);
    expect(r).toEqual([
      { tramo: 'al_dia', saldo: 100, cuentas: 1 },
      { tramo: 'd1_30', saldo: 100, cuentas: 2 },
      { tramo: 'd31_60', saldo: 0, cuentas: 0 },
      { tramo: 'd61_90', saldo: 0, cuentas: 0 },
      { tramo: 'd90_mas', saldo: 10, cuentas: 1 },
    ]);
  });

  test('rango de días por tramo (filtro en servidor)', () => {
    expect(rangoTramo('d31_60')).toEqual({ desde: 31, hasta: 60 });
    expect(rangoTramo('d90_mas')).toEqual({ desde: 91, hasta: null });
  });
});

describe('L4 · puedeAnular (AnularFacturaDialog.tsx:64-77)', () => {
  test('emitida sin pagos: se puede', () => {
    expect(puedeAnular({ status: 'issued', total: 100, balance: 100 })).toEqual({ ok: true });
  });
  test('con pagos: no (va por nota crédito)', () => {
    expect(tienePagosAplicados({ total: 100, balance: 40 })).toBe(true);
    expect(puedeAnular({ status: 'partial', total: 100, balance: 40 })).toEqual({ ok: false, motivo: 'con_pagos' });
    expect(puedeAnular({ status: 'paid', total: '100', balance: '0' })).toEqual({ ok: false, motivo: 'con_pagos' });
  });
  test('total 0 no cuenta como pagada (igual que hoy)', () => {
    expect(puedeAnular({ status: 'issued', total: 0, balance: 0 })).toEqual({ ok: true });
  });
  test('ya anulada, nota crédito o FE aceptada', () => {
    expect(puedeAnular({ status: 'void', total: 1, balance: 1 })).toEqual({ ok: false, motivo: 'ya_anulada' });
    expect(puedeAnular({ status: 'issued', total: 1, balance: 1, document_type: 'credit_note' })).toEqual({ ok: false, motivo: 'nota_credito' });
    expect(puedeAnular({ status: 'issued', total: 1, balance: 1, einvoice_status: 'accepted' })).toEqual({ ok: false, motivo: 'fe_aceptada' });
  });
});

describe('L3 · debeDescontarStock (DetalleFactura.tsx:579-619)', () => {
  const lineas = [{ product_id: 7 }, { product_id: null }];
  test('factura manual con productos: sí', () => {
    expect(debeDescontarStock({ sale_id: null }, [], lineas)).toBe(true);
  });
  test('factura del POS cuyo kardex ya salió: no', () => {
    expect(debeDescontarStock({ sale_id: 's1' }, [{ source: 'sale' }], lineas)).toBe(false);
    expect(debeDescontarStock({ sale_id: 's1' }, [{ source: 'mesa_sale' }], lineas)).toBe(false);
    expect(debeDescontarStock({ sale_id: 's1' }, [{ source: 'web_sale' }], lineas)).toBe(false);
  });
  test('con venta pero sin movimientos previos: sí', () => {
    expect(debeDescontarStock({ sale_id: 's1' }, [{ source: 'invoice_void' }], lineas)).toBe(true);
  });
  test('sin productos: no', () => {
    expect(debeDescontarStock({ sale_id: null }, [], [{ product_id: null }])).toBe(false);
  });
});

describe('accionesFactura y estadoPagoFactura', () => {
  const todos = { ver: true, crear: true, anular: true, aprobar: true };
  const soloVer = { ver: true, crear: false, anular: false, aprobar: false };

  test('borrador: editar y emitir, nunca registrar pago', () => {
    const a = accionesFactura({ status: 'draft', total: 10, balance: 10 }, todos);
    expect(a.has('editar') && a.has('emitir')).toBe(true);
    expect(a.has('registrar_pago')).toBe(false);
  });

  test('emitida con saldo: registrar pago, anular, nota crédito, enviar a la DIAN', () => {
    const a = accionesFactura({ status: 'issued', total: 10, balance: 10 }, todos);
    for (const x of ['registrar_pago', 'anular', 'nota_credito', 'enviar_dian', 'imprimir', 'enviar'] as const) {
      expect(a.has(x)).toBe(true);
    }
  });

  test('pagada: ni pago ni anular; sí nota crédito', () => {
    const a = accionesFactura({ status: 'paid', total: 10, balance: 0 }, todos);
    expect(a.has('registrar_pago')).toBe(false);
    expect(a.has('anular')).toBe(false);
    expect(a.has('nota_credito')).toBe(true);
  });

  test('sin permisos de escritura: solo imprimir y enviar', () => {
    const a = accionesFactura({ status: 'issued', total: 10, balance: 10 }, soloVer);
    expect([...a].sort()).toEqual(['enviar', 'imprimir']);
  });

  test('FE en cola o aceptada: no se reenvía a la DIAN', () => {
    expect(accionesFactura({ status: 'issued', total: 1, balance: 1, einvoice_status: 'pending' }, todos).has('enviar_dian')).toBe(false);
    expect(accionesFactura({ status: 'issued', total: 1, balance: 1, einvoice_status: 'rejected' }, todos).has('enviar_dian')).toBe(true);
  });

  test('estado de pago derivado', () => {
    expect(estadoPagoFactura({ status: 'draft', total: 1, balance: 1 })).toBe('borrador');
    expect(estadoPagoFactura({ status: 'void', total: 1, balance: 0 })).toBe('anulada');
    expect(estadoPagoFactura({ status: 'paid', total: 1, balance: 0 })).toBe('pagada');
    expect(estadoPagoFactura({ status: 'partial', total: 10, balance: 4, dias_vencida: 3 })).toBe('vencida');
    expect(estadoPagoFactura({ status: 'partial', total: 10, balance: 4 })).toBe('parcial');
    expect(estadoPagoFactura({ status: 'issued', total: 10, balance: 10 })).toBe('pendiente');
  });
});
