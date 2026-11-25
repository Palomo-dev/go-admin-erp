/**
 * GO-seguridad 2026-11-25: lote 1 de la auditoría de SECURITY DEFINER por módulos — las 6 que
 * ejecutaba anon (migración 20261125212528).
 *
 * Cinco son ayudantes de RLS (políticas «TO public» de products, sales, organizations, branches,
 * customers, cartera…): Postgres exige EXECUTE al rol que consulta, así que anon los conserva; para
 * anon devuelven falso o vacío. user_belongs_to_organization era un oráculo de pertenencia
 * (respondía por cualquier usuario) y ahora solo responde por auth.uid(). get_public_menu (la carta)
 * solo la llaman la tienda con service_role y el ERP con sesión: fuera anon.
 *
 * Probado en la base viva (transacción revertida, `set local role` + `request.jwt.claims`):
 *   - ANTES: anon, sin sesión, preguntaba si un usuario X es miembro de la organización Y → true.
 *   - DESPUÉS: anon → false y 42501 en get_public_menu; anon sigue viendo 0 filas (no 42501) en
 *     sales, organizations, branches, customers, cartera y caja, y 5 en products (catálogo);
 *     un miembro ve lo mismo que antes y su propia pertenencia es true; service_role lee la carta.
 * Aquí se fija que los archivos no vuelvan atrás.
 */
import * as fs from 'fs';
import * as path from 'path';

const RAIZ = path.resolve(__dirname, '..', '..', '..');
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), 'utf-8');
const VERSION = '20261125212528';
const MIGRACION = `supabase/migrations/${VERSION}_seguridad_rpc_lote1_anon.sql`;
const ROLLBACK = `supabase/rollbacks/${VERSION}_seguridad_rpc_lote1_anon_rollback.sql`;

const sinComentarios = (sql: string) => sql.replace(/--[^\n]*/g, '');
const posteriores = () =>
  fs
    .readdirSync(path.join(RAIZ, 'supabase/migrations'))
    .filter((f) => /^\d{14}_.*\.sql$/.test(f) && f.slice(0, 14) > VERSION)
    .map((f) => ({ f, sql: sinComentarios(leer(`supabase/migrations/${f}`)).toLowerCase() }));
const cuerpoDe = (s: string, fn: string) =>
  s.split(new RegExp(`create or replace function public\\.${fn}\\b`))[1]?.split('$function$;')[0] ?? '';

describe('Lote 1: SECURITY DEFINER que ejecuta anon', () => {
  const sql = sinComentarios(leer(MIGRACION)).toLowerCase();

  test('la migración y su reversión existen', () => {
    expect(fs.existsSync(path.join(RAIZ, ROLLBACK))).toBe(true);
  });

  test('user_belongs_to_organization solo responde por el propio usuario', () => {
    const cuerpo = cuerpoDe(sql, 'user_belongs_to_organization');
    expect(cuerpo).toMatch(/coalesce\(user_uuid = \(select auth\.uid\(\)\), false\)/);
    expect(cuerpo).toMatch(/stable security definer/);
    expect(cuerpo).toMatch(/set search_path to 'public', 'pg_temp'/);
  });

  test('get_public_menu: fuera anon y public', () => {
    expect(sql).toMatch(
      /revoke all on function public\.get_public_menu\(integer, integer, timestamptz, uuid, boolean\) from public, anon/,
    );
  });

  test('los ayudantes de RLS fijan search_path', () => {
    for (const firma of ['is_user_member_of_org\\(integer\\)', 'can_access_account_receivable\\(uuid\\)', 'app_branch_access\\(integer\\)']) {
      expect(sql).toMatch(new RegExp(`alter function public\\.${firma} set search_path to 'public', 'pg_temp'`));
    }
  });

  test('ninguna migración posterior devuelve get_public_menu a anon o public', () => {
    const culpables = posteriores()
      .filter(({ sql: s }) => /grant\s+(execute|all)[^;]*on function public\.get_public_menu\b[^;]*to[^;]*\b(anon|public)\b/.test(s))
      .map(({ f }) => f);
    expect(culpables).toEqual([]);
  });

  test('una redefinición posterior de user_belongs_to_organization conserva la guarda', () => {
    const culpables = posteriores()
      .filter(({ sql: s }) => /create or replace function public\.user_belongs_to_organization\b/.test(s))
      .filter(({ sql: s }) => {
        const cuerpo = cuerpoDe(s, 'user_belongs_to_organization');
        return !/auth\.uid\(\)/.test(cuerpo) || !/set search_path/.test(cuerpo);
      })
      .map(({ f }) => f);
    expect(culpables).toEqual([]);
  });

  test('la tienda y el ERP no llaman a get_public_menu desde el navegador', () => {
    const erp = leer('src/lib/website/carta.server.ts');
    expect(erp).toMatch(/ctx\.supabase\.rpc\('get_public_menu'/);
    const clientes = [
      'src/components/sitio-web/configuracion/carta/CartaPublicaVista.tsx',
      'src/components/sitio-web/configuracion/carta/useCarta.ts',
      'src/lib/website/carta.ts',
    ];
    for (const rel of clientes) {
      expect(leer(rel)).not.toMatch(/\.rpc\(\s*['"]get_public_menu/);
    }
  });
});
