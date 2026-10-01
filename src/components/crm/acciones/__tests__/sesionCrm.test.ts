/** @jest-environment jsdom */
import { ErrorApiCrm, claveError, pedirCrm } from '../apiCrm';
import { ensureSessionSynced } from '@/lib/supabase/config';
jest.mock('@/lib/supabase/config', () => ({ ensureSessionSynced: jest.fn() }));
const sync = ensureSessionSynced as jest.Mock;
const body = { title: 'Reunión de prueba', customer_id: 'fixture' };
const response = (status: number, code?: string) => ({ status, ok: status >= 200 && status < 300,
  json: async () => ({ success: status < 400, code, ...(status < 400 ? { data: { id: 'event' } } : { error: 'Rechazado' }) }) }) as Response;
beforeEach(() => { sync.mockReset(); global.fetch = jest.fn(); });

test('resincroniza una sola vez el 401 anterior a la escritura y conserva el formulario enviado', async () => {
  sync.mockResolvedValue(true);
  jest.mocked(fetch).mockResolvedValueOnce(response(401, 'UNAUTHENTICATED')).mockResolvedValueOnce(response(201));
  expect(await pedirCrm('/api/crm/meetings', { method: 'POST', cuerpo: body })).toMatchObject({ data: { id: 'event' } });
  expect(sync).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledTimes(2);
  for (const [, init] of jest.mocked(fetch).mock.calls) expect(init).toMatchObject({ method: 'POST', body: JSON.stringify(body), credentials: 'same-origin' });
});
test('si la sesión sigue ausente no entra en bucle ni informa falta de permiso', async () => {
  sync.mockResolvedValue(true);
  jest.mocked(fetch).mockResolvedValue(response(401, 'UNAUTHENTICATED'));
  try { await pedirCrm('/api/crm/meetings', { method: 'POST', cuerpo: body }); throw new Error('Debía rechazar'); }
  catch (e) { expect(claveError(e)).toBe('sesionVencida'); }
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(sync).toHaveBeenCalledTimes(1);
});
test.each([403, 409, 500])('HTTP %s no repite escrituras ni resincroniza la sesión', async status => {
  jest.mocked(fetch).mockResolvedValue(response(status, 'sin_permiso'));
  await expect(pedirCrm('/api/crm/meetings', { method: 'POST', cuerpo: body })).rejects.toMatchObject({ status });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(sync).not.toHaveBeenCalled();
});
test('401 sin código de autenticación no se reintenta', async () => {
  jest.mocked(fetch).mockResolvedValue(response(401));
  await expect(pedirCrm('/api/crm/meetings')).rejects.toMatchObject({ status: 401 });
  expect(sync).not.toHaveBeenCalled();
});
test('una URL ajena al CRM nunca provoca resincronización', async () => {
  jest.mocked(fetch).mockResolvedValue(response(401, 'UNAUTHENTICATED'));
  await expect(pedirCrm('https://example.com/api/crm/meetings')).rejects.toMatchObject({ status: 401 });
  expect(sync).not.toHaveBeenCalled();
});
test('cancelar durante sincronización conserva AbortError y no vuelve a enviar', async () => {
  const controller = new AbortController();
  jest.mocked(fetch).mockResolvedValue(response(401, 'UNAUTHENTICATED'));
  sync.mockImplementation(() => { controller.abort(); return true; });
  await expect(pedirCrm('/api/crm/meetings', { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
  expect(fetch).toHaveBeenCalledTimes(1);
});
test.each([
  [401, 'UNAUTHENTICATED', 'sesionVencida'], [403, 'CRM_FORBIDDEN', 'sinPermiso'],
  [403, 'ORG_AMBIGUOUS', 'organizacionCambiada'], [403, 'FOREIGN_ORGANIZATION', 'sinPermiso'],
])('distingue HTTP %s / %s en la acción rápida', (status, code, expected) => {
  expect(claveError(new ErrorApiCrm(status, code, 'mensaje'))).toBe(expected);
});
