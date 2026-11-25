/**
 * GO-seguridad 2026-11-25: lote 4 de la auditoría de SECURITY DEFINER por módulos — EL RESTO
 * (migración 20261125220100; versión 20261125220000 en la base).
 *
 * GRAVE: public.set_config(text, text) ponía CUALQUIER parámetro a nivel de sesión desde cualquier
 * sesión: app.current_org_id de otra organización (5 políticas de PMS lo aceptaban en lugar de la
 * pertenencia) y los interruptores que leen las guardas (app.contabilidad_mantenimiento,
 * app.nomina_motor, app.saldo_bancario_por_movimiento…). Al ser de sesión, quedaba pegado a la
 * conexión del pool y lo heredaba la petición de otro usuario. Ahora solo acepta
 * app.current_org_id de una organización propia y local a la transacción; set_session_org_id
 * también es local; las 5 políticas ya no aceptan el parámetro. Además: fn_initialize_trip_seats
 * con guarda, 14 funciones sin guarda ni consumidor solo para service_role y search_path fijo en 73.
 *
 * Probado en la base viva (transacción revertida, `set local role` + `request.jwt.claims`):
 *   - ANTES: un miembro de otra organización pasó de ver 1 bloqueo de reserva a 2 (el ajeno) con
 *     set_config('app.current_org_id', <ajena>), y dejó app.contabilidad_mantenimiento en «on».
 *   - DESPUÉS: 42501 en ambos y en set_session_org_id ajeno; con el parámetro ajeno ya pegado a la
 *     conexión ve solo su bloqueo; anon ve 0; su propia organización sigue funcionando.
 * Aquí se fija que los archivos no vuelvan atrás.
 */
import * as fs from 'fs';
import * as path from 'path';

const RAIZ = path.resolve(__dirname, '..', '..', '..');
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), 'utf-8');
const VERSION = '20261125220100';
const MIGRACION = `supabase/migrations/${VERSION}_seguridad_rpc_lote4_resto.sql`;
const ROLLBACK = `supabase/rollbacks/${VERSION}_seguridad_rpc_lote4_resto_rollback.sql`;

const sinComentarios = (sql: string) => sql.replace(/--[^\n]*/g, '');
const posteriores = () =>
  fs
    .readdirSync(path.join(RAIZ, 'supabase/migrations'))
    .filter((f) => /^\d{14}_.*\.sql$/.test(f) && f.slice(0, 14) > VERSION)
    .map((f) => ({ f, sql: sinComentarios(leer(`supabase/migrations/${f}`)).toLowerCase() }));
const cuerpoDe = (s: string, fn: string) =>
  s.split(new RegExp(`create or replace function public\\.${fn}\\b`))[1]?.split('$function$;')[0] ?? '';

const SOLO_SERVIDOR = [
  'migrate_public_images',
  'sync_space_status_with_reservations',
  'create_product_with_images',
  'associate_image_to_product',
  'register_shared_image',
  'upload_temporary_image',
  'fn_costo_unitario_producto',
  'fn_get_trip_available_seats',
  'fn_clasificar_producto_restaurante',
  'get_permanent_image_url',
  'fn_product_image_archivo_disponible',
  'get_section_default_content',
  'fn_ai_credits_inicio_periodo',
  'fn_ai_credits_proxima_renovacion',
];

