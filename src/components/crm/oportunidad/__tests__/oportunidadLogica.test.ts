/**
 * CRM ola 3B — lógica pura de Pipeline, Oportunidades, drawer, detalle,
 * formulario en página, «Nuevo pipeline» y diálogos. «Ahora» y zona fijos:
 * pasa igual con `TZ=UTC` y `TZ=America/Bogota` (`npm run test:tz-all`).
 */
jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));

import { ErrorApiCrm } from '@/components/crm/acciones/apiCrm';
import {
  aTarjeta,
  alternarSeleccion,
  columnaDe,
  csvOportunidades,
  estadoPantalla,
  etapasDeOportunidad,
  interpretarRechazo,
  moverEnTablero,
  permisosFila,
  permisosPantalla,
  resumenEnBase,
  seleccionarPagina,
  tasaCierre,
  totalDeEtapa,
  unirPagina,
  type OportunidadApi,
  type ResumenApi,
  type Tablero,
} from '../oportunidadLogica';
import { alternarPrioridad, contarFiltros, filtrosVacios, parametrosFiltros, parametrosPeriodo, quitarFiltro, rangoCierre, rangoTrimestre, ultimoDiaMes } from '../filtrosLogica';
import { cuerpoLineas, cuerpoOrigenComision, lineasDesdeApi, lineasValidas, totalLineas, origenComisionDesdeApi } from '../lineasLogica';
import { cuerpoDuplicado } from '../apiOportunidades';
import { vistaConexiones } from '../ConexionesOportunidad';
import { cuerpoPipeline, datosIniciales, etapasEditables, plantillasAsistente, probabilidadesEnOrden, revisarEtapas, validarDatos } from '@/components/crm/pipeline/pantalla/nuevoPipelineLogica';
import { elegirPipeline } from '@/components/crm/pipeline/pantalla/usePipelines';
import { calcularScore, temperaturaDeScore } from '@/lib/services/crm/scoringCalculo';

jest.mock('@/lib/services/cotizacionesService', () => ({ CotizacionesService: {} }));
jest.mock('@/lib/services/crm/commissionService', () => ({ commissionService: {} }));
jest.mock('@/lib/services/crm/proposalService', () => ({ proposalService: {} }));
import { documentosDe, pasosElegidos } from '../pasosGanar';

const YO = 'u-yo';
const op = (p: Partial<OportunidadApi> = {}): OportunidadApi => ({ id: 'o1', name: 'Renovación', customer_id: 'c1', pipeline_id: 'p1', stage_id: 's1', amount: 100, currency: 'COP', status: 'open', salesperson_id: YO, created_by: YO, ...p });

describe('permisos (resueltos en el servidor; aquí solo qué se pinta)', () => {
  const empleado = permisosPantalla({ 'crm.opportunities.view': true, 'crm.opportunities.create': true, 'crm.opportunities.edit': true });
  const manager = permisosPantalla({ 'crm.opportunities.view': true, 'crm.opportunities.edit': true, 'crm.opportunities.edit_any': true, 'crm.opportunities.close': true, 'crm.opportunities.delete': true });
  it('Empleado edita lo propio y no cierra ni elimina; nunca por nombre de rol', () => {
    expect(permisosFila(empleado, YO, op())).toEqual({ editar: true, cerrar: false, crear: true, eliminar: false });
    expect(permisosFila(empleado, YO, op({ salesperson_id: 'otro', created_by: 'otro' })).editar).toBe(false);
  });
  it('Manager edita lo ajeno y cierra', () => {
    expect(permisosFila(manager, YO, op({ salesperson_id: 'otro', created_by: 'otro' }))).toMatchObject({ editar: true, cerrar: true, eliminar: true });
  });
});

