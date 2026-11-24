/**
 * Menú inferior · propuestas de mejora (Figma 2836:69391, aprobadas 2026-11-23): lo de hoy no
 * escribe su clave, cada opción distinta sí, y cambiar de estilo limpia lo que no aplica.
 * Contrato en `@/lib/website/menuInferior` (copia idéntica de la tienda).
 */
import { leerMenuInferior, paginaMenu, repetidosArriba } from '@/lib/website/menuInferior';
import {
  cambioMenuV2, conAlBajar, conContador, conEfectoActivo, conEfectoToque, conFicha, conIndicador, conNoRepetir, conTema, conVariante, conVelocidad,
  menuDelEditor, moverA, temaEditor, usaCentro, usaMarca,
} from '../inspector/menuInferiorLogica';

const base = () => menuDelEditor({ mobile_menu_style: 'tabs' }).menu;
const estilo = (m: ReturnType<typeof base>) => (cambioMenuV2({}, m).mobile_header as { bottom_nav: { style: Record<string, unknown> } }).bottom_nav.style;

describe('Menú inferior · propuestas de mejora', () => {
  it('sin tocar nada: el estilo guardado es solo «labels» (la tienda se ve igual)', () => {
    expect(estilo(base())).toEqual({ labels: 'always' });
  });

  it('lo de hoy de cada opción no escribe su clave', () => {
    const m = base();
    expect(estilo(conIndicador(m, 'none'))).toEqual({ labels: 'always' });
    expect(estilo(conTema(m, 'header'))).toEqual({ labels: 'always' });
    expect(estilo(conContador(m, 'cart', 'number'))).toEqual({ labels: 'always' });
    expect(estilo(conContador(m, 'favorites', 'dot'))).toEqual({ labels: 'always' });
    expect(estilo(conAlBajar(m, 'always'))).toEqual({ labels: 'always' });
    expect(estilo(conFicha(m, 'hide'))).toEqual({ labels: 'always' });
    expect(estilo(conNoRepetir(m, false))).toEqual({ labels: 'always' });
    expect(estilo(conEfectoToque(m, 'none'))).toEqual({ labels: 'always' });
    expect(estilo(conVelocidad(m, 'normal'))).toEqual({ labels: 'always' });
  });

  it('cada opción distinta escribe su clave y viaja en mobile_header.bottom_nav v:2', () => {
    let m = base();
    m = conIndicador(m, 'slide');
    m = conTema(m, 'light');
    m = conContador(m, 'cart', 'dot');
    m = conAlBajar(m, 'hide');
    m = conFicha(m, 'stack');
    m = conNoRepetir(m, true);
    m = conEfectoActivo(m, 'glow');
    m = conEfectoToque(m, 'ripple');
    m = conVelocidad(m, 'fast');
    const esperado = { indicator: 'slide', theme: 'light', badges: { cart: 'dot' }, scroll: 'hide', pages: { product: 'stack' }, dedupeHeader: true, activeEffect: 'glow', pressEffect: 'ripple', fxSpeed: 'fast' };
    expect(estilo(m)).toMatchObject(esperado);
    expect(leerMenuInferior(cambioMenuV2({}, m))!.style).toMatchObject(esperado);
  });

  it('colores: «Propio» si hay colores fijados; «Encabezado» o «Claro» los quitan', () => {
    const m = { ...base(), style: { ...base().style, background: '#111111' } };
    expect(temaEditor(m)).toBe('custom');
    const claro = conTema(m, 'light');
    expect(claro.style.background).toBeUndefined();
    expect(temaEditor(claro)).toBe('light');
    expect(conTema(base(), 'custom').style.theme).toBe('custom');
  });

  it('efecto del activo: el que ya da la marca no escribe la clave', () => {
    expect(conEfectoActivo(conVariante(base(), 'floating'), 'pill').style.activeEffect).toBeUndefined();
    expect(conEfectoActivo(conVariante(base(), 'icons'), 'label').style.activeEffect).toBeUndefined();
    expect(conEfectoActivo(base(), 'pill').style.activeEffect).toBe('pill');
  });

  it('cambiar de estilo limpia lo que no aplica', () => {
    const conMarca = conIndicador(base(), 'dot');
    const m = { ...conMarca, style: { ...conMarca.style, centerId: 'cart', centerShape: 'notch' as const } };
    const acciones = conVariante(m, 'actions');
    expect(acciones.style.indicator).toBeUndefined();
    expect(acciones.style.centerShape).toBeUndefined();
    const isla = conVariante(m, 'split');
    expect(isla.style.centerShape).toBeUndefined();
    expect(isla.style.centerId).toBeUndefined();
    expect(isla.items).toHaveLength(5);
    expect(usaCentro('split')).toBe(false);
    expect(usaCentro('icons')).toBe(false);
    expect(usaMarca('icons')).toBe(false);
    expect(usaMarca('split')).toBe(true);
    // Pestañas → Solo íconos: los colores del encabezado siguen siendo los de hoy (sin clave).
    expect(conVariante(base(), 'icons').style.theme).toBeUndefined();
  });

  it('arrastre: mueve el botón a la posición soltada', () => {
    expect(moverA(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moverA(['a', 'b', 'c', 'd'], 3, 0)).toEqual(['d', 'a', 'b', 'c']);
    expect(moverA(['a', 'b'], 0, 5)).toEqual(['a', 'b']);
  });

  it('páginas especiales y «No repetir arriba» (contrato compartido)', () => {
    expect(paginaMenu('/checkout')).toBe('sin-menu');
    expect(paginaMenu('/carrito')).toBe('sin-menu');
    expect(paginaMenu('/pedido/x')).toBe('sin-menu');
    expect(paginaMenu('/productos/3')).toBe('ficha');
    expect(paginaMenu('/')).toBe('normal');
    const m = conNoRepetir(base(), true);
    expect([...repetidosArriba(m, '/')].sort()).toEqual(['account', 'cart', 'search']);
    expect(repetidosArriba(base(), '/').size).toBe(0);
  });
});
