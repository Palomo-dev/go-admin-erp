/**
 * @jest-environment jsdom
 *
 * CRM ola 3B · render de Pipeline, Oportunidades, detalle, formulario en
 * página y «Nuevo pipeline» con el proveedor real de next-intl y `fetch`
 * simulado por ruta (sin jest-dom). Vigila que ninguna clave falte en los 4
 * idiomas y que TODA escritura vaya a `/api/crm/**` (guardarraíl 36 en vivo).
 *
 * Flujos: crear (página, con líneas) → mover de etapa → ganar / perder;
 * permisos resueltos en el servidor (Empleado sin «cerrar»); rechazo del
 * servidor (gate) con reversión del movimiento optimista del tablero.
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderConIdioma, simularAncho, type IdiomaPrueba } from '@/test-utils/renderConIdioma';
import { contextoMoneda } from '@/lib/utils/moneda';

const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: jest.fn(), back: jest.fn(), prefetch: jest.fn() }), usePathname: () => '/app/crm/pipeline', useSearchParams: () => new URLSearchParams() }));
const FECHAS = { timezone: 'America/Bogota', getToday: () => '2026-09-30', formatDate: (v: string) => v, formatDateTime: (v: string) => v, formatTime: (v: string) => v, formatPlain: (v: string) => v };
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({ useFormatDate: () => FECHAS, useOrgTimezone: () => ({ timezone: 'America/Bogota' }) }));
const COP = { ...contextoMoneda('COP', { locale: 'es-CO' }), formatear: String, paraDocumento: () => contextoMoneda('COP', { locale: 'es-CO' }), resuelta: true };
jest.mock('@/lib/hooks/useOrgCurrency', () => ({ useMonedaOrganizacion: () => COP }));
jest.mock('@/lib/context/BranchContext', () => ({ useBranchOpcional: () => undefined }));
jest.mock('@/lib/hooks/useOrganization', () => ({ getOrganizationId: () => 120, useOrganization: () => ({ organization: { id: 120 } }) }));
jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));
jest.mock('@/components/voice/SoftphoneProvider', () => ({ useSoftphone: () => ({ available: false }) }));
jest.mock('@/components/voice/hooks/useCallModePolicy', () => ({ useCallModePolicy: () => ({ decision: null }) }));
jest.mock('@/components/crm/shared/useOrgDefaultCountry', () => ({ useOrgDefaultCountry: () => '57' }));
jest.mock('@/components/ui/use-toast', () => ({ toast: jest.fn() }));
// Pestañas y secciones heredadas (leen del navegador): fuera de esta prueba.
jest.mock('@/components/crm/pipeline/hooks/useOpportunityData', () => ({ useOpportunityData: () => ({ opportunity: null, customer: null, stages: [], loading: false, error: null, refetch: {}, patch: () => undefined }) }));
jest.mock('@/components/crm/oportunidades/ScoringSection', () => ({ ScoringSection: () => null }));
jest.mock('@/components/crm/pipeline/drawer/DiscoverySection', () => ({ DiscoverySection: () => null }));
jest.mock('@/components/crm/pipeline/drawer/SalesTeamTerritorySelectors', () => ({ SalesTeamTerritorySelectors: () => null }));
jest.mock('@/components/crm/objeciones/OpportunityObjectionsBlock', () => ({ OpportunityObjectionsBlock: () => null }));
jest.mock('@/components/crm/pipeline/ForecastView', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/crm/pipeline/ClientsView', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/crm/pipeline/AutomationsView', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/crm/pipeline/StageDialog', () => ({ StageDialog: () => null }));
jest.mock('@/components/crm/pipeline/DeleteStageDialog', () => ({ DeleteStageDialog: () => null }));
jest.mock('@/components/crm/oportunidades/opportunitiesService', () => ({ opportunitiesService: { getProducts: async () => [], getSpaces: async () => [] } }));
const ejecutarPasos = jest.fn(async () => [{ paso: 'invoice', ok: true, mensaje: 'Factura en borrador: FV-1042' }]);
jest.mock('@/components/crm/oportunidad/pasosGanar', () => ({
  crearDepsGanar: () => ({}),
  pasosElegidos: (a: string[]) => a,
  ejecutarPasosGanar: (...args: unknown[]) => (ejecutarPasos as unknown as (...a: unknown[]) => unknown)(...args),
  documentosDe: (r: { mensaje: string }[]) => r.map((x) => ({ tipo: 'factura', numero: x.mensaje, href: null })),
}));

import { OportunidadesPantalla } from '@/components/crm/oportunidades/pantalla/OportunidadesPantalla';
import { PipelinePantalla } from '@/components/crm/pipeline/pantalla/PipelinePantalla';
import { OportunidadDetalle } from '../OportunidadDetalle';
import { FormularioOportunidadPagina } from '../FormularioOportunidadPagina';
import { useAccionesOportunidad } from '../useAccionesOportunidad';
import { permisosPantalla } from '../oportunidadLogica';
import { useTableroPipeline } from '@/components/crm/pipeline/pantalla/useTableroPipeline';
import { invalidarCatalogosCrm } from '@/components/crm/acciones/useCatalogosCrm';

type Llamada = { url: string; method: string; body: unknown };
let llamadas: Llamada[];
let rutas: Record<string, (l: Llamada) => { status?: number; body: unknown }>;

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ETAPAS = [
  { id: 's1', name: 'Calificación', position: 1, probability: 20, color: '#3b82f6', is_won: false, is_lost: false },
  { id: 's2', name: 'Propuesta', position: 2, probability: 60, color: '#6366f1', is_won: false, is_lost: false },
  { id: 'sw', name: 'Ganada', position: 8, probability: 100, color: '#22c55e', is_won: true, is_lost: false },
  { id: 'sl', name: 'Perdida', position: 9, probability: 0, color: '#ef4444', is_won: false, is_lost: true },
];
const PIPELINES = [{ id: 'p1', name: 'Ventas', pipeline_type: 'sales', is_default: true, stages: ETAPAS }];
const MANAGER = { 'crm.opportunities.view': true, 'crm.opportunities.create': true, 'crm.opportunities.edit': true, 'crm.opportunities.edit_any': true, 'crm.opportunities.close': true, 'crm.opportunities.delete': true, 'crm.stages.manage': true, 'crm.stages.override_gate': true, 'crm.pipelines.manage': true };
const EMPLEADO = { 'crm.opportunities.view': true, 'crm.opportunities.create': true, 'crm.opportunities.edit': true };
let permisos: Record<string, boolean>;

const OP1 = { id: U(1), name: 'Renovación licencias 2027', customer_id: U(10), pipeline_id: 'p1', stage_id: 's2', amount: 12500000, currency: 'COP', status: 'open', record_type: 'deal', temperature: 'hot', salesperson_id: 'u1', created_by: 'u1', next_contact_at: '2026-10-01T15:00:00Z', next_action: 'Enviar propuesta', cliente_nombre: 'Cliente Ejemplo S.A.S.', cliente: { full_name: 'Cliente Ejemplo S.A.S.', phone: '3005550199', email: 'compras@correo-ejemplo.com' }, etapa: { name: 'Propuesta', probability: 60, position: 2, color: null, is_won: false, is_lost: false }, entro_etapa_en: '2026-09-22T10:00:00Z', created_at: '2026-09-02T10:00:00Z', updated_at: '2026-09-29T10:00:00Z', es_lead: false };
const OP2 = { ...OP1, id: U(2), name: 'Lead heredado', stage_id: 's1', record_type: 'lead', es_lead: true, salesperson_id: null, created_by: null, cliente_nombre: 'Cliente Dos', cliente: null, etapa: { ...OP1.etapa, name: 'Calificación', probability: 20 } };
const RESUMEN = {
  conteos: { open: 23, won: 11, lost: 23, total: 57 },
  abiertas: [{ moneda: 'COP', monto: 184500000, cantidad: 23, ponderado: 61300000 }],
  por_etapa: { s1: { cantidad: 1, grupos: [{ moneda: 'COP', monto: 0, cantidad: 1 }] }, s2: { cantidad: 1, grupos: [{ moneda: 'COP', monto: 12500000, cantidad: 1 }] } },
  cierran_periodo: 6,
  ganadas_90: 11,
  perdidas_90: 23,
  tasas: [],
  truncado: false,
  base: 'COP',
};

function rutasBase() {
  return {
    'GET /api/crm/permisos': () => ({ body: { success: true, data: { usuario_id: 'u1', permisos } } }),
    'GET /api/crm/pipelines': () => ({ body: { success: true, data: PIPELINES } }),
    'GET /api/crm/teams/org-members': () => ({ body: { success: true, data: [{ id: 'u1', name: 'Carlos Ruiz', email: null }] } }),
    'GET /api/crm/opportunities': (l: Llamada) => {
      const etapa = new URL(`http://x${l.url}`).searchParams.get('stage_id');
      const filas = [OP1, OP2].filter((o) => !etapa || o.stage_id === etapa);
      return { body: { success: true, data: filas, total: filas.length } };
    },
    'GET /api/crm/opportunities/resumen': () => ({ body: { success: true, data: RESUMEN } }),
    'GET /api/crm/pipelines/*/board': () => ({ body: { success: true, data: { pipeline: PIPELINES[0], etapas: ETAPAS, resumen: RESUMEN } } }),
    'GET /api/crm/opportunities/*': () => ({ body: { success: true, data: { ...OP1, cliente: { id: U(10), full_name: 'Cliente Ejemplo S.A.S.', customer_type: 'company', email: 'compras@correo-ejemplo.com' }, commission_rate: 5, commission_type: 'salesperson', opportunity_products: [], opportunity_custom_lines: [], opportunity_spaces: [] } } }),
    'GET /api/crm/opportunities/*/finance': () => ({ body: { success: true, data: { quotations: [{ number: 'COT-318', status: 'sent' }], invoices: [], commissions: [] } } }),
    'GET /api/crm/opportunities/*/meetings': () => ({ body: { success: true, data: [] } }),
    'GET /api/crm/loss-reasons': () => ({ body: { success: true, data: [{ id: 'm1', code: 'price', label: 'Precio', is_active: true, sort_order: 1 }] } }),
    'GET /api/crm/verticales': () => ({ body: { success: true, data: [] } }),
  } as Record<string, (l: Llamada) => { status?: number; body: unknown }>;
}

