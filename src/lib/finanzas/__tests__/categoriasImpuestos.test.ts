import * as fs from 'fs';
import * as path from 'path';
import {
  CODIGOS_ERROR_CATEGORIA,
  SUBCATEGORIAS_IMPUESTO,
  codigoErrorCategoria,
  cuentaPermitidaParaRol,
  esImputable,
  exigeCuentaAlUsar,
  ordenarConHijas,
  rolImpuesto,
  tipoImpuesto,
  vistaPreviaAsiento,
  type CuentaConocida,
} from '../categoriasTesoreria';
import { CODIGOS_ERROR_TESORERIA, codigoErrorTesoreria } from '../movimientoBancario';

const RAIZ = path.resolve(__dirname, '..', '..', '..', '..');
const leer = (ruta: string) => fs.readFileSync(path.join(RAIZ, ruta), 'utf8');
const SQL = leer('supabase/migrations/20261107101000_tesoreria_impuestos_padre_y_subcategorias.sql');
const ejecutable = SQL.split('\n').filter((linea) => !linea.trim().startsWith('--')).join('\n');

describe('padre organizador y subcategorías', () => {
  test('«Impuestos» agrupa y no se elige en un movimiento', () => {
    const rol = rolImpuesto('impuestos', null);
    expect(rol).toBe('agrupa');
    expect(esImputable(rol)).toBe(false);
  });

  test('las subcategorías sí se eligen', () => {
    for (const { clave } of SUBCATEGORIAS_IMPUESTO) {
      expect(esImputable(rolImpuesto(clave, 'impuestos'))).toBe(true);
    }
    expect(esImputable(rolImpuesto('gmf', 'impuestos'))).toBe(true);
    expect(esImputable(rolImpuesto('arriendo', null))).toBe(true);
  });

  test('una categoría ajena a impuestos no tiene rol', () => {
    expect(rolImpuesto('arriendo', null)).toBeNull();
    expect(rolImpuesto(null, null)).toBeNull();
    expect(rolImpuesto(null, 'arriendo')).toBeNull();
  });

  test('una subcategoría manual bajo «Impuestos» cuenta como subcategoría', () => {
    expect(rolImpuesto(null, 'impuestos')).toBe('subcategoria');
    expect(exigeCuentaAlUsar('subcategoria', null)).toBe(true);
  });

  test('la cuenta se exige al usar, salvo en GMF, que sigue su flujo de extracto', () => {
    expect(exigeCuentaAlUsar(rolImpuesto('imp_renta', 'impuestos'), 'imp_renta')).toBe(true);
    expect(exigeCuentaAlUsar(rolImpuesto('imp_gasto', 'impuestos'), 'imp_gasto')).toBe(true);
    expect(exigeCuentaAlUsar(rolImpuesto('gmf', 'impuestos'), 'gmf')).toBe(false);
    expect(exigeCuentaAlUsar(null, 'arriendo')).toBe(false);
  });
});

describe('pagar un impuesto cancela el pasivo y no vuelve a causar el gasto', () => {
  const plan = new Map<string, CuentaConocida>([
    ['24080501', { existe: true, esMovimiento: true }],
    ['11050501', { existe: true, esMovimiento: true }],
    ['511595', { existe: true, esMovimiento: true }],
  ]);

  test('la subcategoría de pasivo solo admite clase 2', () => {
    const rol = rolImpuesto('imp_iva', 'impuestos');
    expect(cuentaPermitidaParaRol(rol, '24080501')).toBe(true);
    expect(cuentaPermitidaParaRol(rol, '511595')).toBe(false);
    expect(cuentaPermitidaParaRol(rol, '5105')).toBe(false);
  });

  test('el impuesto que es gasto sí va a gasto', () => {
    expect(cuentaPermitidaParaRol(rolImpuesto('imp_gasto', 'impuestos'), '51159501')).toBe(true);
    expect(cuentaPermitidaParaRol(rolImpuesto('gmf', 'impuestos'), '511595')).toBe(true);
  });

  test('todas las de pasivo sembradas son clase 2 y la de gasto clase 5', () => {
    for (const { clave, cuenta } of SUBCATEGORIAS_IMPUESTO) {
      const rol = rolImpuesto(clave, 'impuestos');
      expect(cuenta[0]).toBe(rol === 'pasivo' ? '2' : '5');
    }
  });

  test('el asiento debita el pasivo y acredita la caja, sin líneas de gasto', () => {
    const vista = vistaPreviaAsiento({ tipo: 'out', cuentaMovimiento: '24080501', cuentaTesoreria: '11050501', cuentas: plan });
    expect(vista).toEqual({ debito: '24080501', credito: '11050501', fallo: null });
    expect(vista.debito?.startsWith('5')).toBe(false);
    expect(vista.credito?.startsWith('5')).toBe(false);
  });

  test('la columna Tipo', () => {
    expect(tipoImpuesto('agrupa', null)).toBe('agrupa');
    expect(tipoImpuesto('pasivo', '24080501')).toBe('cancela_pasivo');
    expect(tipoImpuesto('gasto', '511595')).toBe('gasto');
    expect(tipoImpuesto('subcategoria', '23652501')).toBe('cancela_pasivo');
    expect(tipoImpuesto('subcategoria', '511595')).toBe('gasto');
    expect(tipoImpuesto(null, '5105')).toBeNull();
  });
});

