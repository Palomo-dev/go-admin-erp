/**
 * Venta sin cliente: el devengo ya no se bloquea por falta de NIT.
 * El defecto es 222222222222 «Consumidor final» y se puede cambiar por
 * organización. El reintento cierra la falla con el asiento de esa fact_key
 * y no crea otro si la clave ya existe.
 */
import * as fs from 'fs';
import * as path from 'path';

const REPO = path.resolve(__dirname, '..', '..', '..');
const BASE = '20261023105453_consumidor_final_tercero';

const leer = (rel: string) => fs.readFileSync(path.join(REPO, rel), 'utf8');

describe('consumidor final en el devengo', () => {
  const sql = leer(`supabase/migrations/${BASE}.sql`);
  const rollback = leer(`supabase/rollbacks/${BASE}_rollback.sql`);

  test('sin documento el tercero es el de defecto y el del cliente se lee antes', () => {
    const tercero = sql.slice(sql.indexOf('function public.fn_tercero_de_documento'), sql.indexOf('function public.fn_trg_tercero_linea_asiento'));
    expect(tercero.indexOf('identification_number')).toBeLessThan(tercero.indexOf('fn_consumidor_final_contable'));
    expect(tercero).toContain('if nit is null then');
    expect(sql).toContain("'222222222222'");
    expect(sql).toContain("'Consumidor final'");
    expect(sql).toContain('contabilidad_consumidor_final');
  });

  test('el devengo del POS también recibe ese tercero', () => {
    expect(sql).toContain("'support_documents', 'sales'");
    expect(sql).toContain('from public.sales s');
  });

  test('el reintento es por fact_key y cierra la falla sin duplicar', () => {
    const reintento = sql.slice(sql.indexOf('function public.fn_reintentar_asientos_tercero_requerido'));
    const busca = reintento.indexOf('e.fact_key = f.fact_key');
    const crea = reintento.indexOf('fn_create_journal_entry');
    expect(busca).toBeGreaterThan(0);
    expect(busca).toBeLessThan(crea);
    expect(reintento).toContain('resolved_at = now()');
    expect(reintento).toContain('resolved_entry_id = v_entry');
    expect(reintento).toContain('resolution = case');
    expect(reintento).toContain("reason = 'tercero_requerido'");
    expect(reintento).toContain('resolved_at is null');
  });

  test('el rollback deshace datos y devuelve la función anterior', () => {
    expect(rollback).toContain("set_config('app.contabilidad_mantenimiento', 'on', true)");
    expect(rollback).toContain('resolved_at = null');
    expect(rollback).toContain('resolved_entry_id = null');
    expect(rollback).toContain('resolution = null');
    expect(rollback).toContain('drop function if exists public.fn_reintentar_asientos_tercero_requerido');
    expect(rollback).toContain('drop table if exists public.contabilidad_consumidor_final');
    expect(rollback).not.toContain("'support_documents', 'sales'");
    expect(rollback).toContain("not in ('invoice_sales', 'invoice_purchase', 'credit_note', 'cash_movements', 'support_documents')");
  });
});
