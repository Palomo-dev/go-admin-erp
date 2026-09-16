/// <reference types="jest" />
/**
 * Contrato del sincronizador de catálogo de Meta con `integration_connections`.
 *
 * Bug corregido (2026-09-15): filtraba `.eq('status', 'active')`, valor ajeno al
 * CHECK (`draft|connected|paused|error|revoked`). Toda organización recibía
 * "No hay conexión activa de Meta Marketing" aunque la tuviera `connected`.
 * Ver `src/lib/integrations/connectionStatus.ts`.
 *
 * La ruta se invoca aquí como llamada de servicio (`x-api-key` = service role),
 * que es el camino del trigger de BD. Deuda conocida, fuera de este contrato:
 * `organization_id` viene del body (allow-list del caso 5 de guardrails).
 */

process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-de-prueba';

import { makeAdminFake, connectionFixture, connectionId, NON_USABLE_STATUSES, type AdminFake } from '@/lib/integrations/__tests__/integrationConnectionsFake';

let mockAdmin: AdminFake;
jest.mock('@/lib/supabase/admin', () => ({ getSupabaseAdmin: () => mockAdmin }));

const getCredentials = jest.fn();
jest.mock('@/lib/services/integrations/meta', () => ({
  metaMarketingService: {
    getCredentials: (id: string) => getCredentials(id),
    getProductsForSync: async () => [],
    syncCatalog: async () => ({ total: 0, created: 0, errors: 0 }),
  },
}));

import { POST } from '../route';

const ORG = 120;
const OTRA_ORG = 121;

function req(body: unknown) {
  const headers: Record<string, string> = { 'x-api-key': process.env.SUPABASE_SERVICE_ROLE_KEY as string };
  return { json: async () => body, headers: { get: (k: string) => headers[k.toLowerCase()] ?? null } } as never;
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

    const res = await POST(req({ organization_id: ORG }));

    expect(await res.json()).toMatchObject({ success: false, message: expect.stringContaining('Credenciales de Meta incompletas') });
    expect(getCredentials).toHaveBeenCalledTimes(1);
    expect(getCredentials).toHaveBeenCalledWith(connectionId('connected', ORG));
  });

  it.each(NON_USABLE_STATUSES)('no usa una conexión en estado %s', async (status) => {
    mockAdmin = makeAdminFake({
      integration_connections: connectionFixture('meta', 'meta_marketing', ORG, true).filter((r) => r.status === status),
    });

    const res = await POST(req({ organization_id: ORG }));

    expect(await res.json()).toEqual(SIN_CONEXION);
    expect(getCredentials).not.toHaveBeenCalled();
  });

  it('no usa la conexión `connected` de otra organización', async () => {
    mockAdmin = makeAdminFake({ integration_connections: connectionFixture('meta', 'meta_marketing', OTRA_ORG, true) });

    const res = await POST(req({ organization_id: ORG }));

    expect(await res.json()).toEqual(SIN_CONEXION);
    expect(getCredentials).not.toHaveBeenCalled();
  });

  it('el select solo pide columnas reales de integration_connections', async () => {
    mockAdmin = makeAdminFake({ integration_connections: connectionFixture('meta', 'meta_marketing', ORG, true) });
    await POST(req({ organization_id: ORG }));
    expect(mockAdmin.connectionSelects).toHaveLength(1);
    expect(getCredentials).toHaveBeenCalled(); // un 42703 habría dejado `connections` en null
  });
});
