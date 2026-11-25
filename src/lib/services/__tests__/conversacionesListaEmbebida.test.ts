/**
 * Lista de la bandeja de chat (2026-11-24): el último mensaje y las etiquetas van en la misma
 * consulta de la lista. Si PostgREST rechazara esa forma, se usa la anterior (una por una) y la
 * bandeja sigue mostrando lo mismo.
 */
const consultas: { tabla: string; select: string; embebidos: string[] }[] = [];
let fallaEmbebida = false;

const CONVERSACIONES = [
  { id: 'c-1', status: 'open', customer: { full_name: 'Cliente uno' } },
  { id: 'c-2', status: 'open', customer: { full_name: 'Cliente dos' } },
];
const ULTIMO: Record<string, unknown> = {
  'c-1': { id: 'm-1', content: 'Hola', created_at: '2026-11-24T15:00:00Z', direction: 'inbound', role: 'customer', is_read: false },
};
const ETIQUETAS: Record<string, unknown[]> = { 'c-2': [{ tag: { id: 't-1', name: 'VIP', color: '#111111' } }] };

jest.mock('@/lib/supabase/config', () => ({
  supabase: {
    from(tabla: string) {
      const estado = { select: '', cabeza: false, conversacion: '', embebidos: [] as string[] };
      const constructor: Record<string, unknown> = {
        select(campos: string, opciones?: { head?: boolean }) {
          estado.select = campos;
          estado.cabeza = !!opciones?.head;
          return constructor;
        },
        eq(columna: string, valor: string) {
          if (columna === 'conversation_id') estado.conversacion = valor;
          return constructor;
        },
        is: () => constructor,
        in: () => constructor,
        range: () => constructor,
        order(_columna: string, opciones?: { referencedTable?: string }) {
          if (opciones?.referencedTable) estado.embebidos.push(`order:${opciones.referencedTable}`);
          return constructor;
        },
        limit(_n: number, opciones?: { referencedTable?: string }) {
          if (opciones?.referencedTable) estado.embebidos.push(`limit:${opciones.referencedTable}`);
          return constructor;
        },
        then(resolver: (r: unknown) => void) {
          if (!estado.cabeza) consultas.push({ tabla, select: estado.select, embebidos: estado.embebidos });
          if (estado.cabeza) return resolver({ count: CONVERSACIONES.length, error: null });
          if (tabla === 'conversations') {
            const embebida = estado.select.includes('ultimo_mensaje');
            if (embebida && fallaEmbebida) return resolver({ data: null, error: { message: 'embebido rechazado' } });
            const filas = embebida
              ? CONVERSACIONES.map((c) => ({ ...c, ultimo_mensaje: ULTIMO[c.id] ? [ULTIMO[c.id]] : [], relaciones_etiqueta: ETIQUETAS[c.id] ?? [] }))
              : CONVERSACIONES;
            return resolver({ data: filas, error: null });
          }
          if (tabla === 'messages') return resolver({ data: ULTIMO[estado.conversacion] ? [ULTIMO[estado.conversacion]] : [], error: null });
          if (tabla === 'conversation_tag_relations') return resolver({ data: ETIQUETAS[estado.conversacion] ?? [], error: null });
          return resolver({ data: [], error: null });
        },
      };
      return constructor;
    },
  },
}));

import ConversationsService from '../conversationsService';

const ESPERADO = [
  { id: 'c-1', status: 'open', customer: { full_name: 'Cliente uno' }, last_message: ULTIMO['c-1'], tags: [] },
  { id: 'c-2', status: 'open', customer: { full_name: 'Cliente dos' }, last_message: null, tags: [{ id: 't-1', name: 'VIP', color: '#111111' }] },
];

beforeEach(() => {
  consultas.length = 0;
  fallaEmbebida = false;
});

describe('lista de conversaciones', () => {
  test('una sola consulta trae la lista con el último mensaje (límite por conversación) y las etiquetas', async () => {
    const r = await new ConversationsService(120).getConversationsPaginated({}, { limit: 20, offset: 0 });
    expect(r.data).toEqual(ESPERADO);
    expect(r.total).toBe(2);
    expect(consultas.map((c) => c.tabla)).toEqual(['conversations']);
    expect(consultas[0].embebidos).toEqual(['order:ultimo_mensaje', 'limit:ultimo_mensaje']);
  });

  test('si la consulta embebida falla, cae a la forma anterior y devuelve lo mismo', async () => {
    const aviso = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    fallaEmbebida = true;
    const r = await new ConversationsService(120).getConversationsPaginated({}, { limit: 20, offset: 0 });
    expect(r.data).toEqual(ESPERADO);
    // La embebida, la lista sin detalles y 2 consultas por conversación.
    expect(consultas.map((c) => c.tabla).sort()).toEqual(
      ['conversation_tag_relations', 'conversation_tag_relations', 'conversations', 'conversations', 'messages', 'messages'],
    );
    aviso.mockRestore();
  });
});
