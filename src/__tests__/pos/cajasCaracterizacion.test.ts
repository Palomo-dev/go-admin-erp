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
import { diferenciasPorMetodo, observacionObligatoria, parametrosCierre, totalesConteo } from '@/lib/pos/cajas/arqueo';
import { codigoErrorMovimiento, parametrosMovimiento } from '@/lib/pos/cajas/movimientoRpc';
import { consultaHistorialDeUrl, enmascararHistorial, filtrosEfectivos } from '@/lib/pos/cajas/historialConsulta';
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

  test('los métodos activos aparecen aunque no tengan esperado (cierre ciego o sin ventas)', () => {
    expect(diferenciasPorMetodo(null, { cash: 10 }, ['card', 'nequi']).map((f) => f.metodo)).toEqual(['cash', 'card', 'nequi']);
  });

  test('totales del resumen: total contra total; la diferencia guardada es solo del efectivo', () => {
    const t = totalesConteo(diferenciasPorMetodo({ cash: 1000, card: 500 }, { cash: 990, card: 500 }));
    expect(t).toEqual({ efectivoContado: 990, otrosContado: 500, totalContado: 1490, totalEsperado: 1500, diferenciaTotal: -10, diferenciaEfectivo: -10 });
    expect(observacionObligatoria(t.diferenciaTotal)).toBe(true);
    expect(observacionObligatoria(0.4)).toBe(false);
    expect(observacionObligatoria(null)).toBe(false);
    const ciego = totalesConteo(diferenciasPorMetodo(null, { cash: 990 }));
    expect(ciego).toMatchObject({ totalEsperado: null, diferenciaTotal: null, diferenciaEfectivo: null });
  });

  test('D6: el cierre manda lo contado por método para pos_caja_cerrar (sin esperado ni diferencia)', () => {
    expect(parametrosCierre(12, { counted_amount: 990, counted_by_method: { card: 500, cash: 1, nequi: 0 }, notes: ' ' }, '2026-09-24T20:00:00Z')).toEqual({
      p_session_id: 12,
      p_efectivo_contado: 990,
      p_contado_por_metodo: { card: 500 },
      p_denominaciones: null,
      p_notas: null,
      p_cerrada_en: '2026-09-24T20:00:00Z',
    });
  });

  test('en cierre ciego (sin esperado) no hay diferencias que mostrar', () => {
    expect(diferenciasPorMetodo(null, { cash: 100, card: 20 })).toEqual([
      { metodo: 'cash', esperado: null, contado: 100, diferencia: null },
      { metodo: 'card', esperado: null, contado: 20, diferencia: null },
    ]);
  });
});

