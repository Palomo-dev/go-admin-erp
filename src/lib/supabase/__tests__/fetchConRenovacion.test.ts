/**
 * @jest-environment jsdom
 */
import { crearFetchConRenovacion, reiniciarRenovacionParaTests } from '../fetchConRenovacion';

beforeEach(() => reiniciarRenovacionParaTests());

const r = (status: number) => ({ status, ok: status < 400 }) as Response;

describe('fetch con renovación (A4, QA 27-oct)', () => {
  it('401 en /api: renueva una vez y reintenta con el Bearer nuevo', async () => {
    const base = jest.fn().mockResolvedValueOnce(r(401)).mockResolvedValueOnce(r(200));
    const renovar = jest.fn().mockResolvedValue('nuevo');
    const f = crearFetchConRenovacion(base as unknown as typeof fetch, renovar);
    const res = await f('/api/x', { method: 'POST', body: '{}', headers: { Authorization: 'Bearer viejo' } });
    expect(res.status).toBe(200);
    expect(renovar).toHaveBeenCalledTimes(1);
    expect(base).toHaveBeenCalledTimes(2);
    expect(new Headers(base.mock.calls[1][1].headers).get('Authorization')).toBe('Bearer nuevo');
  });

  it('401 simultáneos comparten una sola renovación', async () => {
    const base = jest.fn((_: unknown, i?: RequestInit) => Promise.resolve(r((i as { _r?: boolean })?._r ? 200 : 401)));
    let llamadas = 0;
    const renovar = jest.fn(async () => {
      llamadas++;
      await new Promise((ok) => setTimeout(ok, 5));
      return 't';
    });
    const f = crearFetchConRenovacion(base as unknown as typeof fetch, renovar);
    await Promise.all([f('/api/a'), f('/api/b'), f('/api/c')]);
    expect(llamadas).toBe(1);
  });

  it('sin renovación posible devuelve el 401 original sin reintentar', async () => {
    const base = jest.fn().mockResolvedValue(r(401));
    const f = crearFetchConRenovacion(base as unknown as typeof fetch, async () => null);
    expect((await f('/api/x')).status).toBe(401);
    expect(base).toHaveBeenCalledTimes(1);
  });

  it('no toca otros orígenes ni rutas fuera de /api', async () => {
    const base = jest.fn().mockResolvedValue(r(401));
    const renovar = jest.fn();
    const f = crearFetchConRenovacion(base as unknown as typeof fetch, renovar);
    await f('https://otro.com/api/x');
    await f('/app/inicio');
    expect(renovar).not.toHaveBeenCalled();
  });
});
