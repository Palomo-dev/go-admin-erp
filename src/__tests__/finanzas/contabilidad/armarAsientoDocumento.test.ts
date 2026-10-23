/**
 * Asiento por líneas (compra, venta y nota crédito).
 *
 * La función declaraba `r record` y usaba `r` como alias de la regla. Postgres
 * evaluaba el alias como la variable sin asignar y abortaba antes de armar
 * ninguna línea. Aquí se vigila la última definición: el ciclo usa `v_fila`,
 * los tres alias de la regla siguen, y las tres ramas (compra, venta y nota
 * crédito) siguen pasando por el mismo armado.
 */
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { codigoErrorCompra, estadoHttpErrorCompra, mensajeErrorCompra } from '@/lib/services/compras/contrato';

const DIR = join(process.cwd(), 'supabase/migrations');

function ultima(fn: string): string {
  const inicio = new RegExp(String.raw`create\s+or\s+replace\s+function\s+public\.${fn}\s*\(`, 'i');
  const archivo = readdirSync(DIR)
    .filter((nombre) => nombre.endsWith('.sql'))
    .sort()
    .reverse()
    .map((nombre) => ({ nombre, sql: readFileSync(join(DIR, nombre), 'utf8') }))
    .find((x) => inicio.test(x.sql));
  if (!archivo) throw new Error(`Ninguna migración define ${fn}`);
  const desde = archivo.sql.search(inicio);
  const resto = archivo.sql.slice(desde);
  const cierre = resto.search(/\n\$(?:fn|function)?\$;/);
  return resto.slice(0, cierre);
}

describe('fn_armar_asiento_documento arma compra, venta y nota crédito', () => {
  const cuerpo = ultima('fn_armar_asiento_documento');

  test('el ciclo no reutiliza el alias de la regla', () => {
    expect(cuerpo).toMatch(/\bv_fila record\b/);
    expect(cuerpo).not.toMatch(/^\s*r record;/m);
    expect(cuerpo).toContain('for v_fila in');
    expect(cuerpo).toContain('v_fila.cuenta');
    expect(cuerpo).toContain('v_fila.monto');
    expect(cuerpo).toContain('v_fila.descripcion');
    expect(cuerpo).not.toMatch(/\br\.(cuenta|monto|descripcion)\b/);
  });

  test('compra, venta y nota crédito siguen leyendo su regla y repartiendo líneas', () => {
    expect(cuerpo).toContain("if p_tipo = 'compra' then");
    expect(cuerpo).toContain("p_tipo = 'nota_credito' and p_lineas is not null");
    expect(cuerpo).toContain('from public.fn_regla_devengo_compra(v_org) r');
    expect(cuerpo).toContain('from public.accounting_rules r');
    expect(cuerpo).toContain("r.source_type = 'sale_credit_note'");
    expect(cuerpo).toContain('from public.fn_regla_devengo_venta(v_org) r');
    expect(cuerpo).toContain("when p_tipo in ('compra', 'documento_soporte') and coalesce(pr.track_stock, false) then 'inventario'");
    expect(cuerpo).toContain("when p_tipo = 'nota_credito' then 'devolucion'");
    expect(cuerpo).toContain("else 'ingreso'");
    expect(cuerpo).toContain('fn_validar_cuenta_movimiento');
    expect(cuerpo).toContain('El asiento no cuadra con las líneas del documento');
  });
});

describe('fn_factura_compra_confirmar queda en una sola firma', () => {
  const cuerpo = ultima('fn_factura_compra_confirmar');
  const archivo = readdirSync(DIR)
    .filter((nombre) => nombre.endsWith('.sql'))
    .sort()
    .reverse()
    .find((nombre) => /create\s+or\s+replace\s+function\s+public\.fn_factura_compra_confirmar\s*\(/i.test(readFileSync(join(DIR, nombre), 'utf8')));
  const sql = readFileSync(join(DIR, archivo!), 'utf8');

  test('el cuarto argumento tiene null por defecto y llama a la interna con lotes', () => {
    expect(cuerpo).toMatch(/p_lotes jsonb default null/);
    expect(cuerpo).toMatch(/p_recepcionar boolean default true/);
    expect(cuerpo).toMatch(/p_generar_ds boolean default false/);
    expect(cuerpo).toContain('fn_finanzas_exigir_permiso');
    expect(cuerpo).toContain('auth.uid()');
    expect(cuerpo).toMatch(/fn_fc_confirmar_int\(\s*p_id,\s*coalesce\(p_recepcionar, true\),\s*coalesce\(p_generar_ds, false\),\s*auth\.uid\(\),\s*p_lotes\s*\)/);
    expect(sql).toContain('drop function if exists public.fn_factura_compra_confirmar(uuid, boolean, boolean);');
    expect(sql).toContain('revoke all on function public.fn_factura_compra_confirmar(uuid, boolean, boolean, jsonb) from public, anon;');
  });
});

describe('errores contables de la confirmación', () => {
  test.each([
    ['record "r" is not assigned yet', 'asiento_no_armado', 422],
    ['No hay regla contable activa para este documento', 'asiento_sin_regla', 422],
    ['El asiento no cuadra con las líneas del documento', 'asiento_no_cuadra', 422],
    ['La cuenta 2408 exige el NIT o la cédula del tercero', 'asiento_exige_tercero', 422],
    ['La cuenta 1435 exige un centro de costo', 'asiento_exige_centro', 422],
    ['La cuenta 1405 no es de movimiento', 'asiento_cuenta_invalida', 422],
    ['Periodo contable cerrado para la fecha 2026-10-22', 'asiento_periodo_cerrado', 409],
    ['Documento no encontrado', 'no_encontrado', 404],
    ['relation "invoice_purchase" does not exist', 'error_desconocido', 500],
  ] as const)('%s → %s %i', (mensaje, codigo, estado) => {
    expect(codigoErrorCompra(mensaje)).toBe(codigo);
    expect(estadoHttpErrorCompra(codigoErrorCompra(mensaje))).toBe(estado);
  });

  test('el texto contable es una frase y el resto de códigos se conservan', () => {
    expect(mensajeErrorCompra('asiento_no_armado')).toMatch(/asiento/);
    expect(mensajeErrorCompra('asiento_no_armado')).not.toMatch(/record|assigned/);
    expect(mensajeErrorCompra('asiento_exige_tercero')).toMatch(/NIT/);
    expect(mensajeErrorCompra('ya_confirmada')).toBe('ya_confirmada');
  });
});
