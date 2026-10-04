/** @jest-environment jsdom */
import { act, renderHook, waitFor } from '@testing-library/react';
import foliosService, { type Folio } from '@/lib/services/foliosService';
import { useFoliosPagina } from '../useFoliosPagina';
import { leerEnlaceFolio } from '../enlaceFolioLogica';
jest.mock('@/lib/services/foliosService', () => ({ __esModule: true, default: { getFolios: jest.fn() } }));
const mockToast = jest.fn();
jest.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));
const reservationId = '11111111-1111-4111-8111-111111111111';
const folioId = '22222222-2222-4222-8222-222222222222';
const enlace = { reservationId, folioId };
const folio: Folio = { id: folioId, reservation_id: reservationId, balance: 25, status: 'open', created_at: '', updated_at: '' };
const listar = jest.mocked(foliosService.getFolios);
beforeEach(() => { jest.clearAllMocks(); });

test('valida ambos ids, sin aceptar filtros PostgREST ni parámetros incompletos', () => {
  expect(leerEnlaceFolio(new URLSearchParams({ reservation: reservationId, folio: folioId }))).toEqual(enlace);
  expect(leerEnlaceFolio(new URLSearchParams({ reservation: reservationId, folio: 'x,id.gt.0' }))).toBeNull();
  expect(leerEnlaceFolio(null)).toBeNull();
});
test('abre solamente el detalle leído con la organización, sucursal y reserva propias', async () => {
  listar.mockResolvedValue([folio]);
  const { result } = renderHook(() => useFoliosPagina(120, 1, false, enlace));
  await waitFor(() => expect(result.current.selectedFolioId).toBe(folioId));
  expect(listar).toHaveBeenCalledWith({ organizationId: 120, branchId: 1, reservation_id: reservationId, folioId });
  act(() => result.current.handleCloseDialog());
  expect(result.current.selectedFolioId).toBeNull();
});
test('una respuesta pendiente de otra organización no abre ni mezcla folios', async () => {
  let finish!: (folios: Folio[]) => void;
  listar.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const { result, rerender } = renderHook(({ org }) => useFoliosPagina(org, 1, false, enlace), { initialProps: { org: 120 } });
  listar.mockResolvedValueOnce([]);
  rerender({ org: 125 });
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  await act(async () => { finish([folio]); });
  expect(result.current.folios).toEqual([]);
  expect(result.current.selectedFolioId).toBeNull();
});
test('cambiar organización desmonta inmediatamente el detalle cargado', async () => {
  listar.mockResolvedValueOnce([folio]);
  const { result, rerender } = renderHook(({ org }) => useFoliosPagina(org, 1, false, enlace), { initialProps: { org: 120 } });
  await waitFor(() => expect(result.current.selectedFolioId).toBe(folioId));
  listar.mockImplementationOnce(() => new Promise(() => undefined));
  rerender({ org: 125 });
  expect(result.current.folios).toEqual([]);
  expect(result.current.selectedFolioId).toBeNull();
});
