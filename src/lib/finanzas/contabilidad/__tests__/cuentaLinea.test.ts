import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  cuentaDeLinea,
  esCuentaDeMovimiento,
  esCuentaDeTitulo,
  rolCuentaCompra,
  type CuentaParaMovimiento,
} from '../cuentaLinea';
import { esTipoComprobante, textoComprobante } from '../comprobante';

const producto = {
  cuenta_ingreso: '4135',
  cuenta_costo: '6135',
  cuenta_inventario: '1435',
  cuenta_devolucion: '4175',
};
const categoria = {
  cuenta_ingreso: '4105',
  cuenta_costo: '6105',
  cuenta_inventario: '1405',
  cuenta_devolucion: null,
};

describe('cuenta de la línea', () => {
  it('prefiere la cuenta escrita en la línea', () => {
    expect(cuentaDeLinea({ rol: 'ingreso', cuentaLinea: ' 413595 ', producto, categoria })).toBe('413595');
  });

  it('si la línea no trae cuenta, usa la del producto y luego la de la categoría', () => {
    expect(cuentaDeLinea({ rol: 'ingreso', cuentaLinea: '  ', producto, categoria })).toBe('4135');
    expect(cuentaDeLinea({ rol: 'ingreso', producto: { cuenta_ingreso: null }, categoria })).toBe('4105');
    expect(cuentaDeLinea({ rol: 'costo', producto: {}, categoria })).toBe('6105');
    expect(cuentaDeLinea({ rol: 'inventario', producto, categoria })).toBe('1435');
  });

  it('la devolución cae a la cuenta de ingreso del producto antes que a la categoría', () => {
    expect(cuentaDeLinea({ rol: 'devolucion', producto: { cuenta_ingreso: '4135' }, categoria })).toBe('4135');
    expect(
      cuentaDeLinea({
        rol: 'devolucion',
        producto: {},
        categoria: { cuenta_devolucion: '4175', cuenta_ingreso: '4105' },
      }),
    ).toBe('4175');
  });

  it('sin ninguna cuenta propia deja la decisión a la configuración contable', () => {
    expect(cuentaDeLinea({ rol: 'ingreso', producto: {}, categoria: {} })).toBeNull();
  });

  it('una compra con existencias va a inventario y sin ellas a costo', () => {
    expect(rolCuentaCompra(true)).toBe('inventario');
    expect(rolCuentaCompra(false)).toBe('costo');
  });
});

const plan: CuentaParaMovimiento[] = [
  { account_code: '41', parent_code: null, is_active: true, es_movimiento: false },
  { account_code: '4135', parent_code: '41', is_active: true, es_movimiento: true },
  { account_code: '413595', parent_code: '4135', is_active: true, es_movimiento: true },
  { account_code: '5195', parent_code: '51', is_active: false, es_movimiento: true },
  { account_code: '1105', parent_code: '11', is_active: true, es_movimiento: null },
];

describe('cuentas de movimiento', () => {
  it('rechaza clases, títulos, inactivas y las marcadas como no movimiento', () => {
    expect(esCuentaDeTitulo('41', plan)).toBe(true);
    expect(esCuentaDeTitulo('4135', plan)).toBe(true);
    expect(esCuentaDeMovimiento(plan[0], plan)).toBe(false);
    expect(esCuentaDeMovimiento(plan[1], plan)).toBe(false);
    expect(esCuentaDeMovimiento(plan[2], plan)).toBe(true);
    expect(esCuentaDeMovimiento(plan[3], plan)).toBe(false);
    expect(esCuentaDeMovimiento(plan[4], plan)).toBe(true);
  });
});

describe('comprobante', () => {
  it('arma el número imprimible y reconoce los cuatro tipos', () => {
    expect(textoComprobante('RC', 42)).toBe('RC-000042');
    expect(textoComprobante(null, null)).toBeNull();
    expect(esTipoComprobante('nota_contable')).toBe(true);
    expect(esTipoComprobante('otro')).toBe(false);
  });
});

describe('la migración no reescribe el asiento estándar', () => {
  const dir = join(process.cwd(), 'supabase/migrations');
  const sql = readdirSync(dir)
    .filter((nombre) => nombre.includes('comprobantes_asientos') && nombre.endsWith('.sql'))
    .sort()
    .map((nombre) => readFileSync(join(dir, nombre), 'utf8'))
    .join('\n');

  it('sigue llamando a fn_create_journal_entry y no la reemplaza', () => {
    expect(sql).not.toMatch(/create or replace function public\.fn_create_journal_entry/i);
    expect(sql).toContain('fn_create_journal_entry');
    expect(sql).toContain('fase5-cuenta-linea');
    expect(sql).not.toContain('fn_vista_previa_asiento_documento(uuid, text, jsonb)');
    expect(sql.toLowerCase()).not.toContain('temporary table');
  });
});
