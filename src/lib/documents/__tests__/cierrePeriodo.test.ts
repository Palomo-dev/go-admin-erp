/**
 * Documentos de reportes v2: cierre de periodo (carta y 80 mm) y reporte suelto.
 * - snapshot: capítulos en el orden del catálogo, tope de filas con el total
 *   real, totales completos, valores planos, plantillas y lectura validada;
 * - secciones: tipo de columna por los valores, capítulo solo en el primero,
 *   80 mm sin vistas, truncado;
 * - cargadores: 404 sin distinguir, 403 por permiso, estado y marca de agua,
 *   escape de HTML, evento «exportar» en el historial y filtros del reporte.
 */
import { OrgContextError } from '@/lib/utils/orgContextError';
import type { PeriodoCierre, ReportData, ReportDefinition } from '@/lib/services/reportes/types';
import {
  armarSnapshot,
  congelarReporte,
  idsDelSnapshot,
  leerSnapshot,
  reportesDePlantilla,
  type SnapshotCierre,
} from '@/lib/services/reportes/cierres/snapshot';
import { seccionesDeReporte, tipoColumnaDocumento } from '../reporteSecciones';
import { fakeSupabase } from './fakeSupabase';

const permisos = new Set<string>();
jest.mock('@/lib/utils/orgContext', () => ({
  hasOrgAdminOrPermission: jest.fn(async (_ctx: unknown, codigo?: string) => (codigo ? permisos.has(codigo) : permisos.has('admin'))),
}));
jest.mock('@/lib/services/monedaOrganizacion', () => ({
  resolverContextoMoneda: jest.fn(async () => jest.requireActual('@/lib/utils/moneda').contextoMoneda('COP', { locale: 'es-CO' })),
}));

const defsReporte = new Map<string, ReportDefinition>();
const acceso = { disponibles: [] as ReportDefinition[], alcance: { esAdmin: false, todas: [1, 2], permitidas: [1], accesoTotal: false }, modulosActivos: ['pos'] };
jest.mock('@/lib/services/reportes/acceso.server', () => {
  const { OrgContextError: Err } = jest.requireActual('@/lib/utils/orgContextError');
  return {
    resolverAccesoReportes: jest.fn(async () => acceso),
    exigirReporteDisponible: jest.fn((_a: unknown, id: string) => {
      const def = defsReporte.get(id);
      if (!def) throw new Err('Reporte no encontrado', 404, 'NOT_FOUND');
      return { def, vista: null };
    }),
    sucursalDeParametro: (v: string | null) => (v && /^\d+$/.test(v) ? Number(v) : null),
    sucursalDelReporte: jest.fn((_a: unknown, def: ReportDefinition, pedida: number | null) => {
      if (def.alcance === 'organizacion') return null;
      if (pedida !== 1) throw new Err('No tienes acceso a esa sucursal', 403, 'BRANCH_FORBIDDEN');
      return pedida;
    }),
  };
});
const ejecutar = jest.fn();
jest.mock('@/lib/services/reportes/reportesEngine', () => ({ ejecutarReporte: (...args: unknown[]) => ejecutar(...args) }));

import { armarDocumento } from '../server/motor';

const ORG = 7;
const CIERRE = 'c1c1c1c1-1111-4111-8111-111111111111';
const CIERRE_VIEJO = 'c0c0c0c0-0000-4000-8000-000000000000';
const CIERRE_AJENO = 'cacacaca-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const XSS = '<img src=x onerror=alert(1)>';

const periodo: PeriodoCierre = { tipo: 'mensual', fechaInicio: '2026-09-01', fechaFin: '2026-09-30', etiqueta: 'Septiembre 2026', horaInicio: '20:00', horaFin: '03:00' };

function def(id: string, grupo: ReportDefinition['grupo'], filtros: ReportDefinition['filtros'] = ['sucursal'], alcance: ReportDefinition['alcance'] = 'sucursal'): ReportDefinition {
  return { id, grupo, filtros, alcance, modulo: 'pos', titulo: id, descripcion: '', categoria: 'operativo', periodosSugeridos: ['mensual'], fetch: jest.fn() };
}

