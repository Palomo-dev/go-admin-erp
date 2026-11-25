/**
 * GO-seguridad 2026-11-25: lote 2 de la auditoría de SECURITY DEFINER por módulos — DINERO
 * (migración 20261125214111).
 *
 * Graves: fn_retro_journal_* (cualquier sesión creaba asientos para las ventas, facturas, pagos y
 * cartera de TODAS las organizaciones) y registrar_pago_estacionamiento (pago falso en cualquier
 * organización, sin guarda). Además: 14 ayudantes internos de contabilidad y tesorería sin guarda
 * (fn_cuenta_caja creaba cuentas en el PUC ajeno), fn_propinas_persona (nombre, correo y cargo de
 * cualquier usuario), 18 funciones de trigger con EXECUTE y search_path sin fijar.
 *
 * Probado en la base viva (transacción revertida, `set local role` + `request.jwt.claims`):
 *   - ANTES: un miembro de otra organización leía el saldo 28050501 de una reserva ajena y el
 *     correo y el cargo del administrador de otra organización; authenticated ejecutaba las
 *     cargas retroactivas y el pago de parqueadero.
 *   - DESPUÉS: 42501 en el saldo ajeno, null en la persona ajena, sin EXECUTE en cargas, pago,
 *     ayudantes y triggers; el miembro ve sus propias cifras de propinas igual que antes;
 *     service_role sigue ejecutando todo; un UPDATE con sesión de products y categories sigue
 *     disparando el trigger al que se le quitó EXECUTE.
 * Aquí se fija que los archivos no vuelvan atrás.
 */
import * as fs from 'fs';
import * as path from 'path';

const RAIZ = path.resolve(__dirname, '..', '..', '..');
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), 'utf-8');
const VERSION = '20261125214111';
const MIGRACION = `supabase/migrations/${VERSION}_seguridad_rpc_lote2_dinero.sql`;
const ROLLBACK = `supabase/rollbacks/${VERSION}_seguridad_rpc_lote2_dinero_rollback.sql`;

const sinComentarios = (sql: string) => sql.replace(/--[^\n]*/g, '');
const posteriores = () =>
  fs
    .readdirSync(path.join(RAIZ, 'supabase/migrations'))
    .filter((f) => /^\d{14}_.*\.sql$/.test(f) && f.slice(0, 14) > VERSION)
    .map((f) => ({ f, sql: sinComentarios(leer(`supabase/migrations/${f}`)).toLowerCase() }));
const cuerpoDe = (s: string, fn: string) =>
  s.split(new RegExp(`create or replace function public\\.${fn}\\b`))[1]?.split('$function$;')[0] ?? '';

/** Solo service_role: sin guarda o internas. */
const SOLO_SERVIDOR = [
  'fn_retro_journal_ap',
  'fn_retro_journal_ar',
  'fn_retro_journal_invoices',
  'fn_retro_journal_payments',
  'fn_retro_journal_sales',
  'registrar_pago_estacionamiento',
  'fn_cuenta_caja',
  'fn_cuentas_stock_producto',
  'fn_cuenta_caja_existente',
  'fn_asiento_tesoreria_elegido',
  'fn_tesoreria_fallo_cuenta',
  'fn_carga_inicial_contrapartida',
  'fn_cuenta_anticipo_proveedor',
  'fn_cuenta_iva19_sugerida',
  'fn_puc_ancestros',
  'fn_reserva_anticipo',
  'fn_pasarela_metodo_pago',
  'fn_saldo_favor_estado',
  'fn_saldo_favor_vencido',
  'fn_validar_identificacion_para_dian',
];

describe('Lote 2: SECURITY DEFINER de dinero', () => {
  const sql = sinComentarios(leer(MIGRACION)).toLowerCase();

  test('la migración y su reversión existen', () => {
    expect(fs.existsSync(path.join(RAIZ, ROLLBACK))).toBe(true);
  });

  test.each(SOLO_SERVIDOR)('%s: fuera public, anon y authenticated', (fn) => {
    expect(sql).toMatch(new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon, authenticated`));
  });

  test('ninguna migración posterior se las devuelve a anon, authenticated o public', () => {
    const nombres = SOLO_SERVIDOR.join('|');
    const re = new RegExp(`grant\\s+(execute|all)[^;]*on function public\\.(${nombres})\\b[^;]*to[^;]*\\b(anon|authenticated|public)\\b`);
    const culpables = posteriores()
      .filter(({ sql: s }) => re.test(s))
      .map(({ f }) => f);
    expect(culpables).toEqual([]);
  });

  test('fn_propinas_persona exige pertenencia y solo nombra a miembros', () => {
    const cuerpo = cuerpoDe(sql, 'fn_propinas_persona');
    expect(cuerpo).toMatch(/me\.user_id = \(select auth\.uid\(\)\) and me\.organization_id = p_organization_id/);
    expect(cuerpo).toMatch(/'nombre', case when om\.id is not null/);
    expect(cuerpo).toMatch(/set search_path to 'public', 'pg_temp'/);
  });

  test('una redefinición posterior de fn_propinas_persona conserva la guarda', () => {
    const culpables = posteriores()
      .filter(({ sql: s }) => /create or replace function public\.fn_propinas_persona\b/.test(s))
      .filter(({ sql: s }) => !/organization_members me/.test(cuerpoDe(s, 'fn_propinas_persona')))
      .map(({ f }) => f);
    expect(culpables).toEqual([]);
  });

  test('las funciones de trigger quedan sin EXECUTE para clientes', () => {
    for (const fn of ['fn_auto_journal_bank', 'fn_auto_journal_cash_movement', 'fn_validar_cuentas_catalogo', 'trg_fn_sembrar_configuracion_contable']) {
      expect(sql).toMatch(new RegExp(`revoke all on function public\\.${fn}\\(\\) from public, anon, authenticated`));
    }
  });

  test('el ERP no llama por RPC a las funciones que quedaron solo de servidor', () => {
    const raiz = path.join(RAIZ, 'src');
    const archivos: string[] = [];
    const recorrer = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === 'node_modules' || e.name === '__tests__') continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) recorrer(p);
        else if (/\.(ts|tsx)$/.test(e.name)) archivos.push(p);
      }
    };
    recorrer(raiz);
    const re = new RegExp(`\\.rpc\\(\\s*['"\`](${SOLO_SERVIDOR.join('|')})['"\`]`);
    const culpables = archivos.filter((a) => re.test(fs.readFileSync(a, 'utf-8'))).map((a) => path.relative(RAIZ, a));
    expect(culpables).toEqual([]);
  });
});
