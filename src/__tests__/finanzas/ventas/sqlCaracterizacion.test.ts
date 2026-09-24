/**
 * Facturas de venta y cartera — caracterización en SQL (plan §2, L1, L2, L4, L17).
 *
 * jest corre en `node` sin base: las pruebas SQL se ejecutan por el MCP de
 * Supabase en una transacción que se deshace (`DO … RAISE EXCEPTION`) y su
 * resultado se anota aquí, junto a la migración que fija el comportamiento. Lo
 * que sí corre en jest: que las migraciones versionadas sigan diciendo lo que
 * la base hace (un cambio que las contradiga rompe esta prueba).
 */
import * as fs from 'fs';
import * as path from 'path';

const RAIZ = path.resolve(__dirname, '..', '..', '..', '..');
const leer = (rel: string): string => fs.readFileSync(path.join(RAIZ, rel), 'utf8');

describe('L1 · un pago solo inserta en payments; los disparadores mandan (20260926100000)', () => {
  const sql = leer('supabase/migrations/20260926100000_cartera_abonos_simetricos.sql');
  const rollback = leer('supabase/rollbacks/20260926100000_cartera_abonos_simetricos_rollback.sql');

  /**
   * Dry-run 2026-09-24 (factura emitida de 5.000 con su cartera, transacción deshecha):
   *   abono 2.000            → factura 3.000/partial · cartera 3.000/partial
   *   abono 3.000            → factura 0/paid        · cartera 0/paid
   *   anular el de 3.000     → factura 3.000/partial · cartera 3.000/partial
   *   anular el de 2.000     → factura 5.000/issued  · cartera 5.000/current
   *   cartera sin factura    → 71.400/overdue → abono 1.400 → 70.000/partial → anular → 71.400/overdue
   *   los 63 abonos reales   → 0 facturas cuyo saldo cambie con el cálculo nuevo
   */
  test('el recálculo de la factura incluye los abonos de cartera', () => {
    expect(sql).toMatch(/WHERE src IN \('invoice_sales', 'invoice_purchase', 'sale', 'account_payable', 'account_receivable'\)/);
    expect(sql).toMatch(/SELECT invoice_id INTO v_invoice_id FROM accounts_receivable WHERE id = r\.sid::uuid/);
  });

  test('sin pagos vivos la factura vuelve a emitida', () => {
    expect(sql).toMatch(/ELSIF v_status IN \('paid', 'partial'\) THEN\s+-- [^\n]*\n\s+v_new_status := 'issued'/);
  });

  test('el disparador de cartera corre en INSERT, UPDATE y DELETE y trabaja por diferencia', () => {
    expect(sql).toMatch(/after insert or update or delete on public\.payments/);
    expect(sql).toMatch(/WHERE TG_OP <> 'INSERT' AND OLD\.source = 'account_receivable'/);
    // Con factura no escribe saldos: los pone el recálculo.
    expect(sql).not.toMatch(/UPDATE invoice_sales\s+SET\s+balance = new_balance/);
  });

  test('cierres de seguridad: anon fuera de assistant_void_sales_invoice y sin DELETE de pagos', () => {
    expect(sql).toMatch(/revoke execute on function public\.assistant_void_sales_invoice\(integer, uuid, uuid\) from anon/);
    expect(sql).toMatch(/drop policy if exists payments_delete_policy on public\.payments/);
  });

  test('el rollback restaura el disparador solo-INSERT y la política', () => {
    expect(rollback).toMatch(/after insert on public\.payments/);
    expect(rollback).toMatch(/create policy payments_delete_policy/);
  });
});
