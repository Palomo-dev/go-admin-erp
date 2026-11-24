/**
 * @jest-environment jsdom
 */
/**
 * Detalle de una llamada en pantalla (Figma 1363:20 listo, 1365:800947
 * transcribiendo, 1365:801445 sin grabación, 1368:17 móvil), con los textos
 * reales de messages/*.json y las rutas del servidor simuladas.
 */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderConIdioma, simularAncho } from '@/test-utils/renderConIdioma';
import { LlamadaDetalle } from '../LlamadaDetalle';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }), usePathname: () => '/app/crm/llamadas/c1', useSearchParams: () => new URLSearchParams() }));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({
  useFormatDate: () => ({
    formatDate: (v: string) => `D(${v})`,
    formatDateTime: (v: string) => `DT(${v})`,
    formatTime: (v: string) => `T(${v})`,
    formatPlain: (v: string) => `P(${v})`,
    getToday: () => '2026-11-15',
    toDate: () => '2026-11-15',
  }),
}));
jest.mock('@/lib/hooks/useOrgCurrency', () => ({ useMonedaOrganizacion: () => ({ code: 'COP', decimals: 0, locale: 'es-CO' }) }));
jest.mock('@/components/ui/use-toast', () => ({ toast: jest.fn(), useToast: () => ({ toast: jest.fn() }) }));
jest.mock('../../CallButton', () => ({ CallButton: ({ label }: { label?: string }) => <button type="button">{label}</button> }));
jest.mock('../../CallLinkPanel', () => ({ CallLinkPanel: () => <div>panel-vincular</div> }));

const LLAMADA = {
  id: 'c1',
  provider: 'twilio',
  direction: 'outbound',
  mode: 'browser',
  status: 'completed',
  from_number: '+576010000000',
  to_number: '+573100000001',
  customer_id: 'cu1',
  opportunity_id: 'op1',
  user_id: 'u1',
  started_at: '2026-09-29T15:42:00Z',
  ended_at: '2026-09-29T15:46:12Z',
  created_at: '2026-09-29T15:42:00Z',
  duration_seconds: 252,
  recording_enabled: true,
  consent_given: true,
  metadata: {},
  recordings: [{ id: 'r1', status: 'ready', duration_seconds: 278, retention_until: '2026-12-28', created_at: '2026-09-29T15:47:00Z' }],
  consents: [],
  customer: { id: 'cu1', full_name: 'Laura Prueba', first_name: 'Laura', last_name: 'Prueba', phone: '+573100000001' },
  opportunity: { id: 'op1', name: 'Renovación anual', amount: 4800000, currency: 'COP', stage_name: 'Propuesta enviada' },
  user: { id: 'u1', first_name: 'Ana', last_name: 'Vendedora', email: null },
  disposition_user: null,
  customer_calls: { count: 3, last_started_at: '2026-11-15T14:00:00Z' },
};

const TRANSCRIPCION = {
  id: 't1',
  status: 'completed',
  provider: 'elevenlabs',
  provider_model: null,
  language: 'spa',
  full_text: '…',
  speaker_count: 2,
  confidence: 0.94,
  duration_seconds: 278,
  cost_amount: null,
  error_code: null,
  error_message: null,
  completed_at: '2026-09-29T15:50:00Z',
  raw_response: null,
  jobs: [],
  segments: [
    { id: 's1', speaker_label: 'ch0', speaker_role: 'agent', start_ms: 4000, end_ms: 9000, text: 'Buenos días, le habla Ana.', confidence: 0.9 },
    { id: 's2', speaker_label: 'ch1', speaker_role: 'customer', start_ms: 130000, end_ms: 140000, text: 'El precio está por encima de lo que pagamos hoy.', confidence: 0.9 },
  ],
};

const ANALISIS = {
  analysis: {
    id: 'a1',
    provider: 'gemini',
    model: null,
    summary: 'Revisó la propuesta de renovación.',
    sentiment: 'positive',
    sentiment_score: 0.72,
    quality_score: null,
    quality_breakdown: null,
    talk_ratio_agent: 0.42,
    talk_ratio_customer: 0.58,
    longest_monologue_seconds: 38,
    questions_asked: 5,
    next_steps: [],
    detected_objections: [{ objection_id: 'o1', label: 'precio', quote: 'el precio está por encima de lo que pagamos', confidence: 0.8 }],
    detected_competitors: [],
    budget_mentioned: null,
    decision_maker_identified: null,
    discovery_fields: null,
    suggested_stage_id: 'st2',
    suggested_stage_confidence: 0.78,
    suggested_tasks: [{ title: 'Enviar propuesta con 8 %', due_date: '2026-10-03' }, { title: 'Llamar por la decisión', due_date: '2026-10-06' }],
    applied: false,
    created_at: '2026-09-29T15:51:00Z',
    raw_response: { applied_actions: [] },
  },
  tags: [],
  objections: [{ id: 'o1', title: 'Precio más alto que el proveedor actual', category: 'precio', recommended_response: 'Comparar por unidad entregada con garantía.' }],
  suggested_stage: { id: 'st2', name: 'Negociación' },
  applied_actions: [],
  policy: 'suggest',
  job: null,
};

let llamadas: { url: string; method: string; body: unknown }[];
const respuesta = (cuerpo: unknown, status = 200) => ({ ok: status < 400, status, json: async () => cuerpo, text: async () => JSON.stringify(cuerpo) });

