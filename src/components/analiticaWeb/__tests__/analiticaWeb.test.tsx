/**
 * @jest-environment jsdom
 */
/**
 * Pantalla «Analítica» (Figma B/09-01 listo, B/09-02 móvil, B/09-03 estados;
 * E-analitica): indicadores, embudo, países → ciudades, bloques de tráfico,
 * estados (cargando, vacío, error, sin permiso, sin ubicación) y los cuatro
 * idiomas. Sin jest-dom. Organización ficticia; cifras inventadas.
 */
let escritorio = true;
jest.mock('@/components/kit/useEsEscritorio', () => ({ useEsEscritorio: () => escritorio, MEDIA_ESCRITORIO: '(min-width: 1024px)' }));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({
  useFormatDate: () => ({ getToday: () => '2026-09-30' }),
}));
jest.mock('@/lib/context/BranchContext', () => ({
  useBranchOpcional: () => ({ branchFilter: null, branches: [{ id: 1, name: 'Sucursal Principal' }, { id: 2, name: 'Norte' }] }),
}));
jest.mock('@/lib/hooks/useOrganization', () => ({
  useOrganization: () => ({ organization: { id: 120, name: 'Mi empresa S.A.S.' } }),
}));
jest.mock('@/lib/hooks/useOrgCurrency', () => ({
  useMonedaOrganizacion: () => ({ formatear: (v: number) => `$ ${v}` }),
}));
jest.mock('../GraficoVisitas', () => ({ GraficoVisitas: () => null }));
jest.mock('next/dynamic', () => () => () => null);

import { act, cleanup, fireEvent } from '@testing-library/react';
import { renderConIdioma, type IdiomaPrueba } from '@/test-utils/renderConIdioma';
import { AnaliticaWeb } from '../AnaliticaWeb';
import { useAnaliticaWeb } from '../useAnaliticaWeb';

const DATOS = {
  zona: 'America/Bogota', desde: '2026-09-01', hasta: '2026-09-30', dias: 30,
  actual: { visitantes: 3104, visitantesNuevos: 1924, sesiones: 4812, pedidos: 164, pendientes: 12, completados: 106, cancelados: 18, ingresos: 9317400, ventaMedia: 87900 },
  anterior: { visitantes: 2626, visitantesNuevos: 1500, sesiones: 4181, pedidos: 150, pendientes: 5, completados: 100, cancelados: 10, ingresos: 8444000, ventaMedia: 84440 },
  serie: [], paises: [{ pais: 'CO', visitantes: 2418, sesiones: 3702 }, { pais: 'MX', visitantes: 286, sesiones: 401 }],
  pais: null, ciudades: [], ciudadesTotal: 0, visitasConPais: 5000, visitasSinUbicacionTotal: null,
};

const TRAFICO = {
  disponible: true,
  conReservas: false,
  trafico: {
    fuentes: [
      { fuente: 'google', sesiones: 4212 },
      { fuente: 'instagram', sesiones: 2660 },
      { fuente: 'otros', sesiones: 332 },
    ],
    paginas: [
      { ruta: '/', visitas: 5120, sesiones: 4000, conversiones: 84 },
      { ruta: '/contacto', visitas: 310, sesiones: 300, conversiones: 0 },
    ],
    conversionPedido: { sesiones: 9000, productos: 6940, carrito: 1102, pago: 498, pagados: 212 },
    conversionReserva: { visitas: 864, creadas: 188, confirmadas: 157 },
  },
};

