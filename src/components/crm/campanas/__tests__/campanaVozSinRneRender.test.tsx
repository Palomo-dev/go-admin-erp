/** @jest-environment jsdom */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import { pedirCrm } from '@/components/crm/acciones/apiCrm';
import { fetchJson } from '@/lib/utils/fetchJson';
import { CampanaNuevaPage } from '../nuevo/CampanaNuevaPage';

const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }), useSearchParams: () => new URLSearchParams('segment_id=segmento') }));
jest.mock('@/lib/hooks/useOrganization', () => ({ useOrganization: () => ({ organization: { id: 120 } }) }));
jest.mock('@/components/shell/header/cabeceraMovil', () => ({ useCabeceraMovil: () => undefined }));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({ useFormatDate: () => ({ timezone: 'America/Bogota' }) }));
jest.mock('../nuevo/AudienceStep', () => ({ AudienceStep: () => <div>Audiencia seleccionada</div> }));
jest.mock('@/components/crm/segmentos/useSegmentosData', () => ({ useSegmentosData: () => ({ data: [{ id: 'segmento', name: 'Contactos', counts_json: { voice_contactable: 10 } }] }) }));
jest.mock('@/components/crm/whatsapp/compose/useWhatsAppCompose', () => ({ useWhatsAppCompose: () => ({ variables: {}, tab: 'template' }) }));
jest.mock('@/components/crm/acciones/apiCrm', () => ({ pedirCrm: jest.fn(), ErrorApiCrm: class extends Error {} }));
jest.mock('@/lib/utils/fetchJson', () => ({ fetchJson: jest.fn() }));

const request = jest.mocked(pedirCrm);
let policy = true;
let minutes = 30;
let cap: number | null = 3;
const v1 = '2026-10-04T10:00:00.123456Z';
const v2 = '2026-10-04T10:01:00.123457Z';
beforeEach(() => {
  jest.clearAllMocks(); policy = true; minutes = 30; cap = 3;
  request.mockImplementation(async (url, options) => {
    if (url.endsWith('/diagnostics')) return { data: { maxConcurrentCalls: cap, organizacion: policy ? [] : [{ codigo: 'sin_politica_datos' }] }, extra: {} } as never;
    if (url.endsWith('/voice-agents')) return { data: [{ id: 'agente', name: 'Ana', is_active: true, language: 'es', description: 'Seguimiento comercial' }], extra: {} } as never;
    if (options?.method === 'POST') return { data: { id: 'campana', updated_at: v1, status: 'draft' }, extra: {} } as never;
    if (options?.method === 'PATCH') return { data: { id: 'campana', updated_at: v2, status: 'running' }, extra: {} } as never;
    return { data: [], extra: { can_manage: true } } as never;
  });
  jest.mocked(fetchJson).mockImplementation(async () => ({ comm: { voice_minutes_remaining: minutes } }) as never);
});

async function preparar() {
  renderConIdioma(<CampanaNuevaPage />, { idioma: 'es' });
  fireEvent.change(await screen.findByLabelText(/Nombre de la campaña/), { target: { value: 'Seguimiento' } });
  fireEvent.click(screen.getAllByRole('button', { name: 'Siguiente' })[0]);
  fireEvent.click(screen.getByRole('radio', { name: /Ana/ }));
  fireEvent.change(screen.getByLabelText(/Objetivo de la campaña/), { target: { value: 'Agendar una reunión' } });
}

test('los topes se pueden elegir y activar no exige RNE ni un guardado previo', async () => {
  await preparar();
  const concurrent = screen.getByLabelText('Llamadas simultáneas') as HTMLInputElement;
  expect((screen.getByLabelText('Máximo por día') as HTMLInputElement).value).toBe('120');
  expect((screen.getByLabelText('Máximo por hora') as HTMLInputElement).value).toBe('40');
  expect(concurrent.value).toBe('5');
  expect(concurrent.max).toBe('3');
  expect((screen.getAllByRole('button', { name: 'Siguiente' })[0] as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(concurrent, { target: { value: '2' } });
  fireEvent.change(screen.getByLabelText('Máximo por día'), { target: { value: '80' } });
  fireEvent.change(screen.getByLabelText('Máximo por hora'), { target: { value: '15' } });
  fireEvent.click(screen.getAllByRole('button', { name: 'Siguiente' })[0]);
  expect(screen.queryByText(/RNE/)).toBeNull();
  expect(document.querySelector('input[type="file"]')).toBeNull();
  fireEvent.click(screen.getAllByRole('button', { name: 'Siguiente' })[0]);
  fireEvent.click(screen.getAllByRole('button', { name: 'Activar campaña' })[0]);
  await waitFor(() => expect(push).toHaveBeenCalledWith('/app/crm/campanas/campana?tipo=voz'));
  const creation = request.mock.calls.find(([, options]) => options?.method === 'POST');
  expect(creation?.[1]?.cuerpo).toMatchObject({ max_calls_per_day: 80, max_calls_per_hour: 15, max_concurrent: 2, status: 'draft' });
  expect(request.mock.calls.find(([, options]) => options?.method === 'PATCH')?.[1]?.cuerpo).toEqual({ status: 'running', emergency_stop: false, expected_updated_at: v1 });
  expect(request.mock.calls.some(([url]) => url.includes('/rne'))).toBe(false);
});

test.each(['política', 'minutos'])('sin %s continúa bloqueada la activación de voz', async missing => {
  if (missing === 'política') policy = false;
  else minutes = 0;
  await preparar();
  fireEvent.change(screen.getByLabelText('Llamadas simultáneas'), { target: { value: '2' } });
  fireEvent.click(screen.getAllByRole('button', { name: 'Siguiente' })[0]);
  fireEvent.click(screen.getAllByRole('button', { name: 'Siguiente' })[0]);
  expect((screen.getAllByRole('button', { name: 'Activar campaña' })[0] as HTMLButtonElement).disabled).toBe(true);
  expect(request.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false);
});

test('si no se pudo leer el cupo de la organización, no permite avanzar ni crear', async () => {
  cap = null;
  await preparar();
  expect(screen.getByText(/No se pudo comprobar el máximo de llamadas simultáneas/)).toBeTruthy();
  expect((screen.getAllByRole('button', { name: 'Siguiente' })[0] as HTMLButtonElement).disabled).toBe(true);
  expect(request.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false);
});
