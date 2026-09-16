/// <reference types="jest" />
/**
 * FASE-16 · ronda 4 · F-4: el indicativo por defecto se guarda POR LA API.
 *
 * `zSettingsBody` ya admitía `default_country_code`, pero el `PUT` de ajustes
 * no lo copiaba al `patch`: la organización podía mandarlo y se perdía en
 * silencio, con lo que «sacar el 57 a configuración» quedaba a medias — la
 * cascada org → entorno → último recurso caía siempre en los dos últimos.
 *
 * Reversión que muerde: quitar la línea `patch.default_country_code = …` de
 * `src/app/api/crm/whatsapp/settings/route.ts`.
 */
import { fakeTable, type Row } from '@/lib/services/crm/whatsapp/__tests__/fakeTable';
import { makeSupabase } from '@/lib/services/crm/whatsapp/__tests__/mockSupabase';

jest.mock('@/lib/utils/orgContext', () => ({
  getServerOrgContext: async () => ({ organizationId: 7, userId: 'user-1', memberId: 3, role: 'admin', supabase: {} }),
  requireOrgAdmin: () => undefined,
  requireOrgAdminOrPermission: async () => undefined, // F0-SEC r2: withWhatsAppRoute({ admin }) usa la variante con permiso
  isOrgAdminContext: () => true,
  OrgContextError: class OrgContextError extends Error { code = 'X'; statusCode = 401; },
}));

let configs: Row[] = [];
let tabla = fakeTable([]);
jest.mock('@/lib/supabase/server-service', () => ({
  getServiceClient: () => makeSupabase({ provider_configs: (ops, call) => tabla.resolver(ops, call) }).sb,
}));

import { PUT } from '../route';

const put = (body: Record<string, unknown>) => PUT({ json: async () => body } as never, { params: Promise.resolve({}) });

beforeEach(() => {
  configs = [{ id: 'pc-1', organization_id: 7, category: 'whatsapp', provider: 'meta', priority: 1, settings: { daily_limit: 100 } }];
  tabla = fakeTable(configs);
});

describe('F16 r4 · F-4 · PUT /api/crm/whatsapp/settings guarda default_country_code', () => {
  it('«52» queda en provider_configs.settings y vuelve en la respuesta', async () => {
    const res = await put({ default_country_code: '52' });
    expect(res.status).toBe(200);
    const body = await res.json() as { settings: { default_country_code: string | null; daily_limit: number | null } };
    expect(body.settings.default_country_code).toBe('52');
    expect(body.settings.daily_limit).toBe(100); // no pisa el resto
    expect((tabla.rows[0].settings as Record<string, unknown>).default_country_code).toBe('52');
  });

  it('`null` lo borra (vuelve a la variable de entorno / último recurso)', async () => {
    (tabla.rows[0].settings as Record<string, unknown>).default_country_code = '52';
    const res = await put({ default_country_code: null });
    expect(res.status).toBe(200);
    expect((await res.json() as { settings: { default_country_code: string | null } }).settings.default_country_code).toBeNull();
  });

  it('«+57» y «co» se rechazan con 400', async () => {
    for (const malo of ['+57', 'co']) {
      const res = await put({ default_country_code: malo });
      expect(res.status).toBe(400);
    }
  });

  it('un PUT sin ese campo NO lo toca', async () => {
    (tabla.rows[0].settings as Record<string, unknown>).default_country_code = '52';
    await put({ daily_limit: 50 });
    expect((tabla.rows[0].settings as Record<string, unknown>).default_country_code).toBe('52');
  });
});
