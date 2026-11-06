/**
 * El sistema resuelve los fallos contables. El cliente solo ve el borrador
 * que tiene que aprobar; el texto técnico no vuelve a la interfaz vieja.
 */
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const raiz = process.cwd();

function leer(ruta: string): string {
  return readFileSync(join(raiz, ruta), 'utf8');
}

function migraciones(): string[] {
  return readdirSync(join(raiz, 'supabase/migrations'))
    .filter((nombre) => nombre.includes('asientos_sin_fallo') && nombre.endsWith('.sql'))
    .sort();
}

describe('asientos sin fallo técnico', () => {
  const archivos = migraciones();
  const sql = archivos.map((nombre) => leer(`supabase/migrations/${nombre}`)).join('\n');
  const alertas = leer('src/components/finanzas/contabilidad/AlertasContables.tsx');
  const soporte = leer('src/components/finanzas/configuracion-contable/AlertasFalloContable.tsx');
  const reporte = leer('src/lib/finanzas/reportarFalloContable.ts');

  it('protege cabeceras, caja, reintento e importe en cero', () => {
    expect(archivos).toEqual([
      '20261024035620_asientos_sin_fallo_caja.sql',
      '20261024035748_asientos_sin_fallo_movimientos.sql',
      '20261024040118_asientos_sin_fallo_documento.sql',
      '20261024040426_asientos_sin_fallo_compra.sql',
      '20261024040453_asientos_sin_fallo_regla.sql',
      '20261024040454_asientos_sin_fallo_correccion.sql',
      '20261024040612_asientos_sin_fallo_tercero.sql',
      '20261024040739_asientos_sin_fallo_reintento.sql',
      '20261024040758_asientos_sin_fallo_alertas.sql',
      '20261024040859_asientos_sin_fallo_datos.sql',
    ]);
    expect(sql).toContain('fn_cuenta_caja');
    expect(sql).toContain('fn_reintentar_fallos_asiento');
    expect(sql).toContain('sin_importe');
    expect(sql).toContain('corr_sin_lineas');
    expect(sql).toContain('importe_cero_sin_fallo');
    expect(sql).toContain('fn_ve_fallos_contables');
    expect(sql).toContain("cron.schedule");
    expect(sql).toContain('*/15 * * * *');
    expect(sql).not.toMatch(/function\s+public\.fn_armar_asiento_documento\s*\(/i);
  });

  it('cada migración tiene rollback y el de datos no restaura filas', () => {
    for (const nombre of archivos) {
      const rollback = nombre.replace(/\.sql$/, '_rollback.sql');
      expect(existsSync(join(raiz, 'supabase/rollbacks', rollback))).toBe(true);
    }
    const datos = leer('supabase/rollbacks/20261024040859_asientos_sin_fallo_datos_rollback.sql');
    expect(datos).toContain('No restaura');
    expect(datos).not.toMatch(/insert\s+into\s+public\.journal_entries/i);
  });

  it('al cliente le muestra el borrador y no la caja vieja', () => {
    expect(alertas).toContain('AvisoTonal');
    expect(alertas).toContain('Tienes un asiento por aprobar');
    expect(alertas).toContain('Revisar y aprobar');
    expect(alertas).not.toContain('amber-50');
    expect(alertas).not.toContain('Pendientes contables');
    expect(soporte).toContain('fn_ve_fallos_contables');
    expect(soporte).toContain('AvisoTonal');
    expect(soporte).not.toContain('Pendientes contables');
    expect(reporte).toContain("import('@sentry/react')");
  });
});
