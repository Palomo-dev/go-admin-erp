import { NextRequest } from 'next/server';
import { POST } from '../route';
import { OrgContextError } from '@/lib/utils/orgContextError';
import { getServerOrgContext, requireOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { executeAutomationRule, testRunAutomationRule } from '@/lib/services/crm/automationService';
jest.mock('@/lib/utils/orgContext', () => ({ ...jest.requireActual('@/lib/utils/orgContextError'), getServerOrgContext: jest.fn(), requireOrgAdminOrPermission: jest.fn() }));
jest.mock('@/lib/services/crm/automationService', () => ({ testRunAutomationRule: jest.fn(), executeAutomationRule: jest.fn() }));
const id = '77777777-7777-4777-8777-777777776064';
const request = (body: unknown = {}, query = '') => new NextRequest(`http://localhost/api/crm/automations/${id}/dry-run${query}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const call = (body: unknown = {}, query = '', rule = id) => POST(request(body, query), { params: Promise.resolve({ id: rule }) });
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getServerOrgContext).mockResolvedValue({ organizationId: 125, userId: id, supabase: {} } as never);
  jest.mocked(requireOrgAdminOrPermission).mockResolvedValue(undefined);
  jest.mocked(testRunAutomationRule).mockResolvedValue({ matched: false, skip_reason: 'conditions_not_met', trace: [], actions_plan: [] });
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());
test('reutiliza simulación canónica, con datos y organización de sesión', async () => {
  const response = await call({ opportunity_id: id });
  expect(response.status).toBe(200);
  expect(testRunAutomationRule).toHaveBeenCalledWith(id, 125, id, {});
  expect(executeAutomationRule).not.toHaveBeenCalled();
});
test('sin sesión/administración deniega antes de leer la regla', async () => {
  jest.mocked(getServerOrgContext).mockRejectedValueOnce(new OrgContextError('Sin sesión', 401, 'UNAUTHENTICATED'));
  expect((await call()).status).toBe(401);
  jest.mocked(requireOrgAdminOrPermission).mockRejectedValueOnce(new OrgContextError('Sin permiso', 403, 'ADMIN_REQUIRED'));
  expect((await call()).status).toBe(403);
  expect(testRunAutomationRule).not.toHaveBeenCalled();
});
test.each(['organization_id', 'organizationId', 'orgId', 'org_id'])('rechaza %s ajena en body/query antes de evaluar', async key => {
  expect((await call({ [key]: 999 })).status).toBe(403);
  expect((await call({}, `?${key}=999`)).status).toBe(403);
  expect(testRunAutomationRule).not.toHaveBeenCalled();
});
test.each([{ force: true }, { dry_run: false }, { opportunity_id: 'ajeno' }, { customer_id: id }, []])('la simulación no acepta rutas a ejecución ni payload inválido %j', async body => {
  expect((await call(body)).status).toBe(400);
  expect(testRunAutomationRule).not.toHaveBeenCalled();
  expect(executeAutomationRule).not.toHaveBeenCalled();
});
test('id inválido, regla ajena y fallo SQL conservan estados reales sin detalles privados', async () => {
  expect((await call({}, '', 'no-uuid')).status).toBe(400);
  jest.mocked(testRunAutomationRule).mockRejectedValueOnce(new Error('Regla de automatización no encontrada'));
  expect((await call()).status).toBe(404);
  jest.mocked(testRunAutomationRule).mockRejectedValueOnce(new Error('SQL privado secreto'));
  const response = await call();
  expect(response.status).toBe(500);
  expect(await response.text()).not.toContain('SQL privado secreto');
});
