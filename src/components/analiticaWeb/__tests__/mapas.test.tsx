/**
 * @jest-environment jsdom
 */
/**
 * Mapas de «De dónde entran» (Figma 464:237485): la coropleta (tokens de color,
 * aria-label por región, teclado, tooltip, clic) y el detalle de Colombia (clic
 * en un departamento filtra las ciudades), en los cuatro idiomas. Sin jest-dom.
 * Formas de prueba (cuadrados), sin geometría real; cifras inventadas.
 */
import type { ComponentType } from 'react';

// next/dynamic → el componente real, síncrono: la carga diferida no es lo que se prueba aquí.
// La pantalla de escritorio (B/09-01); el móvil tiene su propia prueba.
jest.mock('@/components/kit/useEsEscritorio', () => ({ useEsEscritorio: () => true, MEDIA_ESCRITORIO: '(min-width: 1024px)' }));
jest.mock('next/dynamic', () => (cargar: () => Promise<ComponentType<Record<string, unknown>>>) => {
  const Mapa = (props: Record<string, unknown>) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { MapaFalso } = require('./mapaFalso') as { MapaFalso: ComponentType<Record<string, unknown>> };
    void cargar;
    return <MapaFalso {...props} />;
  };
  return Mapa;
});

import { act, cleanup, fireEvent } from '@testing-library/react';
import { renderConIdioma, type IdiomaPrueba } from '@/test-utils/renderConIdioma';
import { agregarPorPais } from '@/lib/analiticaWeb/mapa';
import type { DatosAnalitica } from '@/lib/analiticaWeb/analiticaWeb';
import { MapaCoropletico } from '../mapas/MapaCoropletico';
import { DeDondeEntran } from '../DeDondeEntran';
import { FORMAS_PRUEBA } from './mapaFalso';

afterEach(cleanup);

const VALORES = agregarPorPais([
  { pais: 'CO', visitantes: 2418, sesiones: 3702 },
  { pais: 'MX', visitantes: 286, sesiones: 401 },
]);

function montarMapa(idioma: IdiomaPrueba = 'es', onElegir = jest.fn()) {
  const r = renderConIdioma(
    <MapaCoropletico formas={FORMAS_PRUEBA} ancho={300} alto={100} valores={VALORES} etiqueta="Mapa" onElegir={onElegir} seleccionado="MX" />,
    { idioma },
  );
  const region = (c: string) => r.container.querySelector(`[data-codigo="${c}"]`) as SVGPathElement;
  return { ...r, region, onElegir };
}

test('colores por paso con tokens; sin visitas en gris y deshabilitado', () => {
  const { region } = montarMapa();
  expect(region('CO').getAttribute('data-paso')).toBe('5');
  expect(Number(region('MX').getAttribute('data-paso'))).toBeGreaterThan(0);
  expect(Number(region('MX').getAttribute('data-paso'))).toBeLessThan(5);
  expect(region('CO').getAttribute('fill')).toBe('rgb(var(--brand-deep))');
  expect(region('PE').getAttribute('fill')).toBe('rgb(var(--border-default))');
  expect(region('PE').getAttribute('aria-disabled')).toBe('true');
  expect(region('MX').getAttribute('aria-pressed')).toBe('true');
});

test('una sola parada de tabulación; flechas recorren de más a menos visitas', () => {
  const { region } = montarMapa();
  const tabs = ['CO', 'MX', 'PE'].map((c) => region(c).getAttribute('tabindex'));
  expect(tabs.filter((x) => x === '0')).toHaveLength(1);
  expect(region('MX').getAttribute('tabindex')).toBe('0'); // el seleccionado
  act(() => region('MX').focus());
  fireEvent.keyDown(region('MX'), { key: 'ArrowRight' });
  expect(document.activeElement).toBe(region('PE'));
  fireEvent.keyDown(region('PE'), { key: 'Home' });
  expect(document.activeElement).toBe(region('CO'));
});

test('Enter y clic eligen; una región sin visitas no', () => {
  const { region, onElegir } = montarMapa();
  fireEvent.keyDown(region('CO'), { key: 'Enter' });
  fireEvent.click(region('MX'));
  fireEvent.click(region('PE'));
  expect(onElegir.mock.calls).toEqual([['CO'], ['MX']]);
});

test('tooltip al enfocar: nombre, visitantes y %', () => {
  const { region, container } = montarMapa();
  act(() => region('CO').focus());
  const tip = container.querySelector('[data-testid="mapa-tooltip"]');
  expect(tip?.textContent).toContain('Colombia');
  expect(tip?.textContent).toMatch(/2[.,\s]?418 visitantes/);
  expect(tip?.textContent).toMatch(/89[.,]4/);
});

