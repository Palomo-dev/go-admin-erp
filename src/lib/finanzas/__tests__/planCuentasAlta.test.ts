import { armarArbolPlan } from '../planCuentasVista';
import {
  filasVisibles,
  indiceAltaEn,
  interpretarErrorAlta,
  planConAuxiliar,
  puedeCrearAuxiliar,
  saldosAcumulados,
  saldosConAuxiliar,
  siguienteAuxiliar,
  situacionPadre,
  validarCodigoAuxiliar,
} from '../planCuentasAlta';

const cuenta = (account_code: string, parent_code: string | null, es_movimiento = false) => ({
  account_code,
  parent_code,
  es_movimiento,
  is_active: true,
});

describe('alta de auxiliares (decisión del Contador)', () => {
  it('solo una subcuenta activa de 6 dígitos admite «+ Auxiliar»', () => {
    expect(puedeCrearAuxiliar({ account_code: '111005', is_active: true })).toBe(true);
    expect(puedeCrearAuxiliar({ account_code: '111005', is_active: false })).toBe(false);
    for (const codigo of ['1', '11', '1110', '11100501', '1110050101']) {
      expect(puedeCrearAuxiliar({ account_code: codigo })).toBe(false);
    }
  });

  it('propone el primer código libre de 8 dígitos', () => {
    expect(siguienteAuxiliar('110510', [])).toBe('11051001');
    expect(siguienteAuxiliar('110510', ['11051001', '11051003'])).toBe('11051002');
  });

  it('valida la forma del código', () => {
    expect(validarCodigoAuxiliar('110510', '11051001')).toBeNull();
    expect(validarCodigoAuxiliar('110510', '1105100')).toBe('forma');
    expect(validarCodigoAuxiliar('110510', '11051100')).toBe('prefijo');
    expect(validarCodigoAuxiliar('110510', '11051000')).toBe('cero');
  });

  it('distingue qué le pasa a la subcuenta', () => {
    expect(situacionPadre({ es_movimiento: false }, 500)).toBe('normal');
    expect(situacionPadre({ es_movimiento: true }, 0)).toBe('pasa_a_titulo');
    expect(situacionPadre({ es_movimiento: true }, 0.004)).toBe('pasa_a_titulo');
    expect(situacionPadre({ es_movimiento: true }, 2300000)).toBe('con_saldo');
    expect(situacionPadre({ es_movimiento: true }, -2300000)).toBe('con_saldo');
  });
});

describe('saldos del árbol', () => {
  it('suma por prefijo, incluido lo propio de una cuenta de título', () => {
    const acumulados = saldosAcumulados(new Map([
      ['110505', { saldo: 2300000, movimientos: 4 }],
      ['110510', { saldo: 250000, movimientos: 1 }],
      ['1105', { saldo: 100, movimientos: 1 }],
      ['2205', { saldo: -900, movimientos: 1 }],
    ]));
    expect(acumulados.get('1105')).toBe(2550100);
    expect(acumulados.get('11')).toBe(2550100);
    expect(acumulados.get('1')).toBe(2550100);
    expect(acumulados.get('2')).toBe(-900);
  });

  it('el traslado deja la subcuenta en cero y conserva sus movimientos', () => {
    const saldos = new Map([['110505', { saldo: 2300000, movimientos: 148 }]]);
    const salida = saldosConAuxiliar(saldos, '110505', '11050501', 2300000);
    expect(salida.get('110505')).toEqual({ saldo: 0, movimientos: 148 });
    expect(salida.get('11050501')).toEqual({ saldo: 2300000, movimientos: 1 });
    expect(saldos.get('110505')?.saldo).toBe(2300000);
  });
});

describe('fila nueva en el árbol', () => {
  const plan = [
    cuenta('1', null),
    cuenta('11', '1'),
    cuenta('1105', '11'),
    cuenta('110505', '1105', true),
    cuenta('110510', '1105'),
    cuenta('11051001', '110510', true),
    cuenta('1110', '11', true),
  ];
  const arbol = armarArbolPlan(plan);

  it('solo muestra las ramas abiertas y la búsqueda abre todas', () => {
    expect(filasVisibles(arbol, new Set(['1'])).map((f) => f.nodo.cuenta.account_code)).toEqual(['1', '11']);
    expect(filasVisibles(arbol, new Set(), true)).toHaveLength(plan.length);
  });

  it('el alta nace al final de la rama del padre, no al final de la tabla', () => {
    const filas = filasVisibles(arbol, new Set(), true);
    expect(filas[indiceAltaEn(filas, '110510')].nodo.cuenta.account_code).toBe('11051001');
    expect(filas[indiceAltaEn(filas, '110505')].nodo.cuenta.account_code).toBe('110505');
  });

  it('agrega el auxiliar en orden y marca el padre como título sin mutar el plan', () => {
    const salida = planConAuxiliar(plan, '110505', cuenta('11050501', '110505', true));
    expect(salida.map((c) => c.account_code).indexOf('11050501')).toBe(4);
    expect(salida.find((c) => c.account_code === '110505')?.es_movimiento).toBe(false);
    expect(plan.find((c) => c.account_code === '110505')?.es_movimiento).toBe(true);
  });
});

describe('errores del servidor', () => {
  it('traduce cada error', () => {
    expect(interpretarErrorAlta({ message: 'CODIGO_OCUPADO: 11051003' })).toEqual({ tipo: 'ocupado', siguiente: '11051003' });
    expect(interpretarErrorAlta({ message: 'CODIGO_OCUPADO: ' })).toEqual({ tipo: 'ocupado', siguiente: null });
    expect(interpretarErrorAlta({ message: 'PADRE_CON_SALDO: -1500.00' })).toEqual({ tipo: 'saldo', saldo: -1500 });
    expect(interpretarErrorAlta({ message: 'PERIODO_CERRADO' })).toEqual({ tipo: 'periodo' });
    expect(interpretarErrorAlta({ message: 'TERCERO_REQUERIDO: la cuenta 1305' })).toEqual({ tipo: 'tercero' });
    expect(interpretarErrorAlta({ message: 'Acceso denegado a la organización' })).toEqual({ tipo: 'permiso' });
    expect(interpretarErrorAlta(new Error('otra cosa'))).toEqual({ tipo: 'otro', texto: 'otra cosa' });
  });
});
