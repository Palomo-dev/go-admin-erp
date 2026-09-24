/**
 * Rutas del motor:
 * - GET /api/documentos/[tipo]/[id]: sesión, organización de la query ajena →
 *   403, tipo/formato/papel inválidos, HTML con CSP y nonce, PDF en línea o
 *   adjunto, 503 cuando no hay Chromium.
 * - POST /api/facturas-venta/[id]/pdf (compatibilidad): el cuerpo se IGNORA
 *   (importes de la base), organización ajena en el cuerpo → 403, la copia va
 *   al bucket privado con la organización de la sesión y responde URL firmada.
 */
import { OrgContextError } from '@/lib/utils/orgContextError';
import { fakeSupabase } from './fakeSupabase';

const ORG = 7;
const F1 = '11111111-1111-4111-8111-111111111111';
let supabase = fakeSupabase({});

jest.mock('@/lib/utils/orgContext', () => {
  const real = jest.requireActual('@/lib/security/organizationBody');
  const { OrgContextError: Error403 } = jest.requireActual('@/lib/utils/orgContextError');
  return {
    OrgContextError: Error403,
    readOrgBody: real.readOrgBody,
    hasOrgAdminOrPermission: jest.fn(async () => true),
    getServerOrgContext: jest.fn(async () => ({ userId: 'u-1', organizationId: 7, roleId: 2, isSuperAdmin: false, supabase })),
  };
});
jest.mock('@/lib/services/monedaOrganizacion', () => ({
  resolverContextoMoneda: jest.fn(async (_db: unknown, _org: number, doc?: string | null) => {
    const { contextoMoneda } = jest.requireActual('@/lib/utils/moneda');
    return contextoMoneda((doc ?? '').trim() || 'COP', { locale: 'es-CO' });
  }),
}));
const generarPdf = jest.fn<Promise<Uint8Array>, [string, string]>(async () => new Uint8Array([37, 80, 68, 70]));
jest.mock('@/lib/documents/server/pdf', () => {
  const real = jest.requireActual('@/lib/documents/server/pdf');
  return { ErrorPdfNoDisponible: real.ErrorPdfNoDisponible, generarPdf: (html: string, papel: string) => generarPdf(html, papel) };
});
const guardarCopiaPrivada = jest.fn(async (org: number, tipo: string, id: string) => ({ ruta: `${org}/${tipo}/${id}.pdf`, urlFirmada: 'https://firmada.example/x?token=t', expiraEnSegundos: 300 }));
jest.mock('@/lib/documents/server/almacen', () => ({
  guardarCopiaPrivada: (org: number, tipo: string, id: string) => guardarCopiaPrivada(org, tipo, id),
}));

import { GET } from '@/app/api/documentos/[tipo]/[id]/route';
import { POST } from '@/app/api/facturas-venta/[id]/pdf/route';
import { ErrorPdfNoDisponible } from '@/lib/documents/server/pdf';

function tablas() {
  return {
    organizations: [{ id: ORG, name: 'Mi empresa', timezone: 'America/Bogota' }],
    invoice_sales: [
      { id: F1, organization_id: ORG, branch_id: null, number: 'FV-1', issue_date: '2026-09-24T15:00:00Z', currency: 'COP', subtotal: 1000, tax_total: 0, total: 1000, balance: 0, status: 'paid', document_type: null, customer: null, items: [] },
    ],
    payments: [],
    profiles: [{ id: 'u-1', preferred_language: 'en' }],
  };
}

const params = (tipo: string, id: string) => ({ params: Promise.resolve({ tipo, id }) });
const get = (url: string, tipo = 'factura-venta', id = F1) => GET(new Request(`http://localhost${url}`), params(tipo, id));

beforeEach(() => {
  supabase = fakeSupabase(tablas());
  generarPdf.mockClear();
  guardarCopiaPrivada.mockClear();
});

