/**
 * Archivos de un envío para quien lo recibe con su propia sesión.
 * - Envío de una sucursal, o persona con acceso total: un solo juego de archivos.
 * - Envío de todas las sucursales y persona que solo ve algunas: un archivo
 *   por cada sucursal que ve, con el nombre de la sucursal en el archivo.
 * - Sin sucursales asignadas o con demasiadas: 403 (el cron lo pausa).
 * - Un reporte de toda la organización no se reparte: lo decide el documento.
 */
import type { ReportDefinition } from '../types';

const guion = { accesoTotal: false, permitidas: [1] as number[] };
const pedidos: Array<number | null> = [];

jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));
jest.mock('@/lib/services/reportes/reportesCatalogo', () => ({
  getReporteById: (id: string): Partial<ReportDefinition> | undefined =>
    ({ 'ventas-dia': { id: 'ventas-dia', alcance: 'sucursal' }, balance: { id: 'balance', alcance: 'organizacion' } })[id] as Partial<ReportDefinition> | undefined,
}));
jest.mock('@/lib/services/reportes/acceso.server', () => ({
  resolverAccesoReportes: jest.fn(async () => ({ alcance: { esAdmin: false, todas: [1, 2, 3], permitidas: guion.permitidas, accesoTotal: guion.accesoTotal } })),
}));
jest.mock('@/lib/services/reportes/programados/envio.server', () => ({
  nombreSeguro: (t: string) => t.replace(/\s+/g, '_'),
  nombreSucursal: async (_s: unknown, id: number) => ({ 1: 'Sucursal Norte', 2: 'Sucursal Sur' })[id] ?? null,
  archivosDelEnvio: jest.fn(async (_s: unknown, e: { branchId: number | null }) => {
    pedidos.push(e.branchId);
    return { titulo: 'Ventas por día', adjuntos: [{ filename: 'ventas.pdf', content_base64: '', content_type: 'application/pdf' }] };
  }),
}));

import { archivosParaMiembro } from '../programados/archivosMiembro.server';
import type { EnvioAArmar } from '../programados/envio.server';

const sesion = { userId: 'u', organizationId: 120, roleId: 4, isSuperAdmin: false, memberId: 5, supabase: {} as never };
const envio = (extra: Partial<EnvioAArmar> = {}): EnvioAArmar => ({
  reportId: 'ventas-dia',
  branchId: null,
  formato: 'pdf',
  filtros: { periodo: 'semanal', horaInicio: null, horaFin: null, comparar: null, vista: null },
  periodo: { tipo: 'semanal', fechaInicio: '2026-09-21', fechaFin: '2026-09-27', etiqueta: '' },
  zona: 'America/Bogota',
  ...extra,
});

beforeEach(() => {
  guion.accesoTotal = false;
  guion.permitidas = [1];
  pedidos.length = 0;
});

describe('archivosParaMiembro', () => {
  it('envío de una sucursal: un juego, sin leer el alcance', async () => {
    await archivosParaMiembro(sesion, envio({ branchId: 2 }), 'es');
    expect(pedidos).toEqual([2]);
  });

  it('todas las sucursales con acceso total: el consolidado', async () => {
    guion.accesoTotal = true;
    await archivosParaMiembro(sesion, envio(), 'es');
    expect(pedidos).toEqual([null]);
  });

  it('todas las sucursales y la persona solo ve una: su sucursal, con el nombre original del archivo', async () => {
    const r = await archivosParaMiembro(sesion, envio(), 'es');
    expect(pedidos).toEqual([1]);
    expect(r.adjuntos.map((a) => a.filename)).toEqual(['ventas.pdf']);
  });

  it('ve dos sucursales: un archivo por cada una, con su nombre', async () => {
    guion.permitidas = [1, 2];
    const r = await archivosParaMiembro(sesion, envio(), 'es');
    expect(pedidos).toEqual([1, 2]);
    expect(r.adjuntos.map((a) => a.filename)).toEqual(['Sucursal_Norte_ventas.pdf', 'Sucursal_Sur_ventas.pdf']);
  });

  it('sin sucursales asignadas o con más del tope → 403 BRANCH_SCOPE_REQUIRED', async () => {
    guion.permitidas = [];
    await expect(archivosParaMiembro(sesion, envio(), 'es')).rejects.toMatchObject({ code: 'BRANCH_SCOPE_REQUIRED' });
    guion.permitidas = [1, 2, 3, 4, 5, 6];
    await expect(archivosParaMiembro(sesion, envio(), 'es')).rejects.toMatchObject({ code: 'BRANCH_SCOPE_REQUIRED' });
    expect(pedidos).toEqual([]);
  });

  it('un reporte de toda la organización no se reparte', async () => {
    await archivosParaMiembro(sesion, envio({ reportId: 'balance' }), 'es');
    expect(pedidos).toEqual([null]);
  });
});
