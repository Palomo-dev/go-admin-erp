/**
 * QA 25-oct (faad917f): contratos de las migraciones P1 134010/134030/134060.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const DIR = join(__dirname, '..', '..', '..', '..', 'supabase');
const leer = (rel: string) => readFileSync(join(DIR, rel), 'utf8');
const m134010 = leer('migrations/20261025134010_p1_plan_cuentas_saldos_iniciales.sql');
const m134030 = leer('migrations/20261025134030_p1_funciones_cuentas_titulo_a_auxiliar.sql');
const m134060 = leer('migrations/20261025134060_p1_reclasificar_y_titular.sql');
const r134030 = leer('rollbacks/20261025134030_p1_funciones_cuentas_titulo_a_auxiliar_rollback.sql');
const m134040 = leer('migrations/20261025134040_p1_siembra_auxiliares_movimiento.sql');
const r134040 = leer('rollbacks/20261025134040_p1_siembra_auxiliares_movimiento_rollback.sql');
const r134060 = leer('rollbacks/20261025134060_p1_reclasificar_y_titular_rollback.sql');

function cuerpoFuncion(sql: string, fn: string): string {
  const desde = sql.search(new RegExp(String.raw`create\s+or\s+replace\s+function\s+public\.${fn}\s*\(`, 'i'));
  expect(desde).toBeGreaterThan(-1);
  const resto = sql.slice(desde);
  const fin = resto.search(/\n\$(function|fn)?\$\s*;/);
  return fin === -1 ? resto : resto.slice(0, fin);
}

describe('134010: orden de creación del plan', () => {
  const filas = [...m134010.matchAll(/\('(\d+)',\s*'(\d+)',\s*'[^']*',\s*(?:true|false),\s*'\w+',\s*(\d+)\)/g)]
    .map(([, codigo, padre, orden]) => ({ codigo, padre, orden: Number(orden) }));

  test('lee todas las cuentas nuevas y el orden es único', () => {
    expect(filas).toHaveLength(25);
    expect(new Set(filas.map((f) => f.orden)).size).toBe(filas.length);
  });

  test('todo padre nuevo se crea antes que sus hijos', () => {
    const orden = new Map(filas.map((f) => [f.codigo, f.orden]));
    for (const f of filas) {
      const op = orden.get(f.padre);
      if (op !== undefined) expect(op).toBeLessThan(f.orden);
    }
    expect(orden.get('140505')).toBeLessThan(orden.get('14050501')!);
    expect(orden.get('614005')).toBeLessThan(orden.get('61400501')!);
    expect(orden.get('614005')).toBeLessThan(orden.get('61400502')!);
  });
});

describe('134060: 6140 se trata igual que 6135', () => {
  test('6140 está en los padres a titular y su saldo va a 61400501', () => {
    expect(m134060).toMatch(/v_padres text\[\] := array\[[^\]]*'6135','6140'/);
    expect(m134060).toMatch(/when '6140'\s+then '61400501'/);
  });
  test('el rollback documenta y verifica 6140', () => {
    expect(r134060).toMatch(/6140/);
    expect(r134060).toMatch(/objeto = 'titulo'/);
  });
});

describe('134030: resolver, propuesta y separación de insumos', () => {
  test('paso 3 del resolver no acepta es_movimiento NULL', () => {
    const cuerpo = cuerpoFuncion(m134030, 'fn_cuenta_auxiliar_de_titulo');
    expect(cuerpo).not.toMatch(/es_movimiento is distinct from false/);
  });
  test('la propuesta por sector devuelve el auxiliar 14350101, no el título 1435', () => {
    const cuerpo = cuerpoFuncion(m134030, 'fn_propuesta_configuracion_sector');
    expect(cuerpo).toMatch(/when 'inventario' then '14350101'/);
    expect(cuerpo).toMatch(/\('inventario', '14350101'\)/);
    expect(cuerpo).not.toMatch(/'1435'\)/);
  });
  test('insumo a 14050501 solo con la separación activa; orgs existentes desactivadas', () => {
    expect(m134030).toMatch(/create table if not exists public\.p1_separacion_insumos/);
    expect(m134030).toMatch(/from public\.organizations o where o\.type_id in \(1, 2\)/);
    const flag = cuerpoFuncion(m134030, 'fn_separacion_insumos_activa');
    // Sin fila = APAGADA (QA 558bea34 B1).
    expect(flag).toMatch(/coalesce\(\(select s\.activa[\s\S]*\), false\)/);
    const clasif = cuerpoFuncion(m134030, 'fn_clasificar_producto_restaurante');
    expect(clasif).toMatch(/case when public\.fn_separacion_insumos_activa\(p_org\) then '14050501' else '14350101' end/);
    expect(r134030).toMatch(/drop table if exists public\.p1_separacion_insumos/);
    expect(r134030).toMatch(/drop function if exists public\.fn_separacion_insumos_activa\(integer\)/);
  });
  test('retenciones: sin línea del proveedor falla con aviso; el rollback restaura la versión anterior', () => {
    const cuerpo = cuerpoFuncion(m134030, 'fn_asiento_compra_aplicar_retenciones');
    expect(cuerpo).toMatch(/raise exception 'RETENCIONES_SIN_LINEA_PROVEEDOR/);
    expect(r134030).toMatch(/create or replace function public\.fn_asiento_compra_aplicar_retenciones/);
  });
});

describe('QA 558bea34', () => {
  test('alta de org H/R crea su fila con la separación activa; el rollback la quita', () => {
    const fn = cuerpoFuncion(m134040, 'fn_p1_separacion_insumos_alta');
    expect(fn).toMatch(/if new\.type_id in \(1, 2\) then/);
    expect(fn).toMatch(/values \(new\.id, true,/);
    expect(m134040).toMatch(/create trigger trg_p1_separacion_insumos_alta\s+after insert on public\.organizations/);
    expect(r134040).toMatch(/drop trigger if exists trg_p1_separacion_insumos_alta on public\.organizations/);
    expect(r134040).toMatch(/drop function if exists public\.fn_p1_separacion_insumos_alta\(\)/);
  });
  test('134060: control previo incluye 6140, verificación final real y esperado 7', () => {
    expect(m134060).toMatch(/'''\(6135\|6140\|4295/);
    expect(m134060).toMatch(/Verificación final[\s\S]*raise exception '134060 verificación final/);
    expect(m134060).toMatch(/c\.account_code in \('6135', '6140'\) and c\.es_movimiento is false/);
    expect(m134060).toMatch(/\(esperado 7\)/);
    expect(m134060).not.toMatch(/conteo de asientos sube/);
  });
});

describe('P1: «comisiones» (vendedores, D5235/C2370) no va a 53051501 (solo cobros bancarios)', () => {
  const m134020 = leer('migrations/20261025134020_p1_reglas_saldos_iniciales_37050501.sql');
  test('134020 no reasigna la clave comisiones', () => {
    expect(m134020).not.toMatch(/clave\s*=\s*'comisiones'[^\n]*53051501/);
  });
  test('134040 no siembra comisiones -> 53051501', () => {
    expect(m134040).not.toMatch(/'comisiones'\s*then\s*'53051501'/);
  });
});

describe('P1: chart_of_accounts.activa es columna generada (COALESCE(is_active, true))', () => {
  test('134010 y 134040 no insertan activa', () => {
    for (const sql of [m134010, m134040]) {
      expect(sql).not.toMatch(/insert\s+into\s+public\.chart_of_accounts\s*\([^)]*\bactiva\b/i);
    }
  });
});
