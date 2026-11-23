/**
 * Cron de fotos diarias (`/api/cron/fotos-operacion`): solo las organizaciones con Logística o
 * Transporte activos y en la última hora de SU día; foto de toda la organización (sucursal
 * NULL) y de cada sucursal, con las reglas del módulo; upsert idempotente; un error en una
 * organización no frena a las demás.
 *
 * Organizaciones ficticias 120 (Bogotá) y 121 (Madrid); sin datos reales.
 */
const zonas: Record<number, string> = { 120: 'America/Bogota', 121: 'Europe/Madrid', 122: 'America/Bogota' };

jest.mock('@/lib/services/organizationTimezoneService', () => ({
  getOrganizationTimezone: async (org: number) => zonas[org],
}));

const filaEnvio = (id: string, branchId: number, promesa: string | null) => ({
  id,
  numero: id,
  pedido: null,
  status: 'pending',
  modo: 'own',
  domiciliarioId: null,
  branchId,
  promesa,
  fechaEsperada: null,
  contraentrega: 0,
  codStatus: null,
});

jest.mock('@/lib/services/logistica/despachoService', () => ({
  listarPorDespachar: jest.fn(async (_db: unknown, p: { organizationId: number }) => {
    if (p.organizationId === 122) throw new Error('caída');
    return {
      filas: [
        // Dos atrasados (promesa vencida) en la sede 1 y uno a tiempo en la 2.
        filaEnvio('e1', 1, '2026-11-24T02:00:00Z'),
        filaEnvio('e2', 1, '2026-11-24T03:00:00Z'),
        filaEnvio('e3', 2, '2026-11-25T15:00:00Z'),
      ],
      recortada: false,
    };
  }),
}));

jest.mock('@/lib/services/transporte/despachosService', () => ({
  listarViajesDelDia: jest.fn(async () => [
    { id: 't1', codigo: 'V-1', salida: '2026-11-23T20:00:00Z', status: 'completed', sedeId: 1, despachadoEn: '2026-11-23T20:00:00Z', excepcion: null, ruta: null, vehiculo: null, puestos: 40, disponibles: 10 },
    { id: 't2', codigo: 'V-2', salida: '2026-11-24T03:00:00Z', status: 'scheduled', sedeId: 2, despachadoEn: null, excepcion: null, ruta: null, vehiculo: null, puestos: 40, disponibles: 40 },
  ]),
}));

import { tomarFotosOperacion } from '../fotosOperacion.cron';

type Llamada = { tabla?: string; rpc?: string; args?: unknown; filas?: unknown; opciones?: unknown };

function dbFalsa(llamadas: Llamada[]) {
  const consulta = (tabla: string) => {
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'limit']) q[m] = () => q;
    q.upsert = async (filas: unknown, opciones: unknown) => {
      llamadas.push({ tabla, filas, opciones });
      return { error: null };
    };
    const datos =
      tabla === 'organization_modules'
        ? [
            { organization_id: 120, module_code: 'logistica' },
            { organization_id: 120, module_code: 'transport' },
            { organization_id: 121, module_code: 'logistica' },
            { organization_id: 122, module_code: 'logistica' },
          ]
        : tabla === 'branches'
          ? [{ id: 1 }, { id: 2 }]
          : [];
    q.then = (ok: (x: unknown) => void) => ok({ data: datos, error: null });
    return q;
  };
  return {
    from: (tabla: string) => {
      llamadas.push({ tabla });
      return consulta(tabla);
    },
    rpc: async (nombre: string, args: unknown) => {
      llamadas.push({ rpc: nombre, args });
      // El viaje t2 está bloqueado por SOAT vencido.
      return { data: { trip_id: 't2', bloqueos: [{ causa: 'soat', grupo: 'vehiculo', vence: '2026-11-20', excepcion: false }], avisos: [] }, error: null };
    },
  };
}

describe('tomarFotosOperacion', () => {
  // 04:50 UTC del 24 = 23:50 del 23 en Bogotá; 05:50 en Madrid.
  const ahora = new Date('2026-11-24T04:50:00Z');

  test('fotografía solo a quien le toca, por organización y por sucursal, con las reglas del módulo', async () => {
    const llamadas: Llamada[] = [];
    const r = await tomarFotosOperacion(dbFalsa(llamadas) as never, ahora);
    expect(r).toMatchObject({ organizaciones: 3, conFoto: 1, errores: 1 });

    const upserts = llamadas.filter((l) => l.filas);
    expect(upserts).toHaveLength(1);
    expect(upserts[0].opciones).toEqual({ onConflict: 'organization_id,branch_id,fecha,metrica' });
    const filas = upserts[0].filas as Array<{ organization_id: number; branch_id: number | null; fecha: string; metrica: string; valor: number }>;
    expect(new Set(filas.map((f) => f.organization_id))).toEqual(new Set([120]));
    expect(new Set(filas.map((f) => f.fecha))).toEqual(new Set(['2026-11-23']));
    const valor = (branch: number | null, metrica: string) => filas.find((f) => f.branch_id === branch && f.metrica === metrica)?.valor;
    expect(valor(null, 'logistica.atrasados')).toBe(2);
    expect(valor(1, 'logistica.atrasados')).toBe(2);
    expect(valor(2, 'logistica.atrasados')).toBe(0);
    expect(valor(null, 'logistica.por_despachar')).toBe(3);
    expect(valor(null, 'transporte.viajes')).toBe(2);
    expect(valor(null, 'transporte.ocupacion_pct')).toBe(75);
    expect(valor(null, 'transporte.bloqueados')).toBe(1);
    // La sede 2 no tiene viajes salidos: no hay ocupación que guardar.
    expect(valor(2, 'transporte.ocupacion_pct')).toBeUndefined();
    expect(valor(2, 'transporte.bloqueados')).toBe(1);

    // El cumplimiento sale de la función interna (sin sesión), solo para lo que falta por salir.
    expect(llamadas.filter((l) => l.rpc).map((l) => [l.rpc, l.args])).toEqual([['fn_transporte_cumplimiento_interno', { p_trip: 't2' }]]);
  });

  test('a otra hora no escribe nada', async () => {
    const llamadas: Llamada[] = [];
    const r = await tomarFotosOperacion(dbFalsa(llamadas) as never, new Date('2026-11-23T18:00:00Z'));
    expect(r.conFoto).toBe(0);
    expect(llamadas.some((l) => l.filas)).toBe(false);
  });
});
