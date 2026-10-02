import { NextRequest } from 'next/server';
import { POST } from '../route';
import { OrgContextError } from '@/lib/utils/orgContextError';
import { getServerOrgContext, requireOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { previewAutomationHistory } from '@/lib/services/crm/automation/automationBulkPreview';
jest.mock('@/lib/utils/orgContext', () => ({ ...jest.requireActual('@/lib/utils/orgContextError'), getServerOrgContext: jest.fn(), requireOrgAdminOrPermission: jest.fn() }));
jest.mock('@/lib/services/crm/automation/automationBulkPreview', () => ({ previewAutomationHistory: jest.fn() }));
const id = '77777777-7777-4777-8777-777777776065';
const call = (body: unknown = {}, query = '') => POST(new NextRequest(`http://localhost/api/crm/automations/${id}/dry-run/bulk${query}`,
  { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getServerOrgContext).mockResolvedValue({ organizationId: 125, userId: id, supabase: {} } as never);
  jest.mocked(requireOrgAdminOrPermission).mockResolvedValue(undefined);
  jest.mocked(previewAutomationHistory).mockResolvedValue({ from: '', until: '', data_basis: 'current_records', total: 0, matched: 0, skipped: 0, unavailable: 0, sample: [] });
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());
test('administración canónica antes de simular, organización sólo de sesión', async () => {
  expect((await call()).status).toBe(200);
  expect(previewAutomationHistory).toHaveBeenCalledWith(id, 125, {});
  jest.mocked(requireOrgAdminOrPermission).mockRejectedValueOnce(new OrgContextError('Sin permiso', 403, 'ADMIN_REQUIRED'));
  expect((await call()).status).toBe(403);
  expect(previewAutomationHistory).toHaveBeenCalledTimes(1);
});
test.each(['organization_id', 'organizationId', 'orgId', 'org_id'])('%s ajena en body/query deniega sin evaluar', async key => {
  expect((await call({ [key]: 999 })).status).toBe(403);
  expect((await call({}, `?${key}=999`)).status).toBe(403);
  expect(previewAutomationHistory).not.toHaveBeenCalled();
});
test.each([{ force: true }, { dry_run: false }, [], null])('no permite mutaciones o cuerpos inválidos %j', async body => {
  expect((await call(body)).status).toBe(400);
  expect(previewAutomationHistory).not.toHaveBeenCalled();
});
test('error real no se convierte en simulación vacía ni expone SQL', async () => {
  jest.mocked(previewAutomationHistory).mockRejectedValueOnce(new Error('SQL privado secreto'));
  const response = await call();
  expect(response.status).toBe(500);
  expect(await response.text()).not.toContain('SQL privado secreto');
});
