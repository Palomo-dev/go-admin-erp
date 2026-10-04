import { NextRequest } from 'next/server';
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import type { SupabaseClient } from '@supabase/supabase-js';
import { OrgContextError } from '@/lib/utils/orgContextError';
import type { CampaignContact } from '../types';

let ctx: ServerOrgContext | null;
let allowed = true;
const rpc = jest.fn();
const permission = jest.fn();
const timezone = jest.fn<Promise<string>, unknown[]>(async () => 'Pacific/Auckland');
jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError: jest.requireActual<typeof import('@/lib/utils/orgContextError')>('@/lib/utils/orgContextError').OrgContextError,
  getServerOrgContext: async () => {
    if (!ctx) throw new OrgContextError('No autenticado', 401, 'UNAUTHENTICATED');
    return ctx;
  },
  hasOrgAdminOrPermission: async (_ctx: unknown, code: string) => { permission(code); return allowed; },
}));
jest.mock('@/lib/services/organizationTimezoneService', () => ({ getOrganizationTimezone: (...args: unknown[]) => timezone(...args) }));
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => { throw new Error('No elevar lectura'); } }));
import { GET } from '@/app/api/crm/campaigns/[id]/contacts/route';
import { contactsToCsv, exportCampaignContacts, getCampaignStats, listCampaignContacts } from '../campaignService';

const ID = '11111111-1111-4111-8111-111111111111';
const sb = { rpc } as unknown as SupabaseClient;
const row = (name = 'Fixture'): CampaignContact => ({
  id: ID, campaign_id: ID, customer_id: ID, state: 'sent', metadata: { state: 'delivered', delivered_at: '2026-09-01T23:34:45Z' },
  sent_at: '2026-09-01T23:34:45Z', replied_at: null, customer: { id: ID, full_name: name, first_name: name, email: 'fixture@example.invalid', phone: '+12025550198' },
} as CampaignContact);
const request = (query = '') => GET(new NextRequest(`http://localhost/api/crm/campaigns/${ID}/contacts?${query}`), { params: Promise.resolve({ id: ID }) });
beforeEach(() => {
  allowed = true; rpc.mockReset(); permission.mockClear(); timezone.mockClear();
  rpc.mockResolvedValue({ data: { data: [], total: 0 }, error: null });
  ctx = { organizationId: 7, userId: 'actor', supabase: sb } as ServerOrgContext;
});

test('CSV exporta más de 500 contactos sin usar paginación, con zona propia y celdas seguras', async () => {
  const data = Array.from({ length: 1605 }, (_, i) => row(`Fixture ${i}`));
  data[1604] = row('=HYPERLINK("https://example.invalid")');
  rpc.mockResolvedValue({ data: { data, total: 1605 }, error: null });
  const response = await request('export=csv&state=delivered&q=Fixture&page=9&pageSize=1');
  expect(response.status).toBe(200);
  expect(permission).toHaveBeenCalledWith('crm.opportunities.view');
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(rpc).toHaveBeenCalledWith('crm_campaign_contacts_export', { p_org: 7, p_campaign: ID, p_state: 'delivered', p_q: 'Fixture' });
  expect(timezone).toHaveBeenCalledWith(7, sb);
  const csv = await response.text();
  expect(csv.split('\r\n')).toHaveLength(1606);
  expect(csv).toContain('Fixture 1603');
  expect(csv).toContain("'=HYPERLINK");
  expect(csv).toContain('2/9/26');
  expect(csv).toContain("'+12025550198");
});

test('página conserva el total completo y transmite búsqueda/estado al servidor SQL', async () => {
  rpc.mockResolvedValue({ data: { data: [row()], total: 25000 }, error: null });
  const response = await request('state=delivered&q=literal_%25&page=50&pageSize=500');
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ data: [row()], total: 25000 });
  expect(rpc).toHaveBeenCalledWith('crm_campaign_contacts_page', { p_org: 7, p_campaign: ID, p_state: 'delivered', p_q: 'literal_%', p_page: 50, p_size: 500 });
  expect(timezone).not.toHaveBeenCalled();
});

test('sesión, permiso y organización discordante fallan antes de consultar', async () => {
  const saved = ctx;
  ctx = null; expect((await request('export=csv')).status).toBe(401);
  ctx = saved; allowed = false; expect((await request()).status).toBe(403);
  allowed = true; expect((await request('organization_id=999&export=csv')).status).toBe(403);
  expect(rpc).not.toHaveBeenCalled();
});

test('fallo o exportación recortada no entrega un CSV aparentemente completo', async () => {
  rpc.mockResolvedValue({ data: { data: [row()], total: 1605 }, error: null });
  expect((await request('export=csv')).status).toBe(500);
  rpc.mockResolvedValue({ data: null, error: { code: 'P0002', message: 'campana_no_encontrada' } });
  expect((await request('export=csv')).status).toBe(404);
  rpc.mockResolvedValue({ data: null, error: { message: 'Fixture lectura fallida' } });
  expect((await request()).status).toBe(500);
  expect(timezone).not.toHaveBeenCalled();
});

test('estadísticas mantienen precio desconocido y total completo del contrato SQL', async () => {
  const data = { counts: { total: 25000, cost: 2 }, timeline: [], by_error_code: {}, by_skip_reason: {}, estimated_cost: 3,
    actual_cost: null, known_actual_cost: 2, actual_cost_complete: false, unpriced_contacts: 1 };
  rpc.mockResolvedValue({ data, error: null });
  expect(await getCampaignStats(7, ID, sb)).toEqual(data);
  expect(rpc).toHaveBeenCalledWith('crm_campaign_contact_stats', { p_org: 7, p_campaign: ID });
  rpc.mockResolvedValue({ data: null, error: { message: 'Fixture cifras fallidas' } });
  await expect(getCampaignStats(7, ID, sb)).rejects.toMatchObject({ code: 'INTERNAL' });
});

test('resultados vacíos válidos conservan cabecera; resultados inválidos fallan', async () => {
  expect((await listCampaignContacts(7, ID, {}, sb)).total).toBe(0);
  expect((await exportCampaignContacts(7, ID, {}, sb)).data).toEqual([]);
  expect(contactsToCsv([], 'Pacific/Auckland')).toContain('cliente;telefono;email;estado');
  rpc.mockResolvedValue({ data: { data: [], total: -1 }, error: null });
  await expect(listCampaignContacts(7, ID, {}, sb)).rejects.toMatchObject({ code: 'INTERNAL' });
  rpc.mockResolvedValue({ data: { counts: {} }, error: null });
  await expect(getCampaignStats(7, ID, sb)).rejects.toMatchObject({ code: 'INTERNAL' });
});
