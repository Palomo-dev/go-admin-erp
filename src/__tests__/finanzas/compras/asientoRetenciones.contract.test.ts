// ============================================================================
// Asiento de compra con retenciones (D4 fase 2 del plan de compras).
//
// El devengo de la factura acredita al proveedor el NETO (total − retenciones)
// y cada retención a su pasivo (2365 fuente, 2367 IVA, 2368 ICA), para que el
// pago del neto salde la cuenta del proveedor. Se lee la ÚLTIMA migración que
// define cada función: si otra la reemplaza sin la llamada, este test falla.
// ============================================================================

import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const RAIZ = join(__dirname, '..', '..', '..', '..');
const DIR_MIGRACIONES = join(RAIZ, 'supabase', 'migrations');
const DIR_ROLLBACKS = join(RAIZ, 'supabase', 'rollbacks');

const migraciones = readdirSync(DIR_MIGRACIONES)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((nombre) => ({ nombre, sql: readFileSync(join(DIR_MIGRACIONES, nombre), 'utf8') }));

/** Cuerpo de la última definición de `public.<fn>` en las migraciones. */
function ultimaDefinicion(fn: string): { nombre: string; cuerpo: string } {
  const inicio = new RegExp(String.raw`create\s+or\s+replace\s+function\s+public\.${fn}\s*\(`, 'i');
  const m = [...migraciones].reverse().find((x) => inicio.test(x.sql));
  if (!m) throw new Error(`Ninguna migración define ${fn}`);
  const desde = m.sql.search(inicio);
  const resto = m.sql.slice(desde);
  const cierre = resto.search(/\n\$(function)?\$;/);
  return { nombre: m.nombre, cuerpo: resto.slice(0, cierre) };
}

