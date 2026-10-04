/** @jest-environment jsdom */
import { act, renderHook, waitFor } from '@testing-library/react';
import { useRecurringEvents } from '../recurrencias/useRecurringEvents';
import { supabase } from '@/lib/supabase/config';
jest.mock('@/lib/supabase/config', () => ({ supabase: { from: jest.fn() } }));
const from = jest.mocked(supabase.from), mutate = jest.fn();
const event = { id: 'meeting', organization_id: 120, metadata: { source: 'crm', activity_id: 'activity' }, recurrence_rule: 'FREQ=DAILY' };
beforeEach(() => {
  jest.clearAllMocks();
  from.mockImplementation((table: string) => {
    const query: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'not', 'order']) query[method] = jest.fn(() => query);
    for (const method of ['insert', 'update', 'delete']) query[method] = mutate;
    query.maybeSingle = jest.fn(async () => ({ data: table === 'calendar_events' ? event : { calendar_event_id: 'meeting' }, error: null }));
    query.then = (resolve: (value: unknown) => void) => Promise.resolve({ data: [event], error: null }).then(resolve);
    return query as never;
  });
});
test('el listado recurrente excluye CRM y todas sus mutaciones se deniegan al comprobar el padre', async () => {
  const { result } = renderHook(() => useRecurringEvents({ organizationId: 120 }));
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(result.current.events).toEqual([]);
  await act(async () => {
    await expect(result.current.updateEvent('meeting', { title: 'Alterada' })).rejects.toThrow('CRM');
    await expect(result.current.deleteEvent('meeting')).rejects.toThrow('CRM');
    await expect(result.current.createException({ calendar_event_id: 'meeting' } as never)).rejects.toThrow('CRM');
    await expect(result.current.updateException('exception', { new_title: 'Alterada' })).rejects.toThrow('CRM');
    await expect(result.current.deleteException('exception')).rejects.toThrow('CRM');
  });
  expect(mutate).not.toHaveBeenCalled();
});
