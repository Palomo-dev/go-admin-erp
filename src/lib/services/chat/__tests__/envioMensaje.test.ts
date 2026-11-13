import { caminoEnvio, enviarMensajeConversacion, ErrorEnvio, motivoErrorEnvio, tipoContenidoArchivo } from '../envioMensaje';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Cliente de Supabase mínimo que registra lo que se inserta y se sube. */
function clienteFalso() {
  const insertados: Record<string, unknown>[] = [];
  const subidos: string[] = [];
  const consulta = {
    select: () => consulta,
    eq: () => consulta,
    maybeSingle: async () => ({ data: { id: 42 }, error: null }),
  };
  const cliente = {
    auth: { getUser: async () => ({ data: { user: { id: 'usuario-1' } } }) },
    from: (tabla: string) => ({
      ...consulta,
      insert: async (fila: Record<string, unknown>) => {
        insertados.push({ tabla, ...fila });
        return { error: null };
      },
    }),
    storage: {
      from: () => ({
        upload: async (ruta: string) => {
          subidos.push(ruta);
          return { error: null };
        },
        getPublicUrl: (ruta: string) => ({ data: { publicUrl: `https://cdn.test/${ruta}` } }),
      }),
    },
  };
  return { cliente: cliente as unknown as SupabaseClient, insertados, subidos };
}

const conv = (tipoCanal: string) => ({ id: '11111111-1111-1111-1111-111111111111', channel_id: '22222222-2222-2222-2222-222222222222', tipoCanal });

describe('Chat › camino de envío', () => {
  test('caminoEnvio: WhatsApp por la API; el resto directo', () => {
    expect(caminoEnvio('whatsapp')).toBe('whatsapp');
    expect(caminoEnvio('WhatsApp')).toBe('whatsapp');
    expect(caminoEnvio('website')).toBe('directo');
    expect(caminoEnvio('instagram')).toBe('directo');
    expect(caminoEnvio(null)).toBe('directo');
  });

  test('tipoContenidoArchivo', () => {
    expect(tipoContenidoArchivo({ type: 'image/png' })).toBe('image');
    expect(tipoContenidoArchivo({ type: 'audio/webm' })).toBe('audio');
    expect(tipoContenidoArchivo({ type: 'application/pdf' })).toBe('file');
    expect(tipoContenidoArchivo({ type: 'application/pdf' }, true)).toBe('audio');
  });

  test('motivoErrorEnvio traduce los códigos de la API de WhatsApp', () => {
    expect(motivoErrorEnvio('WINDOW_CLOSED')).toBe('ventanaCerrada');
    expect(motivoErrorEnvio('OPTED_OUT')).toBe('sinConsentimiento');
    expect(motivoErrorEnvio('NO_CREDITS')).toBe('sinCreditos');
    expect(motivoErrorEnvio('RATE_LIMITED')).toBe('demasiados');
    expect(motivoErrorEnvio('TEMPLATE_NOT_APPROVED')).toBe('sinPlantilla');
    expect(motivoErrorEnvio('X')).toBe('generico');
  });

  test('WhatsApp: pasa por /api/crm/whatsapp/send y NO inserta en messages', async () => {
    const { cliente, insertados } = clienteFalso();
    const fetchFn = jest.fn(async () => new Response(JSON.stringify({ success: true }), { status: 201 }));
    await enviarMensajeConversacion({ organizationId: 1, conversacion: conv('whatsapp'), mensaje: { texto: ' Hola ' }, supabase: cliente, fetchFn });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/crm/whatsapp/send');
    const cuerpo = JSON.parse(String(init.body));
    expect(cuerpo).toMatchObject({ conversationId: conv('whatsapp').id, text: 'Hola', template: null, media: null });
    expect(cuerpo).not.toHaveProperty('organizationId');
    expect(insertados).toHaveLength(0);
  });

  test('WhatsApp con la ventana vencida: el error conserva el código', async () => {
    const { cliente } = clienteFalso();
    const fetchFn = jest.fn(async () => new Response(JSON.stringify({ error: 'Fuera de ventana', code: 'WINDOW_CLOSED' }), { status: 422 }));
    await expect(
      enviarMensajeConversacion({ organizationId: 1, conversacion: conv('whatsapp'), mensaje: { texto: 'Hola' }, supabase: cliente, fetchFn }),
    ).rejects.toMatchObject({ codigo: 'WINDOW_CLOSED' });
  });

  test('WhatsApp con plantilla: manda template y no texto', async () => {
    const { cliente } = clienteFalso();
    const fetchFn = jest.fn(async () => new Response('{}', { status: 201 }));
    await enviarMensajeConversacion({
      organizationId: 1,
      conversacion: conv('whatsapp'),
      mensaje: { plantilla: { templateId: '33333333-3333-3333-3333-333333333333', variables: { '1': 'Natalia' } } },
      supabase: cliente,
      fetchFn,
    });
    const cuerpo = JSON.parse(String((fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(cuerpo.text).toBeNull();
    expect(cuerpo.template).toEqual({ templateId: '33333333-3333-3333-3333-333333333333', variables: { '1': 'Natalia' } });
  });

  test('Sitio web: inserta en messages con el miembro (bigint), sin tocar la API de WhatsApp', async () => {
    const { cliente, insertados } = clienteFalso();
    const fetchFn = jest.fn();
    await enviarMensajeConversacion({ organizationId: 1, conversacion: conv('website'), mensaje: { texto: 'Hola' }, supabase: cliente, fetchFn });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(insertados).toEqual([
      expect.objectContaining({ tabla: 'messages', role: 'agent', direction: 'outbound', sender_member_id: 42, content_type: 'text', content: 'Hola' }),
    ]);
  });

  test('Archivo: se sube a Storage y viaja como URL', async () => {
    const { cliente, insertados, subidos } = clienteFalso();
    const archivo = new File(['x'], 'foto.png', { type: 'image/png' });
    await enviarMensajeConversacion({ organizationId: 1, conversacion: conv('instagram'), mensaje: { archivo }, supabase: cliente });
    expect(subidos).toHaveLength(1);
    expect(insertados[0]).toMatchObject({ content_type: 'image', metadata: expect.objectContaining({ file_name: 'foto.png' }) });
    expect(String(insertados[0].content)).toMatch(/^https:\/\/cdn\.test\/chat\/1\//);
  });

  test('Vacío o plantilla fuera de WhatsApp: error', async () => {
    const { cliente } = clienteFalso();
    await expect(enviarMensajeConversacion({ organizationId: 1, conversacion: conv('website'), mensaje: { texto: '  ' }, supabase: cliente })).rejects.toBeInstanceOf(ErrorEnvio);
    await expect(
      enviarMensajeConversacion({ organizationId: 1, conversacion: conv('website'), mensaje: { plantilla: { templateId: 'x' } }, supabase: cliente }),
    ).rejects.toMatchObject({ codigo: 'CHANNEL_NO_TEMPLATES' });
  });
});
