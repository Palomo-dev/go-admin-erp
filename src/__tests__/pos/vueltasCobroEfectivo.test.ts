/**
 * Cobro en efectivo con vueltas: el recibo registra solo lo cobrado (20261126010000) y el ajuste
 * de lo anterior en la org 377 (20261126020000).
 *
 * jest corre sin base. Las dos migraciones se probaron por el MCP de Supabase en transacciones
 * deshechas (`begin … rollback`) antes de aplicarlas (2026-11-25):
 *   Pago POS a una factura de $ 31.000 con amount 50.000 y change_amount 19.000 →
 *     amount 31.000, cash_received 50.000, change_given 19.000, change_amount 0;
 *     asiento Dr 1105 31.000 / Cr 1305 31.000 (tercero 222222222222); factura pagada, saldo 0.
 *   Otro pago en efectivo de 10.000 a la misma factura → 23514 PAGO_EXCEDE_SALDO (41.000 > 31.000).
 *   Vueltas iguales a lo entregado → 22023 VUELTAS_INVALIDAS.
 *   fn_invoice_sales_paid de las 8 facturas viejas = su total (ya no cuenta las vueltas).
 *   Ajuste: 6 asientos por $ 91.000 (RC-0001, 0007, 0008, 0009, 0012, 0020; arqueos cuadrados);
 *     RC-0018 y RC-0019 (caja 43, arqueo con $ 50.100 de sobrante físico) sin ajustar;
 *     1305 de la org 377: −104.000 → −13.000; 1305 sin tercero 0; cartera 0; asientos cuadrados.
 *   Rollback del ajuste: borra 6 asientos y 12 líneas; la 1305 vuelve a −104.000.
 */
import * as fs from 'fs';
import * as path from 'path';
import { recibidoPago, valorAplicadoPago, vueltasPago } from '@/lib/finanzas/pagos/vueltas';
import { totalPagado } from '@/lib/pos/ventas/documentosVenta';
import { valorAplicado } from '@/lib/documents/server/base';

const RAIZ = path.resolve(__dirname, '..', '..', '..');
const leer = (rel: string): string => fs.readFileSync(path.join(RAIZ, rel), 'utf8');
const sql = leer('supabase/migrations/20261126010000_pagos_vueltas_solo_lo_cobrado.sql');
const rollback = leer('supabase/rollbacks/20261126010000_pagos_vueltas_solo_lo_cobrado_rollback.sql');
const ajuste = leer('supabase/migrations/20261126020000_ajuste_vueltas_recaudo_org377.sql');
const ajusteRollback = leer('supabase/rollbacks/20261126020000_ajuste_vueltas_recaudo_org377_rollback.sql');

/** Doble en memoria de fn_trg_payments_vueltas (misma regla que la base). */
function normalizar(p: { amount: number; change_amount: number; payment_group_id?: string | null; recibidoGrupo?: number }) {
  const vueltas = Math.round(p.change_amount * 100) / 100;
  if (vueltas === 0) return { amount: p.amount, change_amount: 0, cash_received: null, change_given: null };
  if (p.payment_group_id) {
    return { amount: p.amount, change_amount: 0, cash_received: p.recibidoGrupo ?? p.amount + vueltas, change_given: vueltas };
  }
  if (vueltas >= p.amount) throw new Error('VUELTAS_INVALIDAS');
  return { amount: p.amount - vueltas, change_amount: 0, cash_received: p.amount, change_given: vueltas };
}

describe('cobro en efectivo con vueltas registra solo lo cobrado', () => {
  test('POS: entrega 50.000 por una cuenta de 31.000 → el pago y su asiento quedan en 31.000', () => {
    const fila = normalizar({ amount: 50000, change_amount: 19000 });
    expect(fila).toEqual({ amount: 31000, change_amount: 0, cash_received: 50000, change_given: 19000 });
    // El asiento del recibo usa amount − change_amount: lo cobrado, no lo entregado.
    expect(valorAplicadoPago(fila)).toBe(31000);
    expect(vueltasPago(fila)).toBe(19000);
    expect(recibidoPago(fila)).toBe(50000);
  });

  test('cartera (recibo con grupo): amount ya es lo aplicado; las vueltas pasan a dato informativo', () => {
    const fila = normalizar({ amount: 80000, change_amount: 20000, payment_group_id: 'g', recibidoGrupo: 100000 });
    expect(fila).toEqual({ amount: 80000, change_amount: 0, cash_received: 100000, change_given: 20000 });
    expect(valorAplicadoPago(fila)).toBe(80000);
  });

  test('vueltas iguales o mayores que lo entregado: se rechaza', () => {
    expect(() => normalizar({ amount: 5000, change_amount: 5000 })).toThrow('VUELTAS_INVALIDAS');
  });

  test('pagos viejos del POS (amount = entregado, change_amount = vueltas): misma lectura', () => {
    const viejo = { amount: 300000, change_amount: 15000 };
    expect(valorAplicadoPago(viejo)).toBe(285000);
    expect(vueltasPago(viejo)).toBe(15000);
    expect(recibidoPago(viejo)).toBe(300000);
    expect(valorAplicado(viejo)).toBe(285000);
    expect(valorAplicadoPago({ amount: 50000, change_amount: '22000.01' })).toBe(27999.99);
  });

  test('el pagado de una venta no cuenta las vueltas', () => {
    expect(totalPagado([
      { id: 1, source: 'invoice_sales', source_id: 'f', amount: 300000, change_amount: 15000, status: 'completed' },
      { id: 2, source: 'invoice_sales', source_id: 'f', amount: 31000, status: 'completed' },
    ])).toBe(316000);
  });
});