describe('tarjeta y lista', () => {
  it('D2: las heredadas llevan «Lead»; responsable por nombre y días en etapa desde el historial', () => {
    const t = aTarjeta(op({ record_type: 'lead', es_lead: true, entro_etapa_en: '2026-09-20T10:00:00Z', cliente_nombre: 'Cliente Ejemplo' }), [{ id: YO, nombre: 'Carlos Ruiz' }]);
    expect(t).toMatchObject({ esLead: true, responsable: { nombre: 'Carlos Ruiz' }, entroEtapaEn: '2026-09-20T10:00:00Z', clienteNombre: 'Cliente Ejemplo' });
    expect(aTarjeta(op(), []).esLead).toBe(false);
  });
  it('CSV sin fórmulas al abrirlo', () => {
    const csv = csvOportunidades([op({ name: '=HYPERLINK("x")' })], [], ['Oportunidad']);
    expect(csv.split('\n')[1].startsWith(`"'=HYPERLINK`)).toBe(true);
  });
  it('selección por página y alternar', () => {
    expect([...seleccionarPagina(new Set(), ['a', 'b'])]).toEqual(['a', 'b']);
    expect([...seleccionarPagina(new Set(['a', 'b']), ['a', 'b'])]).toEqual([]);
    expect([...alternarSeleccion(new Set(['a']), 'a')]).toEqual([]);
  });
  it('etapas del pipeline de la oportunidad (la lista mezcla pipelines)', () => {
    expect(etapasDeOportunidad([{ id: 'a', pipeline_id: 'p1' }, { id: 'b', pipeline_id: 'p2' }], 'p1').map((e) => e.id)).toEqual(['a']);
  });
});

describe('moneda base: KPI y columnas (la tasa nunca se inventa)', () => {
  const resumen: ResumenApi = {
    conteos: { open: 3, won: 11, lost: 23, total: 37 },
    abiertas: [{ moneda: 'COP', monto: 1000, cantidad: 2, ponderado: 500 }, { moneda: 'USD', monto: 10, cantidad: 1, ponderado: 6 }, { moneda: 'EUR', monto: 5, cantidad: 1, ponderado: 1 }],
    por_etapa: { s1: { cantidad: 3, grupos: [{ moneda: 'COP', monto: 1000, cantidad: 2 }, { moneda: 'USD', monto: 10, cantidad: 1 }] } },
    cierran_periodo: 2,
    ganadas_90: 11,
    perdidas_90: 23,
    tasas: [{ base_currency: 'USD', target_currency: 'COP', rate: 4000, effective_date: '2026-09-23' }],
    truncado: false,
    base: 'COP',
  };
  it('valor abierto convierte USD con la tasa del día y deja EUR fuera con aviso; cuenta las agrupadas', () => {
    const r = resumenEnBase(resumen.abiertas, 'COP', resumen.tasas, '2026-09-30');
    expect(r.total).toBe(1000 + 40_000);
    expect(r.cantidad).toBe(4);
    expect(r.sinTasa.map((g) => g.moneda)).toEqual(['EUR']);
    expect(resumenEnBase(resumen.abiertas, 'COP', resumen.tasas, '2026-09-30', 'ponderado').total).toBe(500 + 24_000);
  });
  it('total de la columna con «incl. USD»; tasa de cierre a 90 días', () => {
    const c = totalDeEtapa(resumen, 's1', '2026-09-30');
    expect(c.cantidad).toBe(3);
    expect(c.resumen.total).toBe(41_000);
    expect(c.incluye).toMatchObject({ moneda: 'USD', cantidad: 1 });
    expect(tasaCierre(resumen)).toBe(32);
    expect(tasaCierre({ ganadas_90: 0, perdidas_90: 0 })).toBeNull();
  });
});

describe('estados de pantalla', () => {
  it.each([
    [{ cargando: true, error: null, total: null, hayFiltros: false }, 'cargando'],
    [{ cargando: false, error: new ErrorApiCrm(403, 'CRM_FORBIDDEN', 'x'), total: null, hayFiltros: false }, 'sinPermiso'],
    [{ cargando: false, error: new ErrorApiCrm(500, null, 'x'), total: null, hayFiltros: false }, 'error'],
    [{ cargando: false, error: null, total: 0, hayFiltros: false }, 'vacio'],
    [{ cargando: false, error: null, total: 0, hayFiltros: true }, 'sinResultados'],
    [{ cargando: false, error: null, total: 5, hayFiltros: true }, 'listo'],
  ])('%j → %s', (o, esperado) => expect(estadoPantalla(o)).toBe(esperado));
});

