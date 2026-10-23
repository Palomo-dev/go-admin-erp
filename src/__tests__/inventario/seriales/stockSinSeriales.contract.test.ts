/**
 * Contrato de la migración que impide agrandar el hueco de existencia
 * serializada sin seriales. No inventa números: el reporte solo lee, y el
 * cobro del POS guarda los serial_ids que ya eligió el cajero.
 */
import fs from 'fs';
import path from 'path';

const RAIZ = path.resolve(__dirname, '../../../..');
const ARCHIVO = '20261023045506_stock_serializado_sin_seriales.sql';
const migracion = fs.readFileSync(path.join(RAIZ, 'supabase', 'migrations', ARCHIVO), 'utf8');
const rollback = fs.readFileSync(path.join(RAIZ, 'supabase', 'rollbacks', ARCHIVO.replace(/\.sql$/, '_rollback.sql')), 'utf8');

describe('stock serializado sin seriales', () => {
  it('la entrada inicial, el ajuste y la compra exigen la misma cantidad de seriales', () => {
    expect(migracion).toContain('stock_serializado_sin_seriales');
    expect(migracion).toContain("p_source in ('initial', 'adjustment', 'purchase', 'purchase_order', 'purchase_invoice')");
    expect(migracion).toContain('coalesce(v_prod.track_serial, false)');
    expect(migracion).toContain("raise exception 'seriales_no_cuadran'");
    expect(migracion).toContain('p.track_serial into v_prod');
    expect(migracion).not.toMatch(/insert\s+into\s+public\.serial_numbers/i);
  });

  it('el reporte es de lectura, exige permiso y no queda para anon', () => {
    expect(migracion).toMatch(/create or replace function public\.fn_reporte_stock_sin_seriales\(p_org integer\)/i);
    expect(migracion).toMatch(/security definer/i);
    expect(migracion).toContain('fn_seriales_int_exigir(p_org, false)');
    expect(migracion).toMatch(/revoke all on function public\.fn_reporte_stock_sin_seriales\(integer\) from public, anon/i);
    expect(migracion).toMatch(/grant execute on function public\.fn_reporte_stock_sin_seriales\(integer\) to authenticated, service_role/i);
    expect(migracion).toContain("s.status in ('in_stock', 'reserved')");
  });

  it('pos_checkout_v1 guarda serial_ids o deja intacto un insert que ya los escribe', () => {
    expect(migracion).toContain('stock_serializado_sin_seriales_pos');
    expect(migracion).toContain("position('serial_ids' in v_trozo) > 0");
    expect(migracion).toContain('serial_ids');
    expect(migracion).toContain("jsonb_array_elements_text(coalesce(i.value->'serial_ids', '[]'::jsonb))");
  });

  it('el rollback deshace el parche y no toca un insert de serial_ids que ya existía', () => {
    expect(rollback).toContain('drop function if exists public.fn_reporte_stock_sin_seriales(integer)');
    expect(rollback).toContain("position('stock_serializado_sin_seriales_pos' in v_def) = 0");
    expect(rollback).toContain('si ya guarda serial_ids, se deja');
    expect(rollback).not.toMatch(/delete\s+from\s+public\.serial_numbers/i);
    expect(rollback).not.toMatch(/update\s+public\.invoice_sales/i);
  });
});
