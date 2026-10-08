/**
 * @jest-environment jsdom
 *
 * Detalle de la mesa en celular (390 px, Figma M2b `2256:232152`): UNA sola
 * barra con UNA sola «←», y nada de la mesa escondido.
 *
 * El dueño reportó dos encabezados con flecha atrás, uno encima del otro: el
 * MobileHeader del shell («← Mesas · organización») y la cabecera propia de la
 * mesa («← Mesa 2 · A»). M2b deja la misma información, orden y acciones de
 * hoy y solo quita la duplicación: «←», «Mesa 2 · A» y el estado suben al
 * MobileHeader; tiempo, mesero y comensales, «Pre-cuenta» y «⋯» siguen justo
 * debajo.
 *
 * Se pinta el MobileHeader REAL del shell con lo que publica la pantalla por
 * `useCabeceraMovil`. jsdom no aplica Tailwind: un elemento cuenta como
 * visible en celular si ni él ni un ancestro llevan `hidden` o `sr-only` sin
 * prefijo de breakpoint.
 */
import { screen } from '@testing-library/react';
import { renderConIdioma, simularAncho } from '@/test-utils/renderConIdioma';

jest.mock('next/navigation', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock('@/components/shell/header/OrgSwitcher', () => ({ OrgSwitcher: () => null }));
jest.mock('@/components/shell/header/ReportarProblema', () => ({ FeedbackButton: () => null, ReportarProblemaDialog: () => null }));
jest.mock('@/components/shell/header/Notificaciones', () => ({
  NotificationsBell: () => null,
  PanelNotificaciones: () => null,
  DetalleNotificacion: () => null,
  textoContador: () => '',
}));
jest.mock('@/components/shell/header/VistaRapidaTarea', () => ({ VistaRapidaTarea: () => null }));
jest.mock('@/components/shell/header/useNotificacionesHeader', () => ({ useNotificacionesHeader: () => ({ pendientes: 0 }) }));
jest.mock('@/components/app-layout/Header/GlobalSearch', () => ({ __esModule: true, default: () => null, ABRIR_BUSCADOR_EVENT: 'abrir-buscador' }));
jest.mock('@/components/app-layout/Header/TrialBanner', () => ({ TrialBanner: () => null }));
jest.mock('@/components/app-layout/Header/EmailVerificationBanner', () => ({ EmailVerificationBanner: () => null }));
jest.mock('@/components/kit/BranchBadge', () => ({ BranchBadgeActiva: () => null }));

import { MobileHeader } from '@/components/shell/header/AppHeader';
import { CabeceraMovilProvider, useCabeceraMovilActual } from '@/components/shell/header/cabeceraMovil';
import { CabeceraMesa } from '@/components/pos/mesas/cuenta/CabeceraMesa';
import { CabeceraMovilMesa, VOLVER_MESA } from '@/components/pos/mesas/cuenta/CabeceraMovilMesa';
import { PantallaMesa } from '@/components/pos/mesas/cuenta/PantallaMesa';

const RUTA = '/app/pos/mesas/7f1c2d1e-0000-4000-8000-000000000002';
let publicado: ReturnType<typeof useCabeceraMovilActual> = null;

function Shell() {
  const pagina = useCabeceraMovilActual();
  publicado = pagina;
  return (
    <header data-testid="shell">
      <MobileHeader pathname={RUTA} pagina={pagina} organizacionId={120} organizacionNombre="Org 120" />
    </header>
  );
}

function visibleEnCelular(el: Element): boolean {
  for (let n: Element | null = el; n; n = n.parentElement) {
    if (n.classList.contains('hidden') || n.classList.contains('sr-only')) return false;
  }
  return true;
}

/** Botones y enlaces «volver» visibles a 390 px: los del shell y los de la pantalla. */
function accionesVolver(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('button, a')).filter(
    (el) => /^Volver/.test(el.getAttribute('aria-label') ?? '') && visibleEnCelular(el),
  );
}

