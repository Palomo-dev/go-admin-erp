/**
 * @jest-environment jsdom
 */
/**
 * Pantalla «SEO y redes» (Figma B/08-01 listo, B/08-02 estados, B/08-03 móvil):
 * cargando, primera vez, error, sin permiso, listo, guardar en el borrador y
 * en el servidor, y la vista móvil. Sin jest-dom. Datos inventados.
 */
let escritorio = true;
jest.mock('@/components/kit/useEsEscritorio', () => ({ useEsEscritorio: () => escritorio, MEDIA_ESCRITORIO: '(min-width: 1024px)' }));
jest.mock('@/lib/supabase/config', () => ({ supabase: {} }));
jest.mock('@/lib/hooks/useOrganization', () => ({
  useOrganization: () => ({ organization: { id: 120, name: 'Mi empresa S.A.S.' } }),
  getOrganizationId: () => 120,
}));
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }), usePathname: () => '/app/sitio-web/seo' }));
jest.mock('next/dynamic', () => () => () => null);
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const guardarBorrador = jest.fn(async () => true);
let ctx: Record<string, unknown>;
jest.mock('../../diseno/useContextoDiseno', () => ({ useContextoDiseno: () => ctx }));

import { act, cleanup, fireEvent } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import type { DocumentoSitio } from '@/lib/website/contrato/documentoSitio';
import { SeoYRedes } from '../SeoYRedes';

const v = <T,>(value: T) => ({ mode: 'value' as const, value });

function documento(conSeo: boolean): DocumentoSitio {
  return {
    schemaVersion: 1,
    identidad: {},
    tema: { colores: {}, tipografia: {} },
    seo: conSeo ? { titulo: v('Tu marca · Calzado hecho en Colombia'), descripcion: v('Zapatos de cuero hechos a mano. Paga contra entrega y recibe en 2 a 4 días.') } : {},
    contenido: conSeo ? { redesSociales: v({ instagram: 'https://www.instagram.com/tumarca' }) } : {},
    shell: { header: { composicion: 'clasico', menuPrincipalId: null, opciones: {} }, footer: { composicion: 'clasico', menuIds: [], opciones: {} } },
    menus: [],
    paginas: [
      { id: 'inicio', slug: '', tipo: 'builtin', titulo: 'Inicio', publicada: true, secciones: [] },
      { id: 'contacto', slug: 'contacto', tipo: 'builtin', titulo: 'Contacto', publicada: true, secciones: [] },
    ],
  } as unknown as DocumentoSitio;
}

function contexto(estado: string, conSeo = true) {
  return {
    estado,
    permisos: { editar: estado !== 'sin_permiso', publicar: true },
    host: 'tumarca.com',
    reintentar: jest.fn(),
    sitio: { documento: documento(conSeo), guardar: guardarBorrador, guardando: false, conflicto: false, error: null, recargar: jest.fn(async () => undefined) },
  };
}

const SERVIDOR = {
  permisos: { editar: true, publicar: true },
  host: 'tumarca.com',
  url: 'https://tumarca.com',
  verificacionGoogle: null,
  ocultarBuscadores: false,
  productos: { total: 120, conDescripcion: 112 },
  negocio: { nombre: 'Tu marca', giro: 'tienda', logoUrl: null },
};

let respuestaSeo: () => { status: number; body: unknown } = () => ({ status: 200, body: SERVIDOR });
const fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
  if (url.startsWith('/api/sitio-web/seo/salud')) {
    return { ok: true, status: 200, json: async () => ({ host: 'tumarca.com', sitemap: { publicado: true, direcciones: 128 }, robots: { publicado: true, bloqueaTodo: false, rutasBloqueadas: ['/checkout'] }, revisadoEn: '' }) };
  }
  if (init?.method === 'PUT') return { ok: true, status: 200, json: async () => ({ ...SERVIDOR, verificacionGoogle: 'abcDEF_123-xyz456' }) };
  const r = respuestaSeo();
  return { ok: r.status < 400, status: r.status, json: async () => r.body };
});

beforeAll(() => {
  (globalThis as unknown as { fetch: typeof fetchMock }).fetch = fetchMock;
});
beforeEach(() => {
  ctx = contexto('listo');
});
afterEach(() => {
  cleanup();
  fetchMock.mockClear();
  guardarBorrador.mockClear();
  escritorio = true;
  respuestaSeo = () => ({ status: 200, body: SERVIDOR });
});

async function montar() {
  const r = renderConIdioma(<SeoYRedes />, { idioma: 'es' });
  for (let i = 0; i < 4; i += 1) {
    await act(async () => {
      await new Promise((res) => setTimeout(res, 0));
    });
  }
  return r;
}

test('listo: secciones, vista previa con el host real y calidad por página', async () => {
  const { container } = await montar();
  const texto = container.textContent ?? '';
  expect(texto).toContain('SEO y redes');
  expect(texto).toContain('Título y descripción por defecto');
  expect(texto).toMatch(/\d+ \/ 60 caracteres · bien/);
  expect(texto).toContain('Imagen para compartir');
  expect(texto).toContain('Redes sociales');
  expect(texto).toContain('Google Search Console');
  expect(container.querySelector('[data-testid="vista-google"]')?.textContent).toContain('tumarca.com');
  expect(texto).toContain('Calidad SEO por página');
  expect(texto).toContain('Falta descripción');
  expect(texto).toContain('112 de 120 productos');
  expect(container.querySelector('[data-testid="salud-sitio"]')?.textContent).toContain('128 direcciones');
  expect(fetchMock.mock.calls.every((c) => !String(c[0]).includes('organization'))).toBe(true);
});

