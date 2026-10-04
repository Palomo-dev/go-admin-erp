/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import { pedirCrm, ErrorApiCrm } from '@/components/crm/acciones/apiCrm';
import { useBorradorCampanaVoz, type BorradorVoz } from '../nuevo/useBorradorCampanaVoz';
import type { VoiceAgentCampaign } from '@/lib/services/crm/voiceAgentService';

jest.mock('@/components/crm/acciones/apiCrm', () => ({
  pedirCrm: jest.fn(), ErrorApiCrm: class extends Error { constructor(public status: number, public codigo: string) { super(codigo); } },
}));
const v1 = '2026-10-01T10:00:00.123456+00:00';
const v2 = '2026-10-01T10:01:00.123457+00:00';
const v3 = '2026-10-01T10:02:00.123458+00:00';
const body = { name: 'Campaña de prueba', voice_agent_id: 'agente', target_source: 'segment', target_config: { segment_id: 'segmento' }, status: 'draft' } as BorradorVoz;
const campaign = (version = v1) => ({ id: 'campaña', updated_at: version, status: 'draft' }) as VoiceAgentCampaign;
const request = jest.mocked(pedirCrm);
beforeEach(() => { jest.clearAllMocks(); request.mockResolvedValue({ data: campaign(), extra: {} }); });

test('RNE conserva la versión exacta del POST propio, incluidos microsegundos', async () => {
  const { result } = renderHook(() => useBorradorCampanaVoz(body));
  await act(async () => { await result.current.guardar(); });
  act(() => { result.current.applyRneVersion(v2); });
  request.mockResolvedValueOnce({ data: campaign(v3), extra: {} });
  await act(async () => { await result.current.guardar(); });
  expect(request).toHaveBeenLastCalledWith('/api/crm/voice-agents/campaigns/campaña', expect.objectContaining({ cuerpo: expect.objectContaining({ expected_updated_at: v2 }) }));
  expect(result.current.saved?.updated_at).toBe(v3);
});

test('activar transmite únicamente la versión de su guardado', async () => {
  request.mockResolvedValueOnce({ data: campaign(v1), extra: {} }).mockResolvedValueOnce({ data: campaign(v2), extra: {} });
  const { result } = renderHook(() => useBorradorCampanaVoz(body));
  await act(async () => { await result.current.lanzar(); });
  expect(request).toHaveBeenLastCalledWith('/api/crm/voice-agents/campaigns/campaña', expect.objectContaining({ cuerpo: { status: 'running', emergency_stop: false, expected_updated_at: v1 } }));
});

test('un conflicto no avanza la versión ni activa la campaña', async () => {
  const { result } = renderHook(() => useBorradorCampanaVoz(body));
  await act(async () => { await result.current.guardar(); });
  request.mockRejectedValueOnce(new ErrorApiCrm(409, 'campana_modificada', 'Conflicto'));
  await act(async () => { await expect(result.current.lanzar()).rejects.toMatchObject({ status: 409 }); });
  expect(request).toHaveBeenCalledTimes(2);
  expect(result.current.saved?.updated_at).toBe(v1);
  expect(result.current.busy).toBe(false);
});

test('un doble clic no crea dos borradores', async () => {
  let resolve!: (value: Awaited<ReturnType<typeof pedirCrm>>) => void;
  request.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  const { result } = renderHook(() => useBorradorCampanaVoz(body));
  await act(async () => {
    const first = result.current.guardar();
    await expect(result.current.guardar()).rejects.toThrow('busy');
    resolve({ data: campaign(), extra: {} }); await first;
  });
  expect(request).toHaveBeenCalledTimes(1);
});

test('modificar contenido invalida los requisitos visibles del borrador guardado', async () => {
  const { result, rerender } = renderHook(value => useBorradorCampanaVoz(value), { initialProps: body });
  await act(async () => { await result.current.guardar(); });
  expect(result.current.unchanged).toBe(true);
  rerender({ ...body, objective: 'Objetivo distinto' });
  expect(result.current.unchanged).toBe(false);
});

test('un desmontaje aborta el request y una respuesta tardía no activa', async () => {
  let resolve!: (value: Awaited<ReturnType<typeof pedirCrm>>) => void;
  request.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  const { result, unmount } = renderHook(() => useBorradorCampanaVoz(body));
  let intent!: Promise<VoiceAgentCampaign>;
  act(() => { intent = result.current.lanzar(); });
  const signal = request.mock.calls[0][1]?.signal;
  unmount(); expect(signal?.aborted).toBe(true);
  resolve({ data: campaign(), extra: {} });
  await expect(intent).rejects.toThrow('cancelled');
  expect(request).toHaveBeenCalledTimes(1);
});