/** Nodos de texto visibles a 390 px que contienen `texto`. */
function visibles(texto: string): Element[] {
  return screen.queryAllByText(texto).filter(visibleEnCelular);
}

type Mesa = { estado: string; tono: 'marca' | 'advertencia' | 'neutro'; minutos: number | null; mesero: string | null; sesion: boolean };

function renderMesa({ estado, tono, minutos, mesero, sesion }: Mesa) {
  return renderConIdioma(
    <CabeceraMovilProvider>
      <Shell />
      <CabeceraMovilMesa titulo="Mesa 2 · A" estado={{ texto: estado, tono }} />
      <PantallaMesa
        modo="movil"
        estado="lista"
        mesaNombre="Mesa 2"
        cabeceraMesa={
          <CabeceraMesa
            mesa="Mesa 2"
            zona="A"
            estado={estado}
            tonoEstado={tono}
            minutos={minutos}
            mesero={mesero}
            comensales={2}
            onVolver={jest.fn()}
            onPrecuenta={sesion ? jest.fn() : undefined}
            menu={<button type="button" aria-label="Acciones de la mesa" />}
          />
        }
        catalogo={<div>catálogo</div>}
        panel={null}
        barraMovil={<button type="button">Ver cuenta · $ 96.000</button>}
        onReintentar={jest.fn()}
        onVolver={jest.fn()}
      />
    </CabeceraMovilProvider>,
  );
}

const POR_COBRAR: Mesa = { estado: 'Por cobrar', tono: 'advertencia', minutos: 42, mesero: 'Laura Gómez', sesion: true };

beforeEach(() => {
  publicado = null;
  simularAncho(390);
});
afterEach(() => simularAncho(1440));

describe('Detalle de la mesa en celular (390 px, Figma M2b)', () => {
  test('hay UNA sola acción de volver: la del MobileHeader, que vuelve al plano', () => {
    renderMesa(POR_COBRAR);
    const volver = accionesVolver();
    expect(volver).toHaveLength(1);
    expect(volver[0].closest('[data-testid="shell"]')).not.toBeNull();
    expect(publicado?.volverA).toBe(VOLVER_MESA);
  });

  test('la barra lleva la mesa y su estado; no pinta el nombre de la organización', () => {
    renderMesa(POR_COBRAR);
    const shell = screen.getByTestId('shell');
    expect(publicado?.modo).toBe('page');
    expect(visibles('Mesa 2 · A').filter((e) => shell.contains(e))).toHaveLength(1);
    expect(visibles('Por cobrar').filter((e) => shell.contains(e))).toHaveLength(1);
    expect(shell.textContent).not.toContain('Org 120');
  });

  test('nada se esconde: tiempo, mesero y comensales, «Pre-cuenta» y «⋯» siguen visibles bajo la barra', () => {
    renderMesa(POR_COBRAR);
    expect(visibles('42 min')).toHaveLength(1);
    expect(visibles('Laura Gómez · 2 comensales')).toHaveLength(1);
    expect(visibleEnCelular(screen.getByRole('button', { name: 'Pre-cuenta' }))).toBe(true);
    expect(visibleEnCelular(screen.getByRole('button', { name: 'Acciones de la mesa' }))).toBe(true);
    // El estado no se repite debajo: en celular solo va en la barra.
    expect(visibles('Por cobrar')).toHaveLength(1);
    // El título sigue como <h1> para lectores de pantalla.
    expect(screen.getByRole('heading', { level: 1, name: 'Mesa 2 · A' })).toBeTruthy();
  });

  test('mesa libre: chip «Libre», sin «Pre-cuenta», y sigue habiendo una sola «←»', () => {
    renderMesa({ estado: 'Libre', tono: 'neutro', minutos: null, mesero: null, sesion: false });
    expect(publicado?.estado).toEqual({ texto: 'Libre', tono: 'neutro' });
    expect(visibles('Libre')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Pre-cuenta' })).toBeNull();
    expect(accionesVolver()).toHaveLength(1);
  });
});