describe('rechazos del servidor al mover de etapa', () => {
  it('gate → requisitos pendientes; cierre; sin permiso; conflicto', () => {
    const gate = new ErrorApiCrm(409, 'gate', 'x', { reason: 'gate', gate: { missing: [{ type: 'field', label: 'Presupuesto', detail: 'Falta el presupuesto' }, 'Contacto principal'] } });
    expect(interpretarRechazo(gate)).toEqual({ tipo: 'gate', pendientes: [{ id: 'field-0', etiqueta: 'Falta el presupuesto' }, { id: 'r1', etiqueta: 'Contacto principal' }] });
    expect(interpretarRechazo(new ErrorApiCrm(409, 'needs_lost', 'x', { reason: 'needs_lost' }))).toEqual({ tipo: 'cierre', motivo: 'needs_lost' });
    expect(interpretarRechazo(new ErrorApiCrm(403, 'no_es_propia', 'x'))).toEqual({ tipo: 'sinPermiso' });
    expect(interpretarRechazo(new ErrorApiCrm(409, 'conflict', 'x', { reason: 'conflict' }))).toEqual({ tipo: 'conflicto' });
  });
});

describe('tablero optimista', () => {
  const tablero: Tablero = {
    s1: { filas: [op({ id: 'a' }), op({ id: 'b' })], total: 2, pagina: 1, cargando: false, error: false },
    s2: { filas: [], total: 0, pagina: 1, cargando: false, error: false },
  };
  it('mueve YA a la columna destino (estado según la etapa) y el anterior sirve para revertir', () => {
    const t = moverEnTablero(tablero, 'a', 's2', { name: 'Ganada', position: 9, probability: 100, color: null, is_won: true });
    expect(t.s1.filas.map((f) => f.id)).toEqual(['b']);
    expect(t.s2.filas[0]).toMatchObject({ id: 'a', stage_id: 's2', status: 'won' });
    expect([t.s1.total, t.s2.total]).toEqual([1, 1]);
    expect(tablero.s1.filas).toHaveLength(2);
    expect(columnaDe(t, 'a')).toBe('s2');
    expect(moverEnTablero(tablero, 'a', 's1')).toBe(tablero);
  });
  it('unir páginas sin duplicar una tarjeta que llegó arrastrada', () => {
    expect(unirPagina([op({ id: 'a' })], [op({ id: 'a' }), op({ id: 'c' })], 2).map((f) => f.id)).toEqual(['a', 'c']);
    expect(unirPagina([op({ id: 'a' })], [op({ id: 'c' })], 1).map((f) => f.id)).toEqual(['c']);
  });
});

describe('filtros en el día de la organización', () => {
  it('mes, trimestre y vencido como `date`; nunca `toISOString().split`', () => {
    expect(ultimoDiaMes('2026-02-10')).toBe('2026-02-28');
    expect(ultimoDiaMes('2026-12-31')).toBe('2026-12-31');
    expect(rangoTrimestre('2026-09-30')).toEqual({ desde: '2026-07-01', hasta: '2026-09-30' });
    expect(rangoCierre('vencido', '2026-09-30')).toEqual({ hasta: '2026-09-29' });
  });
  it('query: responsable «yo» con el id de la sesión, «ninguno», prioridades y rango', () => {
    const f = { ...filtrosVacios(), q: ' ejemplo ', responsable: 'yo', cierre: 'mes' as const, prioridades: ['hot' as const, 'warm' as const] };
    expect(Object.fromEntries(parametrosFiltros(f, '2026-09-30', YO))).toEqual({ q: 'ejemplo', salesperson_id: YO, close_from: '2026-09-01', close_to: '2026-09-30', temperature: 'hot,warm' });
    expect(parametrosFiltros({ ...filtrosVacios(), responsable: 'ninguno' }, '2026-09-30', YO).get('salesperson_id')).toBe('none');
    expect(contarFiltros(f)).toBe(3);
    expect(quitarFiltro(f, 'prioridad').prioridades).toEqual([]);
    expect(alternarPrioridad(filtrosVacios(), 'cold').prioridades).toEqual(['cold']);
  });
  it('periodo de KPI: hace 90 días a medianoche de Bogotá, sea cual sea la TZ del proceso', () => {
    const p = parametrosPeriodo('2026-09-30', 'America/Bogota');
    expect(p.get('period_from')).toBe('2026-09-01');
    expect(p.get('since')).toBe('2026-07-02T00:00:00.000-05:00');
  });
});

