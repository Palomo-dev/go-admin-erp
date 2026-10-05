/** @jest-environment jsdom */
import { act, renderHook, waitFor } from '@testing-library/react';
import { pedirCrm, ErrorApiCrm } from '../apiCrm';
import { invalidarCatalogosCrm, useCatalogosCrm } from '../useCatalogosCrm';
jest.mock('../apiCrm', () => ({ ...jest.requireActual('../apiCrm'), pedirCrm: jest.fn() }));
let mockOrg = 120;
jest.mock('@/lib/hooks/useOrganization', () => ({ getOrganizationId: () => mockOrg, ORGANIZATION_CHANGED_EVENT: 'organization-changed' }));
const pedir = jest.mocked(pedirCrm);
const responder = (usuario: string) => pedir.mockImplementation(async (ruta: string) => ({ data: ruta.endsWith('permisos')
  ? { usuario_id: usuario, permisos: { 'crm.activities.create': true } }
  : ruta.endsWith('org-members') ? [{ id: usuario, name: 'Miembro', email: null }] : [], extra: {} }) as never);
beforeEach(() => { jest.clearAllMocks(); mockOrg = 120; invalidarCatalogosCrm(); });
test('compartir catálogo no mezcla permisos ni usuarios al cambiar organización', async () => {
  responder('usuario-propio');
  const { result } = renderHook(() => useCatalogosCrm());
  await waitFor(() => expect(result.current.usuarioId).toBe('usuario-propio'));
  let finish!: (v: never) => void;
  pedir.mockImplementation(ruta => ruta.endsWith('permisos') ? new Promise(resolve => { finish = resolve; }) : Promise.resolve({ data: [], extra: {} } as never));
  act(() => { mockOrg = 125; window.dispatchEvent(new Event('organization-changed')); });
  expect(result.current.usuarioId).toBeNull();
  expect(result.current.permisos).toEqual({});
  expect(result.current.usuarios).toEqual([]);
  await act(async () => finish({ data: { usuario_id: 'otro-miembro', permisos: {} }, extra: {} } as never));
  expect(result.current.usuarioId).toBe('otro-miembro');
});
test('invalidar catálogos actualiza los consumidores montados', async () => {
  responder('antes');
  const { result } = renderHook(() => useCatalogosCrm());
  await waitFor(() => expect(result.current.usuarioId).toBe('antes'));
  responder('después');
  act(() => invalidarCatalogosCrm());
  await waitFor(() => expect(result.current.usuarioId).toBe('después'));
});
test('un fallo de lectura de miembros se muestra como error, sin simular catálogo vacío', async () => {
  pedir.mockRejectedValue(new ErrorApiCrm(500, null, 'Fallo'));
  const { result } = renderHook(() => useCatalogosCrm());
  await waitFor(() => expect(result.current.error).toBeInstanceOf(ErrorApiCrm));
  expect(result.current.cargando).toBe(false);
});
