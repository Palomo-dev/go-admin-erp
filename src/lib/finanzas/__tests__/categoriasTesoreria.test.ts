import * as fs from 'fs';
import * as path from 'path';
import {
  MENSAJE_ELIGE_CUENTA,
  MENSAJE_SIN_TESORERIA,
  PREDEFINIDAS,
  cuentaParaContabilizar,
  limitesMes,
  mensajeCuentaAusente,
  mensajeCuentaNoMovimiento,
  mensajeCuentasIguales,
  mensajeEgresoContraIngreso,
  mensajeIngresoContraGasto,
  padresValidos,
  resumirCategorias,
  vistaPreviaAsiento,
  type CuentaConocida,
} from '../categoriasTesoreria';

const RAIZ = path.resolve(__dirname, '..', '..', '..', '..');
const SQL = fs.readFileSync(
  path.join(RAIZ, 'supabase/migrations/20261022004418_categorias_tesoreria.sql'),
  'utf8',
);

const movimiento = (codigo: string, esMovimiento = true): [string, CuentaConocida] => [
  codigo,
  { existe: true, esMovimiento },
];

describe('catálogo predefinido', () => {
  test('son 38 y cada clave está en la migración, una sola vez', () => {
    expect(PREDEFINIDAS).toHaveLength(38);
    expect(PREDEFINIDAS.filter((c) => c.tipo === 'ingreso')).toHaveLength(12);
    expect(PREDEFINIDAS.filter((c) => c.tipo === 'egreso')).toHaveLength(26);
    const claves = PREDEFINIDAS.map((c) => c.clave);
    expect(new Set(claves).size).toBe(38);
    for (const clave of claves) {
      expect(SQL.split(`('${clave}'`).length - 1).toBe(1);
    }
  });

  test('no siembra las organizaciones que ya existen', () => {
    expect(SQL).not.toMatch(/for\s+\w+\s+in\s+select/i);
    expect(SQL).toMatch(/tr_zzz_categorias_tesoreria/);
    const propuesta = fs.readFileSync(
      path.join(RAIZ, 'supabase/propuestas/20261022053000_categorias_tesoreria_organizaciones.sql'),
      'utf8',
    );
    const raise = propuesta.indexOf('raise exception');
    const bucle = propuesta.indexOf('for org in');
    expect(raise).toBeGreaterThan(-1);
    expect(bucle).toBeGreaterThan(raise);
  });

  test('la cuenta sugerida respeta activa y es_movimiento', () => {
    expect(cuentaParaContabilizar({ account_code: '4135', is_active: true, es_movimiento: null })).toBe('4135');
    expect(cuentaParaContabilizar({ account_code: '4135', is_active: true, es_movimiento: false })).toBe('');
    expect(cuentaParaContabilizar({ account_code: '4135', is_active: false, es_movimiento: true })).toBe('');
    expect(cuentaParaContabilizar(null)).toBe('');
    expect(SQL).toMatch(/es_movimiento is distinct from false/);
  });
});

