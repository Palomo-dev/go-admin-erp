/** @jest-environment jsdom */
import { act, renderHook, waitFor } from '@testing-library/react';
import { ErrorApiCrm, pedirCrm } from '@/components/crm/acciones/apiCrm';
jest.mock('@/lib/hooks/useOrganization', () => ({ ORGANIZATION_CHANGED_EVENT: 'organization-changed' }));
jest.mock('@/components/crm/acciones/apiCrm', () => ({ ...jest.requireActual('@/components/crm/acciones/apiCrm'), pedirCrm: jest.fn() }));
import { useClienteFicha } from '../useClienteFicha';

const pedir = jest.mocked(pedirCrm);
const respuesta = (id: string) => ({ data: { id, full_name: 'Cliente de prueba' }, extra: {} }) as never;
beforeEach(() => { jest.clearAllMocks(); });
test('lee la ficha del servidor sin declarar organización en body/query', async () => {
  pedir.mockResolvedValue(respuesta('c1'));
  const { result } = renderHook(() => useClienteFicha('c1', 0));
  expect(result.current.loading).toBe(true);
  await waitFor(() => expect(result.current.cliente?.id).toBe('c1'));
  expect(pedir).toHaveBeenCalledWith('/api/clientes/c1', { signal: expect.any(AbortSignal) });
});
test('respuesta tardía de otro cliente no reemplaza la ficha nueva', async () => {
  let resolver!: (v: never) => void;
  pedir.mockImplementationOnce(() => new Promise(resolve => { resolver = resolve; }));
  pedir.mockResolvedValueOnce(respuesta('c2'));
  const { result, rerender } = renderHook(({ id }) => useClienteFicha(id, 0), { initialProps: { id: 'c1' } });
  const signal = pedir.mock.calls[0][1]?.signal;
  rerender({ id: 'c2' });
  expect(signal?.aborted).toBe(true);
  await waitFor(() => expect(result.current.cliente?.id).toBe('c2'));
  await act(async () => { resolver(respuesta('c1')); });
  expect(result.current.cliente?.id).toBe('c2');
});
test('cambio de organización oculta la ficha anterior y no conserva datos si la nueva lectura da 404', async () => {
  pedir.mockResolvedValueOnce(respuesta('c1'));
  let rechazar!: (e: Error) => void;
  pedir.mockImplementationOnce(() => new Promise((_resolve, reject) => { rechazar = reject; }));
  const { result } = renderHook(() => useClienteFicha('c1', 0));
  await waitFor(() => expect(result.current.cliente?.id).toBe('c1'));
  act(() => { window.dispatchEvent(new Event('organization-changed')); });
  expect(result.current.cliente).toBeNull();
  expect(result.current.loading).toBe(true);
  await act(async () => { rechazar(new ErrorApiCrm(404, null, 'No existe')); });
  expect(result.current.cliente).toBeNull();
  expect(result.current.error).toBe('noEncontrado');
});
test.each([[401, 'sesionVencida'], [403, 'sinPermiso'], [500, 'generico']] as const)('status %s tiene diagnóstico propio y no datos', async (status, clave) => {
  pedir.mockRejectedValue(new ErrorApiCrm(status, null, 'Fallo'));
  const { result } = renderHook(() => useClienteFicha('c1', 0));
  await waitFor(() => expect(result.current.error).toBe(clave));
  expect(result.current.cliente).toBeNull();
});
