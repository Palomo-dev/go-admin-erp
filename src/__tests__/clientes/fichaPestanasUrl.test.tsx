/**
 * @jest-environment jsdom
 *
 * Ficha del cliente: pestañas del kit (`TabBar`) con la elegida en
 * `?pestana=` (regla de pestañas 2026-10-05). Sin parámetro abre «Resumen»;
 * «Contactos» solo existe en empresas; tablist/tab/tabpanel enlazados con
 * `idPestana`/`idPanel`; «atrás» del navegador mueve la pestaña.
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
jest.mock('@/components/crm/health/ClientHealthCard', () => ({ ClientHealthCard: () => null }));
jest.mock('@/components/crm/clientes/CustomerFoliosSection', () => ({ CustomerFoliosSection: () => null }));
jest.mock('@/components/crm/documents/DocumentUploader', () => ({ DocumentUploader: () => null }));

import PerfilCliente from '@/app/app/clientes/[id]/page';

const PERSONA = { id: 'c1', organization_id: 120, first_name: 'Ana', last_name: 'Pérez', full_name: 'Ana Pérez', email: 'ana@correo-ejemplo.com', phone: null, address: '', city: '', notes: '', tags: [], preferences: null, created_at: '2026-01-10T15:00:00Z', updated_at: '2026-01-10T15:00:00Z', customer_type: 'person', status: 'active' };

beforeEach(() => {
  push.mockReset();
  nav.ruta = '/app/clientes/c1';
  nav.params = new URLSearchParams();
  cliente = PERSONA;
});

const seleccionada = () => screen.getAllByRole('tab').find((t) => t.getAttribute('aria-selected') === 'true')?.textContent;

test('sin `?pestana=` abre «Resumen»; la pestaña va a la URL y «atrás» la devuelve', async () => {
  renderConIdioma(<PerfilCliente />);
  await screen.findByText('panel:resumen');
  expect(seleccionada()).toBe('Resumen');
  // Una persona no tiene «Contactos».
  expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Resumen', 'Información', 'Oportunidades', 'Actividad', 'Cuentas por cobrar', 'Notas y archivos']);

  fireEvent.click(screen.getByRole('tab', { name: 'Cuentas por cobrar' }));
  expect(push).toHaveBeenLastCalledWith('/app/clientes/c1?pestana=cuentas', { scroll: false });
  await screen.findByText('panel:cuentas');
  expect(screen.queryByText('panel:resumen')).toBeNull();

  // a11y: el panel está enlazado con su pestaña.
  const panel = screen.getByRole('tabpanel');
  const tab = screen.getByRole('tab', { name: 'Cuentas por cobrar' });
  expect(panel.getAttribute('aria-labelledby')).toBe(tab.id);
  expect(tab.getAttribute('aria-controls')).toBe(panel.id);

  act(() => irA('/app/clientes/c1'));
  await screen.findByText('panel:resumen');
  expect(seleccionada()).toBe('Resumen');
});

test('un enlace con `?pestana=timeline` abre «Actividad»; «contactos» en una persona cae a «Resumen»', async () => {
  irA('/app/clientes/c1?pestana=timeline');
  const { unmount } = renderConIdioma(<PerfilCliente />);
  await screen.findByText('panel:timeline');
  expect(seleccionada()).toBe('Actividad');
  unmount();

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
