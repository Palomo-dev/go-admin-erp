const mockCreate = jest.fn(() => ({}));
jest.mock('@supabase/ssr', () => ({ createServerClient: (...args: unknown[]) => mockCreate(...(args as [])) }));
jest.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => [], set: jest.fn() }) }));
import { getServerUserClient } from '../server-user';

const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; jest.clearAllMocks(); });

test('el cliente normal conserva configuración anterior sin limitar otras operaciones', async () => {
  await getServerUserClient();
  expect((mockCreate.mock.calls[0] as unknown[])[2]).not.toHaveProperty('global');
});

test('propaga el deadline del request y conserva el abort propio del SDK', async () => {
  const controller = new AbortController(); const sdkController = new AbortController();
  global.fetch = jest.fn().mockResolvedValue(new Response('{}'));
  await getServerUserClient({ signal: controller.signal });
  const options = (mockCreate.mock.calls[0] as unknown[])[2] as { global: { fetch: typeof fetch } };
  await options.global.fetch('https://fixture.invalid', { signal: sdkController.signal });
  const sent = (global.fetch as jest.Mock).mock.calls[0][1].signal as AbortSignal;
  expect(sent.aborted).toBe(false);
  controller.abort(); expect(sent.aborted).toBe(true);
});
