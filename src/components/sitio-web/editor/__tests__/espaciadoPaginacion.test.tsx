/**
 * @jest-environment jsdom
 */
import { fireEvent, screen } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import { aplicarCambioContenido, capaAlSubirPrimeraImagen, campoCubiertoPorEstilo, entradasAnterioresSeccion } from '../inspector/espaciadoSeccion';
import { PanelCarrusel, PanelPaginacion } from '../inspector/PanelesListaCarrusel';

jest.mock('@/lib/hooks/useOrganization', () => ({ useOrganization: () => ({ organization: { id: 120 } }), getOrganizationId: () => 120, ORGANIZATION_CHANGED_EVENT: 'org-cambio' }));

describe('espaciado de sección: una sola opción (Estilo)', () => {
  test('Diseño ya no pinta espaciado, ancho completo ni ancho del contenido', () => {
    expect(campoCubiertoPorEstilo({ key: '_spacing', type: 'spacing' }, 'offers')).toBe(true);
    expect(campoCubiertoPorEstilo({ key: 'full_bleed', type: 'boolean' }, 'offers')).toBe(true);
    expect(campoCubiertoPorEstilo({ key: 'container_width', type: 'select' }, 'offers')).toBe(true);
    expect(campoCubiertoPorEstilo({ key: 'full_width', type: 'boolean' }, 'categories_grid')).toBe(true);
    // El hero «Slider» lee full_width en la tienda, pero se elige en Estilo › Ancho (un solo control).
    expect(campoCubiertoPorEstilo({ key: 'full_width', type: 'boolean' }, 'hero')).toBe(true);
    expect(campoCubiertoPorEstilo({ key: 'gap', type: 'range' }, 'offers')).toBe(false);
  });

  test('lo guardado sale en anteriores y Quitar borra solo esas claves', () => {
    const c = { title: 'Ofertas', padding_top: 'px', padding_top_px: 40, margin_bottom: 'md', full_bleed: true };
    const e = entradasAnterioresSeccion(c, 'offers');
    expect(e.map((x) => [x.id, x.motivo])).toEqual([
      ['seccion_padding_top', 'mandaEspaciado'],
      ['seccion_margin_bottom', undefined],
      ['seccion_full_bleed', 'mandaAncho'],
    ]);
    expect(aplicarCambioContenido(c, e[0].quitar!)).toEqual({ title: 'Ofertas', margin_bottom: 'md', full_bleed: true });
    expect(entradasAnterioresSeccion({ full_width: true }, 'categories_grid')[0]).toMatchObject({ id: 'seccion_full_width', motivo: 'sinEfecto' });
    expect(entradasAnterioresSeccion({ full_width: true }, 'hero')).toEqual([]);
    expect(entradasAnterioresSeccion({}, 'offers')).toEqual([]);
  });
});

describe('PanelPaginacion (kit)', () => {
  test('PAGINA-01: «Mostrar paginación» se ve una vez en el panel, también con el ajuste global', () => {
    const cambiar = jest.fn();
    renderConIdioma(<PanelPaginacion valor={null} usarGlobal onUsarGlobal={jest.fn()} onCambiar={jest.fn()} color="#111" mostrar={{ valor: true, onCambiar: cambiar }} />);
    const sw = screen.getAllByRole('switch', { name: 'Mostrar paginación' });
    expect(sw).toHaveLength(1);
    fireEvent.click(sw[0]);
    expect(cambiar).toHaveBeenCalledWith(false);
  });

  test('con «Usar ajuste global» encendido oculta el resto', () => {
    renderConIdioma(<PanelPaginacion valor={null} usarGlobal onUsarGlobal={jest.fn()} onCambiar={jest.fn()} color="#111" />);
    expect(screen.getByRole('switch', { name: 'Usar ajuste global' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.queryByText('Estilo')).toBeNull();
    expect(document.querySelector('input[type=checkbox], select, input[type=color]')).toBeNull();
  });

  test('apagado: chips del kit, sin controles nativos, y escribe la clave', () => {
    const onCambiar = jest.fn();
    renderConIdioma(<PanelPaginacion valor={{ estilo: 'numerada' }} usarGlobal={false} onUsarGlobal={jest.fn()} onCambiar={onCambiar} color="#111" />);
    expect(document.querySelector('input[type=checkbox], select, input[type=color]')).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: /Cargar más/ }));
    expect(onCambiar).toHaveBeenLastCalledWith({ estilo: 'cargar_mas' });
    fireEvent.click(screen.getAllByRole('radio', { name: 'Fijar color' })[0]);
    expect(onCambiar).toHaveBeenLastCalledWith({ estilo: 'numerada', colorActivo: '#111' });
  });

  test('«Sigue el tema» quita el color guardado', () => {
    const onCambiar = jest.fn();
    renderConIdioma(<PanelPaginacion valor={{ colorActivo: '#ff0000' }} onCambiar={onCambiar} color="#111" />);
    fireEvent.click(screen.getAllByRole('radio', { name: 'Sigue el tema' })[0]);
    expect(onCambiar).toHaveBeenLastCalledWith({});
  });
});

describe('PanelCarrusel (kit)', () => {
  test('«Ítems por avance» ya no se pinta; lo guardado sale en anteriores', () => {
    const onCambiar = jest.fn();
    renderConIdioma(<PanelCarrusel valor={{ avance: 2, loop: true }} onCambiar={onCambiar} />);
    expect(screen.queryByLabelText('Ítems por avance')).toBeNull();
    expect(screen.getByText('Ítems por avance')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Quitar' }));
    expect(onCambiar).toHaveBeenLastCalledWith({ loop: true });
  });
});

describe('capa de la portada al subir la primera imagen', () => {
  test('100 sin imagen → 70 al subir la primera', () => {
    expect(capaAlSubirPrimeraImagen('hero', 'fullscreen', { overlay_opacity: 100 }, { overlay_opacity: 100, image_url: 'a.jpg' }).overlay_opacity).toBe(70);
  });
  test('no toca otros valores, otras variantes ni si ya había imagen', () => {
    expect(capaAlSubirPrimeraImagen('hero', 'fullscreen', { overlay_opacity: 40 }, { overlay_opacity: 40, image_url: 'a.jpg' }).overlay_opacity).toBe(40);
    expect(capaAlSubirPrimeraImagen('hero', 'carousel', { overlay_opacity: 100 }, { overlay_opacity: 100, image_url: 'a.jpg' }).overlay_opacity).toBe(100);
    expect(capaAlSubirPrimeraImagen('hero', 'fullscreen', { overlay_opacity: 100, image_url: 'a.jpg' }, { overlay_opacity: 100, image_url: 'b.jpg' }).overlay_opacity).toBe(100);
  });
});
