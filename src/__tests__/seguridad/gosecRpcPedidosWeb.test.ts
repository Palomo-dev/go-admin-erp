/**
 * GO-seguridad 2026-11-25: RPC SECURITY DEFINER de pedidos web (migración 20261125210126).
 *
 * 20261125193932 cerró web_orders por RLS; una función SECURITY DEFINER no pasa por RLS. La
 * auditoría dejó solo service_role en el cron de vencimiento y en el plazo de pago, quitó EXECUTE a
 * las funciones de trigger, fijó search_path y cerró dos fugas entre organizaciones de logística
 * (fn_logistica_ve_todo es true para cualquiera que no sea domiciliario de la organización).
 *
 * Probado en la base viva (transacción revertida, `set local role` + `request.jwt.claims`):
 *   - ANTES: un miembro de otra organización leía los conductores ajenos (nombre, documento,
 *     teléfono) y la revisión de asignación de un envío ajeno; cualquier sesión ejecutaba
 *     expire_pending_web_orders y fn_web_order_plazo_minutos.
 *   - DESPUÉS: ajeno → 0 conductores, 42501 en revisar asignación, en el cron y en el plazo; el
 *     miembro de la organización ve lo mismo que antes; service_role sigue ejecutando cron y plazo;
 *     un UPDATE de web_orders con sesión sigue disparando el trigger al que se le quitó EXECUTE.
 * Aquí se fija que los archivos no vuelvan atrás.
 */
import * as fs from 'fs';
import * as path from 'path';

const RAIZ = path.resolve(__dirname, '..', '..', '..');
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), 'utf-8');
const VERSION = '20261125210126';
const MIGRACION = `supabase/migrations/${VERSION}_seguridad_rpc_pedidos_web.sql`;
const ROLLBACK = `supabase/rollbacks/${VERSION}_seguridad_rpc_pedidos_web_rollback.sql`;

const sinComentarios = (sql: string) => sql.replace(/--[^\n]*/g, '');
const posteriores = () =>
  fs
    .readdirSync(path.join(RAIZ, 'supabase/migrations'))
    .filter((f) => /^\d{14}_.*\.sql$/.test(f) && f.slice(0, 14) > VERSION)
    .map((f) => ({ f, sql: sinComentarios(leer(`supabase/migrations/${f}`)).toLowerCase() }));

describe('RPC de pedidos web: solo service_role donde no hay guarda', () => {
  const sql = sinComentarios(leer(MIGRACION)).toLowerCase();

  test('la migración y su reversión existen', () => {
    expect(fs.existsSync(path.join(RAIZ, ROLLBACK))).toBe(true);
  });

  test('cron de vencimiento y plazo de pago: fuera public, anon y authenticated', () => {
    expect(sql).toMatch(/revoke all on function public\.expire_pending_web_orders\(integer\) from public, anon, authenticated/);
    expect(sql).toMatch(/revoke all on function public\.fn_web_order_plazo_minutos\(integer, text, integer\) from public, anon, authenticated/);
    expect(sql).toMatch(/alter function public\.expire_pending_web_orders\(integer\) set search_path to 'public', 'pg_temp'/);
  });

  test('ninguna migración posterior se las devuelve a anon, authenticated o public', () => {
    const culpables = posteriores()
      .filter(({ sql: s }) =>
        /grant\s+(execute|all)[^;]*on function public\.(expire_pending_web_orders|fn_web_order_plazo_minutos)\b[^;]*to[^;]*\b(anon|authenticated|public)\b/.test(s),
      )
      .map(({ f }) => f);
    expect(culpables).toEqual([]);
  });

  test('ninguna redefinición posterior del cron pierde el search_path', () => {
    const culpables = posteriores()
      .filter(({ sql: s }) => /create or replace function public\.expire_pending_web_orders\b/.test(s))
      .filter(({ sql: s }) => {
        const cuerpo = s.split(/create or replace function public\.expire_pending_web_orders\b/)[1].split('$$')[0];
        return !/set search_path/.test(cuerpo);
      })
      .map(({ f }) => f);
    expect(culpables).toEqual([]);
  });

  test('el código del ERP solo llama al cron desde la ruta con service_role', () => {
    const ruta = leer('src/app/api/cron/expire-pending-web-orders/route.ts');
    expect(ruta).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(ruta).toMatch(/verifyCronSecret\(request\)/);
  });
});

describe('Logística: fn_logistica_ve_todo no basta como guarda', () => {
  const sql = sinComentarios(leer(MIGRACION)).toLowerCase();
  const cuerpoDe = (s: string, fn: string) => s.split(new RegExp(`create or replace function public\\.${fn}\\b`))[1]?.split('$function$;')[0] ?? '';

  test('fn_transporte_conductores exige ser miembro activo en la rama «ve todo»', () => {
    const cuerpo = cuerpoDe(sql, 'fn_transporte_conductores');
    expect(cuerpo).toMatch(/fn_logistica_ve_todo\(p_org\)\s+and exists \(select 1 from public\.organization_members om/);
    expect(cuerpo).toMatch(/om\.user_id = \(select auth\.uid\(\)\)/);
  });

  test('logistica_revisar_asignacion valida la organización del envío antes que todo', () => {
    const cuerpo = cuerpoDe(sql, 'logistica_revisar_asignacion');
    const assert = cuerpo.indexOf('perform public.fn_assert_acceso_org(v_org)');
    expect(assert).toBeGreaterThan(-1);
    expect(assert).toBeLessThan(cuerpo.indexOf('fn_logistica_ve_todo(v_org)'));
  });

  test('una redefinición posterior conserva la guarda', () => {
    const culpables = posteriores().flatMap(({ f, sql: s }) => {
      const malos: string[] = [];
      if (/create or replace function public\.fn_transporte_conductores\b/.test(s)
          && !/organization_members/.test(cuerpoDe(s, 'fn_transporte_conductores'))) malos.push(`${f}: fn_transporte_conductores`);
      if (/create or replace function public\.logistica_revisar_asignacion\b/.test(s)
          && !/fn_assert_acceso_org/.test(cuerpoDe(s, 'logistica_revisar_asignacion'))) malos.push(`${f}: logistica_revisar_asignacion`);
      return malos;
    });
    expect(culpables).toEqual([]);
  });
});