describe('formulario en página: líneas y origen/comisión (cálculo único)', () => {
  const detalle = {
    opportunity_products: [{ id: 'l1', product_id: 7, quantity: 5, unit_price: 2_000_000, total_price: 10_000_000, producto: { name: 'Licencia' } }],
    opportunity_custom_lines: [{ id: 'l2', concept: 'Implementación', quantity: 1, unit_price: 1_800_000 }],
    opportunity_spaces: [{ id: 'l3', space_id: 'e1', nights: 2, unit_price: 100, espacio: { label: 'Suite' } }],
  };
  it('total = Σ cantidad × precio (sin impuestos) y el cuerpo conserva ids para la diferencia, sin total_price', () => {
    const l = lineasDesdeApi(detalle);
    expect(totalLineas(l)).toBe(10_000_000 + 1_800_000 + 200);
    const c = cuerpoLineas(l);
    expect(c.products).toEqual([{ id: 'l1', product_id: 7, quantity: 5, unit_price: 2_000_000 }]);
    expect(c.spaces).toEqual([{ id: 'l3', space_id: 'e1', nights: 2, unit_price: 100 }]);
    expect(JSON.stringify(c)).not.toContain('total_price');
    expect(lineasValidas({ ...l, custom: [{ concept: ' ', quantity: 1, unit_price: 0 }] })).toBe(false);
  });
  it('comisión 0–100; sin comisión → none y 0', () => {
    expect(cuerpoOrigenComision({ source: 'web_form', vertical_id: '', commission_type: 'salesperson', commission_rate: '5' })).toEqual({ source: 'web_form', vertical_id: null, commission_type: 'salesperson', commission_rate: 5 });
    expect(cuerpoOrigenComision({ source: '', vertical_id: '', commission_type: 'salesperson', commission_rate: '' })).toMatchObject({ commission_type: 'none', commission_rate: 0 });
    expect(origenComisionDesdeApi({ source: 'import', vertical_id: null, commission_type: 'raro', commission_rate: 3 })).toEqual({ source: 'import', vertical_id: '', commission_type: 'none', commission_rate: '3' });
  });
  it('duplicar copia líneas sin ids ni total y nace «general»', () => {
    const c = cuerpoDuplicado({ ...op(), ...detalle, cliente: null, source: 'web_form' }, '(copia)');
    expect(c).toMatchObject({ name: 'Renovación (copia)', origen: 'general', products: [{ product_id: 7, quantity: 5, unit_price: 2_000_000 }] });
    expect(JSON.stringify(c)).not.toMatch(/"id":"l1"|total_price/);
  });
});