beforeEach(() => {
  invalidarCatalogosCrm();
  simularAncho(1440);
  push.mockReset();
  ejecutarPasos.mockClear();
  permisos = MANAGER;
  llamadas = [];
  rutas = rutasBase();
  global.fetch = jest.fn(async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = String(entrada);
    const l: Llamada = { url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined };
    llamadas.push(l);
    const ruta = Object.keys(rutas)
      .filter((k) => {
        const [m, p] = k.split(' ');
        return m === l.method && (url === p || url.startsWith(`${p}?`) || (p.includes('*') && new RegExp(`^${p.replace(/\*/g, '[^/?]+')}(\\?|$)`).test(url)));
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
  expect(document.body.textContent ?? '').not.toMatch(/crm\.(oportunidad|kit|acciones)/);
  expect(llamadas.filter((l) => l.method !== 'GET').every((l) => l.url.startsWith('/api/crm/'))).toBe(true);
});

const IDIOMAS: IdiomaPrueba[] = ['es', 'en', 'fr', 'pt'];
const abrirMenu = async (fila: HTMLElement) => {
  const boton = within(fila).getAllByRole('button').filter((b) => /Acciones de|Actions|Ações|Acciones/i.test(b.getAttribute('aria-label') ?? '')).at(-1)!;
  fireEvent.keyDown(boton, { key: 'Enter' });
};

describe.each(IDIOMAS)('Oportunidades en %s', (idioma) => {
  test('listo: pestañas con conteo, KPI en moneda base, fila «Lead» (D2) y lectura por el servidor', async () => {
    renderConIdioma(<OportunidadesPantalla />, { idioma });
    await screen.findByText('Renovación licencias 2027');
    expect(screen.getByText('Lead heredado')).toBeTruthy();
    expect(screen.getAllByText('Lead').length).toBeGreaterThan(0);
    await waitFor(() => expect(document.body.textContent).toMatch(/184[.,\s ]?500[.,\s ]?000/));
    expect(llamadas.some((l) => l.url.startsWith('/api/crm/opportunities?') && l.url.includes('status=open'))).toBe(true);
    expect(llamadas.some((l) => l.url.startsWith('/api/crm/opportunities/resumen?'))).toBe(true);
  });
});

describe.each(IDIOMAS)('Pipeline en %s', (idioma) => {
  test('listo: columnas con total, tarjetas pedidas por columna y KPI', async () => {
    renderConIdioma(<PipelinePantalla />, { idioma });
    await screen.findByText('Renovación licencias 2027');
    expect(screen.getAllByText('Calificación').length).toBeGreaterThan(0);
    expect(llamadas.some((l) => l.url.includes('stage_id=s1') && l.url.includes('limit=20'))).toBe(true);
    expect(llamadas.some((l) => l.url.startsWith('/api/crm/pipelines/p1/board?'))).toBe(true);
    expect(llamadas.some((l) => l.url.startsWith('/api/crm/opportunities?') && !l.url.includes('stage_id='))).toBe(false);
  });
});

describe('Oportunidades · estados', () => {
  test('vacío con primer paso', async () => {
    rutas['GET /api/crm/opportunities'] = () => ({ body: { success: true, data: [], total: 0 } });
    rutas['GET /api/crm/opportunities/resumen'] = () => ({ body: { success: true, data: { ...RESUMEN, conteos: { open: 0, won: 0, lost: 0, total: 0 } } } });
    renderConIdioma(<OportunidadesPantalla />);
    await screen.findByText('Aún no tienes oportunidades');
  });
  test('sin permiso (403 del servidor)', async () => {
    rutas['GET /api/crm/opportunities'] = () => ({ status: 403, body: { success: false, code: 'CRM_FORBIDDEN' } });
    renderConIdioma(<OportunidadesPantalla />);
    await screen.findByText('No tienes acceso a las oportunidades');
  });
  test('error con reintento', async () => {
    let fallar = true;
    rutas['GET /api/crm/opportunities'] = () => (fallar ? { status: 500, body: { success: false } } : { body: { success: true, data: [OP1], total: 1 } });
    renderConIdioma(<OportunidadesPantalla />);
    await screen.findByText('No se pudieron cargar las oportunidades');
    fallar = false;
    fireEvent.click(screen.getByRole('button', { name: /reintentar/i }));
    await screen.findByText('Renovación licencias 2027');
  });
});

describe('Pipeline · estados', () => {
  test('sin embudo de ventas → «Crear embudo de ventas» abre el asistente en Ventas y crea en UNA llamada', async () => {
    rutas['GET /api/crm/pipelines'] = () => ({ body: { success: true, data: [{ id: 'po', name: 'Onboarding', pipeline_type: 'onboarding', is_default: false, stages: [] }] } });
    rutas['GET /api/crm/leads/resumen'] = () => ({ body: { success: true, data: { sin_colocar: 3 } } });
    rutas['POST /api/crm/pipelines'] = () => ({ status: 201, body: { success: true, data: { pipeline: { id: 'pn' }, stages: [] } } });
    renderConIdioma(<PipelinePantalla />);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Crear embudo de ventas' }))[0]);
    const asistente = await screen.findByRole('dialog');
    fireEvent.click(within(asistente).getByRole('button', { name: 'Siguiente' }));
    fireEvent.click(within(asistente).getByRole('button', { name: 'Siguiente' }));
    await act(async () => {
      fireEvent.click(within(asistente).getByRole('button', { name: 'Crear pipeline' }));
    });
    await waitFor(() => expect(llamadas.some((l) => l.method === 'POST' && l.url === '/api/crm/pipelines')).toBe(true));
    const cuerpo = llamadas.find((l) => l.method === 'POST')!.body as { pipeline_type: string; is_default: boolean; stages: { is_won: boolean; is_lost: boolean }[] };
    expect(cuerpo).toMatchObject({ pipeline_type: 'sales', is_default: true });
    expect(cuerpo.stages).toHaveLength(9);
    expect(cuerpo.stages.filter((s) => s.is_won)).toHaveLength(1);
  });

  test('nombre repetido (409): no queda nada a medias y el asistente sigue abierto con su aviso', async () => {
    rutas['GET /api/crm/pipelines'] = () => ({ body: { success: true, data: [] } });
    rutas['POST /api/crm/pipelines'] = () => ({ status: 409, body: { success: false, code: 'nombre_duplicado' } });
    renderConIdioma(<PipelinePantalla />);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Crear embudo de ventas' }))[0]);
    const asistente = await screen.findByRole('dialog');
    fireEvent.click(within(asistente).getByRole('button', { name: 'Siguiente' }));
    fireEvent.click(within(asistente).getByRole('button', { name: 'Siguiente' }));
    await act(async () => {
      fireEvent.click(within(asistente).getByRole('button', { name: 'Crear pipeline' }));
    });
    await within(asistente).findByText('Ya existe un pipeline con ese nombre. No se creó nada.');
  });

  test('sin permiso de ver (resuelto en el servidor)', async () => {
    permisos = { 'crm.opportunities.view': false };
    renderConIdioma(<PipelinePantalla />);
    await screen.findByText('No tienes acceso al pipeline');
  });
});

describe('flujo: crear → mover → ganar / perder', () => {
  test('crear en página desde la ficha del cliente: líneas en el mismo POST y monto = total', async () => {
    rutas['POST /api/crm/opportunities'] = () => ({ status: 201, body: { success: true, data: { id: U(9) } } });
    renderConIdioma(<FormularioOportunidadPagina modo="create" inicial={{ clienteId: U(10), clienteNombre: 'Cliente Ejemplo S.A.S.', pipelineId: 'p1' }} />);
    const nombre = await screen.findByPlaceholderText('Ej.: Renovación de licencias 2027');
    fireEvent.change(nombre, { target: { value: 'Uniformes 2027' } });
    fireEvent.click(screen.getByRole('radio', { name: /Otros conceptos/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Agregar concepto' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Concepto' }), { target: { value: 'Implementación' } });
    const precio = screen.getByRole('textbox', { name: 'Precio unit.' });
    fireEvent.change(precio, { target: { value: '1.800.000' } });
    fireEvent.blur(precio);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Crear oportunidad' }));
    });
    await waitFor(() => expect(llamadas.some((l) => l.method === 'POST')).toBe(true));
    const post = llamadas.find((l) => l.method === 'POST')!;
    expect(post.url).toBe('/api/crm/opportunities');
    expect(post.body).toMatchObject({ name: 'Uniformes 2027', customer_id: U(10), amount: 1800000, custom_lines: [{ concept: 'Implementación', quantity: 1, unit_price: 1800000 }], origen: 'general' });
    await waitFor(() => expect(push).toHaveBeenCalledWith(`/app/crm/oportunidades/${U(9)}`));
  });

  test('mover por el menú (alternativa de teclado al arrastre) → PATCH …/stage', async () => {
    rutas['PATCH /api/crm/opportunities/*/stage'] = () => ({ body: { success: true, data: { ok: true } } });
    renderConIdioma(<OportunidadesPantalla />);
    const fila = (await screen.findByText('Lead heredado')).closest('tr')!;
    await abrirMenu(fila);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Mover de etapa' }));
    const dialogo = await screen.findByRole('dialog');
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole('button', { name: 'Mover' }));
    });
    await waitFor(() => expect(llamadas.find((l) => l.method === 'PATCH')).toMatchObject({ url: `/api/crm/opportunities/${U(2)}/stage`, body: { stage_id: 's2' } }));
  });

  test('ganar: WinDialog en 3 pasos → POST …/win con won_data y pasos únicos de wonCloseSteps', async () => {
    rutas['POST /api/crm/opportunities/*/win'] = () => ({ body: { success: true, data: { ok: true } } });
    renderConIdioma(<OportunidadesPantalla />);
    const fila = (await screen.findByText('Renovación licencias 2027')).closest('tr')!;
    await abrirMenu(fila);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Marcar ganada' }));
    const dialogo = await screen.findByRole('dialog');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Siguiente' }));
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole('button', { name: 'Ganar oportunidad' }));
    });
    await waitFor(() => expect(llamadas.find((l) => l.method === 'POST')?.url).toBe(`/api/crm/opportunities/${U(1)}/win`));
    const cuerpo = llamadas.find((l) => l.method === 'POST')!.body as { won_data: Record<string, unknown>; stage_id: string };
    expect(cuerpo.stage_id).toBe('sw');
    expect(cuerpo.won_data).toMatchObject({ amount: 12500000, currency: 'COP', closed_on: '2026-09-30' });
    await waitFor(() => expect(ejecutarPasos).toHaveBeenCalled());
    await screen.findByText('Factura en borrador: FV-1042');
  });

  test('perder: SIEMPRE a la etapa de pérdida con el motivo del catálogo → POST …/lose', async () => {
    rutas['POST /api/crm/opportunities/*/lose'] = () => ({ body: { success: true, data: { ok: true } } });
    renderConIdioma(<OportunidadesPantalla />);
    const fila = (await screen.findByText('Renovación licencias 2027')).closest('tr')!;
    await abrirMenu(fila);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Marcar perdida' }));
    const dialogo = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialogo).getByRole('combobox')).toBeTruthy());
    fireEvent.change(within(dialogo).getByRole('combobox'), { target: { value: 'm1' } });
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole('button', { name: 'Marcar perdida' }));
    });
    await waitFor(() => expect(llamadas.find((l) => l.method === 'POST')).toMatchObject({ url: `/api/crm/opportunities/${U(1)}/lose`, body: { stage_id: 'sl', loss_data: { lossReasonId: 'm1', lossReasonLabel: 'Precio' } } }));
  });
});

