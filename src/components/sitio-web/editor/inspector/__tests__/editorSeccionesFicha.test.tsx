/**
 * @jest-environment jsdom
 *
 * Paneles de Beneficios, Reseñas, Relacionados y Descripción de la ficha (Figma «16 Sitio web»
 * 2983:72501): abrir no escribe nada (sin opciones = la ficha de hoy), elegir un estilo escribe su
 * clave, la primera opción nueva fija el estilo de hoy, «Volver al aspecto de hoy» quita las
 * claves nuevas y el inspector no repite los campos genéricos que el panel ya pinta.
 * Textos reales (messages/*.json).
 */
import { fireEvent, screen, within } from '@testing-library/react';
import { renderConIdioma as render } from '@/test-utils/renderConIdioma';
import { PanelSeccionFicha } from '../EditorSeccionesFicha';

jest.mock('@/lib/supabase/config', () => ({ supabase: { from: jest.fn() }, getProjectRef: jest.fn(() => 'test') }));
jest.mock('@/lib/hooks/useOrganization', () => ({ useOrganization: () => ({ organization: { id: 120 } }), getOrganizationId: () => 120, ORGANIZATION_CHANGED_EVENT: 'org-cambio' }));

const ultimo = (fn: jest.Mock) => fn.mock.calls[fn.mock.calls.length - 1][0] as Record<string, unknown>;

describe('Beneficios', () => {
  test('abrir no escribe; «Lista» elegida por defecto', () => {
    const onCambiar = jest.fn();
    render(<PanelSeccionFicha tipo="product_benefits" pestana="diseno" contenido={{}} onCambiar={onCambiar} />);
    expect(onCambiar).not.toHaveBeenCalled();
    expect(screen.getByRole('radio', { name: /Lista/ }).getAttribute('aria-checked')).toBe('true');
    expect(screen.queryByRole('button', { name: 'Volver al aspecto de hoy' })).toBeNull();
  });

  test('elegir «Tarjetas» escribe el estilo y conserva los ítems', () => {
    const onCambiar = jest.fn();
    const items = [{ icon: 'Truck', title: 'Envío', description: 'Gratis' }];
    render(<PanelSeccionFicha tipo="product_benefits" pestana="diseno" contenido={{ items }} onCambiar={onCambiar} />);
    fireEvent.click(screen.getByRole('radio', { name: /Tarjetas/ }));
    expect(ultimo(onCambiar)).toEqual({ items, benefits_style: 'tarjetas' });
  });

  test('una opción de Estilo fija «Lista» (la de hoy) y «Volver al aspecto de hoy» la quita', () => {
    const onCambiar = jest.fn();
    const { rerender } = render(<PanelSeccionFicha tipo="product_benefits" pestana="estilo" contenido={{}} onCambiar={onCambiar} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Sólido' }));
    expect(ultimo(onCambiar)).toEqual({ benefits_style: 'lista', icon_bg: 'solido' });
    rerender(<PanelSeccionFicha tipo="product_benefits" pestana="diseno" contenido={{ items: [], benefits_style: 'lista', icon_bg: 'solido' }} onCambiar={onCambiar} />);
    fireEvent.click(screen.getByRole('button', { name: 'Volver al aspecto de hoy' }));
    expect(ultimo(onCambiar)).toEqual({ items: [] });
  });

  test('Contenido: los cuatro de siempre y el set de 12 íconos', () => {
    const onCambiar = jest.fn();
    render(<PanelSeccionFicha tipo="product_benefits" pestana="contenido" contenido={{}} onCambiar={onCambiar} />);
    expect(screen.getByText('Beneficios (4 de 8)')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Editar «Envío rápido»' }));
    expect(within(screen.getByRole('radiogroup', { name: 'Ícono' })).getAllByRole('radio')).toHaveLength(12);
    fireEvent.click(screen.getByRole('radio', { name: 'Instalación' }));
    const items = ultimo(onCambiar).items as { icon: string }[];
    expect(items).toHaveLength(4);
    expect(items[0].icon).toBe('Wrench');
  });
});

describe('Reseñas', () => {
  test('Contenido: fuente «Como el sitio» no escribe; «Reales» escribe reviews_source', () => {
    const onCambiar = jest.fn();
    render(<PanelSeccionFicha tipo="product_reviews" pestana="contenido" contenido={{}} onCambiar={onCambiar} />);
    expect(onCambiar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('radio', { name: 'Reales' }));
    expect(ultimo(onCambiar)).toEqual({ reviews_source: 'real' });
  });

  test('Diseño: filtros como chips múltiples', () => {
    const onCambiar = jest.fn();
    render(<PanelSeccionFicha tipo="product_reviews" pestana="diseno" contenido={{}} onCambiar={onCambiar} />);
    fireEvent.click(screen.getByRole('button', { name: /Con fotos/ }));
    expect(ultimo(onCambiar)).toEqual({ reviews_style: 'clasico', filters: ['estrellas', 'fotos'] });
  });
});

describe('Relacionados', () => {
  test('Contenido: «Misma categoría» por defecto; «Elegidos a mano» escribe source', () => {
    const onCambiar = jest.fn();
    render(<PanelSeccionFicha tipo="related_products" pestana="contenido" contenido={{ related_products_layout: 'carousel' }} onCambiar={onCambiar} />);
    expect(screen.getByRole('radio', { name: /Misma categoría/ }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('radio', { name: /Elegidos a mano/ }));
    expect(ultimo(onCambiar)).toEqual({ related_products_layout: 'carousel', source: 'manual' });
  });

  test('Diseño: «Comprados juntos» como estilo', () => {
    const onCambiar = jest.fn();
    render(<PanelSeccionFicha tipo="related_products" pestana="diseno" contenido={{}} onCambiar={onCambiar} />);
    fireEvent.click(screen.getByRole('radio', { name: /Comprados juntos/ }));
    expect(ultimo(onCambiar)).toEqual({ related_style: 'juntos' });
  });
});

describe('Descripción', () => {
  test('Diseño: «Pestañas» y líneas antes de «Ver más»', () => {
    const onCambiar = jest.fn();
    render(<PanelSeccionFicha tipo="product_description" pestana="diseno" contenido={{}} onCambiar={onCambiar} />);
    expect(screen.getByRole('radio', { name: /Texto con «Ver más»/ }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('radio', { name: /Pestañas/ }));
    expect(ultimo(onCambiar)).toEqual({ description_style: 'pestanas' });
    fireEvent.click(screen.getByRole('radio', { name: '5' }));
    expect(ultimo(onCambiar)).toEqual({ description_style: 'ver_mas', lines_before_more: 5 });
  });
});
