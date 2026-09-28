/**
 * Saldos a favor (`credit_notes` + `credit_note_applications`) — caracterización en SQL.
 *
 * jest corre sin base: las pruebas SQL se ejecutan por el MCP de Supabase en una
 * transacción que se deshace (`DO … RAISE EXCEPTION`) y su resultado se anota
 * aquí, junto a la migración que fija el comportamiento. Lo que corre en jest:
 * que las migraciones versionadas sigan diciendo lo que la base hace.
 */
import * as fs from 'fs';
import * as path from 'path';

const RAIZ = path.resolve(__dirname, '..', '..', '..', '..');
const leer = (rel: string): string => fs.readFileSync(path.join(RAIZ, rel), 'utf8');

describe('1 · la regla única del saldo de la factura cuenta las aplicaciones (20260928140000)', () => {
  const sql = leer('supabase/migrations/20260928140000_saldo_favor_1_regla_unica_cuenta_aplicaciones.sql');
  const rollback = leer('supabase/rollbacks/20260928140000_saldo_favor_1_regla_unica_cuenta_aplicaciones_rollback.sql');

  /**
   * Dry-run 2026-09-28 (administrador de la org 144, factura emitida de 7.400,
   * saldo a favor de 1.000 del mismo cliente, transacción deshecha):
   *   ANTES   aplicar 600 → 6.800/partial · pago 100 → 7.300 (se devolvieron los 600) · pagado = 100
   *   DESPUÉS aplicar 600 → 6.800/partial · pago 100 → 6.700 · recálculo → 6.700 · cartera 6.700 · pagado = 700
   * Daño en datos: 0 aplicaciones en la base → 0 facturas con saldo distinto por este motivo.
   * (Hay 1 factura de la org 149 «pagada sin pago» por otra causa, anterior y ajena a esto.)
   */
  test('fn_invoice_sales_paid suma las aplicaciones de saldo a favor una sola vez', () => {
    expect(sql).toMatch(/create or replace function public\.fn_invoice_sales_paid\(p_invoice_id uuid\)/);
    expect(sql.match(/from public\.credit_note_applications a where a\.invoice_id = p_invoice_id/g)).toHaveLength(1);
    // No se cuenta dos veces: acreditado sigue siendo solo notas crédito.
    expect(sql).not.toMatch(/fn_invoice_sales_acreditado/);
  });

  test('un disparador recalcula la factura con la regla única en cada cambio de aplicación', () => {
    expect(sql).toMatch(/after insert or update or delete on public\.credit_note_applications/);
    expect(sql).toMatch(/perform public\.fn_factura_venta_recalcular_saldo\(new\.invoice_id\)/);
    expect(sql).toMatch(/revoke all on function public\.fn_trg_aplicacion_saldo_favor_recalcula_factura\(\) from public, anon, authenticated/);
  });

  test('fn_apply_customer_credit deja de escribir el saldo de la factura', () => {
    expect(sql).not.toMatch(/update public\.invoice_sales/i);
  });

  test('el rollback quita el disparador y restaura la versión anterior', () => {
    expect(rollback).toMatch(/drop trigger if exists trg_aplicacion_saldo_favor_recalcula_factura/);
    expect(rollback).toMatch(/UPDATE public\.invoice_sales\s+SET balance = v_new_inv_balance/);
  });
});
