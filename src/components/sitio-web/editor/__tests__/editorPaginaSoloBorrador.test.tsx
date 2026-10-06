/**
 * @jest-environment jsdom
 *
 * Una página que solo existe en el borrador V2 (p. ej. recién creada con «Nueva página») se abre
 * aunque el borrador llegue ANTES que la carga legacy. Antes, la carga legacy terminaba después,
 * no encontraba la página y devolvía el editor a «cargando»: se quedaba en el esqueleto.
 * Datos ficticios de la org 120.
 */
import { screen, waitFor } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import EditorSitio from '../EditorSitio';

jest.mock('sonner', () => ({ toast: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() }) }));
jest.mock('next/navigation', () => ({
  useParams: () => ({ pageId: 'p2' }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/app/sitio-web/editor/p2',
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
  const pagina = { id: 'p1', organization_id: 120, branch_id: null, title: 'Inicio', slug: 'home', page_type: 'home', sections: [] };
  return {
    ...real,
    websitePageBuilderService: {
      ...real.websitePageBuilderService,
      getPageWithSections: jest.fn(async () => null),
      getPages: jest.fn(() => new Promise((r) => setTimeout(() => r([pagina]), 400))),
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
jest.mock('@/lib/services/branchService', () => ({ branchService: { getBranches: jest.fn(async () => []) } }));
jest.mock('@/components/organization/branding/editor/MenuTreeEditor', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/organization/branding/editor/MenuGroupEditor', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/organization/branding/editor/MenuGroupManager', () => ({ __esModule: true, default: () => null }));
jest.mock('@/lib/services/websiteMenuGroupService', () => ({ websiteMenuGroupService: { getMenus: jest.fn(async () => []) } }));

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
  tema: {
    colores: { primario: { mode: 'value', value: '#8C6A3F' }, texto: { mode: 'value', value: '#1F1B16' }, fondo: { mode: 'value', value: '#F8F1E7' } },
    tipografia: { titulos: { mode: 'value', value: 'Playfair Display' }, cuerpo: { mode: 'value', value: 'Inter' } },
  },
  seo: {},
  contenido: {},
  shell: { header: { composicion: 'default', menuPrincipalId: null, opciones: {} }, footer: { composicion: 'default', menuIds: [], opciones: {} } },
  menus: [],
  paginas: [
    {
      id: 'p1',
      slug: 'home',
      tipo: 'home',
      titulo: 'Inicio',
      publicada: true,
      secciones: [],
    },
    {
      id: 'p2',
      slug: 'carta-qr',
      tipo: 'carta_qr',
      titulo: 'Carta QR',
      publicada: true,
      secciones: [{ id: 's2', tipo: 'menu_preview', variante: 'tabs', version: 1, contenido: {}, diseno: {}, visibilidad: { movil: true, escritorio: true } }],
    },
  ],
};

beforeEach(() => {
  (globalThis as unknown as { fetch: unknown }).fetch = jest.fn(async (url: string, init?: { method?: string }) => {
    const metodo = init?.method ?? 'GET';
    const ok = (cuerpo: unknown) => ({ ok: true, status: 200, json: async () => cuerpo });
    if (url === '/api/website/v2/sites' && metodo === 'GET') return ok({ sitios: [sitio] });
    if (url === `/api/website/v2/sites/${SITIO}/draft` && metodo === 'GET') {
      return ok({ sitio, documento, version: 3, actualizadoEn: sitio.borradorActualizadoEn, revisionBaseId: null, basePrincipal: null, erroresContrato: [] });
    }
    if (url.includes('/programaciones')) {
      return { ok: false, status: 503, json: async () => ({ error: { code: 'no_disponible', message: 'No disponible' } }) };
    }
    return { ok: false, status: 404, json: async () => null };
  });
});

test('la página solo del borrador sigue abierta cuando la carga legacy termina después', async () => {
  renderConIdioma(<EditorSitio />);
  expect(await screen.findByRole('button', { name: /^Carta destacada$/ })).toBeTruthy();
  // La carga legacy (getPages) termina 400 ms después: el editor no vuelve al esqueleto.
  await new Promise((r) => setTimeout(r, 700));
  await waitFor(() => expect(screen.getByRole('button', { name: /^Carta destacada$/ })).toBeTruthy());
  expect(screen.getByRole('button', { name: 'Publicar' })).toBeTruthy();
});
