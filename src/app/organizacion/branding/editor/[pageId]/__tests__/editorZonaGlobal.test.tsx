/**
 * @jest-environment jsdom
 *
 * Editor de páginas · cableado del encabezado y el pie globales (Figma «16
 * Sitio web › 05 Editor»): la fila fija abre el inspector derecho, «Editar
 * menú» abre la hoja del constructor sin salir de la página, y el clic en el
 * lienzo (mensaje `goadmin:select` con `header`) selecciona el encabezado.
 */
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import PageEditorPage from '../page';

const toast = jest.fn();

jest.mock('next/navigation', () => ({
  useParams: () => ({ pageId: 'pag-1' }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/organizacion/branding/editor/pag-1',
}));
jest.mock('@/lib/hooks/useOrganization', () => ({
  useOrganization: () => ({ organization: { id: 120 } }),
  // Lo usan los clientes del navegador del editor (sitios V2, fuentes de datos de «Añadir sección»).
  getOrganizationId: () => 120,
}));
jest.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast }) }));

jest.mock('@/lib/services/websitePageBuilderService', () => {
  const real = jest.requireActual('@/lib/services/websitePageBuilderService');
  const pagina = {
    id: 'pag-1',
    organization_id: 120,
    branch_id: null,
    title: 'Inicio',
    slug: 'home',
    page_type: 'custom',
    sections: [
      {
        id: 'sec-1',
        page_id: 'pag-1',
        organization_id: 120,
        section_type: 'hero',
        section_variant: 'minimal',
        content: {},
        settings: {},
        sort_order: 0,
        is_visible: true,
      },
    ],
  };
  return {
    ...real,
    websitePageBuilderService: {
      ...real.websitePageBuilderService,
      getPageWithSections: jest.fn(async () => pagina),
      getPages: jest.fn(async () => [pagina]),
      // El lienzo apunta a un sitio de pruebas (el iframe no carga en jsdom).
      getPreviewUrl: jest.fn(async () => 'https://tienda-120.goadmin.io'),
      getPreviewEntities: jest.fn(async () => []),
    },
  };
});
jest.mock('@/lib/services/websiteSettingsService', () => {
  const real = jest.requireActual('@/lib/services/websiteSettingsService');
  return {
    ...real,
    websiteSettingsService: {
      ...real.websiteSettingsService,
      getSettings: jest.fn(async () => ({ id: 'ws-1', organization_id: 120, header_style: 'default', footer_style: 'default', header_menu_id: null })),
    },
  };
});
jest.mock('@/lib/services/branchService', () => ({ branchService: { getBranches: jest.fn(async () => []) } }));
jest.mock('@/lib/services/websiteMenuGroupService', () => ({
  websiteMenuGroupService: { getMenus: jest.fn(async () => []) },
}));
jest.mock('@/components/organization/branding/editor/MenuTreeEditor', () => ({
  __esModule: true,
  default: () => <div data-testid="menu-tree-editor" />,
}));
jest.mock('@/components/organization/branding/editor/MenuGroupEditor', () => ({
  __esModule: true,
  default: () => <div data-testid="menu-group-editor" />,
}));
jest.mock('@/components/organization/branding/editor/MenuGroupManager', () => ({
  __esModule: true,
  default: () => <div data-testid="menu-group-manager" />,
}));

beforeEach(() => {
  // El manifiesto de secciones del sitio no está en las pruebas.
  (globalThis as unknown as { fetch: unknown }).fetch = jest.fn(async () => ({ ok: false, json: async () => null }));
});

async function renderEditor() {
  renderConIdioma(<PageEditorPage />);
  await screen.findByRole('button', { name: /Encabezado \(global\)/ });
}

/** Mensaje del PreviewBridge del sitio, desde el dominio de la organización. */
function mensajeDelLienzo(data: Record<string, unknown>, origin = 'https://tienda-120.goadmin.io') {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { data, origin }));
  });
}

describe('Editor · encabezado y pie globales', () => {
  test('la fila del encabezado abre el inspector y «Editar menú» la hoja del menú', async () => {
    await renderEditor();
    expect(screen.queryByRole('complementary', { name: 'Inspector: Encabezado' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Encabezado \(global\)/ }));
    const inspector = screen.getByRole('complementary', { name: 'Inspector: Encabezado' });
    expect(inspector).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Diseño' }).getAttribute('aria-selected')).toBe('true');

    fireEvent.click(screen.getByRole('tab', { name: 'Contenido' }));
    fireEvent.click(screen.getByRole('button', { name: 'Editar menú' }));
    // Sin menú nombrado asignado: el árbol de páginas, en la hoja lateral.
    expect(await screen.findByText('Menú del encabezado · Páginas del sitio')).toBeTruthy();
    expect(screen.getByTestId('menu-tree-editor')).toBeTruthy();
    // La página del editor sigue montada detrás (no se navega); la hoja es
    // modal, así que el fondo queda fuera del árbol accesible.
    expect(screen.getByRole('button', { name: /Pie de página \(global\)/, hidden: true })).toBeTruthy();
  });

  test('la fila del pie abre su inspector; elegir una sección lo cierra', async () => {
    await renderEditor();
    fireEvent.click(screen.getByRole('button', { name: /Pie de página \(global\)/ }));
    expect(screen.getByRole('complementary', { name: 'Inspector: Pie de página' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /^Sección / }));
    expect(screen.queryByRole('complementary', { name: 'Inspector: Pie de página' })).toBeNull();
  });

  test('clic en el encabezado del lienzo lo selecciona; en un enlace, abre el menú', async () => {
    await renderEditor();
    mensajeDelLienzo({ type: 'goadmin:select', sectionId: 'header', enlace: false });
    expect(screen.getByRole('complementary', { name: 'Inspector: Encabezado' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Encabezado \(global\)/ }).getAttribute('aria-pressed')).toBe('true');

    // Ya seleccionado, un clic en un enlace del encabezado abre su menú.
    mensajeDelLienzo({ type: 'goadmin:select', sectionId: 'header', enlace: true });
    await waitFor(() => expect(screen.getByTestId('menu-tree-editor')).toBeTruthy());
  });

  test('un mensaje de un origen ajeno al lienzo se ignora', async () => {
    await renderEditor();
    mensajeDelLienzo({ type: 'goadmin:select', sectionId: 'header' }, 'https://otro-sitio.example');
    expect(screen.queryByRole('complementary', { name: 'Inspector: Encabezado' })).toBeNull();
  });

  test('con el lienzo en celular, seleccionar el encabezado abre en «Celular»', async () => {
    await renderEditor();
    fireEvent.click(screen.getByTitle('Móvil'));
    fireEvent.click(screen.getByRole('button', { name: /Encabezado \(global\)/ }));
    expect(screen.getByRole('tab', { name: 'Celular' }).getAttribute('aria-selected')).toBe('true');
  });
});
