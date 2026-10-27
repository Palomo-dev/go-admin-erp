/**
 * @jest-environment jsdom
 */
import { crearFetchConRenovacion, reiniciarRenovacionParaTests } from '../fetchConRenovacion';

beforeEach(() => reiniciarRenovacionParaTests());

const r = (status: number) => ({ status, ok: status < 400 }) as Response;
/** Respuesta con cuerpo JSON que se puede clonar y leer (como la de `fetch`). */
const rj = (status: number, cuerpo: unknown): Response => {
  const hacer = (): Response => ({ status, ok: status < 400, json: async () => cuerpo, clone: hacer }) as unknown as Response;
  return hacer();
};

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

  it('login con contraseña mala (/api/auth/acceso): un solo 401, sin renovar', async () => {
    const base = jest.fn().mockResolvedValue(rj(401, { ok: false, codigo: 'credenciales' }));
    const renovar = jest.fn().mockResolvedValue('t');
    const f = crearFetchConRenovacion(base as unknown as typeof fetch, renovar);
    const res = await f('/api/auth/acceso', { method: 'POST', body: '{}' });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, codigo: 'credenciales' });
    expect(renovar).not.toHaveBeenCalled();
    expect(base).toHaveBeenCalledTimes(1);
  });

  it("cualquier ruta cuyo 401 trae codigo: 'credenciales' no se renueva ni se reintenta", async () => {
    const base = jest.fn().mockResolvedValue(rj(401, { codigo: 'credenciales' }));
    const renovar = jest.fn().mockResolvedValue('t');
    const f = crearFetchConRenovacion(base as unknown as typeof fetch, renovar);
    expect((await f('/api/otra/login', { method: 'POST', body: '{}' })).status).toBe(401);
    expect(renovar).not.toHaveBeenCalled();
    expect(base).toHaveBeenCalledTimes(1);
  });

  it.each([
    '/api/auth/contrasena',
    '/api/auth/invite/pendiente',
    '/api/integrations/twilio/verify/check',
    '/api/integrations/twilio/verify/send',
    '/api/integrations/open-finance/links/7/login',
  ])('sesión vencida en %s: renueva y reintenta', async (ruta) => {
    const base = jest.fn().mockResolvedValueOnce(rj(401, { ok: false, codigo: 'sin_sesion' })).mockResolvedValueOnce(r(200));
    const renovar = jest.fn().mockResolvedValue('t');
    const f = crearFetchConRenovacion(base as unknown as typeof fetch, renovar);
    expect((await f(ruta, { method: 'POST', body: '{}' })).status).toBe(200);
    expect(renovar).toHaveBeenCalledTimes(1);
    expect(base).toHaveBeenCalledTimes(2);
  });

  it('un 400 (contraseña actual incorrecta) pasa tal cual, sin renovar', async () => {
    const base = jest.fn().mockResolvedValue(rj(400, { ok: false, codigo: 'actual_incorrecta' }));
    const renovar = jest.fn();
    const f = crearFetchConRenovacion(base as unknown as typeof fetch, renovar);
    const res = await f('/api/auth/contrasena', { method: 'POST', body: '{}' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, codigo: 'actual_incorrecta' });
    expect(renovar).not.toHaveBeenCalled();
  });

  it('una ruta que solo empieza parecido sí se renueva', async () => {
    const base = jest.fn().mockResolvedValueOnce(r(401)).mockResolvedValueOnce(r(200));
    const renovar = jest.fn().mockResolvedValue('t');
    const f = crearFetchConRenovacion(base as unknown as typeof fetch, renovar);
    expect((await f('/api/authz-algo')).status).toBe(200);
    expect(renovar).toHaveBeenCalledTimes(1);
  });
});
