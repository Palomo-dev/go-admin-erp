/**
 * @jest-environment jsdom
 *
 * Regla única de la barra inferior móvil (MobileTabBar), aprobada el
 * 2026-09-29: se ve SOLO en Inicio y en las páginas principales del menú; no
 * en detalles, formularios, flujos a pantalla completa ni mientras una pieza
 * pone su propia barra inferior (BulkActionBar…). `ocultarBarra` es el
 * override explícito. Además, el contenido deja abajo el alto de la barra que
 * se vea, para que la paginación no quede tapada.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { act } from 'react';
import { screen } from '@testing-library/react';
import { Download } from 'lucide-react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import { CATALOGO_NAV } from '@/lib/navigation/catalog';
import { BulkActionBar } from '@/components/kit/BulkActionBar';
import {
  ALTO_BARRA_APP,
  CabeceraMovilProvider,
  barraInferiorVisible,
  esRaizConBarra,
  espacioInferior,
  resumirBarras,
  useBarraInferiorPropia,
  useBarrasInferioresPropias,
  type EntradaBarraInferior,
} from '../cabeceraMovil';

const base: EntradaBarraInferior = { pathname: '/app/inicio', pagina: null, barrasPropias: 0, teclado: false };
const visible = (p: Partial<EntradaBarraInferior>) => barraInferiorVisible({ ...base, ...p });

// Las rutas de prueba salen del catálogo: nada de listas cableadas.
const paginas = CATALOGO_NAV.flatMap((m) => m.paginas).filter((p) => p.href !== '/app/inicio');
const raiz = paginas.find((p) => !p.pantallaCompleta && !p.href.includes('?'))!.href;
const flujos = paginas.filter((p) => p.pantallaCompleta).map((p) => p.href);

describe('barraInferiorVisible — la regla', () => {
  test('Inicio y las páginas principales del menú: visible', () => {
    expect(visible({ pathname: '/app/inicio' })).toBe(true);
    expect(visible({ pathname: raiz })).toBe(true);
    expect(visible({ pathname: `${raiz}/` })).toBe(true);
  });

  test('toda página del catálogo que no es flujo lleva la barra; los flujos no', () => {
    for (const p of paginas) {
      const ruta = p.href.split('?')[0];
      if (ruta === '/app/pos') continue; // el POS tiene su propio modo
      expect([ruta, esRaizConBarra(ruta)]).toEqual([ruta, !p.pantallaCompleta]);
    }
  });

  test('detalle (manda «←»): oculta', () => {
    expect(visible({ pathname: `${raiz}/123` })).toBe(false);
    expect(visible({ pathname: '/app/perfil' })).toBe(false);
  });

  test('formularios nuevo/editar: oculta', () => {
    expect(visible({ pathname: `${raiz}/nuevo` })).toBe(false);
    expect(visible({ pathname: `${raiz}/15/editar` })).toBe(false);
  });

  test('POS y flujos a pantalla completa (mesas, check-in): oculta', () => {
    expect(visible({ pathname: '/app/pos' })).toBe(false);
    expect(flujos.length).toBeGreaterThan(0);
    for (const f of flujos) expect(visible({ pathname: f })).toBe(false);
    // Una página que se declara en modo POS tampoco la lleva.
    expect(visible({ pathname: raiz, pagina: { modo: 'pos' } })).toBe(false);
  });

  test('con una barra inferior propia abierta (BulkActionBar): oculta', () => {
    expect(visible({ pathname: raiz, barrasPropias: 1 })).toBe(false);
  });

  test('con el teclado abierto: oculta', () => {
    expect(visible({ pathname: raiz, teclado: true })).toBe(false);
  });

  test('override explícito de la página', () => {
    expect(visible({ pathname: raiz, pagina: { ocultarBarra: true } })).toBe(false);
    expect(visible({ pathname: `${raiz}/123`, pagina: { ocultarBarra: false } })).toBe(true);
    // El override no gana a una barra propia ni al teclado.
    expect(visible({ pathname: raiz, pagina: { ocultarBarra: false }, barrasPropias: 1 })).toBe(false);
    expect(visible({ pathname: raiz, pagina: { ocultarBarra: false }, teclado: true })).toBe(false);
    // Sin valor (lo que publica PageHeader por defecto) decide la ruta.
    expect(visible({ pathname: raiz, pagina: { modo: 'page', ocultarBarra: undefined } })).toBe(true);
  });
});

describe('espacio inferior del contenido', () => {
  test('la barra de la app, la propia o nada', () => {
    expect(espacioInferior(true, 0)).toBe(ALTO_BARRA_APP);
    expect(espacioInferior(false, 74)).toBe('74px');
    expect(espacioInferior(false, 0)).toBe('0px');
  });

  test('resumen: cuenta las barras y toma la más alta', () => {
    const m = new Map<symbol, number>([
      [Symbol('a'), 74],
      [Symbol('b'), 90],
    ]);
    expect(resumirBarras(m)).toEqual({ cantidad: 2, alto: 90 });
    expect(resumirBarras(new Map())).toEqual({ cantidad: 0, alto: 0 });
  });

  test('AppLayout: las páginas son hijas directas del contenedor con scroll (sin envoltorio h-full)', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/app-layout/AppLayout.tsx'), 'utf8');
    const i = src.indexOf('max-lg:pb-[var(--shell-barra-inferior,0px)]');
    expect(i).toBeGreaterThan(0);
    const tramo = src.slice(i, src.indexOf('{subscriptionChecked', i));
    expect(tramo).not.toMatch(/className="h-full/);
  });
});

function Contador() {
  const { cantidad } = useBarrasInferioresPropias();
  return <output data-testid="barras">{cantidad}</output>;
}

function BarraPropia({ activa }: { activa: boolean }) {
  const ref = useBarraInferiorPropia(activa);
  return <div ref={ref}>pie</div>;
}

describe('registro de barras inferiores propias', () => {
  test('una pieza con barra propia se registra mientras está activa', () => {
    const { rerender, unmount } = renderConIdioma(
      <CabeceraMovilProvider>
        <Contador />
        <BarraPropia activa={false} />
      </CabeceraMovilProvider>
    );
    expect(screen.getByTestId('barras').textContent).toBe('0');
    rerender(
      <CabeceraMovilProvider>
        <Contador />
        <BarraPropia activa />
      </CabeceraMovilProvider>
    );
    expect(screen.getByTestId('barras').textContent).toBe('1');
    rerender(
      <CabeceraMovilProvider>
        <Contador />
      </CabeceraMovilProvider>
    );
    expect(screen.getByTestId('barras').textContent).toBe('0');
    unmount();
  });

  test('BulkActionBar abierta cuenta como barra propia; al limpiar la selección, deja de contar', () => {
    const acciones = [{ id: 'exportar', etiqueta: 'Exportar', icono: Download, onClick: () => undefined }];
    const montar = (n: number) => (
      <CabeceraMovilProvider>
        <Contador />
        <BulkActionBar seleccionados={n} acciones={acciones} onLimpiar={() => undefined} />
      </CabeceraMovilProvider>
    );
    const { rerender } = renderConIdioma(montar(0));
    expect(screen.getByTestId('barras').textContent).toBe('0');
    act(() => rerender(montar(3)));
    expect(screen.getByTestId('barras').textContent).toBe('1');
    act(() => rerender(montar(0)));
    expect(screen.getByTestId('barras').textContent).toBe('0');
  });

  test('fuera del shell registrar no rompe (sin proveedor)', () => {
    renderConIdioma(<BarraPropia activa />);
    expect(screen.getByText('pie')).toBeTruthy();
  });
});
