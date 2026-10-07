/**
 * @jest-environment jsdom
 */
/**
 * «Cuando el cliente no tiene interés» (Agentes IA › Ajustes) en los cuatro
 * idiomas: grupo de radio accesible, excepciones, validación en el cliente
 * igual que el servidor, solo lectura sin permiso y cuerpo sin organización.
 */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderConIdioma, type IdiomaPrueba } from '@/test-utils/renderConIdioma';
import { CONFIG_DESINTERES_POR_DEFECTO } from '@/lib/services/crm/voiceAgent/desinteresConfig';
import { DesinteresVozCard } from '../DesinteresVozCard';

jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({ useFormatDate: () => ({ formatDateTime: (v: string) => `F(${v})` }) }));
jest.mock('@/components/ui/use-toast', () => ({ toast: jest.fn() }));

const VISTA = {
  config: { ...CONFIG_DESINTERES_POR_DEFECTO },
  puedeEditar: true,
  monedaBase: 'COP',
  monedas: ['COP', 'USD'],
  etapas: [{ id: 'e1', nombre: 'Negociación', posicion: 2, pipelineId: 'p1', pipelineNombre: 'Ventas', orden: 2, total: 3 }],
};

let llamadas: { method: string; body: unknown }[];
const respuesta = (cuerpo: unknown, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(cuerpo), json: async () => cuerpo });
function servidor(vista = VISTA, respuestaPut?: { status: number; json: unknown }) {
  llamadas = [];
  global.fetch = jest.fn(async (_url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    llamadas.push({ method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (method === 'PUT') {
      const r = respuestaPut ?? { status: 200, json: { success: true, data: { ...vista, config: { ...vista.config, guardada: true, actualizadaEn: '2026-10-07T15:00:00Z' } } } };
      return respuesta(r.json, r.status);
    }
    return respuesta({ success: true, data: vista });
  }) as unknown as typeof fetch;
}

beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => undefined));
afterEach(() => jest.restoreAllMocks());

describe.each(['es', 'en', 'fr', 'pt'] as IdiomaPrueba[])('idioma %s', (idioma) => {
  test('pinta los tres modos como grupo de radio, con el de por defecto marcado', async () => {
    servidor();
    renderConIdioma(<DesinteresVozCard />, { idioma });
    const grupo = await screen.findByRole('radiogroup');
    const radios = Array.from(grupo.querySelectorAll('[role="radio"]'));
    expect(radios).toHaveLength(3);
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false']);
    expect(screen.getAllByRole('switch')).toHaveLength(2);
  });
});

describe('comportamiento (es)', () => {
  test('cambiar de modo y guardar manda el cuerpo sin organización', async () => {
    servidor();
    renderConIdioma(<DesinteresVozCard />, { idioma: 'es' });
    fireEvent.click(await screen.findByRole('radio', { name: /Solo dejar una tarea/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(llamadas.some((l) => l.method === 'PUT')).toBe(true));
    const put = llamadas.find((l) => l.method === 'PUT')?.body as Record<string, unknown>;
    expect(put).toEqual({ modo: 'task_only', excepcionValor: { activa: false, monto: null, moneda: 'COP' }, excepcionEtapa: { activa: false, etapaId: null } });
  });

  test('excepción por valor sin monto: error en el campo y no se llama al servidor', async () => {
    servidor();
    renderConIdioma(<DesinteresVozCard />, { idioma: 'es' });
    fireEvent.click(await screen.findByRole('switch', { name: /No cerrar oportunidades de valor alto/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Escribe el monto.')).toBeTruthy();
    expect(llamadas.filter((l) => l.method === 'PUT')).toHaveLength(0);
  });

  test('el error de campo que devuelve el servidor se muestra en su campo', async () => {
    servidor(VISTA, { status: 400, json: { success: false, code: 'moneda_invalida', error: 'La moneda no existe' } });
    renderConIdioma(<DesinteresVozCard />, { idioma: 'es' });
    fireEvent.click(await screen.findByRole('switch', { name: /No cerrar oportunidades de valor alto/ }));
    const monto = screen.getByRole('textbox', { name: /Monto mínimo/ });
    fireEvent.change(monto, { target: { value: '20000000' } });
    fireEvent.blur(monto);
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Elige una moneda de la lista.')).toBeTruthy();
    expect(llamadas.find((l) => l.method === 'PUT')?.body).toMatchObject({ excepcionValor: { activa: true, monto: 20000000, moneda: 'COP' } });
  });

  test('sin permiso: solo lectura, controles deshabilitados y sin botones', async () => {
    servidor({ ...VISTA, puedeEditar: false });
    renderConIdioma(<DesinteresVozCard />, { idioma: 'es' });
    expect(await screen.findByText(/Solo lectura/)).toBeTruthy();
    for (const r of screen.getAllByRole('radio')) expect((r as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Guardar' })).toBeNull();
  });
});
