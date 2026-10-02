import { NextRequest } from 'next/server';
import { GET } from '../route';
import { getServerOrgContext, hasOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { OrgContextError } from '@/lib/utils/orgContextError';
import { readMergeHistoryExport } from '@/lib/services/crm/customerMergeHistory';

jest.mock('@/lib/utils/orgContext', () => ({ ...jest.requireActual('@/lib/utils/orgContextError'), getServerOrgContext: jest.fn(), hasOrgAdminOrPermission: jest.fn() }));
jest.mock('@/lib/services/crm/customerMergeHistory', () => ({ readMergeHistoryExport: jest.fn() }));
jest.mock('@/lib/services/organizationTimezoneService', () => ({ getOrganizationTimezone: jest.fn(async () => 'Asia/Kathmandu') }));
jest.mock('next-intl/server', () => ({ getTranslations: jest.fn(async () => Object.assign((key: string) => key, { has: () => true })) }));
const request = (query = '') => new NextRequest(`http://localhost/api/crm/customer-merges/export${query}`);

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getServerOrgContext).mockResolvedValue({ organizationId: 125, userId: 'actor', supabase: {} } as never);
  jest.mocked(hasOrgAdminOrPermission).mockResolvedValue(true);
  jest.mocked(readMergeHistoryExport).mockResolvedValue([]);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

test('sesión y permiso canónico se comprueban antes de leer', async () => {
  jest.mocked(getServerOrgContext).mockRejectedValueOnce(new OrgContextError('Sin sesión', 401, 'UNAUTHENTICATED'));
  expect((await GET(request())).status).toBe(401);
  jest.mocked(hasOrgAdminOrPermission).mockResolvedValue(false);
  expect((await GET(request())).status).toBe(403);
  expect(readMergeHistoryExport).not.toHaveBeenCalled();
});

test.each(['organization_id', 'organizationId', 'orgId', 'org_id'])('organización ajena en %s da 403 sin leer', async key => {
  expect((await GET(request(`?${key}=999`))).status).toBe(403);
  expect(readMergeHistoryExport).not.toHaveBeenCalled();
});

test('valida idioma y no expone errores SQL privados', async () => {
  expect((await GET(request('?locale=otro'))).status).toBe(400);
  jest.mocked(readMergeHistoryExport).mockRejectedValueOnce({ code: 'XX000', message: 'SQL privado secreto' });
  const response = await GET(request());
  expect(response.status).toBe(500);
  expect(await response.text()).not.toContain('SQL privado secreto');
});

test('CSV neutraliza fórmulas y utiliza la zona de organización', async () => {
  jest.mocked(readMergeHistoryExport).mockResolvedValueOnce([{ id: 'fusion', primary_customer_id: 'principal', secondary_customer_id: 'secundario', merged_at: '2026-10-01T22:30:00Z', merged_by: 'actor', undone_at: null, undone_by: null,
    principal: { full_name: '=2+2' }, secundario: { full_name: 'Persona sintética' }, autor: null, moved_counts: [{ table: 'calls', count: 2 }] }]);
  const response = await GET(request('?locale=es'));
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  const text = await response.text();
  expect(text).toContain("'=2+2");
  expect(text).toContain('02/10/2026');
  expect(text).toContain('04:15');
});
