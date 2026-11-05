/// <reference types="jest" />
/**
 * POST /api/inventario/productos/importar/lote — reporte a Sentry en el servidor (5-nov-2026):
 * los 500 (RPC_ERROR o error inesperado) van a Sentry con organización, bloque y código, sin filas;
 * los 4xx de validación no (los reporta el asistente). El console.error se mantiene.
 */
const { readOrgBody: realReadOrgBody } = jest.requireActual<typeof import('@/lib/security/organizationBody')>('@/lib/security/organizationBody');

const sesion = { organizationId: 120, userId: 'u-1', roleId: 4, isSuperAdmin: false, supabase: {} };
jest.mock('@/lib/utils/orgContext', () => ({
  withOrg: (h: (ctx: unknown, req: Request) => Promise<Response>) => (req: Request) => h(sesion, req),
  readOrgBody: realReadOrgBody,
  jsonError: (status: number, code: string, error: string) => Response.json({ error, code }, { status }),
}));
jest.mock('@/lib/services/productosPermisos', () => ({ puedeImportarProductos: async () => true }));

const importarLote = jest.fn();
jest.mock('@/lib/services/productosImportService', () => {
  class ErrorLote extends Error {
    constructor(message: string, public readonly status: number, public readonly code: string) { super(message); }
  }
  return { ErrorLote, validarCuerpoLote: (b: unknown) => b, importarLote: (...a: unknown[]) => importarLote(...a) };
});
const reportarSentryServidor = jest.fn(async () => 'id');
jest.mock('@/lib/monitoring/sentryServidor', () => ({ reportarSentryServidor: (...a: unknown[]) => reportarSentryServidor(...(a as [])) }));

import { ErrorLote } from '@/lib/services/productosImportService';
import { POST } from '../route';

const FILAS = [{ sku: 'SKU-SECRETO-1', nombre: 'Tenis Rojo 42' }];
const peticion = (bloque?: string) =>
  new Request('http://localhost/api/inventario/productos/importar/lote', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(bloque ? { 'x-import-bloque': bloque } : {}) },
    body: JSON.stringify({ modo: 'crear', branch_id: 1, opciones: {}, filas: FILAS }),
  });

let errorConsola: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  errorConsola = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('lote → Sentry en el servidor', () => {
  it('RPC_ERROR (500): reporta con org, bloque y código, y responde como antes', async () => {
    importarLote.mockRejectedValue(new ErrorLote('invalid input syntax: "Tenis Rojo 42"', 500, 'RPC_ERROR'));
    const res = await (POST as unknown as (r: Request) => Promise<Response>)(peticion('3'));
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ code: 'RPC_ERROR' });
    expect(reportarSentryServidor).toHaveBeenCalledTimes(1);
    const [evento] = reportarSentryServidor.mock.calls[0] as unknown as [{ tags: Record<string, unknown>; extra?: unknown }];
    expect(evento.tags).toEqual({ area: 'importar_lote', organization_id: 120, bloque: 3, codigo: 'RPC_ERROR', status: 500 });
    expect(JSON.stringify(evento.tags)).not.toContain('SKU-SECRETO');
    expect(evento.extra).toBeUndefined();
    expect(errorConsola).toHaveBeenCalled();
  });

  it('error inesperado: INTERNAL, con console.error; bloque inválido → null', async () => {
    importarLote.mockRejectedValue(new TypeError('boom'));
    const res = await (POST as unknown as (r: Request) => Promise<Response>)(peticion('abc'));
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ code: 'INTERNAL' });
    expect(reportarSentryServidor).toHaveBeenCalledWith(expect.objectContaining({ tags: expect.objectContaining({ codigo: 'INTERNAL', bloque: null }) }));
    expect(errorConsola).toHaveBeenCalledWith('[importar/lote]', expect.any(TypeError));
  });

  it('4xx de validación: sin Sentry en el servidor (lo reporta el asistente)', async () => {
    importarLote.mockRejectedValue(new ErrorLote('La sucursal no pertenece a la organización', 403, 'BRANCH_NOT_IN_ORG'));
    const res = await (POST as unknown as (r: Request) => Promise<Response>)(peticion('1'));
    expect(res.status).toBe(403);
    expect(reportarSentryServidor).not.toHaveBeenCalled();
  });

  it('éxito: sin Sentry', async () => {
    importarLote.mockResolvedValue({ creados: 1, actualizados: 0, omitidos: 0, fallidos: 0, resultados: [] });
    const res = await (POST as unknown as (r: Request) => Promise<Response>)(peticion('1'));
    expect(res.status).toBe(200);
    expect(reportarSentryServidor).not.toHaveBeenCalled();
  });
});
