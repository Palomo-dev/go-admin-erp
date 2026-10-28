/**
 * @jest-environment jsdom
 *
 * Encabezado › Celular › Menú inferior (v2): el panel muestra lo de hoy sin escribir, y cada
 * acción del usuario sale por `cambiar` con el menú entero en v:2. Datos ficticios.
 */
import { fireEvent, screen, within } from '@testing-library/react';
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
  v: number; enabled: boolean; variant: string; items: { action: string; visible: boolean; label: string }[];
};

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
  test('restaurante sin teléfono ni reservas: «Sin destino: no se muestra», como en vivo', () => {
    destinos = { telefono: false, whatsapp: false, direccion: true, pedir: true, reservar: false };
    panel({}, 'restaurante');
    expect(screen.getAllByText('Sin destino: no se muestra')).toHaveLength(2);
  });
});
