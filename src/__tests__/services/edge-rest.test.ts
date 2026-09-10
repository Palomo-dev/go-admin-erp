/**
 * Garantiza que las consultas del middleware NUNCA puedan colgar la invocacion.
 * Una consulta lenta debe abortarse por timeout y devolver null (fail open),
 * que es exactamente lo que faltaba cuando el middleware usaba el cliente del
 * navegador (3 reintentos, sin timeout) y Vercel respondia 504
 * MIDDLEWARE_INVOCATION_TIMEOUT.
 */

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';

import { edgeSelect, MW_QUERY_TIMEOUT_MS } from '@/lib/supabase/edge-rest';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

describe('edgeSelect', () => {
  it('devuelve las filas cuando la consulta responde', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ id: 7, status: 'active' }],
    }) as unknown as typeof fetch;

    const rows = await edgeSelect<{ id: number }>('organizations?select=id&limit=1');
    expect(rows).toEqual([{ id: 7, status: 'active' }]);
  });

  it('aborta y devuelve null si la consulta se cuelga', async () => {
    // fetch que solo se resuelve si lo abortan
    global.fetch = jest.fn((_url: any, init: any) => {
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new Error('AbortError')));
      });
    }) as unknown as typeof fetch;

    const started = Date.now();
    const rows = await edgeSelect('organizations?select=id', { timeoutMs: 150 });

    expect(rows).toBeNull();
    expect(Date.now() - started).toBeLessThan(MW_QUERY_TIMEOUT_MS);
  });

  it('no lanza la consulta si el presupuesto de tiempo ya se agoto', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const rows = await edgeSelect('organizations?select=id', { deadline: Date.now() - 1 });

    expect(rows).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('devuelve null ante una respuesta de error (fail open)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ message: 'RLS' }),
    }) as unknown as typeof fetch;

    expect(await edgeSelect('organizations?select=id')).toBeNull();
  });

  it('no reintenta ante un fallo de red', async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error('ECONNRESET'));
    global.fetch = fetchMock as unknown as typeof fetch;

    expect(await edgeSelect('organizations?select=id')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
