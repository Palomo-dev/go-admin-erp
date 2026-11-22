/**
 * @jest-environment jsdom
 *
 * Ficha del cliente (Figma 06 Clientes 319:2837): pestañas del kit (`TabBar`)
 * en el orden del Figma con la elegida en `?pestana=` (regla de pestañas
 * 2026-10-05). Sin parámetro abre «Resumen»; «Contactos» solo existe en
 * empresas; los valores viejos (`info`, `timeline`, `cuentas`) siguen abriendo
 * su pestaña; tablist/tab/tabpanel enlazados; «atrás» mueve la pestaña.
 * Cabecera: estado real junto al nombre, sucursal en el subtítulo y «Registrar
 * pago» conectado a la cartera (deshabilitado con motivo si no hay saldo).
 * Las pestañas en sí se sustituyen por marcadores: aquí solo se prueba cuál
 * se monta.
 */
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';

const push = jest.fn();
const nav = { ruta: '/app/clientes/c1', params: new URLSearchParams(), oyentes: new Set<() => void>() };
function irA(url: string) {
  const [ruta, qs = ''] = url.split('?');
  nav.ruta = ruta;
  nav.params = new URLSearchParams(qs);
  nav.oyentes.forEach((f) => f());
}
jest.mock('next/navigation', () => {
  const { useSyncExternalStore } = jest.requireActual<typeof import('react')>('react');
  const suscribir = (f: () => void) => {
    nav.oyentes.add(f);
    return () => {
      nav.oyentes.delete(f);
    };
  };
  const router = {
    push: (...a: [string, unknown?]) => {
      push(...a);
      irA(a[0]);
    },
    replace: (u: string) => irA(u),
    back: jest.fn(),
    prefetch: jest.fn(),
  };
  return {
    useRouter: () => router,
    useParams: () => ({ id: 'c1' }),
    usePathname: () => useSyncExternalStore(suscribir, () => nav.ruta),
    useSearchParams: () => useSyncExternalStore(suscribir, () => nav.params),
  };
});

let cliente: Record<string, unknown>;
jest.mock('@/lib/supabase/config', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: cliente, error: null }) }) }) }) },
}));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({ useFormatDate: () => ({ timezone: 'America/Bogota' }) }));
jest.mock('@/components/crm/ficha/useFichaClienteCrm', () => ({
  useFichaClienteCrm: () => ({ barra: null, vacioResumen: null, onNuevaOportunidad: () => undefined, onNuevaTarea: () => undefined, recarga: 0, dialogos: null }),
}));
jest.mock('@/components/clientes/listado/useOperacionesClientes', () => ({ useOperacionesClientes: () => ({ cambiarEstado: jest.fn(), copiarId: jest.fn() }) }));
jest.mock('@/components/clientes/listado/EliminarClientesDialog', () => ({ EliminarClientesDialog: () => null }));
const marcador = (nombre: string) => ({ __esModule: true, default: () => <p>panel:{nombre}</p> });
jest.mock('@/components/clientes/id/ClienteHeader', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/clientes/id/TareasSidebar', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/clientes/id/ResumenTab', () => marcador('resumen'));
jest.mock('@/components/clientes/id/InfoTab', () => marcador('info'));
jest.mock('@/components/clientes/id/OportunidadesTab', () => marcador('oportunidades'));
jest.mock('@/components/clientes/id/TimelineTab', () => marcador('timeline'));
jest.mock('@/components/clientes/id/CuentasTab', () => marcador('cuentas'));
jest.mock('@/components/clientes/id/NotasArchivosTab', () => marcador('notas'));
jest.mock('@/components/clientes/CompanyContactsManager', () => ({ CompanyContactsManager: () => <p>panel:contactos</p> }));
jest.mock('@/components/clientes/id/SaludClienteCard', () => ({ SaludClienteCard: () => null }));
jest.mock('@/components/finanzas/pagos/RegistrarPagoConectado', () => ({
  RegistrarPagoConectado: (p: { destino: { tipo: string; customerId?: string }; origen: string }) => (
    <p>
      {`cobro:${p.destino.tipo}:${p.destino.customerId}:${p.origen}`}
    </p>
  ),
}));
jest.mock('@/components/finanzas/cartera/EstadoCuentaDialog', () => ({ EstadoCuentaDialog: () => null }));
interface CarteraPrueba {
  estado: string;
  resumen: { por_cobrar: number; cuentas_vencidas: number; monedas: string[] } | null;
  filas: unknown[];
  puedeCobrar: boolean;
  permisosCargando: boolean;
  recargar: () => void;
}
let cartera: CarteraPrueba;
jest.mock('@/components/clientes/id/useCarteraFicha', () => {
  const real = jest.requireActual('@/components/clientes/id/useCarteraFicha');
  return { ...real, useCarteraFicha: () => cartera };
});
jest.mock('@/components/crm/clientes/CustomerFoliosSection', () => ({ CustomerFoliosSection: () => null }));
jest.mock('@/components/crm/documents/DocumentUploader', () => ({ DocumentUploader: () => null }));

