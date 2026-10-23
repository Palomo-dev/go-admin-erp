import fs from 'fs';
import path from 'path';

/**
 * La subcuenta de sucursal se resuelve después de la configuración, sobre la
 * cuenta ya configurada. Sin fila de configuración, el movimiento sigue usando
 * la cuenta de la regla y su subcuenta. El rollback no borra asientos.
 */
describe('configuración antes de la subcuenta de sucursal', () => {
  const migracion = fs.readFileSync(
    path.join(process.cwd(), 'supabase/migrations/20261023061234_configuracion_subcuenta_sede.sql'),
    'utf8',
  );
  const rollback = fs.readFileSync(
    path.join(process.cwd(), 'supabase/rollbacks/20261023061234_configuracion_subcuenta_sede_rollback.sql'),
    'utf8',
  );

  it('aplica la configuración a la cuenta base y luego la subcuenta de esa cuenta', () => {
    expect(migracion).toContain('fn_cuenta_configurada_de_sede');
    expect(migracion).toContain('configuracion_antes_de_sede');
    expect(migracion).toContain("'stock_movements', 'debito'");
    expect(migracion).toContain("'sales', 'debito'");
    expect(migracion).toContain("'invoice_sales', 'debito'");
    expect(migracion).toContain(
      'revoke all on function public.fn_cuenta_configurada_de_sede(integer, integer, text, text, text) from public, anon, authenticated',
    );
    expect(migracion).toContain('No reclasifica asientos ya publicados');
    expect(migracion).not.toMatch(/create\s+or\s+replace\s+function\s+public\.fn_auto_journal_stock_movement\s*\(/i);
  });

  it('el rollback devuelve el mapeo anterior y no borra asientos', () => {
    expect(rollback).toContain('base_account_code = v_rule.debit_account_code');
    expect(rollback).toContain('Resolver sub-cuentas por sucursal');
    expect(rollback).toContain(
      'drop function if exists public.fn_cuenta_configurada_de_sede(integer, integer, text, text, text)',
    );
    expect(rollback).toContain('No borra asientos');
    expect(rollback).toContain('No reclasifica lo ya publicado');
    expect(rollback).not.toMatch(/delete\s+from\s+(journal_entries|journal_lines|stock_movements|sales|configuracion_contable)/i);
  });
});
