/** @jest-environment jsdom */
import { act, fireEvent, renderHook, screen, waitFor } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import { CallDetailPage } from '../CallDetailPage';
import type { CallIntelligenceState } from '@/components/crm/calls/useCallIntelligence';
import { useCallAnalysisActions } from '@/components/crm/calls/useCallAnalysisActions';

const ID = '10000000-0000-4000-8000-000000000001';
const customerId = '20000000-0000-4000-8000-000000000001', opportunityId = '30000000-0000-4000-8000-000000000001';
const mockToast = jest.fn();
jest.mock('@/components/ui/use-toast', () => ({ toast: (...args: unknown[]) => mockToast(...args), useToast: () => ({ toast: mockToast }) }));
jest.mock('../CallButton', () => ({ CallButton: ({ label }: { label: string }) => <button>{label}</button> }));
jest.mock('@/components/shell/header/cabeceraMovil', () => ({ useCabeceraMovil: jest.fn() }));
jest.mock('@/components/crm/shared/useCrmLookups', () => ({ useCrmLookups: () => ({ pipelines: [], stages: [], loading: false }) }));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({ useFormatDate: () => ({ formatDate: (value: string) => value, formatDateTime: () => '01/10/2026 23:42' }) }));
jest.mock('@/components/crm/pipeline/GateWarningDialog', () => ({ GateWarningDialog: ({ open, onConfirm }: { open: boolean; onConfirm: () => void }) => open ? <button onClick={onConfirm}>Confirmar gate</button> : null }));
jest.mock('@/components/crm/calls/useCallIntelligence', () => ({ ...jest.requireActual('@/components/crm/calls/useCallIntelligence'), useCallIntelligence: () => mockState }));

let mockState: CallIntelligenceState;
let originalFetch: typeof fetch, originalAudio: typeof Audio;
const getCall = () => ({ id: ID, customer_id: customerId, opportunity_id: opportunityId, direction: 'outbound', mode: 'browser', started_at: '2026-10-02T04:42:00Z', duration_seconds: 252,
  recording_enabled: true, recordings: [{ id: 'recording', status: 'ready', duration_seconds: 278 }], consents: [{ consent_type: 'recording', method: 'verbal' }],
  customer: { id: customerId, full_name: 'Contacto de prueba' }, opportunity: { id: opportunityId, name: 'Renovación', amount: 100, currency: 'COP', etapa: { name: 'Propuesta' } } });
class FakeAudio {
  static instances: FakeAudio[] = []; duration = 278; currentTime = 0; playbackRate = 1;
  play = jest.fn(async () => undefined); pause = jest.fn(); onloadedmetadata: (() => void) | null = null;
  constructor(readonly src: string) { FakeAudio.instances.push(this); }
}
beforeEach(() => {
  originalFetch = global.fetch; originalAudio = global.Audio; FakeAudio.instances = []; mockToast.mockReset();
  global.Audio = FakeAudio as unknown as typeof Audio;
  mockState = { transcript: { status: 'completed', language: 'es-CO', speaker_count: 2, segments: [{ id: 'segment', start_ms: 130000, end_ms: 150000, text: 'El precio está alto', speaker_role: 'customer', speaker_label: 'speaker_1', confidence: .9 }] } as never,
    analysis: { analysis: { id: 'analysis', summary: 'Resumen real de prueba.', sentiment: 'positive', sentiment_score: .72, talk_ratio_agent: .42, longest_monologue_seconds: 38, questions_asked: 5, detected_objections: [{ objection_id: 'catalog', label: 'Precio', quote: 'El precio está alto', confidence: .9 }], suggested_tasks: [{ title: 'Enviar propuesta' }, { title: 'Seguimiento' }], suggested_stage_id: 'stage', suggested_stage_confidence: .78, quality_score: null } as never,
      objections: [{ id: 'catalog', title: 'Precio', recommended_response: 'Respuesta de catálogo', category: 'price' }], tags: [], suggested_stage: { id: 'stage', name: 'Negociación' }, applied_actions: [], policy: 'suggest' },
    loading: false, busy: false, error: null, setBusy: jest.fn(), refetch: jest.fn(async () => undefined) };
  global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ success: true, data: getCall() }) })) as unknown as typeof fetch;
});
afterEach(() => { global.fetch = originalFetch; global.Audio = originalAudio; });

