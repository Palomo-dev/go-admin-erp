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

  test('las funciones de configuración y reporte exigen permiso y no se exponen a anon', () => {
    const sql = migraciones.filter((m) => /retencion|asiento_previo/.test(m.nombre)).map((m) => m.sql).join('\n');
    for (const firma of [
      'fn_retenciones_configuracion(integer)',
      'fn_retencion_configurar(integer, uuid, text, numeric)',
      'fn_retenciones_cargar_plantilla(integer)',
      'fn_certificado_retenciones_proveedor(integer, integer, date, date)',
    ]) {
      expect(sql).toMatch(new RegExp(String.raw`revoke all on function public\.${firma.replace(/[()]/g, '\\$&')} from public, anon;`));
    }
    for (const firma of ['fn_clase_retencion(text, text)', 'fn_retenciones_practicadas_filas(']) {
      expect(sql).toContain(`revoke all on function public.${firma}`);
    }
    expect(ultimaDefinicion('fn_retencion_configurar').cuerpo).toMatch(/fn_impuestos_exigir_gestion\(p_organization_id\)/);
    expect(ultimaDefinicion('fn_retenciones_cargar_plantilla').cuerpo).toMatch(/fn_impuestos_exigir_gestion\(p_organization_id\)/);
    expect(ultimaDefinicion('fn_certificado_retenciones_proveedor').cuerpo).toMatch(/fn_finanzas_exigir_permiso/);
    // Nadie escribe el mapeo desde el cliente: solo fn_retencion_configurar.
    expect(sql).toMatch(/revoke insert, update, delete, truncate, references, trigger on table public\.tax_account_mapping from anon, authenticated;/);
  });

  test('el asiento previo usa el disparador real y deshace todo', () => {
    const { cuerpo } = ultimaDefinicion('fn_factura_compra_asiento_previo');
    expect(cuerpo).toMatch(/fn_finanzas_exigir_permiso/);
    expect(cuerpo).toMatch(/fn_fc_acceso_sucursal/);
    const actualizar = cuerpo.search(/update\s+invoice_purchase\s+set\s+status\s*=\s*'received'/i);
    const deshacer = cuerpo.search(/raise exception using errcode = 'P0001', message = c_marca/);
    expect(cuerpo).toMatch(/c_marca constant text := 'PREVIA_ASIENTO_DESHACER'/);
    expect(actualizar).toBeGreaterThan(-1);
    expect(deshacer).toBeGreaterThan(actualizar);
    expect(cuerpo).toMatch(/exception\s+when others/i);
  });

  test('cada migración de retenciones tiene su rollback', () => {
    const propias = migraciones.filter((m) =>
      /_compras_(asiento_con_retenciones|cuenta_retencion_por_clase|retenciones_configuracion|asiento_previo|retenciones_reporte_certificado)\.sql$/.test(m.nombre),
    );
    expect(propias).toHaveLength(5);
    for (const m of propias) {
      expect(existsSync(join(DIR_ROLLBACKS, m.nombre.replace(/\.sql$/, '_rollback.sql')))).toBe(true);
    }
  });
});

describe('cuenta de cada retención (fn_clase_retencion + fn_cuenta_retencion_compra)', () => {
  const { cuerpo } = ultimaDefinicion('fn_cuenta_retencion_compra');
  const { cuerpo: cuerpoClase } = ultimaDefinicion('fn_clase_retencion');
  const reglas = [...cuerpoClase.matchAll(/if v_texto ~ '([^']+)' then return '(\w+)';/g)].map(([, patron, clase]) => ({
    re: new RegExp(patron),
    clase,
  }));
  const cuentaPorClase: Record<string, string> = Object.fromEntries(
    [...cuerpo.matchAll(/when '(\w+)' then '(\d+)'/g)].map(([, clase, cuenta]) => [clase, cuenta]),
  );
  const cuentaPorDefecto = /else '(\d+)'\s*end;/.exec(cuerpo)?.[1];

  /** Misma lógica que las funciones: primero el código, luego el concepto; si nada coincide, retefuente. */
  function clase(codigo: string | null, concepto: string | null): string {
    for (const texto of [(codigo ?? '').trim().toUpperCase(), (concepto ?? '').trim().toUpperCase()]) {
      if (!texto) continue;
      const regla = reglas.find((r) => r.re.test(texto));
      if (regla) return regla.clase;
    }
    return 'retefuente';
  }

  function cuenta(codigo: string | null, concepto: string | null): string {
    return cuentaPorClase[clase(codigo, concepto)] ?? cuentaPorDefecto ?? '';
  }

  test('las reglas salen del SQL, en orden: marcadores inequívocos antes que palabras sueltas', () => {
    expect(reglas.map((r) => r.clase)).toEqual(['reteica', 'reteiva', 'retefuente', 'reteica', 'reteiva']);
    expect(cuerpoClase).toMatch(/return 'retefuente';\s*end;?\s*$/);
    expect(cuentaPorClase).toEqual({ reteica: '2368', reteiva: '2367' });
    expect(cuentaPorDefecto).toBe('2365');
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
    const clases = cuerpo.search(/fn_clase_retencion\(p_tax_code, p_concept\)/);
    expect(mapeo).toBeGreaterThan(-1);
    expect(clases).toBeGreaterThan(mapeo);
    expect(cuerpo).toMatch(/c\.account_code = m\.account_code/);
    // Una retención propia sin plantilla se reconoce por su nombre (el concepto de la factura).
    expect(cuerpo).toMatch(/upper\(btrim\(ot\.name\)\) = v_concepto/);
  });
});
