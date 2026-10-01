/** @jest-environment jsdom */
import { act, renderHook, waitFor } from '@testing-library/react';
import { ErrorApiCrm, pedirCrm } from '@/components/crm/acciones/apiCrm';
jest.mock('@/components/crm/acciones/apiCrm', () => ({ ...jest.requireActual('@/components/crm/acciones/apiCrm'), pedirCrm: jest.fn() }));
jest.mock('@/lib/hooks/useOrganization', () => ({ ORGANIZATION_CHANGED_EVENT: 'organization-changed' }));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({ useFormatDate: () => ({ timezone: 'Europe/Madrid' }) }));
jest.mock('@/lib/supabase/config', () => ({ supabase: { channel: () => {
  const channel = { on: () => channel, subscribe: () => channel };
  return channel;
}, removeChannel: jest.fn() } }));
import { useTimeline } from '../hooks/useTimeline';

const pedir = jest.mocked(pedirCrm);
const page = (id: string, cursor: string | null = null) => ({ data: [{ kind: 'note', id, occurred_at: '2026-10-01T22:30:00Z', note: { id, body: 'Nota', is_pinned: false }, activity: null, user: null }], extra: { next_cursor: cursor } }) as never;
beforeEach(() => { jest.clearAllMocks(); });

test('respuesta tardía de cargar más no mezcla clientes ni altera el cursor nuevo', async () => {
  let finish!: (value: never) => void;
  pedir.mockResolvedValueOnce(page('primera', 'cursor1'));
  const { result, rerender } = renderHook(({ id }) => useTimeline('customer', id), { initialProps: { id: 'cliente1' } });
  await waitFor(() => expect(result.current.hasMore).toBe(true));
  pedir.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  act(() => { result.current.loadMore(); result.current.loadMore(); });
  expect(pedir).toHaveBeenCalledTimes(2);
  pedir.mockResolvedValueOnce(page('otra-ficha'));
  rerender({ id: 'cliente2' });
  expect(result.current.entries).toEqual([]);
  await waitFor(() => expect(result.current.entries[0]?.id).toBe('otra-ficha'));
  await act(async () => { finish(page('página-antigua', 'cursor2')); });
  expect(result.current.entries.map(e => e.id)).toEqual(['otra-ficha']);
  expect(result.current.hasMore).toBe(false);
  expect(result.current.loadingMore).toBe(false);
});

test('cambiar de organización descarta inmediatamente datos y una página pendiente', async () => {
  let finish!: (value: never) => void;
  pedir.mockResolvedValueOnce(page('org-anterior', 'cursor1'));
  const { result } = renderHook(() => useTimeline('customer', 'cliente'));
  await waitFor(() => expect(result.current.hasMore).toBe(true));
  pedir.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  act(() => result.current.loadMore());
  pedir.mockRejectedValueOnce(new ErrorApiCrm(404, null, 'No existe'));
  act(() => { window.dispatchEvent(new Event('organization-changed')); });
  expect(result.current.entries).toEqual([]);
  await waitFor(() => expect(result.current.error).toBe('noEncontrado'));
  await act(async () => { finish(page('org-anterior-otra')); });
  expect(result.current.entries).toEqual([]);
  expect(result.current.hasMore).toBe(false);
});

test('refrescar durante la primera carga conserva el cursor y termina el estado de carga', async () => {
  let finish!: (value: never) => void;
  pedir.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const { result } = renderHook(() => useTimeline('customer', 'cliente'));
  pedir.mockResolvedValueOnce(page('actual', 'cursor2'));
  await act(async () => { await result.current.refresh(); });
  expect(result.current.entries[0]?.id).toBe('actual');
  expect(result.current.hasMore).toBe(true);
  expect(result.current.loading).toBe(false);
  await act(async () => { finish(page('vieja')); });
  expect(result.current.entries[0]?.id).toBe('actual');
});

test('revocar lectura al cargar más limpia datos anteriores y diagnostica permiso', async () => {
  pedir.mockResolvedValueOnce(page('antes', 'cursor'));
  const { result } = renderHook(() => useTimeline('customer', 'cliente'));
  await waitFor(() => expect(result.current.hasMore).toBe(true));
  pedir.mockRejectedValueOnce(new ErrorApiCrm(403, 'CRM_FORBIDDEN', 'Sin permiso'));
  act(() => result.current.loadMore());
  await waitFor(() => expect(result.current.error).toBe('sinPermiso'));
  expect(result.current.entries).toEqual([]);
  expect(result.current.hasMore).toBe(false);
});

test('agrupa el día con la zona de la organización, cruzando medianoche', async () => {
  pedir.mockResolvedValueOnce(page('nota'));
  const { result } = renderHook(() => useTimeline('customer', 'cliente'));
  await waitFor(() => expect(result.current.groups).toHaveLength(1));
  expect(result.current.groups[0].day).toBe('2026-10-02');
});
