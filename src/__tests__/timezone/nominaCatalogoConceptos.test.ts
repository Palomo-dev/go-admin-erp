/**
 * Catálogo de conceptos de nómina: el motor (conceptos.ts) y la semilla de la base
 * deben tener las mismas banderas y cuentas (ADR-003 §2).
 */
import { CATALOGO_BASE, FILAS_CATALOGO_BASE } from '@/lib/hrm/nomina/conceptos';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

describe('catálogo de conceptos de nómina', () => {
  test('el catálogo base del motor es la semilla de la migración', () => {
    const dir = join(process.cwd(), 'supabase', 'migrations');
    const archivo = readdirSync(dir).find((f) => f.endsWith('_hrm_f3_01_nomina_modelo.sql'));
    expect(archivo).toBeDefined();
    const sql = readFileSync(join(dir, archivo!), 'utf8');
    for (const [codigo, , tipo, salarial, ss, c40, prest, ret, paraf, deb, cred] of FILAS_CATALOGO_BASE) {
      const b = (x: boolean) => (x ? 'true' : 'false');
      const q = (x: string | null) => (x === null ? 'null' : `'${x}'`);
      const fila = `('${codigo}', `;
      const i = sql.indexOf(fila);
      expect({ codigo, encontrado: i >= 0 }).toEqual({ codigo, encontrado: true });
      const linea = sql.slice(i, sql.indexOf('\n', i));
      expect(linea).toContain(`'${tipo}', ${b(salarial)}, ${b(ss)}, ${b(c40)}, ${b(prest)}, ${b(ret)}, ${b(paraf)}, ${q(deb)}, ${q(cred)}`);
    }
    expect(Object.keys(CATALOGO_BASE)).toHaveLength(FILAS_CATALOGO_BASE.length);
  });});
