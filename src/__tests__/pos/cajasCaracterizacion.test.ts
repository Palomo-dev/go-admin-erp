/**
 * Caracterización de Cajas antes del rediseño (docs/implementacion/CAJAS-VENTAS-PLAN.md §2.1).
 *
 * Fija la lógica que la pantalla nueva no puede perder, extraída a módulos
 * puros de `src/lib/pos/cajas/`:
 *  K2 cierre ciego · K3 alcance por modo · K4 errores de apertura ·
 *  K5 denominaciones · K6 conteo por método · K10 conceptos de movimiento.
 *
 * K9 (esperado del navegador = esperado del servidor), caracterización SQL por
 * el MCP el 2026-09-24, solo lectura: para las 60 últimas sesiones cerradas
 * (23 en modo `branch`, 37 en modo `user`; 47 con pagos en métodos distintos
 * del efectivo) se calculó en SQL la fórmula de `CajasService.getCashSummary`
 * (inicial + ventas en efectivo − vuelto + abonos en efectivo + entradas −
 * salidas − compras en efectivo − devoluciones heredadas, con la misma ventana
 * `opened_at..closed_at`, la misma sucursal y el filtro por cajero en modo
 * `user`) y se comparó con `pos_caja_esperado(id).efectivo_esperado`:
 * 60 de 60 iguales al centavo. Desde el rediseño la pantalla con red lee el
 * esperado del servidor y `getCashSummary` queda solo para el modo sin red.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  enmascararArqueo,
  enmascararEsperado,
  enmascararSesion,
  leerEsperado,
  visibilidadImportes,
} from '@/lib/pos/cajas/cierreCiego';
import {
  alcanceApertura,
  alcancesDisponibles,
  claveAlcance,
  claveTraduccionError,
  codigoCajaYaAbierta,
  sucursalDeApertura,
} from '@/lib/pos/cajas/alcance';
import {
  cantidadDenominacion,
  conteoParaGuardar,
  denominacionesDe,
  MONEDAS_CON_DENOMINACIONES,
  totalDenominaciones,
} from '@/lib/pos/cajas/denominaciones';
import { diferenciasPorMetodo } from '@/lib/pos/cajas/arqueo';
import {
  claveDeConcepto,
  conceptoParaGuardar,
  conceptosDe,
  CONCEPTOS_EGRESO,
  CONCEPTOS_INGRESO,
  efectoEnCaja,
  TEXTO_CANONICO,
  validarMovimiento,
} from '@/lib/pos/cajas/conceptos';

const RAIZ = path.resolve(__dirname, '..', '..', '..');
const mensajes = (idioma: string) => JSON.parse(fs.readFileSync(path.join(RAIZ, 'messages', `${idioma}.json`), 'utf8'));
const IDIOMAS = ['es', 'en', 'fr', 'pt'];

describe('K2 · cierre ciego', () => {
  test('tabla de verdad: sin cierre ciego siempre se ve; con cierre ciego solo con el permiso', () => {
    expect(visibilidadImportes(false, false)).toBe(true);
    expect(visibilidadImportes(false, true)).toBe(true);
    expect(visibilidadImportes(true, true)).toBe(true);
    expect(visibilidadImportes(true, false)).toBe(false);
  });

  const crudo = {
    session_id: 12,
    status: 'open',
    efectivo_esperado: '556230.00',
    por_metodo: { cash: 556230, card: '120000.5' },
    detalle: { inicial: 100000, ventas_efectivo: 457230, vuelto: 0, abonos_efectivo: 0, entradas: 0, salidas: 1000, compras_efectivo: 0, devoluciones: 0 },
    por_cajero: false,
    hasta: '2026-09-24T12:00:00Z',
  };

  test('leerEsperado convierte el jsonb de pos_caja_esperado a números', () => {
    const e = leerEsperado(crudo);
    expect(e.efectivo_esperado).toBe(556230);
    expect(e.por_metodo).toEqual({ cash: 556230, card: 120000.5 });
    expect(e.detalle?.salidas).toBe(1000);
    expect(e.oculto).toBe(false);
  });

  test('la respuesta oculta del servidor no trae cifras aunque vengan campos', () => {
    const e = leerEsperado({ ...crudo, oculto: true });
    expect(e.efectivo_esperado).toBeNull();
    expect(e.por_metodo).toBeNull();
    expect(e.detalle).toBeNull();
  });

  test('enmascarar quita esperado, desglose, final y diferencia; lo contado del arqueo se conserva', () => {
    const e = enmascararEsperado(leerEsperado(crudo), false);
    expect(e).toMatchObject({ efectivo_esperado: null, por_metodo: null, detalle: null, oculto: true });
    expect(enmascararEsperado(leerEsperado(crudo), true).efectivo_esperado).toBe(556230);

    expect(enmascararSesion({ id: 1, final_amount: 500, difference: -20 }, false)).toEqual({ id: 1, final_amount: null, difference: null });
    expect(enmascararSesion({ id: 1, final_amount: 500, difference: -20 }, true)).toEqual({ id: 1, final_amount: 500, difference: -20 });

    const arqueo = {
      counted_amount: 480,
      expected_amount: 500,
      difference: -20,
      method_breakdown: { cash: { esperado: 500, contado: 480, diferencia: -20 }, card: { esperado: 90, contado: null, diferencia: null } },
    };
    expect(enmascararArqueo(arqueo, false)).toEqual({
      counted_amount: 480,
      expected_amount: null,
      difference: null,
      method_breakdown: { cash: { esperado: null, contado: 480, diferencia: null }, card: { esperado: null, contado: null, diferencia: null } },
    });
  });
});

describe('K3/K4 · alcance de la caja por modo', () => {
  test('en modo user no hay caja global', () => {
    expect(alcancesDisponibles('user')).toEqual(['branch']);
    expect(alcancesDisponibles('branch')).toEqual(['branch', 'global']);
    expect(alcanceApertura('user', 'global')).toBe('branch');
    expect(alcanceApertura('branch', 'global')).toBe('global');
    expect(alcanceApertura('branch', undefined)).toBe('branch');
    expect(sucursalDeApertura('global', 7)).toBeNull();
    expect(sucursalDeApertura('branch', 7)).toBe(7);
  });

  test('claveAlcance es el espejo de fn_cash_session_open_scope_key', () => {
    const uid = '9d1c0f7e-0000-4000-8000-000000000001';
    expect(claveAlcance('branch', 7, uid)).toBe('b:7');
    expect(claveAlcance('branch', null, uid)).toBe('b:g');
    expect(claveAlcance('user', 7, uid)).toBe(`u:7:${uid}`);
    expect(claveAlcance('user', null, uid)).toBe(`u:g:${uid}`);
  });

  test('cada caja ya abierta tiene su código y su traducción en los 4 idiomas', () => {
    const codigos = [
      codigoCajaYaAbierta('branch', 'global'),
      codigoCajaYaAbierta('user', 'branch'),
      codigoCajaYaAbierta('branch', 'branch'),
    ];
    expect(codigos).toEqual(['caja_global_abierta', 'caja_propia_abierta', 'caja_sucursal_abierta']);
    for (const idioma of IDIOMAS) {
      const errores = mensajes(idioma).cajas.errores;
      for (const c of codigos) expect(errores[claveTraduccionError(c)]).toEqual(expect.any(String));
    }
  });

  test('CajasService.openSession usa el módulo de alcance (no su propia regla)', () => {
    const src = fs.readFileSync(path.join(RAIZ, 'src/components/pos/cajas/CajasService.ts'), 'utf8');
    expect(src).toMatch(/alcanceApertura\(mode, data\.scope\)/);
    expect(src).toMatch(/codigoCajaYaAbierta\(mode, scope\)/);
  });
});

describe('K5 · denominaciones', () => {
  test('COP conserva las denominaciones que tenía la pantalla', () => {
    expect(denominacionesDe('COP')).toEqual({
      billetes: [100000, 50000, 20000, 10000, 5000, 2000, 1000],
      monedas: [1000, 500, 200, 100, 50],
    });
    expect(denominacionesDe('cop')).not.toBeNull();
    expect(denominacionesDe('XYZ')).toBeNull();
    expect(denominacionesDe(null)).toBeNull();
    expect(MONEDAS_CON_DENOMINACIONES).toEqual(expect.arrayContaining(['COP', 'USD', 'MXN', 'PEN', 'EUR']));
  });

  test('las listas van de mayor a menor', () => {
    for (const m of MONEDAS_CON_DENOMINACIONES) {
      const d = denominacionesDe(m)!;
      expect([...d.billetes].sort((a, b) => b - a)).toEqual(d.billetes);
      expect([...d.monedas].sort((a, b) => b - a)).toEqual(d.monedas);
    }
  });

  test('total = Σ cantidad × valor, a centavos, ignorando basura', () => {
    expect(totalDenominaciones({ bills: { '50000': 3, '20000': 2 }, coins: { '500': 10 } })).toBe(195000);
    expect(totalDenominaciones({ coins: { '0.25': 3, '0.1': 3 } })).toBe(1.05);
    expect(totalDenominaciones({ bills: { '1000': -2, abc: 5, '2000': 1.7 } })).toBe(2000);
    expect(totalDenominaciones(null)).toBe(0);
    expect(cantidadDenominacion('3')).toBe(3);
    expect(cantidadDenominacion('')).toBe(0);
    expect(cantidadDenominacion('-1')).toBe(0);
  });

  test('lo que se guarda no lleva ceros; vacío = sin conteo por denominación («Limpiar todo»)', () => {
    expect(conteoParaGuardar({ bills: { '50000': 2, '20000': 0 }, coins: {} })).toEqual({ bills: { '50000': 2 } });
    expect(conteoParaGuardar({ bills: {}, coins: {} })).toBeUndefined();
    expect(conteoParaGuardar({})).toBeUndefined();
  });
});

describe('K6 · conteo por método = method_breakdown del servidor', () => {
  test('cada método contra su propio esperado; efectivo primero', () => {
    const filas = diferenciasPorMetodo({ cash: 556230, card: 120000, transfer: 30000 }, { cash: 556000, card: 120000 });
    expect(filas).toEqual([
      { metodo: 'cash', esperado: 556230, contado: 556000, diferencia: -230 },
      { metodo: 'card', esperado: 120000, contado: 120000, diferencia: 0 },
      // Con esperado y sin conteo: se registra sin juzgar (igual que la RPC).
      { metodo: 'transfer', esperado: 30000, contado: null, diferencia: null },
    ]);
  });

  test('un método contado sin esperado aparece con esperado 0', () => {
    expect(diferenciasPorMetodo({ cash: 100 }, { cash: 100, nequi: 50 })[1]).toEqual({ metodo: 'nequi', esperado: 0, contado: 50, diferencia: 50 });
  });

  test('en cierre ciego (sin esperado) no hay diferencias que mostrar', () => {
    expect(diferenciasPorMetodo(null, { cash: 100, card: 20 })).toEqual([
      { metodo: 'cash', esperado: null, contado: 100, diferencia: null },
      { metodo: 'card', esperado: null, contado: 20, diferencia: null },
    ]);
  });
});

describe('K10 · catálogo único de conceptos', () => {
  test('cada concepto tiene texto canónico y traducción en los 4 idiomas', () => {
    for (const clave of [...CONCEPTOS_INGRESO, ...CONCEPTOS_EGRESO]) {
      expect(TEXTO_CANONICO[clave]).toEqual(expect.any(String));
      for (const idioma of IDIOMAS) {
        expect(mensajes(idioma).cajas.conceptos?.[clave]).toEqual(expect.any(String));
      }
    }
  });

  test('D9: ya no se ofrece «depósito bancario» como concepto', () => {
    const textos = [...CONCEPTOS_INGRESO, ...CONCEPTOS_EGRESO].map((c) => TEXTO_CANONICO[c].toLowerCase());
    expect(textos.some((t) => t.includes('depósito') || t.includes('deposito'))).toBe(false);
  });

  test('se guarda la clave y el texto canónico; «Otro…» guarda el texto libre', () => {
    expect(conceptoParaGuardar('gastosMenores')).toEqual({ concept: 'Gastos menores', concept_code: 'gastosMenores' });
    expect(conceptoParaGuardar('otroEgreso', '  Propina mensajero ')).toEqual({ concept: 'Propina mensajero', concept_code: 'otroEgreso' });
  });

  test('los movimientos viejos se reconocen por su texto; los libres se muestran tal cual', () => {
    expect(claveDeConcepto({ concept: 'Gastos menores' })).toBe('gastosMenores');
    expect(claveDeConcepto({ concept: 'Retiro para depósito' })).toBe('retiroConsignacion');
    expect(claveDeConcepto({ concept: 'Venta contado especial' })).toBe('ventaContadoEspecial');
    expect(claveDeConcepto({ concept: 'Aporte de socios' })).toBeNull();
    expect(claveDeConcepto({ concept: 'Otro ingreso' })).toBeNull();
    expect(claveDeConcepto({ concept: 'Propina', concept_code: 'otroIngreso' })).toBeNull();
    expect(claveDeConcepto({ concept: 'Gastos menores', concept_code: 'gastosMenores' })).toBe('gastosMenores');
  });

  test('validación del movimiento', () => {
    expect(validarMovimiento({ tipo: 'in', clave: 'fondoAdicional', monto: 1000 })).toBeNull();
    expect(validarMovimiento({ tipo: 'x', clave: 'fondoAdicional', monto: 1000 })).toBe('tipo_invalido');
    expect(validarMovimiento({ tipo: 'in', clave: null, monto: 1000 })).toBe('concepto_requerido');
    expect(validarMovimiento({ tipo: 'in', clave: 'gastosMenores', monto: 1000 })).toBe('concepto_no_corresponde');
    expect(validarMovimiento({ tipo: 'out', clave: 'otroEgreso', textoLibre: '  ', monto: 1000 })).toBe('concepto_requerido');
    expect(validarMovimiento({ tipo: 'out', clave: 'otroEgreso', textoLibre: 'Taxi', monto: 0 })).toBe('monto_invalido');
    expect(validarMovimiento({ tipo: 'out', clave: 'otroEgreso', textoLibre: 'Taxi', monto: null })).toBe('monto_invalido');
    expect(conceptosDe('in')).toContain('cambioEfectivo');
    expect(conceptosDe('out')).toContain('cambioEfectivo');
  });

  test('efecto en caja: antes → después', () => {
    expect(efectoEnCaja(1000, 'in', 250)).toBe(1250);
    expect(efectoEnCaja(1000, 'out', 250)).toBe(750);
    expect(efectoEnCaja(1000, 'out', -5)).toBe(1000);
  });
});
