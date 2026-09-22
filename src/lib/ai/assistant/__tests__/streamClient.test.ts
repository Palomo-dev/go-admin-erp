import { streamAssistant, type StreamHandlers } from '../streamClient';

const frame = (event: string, payload: object = {}) => `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
const encoder = new TextEncoder();
const handlers = (): StreamHandlers => ({ onToken: jest.fn(), onToolStart: jest.fn(), onToolEnd: jest.fn(),
  onAction: jest.fn(), onUsage: jest.fn(), onMeta: jest.fn(), onError: jest.fn() });
const response = (text: string) => new Response(new ReadableStream<Uint8Array>({
  start(controller) { controller.enqueue(encoder.encode(text)); controller.close(); },
}), { headers: { 'Content-Type': 'text/event-stream' } });

afterEach(() => jest.restoreAllMocks());

it('EOF tras token no es éxito: conserva texto, avisa y prohíbe fallback automático', async () => {
  jest.spyOn(globalThis, 'fetch').mockResolvedValue(response(frame('token', { delta: 'Texto parcial' })));
  const events = handlers();
  expect(await streamAssistant({ message: 'Hola' }, events)).toMatchObject({
    ok: false, content: 'Texto parcial', canFallback: false,
  });
  expect(events.onError).toHaveBeenCalledTimes(1);
  expect(events.onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'STREAM_INCOMPLETE' }));
});

it('solo un done explícito confirma el éxito', async () => {
  jest.spyOn(globalThis, 'fetch').mockResolvedValue(response(frame('token', { delta: 'Listo' }) + frame('done')));
  const events = handlers();
  expect(await streamAssistant({ message: 'Hola' }, events)).toMatchObject({ ok: true, content: 'Listo', canFallback: false });
  expect(events.onError).not.toHaveBeenCalled();
});

it('aborto de fetch no es éxito ni permite reintentar', async () => {
  jest.spyOn(globalThis, 'fetch').mockRejectedValue(new DOMException('Cancelado', 'AbortError'));
  const events = handlers();
  expect(await streamAssistant({ message: 'Hola' }, events)).toMatchObject({ ok: false, content: '', canFallback: false });
  expect(events.onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'STREAM_ABORTED' }));
});

it('aborto durante lectura conserva el contenido parcial', async () => {
  let pulls = 0;
  jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(new ReadableStream<Uint8Array>({
    pull(controller) {
      if (pulls++ === 0) controller.enqueue(encoder.encode(frame('token', { delta: 'Parcial' })));
      else controller.error(new DOMException('Cancelado', 'AbortError'));
    },
  })));
  const events = handlers();
  expect(await streamAssistant({ message: 'Hola' }, events)).toMatchObject({ ok: false, content: 'Parcial', canFallback: false });
  expect(events.onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'STREAM_ABORTED' }));
});

it.each(['usage', 'action', 'meta'])('EOF después de %s sin texto también impide repetir el turno', async (event) => {
  jest.spyOn(globalThis, 'fetch').mockResolvedValue(response(frame(event, { model: 'modelo-prueba', credits: 1, conversationId: 'hilo' })));
  const events = handlers();
  expect(await streamAssistant({ message: 'Hola' }, events)).toMatchObject({ ok: false, content: '', canFallback: false });
  expect(events.onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'STREAM_INCOMPLETE' }));
});

it('error de servidor seguido de done nunca convierte el turno en éxito', async () => {
  jest.spyOn(globalThis, 'fetch').mockResolvedValue(response(frame('error', { message: 'Falló', code: 'FAILED' }) + frame('done')));
  const events = handlers();
  expect(await streamAssistant({ message: 'Hola' }, events)).toMatchObject({ ok: false, canFallback: false });
  expect(events.onError).toHaveBeenCalledTimes(1);
});

it('EOF vacío sigue siendo incierto: el servidor pudo consumir antes de desconectarse', async () => {
  jest.spyOn(globalThis, 'fetch').mockResolvedValue(response(''));
  expect(await streamAssistant({ message: 'Hola' }, handlers())).toMatchObject({ ok: false, canFallback: false });
});

it('lee CRLF partido entre chunks y conserva meta posterior a done', async () => {
  const text = (frame('token', { delta: 'Confirmado' }) + frame('done') + frame('meta', { conversationId: 'hilo' })).replace(/\n/g, '\r\n');
  const bytes = encoder.encode(text);
  let offset = 0;
  jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset === bytes.length) controller.close();
      else controller.enqueue(bytes.slice(offset, ++offset));
    },
  })));
  const events = handlers();
  expect(await streamAssistant({ message: 'Hola' }, events)).toMatchObject({ ok: true, content: 'Confirmado' });
  expect(events.onMeta).toHaveBeenCalledWith({ conversationId: 'hilo' });
});

it('no interpreta un frame done truncado como confirmación', async () => {
  jest.spyOn(globalThis, 'fetch').mockResolvedValue(response(frame('token', { delta: 'Parcial' }) + 'event: done\ndata: {}'));
  expect(await streamAssistant({ message: 'Hola' }, handlers())).toMatchObject({ ok: false, content: 'Parcial', canFallback: false });
});

it('rechazo HTTP no es éxito ni dispara fallback', async () => {
  jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: 'Sesión vencida', code: 'UNAUTHORIZED' }), { status: 401 }));
  const events = handlers();
  expect(await streamAssistant({ message: 'Hola' }, events)).toMatchObject({ ok: false, canFallback: false });
  expect(events.onError).toHaveBeenCalledWith({ message: 'Sesión vencida', code: 'UNAUTHORIZED' });
});

it('signal ya abortado no envía la petición', async () => {
  const fetchMock = jest.spyOn(globalThis, 'fetch');
  const controller = new AbortController();
  controller.abort();
  expect(await streamAssistant({ message: 'Hola' }, handlers(), controller.signal)).toMatchObject({ ok: false, canFallback: false });
  expect(fetchMock).not.toHaveBeenCalled();
});
