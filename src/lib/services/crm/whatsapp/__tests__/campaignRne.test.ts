import { createHash } from 'crypto';
import { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { OrgContextError } from '@/lib/utils/orgContextError';

let ctx: ServerOrgContext | null;
let canRead = true;
let canManage = true;
const permissions = jest.fn();
const sessionRpc = jest.fn();
const privateRpc = jest.fn();
const elevated = jest.fn();
jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError: jest.requireActual<typeof import('@/lib/utils/orgContextError')>('@/lib/utils/orgContextError').OrgContextError,
  getServerOrgContext: async () => {
    if (!ctx) throw new OrgContextError('No autenticado', 401, 'UNAUTHENTICATED');
    return ctx;
  },
  hasOrgAdminOrPermission: async (_ctx: unknown, code: string) => {
    permissions(code); return code === 'crm.campaigns.manage' ? canManage : canRead;
  },
  requireOrgAdminOrPermission: async (_ctx: unknown, code: string) => {
    permissions(code);
    if (!canManage) throw new OrgContextError('Sin permiso', 403, 'FORBIDDEN');
  },
}));
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => { elevated(); return { rpc: privateRpc }; } }));
import { GET, POST } from '@/app/api/crm/campaigns/[id]/rne/route';
import { getCampaignCompliance, registerCampaignRne } from '../campaignRneService';
import { classifySendError } from '../campaignBatch';
import { errorWhatsAppDb } from '../erroresDbLogica';
import { MAX_BYTES_ARCHIVO_RNE } from '../../voiceAgent/rne';

const ID = '11111111-1111-4111-8111-111111111111';
const session = { rpc: sessionRpc } as unknown as SupabaseClient;
const service = { rpc: privateRpc } as unknown as SupabaseClient;
const params = { params: Promise.resolve({ id: ID }) };
const url = `http://localhost/api/crm/campaigns/${ID}/rne`;
const check = { id: ID, check_id: ID, checked_at: '2026-10-01T08:00:00Z', valid_until: '2026-10-31T08:00:00Z',
  numbers_in_file: 1, checked_targets: 1, excluded_targets: 1, skipped_contacts: 1 };
const compliance = { data_policy_url: 'https://example.invalid/politica', data_policy_valid: true, rne: check,
  rne_current: true, allowed: true, reason: null };
const post = (body: unknown, query = '') => POST(new NextRequest(url + query, {
  method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' },
}), params);
const audience = (length = 1) => Array.from({ length }, (_, i) => ({ customer_id: `customer-${i}`,
  customer: { id: `customer-${i}`, phone: '3001234567' } }));

beforeEach(() => {
  jest.clearAllMocks(); canRead = true; canManage = true;
  ctx = { organizationId: 7, userId: 'actor', supabase: session } as ServerOrgContext;
  sessionRpc.mockResolvedValue({ data: { data: audience(), total: 1 }, error: null });
  privateRpc.mockResolvedValue({ data: check, error: null });
});

test('importa toda la audiencia de 6.002 contactos con teléfonos leídos y parser compartido', async () => {
  sessionRpc.mockResolvedValue({ data: { data: audience(6002), total: 6002 }, error: null });
  privateRpc.mockResolvedValue({ data: { ...check, checked_targets: 6002, excluded_targets: 6002, skipped_contacts: 6002 }, error: null });
  const contenido = 'telefono;fecha\n3001234567;2026-09-30\n+57 300 123 4567\n1234567';
  const response = await post({ organization_id: 7, contenido, nombre_archivo: 'rne.csv' });
  expect(response.status).toBe(200);
  expect(permissions).toHaveBeenCalledWith('crm.campaigns.manage');
  expect(sessionRpc).toHaveBeenCalledTimes(1);
  expect(sessionRpc).toHaveBeenCalledWith('crm_campaign_contacts_export', { p_org: 7, p_campaign: ID, p_state: null, p_q: null });
  expect(privateRpc).toHaveBeenCalledTimes(1);
  const [name, args] = privateRpc.mock.calls[0];
  expect(name).toBe('crm_register_campaign_rne');
  expect(args).toMatchObject({ p_org: 7, p_campaign: ID, p_actor: 'actor', p_days: 30, p_file: 'rne.csv',
    p_numbers: ['+573001234567'], p_sha256: createHash('sha256').update(contenido).digest('hex') });
  expect(args.p_excluded).toHaveLength(6002);
  expect(args.p_excluded[6001]).toEqual({ customer_id: 'customer-6001', phone: '3001234567', phone_e164: '+573001234567' });
  expect((await response.json()).data.descartados).toBe(1);
});

