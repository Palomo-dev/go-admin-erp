import { uploadAssistantAttachments, normalizeAttachmentMime } from '@/lib/ai/assistant/attachments';

describe('Adjuntos del asistente', () => {
  it('reconoce fotos móviles sin MIME y no transforma tipos explícitos desconocidos', () => {
    expect(normalizeAttachmentMime('', 'foto.HEIC')).toBe('image/heic');
    expect(normalizeAttachmentMime('application/octet-stream', 'captura.PNG')).toBe('image/png');
    expect(normalizeAttachmentMime('text/html', 'foto.png')).toBe('text/html');
  });

  it('conserva los fallidos y reutiliza los que ya subieron al reintentar', async () => {
    const prepared = () => new Response(JSON.stringify({ uploadUrl: 'https://storage.example/upload', finalizeToken: 'token', mime: 'image/png' }));
    const upload = jest.fn().mockResolvedValueOnce(prepared())
      .mockResolvedValueOnce(new Response('{}'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'subido' }), { status: 201 }))
      .mockRejectedValueOnce(new Error('sin red'));
    const items = ['uno.png', 'dos.png'].map((name) => ({ id: name, file: new File(['foto'], name, { type: 'image/png' }) }));
    const first = await uploadAssistantAttachments(items, null, upload);
    expect(first.errors).toHaveLength(1);
    expect(first.items[0].uploadedId).toBe('subido');
    expect(first.items[1].uploadedId).toBeUndefined();
    upload.mockResolvedValueOnce(prepared()).mockResolvedValueOnce(new Response('{}'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'segundo' }), { status: 201 }));
    const retry = await uploadAssistantAttachments(first.items, null, upload);
    expect(retry.errors).toEqual([]);
    expect(retry.ids).toEqual(['subido', 'segundo']);
    expect(upload).toHaveBeenCalledTimes(7);
  });

  it('envía 6 MB directamente a Storage y reintenta solo finalize si falla la respuesta', async () => {
    const file = new File([new Uint8Array(6 * 1024 * 1024)], 'foto.png', { type: 'image/png' });
    const upload = jest.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ uploadUrl: 'https://storage.example/upload', finalizeToken: 'token', mime: 'image/png' })))
      .mockResolvedValueOnce(new Response('{}'))
      .mockRejectedValueOnce(new Error('sin red'));
    const first = await uploadAssistantAttachments([{ id: 'foto', file }], null, upload);
    expect(JSON.parse(upload.mock.calls[0][1].body)).toMatchObject({ operation: 'prepare', bytes: file.size });
    expect(upload.mock.calls[1][0]).toBe('https://storage.example/upload');
    expect(upload.mock.calls[1][1]).toMatchObject({ method: 'PUT', body: file, credentials: 'omit' });
    upload.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'ok' })));
    const retry = await uploadAssistantAttachments(first.items, null, upload);
    expect(retry.ids).toEqual(['ok']);
    expect(upload).toHaveBeenCalledTimes(4);
    expect(JSON.parse(upload.mock.calls[3][1].body).operation).toBe('finalize');
  });

  it('rechaza más de 20 MB antes de hacer solicitudes', async () => {
    const upload = jest.fn();
    const file = new File([new Uint8Array(20 * 1024 * 1024 + 1)], 'foto.png');
    const result = await uploadAssistantAttachments([{ id: 'foto', file }], null, upload);
    expect(result.errors[0]).toContain('20 MB');
    expect(upload).not.toHaveBeenCalled();
  });

  it('finaliza una subida cuya respuesta PUT se perdió aunque Storage devuelva Duplicate 400', async () => {
    const upload = jest.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ uploadUrl: 'https://storage.example/upload', finalizeToken: 'token', mime: 'image/png' })))
      .mockRejectedValueOnce(new Error('respuesta perdida'));
    const first = await uploadAssistantAttachments([{ id: 'foto', file: new File(['foto'], 'foto.png') }], null, upload);
    upload.mockResolvedValueOnce(new Response('{"error":"Duplicate"}', { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'ok' })));
    const retry = await uploadAssistantAttachments(first.items, null, upload);
    expect(retry.ids).toEqual(['ok']);
    expect(upload).toHaveBeenCalledTimes(4);
  });

  it('explica también errores HTTP no JSON (proxy/tamaño) sin perder el archivo', async () => {
    const items = [{ id: 'foto', file: new File(['x'], 'foto.png') }];
    const result = await uploadAssistantAttachments(items, null, jest.fn().mockResolvedValue(new Response('too large', { status: 413 })));
    expect(result.items).toHaveLength(1);
    expect(result.ids).toEqual([]);
    expect(result.errors[0]).toContain('413');
  });
});
