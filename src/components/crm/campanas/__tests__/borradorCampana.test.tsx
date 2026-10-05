/** @jest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import { useBorradorCampana } from '../nuevo/useBorradorCampana';
import { CampanasService } from '../CampanasService';
import { ApiError, type Campaign, type CreateCampaignBody } from '@/components/crm/whatsapp/api';
jest.mock('../CampanasService', () => ({ CampanasService: {
  createCampaign: jest.fn(), updateCampaign: jest.fn(), materialize: jest.fn(), launch: jest.fn(), stats: jest.fn(),
} }));
const v1 = '2026-10-01T10:00:00.123456+00:00';
const v2 = '2026-10-01T10:01:00.123457+00:00';
const v3 = '2026-10-01T10:02:00.123458+00:00';
const body = (): CreateCampaignBody => ({ name: 'Fixture borrador', channel: 'whatsapp', channel_id: 'canal', content: 'Texto',
  purpose: 'utility', default_variables: { a: '1', b: '2' }, audience: { source: 'manual', customer_ids: ['cliente'] } });
const campaign = (): Campaign => ({ id: 'campaña', organization_id: 120, name: 'Fixture borrador', channel: 'whatsapp',
  status: 'draft', effective_status: 'draft', template_id: null, content: 'Texto', segment_id: null, scheduled_at: null,
  created_by: null, created_at: v1, updated_at: v1, statistics: { audience: body().audience, channel_id: 'canal', purpose: 'utility', default_variables: body().default_variables } });
const materialized = () => ({ campaign_updated_at: v2, success: true, total: 2, pending: 2, skipped: 0, skipped_by_reason: {}, estimated_cost: null });
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(CampanasService.createCampaign).mockResolvedValue(campaign());
  jest.mocked(CampanasService.materialize).mockResolvedValue(materialized());
  jest.mocked(CampanasService.updateCampaign).mockResolvedValue({ ...campaign(), updated_at: v3 });
});
test('calcular y volver a editar usa la versión exacta de la propia RPC, incluidos microsegundos', async () => {
  const { result } = renderHook(() => useBorradorCampana(body()));
  await act(async () => { await result.current.calcular(); });
  expect(CampanasService.materialize).toHaveBeenCalledWith('campaña', { expected_updated_at: v1 });
  expect(result.current.saved?.updated_at).toBe(v2);
  await act(async () => { await result.current.guardar(); });
  expect(CampanasService.updateCampaign).toHaveBeenCalledWith('campaña', expect.objectContaining({ expected_updated_at: v2 }));
});
test.each(['content', 'channel_id', 'purpose', 'template_id', 'audience', 'default_variables'] as const)('cambiar %s invalida el cálculo visible', async field => {
  const { result, rerender } = renderHook((value: CreateCampaignBody) => useBorradorCampana(value), { initialProps: body() });
  await act(async () => { await result.current.calcular(); });
  expect(result.current.mat?.pending).toBe(2);
  const changes = { content: 'Otro texto', channel_id: 'otro canal', purpose: 'marketing', template_id: 'plantilla',
    audience: { source: 'manual', customer_ids: ['otro cliente'] }, default_variables: { a: '3' } };
  rerender({ ...body(), [field]: changes[field] } as CreateCampaignBody);
  expect(result.current.mat).toBeNull();
  await act(async () => { await expect(result.current.lanzar()).rejects.toMatchObject({ code: 'NOT_MATERIALIZED' }); });
  expect(CampanasService.launch).not.toHaveBeenCalled();
});
test('cambiar el nombre o reordenar las variables no borra un cálculo vigente', async () => {
  const { result, rerender } = renderHook((value: CreateCampaignBody) => useBorradorCampana(value), { initialProps: body() });
  await act(async () => { await result.current.calcular(); });
  rerender({ ...body(), name: 'Otro nombre', default_variables: { b: '2', a: '1' } });
  expect(result.current.mat?.pending).toBe(2);
});
test('la normalización de un segmento en la RPC no invalida su cálculo por campos inactivos del selector', async () => {
  const value: CreateCampaignBody = { ...body(), audience: { source: 'segment', segment_id: 'segmento', pipeline_id: 'pipeline predeterminado', stage_ids: ['etapa anterior'] } };
  jest.mocked(CampanasService.createCampaign).mockResolvedValue({ ...campaign(), statistics: { ...campaign().statistics,
    audience: { source: 'segment', segment_id: 'segmento', pipeline_id: null, stage_ids: [], customer_ids: [], opportunity_ids: [] } } });
  const { result, rerender } = renderHook((input: CreateCampaignBody) => useBorradorCampana(input), { initialProps: value });
  await act(async () => { await result.current.calcular(); });
  expect(result.current.mat?.pending).toBe(2);
  rerender({ ...value, audience: { ...value.audience, pipeline_id: 'otro pipeline' } });
  expect(result.current.mat?.pending).toBe(2);
  rerender({ ...value, audience: { ...value.audience, segment_id: 'otro segmento' } });
  expect(result.current.mat).toBeNull();
});
test('sin versión de la operación falla cerrado y no consulta una versión más reciente para sobrescribir', async () => {
  jest.mocked(CampanasService.materialize).mockResolvedValue({ ...materialized(), campaign_updated_at: undefined });
  const { result } = renderHook(() => useBorradorCampana(body()));
  await act(async () => { await expect(result.current.calcular()).rejects.toMatchObject({ code: 'INVALID_VERSION' }); });
  expect(result.current.saved?.updated_at).toBe(v1);
  expect(result.current.mat).toBeNull();
  expect(result.current.busy).toBeNull();
});
test('RNE conserva su propia versión y reemplaza los contadores por los reales del servidor', async () => {
  jest.mocked(CampanasService.stats).mockResolvedValue({ counts: { total: 2, pending: 1, skipped: 1, queued: 0, sent: 0, delivered: 0, read: 0, replied: 0, failed: 0, cost: 0 },
    by_skip_reason: { rne: 1 }, by_error_code: {}, timeline: [], estimated_cost: null, actual_cost: 0, known_actual_cost: 0, actual_cost_complete: true, unpriced_contacts: 0 });
  const { result } = renderHook(() => useBorradorCampana(body()));
  await act(async () => { await result.current.calcular(); });
  await act(async () => { await result.current.actualizarRne({ id: 'verificación', campaign_updated_at: v3, checked_at: v1, valid_until: '2026-10-31T10:00:00Z', numbers_in_file: 1, checked_targets: 2, excluded_targets: 1, skipped_contacts: 1 }); });
  expect(result.current.saved?.updated_at).toBe(v3);
  expect(result.current.mat).toMatchObject({ pending: 1, skipped: 1, skipped_by_reason: { rne: 1 } });
  await act(async () => { await result.current.guardar(); });
  expect(CampanasService.updateCampaign).toHaveBeenLastCalledWith('campaña', expect.objectContaining({ expected_updated_at: v3 }));
});
test('un conflicto no avanza la versión ni activa la campaña', async () => {
  const { result } = renderHook(() => useBorradorCampana(body()));
  await act(async () => { await result.current.calcular(); });
  jest.mocked(CampanasService.updateCampaign).mockRejectedValue(new ApiError('conflicto', 'CAMPAIGN_MODIFIED', 409));
  await act(async () => { await expect(result.current.lanzar()).rejects.toMatchObject({ status: 409 }); });
  expect(result.current.saved?.updated_at).toBe(v2);
  expect(CampanasService.launch).not.toHaveBeenCalled();
});

test('activar transmite la versión de su propio guardado', async () => {
  jest.mocked(CampanasService.launch).mockResolvedValue({ data: { ...campaign(), effective_status: 'sending' } });
  const { result } = renderHook(() => useBorradorCampana(body()));
  await act(async () => { await result.current.calcular(); });
  await act(async () => { await result.current.lanzar(); });
  expect(CampanasService.launch).toHaveBeenCalledWith('campaña', { scheduled_at: undefined, expected_updated_at: v3 });
});

test('un doble clic no crea dos borradores mientras la primera operación está pendiente', async () => {
  let release!: (value: Campaign) => void;
  jest.mocked(CampanasService.createCampaign).mockImplementation(() => new Promise(resolve => { release = resolve; }));
  const { result } = renderHook(() => useBorradorCampana(body()));
  await act(async () => {
    const first = result.current.calcular();
    await expect(result.current.guardar()).rejects.toMatchObject({ code: 'BUSY' });
    release(campaign());
    await first;
  });
  expect(CampanasService.createCampaign).toHaveBeenCalledTimes(1);
  expect(CampanasService.materialize).toHaveBeenCalledTimes(1);
  expect(result.current.busy).toBeNull();
});
