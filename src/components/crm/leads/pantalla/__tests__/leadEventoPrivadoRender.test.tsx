/**
 * @jest-environment jsdom
 *
 * Detalle rápido de un lead de evento privado del sitio (Figma 1951:941568),
 * con el proveedor real de next-intl y `fetch` simulado por ruta: tarjeta
 * «Evento privado», «Crear reserva de grupo en <sede>», fila «Inasistencias» y
 * «Solicitud de evento privado» en la actividad. Estados: sin evento, sin sede,
 * 0 inasistencias, error del contexto y sin acceso a Reservas de mesas.
 */
import type { ReactElement } from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderConIdioma, type IdiomaPrueba } from '@/test-utils/renderConIdioma';
import { contextoMoneda } from '@/lib/utils/moneda';
import { NavegacionVisibleProvider, type NavegacionVisible } from '@/lib/navigation/NavegacionVisible';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), prefetch: jest.fn() }), usePathname: () => '/app/crm/leads', useSearchParams: () => new URLSearchParams() }));
const FECHAS = { timezone: 'America/Bogota', getToday: () => '2026-10-06', formatDate: (v: string) => v, formatDateTime: (v: string) => v, formatTime: (v: string) => v, formatPlain: (v: string) => v };
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({ useFormatDate: () => FECHAS }));
const COP = { ...contextoMoneda('COP', { locale: 'es-CO' }), formatear: (v: number) => `$ ${v}`, paraDocumento: () => contextoMoneda('COP', { locale: 'es-CO' }), resuelta: true };
jest.mock('@/lib/hooks/useOrgCurrency', () => ({ useMonedaOrganizacion: () => COP }));
jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));
jest.mock('@/components/voice/SoftphoneProvider', () => ({ useSoftphone: () => ({ available: false }) }));
jest.mock('@/components/voice/hooks/useCallModePolicy', () => ({ useCallModePolicy: () => ({ decision: null }) }));
jest.mock('@/components/crm/shared/useOrgDefaultCountry', () => ({ useOrgDefaultCountry: () => '57' }));
jest.mock('@/components/ui/use-toast', () => ({ toast: jest.fn() }));
const dialogo = jest.fn();
jest.mock('../ReservaGrupoLeadDialog', () => ({
  ReservaGrupoLeadDialog: (p: { abierto: boolean; sede: { nombre: string }; lead: { id: string }; evento: { invitados: number | null } }) => {
    dialogo(p);
    return p.abierto ? <div role="dialog">reserva-grupo</div> : null;
  },
}));

import { LeadDetalleHoja } from '../LeadDetalleHoja';
import type { LeadApi } from '../leadsPantallaLogica';

const ID = '00000000-0000-4000-8000-000000000010';
const CAPTURA = {
  form: 'private_events',
  branch_id: 115,
  details: { event_type: 'Cumpleaños', event_date: '2026-10-24', guests: 25, budget_label: '$ 80.000 a $ 120.000', message: 'Queremos la terraza y torta propia.' },
  captured_at: '2026-10-06T15:12:00+00',
};
const API: LeadApi = { id: ID, full_name: 'Laura Peña', email: 'laura@correo-ejemplo.com', phone: '+57 300 555 1234', lead_source: 'web_form', owner_id: null, lead_score: 64, last_contact_at: null, tags: ['evento-privado'], created_at: '2026-10-06T15:12:00Z', metadata_lead: { capturas: [CAPTURA] } };
const FILA = { id: ID, full_name: 'Laura Peña', email: API.email, phone: API.phone, lead_source: 'web_form' as const, lead_score: 64, tags: ['evento-privado'], last_contact_at: null, responsable: null, documento: null };
const CONTEXTO = { sede: { id: 115, nombre: 'Sede Norte' }, inasistencias: { total: 2, ultima: { fecha: '2026-10-03', sede: 'Sede Norte' } } };
const NAV = { cargando: false, secciones: [{ modulos: [{ modulo: { codigo: 'pos' }, paginas: [{ href: '/app/pos/reservas-mesas', nombre: 'Reservas de mesas' }] }] }] } as unknown as NavegacionVisible;

