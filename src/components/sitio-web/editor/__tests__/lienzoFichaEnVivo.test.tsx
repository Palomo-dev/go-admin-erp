/**
 * @jest-environment jsdom
 *
 * «Ficha de producto» en el lienzo (reporte del dueño 2026-11-24): cada cambio del panel
 * recargaba TODO el iframe (lento y perdía el scroll). La causa: tras cada guardado del borrador,
 * `guardarV2` subía `previewRefreshKey` en las plantillas de detalle, porque la ficha de la tienda
 * no tenía el puente en vivo. Ahora la tienda pinta la ficha con el puente (`FichaEnVivo`) y:
 * - cambiar una sección de la ficha se ve en vivo: guardar NO recarga el lienzo;
 * - si la tienda no respondió por el puente (despliegue viejo), recarga como antes;
 * - «Completa el look» (sus productos los calcula el servidor) sí recarga al guardarse.
 * Datos ficticios de la org 120.
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import EditorSitio from '../EditorSitio';
import { cambioPideRecargaLienzo } from '../recargaLienzoDetalle';

jest.mock('sonner', () => ({ toast: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn() }) }));
jest.mock('next/navigation', () => ({
  useParams: () => ({ pageId: 'p-ficha' }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/app/sitio-web/editor/p-ficha',
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
  return {
    ...real,
    websitePageBuilderService: {
      ...real.websitePageBuilderService,
      getPageWithSections: jest.fn(async () => null),
      getPages: jest.fn(async () => []),
      getPreviewUrl: jest.fn(async () => 'https://tienda-120.goadmin.io'),
      getPreviewEntities: jest.fn(async () => [{ id: 'u1', label: 'Camisa azul (SKU-1)' }]),
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
const TIENDA = 'https://tienda-120.goadmin.io';
const URL_FICHA = `${TIENDA}/vista-previa/carga.firma/productos/u1?marco=1&preview=1`;
const sitio = {
  id: SITIO,
  branchId: null,
  v2Adoptado: false,
  v2AdoptadoEn: null,
  revisionPublicadaId: null,
  versionBorrador: 3,
  borradorActualizadoEn: '2026-11-24T15:00:00Z',
  cambiosSinPublicar: true,
};
const seccion = (id: string, tipo: string, contenido: Record<string, unknown> = {}) => ({
  id,
  tipo,
  variante: 'default',
  version: 1,
  contenido,
  diseno: {},
  visibilidad: { movil: true, escritorio: true },
});
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
    { id: 'p1', slug: 'home', tipo: 'home', titulo: 'Inicio', publicada: true, secciones: [] },
    {
      id: 'p-ficha',
      slug: '__product_detail',
      tipo: 'product_detail',
      titulo: 'Ficha de producto',
      publicada: true,
      secciones: [seccion('s-desc', 'product_description', { title: 'Descripción' })],
    },
  ],
};

let guardados = 0;

beforeEach(() => {
  guardados = 0;
  (globalThis as unknown as { fetch: unknown }).fetch = jest.fn(async (url: string, init?: { method?: string; body?: string }) => {
    const metodo = init?.method ?? 'GET';
    const ok = (cuerpo: unknown) => ({ ok: true, status: 200, json: async () => cuerpo });
    if (url === '/api/website/v2/sites' && metodo === 'GET') return ok({ sitios: [sitio] });
    if (url === `/api/website/v2/sites/${SITIO}/draft` && metodo === 'GET') {
      return ok({ sitio, documento, version: 3, actualizadoEn: sitio.borradorActualizadoEn, revisionBaseId: null, basePrincipal: null, erroresContrato: [] });
    }
    if (url === `/api/website/v2/sites/${SITIO}/draft` && metodo === 'PUT') {
      guardados += 1;
      const cuerpo = JSON.parse(init?.body ?? '{}');
      return ok({ version: cuerpo.version + 1, actualizadoEn: '2026-11-24T15:05:00Z' });
    }
    if (url === `/api/website/v2/sites/${SITIO}/vista-previa` && metodo === 'POST') {
      return ok({ token: 'carga.firma', caducaEn: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() });
    }
    if (url.includes('/programaciones')) {
      return { ok: false, status: 503, json: async () => ({ error: { code: 'no_disponible', message: 'No disponible' } }) };
    }
    return { ok: false, status: 404, json: async () => null };
  });
});

const iframeLienzo = () => screen.getByTitle('Vista previa de la página') as HTMLIFrameElement;

/** La tienda avisa que su puente montó (`PreviewBridge` → `goadmin:ready`). */
function puenteListo(iframe: HTMLIFrameElement) {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { data: { type: 'goadmin:ready' }, origin: TIENDA, source: iframe.contentWindow }));
  });
}

