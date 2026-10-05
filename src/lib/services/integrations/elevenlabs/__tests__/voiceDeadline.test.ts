import { ElevenLabsVoiceClient } from '../voiceCloneClient';

const apiKey = 'fixture-key-sufficiently-long-for-tests';
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test.each(['headers', 'body', 'error-body'])('la biblioteca limita la espera de %s y aborta la red', async (phase) => {
  let signal!: AbortSignal;
  const fetchImpl = jest.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    signal = init!.signal!;
    if (phase === 'headers') return new Promise<Response>(() => {});
    return { ok: phase !== 'error-body', status: 502, text: () => new Promise(() => {}) } as Response;
  }) as jest.MockedFunction<typeof fetch>;
  const client = new ElevenLabsVoiceClient({ apiKey, fetchImpl, readTimeoutMs: 1000 });
  const pending = client.listSharedVoices(new URLSearchParams('language=es'));
  const check = expect(pending).rejects.toMatchObject({ status: 504, code: 'provider_timeout' });
  await jest.advanceTimersByTimeAsync(1000); await check;
  expect(signal.aborted).toBe(true);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

test('cancelación de consulta no se transforma en error de permisos/proveedor', async () => {
  const controller = new AbortController();
  const fetchImpl = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>(() => new Promise<Response>(() => {}));
  const client = new ElevenLabsVoiceClient({ apiKey, fetchImpl });
  const pending = client.listSharedVoices(new URLSearchParams(), controller.signal);
  const check = expect(pending).rejects.toMatchObject({ code: 'REQUEST_ABORTED' });
  await jest.advanceTimersByTimeAsync(0); controller.abort(); await check;
  expect(jest.getTimerCount()).toBe(0);
});

test('un fallo de red no filtra detalles internos ni reintenta automáticamente', async () => {
  const fetchImpl = jest.fn().mockRejectedValue(new TypeError('private transport detail'));
  const client = new ElevenLabsVoiceClient({ apiKey, fetchImpl });
  await expect(client.listSharedVoices(new URLSearchParams())).rejects.toMatchObject({
    status: 503, code: 'provider_unavailable', message: 'No se pudo conectar con ElevenLabs. Vuelve a intentarlo.',
  });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

test('conserva los errores de plan del proveedor y las voces españolas', async () => {
  const fetchImpl = jest.fn().mockResolvedValueOnce(new Response('{"voices":[{"voice_id":"uno"}],"has_more":true,"total_count":2}'))
    .mockResolvedValueOnce(new Response('{"detail":{"status":"paid_plan_required","message":"paid"}}', { status: 403 }));
  const client = new ElevenLabsVoiceClient({ apiKey, fetchImpl });
  await expect(client.listSharedVoices(new URLSearchParams('language=es'))).resolves.toMatchObject({
    voices: [{ voice_id: 'uno' }], has_more: true, total_count: 2,
  });
  await expect(client.addSharedVoice('owner', 'uno', 'Voz')).rejects.toMatchObject({ status: 403, code: 'paid_plan_required' });
  expect(fetchImpl.mock.calls[0][0]).toContain('language=es');
  expect(fetchImpl.mock.calls[0][1].headers['xi-api-key']).toBe(apiKey);
});

test('clonar conserva su presupuesto largo y no duplica el POST', async () => {
  const fetchImpl = jest.fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>(() => new Promise<Response>(() => {}));
  const client = new ElevenLabsVoiceClient({ apiKey, fetchImpl, readTimeoutMs: 1000 });
  const pending = client.createInstantClone({ name: 'Fixture', files: [{ filename: 'voice.wav', blob: new Blob(['sample']) }] });
  const check = expect(pending).rejects.toMatchObject({ code: 'provider_timeout' });
  await jest.advanceTimersByTimeAsync(119_999);
  expect(fetchImpl.mock.calls[0][1]?.signal?.aborted).toBe(false);
  await jest.advanceTimersByTimeAsync(1); await check;
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});
