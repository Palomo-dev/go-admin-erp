/**
 * Orden de la cuenta de IVA generado y el contrato del SQL de seriales
 * (2026-10-23). Datos sintéticos. No toca la base.
 */
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { cuentaIva } from '@/lib/finanzas/cuentaIva';

describe('cuentaIva', () => {
  it('usa el mapeo, si no la configuración, si no la regla', () => {
    expect(cuentaIva({ mapeo: '2408', configuracion: '2405', regla: '2408' })).toBe('2408');
    expect(cuentaIva({ mapeo: '  ', configuracion: '2408', regla: '2405' })).toBe('2408');
    expect(cuentaIva({ mapeo: null, configuracion: '', regla: ' 2408 ' })).toBe('2408');
    expect(cuentaIva({ mapeo: null, configuracion: null, regla: '   ' })).toBeNull();
  });
});

describe('SQL de seriales, devolución e IVA', () => {
  const dir = join(process.cwd(), 'supabase/migrations');
  const nombres = readdirSync(dir)
    .filter((nombre) => /^20261023.*seriales.*\.sql$/.test(nombre) || nombre === '20261023023000_seriales_devolucion_garantia_iva.sql')
    .sort();
  const sql = nombres.map((nombre) => readFileSync(join(dir, nombre), 'utf8')).join('\n');

  it('lee los archivos de esa fecha', () => {
    expect(nombres.length).toBeGreaterThan(0);
  });

  it('resuelve el IVA en el orden mapeo, configuración, regla', () => {
    const mapeo = sql.indexOf('tax_account_mapping');
    const config = sql.indexOf('from public.configuracion_contable');
    const regla = sql.indexOf('return nullif(btrim(p_cuenta_regla)');
    expect(mapeo).toBeGreaterThan(-1);
    expect(config).toBeGreaterThan(mapeo);
    expect(regla).toBeGreaterThan(config);
  });

  it('siembra configuración solo si no existe y no reescribe asientos', () => {
    const insert = sql.search(/insert into public\.configuracion_contable/i);
    expect(insert).toBeGreaterThan(-1);
    expect(sql.slice(insert, insert + 900).toLowerCase()).toContain('not exists');
    expect(sql).not.toMatch(/update\s+(public\.)?journal_lines/i);
    expect(sql).not.toMatch(/update\s+(public\.)?journal_entries/i);
  });

  it('guarda los seriales de la línea, no usa current_date y revoca', () => {
    expect(sql).toContain('serial_ids_en_linea_20261023');
    expect(sql).not.toMatch(/current_date/i);
    expect(sql.toLowerCase()).toContain('revoke');
  });
});
