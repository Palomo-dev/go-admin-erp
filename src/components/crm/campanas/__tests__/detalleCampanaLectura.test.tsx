/** @jest-environment jsdom */
import { act, renderHook, waitFor } from '@testing-library/react';
import { useDetalleCampana } from '../id/useDetalleCampana';
import { CampanasService } from '../CampanasService';
import { ApiError } from '@/components/crm/whatsapp/api';
import type { CampaignStatsResult } from '@/components/crm/whatsapp/api';
import type { Campaign } from '../types';
jest.mock('../CampanasService', () => ({ CampanasService: { getCampaignWithPermissions: jest.fn(), stats: jest.fn() } }));
const campaign = { id: 'first' } as Campaign;
const stats = { counts: { total: 6002 } } as CampaignStatsResult;
beforeEach(() => {
  jest.mocked(CampanasService.getCampaignWithPermissions).mockReset(); jest.mocked(CampanasService.stats).mockReset();
  jest.mocked(CampanasService.getCampaignWithPermissions).mockResolvedValue({ data: campaign, can_manage: true });
  jest.mocked(CampanasService.stats).mockResolvedValue(stats);
});
test('lee campaña y cifras juntas y conserva permisos devueltos por el servidor', async () => {
  const { result } = renderHook(() => useDetalleCampana('first'));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current).toMatchObject({ campaign, stats, canManage: true, error: false });
});
test.each([401, 403, 404, 500])('distingue HTTP %s y termina la carga', async status => {
  jest.mocked(CampanasService.getCampaignWithPermissions).mockRejectedValue(new ApiError('error', 'ERROR', status));
  const { result } = renderHook(() => useDetalleCampana('first'));
  await waitFor(() => expect(result.current.error).toBe(true));
  expect(result.current).toMatchObject({ campaign: null, stats: null, canManage: false, loading: false, forbidden: [401, 403].includes(status), notFound: status === 404 });
});
test('una lectura antigua que termina después del cambio de campaña no reemplaza los datos nuevos', async () => {
  let resolveOld!: (value: { data: Campaign; can_manage: boolean }) => void;
  jest.mocked(CampanasService.getCampaignWithPermissions).mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }))
    .mockResolvedValueOnce({ data: { ...campaign, id: 'second' }, can_manage: false });
  const { result, rerender } = renderHook(({ id }) => useDetalleCampana(id), { initialProps: { id: 'first' } });
  rerender({ id: 'second' });
  await waitFor(() => expect(result.current.campaign?.id).toBe('second'));
  await act(async () => resolveOld({ data: campaign, can_manage: true }));
  expect(result.current.campaign?.id).toBe('second'); expect(result.current.canManage).toBe(false);
  expect(jest.mocked(CampanasService.getCampaignWithPermissions).mock.calls[0][1]?.aborted).toBe(true);
});

test('el sondeo no cancela una lectura pendiente antes de su límite de tiempo', async () => {
  jest.useFakeTimers();
  try {
    let finish!: (value: { data: Campaign; can_manage: boolean }) => void;
    jest.mocked(CampanasService.getCampaignWithPermissions).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const { result, unmount } = renderHook(() => useDetalleCampana('first'));
    await act(async () => { jest.advanceTimersByTime(15000); });
    expect(CampanasService.getCampaignWithPermissions).toHaveBeenCalledTimes(1);
    expect(jest.mocked(CampanasService.getCampaignWithPermissions).mock.calls[0][1]?.aborted).toBe(false);
    await act(async () => { finish({ data: campaign, can_manage: true }); });
    expect(result.current.campaign).toEqual(campaign);
    unmount();
  } finally { jest.useRealTimers(); }
});
