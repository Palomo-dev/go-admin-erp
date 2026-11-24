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

describe('Beneficios: cada opción se ve solo donde la tienda la usa (reporte del 2026-11-24)', () => {
  test('Insignias: sin columnas, líneas ni descripción, y lo dice', () => {
    render(<PanelSeccionFicha tipo="product_benefits" pestana="diseno" contenido={{ benefits_style: 'insignias' }} onCambiar={jest.fn()} />);
    expect(screen.queryByText('Columnas en escritorio')).toBeNull();
    expect(screen.queryByText('Columnas en celular')).toBeNull();
    expect(screen.queryByText('Líneas entre ítems')).toBeNull();
    expect(screen.queryByText('Mostrar la descripción')).toBeNull();
    expect(screen.getByText(/Con «Insignias» no se usan: Columnas en escritorio, Columnas en celular, Líneas entre ítems, Mostrar la descripción/)).toBeTruthy();
    // Espacio por defecto de Insignias: 12 px (el que pinta la tienda).
    expect(screen.getByRole('radio', { name: '12 px' }).getAttribute('aria-checked')).toBe('true');
  });

  test('Lista: columnas en celular con su ayuda; elegir 1 columna la escribe', () => {
    const onCambiar = jest.fn();
    render(<PanelSeccionFicha tipo="product_benefits" pestana="diseno" contenido={{}} onCambiar={onCambiar} />);
    expect(screen.getByText(/vista «Celular» del lienzo/)).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: '1 columna' }));
    expect(ultimo(onCambiar)).toEqual({ benefits_style: 'lista', columns_mobile: 1 });
    expect(document.querySelector('[data-no-se-usan]')).toBeNull();
  });

  test('Estilo: la tarjeta de cada ítem solo en Tarjetas e Insignias; la forma sin fondo lo explica', () => {
    const { rerender } = render(<PanelSeccionFicha tipo="product_benefits" pestana="estilo" contenido={{ benefits_style: 'lista', icon_bg: 'ninguno' }} onCambiar={jest.fn()} />);
    expect(screen.queryByText('Tarjeta de cada ítem')).toBeNull();
    expect(screen.getByText(/no se usan: Tarjeta de cada ítem, Fondo de la tarjeta/)).toBeTruthy();
    expect(screen.getByText(/la forma no se ve/)).toBeTruthy();
    expect(screen.getByText(/Para los íconos de todos los beneficios/)).toBeTruthy();
    rerender(<PanelSeccionFicha tipo="product_benefits" pestana="estilo" contenido={{ benefits_style: 'tarjetas' }} onCambiar={jest.fn()} />);
    expect(screen.getByText('Tarjeta de cada ítem')).toBeTruthy();
  });

  test('Contenido: el color de un ítem fija el estilo y conserva el id', () => {
    const onCambiar = jest.fn();
    const items = [{ id: 'a1', icon: 'Truck', title: 'Envío', description: 'Gratis' }];
    render(<PanelSeccionFicha tipo="product_benefits" pestana="contenido" contenido={{ items }} onCambiar={onCambiar} />);
    // El título también abre el beneficio.
    fireEvent.click(screen.getByRole('button', { name: 'Envío' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Uno propio' }));
    expect(ultimo(onCambiar)).toEqual({ benefits_style: 'lista', items: [{ id: 'a1', icon: 'Truck', title: 'Envío', description: 'Gratis', color: '#16A34A' }] });
  });

  test('Contenido: con «De la marca» el color del ítem no se usa, lo dice y ofrece «Multicolor»', () => {
    const onCambiar = jest.fn();
    const items = [{ icon: 'Truck', title: 'Envío', description: 'Gratis' }];
    render(<PanelSeccionFicha tipo="product_benefits" pestana="contenido" contenido={{ items, icon_color_mode: 'marca' }} onCambiar={onCambiar} />);
    fireEvent.click(screen.getByRole('button', { name: 'Editar «Envío»' }));
    expect(screen.getByText(/Ahora todos los íconos usan «De la marca»/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Usar «Multicolor»' }));
    expect(ultimo(onCambiar)).toEqual({ items, icon_color_mode: 'multicolor', benefits_style: 'lista' });
  });
});

describe('Opciones que el estilo no usa: Reseñas, Relacionados y Descripción', () => {
  test('Reseñas «Compacta»: sin filtros', () => {
    render(<PanelSeccionFicha tipo="product_reviews" pestana="diseno" contenido={{ reviews_style: 'compacta' }} onCambiar={jest.fn()} />);
    expect(screen.queryByText('Filtros que ve el cliente')).toBeNull();
    expect(screen.getByText(/Con «Compacta» no se usan: Filtros que ve el cliente/)).toBeTruthy();
  });

  test('Relacionados «Rejilla»: sin flechas, puntos ni «En celular»', () => {
    render(<PanelSeccionFicha tipo="related_products" pestana="diseno" contenido={{ related_style: 'rejilla' }} onCambiar={jest.fn()} />);
    expect(screen.queryByText('Flechas')).toBeNull();
    expect(screen.queryByText('Puntos')).toBeNull();
    expect(screen.queryByText('En celular')).toBeNull();
    expect(screen.getByText('Columnas en escritorio')).toBeTruthy();
  });

  test('Descripción «Ficha en tabla»: sin líneas antes de «Ver más»', () => {
    render(<PanelSeccionFicha tipo="product_description" pestana="diseno" contenido={{ description_style: 'tabla' }} onCambiar={jest.fn()} />);
    expect(screen.queryByText('Líneas antes de «Ver más»')).toBeNull();
    expect(screen.getByText(/no se usan: Abierta al cargar, Líneas antes de «Ver más», En celular, Permitir varias abiertas/)).toBeTruthy();
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
