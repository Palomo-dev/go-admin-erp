/**
 * @jest-environment jsdom
 *
 * CRM ola 3A · acciones rápidas (Figma 773:472568 / 773:472975) y bloque CRM
 * de la ficha única del cliente (D1, Figma 772:19838 / 772:20628): el motivo
 * de cada acción deshabilitada se ve, y cada acción escribe por su ruta del
 * servidor (`/api/crm/notes`, `/api/crm/tasks`, `/api/crm/opportunities`).
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import { contextoMoneda } from '@/lib/utils/moneda';
import es from '../../../../../messages/es.json';
import en from '../../../../../messages/en.json';
import fr from '../../../../../messages/fr.json';
import pt from '../../../../../messages/pt.json';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }), usePathname: () => '/app/clientes/c1' }));
const FECHAS = { timezone: 'America/Bogota', getToday: () => '2026-09-23', formatDate: (v: string) => v, formatDateTime: (v: string) => v, formatTime: (v: string) => v, formatPlain: (v: string) => v };
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({ useFormatDate: () => FECHAS }));
const COP = { ...contextoMoneda('COP', { locale: 'es-CO' }), formatear: String, paraDocumento: () => contextoMoneda('COP', { locale: 'es-CO' }), resuelta: true };
jest.mock('@/lib/hooks/useOrgCurrency', () => ({ useMonedaOrganizacion: () => COP }));
jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));
jest.mock('@/components/voice/SoftphoneProvider', () => ({ useSoftphone: () => ({ available: false }) }));
jest.mock('@/components/voice/hooks/useCallModePolicy', () => ({ useCallModePolicy: () => ({ decision: null }) }));
jest.mock('@/components/crm/shared/useOrgDefaultCountry', () => ({ useOrgDefaultCountry: () => '57' }));
jest.mock('@/components/ui/use-toast', () => ({ toast: jest.fn() }));

import { AccionesRapidasCrm } from '../AccionesRapidasCrm';
import { invalidarCatalogosCrm } from '../useCatalogosCrm';
import { useFichaClienteCrm } from '@/components/crm/ficha/useFichaClienteCrm';

type Llamada = { url: string; method: string; body: Record<string, unknown> | undefined };
let llamadas: Llamada[];
const EVENTOS: string[] = [];

beforeEach(() => {
  invalidarCatalogosCrm();
  llamadas = [];
  global.fetch = jest.fn(async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = String(entrada);
    const method = init?.method ?? 'GET';
    llamadas.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const data =
      url === '/api/crm/permisos'
        ? { usuario_id: 'u1', permisos: { 'crm.opportunities.create': true } }
        : url === '/api/crm/pipelines'
          ? [{ id: 'p1', name: 'Ventas', pipeline_type: 'sales', is_default: true, stages: [{ id: 's1', name: 'Nuevo', position: 1, probability: 10 }] }]
          : url === '/api/crm/teams/org-members'
            ? [{ id: 'u1', name: 'Carlos Ruiz', email: null }]
            : { id: 'nuevo' };
    return { ok: true, status: method === 'GET' ? 200 : 201, json: async () => ({ success: true, data }) } as Response;
  }) as typeof fetch;
  window.addEventListener('crm:entity-changed', (e) => EVENTOS.push((e as CustomEvent<{ accion: string }>).detail.accion));
});

let errores: jest.SpyInstance;
beforeEach(() => {
  errores = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  const intl = errores.mock.calls.map((c) => String(c[0] instanceof Error ? c[0].message : c[0])).filter((m) => /MISSING_MESSAGE|FORMATTING_ERROR|INVALID_MESSAGE/.test(m));
  errores.mockRestore();
  expect(intl).toEqual([]);
  expect(llamadas.filter((l) => l.method !== 'GET').every((l) => l.url.startsWith('/api/crm/'))).toBe(true);
});

const CLIENTE = { id: 'c1', full_name: 'Ana Gómez', email: 'ana@correo-ejemplo.com', phone: '3005550142', do_not_call: true };

describe('Acciones rápidas (Variant=cliente)', () => {
  test.each(['es', 'en', 'fr', 'pt'] as const)('reunión conserva los campos y distingue sesión vencida en %s', async idioma => {
    const m = { es, en, fr, pt }[idioma];
    global.fetch = jest.fn(async () => ({ ok: false, status: 401,
      json: async () => ({ success: false, code: 'UNAUTHENTICATED', error: 'No hay sesión activa' }) }) as Response);
    renderConIdioma(<AccionesRapidasCrm variante="cliente" clienteId="c1" cliente={CLIENTE} sinBarra abrirAccion={{ accion: 'reunion', clave: 1 }} />, { idioma });
    const d = await screen.findByRole('dialog');
    const title = within(d).getByRole('textbox', { name: new RegExp(m.crm.kit.actividad.reunion.titulo) });
    fireEvent.change(title, { target: { value: 'Reunión de prueba' } });
    fireEvent.click(within(d).getByRole('button', { name: m.crm.kit.actividad.primario.reunion }));
    expect(await screen.findByText(m.crm.accionesRapidas.errores.sesionVencida)).toBeTruthy();
    expect(screen.queryByText(m.crm.accionesRapidas.errores.sinPermiso)).toBeNull();
    expect((title as HTMLInputElement).value).toBe('Reunión de prueba');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
  test.each(['es', 'en', 'fr', 'pt'] as const)('llamada y seguimiento usan una petición y conservan la clave al reintentar en %s', async idioma => {
    const m = { es, en, fr, pt }[idioma];
    let intento = 0;
    global.fetch = jest.fn(async (entrada: RequestInfo | URL, init?: RequestInit) => {
      const url = String(entrada);
      llamadas.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined });
      intento++;
      return { ok: intento > 1, status: intento > 1 ? 201 : 500,
        json: async () => intento > 1 ? { success: true, data: { id: 'actividad' } } : { success: false, error: 'Error interno' } } as Response;
    });
    renderConIdioma(<AccionesRapidasCrm variante="cliente" clienteId="c1" cliente={{ ...CLIENTE, do_not_call: false }} sinBarra abrirAccion={{ accion: 'llamar', clave: 1 }} />, { idioma });
    const modos = await screen.findByRole('dialog');
    fireEvent.click(within(modos).getByRole('button', { name: new RegExp(m.crm.accionesRapidas.llamar.modo.registrar) }));
    const d = await screen.findByRole('dialog');
    fireEvent.click(within(d).getByRole('radio', { name: m.crm.kit.actividad.llamada.resultados.answered }));
    fireEvent.click(within(d).getByRole('combobox', { name: new RegExp(m.crm.kit.actividad.llamada.fechaSeguimiento) }));
    const dia = document.querySelector<HTMLButtonElement>('[data-dia="2026-09-24"]');
    expect(dia).not.toBeNull();
    fireEvent.click(dia!);
    fireEvent.click(within(d).getByRole('button', { name: m.crm.kit.actividad.primario.llamada }));
    await screen.findByRole('alert');
    fireEvent.click(within(d).getByRole('button', { name: m.crm.kit.actividad.primario.llamada }));
    await waitFor(() => expect(llamadas).toHaveLength(2));
    expect(llamadas.map(l => l.url)).toEqual(['/api/crm/activities', '/api/crm/activities']);
    expect(llamadas[0].body).toEqual(llamadas[1].body);
    expect(llamadas[0].body).toMatchObject({ activity_type: 'call', metadata: { client_key: expect.any(String) }, follow_up: { due_date: expect.any(String) } });
    expect(Date.parse(String((llamadas[0].body!.follow_up as Record<string, unknown>).due_date))).toBe(Date.parse('2026-09-24T15:00:00Z'));
    expect(llamadas[0].body!.follow_up).not.toHaveProperty('assigned_to');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
  test('Llamar deshabilitada con su motivo visible (do_not_call) y «Nueva oportunidad»', () => {
    renderConIdioma(<AccionesRapidasCrm variante="cliente" clienteId="c1" cliente={CLIENTE} onNuevaOportunidad={() => undefined} />);
    expect(screen.getByText('Pidió no ser llamado')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Nueva oportunidad/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Llamar' }).getAttribute('aria-disabled')).toBe('true');
  });

  test('Nota → ActivityDialog → POST /api/crm/notes y evento crm:entity-changed', async () => {
    renderConIdioma(<AccionesRapidasCrm variante="cliente" clienteId="c1" cliente={CLIENTE} />);
    fireEvent.click(screen.getByRole('button', { name: 'Nota' }));
    const d = await screen.findByRole('dialog');
    fireEvent.change(within(d).getByRole('textbox'), { target: { value: 'Prefiere factura electrónica' } });
    fireEvent.click(within(d).getByRole('button', { name: /Guardar nota/ }));
    await waitFor(() => expect(llamadas.find((l) => l.method === 'POST')).toMatchObject({ url: '/api/crm/notes', body: { related_type: 'customer', related_id: 'c1', body: 'Prefiere factura electrónica' } }));
    await waitFor(() => expect(EVENTOS).toContain('nota'));
  });

  test('Tarea → POST /api/crm/tasks sin responsable en el cuerpo (el servidor asigna al usuario actual)', async () => {
    renderConIdioma(<AccionesRapidasCrm variante="cliente" clienteId="c1" cliente={CLIENTE} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tarea' }));
    const d = await screen.findByRole('dialog');
    fireEvent.change(within(d).getByPlaceholderText(/propuesta ajustada/), { target: { value: 'Enviar propuesta' } });
    fireEvent.click(within(d).getByRole('button', { name: /Crear tarea/ }));
    await waitFor(() => expect(llamadas.some((l) => l.url === '/api/crm/tasks')).toBe(true));
    const cuerpo = llamadas.find((l) => l.url === '/api/crm/tasks')!.body!;
    expect(cuerpo).toMatchObject({ related_to_type: 'customer', related_to_id: 'c1', title: 'Enviar propuesta', priority: 'med' });
    expect(cuerpo).not.toHaveProperty('assigned_to');
    expect(Date.parse(String(cuerpo.due_date))).toBe(Date.parse('2026-09-24T15:00:00Z'));
  });
});

function Ficha() {
  const crm = useFichaClienteCrm({ id: 'c1', nombre: 'Comercializadora de ejemplo', email: 'c@x.co', phone: '6045550000' });
  return (
    <>
      {crm.barra}
      {crm.vacioResumen}
      {crm.dialogos}
    </>
  );
}

describe('Ficha del cliente · bloque CRM (D1)', () => {
  test('«Nueva oportunidad» → OpportunityForm sheet Origen=cliente → POST /api/crm/opportunities', async () => {
    renderConIdioma(<Ficha />);
    expect(screen.getByText('Este cliente todavía no tiene actividad')).toBeTruthy();
    const boton = await screen.findByRole('button', { name: /Nueva oportunidad/ });
    fireEvent.click(boton);
    const hoja = await screen.findByRole('dialog');
    fireEvent.change(within(hoja).getAllByRole('textbox')[0], { target: { value: 'Suministro anual' } });
    fireEvent.click(within(hoja).getByRole('button', { name: /^Crear/ }));
    await waitFor(() => expect(llamadas.some((l) => l.url === '/api/crm/opportunities')).toBe(true));
    expect(llamadas.find((l) => l.url === '/api/crm/opportunities')!.body).toMatchObject({ customer_id: 'c1', origen: 'cliente', name: 'Suministro anual', pipeline_id: 'p1', stage_id: 's1', currency: 'COP' });
  });
});
