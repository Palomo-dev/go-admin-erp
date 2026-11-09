/**
 * @jest-environment jsdom
 *
 * Integraciones › Conexiones (2026-11-09): la cabecera y la barra usan las piezas compartidas de
 * las demás listas (`ListToolbar` + `SearchInput` + «Filtros» + pestañas) y en el celular las
 * acciones («Conectar», «Importar CSV») viven en el «⋯» del MobileHeader. Queja del dueño: el
 * buscador no era el de las otras listas y en móvil no había forma de conectar ni importar.
 */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderConIdioma, simularAncho } from '@/test-utils/renderConIdioma';
import { TooltipProvider } from '@/components/ui/tooltip';
import { CabeceraMovilProvider, useCabeceraMovilActual } from '@/components/shell/header/cabeceraMovil';
import { ConexionesPagina } from '../ConexionesPagina';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), prefetch: jest.fn() };
let params = new URLSearchParams();
jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/app/integraciones/conexiones',
  useSearchParams: () => params,
}));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({
  useFormatDate: () => ({
    formatDate: (v: string) => String(v).slice(0, 10),
    formatDateTime: (v: string) => String(v).slice(0, 16),
    formatTime: (v: string) => String(v).slice(11, 16),
    formatPlain: (v: string) => v,
    getToday: () => '2026-11-09',
    toDate: (d: Date) => d.toISOString().slice(0, 10),
    toInstant: (dia: string, hora = '00:00') => `${dia}T${hora}:00-05:00`,
  }),
}));
jest.mock('@/lib/services/integrations/conexiones/clienteConexiones', () => ({
  apiConexiones: {
    listar: jest.fn(async () => ({ catalogo: [], conexiones: [], conectores: [] })),
    eventos: jest.fn(async () => ({ eventos: [], errores: 0, total: 0, pagina: 1, tamano: 50 })),
    llavesApi: jest.fn(async () => ({ llaves: [] })),
    webhooks: jest.fn(async () => ({ webhooks: [] })),
  },
  ErrorApiConexiones: class extends Error {},
}));
// Los asistentes cargan muchos módulos; aquí solo importa la cabecera.
jest.mock('@/components/integraciones/conexiones-v2/asistentes', () => ({ AsistenteConexion: () => null, tieneAsistente: () => false }));

function MobileHeaderDePrueba() {
  const c = useCabeceraMovilActual();
  return (
    <div data-testid="mobile-header">
      <span data-testid="mobile-titulo">{c?.titulo}</span>
      {c?.accion}
    </div>
  );
}

function montar() {
  return renderConIdioma(
    <TooltipProvider>
      <CabeceraMovilProvider>
        <MobileHeaderDePrueba />
        <ConexionesPagina />
      </CabeceraMovilProvider>
    </TooltipProvider>,
  );
}

const enCabeceraOculta = (el: HTMLElement) => el.closest('header')?.className.includes('hidden lg:flex') ?? false;

beforeEach(() => {
  params = new URLSearchParams();
  mockRouter.push.mockClear();
});
afterAll(() => simularAncho(1440));

describe('escritorio (1440 px): cabecera y barra estándar (Figma 85-00)', () => {
  beforeEach(() => simularAncho(1440));

  test('«Conectar» + «⋯» en la cabecera; buscador con rol search y botón «Filtros»; pestañas', async () => {
    montar();
    await waitFor(() => expect(screen.getByRole('tab', { name: /Catálogo/ })).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Conectar' })).toBeTruthy();
    // El «⋯» existe dos veces (cabecera de escritorio y MobileHeader); se exige el de la cabecera.
    const menus = screen.getAllByRole('button', { name: 'Acciones de Conexiones' });
    expect(menus.some((b) => b.closest('header')?.className.includes('hidden lg:flex'))).toBe(true);
    expect(screen.getByRole('search')).toBeTruthy();
    expect(screen.getByRole('searchbox', { name: 'Buscar servicio' })).toBeTruthy();
    const filtros = screen.getByRole('button', { name: 'Filtros' });
    expect(filtros.getAttribute('aria-haspopup')).toBe('dialog');
    expect(enCabeceraOculta(filtros)).toBe(false);
    for (const n of ['Catálogo', 'Mis conexiones', 'Actividad', 'Desarrolladores']) expect(screen.getByRole('tab', { name: new RegExp(n) })).toBeTruthy();
  });

  test('la búsqueda y la pestaña van a la URL (como en las demás listas)', async () => {
    montar();
    await waitFor(() => expect(screen.getByRole('tab', { name: /Actividad/ })).toBeTruthy());
    fireEvent.click(screen.getByRole('tab', { name: /Actividad/ }));
    expect(mockRouter.push).toHaveBeenCalledWith('/app/integraciones/conexiones?tab=actividad', { scroll: false });
    const campo = screen.getByRole('searchbox', { name: 'Buscar servicio' });
    fireEvent.change(campo, { target: { value: 'wompi' } });
    fireEvent.keyDown(campo, { key: 'Enter' });
    expect(mockRouter.replace).toHaveBeenCalledWith('/app/integraciones/conexiones?q=wompi', { scroll: false });
  });

  test('el buscador se adapta a la pestaña: en Desarrolladores busca llaves o webhooks', async () => {
    params = new URLSearchParams('tab=desarrolladores');
    montar();
    await waitFor(() => expect(screen.getByRole('searchbox', { name: 'Buscar llave o webhook' })).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Filtros' })).toBeTruthy();
  });
});

describe('celular (390 px): acciones en el «⋯» del MobileHeader (Figma 85-50b)', () => {
  beforeEach(() => simularAncho(390));

  test('la cabecera de escritorio queda oculta y el MobileHeader recibe título y «⋯» con Conectar e Importar CSV', async () => {
    montar();
    await waitFor(() => expect(screen.getByTestId('mobile-titulo').textContent).toBe('Conexiones'));
    const conectarEscritorio = screen.getByRole('button', { name: 'Conectar' });
    expect(enCabeceraOculta(conectarEscritorio)).toBe(true);
    const menu = screen.getByTestId('mobile-header').querySelector('button[aria-haspopup="menu"]') as HTMLButtonElement | null;
    expect(menu).not.toBeNull();
    // En celular el «⋯» abre la hoja de acciones del kit (ActionSheet), no un menú desplegable.
    fireEvent.click(menu!);
    expect((await screen.findAllByText('Conectar un servicio')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Importar CSV').length).toBeGreaterThan(0);
    expect(screen.queryByText('Exportar CSV')).toBeNull();
  });

  test('buscador y «Filtros» siguen visibles en el celular, fuera de la cabecera oculta', async () => {
    montar();
    await waitFor(() => expect(screen.getByRole('tab', { name: /Catálogo/ })).toBeTruthy());
    expect(enCabeceraOculta(screen.getByRole('searchbox', { name: 'Buscar servicio' }))).toBe(false);
    expect(enCabeceraOculta(screen.getByRole('button', { name: 'Filtros' }))).toBe(false);
  });
});