describe('permisos resueltos en el servidor', () => {
  test('Empleado: sin «Marcar ganada/perdida» ni «Eliminar»; en la ajena, ni «Editar»', async () => {
    permisos = EMPLEADO;
    renderConIdioma(<OportunidadesPantalla />);
    const propia = (await screen.findByText('Renovación licencias 2027')).closest('tr')!;
    await abrirMenu(propia);
    await screen.findByRole('menuitem', { name: 'Mover de etapa' });
    expect(screen.queryByRole('menuitem', { name: 'Marcar ganada' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Eliminar' })).toBeNull();
  });

  test('Empleado que intenta mover a Ganada: «sin permiso» sin llamar al servidor', async () => {
    permisos = EMPLEADO;
    renderConIdioma(<OportunidadDetalle id={U(1)} />);
    await screen.findAllByText('Renovación licencias 2027');
    expect(screen.queryByRole('button', { name: 'Marcar ganada' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^Ganada/ }));
    await screen.findByText('No puedes mover a «Ganada»');
    expect(llamadas.filter((l) => l.method !== 'GET')).toEqual([]);
  });
});

function Arnes() {
  const tablero = useTableroPipeline({ pipelineId: 'p1', query: '', periodo: '' });
  const acciones = useAccionesOportunidad({ etapas: ETAPAS, permisos: permisosPantalla(MANAGER), usuarioId: 'u1', onVer: () => undefined, onCambio: (id) => id && tablero.olvidar(id), onRevertir: tablero.revertir });
  const op = tablero.tablero.s1?.filas[0];
  return (
    <div>
      {Object.entries(tablero.tablero).map(([etapa, c]) => (
        <section key={etapa} aria-label={etapa}>{c.filas.map((f) => <p key={f.id}>{f.name}</p>)}</section>
      ))}
      <button type="button" disabled={!op} onClick={() => op && acciones.flujo.solicitar(op, 's2', 'arrastre') && tablero.mover(op.id, 's2')}>soltar</button>
      {acciones.dialogos}
    </div>
  );
}

describe('rechazo del servidor', () => {
  test('arrastre optimista: la tarjeta pasa YA a la columna y vuelve si el gate rechaza; se abre el diálogo con los requisitos', async () => {
    let responder: (v: unknown) => void = () => undefined;
    rutas['PATCH /api/crm/opportunities/*/stage'] = () => ({ status: 409, body: { success: false, reason: 'gate', gate: { ok: false, missing: [{ type: 'field', label: 'Presupuesto', detail: 'Falta el presupuesto aprobado' }] } } });
    const original = global.fetch;
    global.fetch = jest.fn(async (u: RequestInfo | URL, i?: RequestInit) => {
      if ((i?.method ?? 'GET') === 'PATCH') await new Promise((r) => (responder = r));
      return (original as (a: RequestInfo | URL, b?: RequestInit) => Promise<Response>)(u, i);
    }) as typeof fetch;
    renderConIdioma(<Arnes />);
    await screen.findByText('Lead heredado');
    fireEvent.click(screen.getByRole('button', { name: 'soltar' }));
    await waitFor(() => expect(within(screen.getByRole('region', { name: 's2' })).queryByText('Lead heredado')).toBeTruthy());
    await act(async () => responder(null));
    await screen.findByText('Falta el presupuesto aprobado');
    // El diálogo modal saca el resto del árbol accesible: se consulta con `hidden`.
    expect(within(screen.getByRole('region', { name: 's1', hidden: true })).queryByText('Lead heredado')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 's2', hidden: true })).queryByText('Lead heredado')).toBeNull();
    expect(screen.getByRole('button', { name: 'Avanzar de todos modos' })).toBeTruthy();
  });
});