test('la ficha ordena grabación, tarjetas y transcripción sin pestañas y usa vínculos canónicos', async () => {
  renderConIdioma(<CallDetailPage id={ID} />);
  expect(await screen.findByText('Resumen real de prueba.')).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Sentimiento y conversación' })).toBeTruthy();
  expect(screen.getByText('Monólogo más largo 38 s · 5 preguntas')).toBeTruthy();
  expect(screen.queryByText(/preguntas abiertas|mejoró desde/i)).toBeNull();
  expect(screen.queryByRole('tablist')).toBeNull();
  expect(screen.getByRole('link', { name: /Renovación/ }).getAttribute('href')).toBe(`/app/crm/oportunidades/${opportunityId}`);
  expect(screen.getByRole('link', { name: /Contacto de prueba/ }).getAttribute('href')).toBe(`/app/clientes/${customerId}`);
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

test('crear tareas respeta la selección y usa el escritor original con analysisId', async () => {
  renderConIdioma(<CallDetailPage id={ID} />); await screen.findByText('Resumen real de prueba.');
  fireEvent.click(screen.getByRole('checkbox', { name: 'Seleccionar tarea: Enviar propuesta' }));
  fireEvent.click(screen.getAllByRole('button', { name: 'Crear 1 tarea' })[0]);
  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(`/api/crm/calls/${ID}/analysis/apply`, expect.objectContaining({ method: 'POST' })));
  const calls = (global.fetch as jest.Mock).mock.calls, body = JSON.parse(calls.find((call) => call[1]?.method === 'POST')[1].body);
  expect(body).toEqual({ analysisId: 'analysis', actions: { tasks: [1] }, ignore_gate: false });
  expect(mockState.refetch).toHaveBeenCalledTimes(1);
});

test('el cambio de etapa conserva el gate y sólo lo ignora después de confirmar', async () => {
  (global.fetch as jest.Mock).mockImplementation(async (_url: string, init?: RequestInit) => ({ ok: init?.method !== 'POST', status: init?.method === 'POST' ? 409 : 200, json: async () => init?.method === 'POST' ? { data: { gate: { missing: [{ label: 'Presupuesto' }] } } } : { success: true, data: getCall() } }));
  renderConIdioma(<CallDetailPage id={ID} />); await screen.findByText('Resumen real de prueba.');
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Confirmar gate' }));
  await waitFor(() => expect((global.fetch as jest.Mock).mock.calls.filter((call) => call[1]?.method === 'POST')).toHaveLength(2));
  const bodies = (global.fetch as jest.Mock).mock.calls.filter((call) => call[1]?.method === 'POST').map((call) => JSON.parse(call[1].body));
  expect(bodies.map((body) => body.ignore_gate)).toEqual([false, true]);
});

test('el deep link y el clic repetido en un segmento usan un solo audio y ninguna segunda lectura del detalle', async () => {
  const view = renderConIdioma(<CallDetailPage id={ID} startMs={130000} />);
  await waitFor(() => expect(FakeAudio.instances).toHaveLength(1));
  const audio = FakeAudio.instances[0]; expect(audio.currentTime).toBe(130);
  fireEvent.click(screen.getByRole('button', { name: 'Ir a 02:10, Contacto de prueba' }));
  await waitFor(() => expect(audio.play).toHaveBeenCalledTimes(2));
  expect(global.fetch).toHaveBeenCalledTimes(1); view.unmount(); expect(audio.pause).toHaveBeenCalled();
});

test('403 al cambiar de organización retira la ficha y cancela el reproductor previo', async () => {
  renderConIdioma(<CallDetailPage id={ID} startMs={0} />); await waitFor(() => expect(FakeAudio.instances).toHaveLength(1));
  (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 403, json: async () => ({ success: false, code: 'sin_permiso', error: 'sin_permiso' }) });
  await act(async () => window.dispatchEvent(new Event('organization-changed')));
  await waitFor(() => expect(screen.queryByText('Resumen real de prueba.')).toBeNull());
  expect(FakeAudio.instances[0].pause).toHaveBeenCalled();
});

test.each([['es', 'Resumen'], ['en', 'Summary'], ['fr', 'Résumé'], ['pt', 'Resumo']] as const)('la composición de ficha se traduce a %s', async (idioma, heading) => {
  renderConIdioma(<CallDetailPage id={ID} />, { idioma });
  expect(await screen.findByRole('heading', { name: heading })).toBeTruthy();
});