describe('migración 20261126010000', () => {
  test('columnas informativas NULL-ables, sin asiento', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS cash_received numeric NULL;/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS change_given numeric NULL;/);
    expect(sql).not.toMatch(/(cash_received|change_given) numeric NOT NULL/);
  });

  test('normaliza al insertar: amount − vueltas, change_amount a 0', () => {
    expect(sql).toMatch(/CREATE TRIGGER trg_00_payments_vueltas\s+BEFORE INSERT ON public\.payments/);
    expect(sql).toMatch(/new\.amount := new\.amount - v_vueltas;/);
    expect(sql).toMatch(/new\.change_given := v_vueltas;\s+new\.change_amount := 0;/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.fn_trg_payments_vueltas\(\) FROM PUBLIC, anon, authenticated;/);
  });

  test('el asiento del recibo y el pagado de la factura usan lo aplicado', () => {
    expect(sql).toMatch(/v_monto numeric := COALESCE\(NEW\.amount, 0\) - COALESCE\(NEW\.change_amount, 0\);/);
    const cuerpo = sql.slice(sql.indexOf('FUNCTION public.fn_auto_journal_payment()'), sql.indexOf('FUNCTION public.fn_invoice_sales_paid'));
    expect(cuerpo).not.toMatch(/p_amount := NEW\.amount/);
    expect(cuerpo.match(/p_amount := v_monto \+ v_discount/g)).toHaveLength(2);
    expect(sql).toMatch(/sum\(p\.amount - coalesce\(p\.change_amount, 0\)\s+\+ case when p\.source = 'account_receivable'/);
  });

  test('un cobro en efectivo no aplica más que el saldo: restricción diferida al COMMIT', () => {
    expect(sql).toMatch(/CREATE CONSTRAINT TRIGGER zz_payments_no_excede_saldo\s+AFTER INSERT ON public\.payments\s+DEFERRABLE INITIALLY DEFERRED/);
    expect(sql).toMatch(/WHEN \(NEW\.method = 'cash' AND NEW\.source IN \('invoice_sales', 'sale'\)\)/);
    expect(sql).toMatch(/PAGO_EXCEDE_SALDO/);
    // La propina no es línea de la factura: cuenta en el límite.
    expect(sql).toMatch(/v_limite := v_inv\.total \+ coalesce\(v_sale\.tip_amount, 0\);/);
  });

  test('el rollback quita triggers y devuelve las funciones, sin borrar datos', () => {
    expect(rollback).toMatch(/DROP TRIGGER IF EXISTS zz_payments_no_excede_saldo/);
    expect(rollback).toMatch(/DROP TRIGGER IF EXISTS trg_00_payments_vueltas/);
    expect(rollback).toMatch(/p_amount := NEW\.amount \+ v_discount/);
    expect(rollback).not.toMatch(/^ALTER TABLE public\.payments DROP COLUMN/m);
  });
});

describe('ajuste 20261126020000 (org 377)', () => {
  test('Dr 1305 con el tercero del recibo / Cr la caja que debitó el recibo, enlazado y con fact_key único', () => {
    expect(ajuste).toMatch(/where p\.organization_id = 377/);
    expect(ajuste).toMatch(/'vueltas_recaudo:' \|\| v_r\.id::text, 'nota_contable'/);
    expect(ajuste).toMatch(/'Corrección vueltas registradas como recaudo · recibo ' \|\| v_r\.recibo/);
    expect(ajuste).toMatch(/values \(v_entry, v_t\.cuenta, v_memo, v_r\.diferencia, 0, v_t\.nit, v_t\.nombre\)/);
    expect(ajuste).toMatch(/values \(v_entry, v_r\.cuenta_caja, v_memo, 0, v_r\.diferencia\)/);
  });

  test('solo con arqueo cuadrado: si sobró plata o no hay arqueo, no se ajusta', () => {
    expect(ajuste).toMatch(/if v_r\.caja is null or v_r\.dif_arqueo is null or abs\(v_r\.dif_arqueo\) > 1 then/);
    expect(ajuste).toMatch(/count_type = 'closing'/);
  });

  test('no edita asientos originales ni pagos; el rollback borra solo esos ajustes', () => {
    expect(ajuste).not.toMatch(/update public\.(journal_entries|journal_lines|payments)/i);
    expect(ajuste).not.toMatch(/delete from/i);
    expect(ajusteRollback).toMatch(/e\.fact_key like 'vueltas_recaudo:%'/);
  });
});
