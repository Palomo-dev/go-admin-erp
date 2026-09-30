/**
 * @jest-environment jsdom
 *
 * Integración del GO Asistente con el shell (Figma «GO Asistente —
 * escritorio», `667:34452`): el panel publica `go-asistente:estado` y el shell
 * reacciona sin conocerlo.
 *
 * - Pantalla 01 (`667:34455`): el botón del header anuncia «Abrir GO
 *   Asistente · Ctrl+J» con `aria-keyshortcuts`.
 * - Pantalla 02 (`667:34706`): con el panel abierto, buscador en icono y sin
 *   chip de plan.
 * - Pantalla 09 (`668:37351`): con el panel ampliado, sidebar en rail (sin
 *   tocar la preferencia guardada), sin «Reportar problema» y el botón del
 *   asistente en icono.
 *
 * Sin jest-dom: atributos y textos con la API de Testing Library.
 */
import { act } from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { renderConIdioma, simularAncho } from '@/test-utils/renderConIdioma';
import {
  ANCHO_MIN_AMPLIADO,
  EVENTO_ESTADO_ASISTENTE,
  ampliadoEfectivo,
  estadoDesdeEvento,
  type EstadoAsistente,
} from '@/lib/ai/assistant/panelUi';
import { modoVisibleSidebar, SidebarShell } from '../sidebar/SidebarShell';
import { AppHeader, textoAtajoAsistente } from '../header/AppHeader';
import { CabeceraMovilProvider } from '../header/cabeceraMovil';

