import type { SupabaseClient } from '@supabase/supabase-js';
import { loadMessages, type StoredMessage } from '../conversationStore';

function database(rows: StoredMessage[], error: unknown = null) {
  let ascending = true;
  const query = {
    select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    order: jest.fn(),
    limit: jest.fn(async (n: number) => ({
      data: [...rows].sort((a, b) => ascending
        ? a.created_at.localeCompare(b.created_at) : b.created_at.localeCompare(a.created_at)).slice(0, n),
      error,
    })),
  };
  query.order.mockImplementation((_column: string, options: { ascending: boolean }) => {
    ascending = options.ascending;
    return query;
  });
  return { query, client: { from: jest.fn(() => query) } as unknown as SupabaseClient };
}

const rows: StoredMessage[] = Array.from({ length: 150 }, (_, i) => ({
  id: `message-${i}`, role: i % 2 ? 'assistant' : 'user', content: `Mensaje ${i}`,
  content_json: {}, action_id: null, created_at: new Date(1700000000000 + i * 1000).toISOString(),
}));

test('recupera los últimos N de un hilo largo, entregados del más antiguo al más reciente', async () => {
  const { client, query } = database(rows);
  const result = await loadMessages(client, 'conversation-a', 40);
  expect(result.map((m) => m.id)).toEqual(rows.slice(-40).map((m) => m.id));
  expect(query.eq).toHaveBeenCalledWith('conversation_id', 'conversation-a');
  expect(query.in).toHaveBeenCalledWith('role', ['user', 'assistant']);
  expect(query.order).toHaveBeenCalledWith('created_at', { ascending: false });
});

test('el límite por defecto también devuelve los 100 mensajes recientes', async () => {
  const { client } = database(rows);
  expect(await loadMessages(client, 'conversation-a')).toEqual(rows.slice(-100));
});

test('un hilo corto mantiene su orden cronológico sin mutar los datos', async () => {
  const source = rows.slice(0, 3);
  const { client } = database(source);
  expect(await loadMessages(client, 'conversation-a', 40)).toEqual(source);
  expect(source[0].id).toBe('message-0');
});

test('un fallo de lectura devuelve lista vacía', async () => {
  const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  try {
    const { client } = database([], { message: 'fallo' });
    expect(await loadMessages(client, 'conversation-a')).toEqual([]);
  } finally { spy.mockRestore(); }
});
