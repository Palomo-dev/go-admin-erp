import { revalidarPublicacionWeb, revalidarEstructuraWeb } from '../revalidarPublicacionWeb';

const pedir = jest.fn();
const revision = 'revision-1';
const sitio = 'sitio-1';
const envPrevio = { secret: process.env.CRON_SECRET, urls: process.env.WEBSITES_BASE_URLS };
const fetchPrevio = global.fetch;

beforeEach(() => {
  process.env.CRON_SECRET = 'secreto-ficticio';
  process.env.WEBSITES_BASE_URLS = 'https://tienda.example,https://otra.example';
  pedir.mockReset();
  global.fetch = pedir;
});
afterAll(() => {
  global.fetch = fetchPrevio;
  for (const [key, value] of Object.entries({ CRON_SECRET: envPrevio.secret, WEBSITES_BASE_URLS: envPrevio.urls })) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

test('sin secretos ni destinos nunca confirma una publicación', async () => {
  delete process.env.CRON_SECRET;
  expect(await revalidarPublicacionWeb(140, sitio, revision, null)).toBe(false);
  expect(pedir).not.toHaveBeenCalled();
});
test('espera a todos los despliegues y exige el id exacto de revisión y sitio', async () => {
  pedir.mockResolvedValue({ ok: true, json: async () => ({ ok: true, sitioId: sitio, revisionId: revision }) });
  expect(await revalidarPublicacionWeb(140, sitio, revision, 9)).toBe(true);
  expect(pedir).toHaveBeenCalledTimes(2);
  const opciones = pedir.mock.calls[0][1];
  expect(JSON.parse(opciones.body)).toEqual({ organization_id: 140, publicacion: { sitioId: sitio, revisionId: revision, branchId: 9 } });
  expect(opciones.cache).toBe('no-store');
  pedir.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, sitioId: sitio, revisionId: 'vieja' }) });
  expect(await revalidarPublicacionWeb(140, sitio, revision, null)).toBe(false);
});
test('el endpoint antiguo, 401, HTML y error de red no se consideran confirmación', async () => {
  for (const response of [
    { ok: true, json: async () => ({ ok: true }) },
    { ok: false },
    { ok: true, json: async () => { throw new Error('HTML'); } },
  ]) {
    pedir.mockResolvedValue(response);
    expect(await revalidarPublicacionWeb(140, sitio, revision, null)).toBe(false);
  }
  pedir.mockRejectedValue(new Error('red'));
  expect(await revalidarPublicacionWeb(140, sitio, revision, null)).toBe(false);
});

test('legacy exige confirmación estructural de la misma org en todos los despliegues', async () => {
  pedir.mockResolvedValue({ ok: true, json: async () => ({ ok: true, estructura: true, organizationId: 140 }) });
  expect(await revalidarEstructuraWeb(140)).toBe(true);
  expect(JSON.parse(pedir.mock.calls[0][1].body)).toEqual({ organization_id: 140, estructura: true });
  pedir.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, estructura: true, organizationId: 999 }) });
  expect(await revalidarEstructuraWeb(140)).toBe(false);
});

test('un despliegue que no responde termina en fallo explícito al vencer el plazo', async () => {
  jest.useFakeTimers();
  try {
    pedir.mockImplementation((_url, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new Error('timeout')), { once: true });
    }));
    const pendiente = revalidarPublicacionWeb(140, sitio, revision, null);
    jest.advanceTimersByTime(10_000);
    expect(await pendiente).toBe(false);
  } finally {
    jest.useRealTimers();
  }
});