function simular(llamada: unknown, transcripcion: unknown, analisis: unknown) {
  llamadas = [];
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    llamadas.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (url === '/api/crm/calls/c1') return respuesta({ success: true, data: llamada });
    if (url === '/api/crm/calls/c1/transcript') return transcripcion ? respuesta({ success: true, data: transcripcion }) : respuesta({ success: false, data: { jobs: [], recording: null } }, 404);
    if (url === '/api/crm/calls/c1/analysis') return analisis ? respuesta({ success: true, data: analisis }) : respuesta({ success: false, data: { job: null } }, 404);
    if (url === '/api/crm/calls/c1/analysis/apply') return respuesta({ success: true, data: { applied: ['task:0', 'task:1'], skipped: [] } });
    return respuesta({ error: 'no esperado' }, 404);
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  simularAncho(1440);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

test('listo (1363:20): cabecera, grabación, transcripción, resumen, sentimiento, objeción, tareas y vínculos', async () => {
  simular(LLAMADA, TRANSCRIPCION, ANALISIS);
  renderConIdioma(<LlamadaDetalle callId="c1" />, { idioma: 'es' });
  expect(await screen.findByRole('heading', { name: 'Llamada con Laura Prueba' })).toBeTruthy();
  expect(screen.getByText(/Saliente · navegador · DT\(2026-09-29T15:42:00Z\) · 4:12 · Ana Vendedora/)).toBeTruthy();
  expect(screen.getByText('Se conserva hasta P(2026-12-28)')).toBeTruthy();
  expect(await screen.findByText('Revisó la propuesta de renovación.')).toBeTruthy();
  expect(screen.getByText('es-CO · 2 hablantes · confianza 94 %')).toBeTruthy();
  expect(screen.getByText('Positivo · 72 %')).toBeTruthy();
  expect(screen.getByText('Precio más alto que el proveedor actual')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Ir a 02:10 de la grabación' })).toBeTruthy();
  expect(screen.getByText('Monólogo más largo 38 s · 5 preguntas')).toBeTruthy();
  expect(screen.getByText(/Renovación anual · /)).toBeTruthy();
  expect(screen.getByText('Oportunidad · etapa Propuesta enviada')).toBeTruthy();
  expect(screen.getByText('Cliente · 3 llamadas, última hoy')).toBeTruthy();
  expect(screen.getByText('La IA sugiere mover a «Negociación» (confianza 78 %).')).toBeTruthy();
  expect(screen.getByRole('slider', { name: 'Posición de la grabación' })).toBeTruthy();
});

test('«Crear 2 tareas» aplica solo las tareas por la ruta del análisis', async () => {
  simular(LLAMADA, TRANSCRIPCION, ANALISIS);
  renderConIdioma(<LlamadaDetalle callId="c1" />, { idioma: 'es' });
  fireEvent.click(await screen.findByRole('button', { name: 'Crear 2 tareas' }));
  await waitFor(() => expect(llamadas.some((l) => l.url.endsWith('/analysis/apply'))).toBe(true));
  expect(llamadas.find((l) => l.url.endsWith('/analysis/apply'))!.body).toEqual({ analysisId: 'a1', actions: { tasks: [0, 1] }, ignore_gate: false });
});

test('transcribiendo (1365:800947): resumen en proceso y aviso de transcripción', async () => {
  simular({ ...LLAMADA, recordings: [{ ...LLAMADA.recordings[0], status: 'processing' }] }, { ...TRANSCRIPCION, status: 'processing', segments: [] }, null);
  renderConIdioma(<LlamadaDetalle callId="c1" />, { idioma: 'es' });
  expect(await screen.findByText('Procesando la grabación…')).toBeTruthy();
  expect(await screen.findByText(/Transcribiendo… suele tardar 1–2 minutos/)).toBeTruthy();
  expect(screen.getByText('En proceso')).toBeTruthy();
});

test('sin grabación (1365:801445): notas del vendedor y solo «Vinculada a» a la derecha', async () => {
  simular(
    { ...LLAMADA, recording_enabled: false, consent_given: false, recordings: [], metadata: { disposition_note: 'Confirma interés en renovar.', disposition_at: '2026-09-29T15:47:00Z' }, disposition_user: LLAMADA.user },
    null,
    null,
  );
  renderConIdioma(<LlamadaDetalle callId="c1" />, { idioma: 'es' });
  expect(await screen.findByText('Esta llamada no tiene grabación')).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Notas del vendedor' })).toBeTruthy();
  expect(screen.getByText('Confirma interés en renovar.')).toBeTruthy();
  expect(screen.getByText(/el cliente no aceptó que se grabara/)).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'Resumen' })).toBeNull();
  expect(screen.getByRole('heading', { name: 'Vinculada a' })).toBeTruthy();
});

test('móvil (1368:17): resumen compacto, objeción con su minuto y transcripción plegada', async () => {
  simularAncho(390);
  simular(LLAMADA, TRANSCRIPCION, ANALISIS);
  renderConIdioma(<LlamadaDetalle callId="c1" />, { idioma: 'es' });
  expect(await screen.findByText('Resumen · generado por IA')).toBeTruthy();
  expect(screen.getByText('Objeción · Precio más alto que el proveedor actual (02:10)')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Ver completa' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Crear 2 tareas' })).toBeTruthy();
});
