/**
 * @jest-environment jsdom
 *
 * «Descripción de Producto» dentro de «Pestañas de la ficha» (reporte del dueño, 2026-11-26): el
 * inspector lo dice, enlaza el bloque de pestañas y no ofrece lo que ahí no aplica (estilos
 * «Pestañas» y «Acordeón», «Partes que se muestran»). En «Pestañas de la ficha», «Editar contenido»
 * junto a cada pestaña selecciona el bloque de donde sale. Textos reales (messages/*.json).
 */
import { fireEvent, screen } from '@testing-library/react';
import { renderConIdioma as render } from '@/test-utils/renderConIdioma';
import { EnlaceContenidoPestana, PanelSeccionFicha, bloquePestanasQueMuestra, type SeccionDePagina } from '../EditorSeccionesFicha';

jest.mock('@/lib/supabase/config', () => ({ supabase: { from: jest.fn() }, getProjectRef: jest.fn(() => 'test') }));
jest.mock('@/lib/hooks/useOrganization', () => ({ useOrganization: () => ({ organization: { id: 120 } }), getOrganizationId: () => 120, ORGANIZATION_CHANGED_EVENT: 'org-cambio' }));

const pagina: SeccionDePagina[] = [
  { id: 'nav', section_type: 'product_anchor_nav', is_visible: true, content: {} },
  { id: 'desc', section_type: 'product_description', is_visible: true, content: {} },
  { id: 'specs', section_type: 'product_specs', is_visible: true, content: {} },
  { id: 'envio', section_type: 'product_shipping', is_visible: true, content: {} },
];

describe('bloquePestanasQueMuestra', () => {
  test('con el bloque de pestañas visible y la descripción en sus pestañas (por defecto, las cuatro)', () => {
    expect(bloquePestanasQueMuestra(pagina, 'product_description')).toBe('nav');
  });
  test('sin bloque de pestañas, oculto o sin la pestaña: null', () => {
    expect(bloquePestanasQueMuestra(pagina.filter((s) => s.id !== 'nav'), 'product_description')).toBeNull();
    expect(bloquePestanasQueMuestra(pagina.map((s) => (s.id === 'nav' ? { ...s, is_visible: false } : s)), 'product_description')).toBeNull();
    const soloResenas = pagina.map((s) => (s.id === 'nav' ? { ...s, content: { items: [{ label: 'Reseñas', target: 'product_reviews' }] } } : s));
    expect(bloquePestanasQueMuestra(soloResenas, 'product_description')).toBeNull();
  });
});

describe('Descripción dentro de las pestañas', () => {
  test('Diseño: aviso con enlace, solo «Texto con Ver más» y «Ficha en tabla», sin «Partes que se muestran»', () => {
    const ir = jest.fn();
    render(<PanelSeccionFicha tipo="product_description" pestana="diseno" contenido={{ description_style: 'pestanas' }} onCambiar={jest.fn()} enPestanas={{ ir }} />);
    expect(screen.getByText(/Se muestra dentro de «Pestañas de la ficha»/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ir a «Pestañas de la ficha»' }));
    expect(ir).toHaveBeenCalled();
    expect(screen.queryByRole('radio', { name: /Acordeón/ })).toBeNull();
    // «Pestañas» guardado se ve como «Texto con Ver más» (así lo pinta la tienda en la pestaña).
    expect(screen.getAllByRole('radio')[0].getAttribute('aria-checked')).toBe('true');
    expect(screen.queryByText('Partes que se muestran')).toBeNull();
  });

  test('fuera de las pestañas, los cuatro estilos y las partes de siempre', () => {
    render(<PanelSeccionFicha tipo="product_description" pestana="diseno" contenido={{}} onCambiar={jest.fn()} />);
    expect(screen.queryByText(/Se muestra dentro de «Pestañas de la ficha»/)).toBeNull();
    expect(screen.getByRole('radio', { name: /Acordeón/ })).toBeTruthy();
  });
});

describe('Pestañas de la ficha: «Editar contenido»', () => {
  test('selecciona el bloque de la pestaña; la descripción enlaza además Inventario', () => {
    const onSeleccionar = jest.fn();
    const { rerender } = render(<EnlaceContenidoPestana target="product_shipping" secciones={pagina} onSeleccionar={onSeleccionar} />);
    fireEvent.click(screen.getByRole('button', { name: /Editar contenido/ }));
    expect(onSeleccionar).toHaveBeenCalledWith('envio');
    rerender(<EnlaceContenidoPestana target="product_description" secciones={pagina} onSeleccionar={onSeleccionar} />);
    expect(screen.getByRole('link', { name: 'Texto en Inventario' })).toBeTruthy();
  });

  test('sin el bloque en la página, nada', () => {
    const { container } = render(<EnlaceContenidoPestana target="product_reviews" secciones={pagina} onSeleccionar={jest.fn()} />);
    expect(container.querySelector('[data-editar-contenido-pestana]')).toBeNull();
  });
});