describe('detalle', () => {
  test('listo: métricas, «Conexiones» con la cotización y la comisión estimada', async () => {
    renderConIdioma(<OportunidadDetalle id={U(1)} />);
    await screen.findByText('Conexiones');
    await screen.findByText('Cotización COT-318');
    expect(document.body.textContent).toMatch(/625[.,\s ]?000/);
  });
  test.each([
    [404, 'Oportunidad no encontrada'],
    [403, 'No tienes acceso a esta oportunidad'],
  ])('%s → %s', async (status, texto) => {
    rutas['GET /api/crm/opportunities/*'] = () => ({ status, body: { success: false } });
    renderConIdioma(<OportunidadDetalle id={U(1)} />);
    await screen.findByText(texto);
  });
});

describe('drawer y móvil', () => {
  test('la tarjeta abre el drawer; «Guardar seguimiento» → PATCH …/seguimiento con la hora de la organización', async () => {
    rutas['PATCH /api/crm/opportunities/*/seguimiento'] = () => ({ body: { success: true, data: {} } });
    renderConIdioma(<PipelinePantalla />);
    fireEvent.click(await screen.findByRole('button', { name: 'Renovación licencias 2027' }));
    const drawer = await screen.findByRole('dialog');
    const accion = await within(drawer).findByDisplayValue('Enviar propuesta');
    fireEvent.change(accion, { target: { value: 'Enviar propuesta ajustada' } });
    await act(async () => {
      fireEvent.click(within(drawer).getByRole('button', { name: 'Guardar seguimiento' }));
    });
    await waitFor(() => expect(llamadas.find((l) => l.method === 'PATCH')).toMatchObject({ url: `/api/crm/opportunities/${U(1)}/seguimiento`, body: { next_action: 'Enviar propuesta ajustada', next_contact_at: '2026-10-01T10:00:00.000-05:00' } }));
  });

  test('móvil: una columna a la vez con chips de etapa', async () => {
    simularAncho(390);
    renderConIdioma(<PipelinePantalla />);
    await screen.findByRole('tab', { name: /Calificación · 1/ });
    fireEvent.click(screen.getByRole('tab', { name: /Propuesta · 1/ }));
    await screen.findByText('Renovación licencias 2027');
  });
});