test('cargando: esqueleto', async () => {
  ctx = contexto('cargando');
  const { container } = await montar();
  expect(container.querySelector('[data-testid="esqueleto-seo"]')).not.toBeNull();
});

test('primera vez: sin título ni imagen propone sugerencias', async () => {
  ctx = contexto('listo', false);
  const { container, getByText } = await montar();
  expect(container.textContent).toContain('Tu sitio aún no tiene título ni imagen para compartir');
  await act(async () => {
    fireEvent.click(getByText('Usar sugerencias'));
  });
  expect(container.textContent).toContain('Título y descripción por defecto');
  expect((container.querySelector('input') as HTMLInputElement).value).toBe('Tu marca · Tienda');
});

test('error del servidor: «Reintentar»', async () => {
  respuestaSeo = () => ({ status: 500, body: {} });
  const { container } = await montar();
  expect(container.textContent).toContain('No pudimos cargar la configuración SEO');
  expect(container.textContent).toContain('Reintentar');
});

test('sin permiso: pide «Editar sitio web»', async () => {
  respuestaSeo = () => ({ status: 403, body: {} });
  const { container } = await montar();
  expect(container.textContent).toContain('No tienes permiso para editar el SEO');
  expect(container.textContent).not.toContain('Calidad SEO por página');
});

test('guardar: el título va al borrador y la verificación al servidor', async () => {
  const { container, getAllByText } = await montar();
  const inputs = container.querySelectorAll('input');
  await act(async () => {
    fireEvent.change(inputs[0], { target: { value: 'Tu marca · Zapatos' } });
  });
  const codigo = Array.from(inputs).find((i) => i.getAttribute('placeholder')?.includes('google-site-verification')) as HTMLInputElement;
  await act(async () => {
    fireEvent.change(codigo, { target: { value: 'abcDEF_123-xyz456' } });
  });
  expect(container.textContent).toContain('Tienes cambios sin guardar');
  await act(async () => {
    fireEvent.click(getAllByText('Guardar')[0]);
    await new Promise((res) => setTimeout(res, 0));
  });
  expect(guardarBorrador).toHaveBeenCalledTimes(1);
  const put = fetchMock.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === 'PUT');
  expect(JSON.parse(String((put?.[1] as RequestInit).body))).toEqual({ verificacionGoogle: 'abcDEF_123-xyz456' });
});

test('red inválida: no deja guardar', async () => {
  const { container } = await montar();
  const ig = Array.from(container.querySelectorAll('input')).find((i) => i.getAttribute('placeholder') === '+57 300 555 0100') as HTMLInputElement;
  await act(async () => {
    fireEvent.change(ig, { target: { value: 'no es un número' } });
  });
  expect(container.textContent).toContain('Escribe un usuario, un enlace o un número válido.');
});

test('móvil: una vista previa y filas con su resumen', async () => {
  escritorio = false;
  const { container } = await montar();
  const filas = container.querySelector('[data-testid="filas-seo-movil"]');
  expect(filas?.children).toHaveLength(5);
  expect(filas?.textContent).toContain('Instagram');
  expect(filas?.textContent).toContain('1 página sin descripción');
  expect(container.querySelector('[data-testid="vista-whatsapp"]')).not.toBeNull();
  expect(container.querySelector('[data-testid="vista-google"]')).toBeNull();
});

describe('iconos y tamaños (el estado se entiende por el icono)', () => {
  test('escritorio: canal en cada red, contador con icono y badges de calidad con icono', async () => {
    const { container, getByLabelText } = await montar();
    for (const red of ['instagram', 'facebook', 'tiktok', 'whatsapp']) {
      const icono = container.querySelector(`[data-testid="icono-red-${red}"]`);
      expect(icono).not.toBeNull();
      expect(icono?.getAttribute('aria-hidden')).toBe('true');
    }
    // El icono va dentro del campo pero la etiqueta sigue enlazada con el input.
    expect((getByLabelText('Instagram') as HTMLInputElement).tagName).toBe('INPUT');
    // Contador: icono de 14 px según el estado.
    const contador = container.querySelector('[data-estado="bien"]');
    expect(contador?.querySelector('svg')?.getAttribute('class')).toContain('size-3.5');
    // «Guardar» con el disquete (no el «+» de crear).
    const guardar = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Guardar');
    expect(guardar?.querySelector('svg')?.getAttribute('class')).toContain('lucide-save');
    // Cada badge de calidad lleva icono.
    const badgeFalta = Array.from(container.querySelectorAll('div')).find((d) => d.textContent === 'Falta descripción' && d.querySelector('svg'));
    expect(badgeFalta?.querySelector('svg')?.getAttribute('class')).toContain('lucide-circle-x');
    // Salud: cada fila con el icono de 16 de su tarea junto al título (ChecklistItem ya no usa caja de 32).
    const iconosSalud = container.querySelectorAll('[data-testid="salud-sitio"] li p svg');
    expect(iconosSalud).toHaveLength(3);
    iconosSalud.forEach((svg) => expect(svg.getAttribute('class')).toContain('size-4'));
  });

  test('móvil: cada fila con su caja de 40 px y la de calidad en tono de aviso', async () => {
    escritorio = false;
    const { container } = await montar();
    const cajas = container.querySelectorAll('[data-testid="filas-seo-movil"] [data-tamano="md"]');
    expect(cajas).toHaveLength(5);
    expect(cajas[4].getAttribute('class')).toContain('bg-warning-subtle');
  });
});