describe('vista previa del asiento', () => {
  const cuentas = new Map<string, CuentaConocida>([
    movimiento('110505'),
    movimiento('519530'),
    movimiento('413505'),
    movimiento('4175'),
    movimiento('4295'),
    movimiento('4135', false),
  ]);

  test('los textos coinciden con la función de la base', () => {
    expect(SQL).toContain(MENSAJE_ELIGE_CUENTA);
    expect(SQL).toContain(MENSAJE_SIN_TESORERIA);
    expect(SQL).toContain('La cuenta %s no está en el plan contable');
    expect(SQL).toContain('La cuenta %s no es de movimiento');
    expect(SQL).toContain('Las cuentas de débito y crédito quedaron iguales (%s)');
    expect(SQL).toContain('Un egreso no se debita contra una cuenta de ingreso (%s)');
    expect(SQL).toContain('Un ingreso no se acredita contra una cuenta de gasto (%s)');
  });

  test('egreso debita la cuenta elegida y acredita la caja', () => {
    expect(vistaPreviaAsiento({
      tipo: 'out',
      cuentaMovimiento: '519530',
      cuentaTesoreria: '110505',
      cuentas,
    })).toEqual({ debito: '519530', credito: '110505', fallo: null });
  });

  test('ingreso debita la caja y acredita la cuenta elegida', () => {
    expect(vistaPreviaAsiento({
      tipo: 'in',
      cuentaMovimiento: '413505',
      cuentaTesoreria: '110505',
      cuentas,
    })).toEqual({ debito: '110505', credito: '413505', fallo: null });
  });

  test('rechaza título, clase cruzada, cuentas iguales y cuenta ausente', () => {
    expect(vistaPreviaAsiento({ tipo: 'out', cuentaMovimiento: '  ', cuentaTesoreria: '110505', cuentas }).fallo)
      .toBe(MENSAJE_ELIGE_CUENTA);
    expect(vistaPreviaAsiento({ tipo: 'out', cuentaMovimiento: '519530', cuentaTesoreria: '', cuentas }).fallo)
      .toBe(MENSAJE_SIN_TESORERIA);
    expect(vistaPreviaAsiento({ tipo: 'out', cuentaMovimiento: '4135', cuentaTesoreria: '110505', cuentas }).fallo)
      .toBe(mensajeCuentaNoMovimiento('4135'));
    expect(vistaPreviaAsiento({ tipo: 'out', cuentaMovimiento: '9999', cuentaTesoreria: '110505', cuentas }).fallo)
      .toBe(mensajeCuentaAusente('9999'));
    expect(vistaPreviaAsiento({ tipo: 'out', cuentaMovimiento: '110505', cuentaTesoreria: '110505', cuentas }).fallo)
      .toBe(mensajeCuentasIguales('110505'));
    expect(vistaPreviaAsiento({ tipo: 'out', cuentaMovimiento: '4295', cuentaTesoreria: '110505', cuentas }).fallo)
      .toBe(mensajeEgresoContraIngreso('4295'));
    expect(vistaPreviaAsiento({ tipo: 'out', cuentaMovimiento: '4175', cuentaTesoreria: '110505', cuentas }))
      .toEqual({ debito: '4175', credito: '110505', fallo: null });
    expect(vistaPreviaAsiento({ tipo: 'in', cuentaMovimiento: '519530', cuentaTesoreria: '110505', cuentas }).fallo)
      .toBe(mensajeIngresoContraGasto('519530'));
  });

  test('la ruta sin cuenta elegida sigue usando el asiento de concepto', () => {
    const caja = SQL.slice(SQL.indexOf('function public.fn_auto_journal_cash_movement'));
    const banco = caja.slice(caja.indexOf('function public.fn_auto_journal_bank'));
    const cajaSola = caja.slice(0, caja.indexOf('function public.fn_auto_journal_bank'));
    expect(cajaSola.indexOf('fn_asiento_movimiento_caja')).toBeGreaterThan(cajaSola.indexOf('cuenta_contable'));
    expect(cajaSola.slice(cajaSola.indexOf('cuenta_contable'), cajaSola.indexOf('fn_asiento_movimiento_caja')))
      .not.toMatch(/fn_asiento_movimiento_caja/);
    expect(banco).toMatch(/array\['5305', '5195', '5135'\]/);
    // 134030 redefine el banco: otro ingreso = clave ingresos_diversos (42959501), sin desvío a 4250/4210.
    const p1 = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20261025134030_p1_funciones_cuentas_titulo_a_auxiliar.sql'), 'utf8');
    const bancoP1 = p1.slice(p1.search(/function public\.fn_auto_journal_bank\(/i));
    expect(bancoP1).toMatch(/array\[public\.fn_cuenta_ingresos_diversos\(/);
    expect(p1).not.toMatch(/array\['4250', '4295', '4210'\]/);
    expect(SQL).toMatch(/drop function if exists public\.pos_caja_registrar_movimiento\(integer, text, numeric, text, text, text, text, uuid, timestamptz\)/);
  });
});

describe('reporte por mes y sede', () => {
  const fila = {
    tipo: 'ingreso' as const,
    categoriaId: 1,
    categoriaNombre: 'Ventas de productos',
    branchId: 4,
    instante: '2026-01-01T03:00:00.000Z',
    monto: 80,
  };

  test('en Bogotá el 1 de enero a las 03:00 UTC todavía es diciembre', () => {
    expect(resumirCategorias([fila], '2025-12', 'America/Bogota', null)).toEqual([
      { categoriaId: 1, nombre: 'Ventas de productos', tipo: 'ingreso', movimientos: 1, total: 80 },
    ]);
    expect(resumirCategorias([fila], '2026-01', 'America/Bogota', null)).toEqual([]);
    expect(resumirCategorias([fila], '2026-01', 'UTC', null)).toHaveLength(1);
  });

  test('la sede filtra y el mes abre a medianoche de esa zona', () => {
    const otra = { ...fila, branchId: 9, instante: '2026-01-15T15:00:00.000Z', monto: -20, tipo: 'egreso' as const, categoriaId: null, categoriaNombre: null };
    expect(resumirCategorias([fila, otra], '2026-01', 'UTC', 9)).toEqual([
      { categoriaId: null, nombre: 'Sin categoría', tipo: 'egreso', movimientos: 1, total: 20 },
    ]);
    const limites = limitesMes('2026-01', 'America/Bogota');
    expect(new Date(limites.desde).toISOString()).toBe('2026-01-01T05:00:00.000Z');
    expect(new Date(limites.hasta).toISOString()).toBe('2026-02-01T05:00:00.000Z');
  });

  test('un padre no puede ser la categoría ni uno de sus hijos', () => {
    const categorias = [
      { id: 1, padreId: null },
      { id: 2, padreId: 1 },
      { id: 3, padreId: 2 },
      { id: 4, padreId: null },
    ];
    expect(padresValidos(categorias, 1).map((c) => c.id)).toEqual([4]);
    expect(padresValidos(categorias, null).map((c) => c.id)).toEqual([1, 2, 3, 4]);
  });
});
