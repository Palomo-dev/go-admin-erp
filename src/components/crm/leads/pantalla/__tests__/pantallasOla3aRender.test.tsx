/**
 * @jest-environment jsdom
 *
 * CRM ola 3A · render de las pantallas de Leads y Actividades con el
 * proveedor real de next-intl y `fetch` simulado por ruta (sin jest-dom). Se
 * vigila que ninguna clave falte y que TODA escritura vaya a `/api/crm/**`.
 *
 * - Leads lista los leads-CLIENTE de `GET /api/crm/leads` (cierra la
 *   regresión de la ola 1: la pantalla vieja leía `/heredados`).
 * - Flujo lead → «Calificar» → `OpportunityForm Origen=lead` → `POST
 *   /api/crm/leads/[id]/qualify` sin cliente ni origen en el cuerpo.
 * - Actividades: el menú «⋯» solo en lo que el servidor marcó `editable`; el
 *   borrado va por `DELETE /api/crm/activities/[id]`.
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderConIdioma, simularAncho, type IdiomaPrueba } from '@/test-utils/renderConIdioma';
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
import { ActividadesPantalla } from '@/components/crm/actividades/pantalla/ActividadesPantalla';
import { invalidarCatalogosCrm } from '@/components/crm/acciones/useCatalogosCrm';

type Llamada = { url: string; method: string; body: unknown };
let llamadas: Llamada[];
let rutas: Record<string, (l: Llamada) => { status?: number; body: unknown }>;

const LEAD = { id: '00000000-0000-4000-8000-000000000010', full_name: 'Ana Gómez', email: 'ana@correo-ejemplo.com', phone: '3005550142', lead_source: 'web_form', owner_id: 'u1', lead_score: 82, last_contact_at: '2026-09-20T15:00:00Z', tags: ['feria-2026', 'vip'], created_at: '2026-09-14T15:00:00Z', customer_type: 'person' };
const PERMISOS = { 'crm.leads.view': true, 'crm.leads.edit': true, 'crm.leads.assign': true, 'crm.opportunities.create': true, 'crm.opportunities.view': true };
const PIPELINES = [{ id: 'p1', name: 'Ventas', pipeline_type: 'sales', is_default: true, stages: [{ id: 's1', name: 'Contacto inicial', position: 1, probability: 10 }, { id: 'sw', name: 'Ganada', position: 9, probability: 100, is_won: true }] }];

function rutasBase() {
  return {
    'GET /api/crm/permisos': () => ({ body: { success: true, data: { usuario_id: 'u1', permisos: PERMISOS } } }),
    'GET /api/crm/pipelines': () => ({ body: { success: true, data: PIPELINES } }),
    'GET /api/crm/teams/org-members': () => ({ body: { success: true, data: [{ id: 'u1', name: 'Carlos Ruiz', email: null }] } }),
    'GET /api/crm/leads': () => ({ body: { success: true, data: [LEAD], page: 1, limit: 25, total: 1 } }),
    'GET /api/crm/leads/resumen': () => ({ body: { success: true, data: { total: 34241, nuevos_mes: 1208, sin_responsable: 28930, contactados_7d: 312, calificados_mes: 46, hay_embudo_ventas: true, sin_colocar: 0 } } }),
    'GET /api/crm/activities': () => ({ body: { success: true, data: [], next_cursor: null, total: 0 } }),
    'GET /api/crm/activities/resumen': () => ({ body: { success: true, data: { total: 0, llamadas: 0, correos: 0, whatsapp: 0, reuniones: 0, notas: 0, tareasAbiertas: 0 } } }),
  } as Record<string, (l: Llamada) => { status?: number; body: unknown }>;
}

beforeEach(() => {
  invalidarCatalogosCrm();
  simularAncho(1440);
  push.mockReset();
  llamadas = [];
  rutas = rutasBase();
  global.fetch = jest.fn(async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = String(entrada);
    const l: Llamada = { url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined };
    llamadas.push(l);
    const ruta = Object.keys(rutas)
      .filter((k) => {
        const [m, p] = k.split(' ');
        return m === l.method && (url === p || url.startsWith(`${p}?`) || (p.includes('*') && new RegExp(`^${p.replace('*', '[^/?]+')}(\\?|$)`).test(url)));
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
  // Guardarraíl 36 en vivo: nada se escribe fuera de las rutas del servidor.
  expect(llamadas.filter((l) => l.method !== 'GET').every((l) => l.url.startsWith('/api/crm/'))).toBe(true);
});

const IDIOMAS: IdiomaPrueba[] = ['es', 'en', 'fr', 'pt'];

describe.each(IDIOMAS)('Leads en %s', (idioma) => {
  test('listo: KPI, fila del lead-cliente de GET /api/crm/leads y «Calificar»', async () => {
    renderConIdioma(<LeadsPantalla />, { idioma });
    await screen.findByText('Ana Gómez');
    expect(llamadas.some((l) => l.url.startsWith('/api/crm/leads?') && !l.url.includes('heredados'))).toBe(true);
    expect(llamadas.some((l) => l.url.includes('/heredados'))).toBe(false);
    expect(document.body.textContent).toMatch(/34[.,\s ]?241/);
    expect(screen.getAllByRole('button', { name: /calific|qualif/i }).length).toBeGreaterThan(0);
  });
});

describe('Leads · estados', () => {
  test('vacío con primer paso', async () => {
    rutas['GET /api/crm/leads'] = () => ({ body: { success: true, data: [], total: 0 } });
    renderConIdioma(<LeadsPantalla />);
    await screen.findByText('Aún no tienes leads');
    expect(screen.getByText('Conectar formulario web')).toBeTruthy();
  });

  test('sin permiso (403 resuelto en el servidor)', async () => {
    rutas['GET /api/crm/leads'] = () => ({ status: 403, body: { success: false, code: 'CRM_FORBIDDEN' } });
    renderConIdioma(<LeadsPantalla />);
    await screen.findByText('No tienes acceso a los leads');
  });

  test('error con reintento', async () => {
    let fallar = true;
    rutas['GET /api/crm/leads'] = () => (fallar ? { status: 500, body: { success: false } } : { body: { success: true, data: [LEAD], total: 1 } });
    renderConIdioma(<LeadsPantalla />);
    await screen.findByText('No se pudieron cargar los leads');
    fallar = false;
    fireEvent.click(screen.getByRole('button', { name: /reintentar/i }));
    await screen.findByText('Ana Gómez');
  });

  test('leads sin colocar: el aviso filtra la tabla por formulario web', async () => {
    rutas['GET /api/crm/leads/resumen'] = () => ({ body: { success: true, data: { total: 12, nuevos_mes: 0, sin_responsable: 0, contactados_7d: 0, calificados_mes: 0, hay_embudo_ventas: false, sin_colocar: 12 } } });
    renderConIdioma(<LeadsPantalla />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ver los 12 leads' }));
    await waitFor(() => expect(llamadas.some((l) => l.url.includes('origen=web_form'))).toBe(true));
  });

  test('móvil: tarjetas y «Cargar 25 más» acumulando', async () => {
    simularAncho(390);
    rutas['GET /api/crm/leads'] = (l) => ({ body: { success: true, data: [{ ...LEAD, id: l.url.includes('page=2') ? 'otro' : LEAD.id, full_name: l.url.includes('page=2') ? 'Jorge Méndez' : 'Ana Gómez' }], total: 40 } });
    renderConIdioma(<LeadsPantalla />);
    await screen.findByText('Ana Gómez');
    fireEvent.click(screen.getByRole('button', { name: /Cargar/ }));
    await screen.findByText('Jorge Méndez');
    expect(screen.getByText('Ana Gómez')).toBeTruthy();
  });
});

describe('Leads · lead → calificar → oportunidad', () => {
  test('paso 1 (QualifyLeadDialog) → paso 2 (OpportunityForm Origen=lead) → POST qualify', async () => {
    rutas['POST /api/crm/leads/*/qualify'] = () => ({ status: 201, body: { success: true, data: { id: 'opp-1' } } });
    renderConIdioma(<LeadsPantalla />);
    await screen.findByText('Ana Gómez');
    await waitFor(() => expect(llamadas.some((l) => l.url === '/api/crm/pipelines')).toBe(true));
    fireEvent.click(screen.getAllByRole('button', { name: /Calificar/ })[0]);
    const paso1 = await screen.findByRole('dialog');
    fireEvent.change(within(paso1).getByPlaceholderText(/cotización de 200 uniformes/), { target: { value: 'Uniformes para 200 personas' } });
    fireEvent.change(within(paso1).getByPlaceholderText(/\$ 0/), { target: { value: '18.000.000' } });
    fireEvent.click(within(paso1).getByRole('button', { name: /Continuar/ }));
    const paso2 = await screen.findByRole('dialog', { name: /oportunidad/i });
    await act(async () => {
      fireEvent.click(within(paso2).getByRole('button', { name: /^Crear/ }));
    });
    await waitFor(() => expect(llamadas.some((l) => l.method === 'POST')).toBe(true));
    const post = llamadas.find((l) => l.method === 'POST')!;
    expect(post.url).toBe(`/api/crm/leads/${LEAD.id}/qualify`);
    const cuerpo = post.body as Record<string, unknown>;
    expect(cuerpo).not.toHaveProperty('customer_id');
    expect(cuerpo).not.toHaveProperty('origen');
    expect(cuerpo).toMatchObject({ name: 'Uniformes para 200 personas · Ana Gómez', amount: 18000000, currency: 'COP', pipeline_id: 'p1', stage_id: 's1', salesperson_id: 'u1' });
    await waitFor(() => expect(push).toHaveBeenCalledWith('/app/crm/oportunidades/opp-1'));
  });

  test('asignar responsable en lote → POST /api/crm/leads/assign', async () => {
    rutas['POST /api/crm/leads/assign'] = () => ({ body: { success: true, data: { actualizados: 1, ids: [LEAD.id] } } });
    renderConIdioma(<LeadsPantalla />);
    await screen.findByText('Ana Gómez');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Seleccionar Ana Gómez' }));
    fireEvent.click((await screen.findAllByRole('button', { name: /Asignar responsable/ }))[0]);
    const dialogo = await screen.findByRole('dialog');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Asignar' }));
    await waitFor(() => expect(llamadas.find((l) => l.url === '/api/crm/leads/assign')?.body).toEqual({ customer_ids: [LEAD.id], owner_id: 'u1' }));
  });
});