describe('K13 · guardarraíles de las pantallas de caja', () => {
  const DIR = path.join(RAIZ, 'src/components/pos/cajas');
  const archivos = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? archivos(path.join(dir, d.name)) : [path.join(dir, d.name)]));
  const fuentes = archivos(DIR).filter((f) => /\.tsx?$/.test(f) && !f.includes('__tests__'));

  test.each([
    ['createPortal', /createPortal/],
    ['window.open / document.write', /window\.open|document\.write/],
    ['toISOString().split', /toISOString\(\)\.split/],
    ['toLocaleString', /toLocaleString\(/],
    ['editor de HTML en notas', /RichTextEditor/],
  ])('ningún archivo de components/pos/cajas usa %s', (_nombre, patron) => {
    const culpables = fuentes.filter((f) => patron.test(fs.readFileSync(f, 'utf8'))).map((f) => path.relative(RAIZ, f));
    expect(culpables).toEqual([]);
  });

  test('las pantallas con red leen el esperado del servidor, no de getCashSummary', () => {
    for (const rel of ['detalle/CajaDetallePage.tsx', 'arqueos/NuevoArqueoPage.tsx', 'movimientos/NuevoMovimientoPage.tsx', 'listado/MiCajaTab.tsx']) {
      const src = fs.readFileSync(path.join(DIR, rel), 'utf8');
      expect({ rel, local: /getCashSummary/.test(src) }).toEqual({ rel, local: false });
    }
  });

  test('K8: el diálogo de cierre no escribe en cash_sessions (cierra por el servicio → pos_caja_cerrar)', () => {
    const src = fs.readFileSync(path.join(DIR, 'CierreCajaDialog.tsx'), 'utf8');
    expect(src).not.toMatch(/from\('cash_sessions'\)/);
    expect(src).toMatch(/CajasService\.closeSession\(/);
  });

  test('K12: apertura, movimiento y cierre siguen pasando por CajasService (outbox sin red)', () => {
    expect(fs.readFileSync(path.join(DIR, 'AperturaCajaDialog.tsx'), 'utf8')).toMatch(/CajasService\.openSession\(/);
    expect(fs.readFileSync(path.join(DIR, 'MovimientosDialog.tsx'), 'utf8')).toMatch(/CajasService\.addMovement\(/);
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

describe('Seguridad de cajas, fase 1 (migración 20260928100000)', () => {
  const RAIZ = path.resolve(__dirname, '..', '..', '..');
  const leer = (r: string) => fs.readFileSync(path.join(RAIZ, r), 'utf8');
  const sql = leer('supabase/migrations/20260928100000_pos_cajas_aviso_ciego_y_escritura_de_movimientos.sql');

  test('el aviso de cierre no lleva cifras cuando la organización usa cierre ciego', () => {
    const fn = sql.slice(sql.indexOf('create or replace function public.fn_notify_cash_session_closed'), sql.indexOf('drop policy'));
    expect(fn).toMatch(/pos_blind_cash_count/);
    const ciego = fn.slice(fn.indexOf('if coalesce(v_ciego, false) then'), fn.indexOf('else'));
    expect(ciego).not.toMatch(/final_amount|difference/);
  });

  test('cash_movements: sin política ALL, INSERT/UPDATE solo en caja abierta y sin DELETE', () => {
    expect(sql).toMatch(/drop policy if exists cash_movements_insert_update_delete_policy/);
    expect(sql).not.toMatch(/for all/);
    expect(sql).not.toMatch(/for delete/);
    expect((sql.match(/cs\.status = 'open'/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  test('ningún código escribe cash_movements con INSERT directo: todo pasa por la RPC', () => {
    const archivos = (d: string): string[] =>
      fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
        e.name === '__tests__' ? [] : e.isDirectory() ? archivos(path.join(d, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(d, e.name)] : [],
      );
    for (const f of archivos(path.join(RAIZ, 'src'))) {
      const src = fs.readFileSync(f, 'utf8');
      expect({ f, hit: /from\(['"]cash_movements['"]\)\s*\.(insert|upsert|delete)\(/.test(src) }).toEqual({ f, hit: false });
    }
    for (const r of ['components/pos/cajas/CajasService.ts', 'lib/offline/cashSync.ts', 'lib/services/movimientosService.ts']) {
      expect(leer(`src/${r}`)).toMatch(/RPC_MOVIMIENTO_CAJA/);
    }
  });

  test('parámetros y errores de la RPC de movimientos', () => {
    expect(parametrosMovimiento(7, { type: 'out', amount: 50, concept: 'Retiro' }, { uuid: 'u-1', creadoEn: '2026-09-28T10:00:00Z' })).toEqual({
      p_session_id: 7,
      p_tipo: 'out',
      p_monto: 50,
      p_concepto: 'Retiro',
      p_concept_code: null,
      p_referencia: null,
      p_notas: null,
      p_uuid: 'u-1',
      p_creado_en: '2026-09-28T10:00:00Z',
    });
    expect(codigoErrorMovimiento({ code: '55000', message: 'caja_cerrada' })).toBe('caja_ya_cerrada');
    expect(codigoErrorMovimiento({ code: '42501', message: 'Acceso denegado' })).toBe('sin_permiso');
    expect(codigoErrorMovimiento({ code: '22023', message: 'monto_invalido' })).toBe('datos_movimiento_invalidos');
  });

  test('historial con cierre ciego: sin cifras, sin filtro ni orden por diferencia', () => {
    const sesion = { id: 1, final_amount: 480, difference: -20 };
    expect(enmascararHistorial(sesion, false)).toEqual({ id: 1, final_amount: null, difference: null });
    expect(enmascararHistorial(sesion, true)).toBe(sesion);
    const f = filtrosEfectivos({ resultado: 'faltante', orden: { campo: 'difference', direccion: 'asc' }, busqueda: 'Ana' }, false);
    expect(f).toEqual({ busqueda: 'Ana', orden: undefined });
    expect(filtrosEfectivos({ resultado: 'faltante' }, true)).toEqual({ resultado: 'faltante' });
  });

  test('la URL del historial pasa por lista blanca', () => {
    const c = consultaHistorialDeUrl(
      new URL('http://x/api/pos/cajas/historial?vista=exportar&status=hack&resultado=cuadrada&orden=id;drop&desde=2026-09-01T05:00:00.000Z&hasta=ayer&tamano=999&sucursal=-3'),
    );
    expect(c.vista).toBe('exportar');
    expect(c.filtros).toMatchObject({ status: undefined, resultado: 'cuadrada', orden: undefined, desde: '2026-09-01T05:00:00.000Z', hasta: undefined });
    expect(c.tamano).toBe(10);
    expect(c.sucursalId).toBeNull();
  });

  test('el historial ya no se consulta desde el navegador con red: lo sirve el servidor enmascarado', () => {
    const svc = leer('src/components/pos/cajas/CajasService.ts');
    expect(svc).toMatch(/\/api\/pos\/cajas\/historial/);
    expect(svc).not.toMatch(/private static async historyQuery/);
    expect(leer('src/app/api/pos/cajas/historial/route.ts')).toMatch(/verImportesHistorial\(ctx\)/);
  });
});
