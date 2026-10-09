/// <reference types="jest" />
/**
 * El estado de resultados se quedaba en blanco: fn_saldos_cuentas agotaba los
 * 8 s de authenticated y la página, al fallar, hacía `return null`.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function leer(ruta: string): string {
  return readFileSync(join(process.cwd(), ruta), 'utf8');
}

describe('estado de resultados', () => {
  it('un fallo de la consulta muestra el error y permite reintentar', () => {
    const pagina = leer('src/components/finanzas/contabilidad/estado-resultados/EstadoResultadosPage.tsx');
    expect(pagina).not.toMatch(/if\s*\(\s*!data\s*\)\s*return null/);
    expect(pagina).toContain('variante="error"');
    expect(pagina).toContain('onReintentar');
    expect(pagina).toContain('setData(null)');
    expect(pagina).toContain('getToday()');
    expect(pagina).toContain('if (tzLoading');
  });

  it('los saldos no vuelven a recorrer la RLS en cada línea', () => {
    const sql = leer('supabase/migrations/20261009200300_saldos_cuentas_sin_recorrer_rls.sql');
    expect(sql).toMatch(/security definer/i);
    expect(sql).toContain('fn_assert_acceso_org');
    expect(sql).toContain('app_branch_access');
    expect(sql).toContain('revoke all on function public.fn_saldos_cuentas(integer, timestamptz, timestamptz) from public, anon;');
    expect(sql).toContain('idx_journal_entries_org_fecha');
  });
});