import PerfilCliente from '@/app/app/clientes/[id]/page';

const PERSONA = { id: 'c1', organization_id: 120, first_name: 'Ana', last_name: 'Pérez', full_name: 'Ana Pérez', email: 'ana@correo-ejemplo.com', phone: null, address: '', city: '', notes: '', tags: [], preferences: null, created_at: '2026-01-10T15:00:00Z', updated_at: '2026-01-10T15:00:00Z', customer_type: 'person', status: 'active', lifecycle_stage: 'customer', identification_type: 'CC', identification_number: '1020304050', branch: { name: 'Sucursal Centro' } };
const CON_SALDO: CarteraPrueba = { estado: 'listo', resumen: { por_cobrar: 350000, cuentas_vencidas: 1, monedas: ['COP'] }, filas: [], puedeCobrar: true, permisosCargando: false, recargar: () => undefined };

beforeEach(() => {
  push.mockReset();
  nav.ruta = '/app/clientes/c1';
  nav.params = new URLSearchParams();
  cliente = PERSONA;
  cartera = CON_SALDO;
});

const seleccionada = () => screen.getAllByRole('tab').find((t) => t.getAttribute('aria-selected') === 'true')?.textContent;

test('sin `?pestana=` abre «Resumen»; la pestaña va a la URL y «atrás» la devuelve', async () => {
  renderConIdioma(<PerfilCliente />);
  await screen.findByText('panel:resumen');
  expect(seleccionada()).toBe('Resumen');
  // Una persona no tiene «Contactos».
  // Orden y nombres del Figma (331:113171); una persona no tiene «Contactos».
  expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Resumen', 'Información', 'Actividad', 'Finanzas', 'Oportunidades', 'Notas y documentos']);

  fireEvent.click(screen.getByRole('tab', { name: 'Finanzas' }));
  expect(push).toHaveBeenLastCalledWith('/app/clientes/c1?pestana=finanzas', { scroll: false });
  await screen.findByText('panel:cuentas');
  expect(screen.queryByText('panel:resumen')).toBeNull();

  // a11y: el panel está enlazado con su pestaña.
  const panel = screen.getByRole('tabpanel');
  const tab = screen.getByRole('tab', { name: 'Finanzas' });
  expect(panel.getAttribute('aria-labelledby')).toBe(tab.id);
  expect(tab.getAttribute('aria-controls')).toBe(panel.id);

  act(() => irA('/app/clientes/c1'));
  await screen.findByText('panel:resumen');
  expect(seleccionada()).toBe('Resumen');
});

test.each([
  ['timeline', 'panel:timeline', 'Actividad'],
  ['cuentas', 'panel:cuentas', 'Finanzas'],
  ['info', 'panel:info', 'Información'],
  ['actividad', 'panel:timeline', 'Actividad'],
  ['finanzas', 'panel:cuentas', 'Finanzas'],
  ['notas', 'panel:notas', 'Notas y documentos'],
])('`?pestana=%s` (enlaces viejos y nuevos) abre su pestaña', async (valor, panel, pestana) => {
  irA(`/app/clientes/c1?pestana=${valor}`);
  renderConIdioma(<PerfilCliente />);
  await screen.findByText(panel);
  expect(seleccionada()).toBe(pestana);
});