// ── Dependencias pesadas del header y del sidebar: fuera ────────────────────
jest.mock('next/navigation', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock('../header/OrgSwitcher', () => ({
  OrgSwitcher: ({ variante, sinPlan }: { variante: string; sinPlan?: boolean }) => (
    <div data-testid={`org-${variante}`} data-sin-plan={String(Boolean(sinPlan))} />
  ),
}));
jest.mock('../header/ReportarProblema', () => ({
  FeedbackButton: () => <button type="button">Reportar problema</button>,
  ReportarProblemaDialog: () => null,
}));
jest.mock('../header/Notificaciones', () => ({
  NotificationsBell: () => <button type="button">Notificaciones</button>,
  PanelNotificaciones: () => null,
  DetalleNotificacion: () => null,
  textoContador: (n: number) => String(n),
}));
jest.mock('../header/VistaRapidaTarea', () => ({ VistaRapidaTarea: () => null }));
jest.mock('../header/useNotificacionesHeader', () => ({
  useNotificacionesHeader: () => ({ pendientes: 0, refrescarTareas: jest.fn() }),
}));
jest.mock('@/components/app-layout/Header/GlobalSearch', () => ({
  __esModule: true,
  default: () => null,
  ABRIR_BUSCADOR_EVENT: 'shell:abrir-buscador',
}));
jest.mock('@/components/app-layout/Header/TrialBanner', () => ({ TrialBanner: () => null }));
jest.mock('@/components/app-layout/Header/EmailVerificationBanner', () => ({ EmailVerificationBanner: () => null }));
jest.mock('@/components/kit/BranchBadge', () => ({ BranchBadgeActiva: () => null }));
jest.mock('../sidebar/Sidebar', () => ({
  Sidebar: ({ modo, onAlternarModo }: { modo: string; onAlternarModo?: () => void }) => (
    <nav data-testid="sidebar" data-modo={modo}>
      <button type="button" onClick={onAlternarModo}>
        alternar
      </button>
    </nav>
  ),
}));
jest.mock('../sidebar/SubMenuPanel', () => ({ SubMenuPanel: () => null }));
jest.mock('../sesion/BloqueSesion', () => ({ BloqueSesion: () => null }));

function publicar(estado: EstadoAsistente) {
  act(() => {
    window.dispatchEvent(new CustomEvent(EVENTO_ESTADO_ASISTENTE, { detail: estado }));
  });
}

function header(asistenteAbierto: boolean) {
  return renderConIdioma(
    <CabeceraMovilProvider>
      <AppHeader
        organizacionId="120"
        organizacionNombre="Org de prueba"
        correo={null}
        pathname="/app/inicio"
        secciones={[]}
        paginasBuscables={[]}
        asistenteAbierto={asistenteAbierto}
        onAlternarAsistente={jest.fn()}
        onAbrirMenu={jest.fn()}
      />
    </CabeceraMovilProvider>
  );
}

function sidebar() {
  return renderConIdioma(
    <SidebarShell
      pathname="/app/inicio"
      secciones={[]}
      cargando={false}
      activa={null}
      drawerAbierto={false}
      onCerrarDrawer={jest.fn()}
      usuario={null}
      organizacion="Org de prueba"
      tema="light"
      onAlternarTema={jest.fn()}
      onCerrarSesion={jest.fn()}
      cerrandoSesion={false}
    />
  );
}

/** El botón del asistente del header de escritorio (la barra móvil tiene otro). */
const botonAsistente = () => {
  const boton = document.querySelector<HTMLButtonElement>('button[aria-keyshortcuts="Control+J Meta+J"]');
  if (!boton) throw new Error('sin botón del asistente');
  return boton;
};

const modoSidebar = () => screen.getByTestId('sidebar').getAttribute('data-modo');

beforeEach(() => {
  simularAncho(1440);
  localStorage.clear();
});

describe('Lógica pura', () => {
  test('estadoDesdeEvento solo acepta { abierto: boolean, modo: acoplado|ampliado }', () => {
    expect(estadoDesdeEvento({ abierto: true, modo: 'ampliado' })).toEqual({ abierto: true, modo: 'ampliado' });
    expect(estadoDesdeEvento({ abierto: 'sí', modo: 'ampliado' })).toBeNull();
    expect(estadoDesdeEvento({ abierto: true, modo: 'gigante' })).toBeNull();
    expect(estadoDesdeEvento(null)).toBeNull();
  });

  test('ampliadoEfectivo: abierto + ampliado + ventana ≥ 1280', () => {
    expect(ampliadoEfectivo({ abierto: true, modo: 'ampliado' }, ANCHO_MIN_AMPLIADO)).toBe(true);
    expect(ampliadoEfectivo({ abierto: true, modo: 'ampliado' }, ANCHO_MIN_AMPLIADO - 1)).toBe(false);
    expect(ampliadoEfectivo({ abierto: false, modo: 'ampliado' }, 1440)).toBe(false);
    expect(ampliadoEfectivo({ abierto: true, modo: 'acoplado' }, 1440)).toBe(false);
  });

  test('modoVisibleSidebar: rail prestado mientras el panel está ampliado', () => {
    expect(modoVisibleSidebar('expanded', false, false)).toBe('expanded');
    expect(modoVisibleSidebar('rail', false, false)).toBe('rail');
    expect(modoVisibleSidebar('expanded', true, false)).toBe('rail');
    expect(modoVisibleSidebar('rail', true, true)).toBe('expanded');
  });

  test('atajo del tooltip: Ctrl+J o ⌘J', () => {
    expect(textoAtajoAsistente(false)).toBe('Ctrl+J');
    expect(textoAtajoAsistente(true)).toBe('⌘J');
  });
});

describe('Sidebar con el panel ampliado (pantalla 09)', () => {
  test('pasa a rail y vuelve a expandido al acoplar o cerrar; la preferencia no se toca', () => {
    localStorage.setItem('shell.sidebar', 'expanded');
    sidebar();
    expect(modoSidebar()).toBe('expanded');

    publicar({ abierto: true, modo: 'acoplado' });
    expect(modoSidebar()).toBe('expanded');

    publicar({ abierto: true, modo: 'ampliado' });
    expect(modoSidebar()).toBe('rail');
    expect(localStorage.getItem('shell.sidebar')).toBe('expanded');

    publicar({ abierto: true, modo: 'acoplado' });
    expect(modoSidebar()).toBe('expanded');

    publicar({ abierto: true, modo: 'ampliado' });
    publicar({ abierto: false, modo: 'ampliado' });
    expect(modoSidebar()).toBe('expanded');
  });

  test('con la preferencia en rail, sigue en rail al cerrar', () => {
    localStorage.setItem('shell.sidebar', 'rail');
    sidebar();
    publicar({ abierto: true, modo: 'ampliado' });
    expect(modoSidebar()).toBe('rail');
    publicar({ abierto: false, modo: 'ampliado' });
    expect(modoSidebar()).toBe('rail');
  });

  test('«Expandir» con el panel ampliado se respeta, sin guardarse', () => {
    localStorage.setItem('shell.sidebar', 'rail');
    sidebar();
    publicar({ abierto: true, modo: 'ampliado' });
    fireEvent.click(screen.getByRole('button', { name: 'alternar' }));
    expect(modoSidebar()).toBe('expanded');
    expect(localStorage.getItem('shell.sidebar')).toBe('rail');
    publicar({ abierto: true, modo: 'acoplado' });
    expect(modoSidebar()).toBe('rail');
  });

  test('por debajo de 1280 px el panel no se amplía y el sidebar no cambia', () => {
    simularAncho(1100);
    localStorage.setItem('shell.sidebar', 'expanded');
    sidebar();
    publicar({ abierto: true, modo: 'ampliado' });
    expect(modoSidebar()).toBe('expanded');
  });
});

describe('Header con el panel', () => {
  test('cerrado (pantalla 01): buscador completo, chip de plan y tooltip con el atajo', () => {
    header(false);
    const boton = botonAsistente();
    expect(boton.getAttribute('aria-keyshortcuts')).toBe('Control+J Meta+J');
    expect(boton.getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByTestId('org-escritorio').getAttribute('data-sin-plan')).toBe('false');
    // El buscador lleva su texto (Variant=button).
    const buscar = screen.getAllByRole('button').find((b) => b.getAttribute('aria-keyshortcuts') === 'Control+K Meta+K /');
    expect(buscar?.textContent).toContain('Buscar');
    // Tooltip: «Abrir GO Asistente» + «Ctrl+J».
    act(() => {
      fireEvent.focus(boton);
    });
    const tooltip = screen.getAllByText('Abrir GO Asistente');
    expect(tooltip.length).toBeGreaterThan(0);
    expect(screen.getAllByText('Ctrl+J').length).toBeGreaterThan(0);
  });

  test('abierto (pantalla 02): buscador en icono y sin chip de plan', () => {
    header(true);
    publicar({ abierto: true, modo: 'acoplado' });
    expect(screen.getByTestId('org-escritorio').getAttribute('data-sin-plan')).toBe('true');
    // El de escritorio (el móvil también se llama «Buscar», sin atajo).
    const buscar = document.querySelector('button[aria-keyshortcuts="Control+K Meta+K /"]')!;
    expect(buscar.getAttribute('aria-label')).toBe('Buscar');
    expect(buscar.getAttribute('aria-keyshortcuts')).toBe('Control+K Meta+K /');
    expect(buscar.textContent).toBe('');
    expect(screen.getByRole('button', { name: 'Reportar problema' })).toBeTruthy();
    const asistente = botonAsistente();
    expect(asistente.textContent).toContain('GO Asistente');
    expect(asistente.getAttribute('aria-pressed')).toBe('true');
  });

  test('ampliado (pantalla 09): sin «Reportar problema» y el asistente en icono', () => {
    header(true);
    publicar({ abierto: true, modo: 'ampliado' });
    expect(screen.queryByRole('button', { name: 'Reportar problema' })).toBeNull();
    const asistente = botonAsistente();
    expect(asistente.textContent).toBe('');
    expect(asistente.getAttribute('aria-label')).toBe('GO Asistente');
    expect(asistente.getAttribute('aria-keyshortcuts')).toBe('Control+J Meta+J');
  });
});