describe('«Nuevo pipeline» en 3 pasos', () => {
  const plantillas = plantillasAsistente();
  const nombres = { ganada: 'Ganada', perdida: 'Perdida' };
  it('orden del Figma y «En blanco» con sus dos etapas de cierre', () => {
    expect(plantillas.map((p) => p.key)).toEqual(['sales', 'onboarding', 'renewal', 'blank']);
    const blanco = etapasEditables(plantillas[3], nombres);
    expect(blanco.map((e) => [e.name, e.is_won, e.is_lost])).toEqual([['Ganada', true, false], ['Perdida', false, true]]);
  });
  it('ventas es válida; sin perdida, con probabilidades desordenadas o nombre repetido no', () => {
    const ventas = etapasEditables(plantillas[0], nombres);
    expect(revisarEtapas(ventas).ok).toBe(true);
    expect(revisarEtapas(ventas.filter((e) => !e.is_lost))).toMatchObject({ ok: false, perdida: null });
    const desorden = ventas.map((e, i) => (i === 0 ? { ...e, probability: 95 } : e));
    expect(probabilidadesEnOrden(desorden)).toBe(false);
    expect(validarDatos(datosIniciales(plantillas[0], 'COP', 'Ventas', []), ['ventas'])).toBe('nombreRepetido');
  });
  it('por defecto solo si aún no hay uno de ventas; cuerpo de la RPC transaccional', () => {
    expect(datosIniciales(plantillas[0], 'COP', 'Ventas', []).porDefecto).toBe(true);
    expect(datosIniciales(plantillas[0], 'COP', 'Ventas', ['sales']).porDefecto).toBe(false);
    const d = { ...datosIniciales(plantillas[0], 'COP', 'Ventas B2B', []), meta: '150.000.000' };
    const c = cuerpoPipeline(d, etapasEditables(plantillas[0], nombres));
    expect(c).toMatchObject({ name: 'Ventas B2B', pipeline_type: 'sales', is_default: true, goal_amount: 150_000_000, goal_period: 'quarterly', goal_currency: 'COP' });
    expect(c.stages).toHaveLength(9);
    expect(c.stages.filter((s) => s.is_won)).toHaveLength(1);
  });
  it('el tablero abre el elegido, si no el por defecto, si no el de ventas', () => {
    const lista = [{ id: 'a', name: 'On', pipeline_type: 'onboarding' }, { id: 'b', name: 'V', pipeline_type: 'sales' }, { id: 'c', name: 'D', is_default: true }];
    expect(elegirPipeline(lista, null)).toBe('c');
    expect(elegirPipeline(lista.slice(0, 2), null)).toBe('b');
    expect(elegirPipeline(lista, 'a')).toBe('a');
    expect(elegirPipeline([], null)).toBeNull();
  });
});

describe('ganar: acciones del Figma → pasos únicos de wonCloseSteps', () => {
  it('reservas y comisión siempre; «agradecimiento» no tiene ejecutor; orden de buildInitialSteps', () => {
    expect(pasosElegidos(['renovacion', 'factura', 'agradecimiento'])).toEqual(['invoice', 'reservations', 'renewal', 'commission']);
    expect(documentosDe([{ paso: 'invoice', ok: true, mensaje: 'Factura en borrador: FV-1' }, { paso: 'renewal', ok: false, mensaje: 'x' }])).toEqual([
      { tipo: 'factura', numero: 'Factura en borrador: FV-1', href: '/app/finanzas/facturas-venta' },
      { tipo: 'otro', numero: 'x', href: null },
    ]);
  });
});

describe('conexiones del detalle', () => {
  it('cotización y factura más recientes, próxima reunión futura y comisión estimada si no hay devengada', () => {
    const v = vistaConexiones(
      { quotations: [{ number: 'COT-318', status: 'sent' }], invoices: [], commissions: [] },
      [{ start_at: '2026-09-01T15:00:00Z' }, { start_at: '2026-10-05T15:00:00Z' }],
      { amount: 12_500_000, commission_rate: 5, commission_type: 'salesperson' },
      new Date('2026-09-30T12:00:00Z'),
    );
    expect(v).toEqual({ cotizacion: { numero: 'COT-318', estado: 'sent' }, factura: null, comision: { monto: 625_000, estimada: true }, proximaReunion: '2026-10-05T15:00:00Z' });
  });
});

describe('scoring: un solo cálculo (navegador y servidor)', () => {
  it('pondera y deriva la temperatura con las bandas', () => {
    const config = { indicators: [{ key: 'a', label: 'A', weight: 50, options: [{ value: 'si', label: 'Sí', score: 3 }, { value: 'no', label: 'No', score: 0 }] }, { key: 'b', label: 'B', weight: 50, options: [{ value: 'si', label: 'Sí', score: 2 }] }], bands: { cold: { min: 0, max: 33 }, warm: { min: 34, max: 66 }, hot: { min: 67, max: 100 } } };
    expect(calcularScore([{ key: 'a', value: 'si' }], config)).toMatchObject({ score_total: 50, temperature: 'warm' });
    expect(calcularScore([], null)).toEqual({ score_total: 0, temperature: 'cold', details: [] });
    expect(temperaturaDeScore(70)).toBe('hot');
  });
});
