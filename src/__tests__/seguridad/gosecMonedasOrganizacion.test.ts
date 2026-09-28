/**
 * GO-sec 2026-09-28, puntos 1-3: RPC de monedas de la organización.
 *
 * Lo que se probó en la base viva (transacción que se deshace, con
 * `set local role` y `request.jwt.claims`) antes de aplicar la migración:
 *   - anon sin EXECUTE en las seis RPC; una sola sobrecarga de set_currency_auto_update;
 *   - miembro sin permiso de su propia organización → `sin_permiso` al cambiar la
 *     base o quitar una moneda, pero sí lee;
 *   - miembro de otra organización → «Acceso denegado a la organización»;
 *   - admin cambia la base: una sola base, `finance.default_currency` escrita y
 *     `fn_moneda_base_organizacion` (gemelo de resolveOrgCurrency) la devuelve;
 *   - código no asignado → `moneda_no_asignada` y la base no se pierde;
 *   - la base no se puede quitar; dos bases → unique_violation.
 * Aquí se fija que el código y los archivos no vuelvan atrás.
 */
import * as fs from 'fs';
import * as path from 'path';
import { claveErrorMoneda, mensajeErrorMoneda } from '@/components/finanzas/monedas/erroresMonedas';

const RAIZ = path.resolve(__dirname, '..', '..', '..');
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), 'utf-8');
const MIGRACION = 'supabase/migrations/20260928145431_gosec_monedas_rpc_permiso_y_base_unica.sql';
const ROLLBACK = 'supabase/rollbacks/20260928145431_gosec_monedas_rpc_permiso_y_base_unica_rollback.sql';

/** Cuerpo de cada `create or replace function public.<nombre>(` hasta su `$function$;`. */
function funciones(sql: string): Map<string, string> {
  const mapa = new Map<string, string>();
  const re = /create or replace function public\.(\w+)\(([\s\S]*?)\$function\$;/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql))) mapa.set(m[1], m[0]);
  return mapa;
}

describe('migración de monedas de la organización', () => {
  const sql = leer(MIGRACION);
  const defs = funciones(sql);

  test('existe con su rollback', () => {
    expect(fs.existsSync(path.join(RAIZ, ROLLBACK))).toBe(true);
  });

  test('las seis RPC fijan search_path y comprueban pertenencia', () => {
    for (const nombre of [
      'get_organization_currencies',
      'get_currency_templates',
      'set_organization_base_currency',
      'add_organization_currency',
      'remove_organization_currency',
      'set_currency_auto_update',
    ]) {
      const def = defs.get(nombre);
      expect(def).toBeDefined();
      expect(def).toMatch(/security definer/);
      expect(def).toMatch(/set search_path to 'public', 'pg_temp'/);
      expect(def).toMatch(/fn_assert_acceso_org|fn_finanzas_exigir_permiso/);
    }
  });

  test('las que escriben exigen permiso resuelto en la base, no solo pertenencia', () => {
    for (const nombre of ['set_organization_base_currency', 'add_organization_currency', 'remove_organization_currency', 'set_currency_auto_update']) {
      expect(defs.get(nombre)).toMatch(/fn_finanzas_exigir_permiso\(\s*p_\w+,\s*array\['billing_management', 'organization_settings'\]\)/);
    }
  });

  test('revoca anon y public y deja authenticated + service_role', () => {
    expect(sql).toMatch(/revoke all on function %s from public, anon/);
    expect(sql).toMatch(/grant execute on function %s to authenticated, service_role/);
  });

  test('una sola moneda base por organización y una sola sobrecarga de set_currency_auto_update', () => {
    expect(sql).toMatch(/create unique index if not exists organization_currencies_una_base\s+on public\.organization_currencies \(organization_id\)\s+where is_base/);
    expect(sql).toMatch(/drop function if exists public\.set_currency_auto_update\(integer, character varying, boolean\)/);
  });

  test('la moneda base escribe la preferencia que lee resolveOrgCurrency, en la misma función', () => {
    const def = defs.get('set_organization_base_currency') ?? '';
    expect(def).toMatch(/moneda_no_asignada/);
    expect(def).toMatch(/organization_preferences/);
    expect(def).toMatch(/'default_currency', v_codigo/);
    // resolveOrgCurrency lee exactamente esa ruta.
    expect(leer('src/lib/services/monedaOrganizacion.ts')).toMatch(/settings\?\.finance\?\.default_currency/);
  });
});

describe('pantallas de monedas', () => {
  test('«Preferencias» usa la RPC y no escribe organization_currencies directamente', () => {
    const src = leer('src/components/finanzas/monedas/CurrencyPreferences.tsx');
    expect(src).toMatch(/rpc\('set_organization_base_currency'/);
    expect(src).not.toMatch(/from\('organization_currencies'\)\s*\.(update|insert|upsert|delete)/);
    // Si falla, se muestra el error (no un «guardado» falso).
    expect(src).toMatch(/if \(baseError\) throw baseError/);
  });

  test('ningún componente escribe organization_currencies sin RPC', () => {
    const dir = path.join(RAIZ, 'src', 'components', 'finanzas', 'monedas');
    for (const f of fs.readdirSync(dir).filter((n) => /\.tsx?$/.test(n))) {
      const src = fs.readFileSync(path.join(dir, f), 'utf-8');
      expect(`${f}: ${/from\(['"]organization_currencies['"]\)[\s\S]{0,80}\.(update|insert|upsert|delete)\(/.test(src)}`).toBe(`${f}: false`);
    }
  });
});

describe('errores traducidos', () => {
  const t = (k: string) => `T:${k}`;

  test('reconoce los códigos de la base', () => {
    expect(claveErrorMoneda({ message: 'sin_permiso', code: '42501' })).toBe('sinPermiso');
    expect(claveErrorMoneda({ message: 'Acceso denegado a la organización', code: '42501' })).toBe('sinPermiso');
    expect(claveErrorMoneda({ message: 'moneda_no_asignada', code: 'P0002' })).toBe('monedaNoAsignada');
    expect(claveErrorMoneda({ message: 'moneda_base_no_se_elimina', code: '22023' })).toBe('monedaBaseNoSeElimina');
    expect(claveErrorMoneda({ message: 'otra cosa' })).toBeNull();
    expect(claveErrorMoneda(null)).toBeNull();
  });

  test('un error desconocido conserva el mensaje del servidor', () => {
    expect(mensajeErrorMoneda({ message: 'sin_permiso' }, t)).toBe('T:sinPermiso');
    expect(mensajeErrorMoneda({ message: 'boom' }, t)).toBe('boom');
  });

  test('el namespace monedasSeguridad existe con las mismas claves en los 4 idiomas', () => {
    const claves = (idioma: string) =>
      Object.keys((JSON.parse(leer(`messages/${idioma}.json`)) as Record<string, Record<string, string>>).monedasSeguridad ?? {}).sort();
    const es = claves('es');
    expect(es).toEqual(['monedaBaseNoSeElimina', 'monedaNoAsignada', 'sinPermiso']);
    for (const idioma of ['en', 'fr', 'pt']) expect(claves(idioma)).toEqual(es);
  });
});