function datos(id: string, filas: number, extra: Partial<ReportData> = {}): ReportData {
  return {
    id,
    titulo: `Reporte ${id}`,
    modulo: 'pos',
    kpis: [{ titulo: 'Ventas', valor: 1500, formato: 'moneda' }, { titulo: 'Margen', valor: 12.5, formato: 'porcentaje' }],
    columnas: [
      { key: 'dia', titulo: 'Día', tipo: 'fecha' },
      { key: 'total', titulo: 'Total', tipo: 'moneda', alinear: 'right' },
    ],
    filas: Array.from({ length: filas }, (_, i) => ({ dia: `2026-09-${String((i % 28) + 1).padStart(2, '0')}`, total: i, extra: 'no se congela' })),
    totales: { dia: 'Total', total: 999 },
    generadoEn: '2026-09-30T12:00:00Z',
    periodo,
    ...extra,
  };
}

const GRUPOS = [
  { id: 'contabilidad' as const, nombre: 'Contabilidad' },
  { id: 'ventas' as const, nombre: 'Ventas y POS' },
];

describe('snapshot del cierre', () => {
  const defs = [def('ventas-periodo', 'ventas', ['franja', 'sucursal']), def('balance-general', 'contabilidad', ['comparativo'], 'organizacion')];

  test('capítulos en el orden del catálogo, tope de filas con el total real y totales completos', () => {
    const s = armarSnapshot({
      periodo,
      plantilla: 'completo',
      sucursal: null,
      moneda: null,
      definiciones: defs,
      grupos: GRUPOS,
      resultados: [datos('ventas-periodo', 5), datos('balance-general', 12)],
      errores: [{ reportId: 'impuestos', titulo: 'Impuestos' }],
      generadoEn: '2026-09-30T12:00:00Z',
      maxFilas: 10,
    });
    expect(s.capitulos.map((c) => c.titulo)).toEqual(['Contabilidad', 'Ventas y POS']);
    const balance = s.capitulos[0].reportes[0];
    expect(balance.principal.filas).toHaveLength(10);
    expect(balance.principal.filasTotales).toBe(12);
    expect(balance.principal.totales).toEqual({ dia: 'Total', total: 999 });
    expect(balance.principal.filas[0]).not.toHaveProperty('extra');
    expect(s.kpisPortada).toHaveLength(2);
    expect(s.errores).toEqual([{ reportId: 'impuestos', titulo: 'Impuestos' }]);
    expect(idsDelSnapshot(s)).toEqual(['balance-general', 'ventas-periodo']);
  });

  test('la franja marca los reportes que se calculan por día completo', () => {
    expect(congelarReporte(datos('a', 1), def('a', 'ventas', ['franja']), periodo).sinFranja).toBe(false);
    expect(congelarReporte(datos('b', 1), def('b', 'contabilidad', []), periodo).sinFranja).toBe(true);
    expect(congelarReporte(datos('b', 1), def('b', 'contabilidad', []), { ...periodo, horaInicio: null, horaFin: null }).sinFranja).toBe(false);
  });

  test('solo valores planos: objetos a texto, NaN a null', () => {
    const r = congelarReporte(datos('a', 0, { filas: [{ dia: { raro: 1 }, total: Number.NaN }] }), def('a', 'ventas'), periodo);
    expect(r.principal.filas[0]).toEqual({ dia: '[object Object]', total: null });
  });

  test('plantillas', () => {
    const todos = [def('estado-resultados', 'contabilidad'), def('cxc-aging', 'finanzas'), def('impuestos', 'finanzas'), def('ventas-periodo', 'ventas'), def('stock-critico', 'inventario'), def('compras-proveedor', 'compras')];
    expect(reportesDePlantilla('completo', todos)).toHaveLength(6);
    expect(reportesDePlantilla('contable', todos).map((d) => d.id)).toEqual(['estado-resultados', 'cxc-aging', 'impuestos', 'compras-proveedor']);
    expect(reportesDePlantilla('ventas-caja', todos).map((d) => d.id)).toEqual(['impuestos', 'ventas-periodo']);
    expect(reportesDePlantilla('personalizada', todos, ['stock-critico', 'no-disponible']).map((d) => d.id)).toEqual(['stock-critico']);
  });

  test('leerSnapshot rechaza lo que no es del formato v2', () => {
    expect(leerSnapshot({})).toBeNull();
    expect(leerSnapshot({ kpis: [], reportes: 3 })).toBeNull();
    expect(leerSnapshot({ formato: 1, periodo, plantilla: 'otra', capitulos: [] })).toBeNull();
    expect(leerSnapshot({ formato: 1, periodo, plantilla: 'completo', capitulos: [{ titulo: 'X', reportes: [{ titulo: 'Y' }] }] })).toBeNull();
    expect(leerSnapshot({ formato: 1, periodo, plantilla: 'completo', capitulos: [] })).toMatchObject({ errores: [], kpisPortada: [], sucursal: null });
  });
});