const ENTRADAS = [
  { id: 'a1', fuente: 'activity', tipo: 'call', ocurrio_en: '2026-09-23T14:40:00Z', autor_id: 'u1', autor: 'Carlos Ruiz', texto: 'Pide cotización', outcome: 'answered', duration_seconds: 252, channel: 'phone', direccion: 'outbound', fijada: false, tarea: null, cliente: { id: 'c1', nombre: 'Ana Gómez' }, oportunidad: null, editable: true },
  { id: 'n1', fuente: 'note', tipo: 'note', ocurrio_en: '2026-09-22T16:02:00Z', autor_id: 'u2', autor: 'Laura Pérez', texto: 'Nota ajena', outcome: null, duration_seconds: null, channel: null, direccion: null, fijada: true, tarea: null, cliente: { id: 'c2', nombre: 'Distribuidora' }, oportunidad: null, editable: false },
];

describe.each(IDIOMAS)('Actividades en %s', (idioma) => {
  test('listo: KPI, días en la zona y menú solo en lo propio', async () => {
    rutas['GET /api/crm/activities'] = () => ({ body: { success: true, data: ENTRADAS, next_cursor: null, total: 2 } });
    renderConIdioma(<ActividadesPantalla />, { idioma });
    const articulos = await screen.findAllByRole('article');
    expect(articulos).toHaveLength(2);
    expect(within(articulos[0]).queryAllByRole('button').length).toBeGreaterThan(within(articulos[1]).queryAllByRole('button').length);
  });
});