test('sin sesión, permiso o con organización ajena nunca eleva ni importa', async () => {
  const saved = ctx;
  ctx = null; expect((await post({ contenido: '3001234567' })).status).toBe(401);
  ctx = saved; canManage = false; expect((await post({ contenido: '3001234567' })).status).toBe(403);
  canManage = true; expect((await post({ contenido: '3001234567', organization_id: 999 })).status).toBe(403);
  expect((await post({ contenido: '3001234567' }, '?org_id=999')).status).toBe(403);
  expect(elevated).not.toHaveBeenCalled(); expect(sessionRpc).not.toHaveBeenCalled(); expect(privateRpc).not.toHaveBeenCalled();
});

test('consulta privada pasa por sesión y permiso de lectura, y devuelve permiso de gestión separado', async () => {
  sessionRpc.mockResolvedValue({ data: compliance, error: null }); canManage = false;
  const response = await GET(new NextRequest(url), params);
  expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toContain('no-store');
  expect(await response.json()).toEqual({ data: compliance, puede_verificar: false, vigencia_dias: 30 });
  expect(sessionRpc).toHaveBeenCalledWith('crm_campaign_compliance_status', { p_org: 7, p_campaign: ID });
  expect(elevated).not.toHaveBeenCalled();
  sessionRpc.mockClear(); canRead = false;
  expect((await GET(new NextRequest(url), params)).status).toBe(403);
  expect(sessionRpc).not.toHaveBeenCalled();
});

test('archivo inválido o sin números no lee audiencia ni escribe constancias', async () => {
  expect((await post({ contenido: 'telefono\n2026-09-30' })).status).toBe(400);
  expect((await post({ contenido: ' ' })).status).toBe(400);
  expect((await post({ contenido: 123 })).status).toBe(400);
  const invalid = new NextRequest(url, { method: 'POST', body: '{', headers: { 'Content-Type': 'application/json' } });
  expect((await POST(invalid, params)).status).toBe(400);
  expect(sessionRpc).not.toHaveBeenCalled(); expect(privateRpc).not.toHaveBeenCalled();
});

test('límite de bytes se aplica también sin Content-Length', async () => {
  expect((await post({ contenido: '3'.repeat(MAX_BYTES_ARCHIVO_RNE + 1) })).status).toBe(413);
  expect((await post({ contenido: '3'.repeat(MAX_BYTES_ARCHIVO_RNE * 2 + 1) })).status).toBe(413);
  expect(sessionRpc).not.toHaveBeenCalled(); expect(privateRpc).not.toHaveBeenCalled();
});

test('audiencia incompleta o cliente discordante falla antes de importar', async () => {
  sessionRpc.mockResolvedValue({ data: { data: audience(), total: 6002 }, error: null });
  expect((await post({ contenido: '3001234567' })).status).toBe(500);
  sessionRpc.mockResolvedValue({ data: { data: [{ customer_id: 'a', customer: { id: 'b', phone: '3001234567' } }], total: 1 }, error: null });
  expect((await post({ contenido: '3001234567' })).status).toBe(500);
  expect(privateRpc).not.toHaveBeenCalled();
});

test('exclusión vacía se envía como arreglo vacío y conserva la constancia', async () => {
  privateRpc.mockResolvedValue({ data: { ...check, excluded_targets: 0, skipped_contacts: 0 }, error: null });
  expect((await post({ contenido: '+14155552671' })).status).toBe(200);
  expect(privateRpc.mock.calls[0][1].p_excluded).toEqual([]);
});

test('errores CAS y lectura se propagan; respuestas malformadas no acreditan verificación', async () => {
  privateRpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'audiencia_rne_modificada' } });
  expect((await post({ contenido: '3001234567' })).status).toBe(409);
  privateRpc.mockResolvedValue({ data: {}, error: null });
  expect((await post({ contenido: '3001234567' })).status).toBe(500);
  sessionRpc.mockResolvedValue({ data: { ...compliance, allowed: true, rne_current: false }, error: null });
  await expect(getCampaignCompliance(7, ID, session)).rejects.toMatchObject({ code: 'INTERNAL' });
  sessionRpc.mockResolvedValue({ data: null, error: { code: 'P0002', message: 'campana_no_encontrada' } });
  await expect(registerCampaignRne(7, ID, 'actor', { nombre: null, contenido: '3001234567' }, session, service)).rejects.toMatchObject({ status: 404 });
});

test.each([['rne_required', 'RNE_REQUIRED'], ['data_policy_required', 'DATA_POLICY_REQUIRED']] as const)(
  '%s pausa el lote en vez de consumir intentos de preparación', (message, code) => {
    const error = errorWhatsAppDb({ code: 'P0001', message });
    expect(error).toMatchObject({ code, status: 409 });
    expect(classifySendError(error, 1)).toEqual({ action: 'pause', reason: code.toLowerCase() });
    expect(errorWhatsAppDb({ code: 'P0001', message: `contacto_bloqueado:${message}` }).code).toBe(code);
  },
);
