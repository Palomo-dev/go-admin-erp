/**
 * Contrato del bloque de seriales, devolución, garantía e IVA (2026-10-23).
 * El orden de la cuenta y los backfills viven en SQL; aquí se fija que no
 * se reescriban asientos viejos ni se pise una configuración ya existente.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const RAIZ = process.cwd();
const leer = (nombre: string) => readFileSync(join(RAIZ, 'supabase/migrations', nombre), 'utf8');

const ARCHIVOS = [
  '20261023021111_seriales_devolucion_columnas_iva.sql',
  '20261023021305_seriales_nota_credito_asiento.sql',
  '20261023021333_seriales_checkout_en_linea.sql',
  '20261023021512_seriales_procesar_devolucion.sql',
  '20261023021531_seriales_garantia_reembolso.sql',
  '20261023021637_seriales_garantia_detalle_descuadre.sql',
  '20261023021654_seriales_iva_backfill.sql',
] as const;

const sql = Object.fromEntries(ARCHIVOS.map((n) => [n, leer(n)])) as Record<(typeof ARCHIVOS)[number], string>;
const todo = ARCHIVOS.map((n) => sql[n]).join('\n');

describe('seriales, devolución e IVA', () => {
  it('resuelve el IVA en el orden mapeo, configuración, regla', () => {
    const fn = sql['20261023021111_seriales_devolucion_columnas_iva.sql'];
    const mapeo = fn.indexOf('tax_account_mapping');
    const config = fn.indexOf('from public.configuracion_contable');
    const regla = fn.indexOf('return nullif(btrim(p_cuenta_regla)');
    expect(mapeo).toBeGreaterThan(-1);
    expect(config).toBeGreaterThan(mapeo);
    expect(regla).toBeGreaterThan(config);
    expect(fn).toContain('cuenta_iva_20261023');
    expect(fn).not.toMatch(/update\s+public\.journal_lines/i);
  });

  it('siembra configuración solo donde no hay filas y no reescribe asientos', () => {
    const back = sql['20261023021654_seriales_iva_backfill.sql'];
    expect(back).toContain('not exists');
    expect(back).toContain('configuracion_contable');
    expect(back).not.toMatch(/update\s+public\.journal_lines/i);
    expect(back).not.toMatch(/update\s+public\.journal_entries/i);
    expect(back).toContain('fn_reclasificar_iva_generado');
    expect(back).not.toContain('perform public.fn_reclasificar_iva_generado');
  });

  it('el cobro guarda serial_ids y la devolución distingue stock y dañado', () => {
    expect(sql['20261023021333_seriales_checkout_en_linea.sql']).toContain('serial_ids_en_linea_20261023');
    const dev = sql['20261023021512_seriales_procesar_devolucion.sql'];
    expect(dev).toContain('serial_dispositions_20261023');
    expect(dev).toContain('serial_ya_devuelto');
    expect(dev).toContain('serial_ya_reembolsado_garantia');
    expect(dev).toContain("'in_stock'");
    expect(dev).toContain("'damaged'");
    expect(dev).toContain('fn_nc_asiento_devolucion');
  });

  it('el reembolso de garantía reutiliza la devolución y no toca reparación', () => {
    const gar = sql['20261023021531_seriales_garantia_reembolso.sql'];
    expect(gar).toContain('fn_garantia_int_reembolsar');
    expect(gar).toContain('procesar_devolucion');
    expect(gar).toContain("when v_tipo = 'repair' then 'sold'");
    expect(gar).toContain("when v_tipo = 'refund' then 'damaged'");
    expect(gar).toContain('unidad_ya_devuelta');
  });

  it('no usa current_date ni deja funciones nuevas abiertas a anon', () => {
    expect(todo).not.toMatch(/CURRENT_DATE/);
    for (const nombre of [
      'fn_dia_zona(timestamptz, text)',
      'fn_cuenta_iva(integer, integer, text, text)',
      'fn_nc_asiento_devolucion(integer, uuid)',
      'fn_garantia_int_reembolsar(integer, uuid, jsonb)',
      'fn_seriales_descuadre(integer)',
      'fn_reclasificar_iva_generado(integer)',
    ]) {
      expect(todo).toContain(`revoke all on function public.${nombre} from public, anon`);
    }
  });
});
