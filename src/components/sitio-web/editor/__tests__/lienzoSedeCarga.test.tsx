/**
 * @jest-environment jsdom
 *
 * Abrir el editor en una página de una sede cuando el borrador V2 del principal llega antes que
 * la página: el lienzo NO carga el sitio del principal mientras llegan los datos de la página y
 * de las sedes (antes pintaba `<host>/…` y después cambiaba a `<host>/norte/…`); espera con el
 * esqueleto y fija la URL de la sede. «Ver sitio publicado» abre la URL pública de ESA sede, no
 * la del principal. Datos ficticios de la org 120.
 */
import { act, screen, waitFor } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import EditorSitio from '../EditorSitio';

jest.mock('sonner', () => ({ toast: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() }) }));
jest.mock('next/navigation', () => ({
  useParams: () => ({ pageId: 'p1' }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/app/sitio-web/editor/p1',
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('@/lib/hooks/useOrganization', () => ({
  useOrganization: () => ({ organization: { id: 120 } }),
  getOrganizationId: () => 120,
  ORGANIZATION_CHANGED_EVENT: 'org-cambio',
}));
const resumen = {
  datos: { permisos: { editar: true, publicar: true }, typeId: null, sitio: { host: 'tienda-120.goadmin.io', url: 'https://tienda-120.goadmin.io' } },
  cargando: false,
  fallo: null,
  recargar: jest.fn(),
};
jest.mock('@/components/sitio-web/resumen/useResumenSitio', () => ({ useResumenSitio: () => resumen }));
jest.mock('@/lib/services/websitePageBuilderService', () => {
  const real = jest.requireActual('@/lib/services/websitePageBuilderService');
  // Página legacy de la sede 7 (servida por el sitio en /norte).
  const pagina = { id: 'p1', organization_id: 120, branch_id: 7, title: 'Carta', slug: 'menu', page_type: 'custom', sections: [] };
  return {
    ...real,
    websitePageBuilderService: {
      ...real.websitePageBuilderService,
      // La página legacy llega DESPUÉS que el borrador V2 del principal.
      getPageWithSections: jest.fn(() => new Promise((r) => setTimeout(() => r(pagina), 300))),
      getPages: jest.fn(async () => [pagina]),
      getPreviewUrl: jest.fn(async () => 'https://tienda-120.goadmin.io'),
      getPreviewEntities: jest.fn(async () => []),
    },
  };
});
jest.mock('@/lib/services/websiteSettingsService', () => {
  const real = jest.requireActual('@/lib/services/websiteSettingsService');
  return {
    ...real,
    websiteSettingsService: { ...real.websiteSettingsService, getSettings: jest.fn(async () => ({ id: 'ws-1', organization_id: 120 })) },
  };
});
// Las sedes llegan cuando el test lo decide.
let mockSoltarSedes: (b: unknown[]) => void = () => undefined;
jest.mock('@/lib/services/branchService', () => ({
  branchService: {
    getBranches: jest.fn(
      () =>
        new Promise((r) => {
          mockSoltarSedes = r;
        }),
    ),
  },
}));
jest.mock('@/components/organization/branding/editor/MenuTreeEditor', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/organization/branding/editor/MenuGroupEditor', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/organization/branding/editor/MenuGroupManager', () => ({ __esModule: true, default: () => null }));
jest.mock('@/lib/services/websiteMenuGroupService', () => ({ websiteMenuGroupService: { getMenus: jest.fn(async () => []) } }));

const SEDES = [
  { id: 6, organization_id: 120, name: 'Principal', is_main: true, is_active: true, is_web_published: false, slug: null, custom_domain: null, branch_type: 'store' },
  { id: 7, organization_id: 120, name: 'Sede Norte', is_main: false, is_active: true, is_web_published: true, slug: 'norte', custom_domain: null, branch_type: 'restaurant' },
];

const SITIO = '11111111-1111-4111-8111-111111111111';
const sitio = {
  id: SITIO,
  branchId: null,
  v2Adoptado: false,
  v2AdoptadoEn: null,
  revisionPublicadaId: null,
  versionBorrador: 3,
  borradorActualizadoEn: '2026-10-06T15:00:00Z',
  cambiosSinPublicar: true,
};
const documento = {
  schemaVersion: 1,
  identidad: {},
  tema: { colores: {}, tipografia: {} },
  seo: {},
  contenido: {},
  shell: { header: { composicion: 'default', menuPrincipalId: null, opciones: {} }, footer: { composicion: 'default', menuIds: [], opciones: {} } },
  menus: [],
  paginas: [{ id: 'p1', slug: 'menu', tipo: 'custom', titulo: 'Carta', publicada: true, secciones: [] }],
};

beforeEach(() => {
  (globalThis as unknown as { fetch: unknown }).fetch = jest.fn(async (url: string, init?: { method?: string }) => {
    const metodo = init?.method ?? 'GET';
    const ok = (cuerpo: unknown) => ({ ok: true, status: 200, json: async () => cuerpo });
    if (url === '/api/website/v2/sites' && metodo === 'GET') return ok({ sitios: [sitio] });
    if (url === `/api/website/v2/sites/${SITIO}/draft` && metodo === 'GET') {
      return ok({ sitio, documento, version: 3, actualizadoEn: sitio.borradorActualizadoEn, revisionBaseId: null, basePrincipal: null, erroresContrato: [] });
    }
    if (url === `/api/website/v2/sites/${SITIO}/vista-previa` && metodo === 'POST') {
      return ok({ token: 'carga.firma', caducaEn: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() });
    }
    return { ok: false, status: 404, json: async () => null };
  });
});

const srcLienzo = () => screen.queryByTitle('Vista previa de la página')?.getAttribute('src') ?? null;
const verPublicado = () => screen.queryByRole('link', { name: 'Ver sitio publicado' })?.getAttribute('href') ?? null;

test('con la sede elegida el lienzo espera sus datos (sin cargar el principal) y abre la sede', async () => {
  // Toda dirección que el lienzo llegue a cargar, aunque sea un instante.
  const vistas = new Set<string>();
  const observador = new MutationObserver(() => {
    const src = srcLienzo();
    if (src) vistas.add(src);
  });
  observador.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['src'] });

  renderConIdioma(<EditorSitio />);
  // El borrador del principal llega primero y la página de la sede después; las sedes, no aún.
  await new Promise((r) => setTimeout(r, 700));
  // El editor ya está abierto: el lienzo muestra su esqueleto, no otro sitio.
  expect(screen.getByText('Cargando la página del sitio')).toBeTruthy();
  expect(srcLienzo()).toBeNull();
  expect(verPublicado()).toBeNull();

  await act(async () => {
    mockSoltarSedes(SEDES);
  });
  await waitFor(() => expect(srcLienzo()).toBe('https://tienda-120.goadmin.io/norte/menu?preview=1'));
  expect(verPublicado()).toBe('https://tienda-120.goadmin.io/norte');
  observador.disconnect();
  expect([...vistas]).toEqual(['https://tienda-120.goadmin.io/norte/menu?preview=1']);
});
