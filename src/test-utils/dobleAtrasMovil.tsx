/**
 * Arnés para las pruebas «una sola ← en celular» de las pantallas de detalle.
 *
 * En el celular (< lg) el shell pinta el MobileHeader en modo página: «←» +
 * título + subtítulo (Figma `02 Componentes` › MobileHeader 48:2550). Una
 * cabecera de detalle con su propia «←» visible bajo lg dibuja una segunda
 * flecha que vuelve al mismo sitio.
 *
 * `ShellMovil` hace de MobileHeader: como el real (AppHeader), pinta «←» y lo
 * que la pantalla publique con `useCabeceraMovil`. jsdom no aplica Tailwind:
 * un elemento cuenta como visible en celular si ningún ancestro lleva la clase
 * `hidden` sin prefijo de breakpoint.
 *
 * Uso: `renderEnCelular(<Cabecera … />)` y luego
 * `comprobarDetalleMovil(titulo, ['Estado', 'Acción', …])`.
 */
import type { ReactElement } from 'react';
import { screen } from '@testing-library/react';
import { ArrowLeft } from 'lucide-react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { renderConIdioma, simularAncho } from './renderConIdioma';
import {
  CabeceraMovilProvider,
  useCabeceraMovilActual,
  type CabeceraMovilPagina,
} from '@/components/shell/header/cabeceraMovil';

let publicado: CabeceraMovilPagina | null = null;

function ShellMovil() {
  const pagina = useCabeceraMovilActual();
  publicado = pagina;
  return (
    <header className="lg:hidden" data-testid="shell-movil">
      <button type="button" aria-label="Volver">
        <ArrowLeft aria-hidden="true" />
      </button>
      {pagina?.titulo && <p data-testid="shell-titulo">{pagina.titulo}</p>}
      {pagina?.subtitulo && <p data-testid="shell-subtitulo">{pagina.subtitulo}</p>}
    </header>
  );
}

/** Visible a 390 px: ningún ancestro con `hidden` (sin `lg:`/`md:` delante). */
export function visibleEnCelular(el: Element): boolean {
  for (let n: Element | null = el; n; n = n.parentElement) {
    if (n.classList.contains('hidden')) return false;
  }
  return true;
}

/** Flechas «←» visibles en celular: la del shell y las que dibuje la pantalla. */
export function flechasVisibles(): Element[] {
  return Array.from(document.querySelectorAll('svg.lucide-arrow-left')).filter(visibleEnCelular);
}

/** Lo que la pantalla publicó en el MobileHeader con `useCabeceraMovil`. */
export function cabeceraPublicada(): CabeceraMovilPagina | null {
  return publicado;
}

/** Renderiza la pantalla a 390 px bajo el MobileHeader del shell (y el TooltipProvider de la app). */
export function renderEnCelular(ui: ReactElement) {
  publicado = null;
  simularAncho(390);
  return renderConIdioma(
    <TooltipProvider>
      <CabeceraMovilProvider>
        <ShellMovil />
        {ui}
      </CabeceraMovilProvider>
    </TooltipProvider>,
  );
}

/** Una sola «←» visible, y es la del MobileHeader. */
export function esperarUnaSolaFlecha(): void {
  const flechas = flechasVisibles();
  if (flechas.length !== 1 || !flechas[0].closest('[data-testid="shell-movil"]')) {
    throw new Error(`Se esperaba una sola «←» visible (la del MobileHeader) y hay ${flechas.length}`);
  }
}

/** La flecha propia sigue en el DOM para lg y más: oculta solo en celular. */
export function flechaPropiaSoloDesdeLg(): boolean {
  const propias = Array.from(document.querySelectorAll('svg.lucide-arrow-left')).filter(
    (svg) => !svg.closest('[data-testid="shell-movil"]'),
  );
  return (
    propias.length > 0 &&
    propias.every((svg) => {
      const oculto = svg.closest('.hidden');
      return !!oculto && /\blg:(block|flex|inline-flex|inline)\b/.test(oculto.className.toString());
    })
  );
}

/**
 * La comprobación de cada pantalla: una sola «←» (la del shell), la propia
 * solo desde lg, el título publicado en el MobileHeader y, en celular, todo
 * lo demás de la cabecera a la vista (estado, subtítulo, montos, acciones).
 */
export function comprobarDetalleMovil(titulo: string, aLaVista: string[] = []): void {
  esperarUnaSolaFlecha();
  if (!flechaPropiaSoloDesdeLg()) throw new Error('La «←» propia debe seguir en el DOM con hidden lg:…');
  const pagina = cabeceraPublicada();
  if (pagina?.modo !== 'page' || pagina.titulo !== titulo) {
    throw new Error(`MobileHeader: se esperaba «${titulo}» en modo página y llegó ${JSON.stringify(pagina && { modo: pagina.modo, titulo: pagina.titulo })}`);
  }
  for (const texto of aLaVista) {
    const el = screen.getAllByText(texto).find((e) => !e.closest('[data-testid="shell-movil"]'));
    if (!el || !visibleEnCelular(el)) throw new Error(`«${texto}» debe verse en celular`);
  }
}
