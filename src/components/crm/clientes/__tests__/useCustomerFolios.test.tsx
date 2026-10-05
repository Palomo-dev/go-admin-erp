/** @jest-environment jsdom */
import { act, renderHook, waitFor } from '@testing-library/react';
import { useCustomerFolios } from '../useCustomerFolios';
import { getCustomerFolios } from '@/lib/services/crm/customerFoliosService';

jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));
jest.mock('@/lib/services/crm/customerFoliosService', () => ({ getCustomerFolios: jest.fn() }));
const read = jest.mocked(getCustomerFolios);
const data = (id: string) => ({
  summary: { base: 'USD', date: '2026-10-02', total: null, folios: null, invoices: null },
  folios: [],
  invoices: [
    {
      id,
      number: id,
      issue_date: null,
      due_date: null,
      total: 10,
      balance: 10,
      status: 'issued',
      currency: 'USD',
    },
  ],
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
beforeEach(() => read.mockReset());

test('el fallo inicial presenta error y un reintento puede cargar las cifras', async () => {
  read.mockRejectedValueOnce(new Error('DB failed')).mockResolvedValueOnce(data('invoice'));
  const { result } = renderHook(() => useCustomerFolios(120, 'customer'));
  await waitFor(() => expect(result.current.error).toBe(true));
  expect(result.current.isLoading).toBe(false);
  await act(async () => result.current.loadData());
  expect(result.current.error).toBe(false);
  expect(result.current.invoices[0]?.id).toBe('invoice');
});

test('una respuesta tardía no revela facturas de la organización anterior', async () => {
  const old = deferred<ReturnType<typeof data>>();
  read.mockReturnValueOnce(old.promise).mockResolvedValueOnce(data('new'));
  const { result, rerender } = renderHook(({ org }) => useCustomerFolios(org, 'customer'), {
    initialProps: { org: 120 },
  });
  rerender({ org: 121 });
  await waitFor(() => expect(result.current.invoices[0]?.id).toBe('new'));
  await act(async () => old.resolve(data('old')));
  expect(result.current.invoices.map((row) => row.id)).toEqual(['new']);
});

test('un error tardío de otro cliente no sustituye el resultado actual', async () => {
  const old = deferred<ReturnType<typeof data>>();
  read.mockReturnValueOnce(old.promise).mockResolvedValueOnce(data('new'));
  const { result, rerender } = renderHook(({ customer }) => useCustomerFolios(120, customer), {
    initialProps: { customer: 'old' },
  });
  rerender({ customer: 'new' });
  await waitFor(() => expect(result.current.invoices[0]?.id).toBe('new'));
  await act(async () => old.reject(new Error('old failed')));
  expect(result.current.error).toBe(false);
  expect(result.current.invoices[0]?.id).toBe('new');
});

test('sin organización mantiene carga y no construye una lectura sin tenant', () => {
  const { result } = renderHook(() => useCustomerFolios(undefined, 'customer'));
  expect(result.current.isLoading).toBe(true);
  expect(read).not.toHaveBeenCalled();
});