describe('secciones de un reporte', () => {
  test('el tipo de una columna fecha sale de sus valores', () => {
    const col = { key: 'f', titulo: 'F', tipo: 'fecha' as const };
    expect(tipoColumnaDocumento(col, [{ f: '2026-09-01' }, { f: null }])).toBe('fecha');
    expect(tipoColumnaDocumento(col, [{ f: '2026-09-01T15:00:00Z' }])).toBe('instanteHora');
    expect(tipoColumnaDocumento(col, [{ f: '01/09/2026' }])).toBe('texto');
  });

  test('capítulo, KPIs y lectura solo en la primera sección; 80 mm sin vistas; truncado', () => {
    const r = congelarReporte(
      datos('x', 5, {
        vistaPrincipal: 'Resumido',
        vistas: [{ id: 'por-cuenta', titulo: 'Por cuenta', columnas: [{ key: 'c', titulo: 'Cuenta', tipo: 'texto' }], filas: [{ c: '4135' }] }],
        lectura: [{ tono: 'alerta', texto: '3 asientos fallidos', href: '/app/x' }],
      }),
      def('x', 'ventas', []),
      periodo,
    );
    const carta = seccionesDeReporte(r, { capitulo: 'Ventas', incluirVistas: true, maxFilas: 3, notaSinFranja: 'por día' });
    expect(carta).toHaveLength(2);
    expect(carta[0]).toMatchObject({ capitulo: 'Ventas', tituloTexto: 'Reporte x', subtitulo: 'Resumido', truncado: { mostradas: 3, total: 5 } });
    expect(carta[0].notas).toEqual([{ tono: 'peligro', texto: '3 asientos fallidos' }, { tono: 'info', texto: 'por día' }]);
    expect(carta[0].resumen?.map((c) => c.valor.tipo)).toEqual(['dinero', 'porcentaje']);
    expect(carta[0].columnas.map((c) => c.tipo)).toEqual(['fecha', 'dinero']);
    expect(carta[0].pie).toEqual(['Total', 999]);
    expect(carta[1]).toMatchObject({ tituloTexto: 'Reporte x · Por cuenta' });
    expect(carta[1].capitulo).toBeUndefined();
    expect(carta[1].resumen).toBeUndefined();

    expect(seccionesDeReporte(r, { incluirVistas: false, maxFilas: 40, notaSinFranja: '' })).toHaveLength(1);
    expect(seccionesDeReporte(r, { incluirVistas: true, maxFilas: 40, notaSinFranja: '', soloVista: 'por-cuenta' }).map((s) => s.tituloTexto)).toEqual(['Reporte x']);
  });
});

function snapshot(): SnapshotCierre {
  return armarSnapshot({
    periodo,
    plantilla: 'contable',
    sucursal: { id: 1, nombre: 'Sucursal Norte' },
    moneda: null,
    definiciones: [def('balance-general', 'contabilidad', []), def('ventas-periodo', 'ventas', ['franja'])],
    grupos: GRUPOS,
    resultados: [datos('balance-general', 3, { titulo: `Balance ${XSS}` }), datos('ventas-periodo', 2)],
    errores: [{ reportId: 'impuestos', titulo: 'Impuestos' }],
    generadoEn: '2026-09-30T12:00:00Z',
  });
}

function tablas() {
  const base = {
    organization_id: ORG, tipo: 'mensual', plantilla: 'contable', fecha_inicio: '2026-09-01', fecha_fin: '2026-09-30', hora_inicio: '20:00:00', hora_fin: '03:00:00',
    branch_id: 1, snapshot: snapshot(), zona_horaria: 'America/Bogota', emitido_por: 'u-1', emitido_en: '2026-10-01T03:30:00Z', firmado_por: null, firmado_en: null,
    fiscal_period_id: null, reabierto_por: null, reabierto_en: null, motivo_reapertura: null,
  };
  return {
    organizations: [{ id: ORG, name: 'Mi empresa', legal_name: 'Mi empresa S.A.S.', nit: '900123456', dv: 7, timezone: 'America/Bogota', logo_url: null, primary_color: null, fiscal_responsibilities: [] }],
    branches: [{ id: 1, organization_id: ORG, name: 'Sucursal Norte', timezone: null }],
    profiles: [{ id: 'u-1', first_name: 'Ana', last_name: 'Contadora' }],
    organization_settings: [],
    report_closings: [
      { ...base, id: CIERRE, numero: 'CIERRE-MENSUAL-202609-001', version: 2, estado: 'emitido', reemplazado_por: null },
      { ...base, id: CIERRE_VIEJO, numero: 'CIERRE-MENSUAL-202609-001', version: 1, estado: 'reemplazado', reemplazado_por: CIERRE },
      { ...base, id: CIERRE_AJENO, organization_id: 99, numero: 'CIERRE-AJENO', version: 1, estado: 'emitido', reemplazado_por: null },
      { ...base, id: 'c2c2c2c2-2222-4222-8222-222222222222', numero: 'CIERRE-V1', version: 1, estado: 'emitido', reemplazado_por: null, snapshot: { kpis: [] } },
    ],
    report_executions: [] as Array<Record<string, unknown>>,
  };
}

