/**
 * @jest-environment jsdom
 */
/**
 * Pantalla «Analítica web» (Figma 464:237485 listo, 465:241025 sin ubicación):
 * indicadores, embudo, países → ciudades, estado sin ubicación, sin permiso y
 * los cuatro idiomas. Sin jest-dom. Organización ficticia; cifras inventadas.
 */
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

import { act, cleanup, fireEvent } from '@testing-library/react';
import { renderConIdioma, type IdiomaPrueba } from '@/test-utils/renderConIdioma';
import { AnaliticaWeb } from '../AnaliticaWeb';

const DATOS = {
  zona: 'America/Bogota', desde: '2026-09-01', hasta: '2026-09-30', dias: 30,
  actual: { visitantes: 3104, visitantesNuevos: 1924, sesiones: 4812, pedidos: 164, pendientes: 12, completados: 106, cancelados: 18, ingresos: 9317400, ventaMedia: 87900 },
  anterior: { visitantes: 2626, visitantesNuevos: 1500, sesiones: 4181, pedidos: 150, pendientes: 5, completados: 100, cancelados: 10, ingresos: 8444000, ventaMedia: 84440 },
  serie: [], paises: [{ pais: 'CO', visitantes: 2418, sesiones: 3702 }, { pais: 'MX', visitantes: 286, sesiones: 401 }],
  pais: null, ciudades: [], ciudadesTotal: 0, visitasConPais: 5000, visitasSinUbicacionTotal: null,
};

let respuesta: (url: string) => { status: number; body: unknown } = () => ({ status: 200, body: { datos: DATOS, puedeExportar: true } });
const fetchMock = jest.fn(async (url: string) => {
  const r = respuesta(url);
  return { ok: r.status < 400, status: r.status, json: async () => r.body };
});
beforeAll(() => {
  (globalThis as unknown as { fetch: typeof fetchMock }).fetch = fetchMock;
});
afterEach(() => {
  cleanup();
  fetchMock.mockClear();
  respuesta = () => ({ status: 200, body: { datos: DATOS, puedeExportar: true } });
});

async function montar(idioma: IdiomaPrueba = 'es') {
  const r = renderConIdioma(<AnaliticaWeb />, { idioma });
  for (let i = 0; i < 3; i += 1) {
    await act(async () => {
      await new Promise((res) => setTimeout(res, 0));
    });
  }
  return r;
}

test('pide los últimos 30 días a la ruta del servidor, sin organización en la query', async () => {
  await montar();
  const url = String(fetchMock.mock.calls[0][0]);
  expect(url).toBe('/api/analitica-web?desde=2026-09-01&hasta=2026-09-30');
  expect(url).not.toContain('organization');
});

test('listo: cinco indicadores, embudo y países', async () => {
  const { container } = await montar();
  const texto = container.textContent ?? '';
  expect(texto).toContain('Analítica web');
  expect(texto).toContain('Tienda web · Mi empresa S.A.S.');
  expect(texto).toContain('Todas las sucursales (2)');
  expect(container.querySelector('[data-testid="kpis"]')?.children).toHaveLength(5);
  expect(texto).toContain('Visitantes únicos');
  expect(texto).toMatch(/3[.,  ]?104/);
  expect(texto).toContain('$ 87900');
  expect(texto).toContain('Embudo de conversión');
  expect(texto).toContain('12 pendientes');
  expect(texto).toContain('Colombia');
  expect(texto).toContain('Exportar CSV');
});

test('al elegir un país pide sus ciudades', async () => {
  const { getByText } = await montar();
  await act(async () => {
    fireEvent.click(getByText('Colombia'));
    await new Promise((res) => setTimeout(res, 0));
  });
  const ultima = String(fetchMock.mock.calls[fetchMock.mock.calls.length - 1][0]);
  expect(ultima).toContain('pais=CO');
});

test('sin ubicación: explica que las visitas anteriores no traen país', async () => {
  respuesta = () => ({ status: 200, body: { datos: { ...DATOS, paises: [], visitasConPais: 0, visitasSinUbicacionTotal: 220626 }, puedeExportar: false } });
  const { container } = await montar();
  const bloque = container.querySelector('[data-testid="sin-ubicacion"]');
  expect(bloque?.textContent).toContain('Todavía no tenemos la ubicación');
  expect(bloque?.textContent).toMatch(/220[.,  ]?626/);
  expect(container.textContent).not.toContain('Exportar CSV');
});

test('403 del servidor: aviso de permiso, sin cifras', async () => {
  respuesta = () => ({ status: 403, body: {} });
  const { container } = await montar();
  expect(container.textContent).toContain('No tienes acceso a la analítica web');
  expect(container.querySelector('[data-testid="kpis"]')).toBeNull();
});

test.each<[IdiomaPrueba, string, string]>([
  ['en', 'Web analytics', 'Unique visitors'],
  ['fr', 'Analytique web', 'Visiteurs uniques'],
  ['pt', 'Análise web', 'Visitantes únicos'],
])('%s: textos traducidos', async (idioma, titulo, kpi) => {
  const { container } = await montar(idioma);
  expect(container.textContent).toContain(titulo);
  expect(container.textContent).toContain(kpi);
});

test('mapas: si la mayoría de visitantes son de Colombia, abre Colombia por departamento', async () => {
  await montar();
  const urls = fetchMock.mock.calls.map((c) => String(c[0]));
  expect(urls[0]).not.toContain('pais=');
  expect(urls.some((u) => u.includes('pais=CO'))).toBe(true);
});

test('mapas: si Colombia no es mayoría, se queda en el mundo', async () => {
  respuesta = () => ({
    status: 200,
    body: { datos: { ...DATOS, paises: [{ pais: 'CO', visitantes: 10, sesiones: 10 }, { pais: 'MX', visitantes: 90, sesiones: 90 }] }, puedeExportar: true },
  });
  await montar();
  expect(fetchMock.mock.calls.every((c) => !String(c[0]).includes('pais='))).toBe(true);
});