describe('GET /api/documentos/[tipo]/[id]', () => {
  it('HTML: CSP sin red con nonce, sin caché y en el idioma del perfil', async () => {
    const res = await get(`/api/documentos/factura-venta/${F1}?formato=html&imprimir=1`);
    expect(res.status).toBe(200);
    const csp = res.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("default-src 'none'");
    const nonce = /nonce-([^']+)'/.exec(csp)?.[1];
    const html = await res.text();
    expect(html).toContain(`<script nonce="${nonce}">`);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(html).toContain('Sales invoice');
  });

  it('una organización ajena en la query → 403 FOREIGN_ORGANIZATION', async () => {
    const res = await get(`/api/documentos/factura-venta/${F1}?formato=html&organization_id=999`);
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('FOREIGN_ORGANIZATION');
  });

  it('tipo desconocido 404; formato o papel inválidos 400; id ajeno o inexistente 404', async () => {
    expect((await get('/api/documentos/x/y?formato=html', 'nomina', F1)).status).toBe(404);
    expect((await get(`/api/documentos/factura-venta/${F1}?formato=docx`)).status).toBe(400);
    expect((await get(`/api/documentos/factura-venta/${F1}?papel=oficio`)).status).toBe(400);
    expect((await get('/api/documentos/factura-venta/otro?formato=html', 'factura-venta', '22222222-2222-4222-8222-222222222222')).status).toBe(404);
  });

  it('PDF en línea o adjunto, con nombre de archivo seguro', async () => {
    const enLinea = await get(`/api/documentos/factura-venta/${F1}?idioma=es`);
    expect(enLinea.status).toBe(200);
    expect(enLinea.headers.get('content-type')).toBe('application/pdf');
    expect(enLinea.headers.get('content-disposition')).toBe('inline; filename="Factura_de_venta_FV-1.pdf"');
    const adjunto = await get(`/api/documentos/factura-venta/${F1}?descargar=1`);
    expect(adjunto.headers.get('content-disposition')).toMatch(/^attachment;/);
    expect(generarPdf).toHaveBeenCalledWith(expect.stringContaining('FV-1'), 'carta');
  });

  it('sin Chromium → 503 PDF_NO_DISPONIBLE', async () => {
    generarPdf.mockRejectedValueOnce(new ErrorPdfNoDisponible('sin navegador'));
    const res = await get(`/api/documentos/factura-venta/${F1}`);
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe('PDF_NO_DISPONIBLE');
  });

  it('un error de contexto de la sesión se respeta (401)', async () => {
    const { getServerOrgContext } = jest.requireMock('@/lib/utils/orgContext') as { getServerOrgContext: jest.Mock };
    getServerOrgContext.mockRejectedValueOnce(new OrgContextError('No hay sesión activa', 401, 'UNAUTHENTICATED'));
    expect((await get(`/api/documentos/factura-venta/${F1}`)).status).toBe(401);
  });
});

describe('POST /api/facturas-venta/[id]/pdf (compatibilidad)', () => {
  const post = (cuerpo: unknown) =>
    POST(new Request(`http://localhost/api/facturas-venta/${F1}/pdf`, { method: 'POST', body: JSON.stringify(cuerpo), headers: { 'Content-Type': 'application/json' } }), { params: Promise.resolve({ id: F1 }) });

  it('ignora los importes del cuerpo, guarda en privado con la organización de la sesión y responde URL firmada', async () => {
    const res = await post({ total: 1, number: 'FALSO', customer: { full_name: 'Otro' } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: 'https://firmada.example/x?token=t', expiresIn: 300 });
    const html = generarPdf.mock.calls[0][0];
    expect(html).toContain('FV-1');
    expect(html).not.toContain('FALSO');
    expect(guardarCopiaPrivada).toHaveBeenCalledWith(ORG, 'factura-venta', F1);
  });

  it('una organización ajena en el cuerpo → 403 y no se genera nada', async () => {
    const res = await post({ organization_id: 999 });
    expect(res.status).toBe(403);
    expect(generarPdf).not.toHaveBeenCalled();
    expect(guardarCopiaPrivada).not.toHaveBeenCalled();
  });
});
