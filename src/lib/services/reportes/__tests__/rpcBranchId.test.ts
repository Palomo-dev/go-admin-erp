// ============================================================================
// Reportes — contrato de la llamada RPC con filtro de sucursal
// ============================================================================
// El 2026-09-07 el commit 5bb0e906 empezó a enviar `p_branch_id` a las RPC de
// reportes sin la migración correspondiente: las funciones en BD seguían con la
// firma de 3 argumentos y PostgREST respondía 404
// «Could not find the function ... in the schema cache». Todos esos reportes
// quedaron rotos en producción hasta la migración
// `20260922210000_reportes_filtro_por_sucursal.sql`.
//
// Estos tests fijan el contrato para que no vuelva a divergir:
//   - cada reporte llama a SU RPC, con los parámetros nombrados exactos;
//   - `branchId` ausente o nulo viaja como `p_branch_id: null`, nunca undefined
//     (una clave ausente haría que PostgREST resolviera la firma de 3 args, que
//     ya no existe);
//   - `p_branch_id` siempre es `number` o `null`: nunca un string, nunca NaN.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { ventasReports } from '../modulos/ventasReports';
import { finanzasReports } from '../modulos/finanzasReports';
import { inventarioReports } from '../modulos/inventarioReports';
import type { PeriodoCierre, ReportDefinition } from '../types';

// `getOrgDateRange` consulta el timezone de la organización en Supabase; aquí
// solo interesa que la llamada RPC salga bien formada, así que se fija.
jest.mock('@/lib/utils/timezone', () => ({
  getOrgDateRange: jest.fn(async () => ({
    start: '2026-09-01T05:00:00.000Z',
    end: '2026-09-30T04:59:59.999Z',
  })),
}));

// El módulo de reportes importa el cliente de navegador al cargarse; en Node no
// existe `window`, así que se sustituye por un objeto inerte. Los tests siempre
// pasan su propio cliente por parámetro.
jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));

interface LlamadaRpc {
  fn: string;
  params: Record<string, unknown>;
}

/**
 * Doble de Supabase que registra cada `rpc()` y devuelve un jsonb vacío.
 * `from()` devuelve un encadenable inerte para los reportes que además leen
 * tablas directamente.
 */
function crearDoble(): { client: SupabaseClient; llamadas: LlamadaRpc[] } {
  const llamadas: LlamadaRpc[] = [];

  const encadenable: Record<string, unknown> = {};
  const metodos = [
    'select', 'eq', 'neq', 'gte', 'lte', 'gt', 'lt', 'in', 'is', 'not',
    'match', 'order', 'limit', 'range', 'filter', 'or', 'contains',
  ];
  for (const m of metodos) {
    encadenable[m] = jest.fn(() => encadenable);
  }
  // Resolver como `{ data: [], error: null }` cuando se hace await de la query.
  encadenable.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ data: [], error: null, count: 0 }).then(resolve);

  const client = {
    rpc: jest.fn(async (fn: string, params: Record<string, unknown>) => {
      llamadas.push({ fn, params });
      return { data: {}, error: null };
    }),
    from: jest.fn(() => encadenable),
  } as unknown as SupabaseClient;

  return { client, llamadas };
}

const PERIODO: PeriodoCierre = {
  tipo: 'mensual',
  fechaInicio: '2026-09-01',
  fechaFin: '2026-09-30',
  etiqueta: 'Septiembre 2026',
};

const ORG_ID = 142;

/** Los 9 reportes que el frontend llama con `p_branch_id`. */
const CASOS: Array<{ reporte: ReportDefinition; rpc: string; claves: string[] }> = [
  { reporte: buscar(ventasReports, 'fn_reporte_cierre_caja'), rpc: 'fn_reporte_cierre_caja', claves: ['p_organization_id', 'p_from', 'p_to', 'p_branch_id'] },
  { reporte: buscar(ventasReports, 'fn_reporte_ventas_resumen'), rpc: 'fn_reporte_ventas_resumen', claves: ['p_organization_id', 'p_from', 'p_to', 'p_branch_id'] },
  { reporte: buscar(ventasReports, 'fn_reporte_ventas_por_hora'), rpc: 'fn_reporte_ventas_por_hora', claves: ['p_organization_id', 'p_from', 'p_to', 'p_branch_id'] },
  { reporte: buscar(finanzasReports, 'fn_reporte_cxc_aging'), rpc: 'fn_reporte_cxc_aging', claves: ['p_organization_id', 'p_as_of', 'p_branch_id'] },
  { reporte: buscar(finanzasReports, 'fn_reporte_cxp_aging'), rpc: 'fn_reporte_cxp_aging', claves: ['p_organization_id', 'p_as_of', 'p_branch_id'] },
  { reporte: buscar(finanzasReports, 'fn_reporte_flujo_efectivo'), rpc: 'fn_reporte_flujo_efectivo', claves: ['p_organization_id', 'p_from', 'p_to', 'p_branch_id'] },
  { reporte: buscar(finanzasReports, 'fn_reporte_impuestos'), rpc: 'fn_reporte_impuestos', claves: ['p_organization_id', 'p_from', 'p_to', 'p_branch_id'] },
  { reporte: buscar(inventarioReports, 'fn_reporte_movimientos_inventario'), rpc: 'fn_reporte_movimientos_inventario', claves: ['p_organization_id', 'p_from', 'p_to', 'p_branch_id'] },
  { reporte: buscar(inventarioReports, 'fn_reporte_rotacion_inventario'), rpc: 'fn_reporte_rotacion_inventario', claves: ['p_organization_id', 'p_from', 'p_to', 'p_branch_id'] },
];

