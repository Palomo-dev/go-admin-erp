/// <reference types="jest" />
/**
 * POST /api/crm/leads/importar — contrato de la ruta: sesión (401), permiso
 * `crm.leads.create` resuelto en el servidor (403), organización ajena en el
 * body o la query (403, regla dura 5), cuerpo inválido (400/413) y despacho a
 * `validar` / `importar` con la organización DE LA SESIÓN.
 *
 * Se dobla `@/lib/utils/orgContext` (el real arrastra `svix`, ESM puro) con la
 * clase de error y el `readOrgBody` REALES, y el servicio (sus pruebas viven en
 * `src/lib/services/crm/__tests__/leadsImportService.test.ts`).
 */

const { OrgContextError: RealOrgContextError } = jest.requireActual<typeof import('@/lib/utils/orgContextError')>('@/lib/utils/orgContextError');
const { readOrgBody: realReadOrgBody } = jest.requireActual<typeof import('@/lib/security/organizationBody')>('@/lib/security/organizationBody');

const sesion = { organizationId: 120, userId: 'u-1', roleId: 4, isSuperAdmin: false, supabase: {} };
const getServerOrgContext = jest.fn(async () => sesion);
const hasOrgAdminOrPermission = jest.fn(async () => true);

jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError: RealOrgContextError,
  getServerOrgContext: () => getServerOrgContext(),
  hasOrgAdminOrPermission: (...a: unknown[]) => hasOrgAdminOrPermission(...(a as [])),
  readOrgBody: realReadOrgBody,
}));

const validarImportacion = jest.fn(async () => ({ resultados: [], resumen: { total: 0 }, moneda: null }));
const importarBloque = jest.fn(async () => ({ resultados: [], resumen: { total: 0 } }));
jest.mock('@/lib/services/crm/leadsImportService', () => ({
  LEADS_CREATE_PERMISSION: 'crm.leads.create',
  validarImportacion: (...a: unknown[]) => validarImportacion(...(a as [])),
  importarBloque: (...a: unknown[]) => importarBloque(...(a as [])),
}));

import { NextRequest } from 'next/server';
import { POST } from '../route';

const cuerpo = (extra: Record<string, unknown> = {}) => ({
  accion: 'validar',
  filas: [{ fila: 2, campos: { nombre: 'Tienda Sintética', telefono: '3001234567' } }],
  opciones: { lote: 'L1' },
  ...extra,
});
const peticion = (body: unknown, url = 'http://localhost/api/crm/leads/importar') =>
  new NextRequest(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });

beforeEach(() => {
  jest.clearAllMocks();
  getServerOrgContext.mockImplementation(async () => sesion);
  hasOrgAdminOrPermission.mockImplementation(async () => true);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('POST /api/crm/leads/importar', () => {
  it('sin sesión → 401 y no llama al servicio', async () => {
    getServerOrgContext.mockImplementation(async () => {
      throw new RealOrgContextError('No autenticado', 401);
    });
    const res = await POST(peticion(cuerpo()));
    expect(res.status).toBe(401);
    expect(validarImportacion).not.toHaveBeenCalled();
  });

  it('sin el permiso crm.leads.create → 403 (resuelto en el servidor, con la sesión)', async () => {
    hasOrgAdminOrPermission.mockImplementation(async () => false);
    const res = await POST(peticion(cuerpo({ accion: 'importar' })));
    expect(res.status).toBe(403);
    expect(hasOrgAdminOrPermission).toHaveBeenCalledWith(sesion, 'crm.leads.create');
    expect(importarBloque).not.toHaveBeenCalled();
  });

  it.each([
    ['organization_id en el body', cuerpo({ organization_id: 121 }), undefined],
    ['orgId en el body', cuerpo({ orgId: '121' }), undefined],
    ['organization_id en la query', cuerpo(), 'http://localhost/api/crm/leads/importar?organization_id=121'],
  ])('%s ajena → 403 y nada se procesa', async (_n, body, url) => {
    const res = await POST(peticion(body, url));
    expect(res.status).toBe(403);
    expect(validarImportacion).not.toHaveBeenCalled();
    expect(importarBloque).not.toHaveBeenCalled();
  });

  it('cuerpo inválido → 400; bloque de importación demasiado grande → 413', async () => {
    expect((await POST(peticion('{no json'))).status).toBe(400);
    expect((await POST(peticion(cuerpo({ opciones: {} })))).status).toBe(400);
    const muchas = Array.from({ length: 60 }, (_, i) => ({ fila: i + 2, campos: { nombre: `T${i}` } }));
    expect((await POST(peticion(cuerpo({ accion: 'importar', filas: muchas })))).status).toBe(413);
    expect(importarBloque).not.toHaveBeenCalled();
  });

  it('validar e importar reciben la organización de la sesión, nunca la del cliente', async () => {
    expect((await POST(peticion(cuerpo()))).status).toBe(200);
    expect(validarImportacion).toHaveBeenCalledWith(
      { organizationId: 120, userId: 'u-1', supabase: sesion.supabase },
      [{ fila: 2, campos: { nombre: 'Tienda Sintética', telefono: '3001234567' } }],
      { lote: 'L1', tipoCliente: 'company', monedaValor: null, pais: 'CO', archivo: null },
    );
    expect((await POST(peticion(cuerpo({ accion: 'importar', organization_id: 120 })))).status).toBe(200);
    expect(importarBloque).toHaveBeenCalledTimes(1);
  });

  it('un error inesperado del servicio → 500 sin filtrar el mensaje interno', async () => {
    validarImportacion.mockImplementationOnce(async () => {
      throw new Error('relation "x" does not exist');
    });
    const res = await POST(peticion(cuerpo()));
    expect(res.status).toBe(500);
    expect((await res.json()).error).not.toMatch(/relation/);
  });
});