test.each<[IdiomaPrueba, RegExp, string, string]>([
  ['es', /^Colombia: 2[.,\s]?418 visitantes, 89[.,]4\s?% del total$/, 'Perú: sin visitas', 'Sin visitas'],
  ['en', /^Colombia: 2[.,\s]?418 visitors, 89[.,]4\s?% of total$/, 'Perú: no visits', 'No visits'],
  ['fr', /^Colombia : 2[.,\s]?418 visiteurs, 89[.,]4\s?% du total$/, 'Perú : aucune visite', 'Aucune visite'],
  ['pt', /^Colombia: 2[.,\s]?418 visitantes, 89[.,]4\s?% do total$/, 'Perú: sem visitas', 'Sem visitas'],
])('%s: aria-label por región y leyenda traducidos', (idioma, etiquetaCo, etiquetaPe, sinVisitas) => {
  const { region, container } = montarMapa(idioma);
  expect(region('CO').getAttribute('aria-label')).toMatch(etiquetaCo);
  expect(region('PE').getAttribute('aria-label')).toBe(etiquetaPe);
  expect(container.textContent).toContain(sinVisitas);
  expect(container.querySelector('svg')?.getAttribute('role')).toBe('group');
});

const DATOS: DatosAnalitica = {
  zona: 'America/Bogota',
  desde: '2026-09-01',
  hasta: '2026-09-30',
  dias: 30,
  actual: { visitantes: 0, visitantesNuevos: 0, sesiones: 0, pedidos: 0, pendientes: 0, completados: 0, cancelados: 0, ingresos: 0, ventaMedia: null },
  anterior: { visitantes: 0, visitantesNuevos: 0, sesiones: 0, pedidos: 0, pendientes: 0, completados: 0, cancelados: 0, ingresos: 0, ventaMedia: null },
  serie: [],
  paises: [
    { pais: 'CO', visitantes: 2418, sesiones: 3702 },
    { pais: 'MX', visitantes: 286, sesiones: 401 },
  ],
  pais: 'CO',
  ciudades: [
    { ciudad: 'Bogotá', region: 'DC', visitantes: 1042, sesiones: 1588 },
    { ciudad: 'Medellín', region: 'ANT', visitantes: 618, sesiones: 944 },
    { ciudad: 'Envigado', region: 'ANT', visitantes: 40, sesiones: 44 },
  ],
  ciudadesTotal: 3,
  visitasConPais: 5000,
  visitasSinUbicacionTotal: null,
};

test('Colombia: mapa por departamento; clic en Antioquia filtra las ciudades y se puede quitar', () => {
  const { container, getByText } = renderConIdioma(<DeDondeEntran datos={DATOS} cargandoPais={false} onElegirPais={jest.fn()} />);
  expect(container.querySelector('[data-testid="mapa-mundo"]')).not.toBeNull();
  const mapaCo = container.querySelector('[data-testid="mapa-colombia"]');
  expect(mapaCo).not.toBeNull();
  expect(container.textContent).toContain('Colombia por departamento');
  const filas = () => [...container.querySelectorAll('[data-testid="tabla-ciudades"] tbody tr')].map((tr) => tr.textContent ?? '');
  expect(filas()).toHaveLength(3);
  expect(filas()[1]).toContain('Antioquia');

  fireEvent.click(mapaCo!.querySelector('[data-codigo="CO-ANT"]')!);
  expect(filas()).toHaveLength(2);
  expect(filas().every((f) => f.includes('Antioquia'))).toBe(true);
  expect(container.textContent).toContain('Ciudades de Antioquia');

  fireEvent.click(getByText('Ver todas las ciudades'));
  expect(filas()).toHaveLength(3);
});

test('otro país: sin mapa de departamentos, solo ciudades', () => {
  const { container } = renderConIdioma(
    <DeDondeEntran datos={{ ...DATOS, pais: 'MX', ciudades: [{ ciudad: 'Monterrey', region: 'NLE', visitantes: 10, sesiones: 12 }] }} cargandoPais={false} onElegirPais={jest.fn()} />,
  );
  expect(container.querySelector('[data-testid="mapa-colombia"]')).toBeNull();
  expect(container.textContent).toContain('Monterrey');
});

test('clic en un país del mapa del mundo lo elige', () => {
  const onElegirPais = jest.fn();
  const { container } = renderConIdioma(<DeDondeEntran datos={{ ...DATOS, pais: null, ciudades: [] }} cargandoPais={false} onElegirPais={onElegirPais} />);
  fireEvent.click(container.querySelector('[data-testid="mapa-mundo"] [data-codigo="MX"]')!);
  expect(onElegirPais).toHaveBeenCalledWith('MX');
});