describe('devengo de compra con retenciones', () => {
  test.each(['fn_auto_journal_purchase', 'fn_retro_journal_purchases'])(
    '%s completa el asiento con las retenciones justo después de crearlo',
    (fn) => {
      const { cuerpo } = ultimaDefinicion(fn);
      const crear = cuerpo.search(/fn_create_journal_entry\s*\(/);
      const retener = cuerpo.search(
        /PERFORM\s+fn_asiento_compra_aplicar_retenciones\s*\(\s*v_entry_id\s*,\s*\w+\.id\s*,\s*v_rule\.credit_account_code\s*\)/i,
      );
      expect(crear).toBeGreaterThan(-1);
      expect(retener).toBeGreaterThan(crear);
      // El importe del asiento sigue siendo el total: el neto lo deja la función de retenciones.
      expect(cuerpo).toMatch(/p_amount\s*:=\s*\w+\.total/);
    },
  );

  test('solo ajusta un asiento recién creado, con la bandera de mantenimiento restaurada y el cuadre verificado', () => {
    const { cuerpo } = ultimaDefinicion('fn_asiento_compra_aplicar_retenciones');
    // Creado en esta transacción y con el crédito al proveedor todavía por el total.
    expect(cuerpo).toMatch(/e\.created_at\s*=\s*now\(\)/);
    expect(cuerpo).toMatch(/jl\.credit\s*=\s*v_inv\.total/);
    expect(cuerpo).toMatch(/jl\.account_code\s*=\s*p_credit_account/);
    // La bandera se enciende solo para ese UPDATE y vuelve al valor que tenía.
    const encender = cuerpo.search(/set_config\('app\.contabilidad_mantenimiento',\s*'on',\s*true\)/);
    const update = cuerpo.search(/update\s+journal_lines/i);
    const restaurar = cuerpo.search(/set_config\('app\.contabilidad_mantenimiento',\s*coalesce\(v_prev,\s*''\),\s*true\)/);
    expect(encender).toBeGreaterThan(-1);
    expect(update).toBeGreaterThan(encender);
    expect(restaurar).toBeGreaterThan(update);
    expect(cuerpo.match(/update\s+journal_lines/gi)).toHaveLength(1);
    expect(cuerpo).toMatch(/credit\s*=\s*v_inv\.total\s*-\s*v_ret/);
    expect(cuerpo).toMatch(/ASIENTO_DESCUADRADO/);
    // Retenciones que igualan el total: se registra el fallo, no se deja un proveedor en cero.
    expect(cuerpo).toMatch(/v_ret\s*>=\s*v_inv\.total[\s\S]*withholding_exceeds_total/);
  });

  test('las funciones nuevas no quedan expuestas a anon ni a authenticated', () => {
    const sql = migraciones.filter((m) => /retencion/.test(m.nombre)).map((m) => m.sql).join('\n');
    for (const firma of [
      'fn_asegurar_cuentas_retencion(integer)',
      'fn_cuenta_retencion_compra(integer, text, text)',
      'fn_asiento_compra_aplicar_retenciones(integer, uuid, text)',
    ]) {
      expect(sql).toContain(`revoke all on function public.${firma} from public, anon, authenticated;`);
    }
  });

  test('cada migración de retenciones tiene su rollback', () => {
    const propias = migraciones.filter((m) => /_compras_(asiento_con_retenciones|cuenta_retencion_por_clase)\.sql$/.test(m.nombre));
    expect(propias).toHaveLength(2);
    for (const m of propias) {
      expect(existsSync(join(DIR_ROLLBACKS, m.nombre.replace(/\.sql$/, '_rollback.sql')))).toBe(true);
    }
  });
});

describe('cuenta de cada retención (fn_cuenta_retencion_compra)', () => {
  const { cuerpo } = ultimaDefinicion('fn_cuenta_retencion_compra');
  const reglas = [...cuerpo.matchAll(/if v_texto ~ '([^']+)' then return '(\d+)';/g)].map(([, patron, cuenta]) => ({
    re: new RegExp(patron),
    cuenta,
  }));

  /** Misma lógica que la función: primero el código, luego el concepto; si nada coincide, 2365. */
  function cuenta(codigo: string | null, concepto: string | null): string {
    for (const texto of [(codigo ?? '').trim().toUpperCase(), (concepto ?? '').trim().toUpperCase()]) {
      if (!texto) continue;
      const regla = reglas.find((r) => r.re.test(texto));
      if (regla) return regla.cuenta;
    }
    return '2365';
  }

  test('las reglas salen del SQL, en orden: marcadores inequívocos antes que palabras sueltas', () => {
    expect(reglas.map((r) => r.cuenta)).toEqual(['2368', '2367', '2365', '2368', '2367']);
    expect(cuerpo).toMatch(/return '2365';\s*end;?\s*$/);
  });

  test.each([
    ['RETE_4', 'Retención en la Fuente 4%', '2365'],
    ['RETE_11', null, '2365'],
    ['ICA_0.966', 'ICA Bogotá', '2368'],
    ['RETEIVA_15', null, '2367'],
    [null, 'ReteICA sobre base sin IVA', '2368'],
    [null, 'ReteIVA 15%', '2367'],
    [null, 'Retención en la fuente sobre base con IVA', '2365'],
    [null, 'Servicios de música', '2365'],
    [null, 'Impuesto de industria y comercio', '2368'],
    [null, 'IVA retenido', '2367'],
    [null, 'Honorarios', '2365'],
    ['X1', 'ReteICA Medellín', '2368'],
  ])('código %p · concepto %p → %s', (codigo, concepto, esperada) => {
    expect(cuenta(codigo, concepto)).toBe(esperada);
  });

  test('el mapeo contable de la organización manda sobre la clase', () => {
    const mapeo = cuerpo.search(/from tax_account_mapping/);
    const clases = cuerpo.search(/foreach v_texto/);
    expect(mapeo).toBeGreaterThan(-1);
    expect(clases).toBeGreaterThan(mapeo);
    expect(cuerpo).toMatch(/c\.account_code = m\.account_code/);
  });
});
