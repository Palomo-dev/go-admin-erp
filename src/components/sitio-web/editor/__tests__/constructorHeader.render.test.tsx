/** @jest-environment jsdom */
import { fireEvent, screen } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import { ConstructorEncabezado } from '../inspector/ConstructorEncabezado';
import { CelularEncabezado } from '../inspector/CelularEncabezado';
import { leerConstructor } from '@/lib/website/constructorEncabezado';

describe('controles del encabezado con el kit v2', () => {
  test('abrir y navegar entre dispositivos no modifica el documento', () => {
    const cambiar = jest.fn();
    const { container } = renderConIdioma(<ConstructorEncabezado ajustes={{}} cambiar={cambiar} acento="#123456" />);
    fireEvent.click(screen.getByRole('button', { name: 'Celular' }));
    fireEvent.click(screen.getByRole('button', { name: 'Escritorio' }));
    expect(cambiar).not.toHaveBeenCalled();
    expect(container.querySelector('select')).toBeNull();
    expect(screen.getAllByRole('combobox').length).toBeGreaterThan(3);
  });

  test('borde, sombra, ícono y posición están configurados y no escriben al montar', () => {
    const cambiar = jest.fn();
    const ajustes = { header_builder: { search: { type: 'outlined', border: 'thick', radius: 'square', icon: 'scan-search', icon_side: 'right', shadow: true } } };
    renderConIdioma(<ConstructorEncabezado ajustes={ajustes} cambiar={cambiar} acento="#123456" />);
    expect(screen.getByRole('combobox', { name: 'Borde del buscador' }).textContent).toContain('Grueso');
    expect(screen.getByRole('combobox', { name: 'Posición del ícono' }).textContent).toContain('Derecha');
    expect(screen.getByRole('combobox', { name: 'Ícono del buscador' }).textContent).toContain('Escanear');
    expect(cambiar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('switch', { name: 'Sombra del buscador' }));
    expect(cambiar).toHaveBeenLastCalledWith({ header_builder: { search: { ...ajustes.header_builder.search, shadow: false } } });
  });

  test('la pestaña móvil ofrece dropdown superior y lados sin controles antiguos', () => {
    const cambiar = jest.fn();
    const { container } = renderConIdioma(<CelularEncabezado ajustes={{ mobile_menu_style: 'top_dropdown' }} cambiar={cambiar} acento="#123456" />);
    expect(screen.getByRole('combobox', { name: 'Forma de abrir' }).textContent).toContain('Cortina desde arriba');
    expect(container.querySelector('select')).toBeNull();
    expect(cambiar).not.toHaveBeenCalled();
  });

  test('el contrato conserva defaults y admite los seis diseños de barra', () => {
    expect(leerConstructor({})).toBeNull();
    expect(leerConstructor({ search_style: 'bar' })).toBeNull();
    for (const type of ['bar', 'mini', 'mega', 'pill_floating', 'outlined', 'underline']) {
      const builder = leerConstructor({ header_builder: { search: { type } } });
      expect(builder?.buscador?.tipo).toBe(type);
      expect(builder?.buscador?.mobile).toBe('bar');
    }
  });
});