test('Colombia: con `regiones` de la RPC pinta departamentos fuera de las ciudades y no avisa cota; sin ella, cae a las ciudades', () => {
  const nota = 'Los departamentos suman';
  // 60 ciudades en total pero solo 3 en la lista: Valle del Cauca no tiene ciudad listada
  // (el mapa falso solo trae DC, ANT y VAC).
  const base = { ...DATOS, ciudadesTotal: 60 };
  const conRegiones = renderConIdioma(
    <DeDondeEntran
      datos={{ ...base, regiones: [{ region: 'DC', visitantes: 1042, sesiones: 1588 }, { region: 'ANT', visitantes: 700, sesiones: 1000 }, { region: 'VAC', visitantes: 5, sesiones: 6 }] }}
      cargandoPais={false}
      onElegirPais={jest.fn()}
    />,
  );
  const valle = (c: HTMLElement) => c.querySelector('[data-testid="mapa-colombia"] [data-codigo="CO-VAC"]')!;
  expect(valle(conRegiones.container).getAttribute('aria-label')).toMatch(/^Valle del Cauca/);
  expect(valle(conRegiones.container).getAttribute('aria-label')).not.toMatch(/sin visitas/i);
  expect(conRegiones.container.textContent).not.toContain(nota);
  conRegiones.unmount();

  const respaldo = renderConIdioma(<DeDondeEntran datos={{ ...base, regiones: null }} cargandoPais={false} onElegirPais={jest.fn()} />);
  expect(valle(respaldo.container).getAttribute('aria-label')).toMatch(/sin visitas/i);
  expect(respaldo.container.textContent).toContain(nota);
});

test('Colombia: departamento sin ciudades en el top del país muestra las de `ciudades_region` y «N más»', () => {
  const { container, getByText } = renderConIdioma(
    <DeDondeEntran
      datos={{
        ...DATOS,
        ciudadesTotal: 600,
        regiones: [
          { region: 'DC', visitantes: 1042, sesiones: 1588, ciudades: 1 },
          { region: 'ANT', visitantes: 658, sesiones: 988, ciudades: 2 },
          { region: 'VAC', visitantes: 7, sesiones: 8, ciudades: 5 },
        ],
        ciudadesRegion: [
          { ciudad: 'Tuluá', region: 'VAC', visitantes: 4, sesiones: 5 },
          { ciudad: 'Cartago', region: 'VAC', visitantes: 3, sesiones: 3 },
        ],
      }}
      cargandoPais={false}
      onElegirPais={jest.fn()}
    />,
  );
  const filas = () => [...container.querySelectorAll('[data-testid="tabla-ciudades"] tbody tr')].map((tr) => tr.textContent ?? '');
  // Sin filtro, las extra no se mezclan con el top del país.
  expect(filas()).toHaveLength(3);
  expect(container.textContent).not.toContain('Tuluá');

  fireEvent.click(container.querySelector('[data-testid="mapa-colombia"] [data-codigo="CO-VAC"]')!);
  expect(container.textContent).not.toContain('Aún no hay ciudades');
  expect(filas()).toHaveLength(2);
  expect(filas()[0]).toContain('Tuluá');
  expect(filas()[1]).toContain('Cartago');
  expect(getByText('Y 3 ciudades más')).toBeTruthy();
});

test('Colombia: sin `ciudades_region` (base atrasada) el departamento fuera del top sigue diciendo «sin ciudades»', () => {
  const { container } = renderConIdioma(
    <DeDondeEntran
      datos={{ ...DATOS, regiones: [{ region: 'VAC', visitantes: 7, sesiones: 8 }], ciudadesRegion: null }}
      cargandoPais={false}
      onElegirPais={jest.fn()}
    />,
  );
  fireEvent.click(container.querySelector('[data-testid="mapa-colombia"] [data-codigo="CO-VAC"]')!);
  expect(container.textContent).toContain('Aún no hay ciudades para este país en el periodo.');
});

test('la tabla de ciudades pagina de a 20 y vuelve a la primera página al filtrar', () => {
  const muchas = Array.from({ length: 45 }, (_, i) => ({
    ciudad: `Ciudad ${String(i + 1).padStart(2, '0')}`,
    region: i % 2 === 0 ? 'ANT' : 'DC',
    visitantes: 100 - i,
    sesiones: 100 - i,
  }));
  const { container, getByLabelText } = renderConIdioma(
    <DeDondeEntran datos={{ ...DATOS, ciudades: muchas, ciudadesTotal: 45 }} cargandoPais={false} onElegirPais={jest.fn()} />,
  );
  const filas = () => [...container.querySelectorAll('[data-testid="tabla-ciudades"] tbody tr')].map((tr) => tr.textContent ?? '');
  expect(filas()).toHaveLength(20);
  expect(filas()[0]).toContain('Ciudad 01');
  expect(container.textContent).toContain('1–20 de 45');

  fireEvent.click(getByLabelText('Página siguiente'));
  expect(filas()[0]).toContain('Ciudad 21');
  fireEvent.click(getByLabelText('Página siguiente'));
  expect(filas()).toHaveLength(5);

  // 23 ciudades de Antioquia: filtra y vuelve a la página 1.
  fireEvent.click(container.querySelector('[data-testid="mapa-colombia"] [data-codigo="CO-ANT"]')!);
  expect(filas()).toHaveLength(20);
  expect(filas()[0]).toContain('Ciudad 01');
  expect(container.textContent).toContain('1–20 de 23');
});