describe('Lote 4: set_config, políticas con app.current_org_id y el resto', () => {
  const sql = sinComentarios(leer(MIGRACION)).toLowerCase();

  test('la migración y su reversión existen', () => {
    expect(fs.existsSync(path.join(RAIZ, ROLLBACK))).toBe(true);
  });

  test('public.set_config solo acepta app.current_org_id propio y local a la transacción', () => {
    const cuerpo = cuerpoDe(sql, 'set_config');
    expect(cuerpo).toMatch(/if setting_name is distinct from 'app\.current_org_id' then/);
    expect(cuerpo).toMatch(/perform public\.fn_assert_acceso_org\(setting_value::integer\)/);
    expect(cuerpo).toMatch(/pg_catalog\.set_config\('app\.current_org_id', setting_value, true\)/);
    expect(cuerpo).not.toMatch(/set_config\([^)]*,\s*false\)/);
  });

  test('set_session_org_id es local a la transacción', () => {
    const cuerpo = cuerpoDe(sql, 'set_session_org_id');
    expect(cuerpo).toMatch(/fn_assert_acceso_org/);
    expect(cuerpo).toMatch(/pg_catalog\.set_config\('app\.current_org_id', org_id::text, true\)/);
  });

  test('las 5 políticas ya no aceptan app.current_org_id', () => {
    for (const p of ['rates_org_access', 'folios_org_isolation', 'reservations_member_update', 'reservation_blocks_org_isolation', 'reservation_customers_isolation']) {
      const tramo = sql.split(new RegExp(`alter policy ${p} on`))[1]?.split(';')[0] ?? '';
      expect(tramo).toMatch(/organization_members om/);
      expect(tramo).not.toMatch(/current_setting/);
    }
  });

  test('ninguna migración posterior vuelve a poner un parámetro de sesión en una política ni un set_config de sesión', () => {
    const culpables = posteriores().flatMap(({ f, sql: s }) => {
      const malos: string[] = [];
      if (/create\s+policy[^;]*current_setting\('app\./.test(s) || /alter\s+policy[^;]*current_setting\('app\./.test(s)) malos.push(`${f}: política con app.*`);
      if (/create or replace function public\.set_config\b/.test(s) && /set_config\([^)]*,\s*false\)/.test(cuerpoDe(s, 'set_config'))) malos.push(`${f}: set_config de sesión`);
      return malos;
    });
    expect(culpables).toEqual([]);
  });

  test('fn_initialize_trip_seats valida la organización del viaje', () => {
    const cuerpo = cuerpoDe(sql, 'fn_initialize_trip_seats');
    const guarda = cuerpo.indexOf('perform public.fn_assert_acceso_org(v_org_id)');
    expect(guarda).toBeGreaterThan(-1);
    expect(guarda).toBeLessThan(cuerpo.indexOf('insert into public.trip_seats'));
  });

  test.each(SOLO_SERVIDOR)('%s: fuera public, anon y authenticated', (fn) => {
    expect(sql).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon, authenticated`));
  });

  test('ninguna migración posterior se las devuelve a anon, authenticated o public', () => {
    const re = new RegExp(
      `grant\\s+(execute|all)[^;]*on function public\\.(${SOLO_SERVIDOR.join('|')})\\b[^;]*to[^;]*\\b(anon|authenticated|public)\\b`,
    );
    const culpables = posteriores()
      .filter(({ sql: s }) => re.test(s))
      .map(({ f }) => f);
    expect(culpables).toEqual([]);
  });

  test('el ERP no llama por RPC a las funciones que quedaron solo de servidor (salvo /api/me/plan con service_role)', () => {
    const archivos: string[] = [];
    const recorrer = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === 'node_modules' || e.name === '__tests__') continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) recorrer(p);
        else if (/\.(ts|tsx)$/.test(e.name)) archivos.push(p);
      }
    };
    recorrer(path.join(RAIZ, 'src'));
    const re = new RegExp(`\\.rpc\\(\\s*['"\`](${SOLO_SERVIDOR.join('|')})['"\`]`);
    const culpables = archivos
      .filter((a) => re.test(fs.readFileSync(a, 'utf-8')))
      .map((a) => path.relative(RAIZ, a).replace(/\\/g, '/'))
      .filter((a) => a !== 'src/app/api/me/plan/route.ts');
    expect(culpables).toEqual([]);
    expect(leer('src/app/api/me/plan/route.ts')).toMatch(/getServiceClient\(\)/);
  });
});
