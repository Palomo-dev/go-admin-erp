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

describe('2 · aplicar un saldo a favor, validado en la base (20260928140100)', () => {
  const sql = leer('supabase/migrations/20260928140100_saldo_favor_2_aplicar_validado.sql');
  const rollback = leer('supabase/rollbacks/20260928140100_saldo_favor_2_aplicar_validado_rollback.sql');

  /**
   * Dry-run 2026-09-28 (org 144, factura emitida de 7.400, saldo de 1.000 del
   * mismo cliente, transacción deshecha):
   *   aplicar 300 (clave k1)          → saldo 700 · factura 7.100/partial · asiento Cr 1305 (cuenta de la org)
   *   misma clave                     → repetida=true, 1 sola aplicación; created_by = auth.uid()
   *   misma clave, otro monto         → clave_idempotencia_reutilizada
   *   factura de otro cliente         → cliente_distinto
   *   800 con 700 disponibles         → monto_excede_saldo_a_favor
   *   p_organization_id de otra org   → saldo_no_encontrado
   *   monto 0                         → monto_invalido
   *   vencido ayer (zona de la org)   → saldo_vencido;  vence hoy → se aplica
   *   factura en borrador / anulada   → documento_borrador / documento_anulado
   *   miembro sin finance.create      → sin_permiso (42501)
   *   sin sesión                      → no_autenticado
   */
  test('autor de la sesión, permiso finance.create e idempotencia en la base', () => {
    expect(sql).toMatch(/v_uid uuid := auth\.uid\(\)/);
    expect(sql).toMatch(/fn_finanzas_exigir_permiso\(v_org, array\['finance\.create'\]\)/);
    expect(sql).toMatch(/pg_advisory_xact_lock\(hashtextextended\('saldo_favor_aplicar:'/);
    expect(sql).toMatch(/values \(v_org, p_credit_id, p_invoice_id, v_monto, v_uid, p_clave_idempotencia\)/);
    expect(sql).not.toMatch(/p_created_by uuid/);
  });

  test('valida cliente, tipo, estado, sucursal, moneda, vencimiento y saldos', () => {
    for (const codigo of [
      'cliente_distinto',
      'documento_invalido',
      'documento_borrador',
      'documento_anulado',
      'sin_acceso_sucursal',
      'moneda_distinta',
      'saldo_vencido',
      'monto_excede_saldo_a_favor',
      'monto_excede_saldo',
      'saldo_no_encontrado',
    ]) {
      expect(sql).toMatch(new RegExp(`raise exception '${codigo}'`));
    }
    expect(sql).toMatch(/\(p_expiry at time zone public\.fn_timezone_for\(p_org, p_branch\)\)::date < public\.fn_today_for\(p_org, p_branch\)/);
  });

  test('asiento contra la cuenta por cobrar de la organización, con fact_key y verificado', () => {
    expect(sql).toMatch(/select debit_account_code into v_cxc from public\.fn_regla_devengo_venta\(v_org\)/);
    expect(sql).toMatch(/p_credit_account := v_cxc/);
    expect(sql).not.toMatch(/p_credit_account := '1305'/);
    expect(sql).toMatch(/p_fact_key := 'customer_credit_application:' \|\| v_app\.id::text/);
    expect(sql).toMatch(/if v_entry is null then\s+raise exception 'asiento_no_creado'/);
  });

  test('no escribe el saldo de la factura y cierra anon', () => {
    expect(sql).not.toMatch(/update public\.invoice_sales/i);
    expect(sql).toMatch(/revoke all on function public\.fn_apply_customer_credit\(uuid, uuid, numeric, text, integer\) from public, anon/);
  });

  test('el rollback vuelve a la firma anterior', () => {
    expect(rollback).toMatch(/drop function if exists public\.fn_apply_customer_credit\(uuid, uuid, numeric, text, integer\)/);
    expect(rollback).toMatch(/create or replace function public\.fn_apply_customer_credit\(p_credit_id uuid, p_invoice_id uuid, p_amount numeric, p_created_by uuid/);
  });
});