test('«contactos» en una persona cae a «Resumen»', async () => {
  irA('/app/clientes/c1?pestana=contactos');
  renderConIdioma(<PerfilCliente />);
  await screen.findByText('panel:resumen');
  expect(seleccionada()).toBe('Resumen');
});

test('empresa: «Contactos» existe y se abre por la URL', async () => {
  cliente = { ...PERSONA, customer_type: 'company', full_name: 'Empresa Ejemplo S.A.S.' };
  irA('/app/clientes/c1?pestana=contactos');
  renderConIdioma(<PerfilCliente />);
  await screen.findByText('panel:contactos');
  await waitFor(() => expect(seleccionada()).toBe('Contactos'));
});

test('cabecera: estado real junto al nombre y «Cliente desde · sucursal · documento»', async () => {
  renderConIdioma(<PerfilCliente />);
  await screen.findByText('panel:resumen');
  expect(screen.getAllByText('Cliente').length).toBeGreaterThan(0);
  expect(screen.getAllByText(/Cliente desde .+ · Sucursal Centro · CC 1020304050/).length).toBeGreaterThan(0);
});

test('un lead se marca «Lead» y uno inactivo «Inactivo»', async () => {
  cliente = { ...PERSONA, lifecycle_stage: 'lead' };
  const { unmount } = renderConIdioma(<PerfilCliente />);
  await screen.findByText('panel:resumen');
  expect(screen.getAllByText('Lead').length).toBeGreaterThan(0);
  unmount();

  cliente = { ...PERSONA, status: 'inactive' };
  renderConIdioma(<PerfilCliente />);
  await screen.findByText('panel:resumen');
  expect(screen.getAllByText('Inactivo').length).toBeGreaterThan(0);
});

test('«Registrar pago» abre el cobro de todas las cuentas abiertas del cliente', async () => {
  renderConIdioma(<PerfilCliente />);
  await screen.findByText('panel:resumen');
  const boton = screen.getAllByRole('button', { name: /Registrar pago/ })[0] as HTMLButtonElement;
  expect(boton.disabled).toBe(false);
  fireEvent.click(boton);
  expect(await screen.findByText('cobro:tercero:c1:ficha_cliente')).toBeTruthy();
});

test('sin saldo, «Registrar pago» queda deshabilitado con el motivo «Sin saldo por cobrar»', async () => {
  cartera = { ...CON_SALDO, resumen: { por_cobrar: 0, cuentas_vencidas: 0, monedas: ['COP'] } };
  renderConIdioma(<PerfilCliente />);
  await screen.findByText('panel:resumen');
  const boton = screen.getAllByRole('button', { name: /Registrar pago/ })[0] as HTMLButtonElement;
  expect(boton.disabled).toBe(true);
  expect(boton.getAttribute('title')).toBe('Sin saldo por cobrar');
  expect(screen.getByText('Sin saldo por cobrar', { selector: '.sr-only' })).toBeTruthy();
});

test('sin permiso de cobro, el motivo lo dice', async () => {
  cartera = { ...CON_SALDO, puedeCobrar: false };
  renderConIdioma(<PerfilCliente />);
  await screen.findByText('panel:resumen');
  const boton = screen.getAllByRole('button', { name: /Registrar pago/ })[0] as HTMLButtonElement;
  expect(boton.disabled).toBe(true);
  expect(boton.getAttribute('title')).toBe('No tienes permiso para registrar pagos.');
});

test('cliente que no existe: migas, «Cliente no encontrado», «Reintentar» y «Volver a clientes»', async () => {
  cliente = null as unknown as Record<string, unknown>;
  renderConIdioma(<PerfilCliente />);
  expect((await screen.findAllByText('Cliente no encontrado')).length).toBeGreaterThan(0);
  expect(screen.getByRole('button', { name: /Reintentar/ })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Volver a clientes' })).toBeTruthy();
});
