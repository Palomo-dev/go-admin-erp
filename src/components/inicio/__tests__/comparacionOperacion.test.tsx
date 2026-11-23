/**
 * @jest-environment jsdom
 */
/**
 * Comparación y mini-gráfica de los widgets de Logística y Transporte, y las casillas de esos
 * módulos en el bloque «Hoy» (Figma `03` › Inicio, 2917:45049, 2917:45560 y pantalla C
 * 2919:46236; aprobado el 2026-11-23). Render real con next-intl en los cuatro idiomas: una clave
 * que falte saldría cruda. Cifras ficticias.
 */
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({
  useFormatDate: () => ({ formatTime: () => '2:32 p. m.' }),
}));
jest.mock('@/lib/hooks/useOrgCurrency', () => ({
  useMonedaOrganizacion: () => ({ code: 'COP' }),
}));

import { waitFor } from '@testing-library/react';
import { renderConIdioma, type IdiomaPrueba } from '@/test-utils/renderConIdioma';
import { KpisWidget, textoDelta, tonoDelta } from '../modulos/PiezasWidget';
import { BloqueHoy } from '../BloqueHoy';
import type { KpiWidget } from '@/lib/dashboard/widgetsInicio';

const IDIOMAS: IdiomaPrueba[] = ['es', 'en', 'fr', 'pt'];
const sinClavesCrudas = (texto: string | null) => expect(texto ?? '').not.toMatch(/\b(inicioWidgets|home|comun|detalles|cifras|acciones|etiquetas)\.[a-zA-Z]/);

const KPIS: KpiWidget[] = [
  {
    id: 'atrasados',
    etiqueta: { clave: 'logistica.kpis.atrasados' },
    cifra: { tipo: 'numero', valor: 5 },
    delta: 2,
    unidadDelta: 'absoluto',
    deltaMejor: 'baja',
    comparadoCon: { clave: 'comun.vsCierreAyer' },
    href: '/app/logistica/por-despachar?atrasados=1',
  },
  {
    id: 'ocupacion',
    etiqueta: { clave: 'transporte.kpis.ocupacion' },
    cifra: { tipo: 'texto', texto: { clave: 'transporte.detalles.porcentaje', params: { p: 78 } } },
    delta: 5,
    unidadDelta: 'puntos',
    comparadoCon: { clave: 'comun.vsCierreAyer' },
    serie: [66, 70, 73, 78],
  },
  { id: 'sinBase', etiqueta: { clave: 'logistica.kpis.porDespachar' }, cifra: { tipo: 'numero', valor: 38 }, serie: [38] },
];

describe('variación de las cifras', () => {
  test('texto según la unidad y tono según la dirección buena', () => {
    expect(textoDelta({ delta: 2, unidadDelta: 'absoluto' }, 'es')).toBe('+2');
    expect(textoDelta({ delta: -3, unidadDelta: 'puntos' }, 'es')).toBe('−3 pp');
    expect(textoDelta({ delta: 8, unidadDelta: undefined }, 'es')).toBe('+8,0 %');
    expect(tonoDelta({ delta: 2, deltaMejor: 'baja' })).toBe('peligro');
    expect(tonoDelta({ delta: 5 })).toBe('exito');
    expect(tonoDelta({ delta: 0 })).toBe('neutro');
  });
});

describe.each(IDIOMAS)('comparación y mini-gráfica (%s)', (idioma) => {
  test('«+2» y «+5 pp» con contra qué comparan; la mini-gráfica solo con dos puntos o más', () => {
    const { container } = renderConIdioma(<KpisWidget kpis={KPIS} />, { idioma });
    sinClavesCrudas(container.textContent);
    expect(container.querySelector('[data-kpi="atrasados"]')?.textContent).toContain('+2');
    expect(container.querySelector('[data-kpi="ocupacion"]')?.textContent).toContain('+5 pp');
    expect(container.querySelectorAll('[data-comparado-con]')).toHaveLength(2);
    expect(container.querySelectorAll('svg[data-miniatura]')).toHaveLength(1);
    expect(container.querySelector('a[href="/app/logistica/por-despachar?atrasados=1"]')).not.toBeNull();
  });
});

const DATOS_HOY = {
  porCobrar: null,
  stock: null,
  pedidosWeb: null,
  cajasAnteriores: null,
  tareas: null,
  unaSucursal: false,
  transporte: { bloqueados: 3, codigos: ['V-1123', 'M-0459', 'V-2000'], documentosVencidos: 2, ejemplo: { nombre: 'WNP104', causa: 'soat' } },
  logistica: { atrasados: 5, masAtrasado: { numero: 'WO-000412', minutos: 18 } },
  generadoEn: '2026-11-23T19:32:00Z',
};

describe.each(IDIOMAS)('bloque «Hoy» con Logística y Transporte (%s)', (idioma) => {
  beforeEach(() => {
    (globalThis as unknown as { fetch: unknown }).fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => DATOS_HOY }) as Response);
  });

  test('Documentos, Despachos y Envíos con su acción ya filtrada y la causa traducida', async () => {
    const { container } = renderConIdioma(<BloqueHoy organizationId={120} sucursal={null} />, { idioma });
    await waitFor(() => expect(container.querySelectorAll('article')).toHaveLength(3));
    sinClavesCrudas(container.textContent);
    const hrefs = Array.from(container.querySelectorAll('article a')).map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['/app/transporte/flota?estado=vencido', '/app/transporte/viajes?pestana=despachos&estado=bloqueado', '/app/logistica/por-despachar?atrasados=1']);
    const [doc, des, env] = Array.from(container.querySelectorAll('article'));
    expect(doc.textContent).toContain('WNP104');
    expect(doc.textContent).toContain('SOAT');
    expect(doc.textContent).not.toMatch(/\bsoat\b/);
    expect(des.textContent).toContain('V-1123 · M-0459');
    expect(env.textContent).toContain('WO-000412');
  });
});
