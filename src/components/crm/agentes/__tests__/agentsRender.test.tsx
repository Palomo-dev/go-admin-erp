/** @jest-environment jsdom */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderConIdioma, simularAncho } from '@/test-utils/renderConIdioma';
import es from '../../../../../messages/es.json';
import en from '../../../../../messages/en.json';
import fr from '../../../../../messages/fr.json';
import pt from '../../../../../messages/pt.json';
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }), usePathname: () => '/app/crm/agentes-ia', useSearchParams: () => new URLSearchParams() }));
jest.mock('@/lib/security/webhookSignatures', () => ({}));
jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));
jest.mock('@/components/crm/agentes/VoicesPanel', () => ({ VoicesPanel: () => null }));
jest.mock('@/components/crm/agentes/AgentCampaignsPanel', () => ({ AgentCampaignsPanel: () => null }));
jest.mock('@/components/crm/agentes/useVoiceCatalog', () => ({ useVoiceCatalog: () => ({ voices: [], defaultVoice: null, loading: false, error: null, reload: jest.fn() }) }));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({ useOrgTimezone: () => ({ timezone: 'UTC' }), useFormatDate: () => ({ formatDateTime: (v: string) => v }) }));
import { AgentesIaPage } from '../AgentesIaPage';
import { AgentEditorDialog } from '../AgentEditorDialog';
import { AgentTestTab } from '../editor/AgentTestTab';
import { EMPTY_AGENT_FORM } from '../editor/useAgentForm';
const ID = '10000000-0000-4000-8000-000000000001';
const form = { ...EMPTY_AGENT_FORM, name: 'Agente de prueba', identity_disclosure: 'Asistente IA', llm_model: 'modelo-catálogo' };
const metrics = { total: 1, effective: 1, average_duration_seconds: 20, credits_consumed: 2, statuses: [{ status: 'completed', total: 1 }], tools: [], rows: [{ id: ID, call_id: ID, customer_name: 'Cliente de prueba', status: 'completed', outcome: null, duration_seconds: 20, created_at: '2026-10-01T23:00:00Z', source: 'direct', last_error_code: null }] };
let fetchMock: jest.Mock; let errors: jest.SpyInstance;
beforeEach(() => {
  simularAncho(1440); errors = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  fetchMock = jest.fn(async (url: string) => ({ ok: true, status: 200, json: async () => url === '/api/chat/ai/modelos' ? { proveedores: [{ value: 'openai', usable: true }], modelos: [{ provider: 'openai', value: 'modelo-catálogo', label: 'Modelo de catálogo', recomendado: true, gama: 'economico' }] } : { success: true, data: url.includes('/metrics?') ? metrics : url.endsWith('/editor-context') ? { pipelines: [], products: [], data_policy_url: null } : url.endsWith('/stage-agents') ? [] : url.endsWith(`/${ID}`) ? form : [{ id: ID, ...form }] } }));
  global.fetch = fetchMock;
});
afterEach(() => { const messages = errors.mock.calls.map(call => String(call[0] instanceof Error ? call[0].message : call[0])).filter(message => /MISSING_MESSAGE|FORMATTING_ERROR|INVALID_MESSAGE/.test(message)); errors.mockRestore(); expect(messages).toEqual([]); });
test.each(['es','en','fr','pt'] as const)('lista, métricas y cinco pasos con Intl real %s', async idioma => {
  const m = { es, en, fr, pt }[idioma].crm.agentesIa;
  const page = renderConIdioma(<AgentesIaPage />, { idioma }); await screen.findByText('Agente de prueba'); fireEvent.click(screen.getByRole('button', { name: m.detailAction })); await screen.findByText('Cliente de prueba');
  expect(screen.getByRole('link', { name: new RegExp(m.openCall) }).getAttribute('href')).toBe(`/app/crm/llamadas/${ID}`); page.unmount();
  renderConIdioma(<AgentEditorDialog draft={{ mode: 'edit', id: ID }} onClose={jest.fn()} onSaved={jest.fn()} />, { idioma });
  await screen.findByDisplayValue('Agente de prueba');
  for (let step = 0; step < 4; step++) { fireEvent.click(screen.getByRole('button', { name: m.next })); await waitFor(() => expect(screen.getByRole('button', { name: step === 3 ? m.save : m.next })).toBeTruthy()); if (step === 2) expect((screen.getByRole('checkbox', { name: new RegExp(m.tools.end_call) }) as HTMLInputElement).disabled).toBe(true); }
  expect(screen.getByText(m.testTitle)).toBeTruthy(); expect(screen.getByLabelText(m.fictionalCustomer)).toBeTruthy();
});
test('sandbox envía sólo historia user/assistant y draft, muestra sugerencia real y reinicia sinfixture', async () => {
  const onTested = jest.fn(); const m = es.crm.agentesIa;
  fetchMock.mockImplementation(async (url: string) => ({ ok: true, status: 200, json: async () => ({ success: true, data: url.endsWith('/test') ? { reply: 'Sugeriría una tarea.', model: 'modelo-real', tool_calls: [{ id: 't1', name: 'create_task', args: { title: 'Consulta' }, status: 'suggested' }], usage: { prompt_tokens: 10, completion_tokens: 10 }, credits: 1, cost_amount: null, dry_run: true } : [] }) }));
  renderConIdioma(<AgentTestTab form={form} agentId={ID} onTested={onTested} />);
  fireEvent.change(screen.getByLabelText(m.fictionalCustomer), { target: { value: 'Cliente ficticio' } }); fireEvent.change(screen.getByLabelText(m.message), { target: { value: 'Quiero una tarea' } }); fireEvent.click(screen.getByRole('button', { name: m.send }));
  await screen.findByText('Sugeriría una tarea.'); expect(onTested).toHaveBeenCalledTimes(1);
  const request = fetchMock.mock.calls.find(call => call[0].endsWith('/test'));
  expect(JSON.parse(request![1].body)).toMatchObject({ customer: { name: 'Cliente ficticio' }, history: [], draft: { name: 'Agente de prueba' } });
  expect(request![0]).toBe(`/api/crm/voice-agents/${ID}/test`);
  fireEvent.click(screen.getByRole('button', { name: m.reset })); expect(screen.queryByText('Sugeriría una tarea.')).toBeNull();
});
test('fallo de lectura no habilita editor vacío y muestra retry', async () => {
  fetchMock.mockImplementation(async () => ({ ok: false, status: 503, json: async () => ({ success: false }) }));
  renderConIdioma(<AgentEditorDialog draft={{ mode: 'edit', id: ID }} onClose={jest.fn()} onSaved={jest.fn()} />);
  await screen.findByText(es.crm.agentesIa.loadError);
  expect(screen.getAllByRole('button', { name: /Reintentar/ }).length).toBeGreaterThan(0);
  expect(screen.queryByLabelText(es.crm.agentesIa.name)).toBeNull();
  expect((screen.getByRole('button', { name: es.crm.agentesIa.next }) as HTMLButtonElement).disabled).toBe(true);
});

test('validación de campos requeridos avisa sin crear un agente ni perder borrador', async () => {
  renderConIdioma(<AgentEditorDialog draft={{ mode: 'create' }} onClose={jest.fn()} onSaved={jest.fn()} />);
  await waitFor(() => expect(screen.getByLabelText(es.crm.agentesIa.model)).toBeTruthy());
  fireEvent.change(screen.getByLabelText(es.crm.agentesIa.name), { target: { value: 'Borrador' } });
  fireEvent.click(screen.getByRole('button', { name: es.crm.agentesIa.next }));
  await screen.findByText(es.crm.agentesIa.required);
  expect(screen.getByDisplayValue('Borrador')).toBeTruthy();
  expect(fetchMock.mock.calls.some(call => call[1]?.method === 'POST')).toBe(false);
});