describe('Actividades · estados y borrado', () => {
  test('vacío del mes (primer paso) y sin resultados con filtro', async () => {
    renderConIdioma(<ActividadesPantalla />);
    await screen.findByText('Todavía no hay actividad este mes');
    fireEvent.click(screen.getByRole('button', { name: 'Llamadas' }));
    await waitFor(() => expect(llamadas.some((l) => l.url.includes('types=call%2Csms'))).toBe(true));
  });

  test('eliminar lo propio → DELETE /api/crm/activities/[id]', async () => {
    rutas['GET /api/crm/activities'] = () => ({ body: { success: true, data: ENTRADAS, next_cursor: null, total: 2 } });
    rutas['DELETE /api/crm/activities/*'] = () => ({ body: { success: true, data: { id: 'a1' } } });
    renderConIdioma(<ActividadesPantalla />);
    const [propia] = await screen.findAllByRole('article');
    const menu = within(propia).getAllByRole('button').at(-1)!;
    // Radix abre el menú con el teclado (jsdom no trae PointerEvent).
    fireEvent.keyDown(menu, { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitem', { name: /Eliminar/ }));
    const dialogo = await screen.findByRole('dialog');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Eliminar' }));
    await waitFor(() => expect(llamadas.some((l) => l.method === 'DELETE' && l.url === '/api/crm/activities/a1')).toBe(true));
  });

  test('sin permiso', async () => {
    rutas['GET /api/crm/activities'] = () => ({ status: 403, body: { success: false } });
    renderConIdioma(<ActividadesPantalla />);
    await screen.findByText('No tienes acceso a las actividades');
  });
});
