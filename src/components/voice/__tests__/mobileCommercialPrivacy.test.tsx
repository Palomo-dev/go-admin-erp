/** @jest-environment jsdom */
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useMobileCommercialContext } from '../mobile/useMobileCommercialContext';
let mockOrg: number | null = 120, mockUser = 'user-a';
let mockBranches: Array<{ id?: number }> = [{ id: 1 }, { id: 2 }];
let mockExpires = Math.floor(Date.now() / 1000) + 3600;
jest.mock('@/lib/hooks/useOrganization', () => ({ useOrganization: () => ({ organization: mockOrg ? { id: mockOrg, name: 'Organización de prueba' } : null, branch_id: 1, isLoading: false, error: null }) }));
jest.mock('@/lib/context/SessionContext', () => ({ useSession: () => ({ session: { user: { id: mockUser }, expires_at: mockExpires } }) }));
jest.mock('@/lib/context/BranchContext', () => ({ useBranchOpcional: () => ({ branchFilter: 1, branches: mockBranches }) }));
const id = '10000000-0000-4000-8000-000000000001';
const context = { name: 'Oportunidad privada', amount: 100, etapa: { name: 'Propuesta' } };
const reply = (status = 200) => ({ ok: status === 200, status, json: async () => ({ success: true, data: context }) });
let mockFetch: jest.Mock;
beforeEach(() => { jest.clearAllMocks(); mockOrg = 120; mockUser = 'user-a'; mockBranches = [{ id: 1 }, { id: 2 }]; mockExpires = Math.floor(Date.now() / 1000) + 3600; mockFetch = jest.fn(async () => reply()); global.fetch = mockFetch; });
afterEach(cleanup);
it('organization.id del hook real habilita únicamente el lector autorizado existente', async () => {
  const rendered = renderHook(() => useMobileCommercialContext(id, true));
  await waitFor(() => expect(rendered.result.current).toEqual(context));
  expect(mockFetch).toHaveBeenCalledWith(`/api/crm/opportunities/${id}`, expect.objectContaining({ cache: 'no-store', credentials: 'same-origin', signal: expect.any(AbortSignal) }));
});
it('sin organización o con sesión vencida no consulta ni presenta contexto', () => {
  mockOrg = null; const rendered = renderHook(() => useMobileCommercialContext(id, true));
  expect(rendered.result.current).toBeNull(); expect(mockFetch).not.toHaveBeenCalled();
  mockOrg = 120; mockExpires = Math.floor(Date.now() / 1000) - 1; rendered.rerender();
  expect(rendered.result.current).toBeNull(); expect(mockFetch).not.toHaveBeenCalled();
});
it.each(['org', 'user', 'branches'])('cambio de %s descarta contexto tardío, incluso con el mismo filtro de sucursal', async change => {
  let finish: (value: unknown) => void = () => {};
  mockFetch.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockImplementation(() => new Promise(() => {}));
  const rendered = renderHook(() => useMobileCommercialContext(id, true));
  const oldSignal = mockFetch.mock.calls[0][1].signal as AbortSignal;
  if (change === 'org') mockOrg = 121;
  if (change === 'user') mockUser = 'user-b';
  if (change === 'branches') mockBranches = [{ id: 1 }, {}];
  rendered.rerender(); await act(async () => finish(reply()));
  expect(oldSignal.aborted).toBe(true); expect(rendered.result.current).toBeNull(); expect(mockFetch).toHaveBeenCalledTimes(2);
});
it.each([401, 403])('un %s del servidor no concede contexto comercial', async status => {
  mockFetch.mockResolvedValue(reply(status)); const rendered = renderHook(() => useMobileCommercialContext(id, true));
  await act(async () => { await Promise.resolve(); }); expect(rendered.result.current).toBeNull();
});
