/**
 * @jest-environment jsdom
 *
 * El lienzo del editor pinta el BORRADOR (V2) por la misma vista previa firmada que «Vista
 * previa»: una página que solo existe en el borrador (sitio sin publicar) ya no sale «404» en el
 * lienzo, que antes cargaba la dirección pública (`<host>/carta-qr`), donde esa página no existe.
 * Sin firma (503), la dirección pública como antes. Datos ficticios de la org 120.
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

let firmas = 0;
let firmaDisponible = true;

beforeEach(() => {
  firmas = 0;
  firmaDisponible = true;
  (globalThis as unknown as { fetch: unknown }).fetch = jest.fn(async (url: string, init?: { method?: string; body?: string }) => {
    const metodo = init?.method ?? 'GET';
    const ok = (cuerpo: unknown) => ({ ok: true, status: 200, json: async () => cuerpo });
    if (url === '/api/website/v2/sites' && metodo === 'GET') return ok({ sitios: [sitio] });
    if (url === `/api/website/v2/sites/${SITIO}/draft` && metodo === 'GET') {
      return ok({ sitio, documento, version: 3, actualizadoEn: sitio.borradorActualizadoEn, revisionBaseId: null, basePrincipal: null, erroresContrato: [] });
    }
    if (url === `/api/website/v2/sites/${SITIO}/vista-previa` && metodo === 'POST') {
      firmas += 1;
      if (!firmaDisponible) {
        return { ok: false, status: 503, json: async () => ({ error: { code: 'error_interno', message: 'La vista previa del borrador no está configurada.' } }) };
      }
      return ok({ token: 'carga.firma', caducaEn: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() });
    }
    if (url.includes('/programaciones')) {
      return { ok: false, status: 503, json: async () => ({ error: { code: 'no_disponible', message: 'No disponible' } }) };
    }
    return { ok: false, status: 404, json: async () => null };
  });
});

const srcLienzo = () => screen.queryByTitle('Vista previa de la página')?.getAttribute('src') ?? null;

test('la página solo del borrador se pinta con la vista previa firmada, no con la dirección pública', async () => {
  renderConIdioma(<EditorSitio />);
  expect(await screen.findByRole('button', { name: /^Carta destacada$/ })).toBeTruthy();
  await waitFor(() => expect(srcLienzo()).toBe('https://tienda-120.goadmin.io/vista-previa/carga.firma/carta-qr?marco=1&preview=1'));
  // La carga legacy termina después: ni se vuelve a la dirección pública ni se firma otra vez.
  await new Promise((r) => setTimeout(r, 700));
  expect(srcLienzo()).toBe('https://tienda-120.goadmin.io/vista-previa/carga.firma/carta-qr?marco=1&preview=1');
  expect(firmas).toBe(1);
});

test('sin firma de vista previa (503) el lienzo usa la dirección pública, como antes', async () => {
  firmaDisponible = false;
  renderConIdioma(<EditorSitio />);
  expect(await screen.findByRole('button', { name: /^Carta destacada$/ })).toBeTruthy();
  await waitFor(() => expect(srcLienzo()).toBe('https://tienda-120.goadmin.io/carta-qr?preview=1'));
  await new Promise((r) => setTimeout(r, 700));
  expect(firmas).toBe(1);
});
