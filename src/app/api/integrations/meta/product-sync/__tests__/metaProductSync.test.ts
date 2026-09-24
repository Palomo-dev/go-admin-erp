/// <reference types="jest" />
/**
 * Contrato del sincronizador de catálogo de Meta con `integration_connections`.
 *
 * Bug corregido (2026-09-15): filtraba `.eq('status', 'active')`, valor ajeno al
 * CHECK (`draft|connected|paused|error|revoked`). Toda organización recibía
 * "No hay conexión activa de Meta Marketing" aunque la tuviera `connected`.
 * Ver `src/lib/integrations/connectionStatus.ts`.
 *
 * Desde 2026-09-23 la organización ya no sale del body (regla dura 5): este
 * contrato se ejerce por el camino de sesión (`withOrg`, doblado aquí), donde
 * la organización es la de la sesión y la conexión se busca con su cliente.
 * Los casos de seguridad del camino servidor a servidor viven en
 * `src/__tests__/services/integracionesGoogleAdsYProductSync.test.ts`.
 */

import { makeAdminFake, connectionFixture, connectionId, NON_USABLE_STATUSES, type AdminFake } from '@/lib/integrations/__tests__/integrationConnectionsFake';

const { OrgContextError } = jest.requireActual<typeof import('@/lib/utils/orgContextError')>('@/lib/utils/orgContextError');
const { readOrgBody } = jest.requireActual<typeof import('@/lib/security/organizationBody')>('@/lib/security/organizationBody');

let mockAdmin: AdminFake;
const ORG = 120;
const OTRA_ORG = 121;

jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError,
  readOrgBody,
  hasOrgAdminOrPermission: async () => true,
  withOrg:
    (handler: (ctx: unknown, req: Request, rp: unknown) => Promise<Response>) =>
    (req: Request, rp: unknown) =>
      handler({ organizationId: ORG, userId: 'u-1', roleId: 2, isSuperAdmin: false, supabase: mockAdmin }, req, rp),
}));
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => mockAdmin }));
// svix es ESM puro y Jest (CJS) no lo carga; este contrato no verifica firmas.
jest.mock('svix', () => ({ Webhook: class {} }));

const getCredentials = jest.fn();
jest.mock('@/lib/services/integrations/meta', () => ({
  metaMarketingService: {
    getCredentials: (id: string) => getCredentials(id),
    getProductsForSync: async () => [],
    syncCatalog: async () => ({ total: 0, created: 0, errors: 0 }),
  },
}));

import { POST } from '../route';

const rp = { params: Promise.resolve({}) };

function req(body: unknown) {
  return new Request('http://localhost/api/integrations/meta/product-sync', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as never;
}

const SIN_CONEXION = { success: false, message: 'No hay conexión activa de Meta Marketing para esta organización' };

beforeEach(() => {
  // Credenciales incompletas: la ruta se detiene justo después de haber
  // ENCONTRADO la conexión, que es lo único que este contrato mide.
  getCredentials.mockReset().mockResolvedValue(null);
});

describe('Meta product-sync: busca la conexión por el estado real del CHECK', () => {
  it('encuentra la conexión `connected` de la organización (y no la `active`)', async () => {
    mockAdmin = makeAdminFake({ integration_connections: connectionFixture('meta', 'meta_marketing', ORG, true) });

    const res = await POST(req({}), rp);

    expect(await res.json()).toMatchObject({ success: false, message: expect.stringContaining('Credenciales de Meta incompletas') });
    expect(getCredentials).toHaveBeenCalledTimes(1);
    expect(getCredentials).toHaveBeenCalledWith(connectionId('connected', ORG));
  });

  it.each(NON_USABLE_STATUSES)('no usa una conexión en estado %s', async (status) => {
    mockAdmin = makeAdminFake({
      integration_connections: connectionFixture('meta', 'meta_marketing', ORG, true).filter((r) => r.status === status),
    });

    const res = await POST(req({}), rp);

    expect(await res.json()).toEqual(SIN_CONEXION);
    expect(getCredentials).not.toHaveBeenCalled();
  });

  it('no usa la conexión `connected` de otra organización', async () => {
    mockAdmin = makeAdminFake({ integration_connections: connectionFixture('meta', 'meta_marketing', OTRA_ORG, true) });

    const res = await POST(req({}), rp);

    expect(await res.json()).toEqual(SIN_CONEXION);
    expect(getCredentials).not.toHaveBeenCalled();
  });

  it('el select solo pide columnas reales de integration_connections', async () => {
    mockAdmin = makeAdminFake({ integration_connections: connectionFixture('meta', 'meta_marketing', ORG, true) });
    await POST(req({}), rp);
    expect(mockAdmin.connectionSelects).toHaveLength(1);
    expect(getCredentials).toHaveBeenCalled(); // un 42703 habría dejado `connections` en null
  });
});
