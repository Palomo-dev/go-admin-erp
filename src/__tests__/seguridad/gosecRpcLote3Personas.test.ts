/**
 * GO-seguridad 2026-11-25: lote 3 de la auditoría de SECURITY DEFINER por módulos — DATOS DE
 * CLIENTES Y PERSONAS (migración 20261125214905).
 *
 * save_user_notification_preferences cambiaba las preferencias de notificación de CUALQUIER
 * usuario desde cualquier sesión; get_ las leía. increment_fragment_usage/_quick_reply_usage
 * sumaban uso en organizaciones ajenas. expire_old_notifications y
 * fn_check_periodic_notifications (trabajos de todas las organizaciones) y dos ayudantes internos
 * de HRM y roles estaban abiertos a authenticated. Todas quedan solo para service_role; además
 * search_path fijo en 52 funciones del dominio.
 *
 * Probado en la base viva (transacción revertida, `set local role` + `request.jwt.claims`):
 *   - ANTES: un miembro de otra organización silenciaba las notificaciones de un usuario ajeno.
 *   - DESPUÉS: 42501 en las preferencias, en los contadores y en el ayudante de HRM; el miembro
 *     sigue viendo sus clientes; service_role ejecuta todo.
 * Aquí se fija que los archivos no vuelvan atrás.
 */
import * as fs from 'fs';
import * as path from 'path';

const RAIZ = path.resolve(__dirname, '..', '..', '..');
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), 'utf-8');
const VERSION = '20261125214905';
const MIGRACION = `supabase/migrations/${VERSION}_seguridad_rpc_lote3_personas.sql`;
const ROLLBACK = `supabase/rollbacks/${VERSION}_seguridad_rpc_lote3_personas_rollback.sql`;

const sinComentarios = (sql: string) => sql.replace(/--[^\n]*/g, '');
const posteriores = () =>
  fs
    .readdirSync(path.join(RAIZ, 'supabase/migrations'))
    .filter((f) => /^\d{14}_.*\.sql$/.test(f) && f.slice(0, 14) > VERSION)
    .map((f) => ({ f, sql: sinComentarios(leer(`supabase/migrations/${f}`)).toLowerCase() }));

const SOLO_SERVIDOR = [
  'save_user_notification_preferences',
  'get_user_notification_preferences',
  'increment_fragment_usage',
  'increment_quick_reply_usage',
  'expire_old_notifications',
  'fn_check_periodic_notifications',
  'fn_hr_documentos_exigidos',
  'fn_roles_permisos_validos',
];

describe('Lote 3: SECURITY DEFINER de clientes y personas', () => {
  const sql = sinComentarios(leer(MIGRACION)).toLowerCase();

  test('la migración y su reversión existen', () => {
    expect(fs.existsSync(path.join(RAIZ, ROLLBACK))).toBe(true);
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

  test('no fija search_path donde rompería (vector de extensions, política RLS caliente)', () => {
    expect(sql).not.toMatch(/alter function public\.search_knowledge_fragments/);
    expect(sql).not.toMatch(/alter function public\.check_user_permission\(/);
    expect(sql).not.toMatch(/alter function public\.create_user_fallback/);
  });

  test('el cron de notificaciones sigue llamando con service_role', () => {
    const ruta = leer('src/app/api/cron/expire-old-notifications/route.ts');
    expect(ruta).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(ruta).toMatch(/verifyCronSecret\(request\)/);
  });

  test('el ERP no llama por RPC a las funciones que quedaron solo de servidor (salvo el cron)', () => {
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
      .filter((a) => a !== 'src/app/api/cron/expire-old-notifications/route.ts');
    expect(culpables).toEqual([]);
  });
});