type Resp = { status: number; body: unknown };
let respuesta: (url: string) => Resp = () => ({ status: 200, body: { datos: DATOS, puedeExportar: true } });
let respuestaTrafico: () => Resp = () => ({ status: 200, body: TRAFICO });
const fetchMock = jest.fn(async (url: string) => {
  const r = url.startsWith('/api/sitio-web/analitica/trafico') ? respuestaTrafico() : respuesta(url);
  return { ok: r.status < 400, status: r.status, json: async () => r.body };
});
beforeAll(() => {
  (globalThis as unknown as { fetch: typeof fetchMock }).fetch = fetchMock;
});
afterEach(() => {
  cleanup();
  fetchMock.mockClear();
  escritorio = true;
  respuesta = () => ({ status: 200, body: { datos: DATOS, puedeExportar: true } });
  respuestaTrafico = () => ({ status: 200, body: TRAFICO });
});

function Pantalla() {
  const a = useAnaliticaWeb();
  return <AnaliticaWeb a={a} host="tumarca.com" pixeles={<p>PIXELES</p>} />;
}

async function montar(idioma: IdiomaPrueba = 'es') {
  const r = renderConIdioma(<Pantalla />, { idioma });
  for (let i = 0; i < 4; i += 1) {
    await act(async () => {
      await new Promise((res) => setTimeout(res, 0));
    });
  }
  return r;
}

const urls = () => fetchMock.mock.calls.map((c) => String(c[0]));

test('pide los últimos 30 días a las dos rutas del servidor, sin organización en la query', async () => {
  await montar();
  expect(urls()).toContain('/api/analitica-web?desde=2026-09-01&hasta=2026-09-30');
  expect(urls()).toContain('/api/sitio-web/analitica/trafico?desde=2026-09-01&hasta=2026-09-30');
  expect(urls().every((u) => !u.includes('organization'))).toBe(true);
});

test('listo: cinco indicadores, embudo, países y bloques nuevos', async () => {
  const { container } = await montar();
  const texto = container.textContent ?? '';
  expect(container.querySelector('[data-testid="kpis"] section')?.children).toHaveLength(5);
  expect(texto).toContain('Visitantes únicos');
  expect(texto).toMatch(/3[.,  ]?104/);
  expect(texto).toContain('$ 87900');
  expect(texto).toContain('Embudo de conversión');
  expect(texto).toMatch(/12 pendientes/);
  expect(texto).toContain('Colombia');
  expect(texto).toContain('De dónde llegan');
  expect(texto).toContain('Google (búsqueda)');
  expect(container.querySelector('[data-testid="fuentes"]')?.lastElementChild?.textContent).toContain('Otros');
  expect(texto).toContain('Páginas más vistas');
  expect(texto).toContain('/ (inicio)');
  expect(texto).toContain('Conversión a pedido');
  expect(texto).toContain('Pedido pagado');
  expect(texto).toContain('PIXELES');
});

test('conversión a reserva: solo si el servidor la habilita (giro restaurante)', async () => {
  let r = await montar();
  expect(r.container.textContent).not.toContain('Conversión a reserva');
  cleanup();
  respuestaTrafico = () => ({ status: 200, body: { ...TRAFICO, conReservas: true } });
  r = await montar();
  expect(r.container.textContent).toContain('Conversión a reserva');
  expect(r.container.textContent).toContain('Reserva confirmada');
});

test('sin la función de tráfico en la base: los bloques nuevos lo dicen, sin error', async () => {
  respuestaTrafico = () => ({ status: 200, body: { disponible: false, trafico: null, conReservas: false } });
  const { container } = await montar();
  expect(container.textContent).toContain('Este bloque estará disponible');
  expect(container.querySelector('[data-testid="kpis"]')).not.toBeNull();
});

test('al elegir un país pide sus ciudades', async () => {
  const { getAllByText } = await montar();
  await act(async () => {
    fireEvent.click(getAllByText('México')[0]);
    await new Promise((res) => setTimeout(res, 0));
  });
  expect(urls()[urls().length - 1]).toContain('pais=MX');
});

