/// <reference types="jest" />
/**
 * Pendiente 6 (docs/hallazgos/comisiones-e-impuestos-2026-09-28.md):
 * `useCommissionRate` (POS y factura) comparaba la vigencia de la tasa contra
 * la medianoche UTC (`new Date('YYYY-MM-DD')`). Ahora la resolución es la RPC
 * `fn_tasa_comision_vigente`, que compara días contra el día de la
 * organización (`fn_today_for_org`), la misma que usa el CRM.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { resolverTasaComision } from '@/lib/services/comisiones/tasaComision';

type Llamada = { fn: string; args: Record<string, unknown> };

function cliente(resp: { data: unknown; error: unknown }) {
  const llamadas: Llamada[] = [];
  return {
    llamadas,
    client: {
      rpc: (fn: string, args: Record<string, unknown>) => {
        llamadas.push({ fn, args });
        return Promise.resolve(resp);
      },
    } as unknown as Parameters<typeof resolverTasaComision>[0],
  };
}

describe('resolverTasaComision: una sola resolución, en el día de la organización', () => {
  it('pregunta a fn_tasa_comision_vigente por el vendedor con la general como respaldo', async () => {
    const { client, llamadas } = cliente({ data: '7.5', error: null });
    await expect(resolverTasaComision(client, 120, 'u-1')).resolves.toBe(7.5);
    expect(llamadas).toEqual([{ fn: 'fn_tasa_comision_vigente', args: { p_org: 120, p_salesperson: 'u-1', p_incluir_general: true } }]);
  });

  it('sin vendedor u organización no consulta y devuelve 0', async () => {
    const { client, llamadas } = cliente({ data: 9, error: null });
    await expect(resolverTasaComision(client, 120, null)).resolves.toBe(0);
    await expect(resolverTasaComision(client, 0, 'u-1')).resolves.toBe(0);
    expect(llamadas).toHaveLength(0);
  });

  it('un valor no numérico o negativo es 0; un error de la base se propaga (no se inventa tasa 0 en silencio)', async () => {
    await expect(resolverTasaComision(cliente({ data: null, error: null }).client, 120, 'u-1')).resolves.toBe(0);
    await expect(resolverTasaComision(cliente({ data: -3, error: null }).client, 120, 'u-1')).resolves.toBe(0);
    await expect(resolverTasaComision(cliente({ data: null, error: { code: 'XX000', message: 'boom' } }).client, 120, 'u-1')).rejects.toMatchObject({ code: 'XX000' });
  });
});

describe('guardarraíl: nada de vigencia contra el día UTC en el navegador', () => {
  const leer = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
  const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it.each(['src/lib/services/comisiones/tasaComision.ts', 'src/lib/hooks/useCommissionRate.ts'])('%s no compara fechas en JS', (p) => {
    const code = sinComentarios(leer(p));
    expect(code).not.toMatch(/toISOString\(\)/);
    expect(code).not.toMatch(/new Date\(/);
    expect(code).not.toMatch(/\.from\(['"]vendor_commission_rates['"]\)/);
  });

  it('la RPC compara contra fn_today_for_org con ambos extremos inclusivos', () => {
    const sql = leer('supabase/migrations/20260928180000_tasas_comision_por_rpc.sql');
    expect(sql).toMatch(/public\.fn_today_for_org\(p_org\)/);
    expect(sql).toMatch(/r\.valid_from <= hoy\.d and \(r\.valid_to is null or r\.valid_to >= hoy\.d\)/);
  });
});
