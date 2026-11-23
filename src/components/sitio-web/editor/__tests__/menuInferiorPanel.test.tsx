/**
 * @jest-environment jsdom
 *
 * Encabezado › Celular › Menú inferior (v2): el panel muestra lo de hoy sin escribir, y cada
 * acción del usuario sale por `cambiar` con el menú entero en v:2. Datos ficticios.
 */
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import { MenuInferiorPanel } from '../inspector/MenuInferiorPanel';

let destinos: unknown = null;
jest.mock('../inspector/useDestinosTienda', () => ({ useDestinosTienda: () => destinos }));
afterEach(() => { destinos = null; });

const panel = (ajustes: Record<string, unknown>, giro: string | null = null) => {
  const cambiar = jest.fn();
  renderConIdioma(<MenuInferiorPanel ajustes={ajustes} cambiar={cambiar} giro={giro} />);
  return cambiar;
};
const guardado = (c: jest.Mock) => (c.mock.calls.at(-1)![0].mobile_header as { bottom_nav: Record<string, unknown> }).bottom_nav as {
  v: number; enabled: boolean; variant: string; items: { action: string; visible: boolean; label: string; id: string }[]; style: Record<string, unknown>;
};
const grupo = (nombre: string) => screen.getByRole('radiogroup', { name: nombre });
const elegido = (nombre: string) => grupo(nombre).querySelector('[aria-checked="true"]')?.textContent;
/** Menú v2 guardado con Inicio, Buscar, Favoritos y Carrito (datos ficticios). */
const v2 = (style: Record<string, unknown> = { labels: 'always' }, variant = 'tabs') => ({
  mobile_header: {
    bottom_nav: {
      v: 2, enabled: true, variant, style,
      items: [
        { id: 'home', action: 'home', label: 'Inicio', icon: 'home', visible: true },
        { id: 'search', action: 'search', label: 'Buscar', icon: 'search', visible: true },
        { id: 'fav', action: 'favorites', label: 'Favoritos', icon: 'heart', visible: true },
        { id: 'cart', action: 'cart', label: 'Carrito', icon: 'bag', visible: true },
      ],
    },
  },
});

