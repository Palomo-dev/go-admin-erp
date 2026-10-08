/**
 * @jest-environment jsdom
 */
/**
 * Configuración › CRM › Agente de voz: la tarjeta «Cuando el cliente no tiene
 * interés» se mudó aquí desde Agentes IA › Ajustes y sigue guardando igual
 * (misma ruta, mismo cuerpo sin organización). También están el interruptor
 * del agente y los números de prueba, cada uno con su ancla.
 */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import { CONFIG_DESINTERES_POR_DEFECTO } from '@/lib/services/crm/voiceAgent/desinteresConfig';
import { AgenteVozSeccion } from '../AgenteVozSeccion';

jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({ useFormatDate: () => ({ formatDateTime: (v: string) => `F(${v})` }) }));
jest.mock('@/components/ui/use-toast', () => ({ toast: jest.fn() }));

const VISTA = {
  config: { ...CONFIG_DESINTERES_POR_DEFECTO },
  puedeEditar: true,
  monedaBase: 'COP',
  monedas: ['COP', 'USD'],
  etapas: [{ id: 'e1', nombre: 'Negociación', posicion: 2, pipelineId: 'p1', pipelineNombre: 'Ventas', orden: 2, total: 3 }],
};
const AJUSTES_TEL = {
  organization_id: 120,
  phone_number: null,
  voice_caller_id: null,
  voice_recording_enabled: false,
  voice_recording_retention_days: 90,
  voice_consent_message: '',
  voice_ring_timeout_seconds: 30,
  voice_max_concurrent_calls: 1,
  voice_minutes_remaining: 0,
  voice_twiml_app_sid: null,
  voice_agent_enabled: false,
  data_policy_url: null,
  has_subaccount: false,
  consent_voice: 'Polly.Lupe',
  consent_language: 'es-US',
};

let llamadas: { url: string; method: string; body: unknown }[];
const respuesta = (cuerpo: unknown, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(cuerpo), json: async () => cuerpo });

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  llamadas = [];
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    llamadas.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (url === '/api/crm/voice-agents/desinteres') {
      if (method === 'PUT') return respuesta({ success: true, data: { ...VISTA, config: { ...VISTA.config, guardada: true, actualizadaEn: '2026-10-07T15:00:00Z' } } });
      return respuesta({ success: true, data: VISTA });
    }
    if (url === '/api/crm/settings/telephony') return respuesta({ data: AJUSTES_TEL, configured: { api_key: true, twiml_app: true, account: true, source: 'env' }, members: [], can_edit: true });
    if (url === '/api/crm/phone-numbers') return respuesta({ data: [] });
    if (url.startsWith('/api/crm/settings/telephony/test-numbers')) return respuesta({ data: [], max: 10 });
    return respuesta({ error: 'no esperado' }, 404);
  }) as unknown as typeof fetch;
});
afterEach(() => jest.restoreAllMocks());

test('los tres ajustes, cada uno con su ancla para el deep link', async () => {
  const { container } = renderConIdioma(<AgenteVozSeccion />, { idioma: 'es' });
  await screen.findByRole('radiogroup');
  for (const ancla of ['interruptor', 'numeros-prueba', 'desinteres']) expect(container.querySelector(`#${ancla}`)).not.toBeNull();
  expect(await screen.findByRole('switch', { name: /agente/i })).toBeTruthy();
  expect(screen.getAllByText('Qué hace')).toHaveLength(2);
});

test('la tarjeta del desinterés guarda igual desde su nuevo sitio', async () => {
  renderConIdioma(<AgenteVozSeccion />, { idioma: 'es' });
  fireEvent.click(await screen.findByRole('radio', { name: /Solo dejar una tarea/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  await waitFor(() => expect(llamadas.some((l) => l.method === 'PUT')).toBe(true));
  const put = llamadas.find((l) => l.method === 'PUT')!;
  expect(put.url).toBe('/api/crm/voice-agents/desinteres');
  expect(put.body).toEqual({ modo: 'task_only', excepcionValor: { activa: false, monto: null, moneda: 'COP' }, excepcionEtapa: { activa: false, etapaId: null } });
});

test('el interruptor del agente se guarda con la ruta de telefonía de siempre', async () => {
  renderConIdioma(<AgenteVozSeccion />, { idioma: 'es' });
  const sw = await screen.findByRole('switch', { name: /agente/i });
  fireEvent.click(sw);
  await waitFor(() => expect(llamadas.some((l) => l.url === '/api/crm/settings/telephony' && l.method === 'PATCH')).toBe(true));
  expect(llamadas.find((l) => l.method === 'PATCH')!.body).toEqual({ voice_agent_enabled: true });
});
