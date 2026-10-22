import fs from 'fs';
import path from 'path';

/**
 * La transferencia ya publica el asiento en la misma transacción del registro.
 * Este contrato fija el lado: débito la cuenta del banco destino, crédito la
 * del origen. Anular invierte las dos.
 */
describe('asiento de transferencia bancaria', () => {
  const sql = fs.readFileSync(
    path.join(process.cwd(), 'supabase/migrations/20260923070000_transferencia_bancaria_asiento_real_y_contrasiento.sql'),
    'utf8',
  );

  it('debita el banco destino y acredita el origen', () => {
    expect(sql).toContain('v_debito  := COALESCE(v_destino.account_code, v_rule.debit_account_code)');
    expect(sql).toContain('v_credito := COALESCE(v_origen.account_code,  v_rule.credit_account_code)');
    expect(sql).toMatch(/p_debit_account := v_debito/);
    expect(sql).toMatch(/p_credit_account := v_credito/);
  });

  it('la anulación invierte débito y crédito', () => {
    const anulacion = sql.slice(sql.indexOf('IF v_anulada THEN'), sql.indexOf('ELSE'));
    expect(anulacion).toContain('p_debit_account := v_credito');
    expect(anulacion).toContain('p_credit_account := v_debito');
  });
});

describe('fase 6 no reemplaza el asiento genérico', () => {
  const dir = path.join(process.cwd(), 'supabase/migrations');
  const archivos = fs.readdirSync(dir).filter((n) => n.includes('fase6_'));

  it('hay migración de extracto y de cierre, sin tocar fn_create_journal_entry', () => {
    expect(archivos.length).toBeGreaterThanOrEqual(2);
    const texto = archivos.map((n) => fs.readFileSync(path.join(dir, n), 'utf8')).join('\n');
    expect(texto).not.toMatch(/create\s+or\s+replace\s+function\s+public\.fn_create_journal_entry/i);
    expect(texto).not.toMatch(/create\s+or\s+replace\s+function\s+public\.fn_auto_journal_bank/i);
    expect(texto).not.toMatch(/fn_auto_journal_cash_movement/i);
    expect(texto).toContain('saldo que sigue abierto');
    expect(texto).toContain('3605');
    expect(texto).toContain('3610');
    expect(texto).toContain('fn_is_period_open');
    expect(texto).toContain('fn_extracto_crear_movimiento');
    expect(texto).toContain('periodo_cerrado');
  });
});