describe('árbol de categorías', () => {
  test('cada padre seguido de sus hijas, por orden', () => {
    const filas = [
      { id: 1, padre_id: null, orden: 20 },
      { id: 2, padre_id: 3, orden: 20 },
      { id: 3, padre_id: null, orden: 10 },
      { id: 4, padre_id: 3, orden: 10 },
    ];
    expect(ordenarConHijas(filas).map(({ fila, nivel }) => [fila.id, nivel])).toEqual([[3, 0], [4, 1], [2, 1], [1, 0]]);
  });

  test('una hija sin su padre en la lista queda en la raíz', () => {
    expect(ordenarConHijas([{ id: 2, padre_id: 9, orden: 10 }])).toEqual([{ fila: { id: 2, padre_id: 9, orden: 10 }, nivel: 0 }]);
  });
});

describe('la migración', () => {
  test('el catálogo de TS coincide con la siembra', () => {
    for (const { clave, nombre, cuenta } of SUBCATEGORIAS_IMPUESTO) {
      expect(ejecutable).toMatch(new RegExp(`\\('${clave}',\\s+'${nombre}',\\s+'${cuenta}',`));
    }
  });

  test('la siembra no inventa cuentas', () => {
    expect(ejecutable).not.toContain('fn_puc_asegurar_cuenta');
    expect(ejecutable).not.toMatch(/insert\s+into\s+public\.chart_of_accounts/i);
  });

  test('no toca el mapeo tributario, ni asientos, ni saldos', () => {
    expect(ejecutable).not.toMatch(/(update|delete from|insert into)\s+public\.tax_account_mapping/i);
    expect(ejecutable).not.toMatch(/(update|delete from|insert into)\s+public\.journal_/i);
  });

  test('el padre nace sin cuenta', () => {
    expect(ejecutable).toContain("('impuestos', 'egreso', 'Impuestos', 'landmark', null, 150)");
    expect(ejecutable).not.toContain("'51159501'\n     where id = v_padre");
  });

  test('lo ya registrado no se vuelve a juzgar', () => {
    expect(ejecutable).toMatch(/if tg_op = 'INSERT'\s+or new\.categoria_id is distinct from old\.categoria_id\s+or new\.cuenta_contable is distinct from old\.cuenta_contable then/);
  });

  test('el rollback restaura las cuatro funciones', () => {
    const rollback = leer('supabase/rollbacks/20261107101000_tesoreria_impuestos_padre_y_subcategorias_rollback.sql');
    for (const funcion of ['fn_categorias_tesoreria_guardar', 'fn_sembrar_categorias_tesoreria', 'fn_tesoreria_sembrar_impuestos', 'fn_validar_datos_tesoreria']) {
      expect(rollback).toContain(`create or replace function public.${funcion}(`);
    }
  });
});

describe('errores en pantalla', () => {
  test('los códigos del servidor se traducen', () => {
    expect(codigoErrorTesoreria({ message: 'categoria_no_imputable: «Impuestos» agrupa' })).toBe('categoria_no_imputable');
    expect(codigoErrorTesoreria({ message: 'categoria_requiere_cuenta: necesita' })).toBe('categoria_requiere_cuenta');
    expect(codigoErrorTesoreria({ message: 'impuesto_cancela_pasivo: clase 2' })).toBe('impuesto_cancela_pasivo');
    expect(codigoErrorCategoria({ message: 'padre_no_imputable: agrupa' })).toBe('padre_no_imputable');
    expect(codigoErrorCategoria({ message: 'otra cosa' })).toBeNull();
  });

  test.each(['es', 'en', 'fr', 'pt'])('%s tiene todos los textos', (idioma) => {
    const mensajes = JSON.parse(leer(`messages/${idioma}.json`)) as {
      tesoreria: { errores: Record<string, string>; categorias: { errores: Record<string, string> } };
    };
    for (const codigo of CODIGOS_ERROR_TESORERIA) {
      expect(mensajes.tesoreria.errores[codigo]).toBeTruthy();
    }
    for (const codigo of CODIGOS_ERROR_CATEGORIA) {
      expect(mensajes.tesoreria.categorias.errores[codigo]).toBeTruthy();
    }
  });
});
