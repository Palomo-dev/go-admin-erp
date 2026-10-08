/**
 * @jest-environment jsdom
 *
 * Detalle de la mesa en celular (390 px): UNA sola barra y UNA sola «←».
 *
 * El dueño reportó dos encabezados con flecha atrás, uno encima del otro: el
 * MobileHeader del shell («← Mesas · organización») y la cabecera propia de la
 * mesa («← Mesa 2 · zona A»). En Figma (M2 `1080:162972`) la única barra es
 * el `MobileHeader Mode=pos`: «←» · sucursal · estado de la caja · «⋯».
 *
 * `ShellMovil` hace de MobileHeader: como el del shell (AppHeader), pinta «←»
 * en los modos página y POS con lo que publique la pantalla por
 * `useCabeceraMovil`, o con el modo de la ruta si no publica nada. jsdom no
 * aplica Tailwind: un elemento cuenta como visible en celular si ningún
 * ancestro lleva la clase `hidden` (sin prefijo de breakpoint).
 */
import { fireEvent, screen } from '@testing-library/react';
import { renderConIdioma, simularAncho } from '@/test-utils/renderConIdioma';

jest.mock('@/components/pos/display/CustomerDisplayIndicator', () => ({
  CustomerDisplayIndicator: () => <span>indicador-pantalla</span>,
}));
jest.mock('@/components/pos/PendientesSinConexionDialog', () => ({
  PendientesSinConexionDialog: () => null,
}));
jest.mock('@/lib/context/OrganizationTimezoneContext', () => ({
  useOrgTimezone: () => ({ timezone: 'America/Bogota' }),
}));

import { useTranslations } from 'next-intl';
import { CabeceraMovilProvider, modoPorRuta, useCabeceraMovilActual } from '@/components/shell/header/cabeceraMovil';
import { CabeceraMesa } from '@/components/pos/mesas/cuenta/CabeceraMesa';
import { CabeceraMovilMesa, VOLVER_MESA } from '@/components/pos/mesas/cuenta/CabeceraMovilMesa';
import { PantallaMesa } from '@/components/pos/mesas/cuenta/PantallaMesa';

const RUTA = '/app/pos/mesas/7f1c2d1e-0000-4000-8000-000000000002';
let publicado: ReturnType<typeof useCabeceraMovilActual> = null;

function ShellMovil() {
  const t = useTranslations('header');
  const pagina = useCabeceraMovilActual();
  publicado = pagina;
  const modo = pagina?.modo ?? modoPorRuta(RUTA);
  if (modo === 'root') return <header className="lg:hidden" data-testid="shell" />;
  return (
    <header className="lg:hidden" data-testid="shell" data-modo={modo}>
      <button type="button" aria-label={t('back')} data-volver-a={pagina?.volverA ?? ''} />
      {modo === 'pos' && pagina?.estadoPos && <span>{pagina.estadoPos.texto}</span>}
      {pagina?.accion ?? null}
    </header>
  );
}

function visibleEnCelular(el: Element): boolean {
  for (let n: Element | null = el; n; n = n.parentElement) {
    if (n.classList.contains('hidden')) return false;
  }
  return true;
}

/** Botones y enlaces «volver» visibles a 390 px: los del shell y los de la página. */
function accionesVolver(): HTMLElement[] {
  const nombres = ['Volver', 'Volver al plano'];
  return Array.from(document.querySelectorAll<HTMLElement>('button, a')).filter(
    (el) => nombres.includes(el.getAttribute('aria-label') ?? '') && visibleEnCelular(el),
  );
}

function renderMesa() {
  return renderConIdioma(
    <CabeceraMovilProvider>
      <ShellMovil />
      <CabeceraMovilMesa
        cajaAbierta
        estadoCaja="Caja abierta · 8:02 a. m."
        cierreBloqueado={false}
        onCaja={jest.fn()}
        carritosActivos={1}
        carritosEnEspera={0}
      />
      <PantallaMesa
        modo="movil"
        estado="lista"
        mesaNombre="Mesa 2"
        cabeceraMesa={
          <CabeceraMesa
            mesa="Mesa 2"
            zona="A"
            estado="Por cobrar"
            tonoEstado="advertencia"
            minutos={42}
            mesero={null}
            comensales={2}
            onVolver={jest.fn()}
          />
        }
        catalogo={<div>catálogo</div>}
        panel={null}
        barraMovil={<button type="button">Ver cuenta</button>}
        onReintentar={jest.fn()}
        onVolver={jest.fn()}
      />
    </CabeceraMovilProvider>,
  );
}

beforeEach(() => {
  publicado = null;
  simularAncho(390);
});
afterEach(() => simularAncho(1440));

describe('Detalle de la mesa en celular (390 px)', () => {
  test('hay UNA sola acción de volver: la del MobileHeader, que vuelve al plano', () => {
    renderMesa();
    const volver = accionesVolver();
    expect(volver).toHaveLength(1);
    expect(volver[0].closest('[data-testid="shell"]')).not.toBeNull();
    expect(volver[0].getAttribute('data-volver-a')).toBe(VOLVER_MESA);
  });

  test('el MobileHeader va en modo POS, como Figma M2: estado de la caja y «⋯ Caja y dispositivo»', () => {
    renderMesa();
    expect(publicado?.modo).toBe('pos');
    expect(publicado?.estadoPos).toEqual({ texto: 'Caja abierta · 8:02 a. m.', tono: 'exito' });
    expect(screen.getByTestId('shell').getAttribute('data-modo')).toBe('pos');
    fireEvent.click(screen.getByRole('button', { name: 'Caja y dispositivo' }));
    // La hoja de la mesa no ofrece el mapa de atajos del mostrador.
    expect(screen.getByRole('button', { name: /Cerrar caja/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Atajos de teclado/ })).toBeNull();
  });

  test('la cabecera de la mesa sigue en el DOM para tableta (lg), oculta en celular', () => {
    renderMesa();
    const titulo = screen.getByRole('heading', { level: 1, name: /Mesa 2/ });
    expect(visibleEnCelular(titulo)).toBe(false);
    const envoltorio = titulo.closest('.hidden');
    expect(envoltorio?.className).toMatch(/\blg:block\b/);
  });
});