let contexto: { status: number; body: unknown };
beforeEach(() => {
  dialogo.mockReset();
  contexto = { status: 200, body: { success: true, data: CONTEXTO } };
  global.fetch = jest.fn(async (entrada: RequestInfo | URL) => {
    const url = String(entrada);
    const r = url.startsWith(`/api/crm/leads/${ID}/evento`) ? contexto : url.startsWith('/api/crm/activities') ? { status: 200, body: { success: true, data: [] } } : { status: 404, body: { success: false } };
    return { ok: r.status < 400, status: r.status, json: async () => r.body } as Response;
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
  expect(document.body.textContent ?? '').not.toMatch(/crm\.pantallaLeads/);
});

function hoja(api: LeadApi = API, opciones: { idioma?: IdiomaPrueba; nav?: boolean } = {}) {
  const el: ReactElement = <LeadDetalleHoja lead={FILA} api={api} onCerrar={jest.fn()} onCalificar={jest.fn()} onAsignar={jest.fn()} onDescartar={jest.fn()} permisos={{ convertir: true, asignar: true, editar: true }} />;
  return renderConIdioma(opciones.nav === false ? el : <NavegacionVisibleProvider valor={NAV}>{el}</NavegacionVisibleProvider>, { idioma: opciones.idioma });
}

test('con evento: tarjeta, inasistencias, actividad y «Crear reserva de grupo»', async () => {
  hoja();
  expect(screen.getByText('Evento privado')).toBeTruthy();
  expect(screen.getByText('Cumpleaños')).toBeTruthy();
  expect(screen.getByText('Sábado 24 de octubre de 2026')).toBeTruthy();
  expect(screen.getByText('25')).toBeTruthy();
  expect(screen.getByText('$ 80.000 a $ 120.000')).toBeTruthy();
  expect(screen.getByText('Queremos la terraza y torta propia.')).toBeTruthy();
  expect(await screen.findByText('2 reservas sin llegar · última 3 oct (Sede Norte)')).toBeTruthy();
  expect(screen.getByText('Solicitud de evento privado')).toBeTruthy();
  expect(screen.getByText('Cumpleaños · 25 invitados · Sede Norte')).toBeTruthy();
  expect(screen.getByText('Nuevo')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Crear reserva de grupo en Sede Norte' }));
  expect(await screen.findByText('reserva-grupo')).toBeTruthy();
  expect(dialogo).toHaveBeenLastCalledWith(expect.objectContaining({ abierto: true, sede: CONTEXTO.sede, lead: expect.objectContaining({ id: ID }), evento: expect.objectContaining({ invitados: 25, fecha: '2026-10-24' }) }));
});

test('lead sin evento: sin tarjeta ni solicitud; 0 inasistencias: sin fila', async () => {
  contexto = { status: 200, body: { success: true, data: { sede: null, inasistencias: { total: 0, ultima: null } } } };
  hoja({ ...API, metadata_lead: { ultima_captura_web: { form: 'contact' } } });
  await screen.findByText('Todavía no hay actividad con este lead.');
  await waitFor(() => expect((global.fetch as jest.Mock).mock.calls.some((c) => String(c[0]).includes('/evento'))).toBe(true));
  expect(screen.queryByText('Evento privado')).toBeNull();
  expect(screen.queryByText('Inasistencias')).toBeNull();
  expect(screen.queryByText('Solicitud de evento privado')).toBeNull();
});

test('sin sede: «Sin sede elegida» y sin botón', async () => {
  contexto = { status: 200, body: { success: true, data: { sede: null, inasistencias: { total: 0, ultima: null } } } };
  hoja({ ...API, metadata_lead: { capturas: [{ ...CAPTURA, branch_id: undefined }] } });
  expect((await screen.findAllByText('Sin sede elegida')).length).toBeGreaterThan(0);
  expect(screen.queryByRole('button', { name: /Crear reserva de grupo/ })).toBeNull();
});

test('error al resolver la sede: aviso en su fila y sin botón', async () => {
  contexto = { status: 500, body: { success: false } };
  hoja();
  expect(await screen.findByText('No se pudo cargar la sede')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Crear reserva de grupo/ })).toBeNull();
  expect(screen.queryByText('Inasistencias')).toBeNull();
});

test('sin acceso a Reservas de mesas: la tarjeta se ve, el botón no', async () => {
  hoja(API, { nav: false });
  await screen.findByText('2 reservas sin llegar · última 3 oct (Sede Norte)');
  expect(screen.queryByRole('button', { name: /Crear reserva de grupo/ })).toBeNull();
});

test('una sola inasistencia, en singular', async () => {
  contexto = { status: 200, body: { success: true, data: { ...CONTEXTO, inasistencias: { total: 1, ultima: { fecha: '2026-10-03', sede: null } } } } };
  hoja();
  expect(await screen.findByText('1 reserva sin llegar · última 3 oct')).toBeTruthy();
});

describe.each(['en', 'fr', 'pt'] as IdiomaPrueba[])('en %s', (idioma) => {
  test('todas las claves existen', async () => {
    hoja(API, { idioma });
    await screen.findByRole('button', { name: /Sede Norte/ });
  });
});
