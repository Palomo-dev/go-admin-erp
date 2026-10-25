/**
 * Contrato de la migración de cuentas por movimiento de stock.
 *
 * La apertura va a inventario / 3105, el ajuste de entrada no acredita la
 * clase 6, el lote de la org 338 se revierte sin borrar asientos y un segundo
 * paso del mismo movimiento no crea otro asiento (fact_key + índice único).
 */
import * as fs from 'fs';
import * as path from 'path';

const dir = path.join(process.cwd(), 'supabase', 'migrations');

function migracion(): string {
  const nombres = fs.readdirSync(dir).filter((f) => f.endsWith('_cuentas_movimiento_stock.sql'));
  expect(nombres).toHaveLength(1);
  return fs.readFileSync(path.join(dir, nombres[0]), 'utf8');
}

function cuerpoDisparador(sql: string): string {
  const inicio = sql.search(/function\s+public\.fn_auto_journal_stock_movement\s*\(/i);
  expect(inicio).toBeGreaterThanOrEqual(0);
  return sql.slice(inicio);
}

describe('cuentas por movimiento de stock', () => {
  const sql = migracion();
  const disparador = cuerpoDisparador(sql);

  it('no contabiliza compras ni traslados, y la apertura sí entra', () => {
    const exclusion = disparador.match(/if\s+new\.source\s+in\s*\(([^)]*)\)\s*then\s*return\s+new/i);
    expect(exclusion).not.toBeNull();
    for (const origen of ['purchase', 'purchase_order', 'purchase_invoice', 'purchase_void', 'transfer', 'transfer_out', 'transfer_in']) {
      expect(exclusion![1]).toContain(`'${origen}'`);
    }
    expect(exclusion![1]).not.toContain("'initial'");
  });

  it('fija la clave del movimiento y no cruza el débito con el crédito', () => {
    expect(sql).toContain("'stock_movement:' || new.id::text");
    expect(sql).toContain('create unique index if not exists uq_journal_entries_fact_key');
    expect(disparador).not.toMatch(/v_credit_account,\s*v_debit_account/);
    expect(disparador).toContain('v_debit_account');
    expect(disparador).toContain('v_credit_account');
  });

  it('usa patrimonio, ingreso, gasto y costo de venta', () => {
    expect(sql).toContain("'3105'");
    expect(sql).toContain("'4250'");
    expect(sql).toContain("'5150'");
    // 6135 pasa a título: las reglas por defecto publican al auxiliar 61350501 (134040).
    const p1 = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20261025134040_p1_siembra_auxiliares_movimiento.sql'), 'utf8');
    const siembra = p1;
    // La regla de costo de la venta usa v_cmv y v_cmv cae a 61350501 (comercio) o 61400501 (H/R).
    expect(siembra).toMatch(/'inventory',\s*'sale',\s*v_cmv,\s*v_inv/);
    expect(siembra).toMatch(/when\s+v_cmv\s*=\s*'6135'\s+or\s+v_cmv\s+is\s+null\s+then\s+'61350501'/);
    expect(siembra).toMatch(/when\s+v_type\s+in\s*\(1,\s*2\)\s+then\s+'61400501'/);
    expect(siembra).toMatch(/'inventory',\s*'loss',\s*v_merma,\s*v_inv/);
    expect(sql).toContain('on conflict on constraint accounting_rules_unique do nothing');
  });

  it('fn_cuentas_movimiento_stock (134020) no cae a 1405: respaldo auxiliar 1435 / 14350101', () => {
    const p1 = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20261025134020_p1_reglas_saldos_iniciales_37050501.sql'), 'utf8');
    const ini = p1.search(/function\s+public\.fn_cuentas_movimiento_stock\s*\(/i);
    expect(ini).toBeGreaterThan(-1);
    const resto = p1.slice(ini);
    const fn = resto.slice(0, resto.search(/\n\$(function)?\$\s*;/));
    expect(fn).toMatch(/v_inv\s*:=\s*coalesce\(nullif\(btrim\(v_inv\),\s*''\),\s*public\.fn_inventario_auxiliar_1435\(p_organization_id,\s*null\),\s*'14350101'\)/);
    expect(fn).not.toMatch(/'1405'/);
  });

  it('revierte el lote de la org 338 sin borrar asientos', () => {
    expect(sql).toContain('1288');
    expect(sql).toContain('37989896190');
    expect(sql).toContain('carga-masiva-stock-338-20261022');
    expect(sql).toContain('fn_revertir_asiento_en_fecha');
    expect(sql).not.toMatch(/delete\s+from\s+(public\.)?journal_entries/i);
    expect(sql).not.toMatch(/update\s+(public\.)?journal_lines/i);
  });
});