test('sin ubicación: explica que las visitas anteriores no traen país', async () => {
  respuesta = () => ({ status: 200, body: { datos: { ...DATOS, paises: [], visitasConPais: 0, visitasSinUbicacionTotal: 220626 }, puedeExportar: false } });
  const { container } = await montar();
  const bloque = container.querySelector('[data-testid="sin-ubicacion"]');
  expect(bloque?.textContent).toContain('Todavía no tenemos la ubicación');
  expect(bloque?.textContent).toMatch(/220[.,  ]?626/);
});

test('vacío: sin visitas ni pedidos invita a compartir el enlace', async () => {
  const cero = { ...DATOS.actual, visitantes: 0, visitantesNuevos: 0, sesiones: 0, pedidos: 0, pendientes: 0, completados: 0, cancelados: 0, ingresos: 0, ventaMedia: null };
  respuesta = () => ({ status: 200, body: { datos: { ...DATOS, actual: cero }, puedeExportar: true } });
  const { container } = await montar();
  expect(container.textContent).toContain('Aún no hay visitas');
  expect(container.textContent).toContain('tumarca.com');
  expect(container.textContent).toContain('Copiar enlace');
  expect(container.querySelector('[data-testid="kpis"]')).toBeNull();
});

test('403 del servidor: sin permiso, sin cifras', async () => {
  respuesta = () => ({ status: 403, body: {} });
  const { container } = await montar();
  expect(container.textContent).toContain('No tienes permiso para ver la analítica');
  expect(container.querySelector('[data-testid="kpis"]')).toBeNull();
});

test('error: «Reintentar» vuelve a pedir', async () => {
  respuesta = () => ({ status: 500, body: {} });
  const { container, getByText } = await montar();
  expect(container.textContent).toContain('No pudimos cargar la analítica');
  const antes = fetchMock.mock.calls.length;
  respuesta = () => ({ status: 200, body: { datos: DATOS, puedeExportar: true } });
  await act(async () => {
    fireEvent.click(getByText('Reintentar'));
    await new Promise((res) => setTimeout(res, 0));
  });
  expect(fetchMock.mock.calls.length).toBeGreaterThan(antes);
});

test('cargando: esqueleto', async () => {
  respuesta = () => ({ status: 200, body: { datos: DATOS, puedeExportar: true } });
  const r = renderConIdioma(<Pantalla />, { idioma: 'es' });
  expect(r.container.querySelector('[data-testid="esqueleto-analitica"]')).not.toBeNull();
  await act(async () => {
    await new Promise((res) => setTimeout(res, 0));
  });
});

test('móvil: cuatro indicadores (sin Pedidos) y selector de periodo', async () => {
  escritorio = false;
  const { container } = await montar();
  expect(container.querySelector('[data-testid="kpis"] section')?.children).toHaveLength(4);
  expect(container.querySelector('select')).not.toBeNull();
  expect(container.textContent).toContain('Mundo');
});

test.each<[IdiomaPrueba, string]>([
  ['en', 'Unique visitors'],
  ['fr', 'Visiteurs uniques'],
  ['pt', 'Visitantes únicos'],
])('%s: textos traducidos', async (idioma, kpi) => {
  const { container } = await montar(idioma);
  expect(container.textContent).toContain(kpi);
});

test('mapas: si la mayoría de visitantes son de Colombia, abre Colombia por departamento', async () => {
  await montar();
  const deAnalitica = urls().filter((u) => u.startsWith('/api/analitica-web'));
  expect(deAnalitica[0]).not.toContain('pais=');
  expect(deAnalitica.some((u) => u.includes('pais=CO'))).toBe(true);
});

test('mapas: si Colombia no es mayoría, se queda en el mundo', async () => {
  respuesta = () => ({
    status: 200,
    body: { datos: { ...DATOS, paises: [{ pais: 'CO', visitantes: 10, sesiones: 10 }, { pais: 'MX', visitantes: 90, sesiones: 90 }] }, puedeExportar: true },
  });
  await montar();
  expect(urls().every((u) => !u.includes('pais='))).toBe(true);
});
