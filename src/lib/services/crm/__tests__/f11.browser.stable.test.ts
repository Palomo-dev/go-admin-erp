/// <reference types="jest" />
import { healthScoreService } from '../healthScoreService';
import { ErrorApiCrm } from '@/components/crm/acciones/apiCrm';
jest.mock('@/lib/supabase/config', () => ({ get supabase() { throw new Error('El navegador no debe consultar Supabase'); } }));
const score = { customer_id: 'cliente-prueba', score: 22, band: 'red' };
const detail = { health: score, history: [{ id: 'medicion-prueba', score: 22 }], invoice_count: 1, history_error: false };
const response = (data: unknown, status = 200) => ({ ok: status < 400, status, json: async () => ({ success: status < 400, data, code: status === 403 ? 'sin_permiso' : undefined }) });
let fetchMock: jest.Mock;
beforeEach(() => { fetchMock = jest.fn(async (url: string) => response(url === '/api/crm/health' ? { scores: [score] } : detail)); global.fetch = fetchMock; });
afterEach(() => jest.restoreAllMocks());
test('lista, detalle, historial y conteo usan únicamente las rutas con sesión y preservan el puntaje calculado', async () => {
  expect(await healthScoreService.getAllHealthScores(999)).toEqual([score]);
  expect(await healthScoreService.getCustomerHealthScore('cliente-prueba')).toEqual(score);
  expect(await healthScoreService.getHealthHistory('cliente-prueba', 20)).toEqual(detail.history);
  expect(await healthScoreService.countInvoices('cliente-prueba', 999)).toBe(1);
  expect(fetchMock.mock.calls.map(call => call[0])).toEqual(['/api/crm/health', '/api/crm/health/cliente-prueba?limit=30', '/api/crm/health/cliente-prueba?limit=20', '/api/crm/health/cliente-prueba?limit=30']);
  for (const [, init] of fetchMock.mock.calls) expect(init).toMatchObject({ method: 'GET', credentials: 'same-origin', cache: 'no-store' });
});
test('recálculo encola por POST y medir sigue el writer servidor', async () => {
  fetchMock.mockImplementation(async (url: string) => response(url.endsWith('/snapshot') ? { score: 22, snapshot_written: true } : { queued: true, event_id: 'evento-prueba' }));
  expect(await healthScoreService.refreshAllHealthScores()).toEqual({ queued: true, event_id: 'evento-prueba' });
  expect(await healthScoreService.snapshotHealthScore('cliente/prueba')).toMatchObject({ score: 22, snapshot_written: true });
  expect(fetchMock.mock.calls.map(call => call[0])).toEqual(['/api/crm/health/refresh', '/api/crm/health/cliente%2Fprueba/snapshot']);
  expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST', body: '{}' });
});
test.each([403, 500])('un HTTP %s no se convierte en lista, puntaje ni conteo vacío', async status => {
  fetchMock.mockResolvedValue(response(null, status));
  await expect(healthScoreService.getAllHealthScores()).rejects.toBeInstanceOf(ErrorApiCrm);
  await expect(healthScoreService.getCustomerHealthScore('cliente-prueba')).rejects.toMatchObject({ status });
  await expect(healthScoreService.countInvoices('cliente-prueba')).rejects.toMatchObject({ status });
});
test('un fallo de red conserva un error explícito', async () => {
  fetchMock.mockRejectedValue(new Error('network unavailable'));
  await expect(healthScoreService.getHealthHistory('cliente-prueba')).rejects.toMatchObject({ status: 0, codigo: 'red' });
});
