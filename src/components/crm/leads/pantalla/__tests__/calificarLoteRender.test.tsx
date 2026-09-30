/**
 * @jest-environment jsdom
 *
 * «Calificar en lote» en la pantalla de Leads, con el proveedor real de
 * next-intl y `fetch` simulado por ruta (mismo arnés que
 * `pantallasOla3aRender.test.tsx`):
 *
 * - 1 lead seleccionado → el flujo de un lead (paso 1 con su tarjeta).
 * - 2 o más → paso 1 en lote (avatares, «El de cada lead») → paso 2
 *   `OpportunityForm` con `{cliente}` → un solo `POST /api/crm/leads/qualify-bulk`
 *   → resultado con creadas y fallidas en el mismo diálogo.
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderConIdioma, simularAncho } from '@/test-utils/renderConIdioma';
import { contextoMoneda } from '@/lib/utils/moneda';

const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: jest.fn(), back: jest.fn(), prefetch: jest.fn() }), usePathname: () => '/app/crm/leads', useSearchParams: () => new URLSearchParams() }));
const FECHAS = { timezone: 'America/Bogota', getToday: () => '2026-09-23', formatDate: (v: string) => v, formatDateTime: (v: string) => v, formatTime: (v: string) => v, formatPlain: (v: string) => v };
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({ useFormatDate: () => FECHAS }));
const COP = { ...contextoMoneda('COP', { locale: 'es-CO' }), formatear: String, paraDocumento: () => contextoMoneda('COP', { locale: 'es-CO' }), resuelta: true };
jest.mock('@/lib/hooks/useOrgCurrency', () => ({ useMonedaOrganizacion: () => COP }));
jest.mock('@/lib/context/BranchContext', () => ({ useBranchOpcional: () => undefined }));
jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));
jest.mock('@/components/crm/leads/NewLeadDialog', () => ({ NewLeadDialog: () => null }));
jest.mock('@/components/voice/SoftphoneProvider', () => ({ useSoftphone: () => ({ available: false }) }));
jest.mock('@/components/voice/hooks/useCallModePolicy', () => ({ useCallModePolicy: () => ({ decision: null }) }));
jest.mock('@/components/crm/shared/useOrgDefaultCountry', () => ({ useOrgDefaultCountry: () => '57' }));
jest.mock('@/components/ui/use-toast', () => ({ toast: jest.fn() }));

import { LeadsPantalla } from '../LeadsPantalla';
import { invalidarCatalogosCrm } from '@/components/crm/acciones/useCatalogosCrm';

type Llamada = { url: string; method: string; body: unknown };
let llamadas: Llamada[];
let rutas: Record<string, (l: Llamada) => { status?: number; body: unknown }>;

const ANA = { id: '00000000-0000-4000-8000-000000000010', full_name: 'Ana Gómez', email: 'ana@correo-ejemplo.com', phone: '3005550142', lead_source: 'web_form', owner_id: 'u1', lead_score: 82, last_contact_at: null, tags: [], created_at: '2026-09-14T15:00:00Z', customer_type: 'person' };
const JORGE = { ...ANA, id: '00000000-0000-4000-8000-000000000011', full_name: 'Jorge Méndez', owner_id: null };
const PERMISOS = { 'crm.leads.view': true, 'crm.leads.edit': true, 'crm.leads.assign': true, 'crm.opportunities.create': true, 'crm.opportunities.view': true };
const PIPELINES = [{ id: 'p1', name: 'Ventas', pipeline_type: 'sales', is_default: true, stages: [{ id: 's1', name: 'Contacto inicial', position: 1, probability: 10 }] }];

beforeEach(() => {
  invalidarCatalogosCrm();
  simularAncho(1440);
  push.mockReset();
  llamadas = [];
  rutas = {
    'GET /api/crm/permisos': () => ({ body: { success: true, data: { usuario_id: 'u1', permisos: PERMISOS } } }),
    'GET /api/crm/pipelines': () => ({ body: { success: true, data: PIPELINES } }),
    'GET /api/crm/teams/org-members': () => ({ body: { success: true, data: [{ id: 'u1', name: 'Carlos Ruiz', email: null }] } }),
    'GET /api/crm/leads': () => ({ body: { success: true, data: [ANA, JORGE], page: 1, limit: 25, total: 2 } }),
    'GET /api/crm/leads/resumen': () => ({ body: { success: true, data: { total: 2, nuevos_mes: 0, sin_responsable: 1, contactados_7d: 0, calificados_mes: 0, hay_embudo_ventas: true, sin_colocar: 0 } } }),
  };
  global.fetch = jest.fn(async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = String(entrada);
    const l: Llamada = { url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined };
    llamadas.push(l);
    const ruta = Object.keys(rutas)
      .filter((k) => {
        const [m, p] = k.split(' ');
        return m === l.method && (url === p || url.startsWith(`${p}?`));
      })
      .sort((a, b) => b.length - a.length)[0];
    const r = ruta ? rutas[ruta](l) : { status: 404, body: { success: false, error: 'no' } };
    return { ok: (r.status ?? 200) < 400, status: r.status ?? 200, json: async () => r.body } as Response;
  }) as typeof fetch;
});

let errores: jest.SpyInstance;
beforeEach(() => {
  errores = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  const intl = errores.mock.calls.map((c) => String(c[0] instanceof Error ? `${c[0].name} ${c[0].message}` : c[0])).filter((m) => /MISSING_MESSAGE|FORMATTING_ERROR|INVALID_MESSAGE|INVALID_KEY/.test(m));
  errores.mockRestore();
  expect(intl).toEqual([]);
  expect(document.body.textContent ?? '').not.toMatch(/crm\.(pantalla|acciones|ficha|kit)/);
  expect(llamadas.filter((l) => l.method !== 'GET').every((l) => l.url.startsWith('/api/crm/'))).toBe(true);
});

async function seleccionar(...nombres: string[]) {
  renderConIdioma(<LeadsPantalla />);
  await screen.findByText('Ana Gómez');
  await waitFor(() => expect(llamadas.some((l) => l.url === '/api/crm/pipelines')).toBe(true));
  for (const n of nombres) fireEvent.click(screen.getByRole('checkbox', { name: `Seleccionar ${n}` }));
}

const botonMasivo = () => screen.getAllByRole('button', { name: /^Calificar$/ }).at(-1)!;

describe('Leads · calificar en lote', () => {
  test('con 1 seleccionado «Calificar» abre el flujo de un lead', async () => {
    await seleccionar('Ana Gómez');
    expect((botonMasivo() as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(botonMasivo());
    const paso1 = await screen.findByRole('dialog');
    expect(within(paso1).getByText('Calificar lead')).toBeTruthy();
    expect(within(paso1).getByText('Ana Gómez')).toBeTruthy();
  });

  test('con 2 se habilita el lote: avatares → formulario con {cliente} → POST qualify-bulk → resultado', async () => {
    rutas['POST /api/crm/leads/qualify-bulk'] = () => ({
      body: { success: true, data: { creadas: [{ customer_id: ANA.id, opportunity_id: 'o1', nombre: 'Uniformes · Ana Gómez' }], fallidas: [{ customer_id: JORGE.id, nombre: 'Jorge Méndez', codigo: 'no_es_lead', mensaje: 'x' }] } },
    });
    await seleccionar('Ana Gómez', 'Jorge Méndez');
    expect((botonMasivo() as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(botonMasivo());

    const paso1 = await screen.findByRole('dialog', { name: 'Calificar 2 leads' });
    expect(within(paso1).getAllByText('2 leads seleccionados').length).toBeGreaterThan(0);
    expect(within(paso1).getByText('El de cada lead')).toBeTruthy();
    fireEvent.change(within(paso1).getByPlaceholderText(/cotización de 200 uniformes/), { target: { value: 'Uniformes' } });
    fireEvent.click(within(paso1).getByRole('button', { name: /Continuar/ }));

    const paso2 = await screen.findByRole('dialog', { name: /oportunidad/i });
    expect(within(paso2).getByText(/Se crearán 2 oportunidades · \{cliente\} se reemplaza/)).toBeTruthy();
    expect((within(paso2).getByDisplayValue('Uniformes · {cliente}') as HTMLInputElement).value).toBe('Uniformes · {cliente}');
    await act(async () => {
      fireEvent.click(within(paso2).getByRole('button', { name: /^Crear/ }));
    });

    const post = await waitFor(() => {
      const p = llamadas.find((l) => l.method === 'POST');
      expect(p).toBeTruthy();
      return p!;
    });
    expect(post.url).toBe('/api/crm/leads/qualify-bulk');
    const cuerpo = post.body as { customer_ids: string[]; patron_nombre: string; plantilla: Record<string, unknown> };
    expect(cuerpo.customer_ids).toEqual([ANA.id, JORGE.id]);
    expect(cuerpo.patron_nombre).toBe('Uniformes · {cliente}');
    expect(cuerpo.plantilla).not.toHaveProperty('salesperson_id');
    expect(cuerpo.plantilla).not.toHaveProperty('customer_id');
    expect(cuerpo.plantilla).not.toHaveProperty('origen');
    expect(cuerpo.plantilla).not.toHaveProperty('amount');
    expect(cuerpo.plantilla).toMatchObject({ pipeline_id: 'p1', stage_id: 's1', discovery_data: { necesidad: 'Uniformes' } });

    const resultado = await screen.findByRole('dialog', { name: 'Calificar en lote' });
    await within(resultado).findByText('Se creó 1 oportunidad');
    expect(within(resultado).getByText('Jorge Méndez')).toBeTruthy();
    expect(within(resultado).getByText(/Ya no está en etapa lead/)).toBeTruthy();
    fireEvent.click(within(resultado).getByRole('button', { name: 'Ver en el pipeline' }));
    expect(push).toHaveBeenCalledWith('/app/crm/pipeline');
  });
});