test('nuevo análisis restablece tareas descartadas y selección sin heredar índices de otro resultado', async () => {
  const view = renderConIdioma(<CallDetailPage id={ID} />); await screen.findByText('Resumen real de prueba.');
  fireEvent.click(screen.getByRole('checkbox', { name: 'Seleccionar tarea: Enviar propuesta' }));
  fireEvent.click(screen.getByRole('button', { name: 'Descartar' }));
  expect(screen.queryByRole('checkbox', { name: 'Seleccionar tarea: Enviar propuesta' })).toBeNull();
  mockState.analysis = { ...mockState.analysis!, analysis: { ...mockState.analysis!.analysis!, id: 'analysis-new', suggested_tasks: [{ title: 'Nueva tarea' }] } };
  view.rerender(<CallDetailPage id={ID} />);
  expect(screen.getByRole('checkbox', { name: 'Seleccionar tarea: Nueva tarea' }).getAttribute('data-state')).toBe('checked');
});

test('Aplicar todo avanzado conserva etiquetas, discovery y objeciones del escritor original', async () => {
  renderConIdioma(<CallDetailPage id={ID} />); await screen.findByText('Resumen real de prueba.');
  fireEvent.click(screen.getByText('Más datos del análisis'));
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar todo' }));
  await waitFor(() => expect((global.fetch as jest.Mock).mock.calls.some((call) => call[1]?.method === 'POST')).toBe(true));
  const call = (global.fetch as jest.Mock).mock.calls.find((entry) => entry[1]?.method === 'POST');
  expect(JSON.parse(call[1].body).actions).toEqual({ stage: true, tasks: 'all', tags: true, discovery: true, objections: true });
});

test('un job de análisis fallido muestra aviso y reintento en el endpoint nativo', async () => {
  mockState.analysis = { ...mockState.analysis!, analysis: null, job: { id: 'job', kind: 'analyze', status: 'failed', attempts: 1, last_error: 'PROVIDER_ERROR' } };
  renderConIdioma(<CallDetailPage id={ID} />);
  expect((await screen.findByRole('alert')).textContent).toContain('No se pudo cargar el análisis.');
  fireEvent.click(screen.getByRole('button', { name: 'Analizar' }));
  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(`/api/crm/calls/${ID}/analyze`, expect.objectContaining({ method: 'POST' })));
});

test('un gate del análisis A se cierra al recibir B y una confirmación obsoleta no aplica B', async () => {
  (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 409, json: async () => ({ data: { gate: { missing: [{ label: 'Presupuesto' }] } } }) });
  const { result, rerender } = renderHook(({ state }) => useCallAnalysisActions(ID, state), { initialProps: { state: mockState } });
  await act(async () => result.current.apply({ stage: true }, 'stage'));
  expect(result.current.gate?.analysisId).toBe('analysis');
  const oldConfirm = result.current.confirmGate;
  rerender({ state: { ...mockState, analysis: { ...mockState.analysis!, analysis: { ...mockState.analysis!.analysis!, id: 'analysis-new' } } } });
  expect(result.current.gate).toBeNull();
  await act(async () => oldConfirm());
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

test('un 409 tardío de A no abre la confirmación cuando ya se muestra B', async () => {
  let resolve!: (value: unknown) => void;
  (global.fetch as jest.Mock).mockImplementation(() => new Promise((done) => { resolve = done; }));
  const { result, rerender } = renderHook(({ state }) => useCallAnalysisActions(ID, state), { initialProps: { state: mockState } });
  let applying!: Promise<void>;
  act(() => { applying = result.current.apply({ stage: true }, 'stage'); });
  rerender({ state: { ...mockState, analysis: { ...mockState.analysis!, analysis: { ...mockState.analysis!.analysis!, id: 'analysis-new' } } } });
  await act(async () => { resolve({ ok: false, status: 409, json: async () => ({ data: { gate: { missing: [{ label: 'Presupuesto' }] } } }) }); await applying; });
  expect(result.current.gate).toBeNull(); expect(global.fetch).toHaveBeenCalledTimes(1);
});

test('transcripción fallida ofrece el reintento del escritor nativo sin anunciar procesamiento', async () => {
  mockState.transcript = { ...mockState.transcript!, status: 'failed', provider: 'pending', error_code: 'PROVIDER_ERROR', error_message: 'timeout', jobs: [{ id: 'job', kind: 'transcribe', status: 'failed', attempts: 1, last_error: 'PROVIDER_ERROR' }] };
  renderConIdioma(<CallDetailPage id={ID} />); await screen.findByText('El proveedor no respondió');
  expect(screen.queryByText(/Transcribiendo con/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(`/api/crm/calls/${ID}/transcribe`, expect.objectContaining({ method: 'POST' })));
});
