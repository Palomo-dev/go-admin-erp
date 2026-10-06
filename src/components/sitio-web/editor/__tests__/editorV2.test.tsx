/**
 * @jest-environment jsdom
 *
 * Editor sobre el borrador V2 (Figma A/05a, A/05m «Guardar ≠ publicar»): abre el borrador con el
 * hook único `useSitioV2`, el primario es «Publicar», «Historial de versiones» aparece, y cada
 * cambio se autoguarda en el borrador (PUT con la versión leída: compare-and-swap) con el estilo
 * por sección en `diseno.estilo` y la visibilidad por dispositivo en `visibilidad`.
 * Datos ficticios de la org 120.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
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
  const pagina = { id: 'p1', organization_id: 120, branch_id: null, title: 'Inicio', slug: 'home', page_type: 'home', sections: [] };
  return {
    ...real,
    websitePageBuilderService: {
      ...real.websitePageBuilderService,
      getPageWithSections: jest.fn(async () => pagina),
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
      secciones: [{ id: 's1', tipo: 'menu_preview', variante: 'tabs', version: 1, contenido: {}, diseno: {}, visibilidad: { movil: true, escritorio: true } }],
    },
  ],
};

let guardados: { documento: typeof documento; version: number }[] = [];

beforeEach(() => {
  guardados = [];
  (globalThis as unknown as { fetch: unknown }).fetch = jest.fn(async (url: string, init?: { method?: string; body?: string }) => {
    const metodo = init?.method ?? 'GET';
    const ok = (cuerpo: unknown) => ({ ok: true, status: 200, json: async () => cuerpo });
    if (url === '/api/website/v2/sites' && metodo === 'GET') return ok({ sitios: [sitio] });
    if (url === `/api/website/v2/sites/${SITIO}/draft` && metodo === 'GET') {
      return ok({ sitio, documento, version: 3, actualizadoEn: sitio.borradorActualizadoEn, revisionBaseId: null, basePrincipal: null, erroresContrato: [] });
    }
    if (url === `/api/website/v2/sites/${SITIO}/draft` && metodo === 'PUT') {
      const cuerpo = JSON.parse(init?.body ?? '{}');
      guardados.push(cuerpo);
      return ok({ version: cuerpo.version + 1, actualizadoEn: '2026-10-06T15:05:00Z' });
    }
    if (url.includes('/programaciones')) {
      return { ok: false, status: 503, json: async () => ({ error: { code: 'no_disponible', message: 'No disponible' } }) };
    }
    return { ok: false, status: 404, json: async () => null };
  });
});

test('abre el borrador, publica con «Publicar» y autoguarda el estilo por sección en el documento', async () => {
  renderConIdioma(<EditorSitio />);
  const fila = await screen.findByRole('button', { name: /^Carta destacada$/ });
  expect(screen.getByRole('button', { name: 'Publicar' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Guardar y publicar' })).toBeNull();
  expect(screen.getByRole('button', { name: /Historial de versiones/ })).toBeTruthy();

  fireEvent.click(fila);
  const inspector = screen.getByRole('complementary', { name: 'Inspector: Carta destacada' });
  expect(within(inspector).getByText('Todo queda en borrador')).toBeTruthy();
  fireEvent.click(within(inspector).getByRole('tab', { name: 'Estilo' }));
  fireEvent.click(within(inspector).getByRole('radio', { name: 'Alterno' }));
  // El sitio público aún no lee `visibilidad.tableta`: el interruptor está deshabilitado y sigue al computador.
  const tableta = within(inspector).getByRole('button', { name: 'Mostrar en Tableta' }) as HTMLButtonElement;
  expect(tableta.disabled).toBe(true);
  fireEvent.click(within(inspector).getByRole('button', { name: 'Mostrar en Celular' }));

  await waitFor(() => expect(guardados.length).toBeGreaterThan(0), { timeout: 4000 });
  const ultimo = guardados[guardados.length - 1];
  expect(ultimo.version).toBe(3);
  const seccion = ultimo.documento.paginas[0].secciones[0] as unknown as { diseno: { estilo?: { fondo?: string } }; visibilidad: Record<string, boolean> };
  expect(seccion.diseno.estilo?.fondo).toBe('alterno');
  expect(seccion.visibilidad).toEqual({ escritorio: true, movil: false });
});