/** Cambia el fondo de la sección «Descripción de Producto» de la ficha (se autoguarda en el borrador). */
async function cambiarSeccionDescripcion() {
  fireEvent.click(await screen.findByRole('button', { name: /^Descripción de Producto$/ }));
  const inspector = screen.getByRole('complementary', { name: /^Inspector: Descripción de Producto/ });
  fireEvent.click(within(inspector).getByRole('tab', { name: 'Estilo' }));
  fireEvent.click(within(inspector).getByRole('radio', { name: 'Alterno' }));
  await waitFor(() => expect(guardados).toBeGreaterThan(0), { timeout: 4000 });
  // Lo que pase tras el guardado (llave de recarga, recarga propia del lienzo) ya ocurrió.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 300));
  });
}

describe('Ficha de producto en el lienzo', () => {
  test('con el puente de la tienda listo, cambiar una sección se ve en vivo: guardar NO recarga el iframe', async () => {
    renderConIdioma(<EditorSitio />);
    await waitFor(() => expect(iframeLienzo().getAttribute('src')).toBe(URL_FICHA));
    const antes = iframeLienzo();
    puenteListo(antes);

    await cambiarSeccionDescripcion();

    expect(iframeLienzo()).toBe(antes);
    expect(iframeLienzo().getAttribute('src')).toBe(URL_FICHA);
  });

  test('sin puente en la tienda (despliegue viejo), guardar recarga el iframe como antes', async () => {
    renderConIdioma(<EditorSitio />);
    await waitFor(() => expect(iframeLienzo().getAttribute('src')).toBe(URL_FICHA));
    const antes = iframeLienzo();

    await cambiarSeccionDescripcion();

    expect(iframeLienzo()).not.toBe(antes);
    expect(iframeLienzo().getAttribute('src')).toBe(URL_FICHA);
  });
});

describe('cambioPideRecargaLienzo', () => {
  const pagina = (...secciones: ReturnType<typeof seccion>[]) => ({ secciones });
  const desc = seccion('s-desc', 'product_description', { title: 'Descripción' });
  const look = seccion('s-look', 'complete_the_look', { source: 'tag', limit: 4 });

  it('ficha: cambiar acciones, beneficios, descripción, galería, información, relacionados o reseñas no recarga', () => {
    for (const tipo of ['product_actions', 'product_benefits', 'product_description', 'product_gallery', 'product_info', 'related_products', 'product_reviews']) {
      const a = seccion('s1', tipo, { title: 'A' });
      const b = { ...a, contenido: { title: 'B' }, visibilidad: { movil: false, escritorio: true } };
      expect(cambioPideRecargaLienzo('product_detail', pagina(a, look), pagina(b, look))).toBe(false);
      expect(cambioPideRecargaLienzo('product_detail', pagina(look), pagina(a, look))).toBe(false);
    }
  });

  it('ficha: «Completa el look» (datos del servidor) recarga al añadirse, quitarse o cambiar su contenido', () => {
    expect(cambioPideRecargaLienzo('product_detail', pagina(desc), pagina(desc, look))).toBe(true);
    expect(cambioPideRecargaLienzo('product_detail', pagina(desc, look), pagina(desc))).toBe(true);
    expect(cambioPideRecargaLienzo('product_detail', pagina(look), pagina({ ...look, contenido: { source: 'manual', limit: 4 } }))).toBe(true);
    expect(cambioPideRecargaLienzo('product_detail', pagina(look), pagina(look))).toBe(false);
  });

  it('categoría: todo en vivo; otra plantilla de detalle, recarga como antes', () => {
    const cabecera = seccion('s-cab', 'category_header', { title: 'A' });
    expect(cambioPideRecargaLienzo('category_detail', pagina(cabecera), pagina({ ...cabecera, contenido: { title: 'B' } }))).toBe(false);
    expect(cambioPideRecargaLienzo('space_detail', pagina(desc), pagina(desc))).toBe(true);
  });
});