/**
 * Localiza la definición de reporte cuyo `fetch` llama a la RPC indicada.
 * Se busca por el texto de la función en vez de por id para que el test no se
 * quede callado si alguien renombra un reporte.
 */
function buscar(defs: ReportDefinition[], rpc: string): ReportDefinition {
  const encontrado = defs.find((d) => d.fetch.toString().includes(`'${rpc}'`));
  if (!encontrado) {
    throw new Error(`Ningún reporte del módulo llama a ${rpc}`);
  }
  return encontrado;
}

describe('reportes — parámetros de la llamada RPC con sucursal', () => {
  it.each(CASOS)('$rpc recibe exactamente los parámetros nombrados esperados', async ({ reporte, rpc, claves }) => {
    const { client, llamadas } = crearDoble();
    await reporte.fetch(ORG_ID, PERIODO, 7, client);

    const llamada = llamadas.find((l) => l.fn === rpc);
    expect(llamada).toBeDefined();
    expect(Object.keys(llamada!.params).sort()).toEqual([...claves].sort());
    expect(llamada!.params.p_organization_id).toBe(ORG_ID);
  });

  it.each(CASOS)('$rpc envía p_branch_id como número cuando hay sucursal', async ({ reporte, rpc }) => {
    const { client, llamadas } = crearDoble();
    await reporte.fetch(ORG_ID, PERIODO, 7, client);

    const llamada = llamadas.find((l) => l.fn === rpc)!;
    expect(llamada.params.p_branch_id).toBe(7);
    expect(typeof llamada.params.p_branch_id).toBe('number');
  });

  it.each(CASOS)('$rpc envía p_branch_id: null (no undefined) cuando branchId es null', async ({ reporte, rpc }) => {
    const { client, llamadas } = crearDoble();
    await reporte.fetch(ORG_ID, PERIODO, null, client);

    const llamada = llamadas.find((l) => l.fn === rpc)!;
    // Clave presente y a null. Si se omitiera, PostgREST buscaría la firma de
    // 3 argumentos —que ya no existe— y devolvería 404.
    expect(Object.keys(llamada.params)).toContain('p_branch_id');
    expect(llamada.params.p_branch_id).toBeNull();
  });

  it.each(CASOS)('$rpc envía p_branch_id: null cuando no se pasa branchId', async ({ reporte, rpc }) => {
    const { client, llamadas } = crearDoble();
    await reporte.fetch(ORG_ID, PERIODO, undefined, client);

    const llamada = llamadas.find((l) => l.fn === rpc)!;
    expect(Object.keys(llamada.params)).toContain('p_branch_id');
    expect(llamada.params.p_branch_id).toBeNull();
  });

  it.each(CASOS)('$rpc nunca manda p_branch_id como string', async ({ reporte, rpc }) => {
    const { client, llamadas } = crearDoble();
    // Un id que llega como string (p. ej. leído de localStorage sin parsear)
    // degrada a "todas las sucursales", nunca viaja como texto a Postgres.
    await reporte.fetch(ORG_ID, PERIODO, '7' as unknown as number, client);

    const llamada = llamadas.find((l) => l.fn === rpc)!;
    expect(typeof llamada.params.p_branch_id).not.toBe('string');
    expect(llamada.params.p_branch_id).toBeNull();
  });

  it.each(CASOS)('$rpc nunca manda p_branch_id como NaN', async ({ reporte, rpc }) => {
    const { client, llamadas } = crearDoble();
    // `parseInt('abc', 10)` en getCurrentBranchId() produce NaN; JSON.stringify
    // lo serializaría como `null` de todas formas, pero se fija explícitamente.
    await reporte.fetch(ORG_ID, PERIODO, Number.NaN, client);

    const llamada = llamadas.find((l) => l.fn === rpc)!;
    expect(llamada.params.p_branch_id).toBeNull();
    expect(Number.isNaN(llamada.params.p_branch_id as number)).toBe(false);
  });

  it('los aging usan p_as_of (date) y no p_from/p_to', async () => {
    const { client, llamadas } = crearDoble();
    await buscar(finanzasReports, 'fn_reporte_cxc_aging').fetch(ORG_ID, PERIODO, 7, client);

    const llamada = llamadas.find((l) => l.fn === 'fn_reporte_cxc_aging')!;
    expect(llamada.params.p_as_of).toBe(PERIODO.fechaFin);
    expect(llamada.params).not.toHaveProperty('p_from');
    expect(llamada.params).not.toHaveProperty('p_to');
  });
});
