/**
 * GO-sec 2026-09-28, punto 7.
 */
import * as fs from 'fs';
import * as path from 'path';

const RAIZ = path.resolve(__dirname, '..', '..', '..');
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), 'utf-8');

/**
 * 7. Catálogo global de variantes (organization_id = 0). Probado en la base viva
 *    (transacción deshecha) tras la migración: crear_tipo_variante → permission
 *    denied; insertar tipo o valor de la org 0 → RLS; actualizar/borrar la org 0
 *    → 0 filas; la org 0 se sigue leyendo; tipos y valores propios se crean y editan.
 */
describe('catálogo global de variantes', () => {
  const base = '20260928175321_gosec_variantes_catalogo_global_solo_lectura';
  const sql = leer(`supabase/migrations/${base}.sql`);

  test('migración con rollback', () => {
    expect(fs.existsSync(path.join(RAIZ, 'supabase', 'rollbacks', `${base}_rollback.sql`))).toBe(true);
  });

  test('crear_tipo_variante sin EXECUTE para anon, authenticated ni public', () => {
    expect(sql).toMatch(/revoke all on function public\.crear_tipo_variante\(text, integer, text\[\]\) from public, anon, authenticated/);
  });

  test('restrictivas: nada del cliente escribe filas de la organización 0', () => {
    expect(sql).toMatch(/create policy variant_types_global_solo_lectura on public\.variant_types\s+as restrictive for all to authenticated[\s\S]*with check \(organization_id <> 0\)/);
    expect(sql).toMatch(/create policy variant_values_global_solo_lectura on public\.variant_values\s+as restrictive[\s\S]*organization_id = 0/);
  });

  test('nadie en el repo llama a crear_tipo_variante', () => {
    const encontrados: string[] = [];
    const recorrer = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (!['node_modules', '__tests__'].includes(e.name)) recorrer(p);
        } else if (/\.(ts|tsx)$/.test(e.name) && fs.readFileSync(p, 'utf-8').includes('crear_tipo_variante')) {
          encontrados.push(path.relative(RAIZ, p));
        }
      }
    };
    recorrer(path.join(RAIZ, 'src'));
    recorrer(path.join(RAIZ, 'supabase', 'functions'));
    expect(encontrados).toEqual([]);
  });
});
