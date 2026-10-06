/**
 * @jest-environment jsdom
 *
 * Editor del sitio (Figma A/05, D/05-14, «figma-estilo»), montado desde la ruta física del
 * editor. Sitio en modo legacy (sin borrador V2), con datos ficticios de la org 120:
 * - encabezado y pie globales: la fila fija abre el inspector, «Editar menú» abre la hoja del
 *   menú y el clic en el lienzo (mensaje `goadmin:select`) los selecciona;
 * - inspector de sección con Diseño · Contenido · Estilo · Avanzado y el estilo por sección
 *   (tipografía propia, «Mostrar en» con el chip «Oculta en celular»);
 * - «←» lleva a Páginas del módulo; «Guardar y publicar» solo con cambios;
 * - estados: sin permiso y celular (editor no disponible + cambios rápidos).
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderConIdioma, simularAncho } from '@/test-utils/renderConIdioma';
import PageEditorPage from '../page';

jest.mock('sonner', () => ({ toast: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() }) }));

jest.mock('next/navigation', () => ({
  useParams: () => ({ pageId: 'pag-1' }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/app/sitio-web/editor/pag-1',
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/lib/hooks/useOrganization', () => ({
  useOrganization: () => ({ organization: { id: 120 } }),
  getOrganizationId: () => 120,
  ORGANIZATION_CHANGED_EVENT: 'org-cambio',
}));

const permisos = { editar: true, publicar: true };
jest.mock('@/components/sitio-web/resumen/useResumenSitio', () => ({
  useResumenSitio: () => ({
    datos: {
      permisos,
      typeId: null,
      sitio: { host: 'tienda-120.goadmin.io', url: 'https://tienda-120.goadmin.io' },
    },
    cargando: false,
    fallo: null,
    recargar: jest.fn(),
  }),
}));

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
      getSettings: jest.fn(async () => ({
        id: 'ws-1',
        organization_id: 120,
        header_style: 'default',
        footer_style: 'default',
        header_menu_id: null,
        primary_color: '#8C6A3F',
        secondary_color: '#3A3A3A',
        accent_color: '#C8A97E',
        background_color: '#F8F1E7',
        text_color: '#1F1B16',
        font_heading: 'Playfair Display',
        font_body: 'Inter',
      })),
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
  simularAncho(1440);
  permisos.editar = true;
  // Sin API V2 ni manifiesto en las pruebas: el editor queda en legacy.
  (globalThis as unknown as { fetch: unknown }).fetch = jest.fn(async () => ({ ok: false, status: 500, json: async () => null }));
});

async function renderEditor() {
  renderConIdioma(<PageEditorPage />);
  await screen.findByRole('button', { name: /^Encabezado$/ });
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

    fireEvent.click(screen.getByRole('button', { name: /^Encabezado$/ }));
    expect(screen.getByRole('complementary', { name: 'Inspector: Encabezado' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Diseño' }).getAttribute('aria-selected')).toBe('true');

    fireEvent.click(screen.getByRole('tab', { name: 'Contenido' }));
    fireEvent.click(screen.getByRole('button', { name: 'Editar menú' }));
    expect(await screen.findByText('Menú del encabezado · Páginas del sitio')).toBeTruthy();
    expect(screen.getByTestId('menu-tree-editor')).toBeTruthy();
  });

  test('la fila del pie abre su inspector; elegir una sección lo cambia por el de la sección', async () => {
    await renderEditor();
    fireEvent.click(screen.getByRole('button', { name: /^Pie de página$/ }));
    expect(screen.getByRole('complementary', { name: 'Inspector: Pie de página' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /^Portada$/ }));
    expect(screen.queryByRole('complementary', { name: 'Inspector: Pie de página' })).toBeNull();
    expect(screen.getByRole('complementary', { name: 'Inspector: Portada' })).toBeTruthy();
  });

  test('clic en el encabezado del lienzo lo selecciona; en un enlace, abre el menú', async () => {
    await renderEditor();
    mensajeDelLienzo({ type: 'goadmin:select', sectionId: 'header', enlace: false });
    expect(screen.getByRole('complementary', { name: 'Inspector: Encabezado' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Encabezado$/ }).getAttribute('aria-pressed')).toBe('true');

    mensajeDelLienzo({ type: 'goadmin:select', sectionId: 'header', enlace: true });
    await waitFor(() => expect(screen.getByTestId('menu-tree-editor')).toBeTruthy());
  });

  test('un mensaje de un origen ajeno al lienzo se ignora', async () => {
    await renderEditor();
    mensajeDelLienzo({ type: 'goadmin:select', sectionId: 'header' }, 'https://otro-sitio.example');
    expect(screen.queryByRole('complementary', { name: 'Inspector: Encabezado' })).toBeNull();
  });

  // El panel aprobado en Figma ya no separa Escritorio/Celular en pestañas: las
  // opciones del celular viven en «Diseño», que es la pestaña con que abre.
  test('con el lienzo a 390, seleccionar el encabezado abre en «Diseño» con las opciones del celular', async () => {
    await renderEditor();
    fireEvent.click(screen.getByRole('radio', { name: 'Celular · 390 px' }));
    fireEvent.click(screen.getByRole('button', { name: /^Encabezado$/ }));
    expect(screen.getByRole('tab', { name: 'Diseño' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('radiogroup', { name: 'Buscador · celular' })).toBeTruthy();
  });
});

describe('Editor · barra, sección y estilo por sección', () => {
  test('el dispositivo se elige con iconos (4) y el ancho en px se lee al lado', async () => {
    await renderEditor();
    const grupo = screen.getByRole('radiogroup', { name: 'Ver el lienzo como' });
    const opciones = within(grupo).getAllByRole('radio');
    expect(opciones.map((o) => o.getAttribute('aria-label'))).toEqual([
      'Computador · 1440 px',
      'Portátil · 1024 px',
      'Tableta · 768 px',
      'Celular · 390 px',
    ]);
    // Solo icono: el nombre va en aria-label y en el tooltip, no como texto visible.
    expect(opciones.every((o) => o.textContent === '' && o.getAttribute('title') === o.getAttribute('aria-label'))).toBe(true);
    expect(screen.getByText('1440 px')).toBeTruthy();
    fireEvent.click(within(grupo).getByRole('radio', { name: 'Tableta · 768 px' }));
    expect(within(grupo).getByRole('radio', { name: 'Tableta · 768 px' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText('768 px')).toBeTruthy();
    // Un solo control de dispositivo y ningún selector legacy ni chip «Global» en la barra.
    expect(screen.getAllByRole('radiogroup', { name: 'Ver el lienzo como' })).toHaveLength(1);
    const barra = screen.getAllByRole('banner')[0];
    expect(within(barra).queryByText(/Global/)).toBeNull();
  });

  test('«←» vuelve a Sitio web, la barra dice «Sitio principal / página» y «Guardar y publicar» espera un cambio', async () => {
    await renderEditor();
    expect(screen.getByRole('link', { name: 'Volver a Sitio web' }).getAttribute('href')).toBe('/app/sitio-web');
    // Sin migas de texto «Sitio web /»: primero el sitio (texto, sin sedes que elegir) y luego la página.
    const migas = screen.getByRole('navigation', { name: 'Sitio y página que editas' });
    expect(within(migas).getByText('Sitio principal')).toBeTruthy();
    expect(within(migas).queryByText('Sitio web')).toBeNull();
    // Sitio sin borrador: banda neutra «Editas el sitio en vivo».
    expect(screen.getByText('Editas el sitio en vivo:')).toBeTruthy();
    const guardar = screen.getByRole('button', { name: 'Guardar y publicar' }) as HTMLButtonElement;
    expect(guardar.disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar «Portada»' }));
    expect(guardar.disabled).toBe(false);
    expect(screen.getByText('Cambios sin guardar')).toBeTruthy();
  });

  test('inspector con Diseño · Contenido · Estilo · Avanzado; tipografía propia y «Oculta en celular»', async () => {
    await renderEditor();
    fireEvent.click(screen.getByRole('button', { name: /^Portada$/ }));
    const inspector = screen.getByRole('complementary', { name: 'Inspector: Portada' });
    expect(within(inspector).getAllByRole('tab').map((t) => t.textContent)).toEqual(['Diseño', 'Contenido', 'Estilo', 'Avanzado']);

    fireEvent.click(within(inspector).getByRole('tab', { name: 'Estilo' }));
    expect(within(inspector).getByText(/Playfair Display en títulos y Inter en el texto/)).toBeTruthy();
    fireEvent.click(within(inspector).getByRole('radio', { name: 'Personalizada' }));
    expect(within(inspector).getByText('Fuente del título')).toBeTruthy();
    expect(screen.getByText('Portada · tipografía propia · vista previa en vivo')).toBeTruthy();

    fireEvent.click(within(inspector).getByRole('button', { name: 'Mostrar en Celular' }));
    const fila = screen.getByRole('button', { name: /^Portada/ , pressed: true });
    expect(fila.textContent).toContain('Oculta en celular');

    fireEvent.click(within(inspector).getByRole('tab', { name: 'Avanzado' }));
    expect(within(inspector).getByText('Para casos especiales')).toBeTruthy();
  });

  test('no se puede ocultar el último dispositivo activo', async () => {
    await renderEditor();
    fireEvent.click(screen.getByRole('button', { name: /^Portada$/ }));
    const inspector = screen.getByRole('complementary', { name: 'Inspector: Portada' });
    fireEvent.click(within(inspector).getByRole('tab', { name: 'Estilo' }));
    fireEvent.click(within(inspector).getByRole('button', { name: 'Mostrar en Computador' }));
    fireEvent.click(within(inspector).getByRole('button', { name: 'Mostrar en Tableta' }));
    fireEvent.click(within(inspector).getByRole('button', { name: 'Mostrar en Celular' }));
    expect(within(inspector).getByRole('alert').textContent).toBe('Siempre queda al menos un dispositivo activo.');
    expect(within(inspector).getByRole('button', { name: 'Mostrar en Celular' }).getAttribute('aria-pressed')).toBe('true');
  });
});

describe('Editor · estados', () => {
  test('sin permiso de edición: vacío «No puedes editar el sitio web» con «Volver a Páginas»', async () => {
    permisos.editar = false;
    renderConIdioma(<PageEditorPage />);
    expect(await screen.findByText('No puedes editar el sitio web')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Volver a Páginas/ }).getAttribute('href')).toBe('/app/sitio-web/paginas');
  });

  test('en el celular: vista previa de solo lectura y cambios rápidos', async () => {
    simularAncho(390);
    renderConIdioma(<PageEditorPage />);
    expect(await screen.findByText('Abre el editor en un computador')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cambios rápidos' }));
    expect(screen.getByText('Textos de la portada')).toBeTruthy();
    expect(screen.getByText('Platos agotados hoy')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Guardar y publicar' })).toBeTruthy();
  });
});