function sesion(t = tablas()) {
  const supabase = fakeSupabase(t);
  return { t, supabase, ctx: { userId: 'u-2', organizationId: ORG, roleId: 5, isSuperAdmin: false, supabase: supabase as never } };
}

async function codigoDe(promesa: Promise<unknown>): Promise<string> {
  try {
    await promesa;
    return 'OK';
  } catch (err) {
    if (err instanceof OrgContextError) return `${err.statusCode} ${err.code}`;
    throw err;
  }
}

const pedir = (s: ReturnType<typeof sesion>, tipo: 'cierre-periodo' | 'reporte', id: string, extra: Partial<Parameters<typeof armarDocumento>[1]> = {}) =>
  armarDocumento(s.ctx, { tipo, id, papel: 'carta', idioma: 'es', ahora: new Date('2026-10-01T12:00:00Z'), ...extra });

beforeEach(() => {
  permisos.clear();
  ejecutar.mockReset();
  defsReporte.clear();
});

describe('documento cierre-periodo', () => {
  test('sin reports.export ni finance.view → 403 antes de leer', async () => {
    const s = sesion();
    expect(await codigoDe(pedir(s, 'cierre-periodo', CIERRE))).toBe('403 PERMISSION_REQUIRED');
    expect(s.supabase.consultas.some((c) => c.tabla === 'report_closings')).toBe(false);
  });

  test('ajeno, inexistente o id mal formado → el mismo 404', async () => {
    permisos.add('reports.export');
    const s = sesion();
    expect(await codigoDe(pedir(s, 'cierre-periodo', CIERRE_AJENO))).toBe('404 NOT_FOUND');
    expect(await codigoDe(pedir(s, 'cierre-periodo', 'no-es-uuid'))).toBe('404 NOT_FOUND');
    expect(await codigoDe(pedir(s, 'cierre-periodo', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'))).toBe('404 NOT_FOUND');
    const lectura = s.supabase.consultas.find((c) => c.tabla === 'report_closings');
    expect(lectura?.filtros).toEqual(expect.arrayContaining([['organization_id', 'eq', ORG]]));
  });

  test('un cierre de la v1 sin snapshot de capítulos no se pinta con datos inventados', async () => {
    permisos.add('finance.view');
    await expect(pedir(sesion(), 'cierre-periodo', 'c2c2c2c2-2222-4222-8222-222222222222')).rejects.toThrow('No se pudo leer');
  });

  test('carta: número, versión, franja, capítulos, KPIs, errores, firmas y HTML escapado', async () => {
    permisos.add('finance.view');
    const s = sesion();
    const { html, payload } = await pedir(s, 'cierre-periodo', CIERRE, { papel: 'carta' });
    expect(payload.numero).toBe('CIERRE-MENSUAL-202609-001');
    expect(payload.estado).toEqual({ codigo: 'cierre.emitido', tono: 'marca' });
    expect(payload.marcaAgua).toBeNull();
    expect(html).toContain('Cierre de periodo');
    expect(html).toContain('v2');
    expect(html).toContain('20:00 – 03:00');
    expect(html).toContain('Índice de capítulos');
    expect(html).toContain('Contabilidad');
    expect(html).toContain('Ventas y POS');
    expect(html).toContain('Contable y financiero');
    expect(html).toContain('Este reporte se calcula por día completo');
    expect(html).toContain('Reportes no incluidos');
    expect(html).toContain('Elaboró');
    expect(html).toContain('Representante legal');
    expect(html).toContain('12,5 %');
    expect(html).not.toContain(XSS);
    expect(html).toContain('&lt;img');
    expect(payload.bandas.map((b) => b.clave)).toEqual(['cierreConErrores']);
    expect(payload.nombreArchivo).toContain('CIERRE-MENSUAL-202609-001-v2');
    expect(s.t.report_executions).toEqual([expect.objectContaining({ accion: 'exportar', report_id: 'cierre-mensual', user_id: 'u-2', organization_id: ORG, branch_id: 1 })]);
  });

  test('versión reemplazada: marca de agua y la versión que la reemplaza', async () => {
    permisos.add('reports.export');
    const { html, payload } = await pedir(sesion(), 'cierre-periodo', CIERRE_VIEJO);
    expect(payload.marcaAgua).toBe('reemplazado');
    expect(html).toContain('REEMPLAZADO');
    expect(html).toContain('reemplazada por la v2');
  });

  test('80 mm: sin índice ni vistas, con las firmas del cierre', async () => {
    permisos.add('reports.export');
    const { html, payload } = await pedir(sesion(), 'cierre-periodo', CIERRE, { papel: '80mm' });
    expect(payload.secciones.some((sec) => sec.titulo === 'indiceCapitulos')).toBe(false);
    expect(html).toContain('CIERRE DE PERIODO');
    expect(html).toContain('Elaboró');
  });
});

describe('documento reporte', () => {
  beforeEach(() => {
    defsReporte.set('ventas-periodo', def('ventas-periodo', 'ventas', ['franja', 'sucursal']));
    defsReporte.set('balance-general', def('balance-general', 'contabilidad', [], 'organizacion'));
  });

  test('sin reports.export → 403', async () => {
    permisos.add('finance.view');
    expect(await codigoDe(pedir(sesion(), 'reporte', 'ventas-periodo', { desde: '2026-09-01', hasta: '2026-09-30' }))).toBe('403 PERMISSION_REQUIRED');
  });

  test('no es de 80 mm', async () => {
    permisos.add('reports.export');
    expect(await codigoDe(pedir(sesion(), 'reporte', 'ventas-periodo', { papel: '80mm' }))).toBe('400 PAPEL_NO_DISPONIBLE');
  });

  test('periodo inválido → 400; reporte desconocido → 404; sucursal ajena → 403', async () => {
    permisos.add('reports.export');
    const s = sesion();
    expect(await codigoDe(pedir(s, 'reporte', 'ventas-periodo', { desde: '2026-09-30', hasta: '2026-09-01', parametros: { sucursal: '1' } }))).toBe('400 PERIODO_INVALIDO');
    expect(await codigoDe(pedir(s, 'reporte', 'no-existe', { desde: '2026-09-01', hasta: '2026-09-30' }))).toBe('404 NOT_FOUND');
    expect(await codigoDe(pedir(s, 'reporte', 'ventas-periodo', { desde: '2026-09-01', hasta: '2026-09-30', parametros: { sucursal: '2' } }))).toBe('403 BRANCH_FORBIDDEN');
    expect(ejecutar).not.toHaveBeenCalled();
  });

  test('corre con el cliente de la sesión, la sucursal validada y la franja; deja «exportar» en el historial', async () => {
    permisos.add('reports.export');
    ejecutar.mockResolvedValue(datos('ventas-periodo', 4));
    const s = sesion();
    const { html, payload } = await pedir(s, 'reporte', 'ventas-periodo', {
      desde: '2026-09-01',
      hasta: '2026-09-30',
      parametros: { sucursal: '1', hi: '20:00', hf: '03:00', periodo: 'mensual' },
    });
    expect(ejecutar).toHaveBeenCalledWith('ventas-periodo', ORG, expect.objectContaining({ tipo: 'mensual', horaInicio: '20:00', horaFin: '03:00' }), 1, s.ctx.supabase);
    expect(payload.numero).toBe('Reporte ventas-periodo');
    expect(html).toContain('Sucursal Norte');
    expect(html).toContain('20:00 – 03:00');
    expect(s.t.report_executions).toEqual([expect.objectContaining({ accion: 'exportar', report_id: 'ventas-periodo', branch_id: 1 })]);
  });

  test('un reporte de toda la organización ignora la sucursal pedida', async () => {
    permisos.add('reports.export');
    ejecutar.mockResolvedValue(datos('balance-general', 1));
    const { html } = await pedir(sesion(), 'reporte', 'balance-general', { desde: '2026-09-01', hasta: '2026-09-30', parametros: { sucursal: '2' } });
    expect(ejecutar).toHaveBeenCalledWith('balance-general', ORG, expect.anything(), null, expect.anything());
    expect(html).toContain('Toda la organización');
  });
});