describe('MenuInferiorPanel', () => {
  test('pestañas de la plantilla: 5 filas, nada se escribe al abrir', () => {
    const cambiar = panel({ mobile_menu_style: 'tabs' });
    expect(cambiar).not.toHaveBeenCalled();
    const lista = screen.getByRole('list', { name: 'Botones del menú inferior' });
    expect(within(lista).getAllByText('Inicio').length).toBeGreaterThan(0);
    expect(within(lista).getAllByText('Cuenta').length).toBeGreaterThan(0);
    expect(screen.getByRole('switch', { name: /Menú inferior/ }).getAttribute('aria-checked')).toBe('true');
  });
  test('agregar un botón guarda v:2 con 5 → no deja pasar de 5; en acciones agrega WhatsApp', () => {
    const cambiar = panel({ mobile_menu_style: 'fullscreen', mobile_bottom_bar: ['whatsapp', 'llamar'] });
    fireEvent.click(screen.getByRole('button', { name: /Agregar botón/ }));
    const g = guardado(cambiar);
    expect(g.v).toBe(2);
    expect(g.variant).toBe('actions');
    expect(g.items.map((b) => b.action)).toEqual(['whatsapp', 'call', 'home']);
  });
  test('apagar conserva los botones', () => {
    const cambiar = panel({ mobile_menu_style: 'tabs' });
    fireEvent.click(screen.getByRole('switch', { name: /Menú inferior/ }));
    const g = guardado(cambiar);
    expect(g.enabled).toBe(false);
    expect(g.items).toHaveLength(5);
  });
  test('restaurante sin lista: «Reservar · Llamar · Cómo llegar · Pedir»', () => {
    panel({}, 'restaurante');
    const lista = screen.getByRole('list', { name: 'Botones del menú inferior' });
    for (const x of ['Reservar', 'Llamar', 'Cómo llegar', 'Pedir']) expect(within(lista).getAllByText(x).length).toBeGreaterThan(0);
  });
  test('propuestas 2026-11-23: lo de hoy se ve elegido y no se escribe nada al abrir', () => {
    const cambiar = panel(v2());
    expect(cambiar).not.toHaveBeenCalled();
    expect(elegido('Marca del activo')).toBe('Ninguna');
    expect(elegido('Colores')).toBe('Encabezado');
    expect(elegido('Carrito')).toBe('Número');
    expect(elegido('Favoritos')).toBe('Punto');
    expect(elegido('Al bajar la página')).toBe('Siempre visible');
    expect(elegido('Ficha de producto')).toBe('Ocultar');
    expect(screen.getByText('Siempre oculto')).toBeTruthy();
    expect(screen.getByRole('switch', { name: /No repetir en la cabecera/ }).getAttribute('aria-checked')).toBe('false');
    expect(within(grupo('Al tocar')).getByRole('radio', { name: 'Ninguno' }).getAttribute('aria-checked')).toBe('true');
  });
  test('cada opción nueva escribe su clave y la de hoy la quita', () => {
    const cambiar = panel(v2());
    fireEvent.click(within(grupo('Marca del activo')).getByRole('radio', { name: 'Desliza' }));
    expect(guardado(cambiar).style).toMatchObject({ indicator: 'slide' });
    fireEvent.click(within(grupo('Carrito')).getByRole('radio', { name: 'Punto' }));
    expect(guardado(cambiar).style).toMatchObject({ badges: { cart: 'dot' } });
    fireEvent.click(within(grupo('Favoritos')).getByRole('radio', { name: 'Punto' }));
    expect(guardado(cambiar).style).not.toHaveProperty('badges');
    fireEvent.click(within(grupo('Al bajar la página')).getByRole('radio', { name: 'Se esconde' }));
    expect(guardado(cambiar).style).toMatchObject({ scroll: 'hide' });
    fireEvent.click(within(grupo('Ficha de producto')).getByRole('radio', { name: 'Apilar' }));
    expect(guardado(cambiar).style).toMatchObject({ pages: { product: 'stack' } });
    fireEvent.click(screen.getByRole('switch', { name: /No repetir en la cabecera/ }));
    expect(guardado(cambiar).style).toMatchObject({ dedupeHeader: true });
    fireEvent.click(within(grupo('Efecto del activo')).getByRole('radio', { name: 'Halo' }));
    expect(guardado(cambiar).style).toMatchObject({ activeEffect: 'glow' });
    fireEvent.click(within(grupo('Al tocar')).getByRole('radio', { name: 'Onda' }));
    expect(guardado(cambiar).style).toMatchObject({ pressEffect: 'ripple' });
    fireEvent.click(within(grupo('Velocidad')).getByRole('radio', { name: 'Suave' }));
    expect(guardado(cambiar).style).toMatchObject({ fxSpeed: 'slow' });
    fireEvent.click(within(grupo('Colores')).getByRole('radio', { name: 'Claro' }));
    expect(guardado(cambiar).style).toMatchObject({ theme: 'light' });
  });
  test('estilos nuevos: Isla con botón aparte (el Carrito por defecto); Solo íconos sin textos ni marca', () => {
    const cambiar = panel(v2());
    fireEvent.click(within(grupo('Estilo')).getByRole('radio', { name: /Isla/ }));
    expect(guardado(cambiar).variant).toBe('split');
    cleanup();
    const c2 = panel(v2({ labels: 'always' }, 'split'));
    expect(elegido('Botón aparte')).toBe('Carrito');
    fireEvent.click(within(grupo('Botón aparte')).getByRole('radio', { name: 'Buscar' }));
    expect(guardado(c2).style).toMatchObject({ splitId: 'search' });
    cleanup();
    panel(v2({ labels: 'always' }, 'icons'));
    expect(screen.queryByRole('radiogroup', { name: 'Texto bajo el ícono' })).toBeNull();
    expect(screen.queryByRole('radiogroup', { name: 'Marca del activo' })).toBeNull();
  });
  test('muesca solo en Pestañas con botón destacado', () => {
    const cambiar = panel(v2({ labels: 'always', centerId: 'cart' }));
    fireEvent.click(within(grupo('Forma del destacado')).getByRole('radio', { name: 'Muesca' }));
    expect(guardado(cambiar).style).toMatchObject({ centerShape: 'notch', centerId: 'cart' });
  });
  test('contador por botón: el del Carrito escribe el mismo style.badges.cart', () => {
    const cambiar = panel(v2());
    const lista = screen.getByRole('list', { name: 'Botones del menú inferior' });
    fireEvent.click(within(lista).getAllByRole('button', { name: /Carrito/ })[0]);
    fireEvent.click(within(grupo('Contador')).getByRole('radio', { name: 'Oculto' }));
    expect(guardado(cambiar).style).toMatchObject({ badges: { cart: 'hidden' } });
  });
  test('vista previa de efectos: tocar un ícono lo vuelve el activo', () => {
    panel(v2());
    const previa = screen.getByText('Vista previa en vivo').parentElement!;
    fireEvent.click(within(previa).getAllByRole('button', { pressed: false })[1]);
    expect(within(previa).getAllByRole('button', { pressed: true })).toHaveLength(1);
    expect(within(previa).getAllByRole('button', { pressed: true })[0].textContent).toContain('Buscar');
  });
  test('restaurante sin teléfono ni reservas: «Sin destino: no se muestra», como en vivo', () => {
    destinos = { telefono: false, whatsapp: false, direccion: true, pedir: true, reservar: false };
    panel({}, 'restaurante');
    expect(screen.getAllByText('Sin destino: no se muestra')).toHaveLength(2);
  });
});
