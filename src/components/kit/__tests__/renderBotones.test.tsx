/**
 * @jest-environment jsdom
 *
 * Kit · render de los botones del POS (Testing Library, POS-PLAN D9): el
 * `BotonImporte` en sus estados y el `ViewToggle` que alterna en el celular.
 */
import { fireEvent, screen } from '@testing-library/react';
import { BotonImporte } from '../BotonImporte';
import { ViewToggle } from '../ViewToggle';
import { renderConIdioma } from '@/test-utils/renderConIdioma';

describe('BotonImporte (render)', () => {
  test('listo: etiqueta, importe y atajo anunciado; el clic llega', () => {
    const onClick = jest.fn();
    renderConIdioma(<BotonImporte etiqueta="Cobrar" importe="$ 12.000" atajo="F4" onClick={onClick} />);
    const boton = screen.getByRole('button', { name: /Cobrar/ });
    expect(boton.getAttribute('aria-keyshortcuts')).toBe('F4');
    expect(boton.textContent).toContain('$ 12.000');
    fireEvent.click(boton);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test('falta: deshabilitado y con el motivo visible y asociado', () => {
    renderConIdioma(<BotonImporte etiqueta="Completar venta" estado="falta" motivo="Falta $ 2.000" />);
    const boton = screen.getByRole('button', { name: /Completar venta/ }) as HTMLButtonElement;
    expect(boton.disabled).toBe(true);
    const motivo = screen.getByText('Falta $ 2.000');
    expect(boton.getAttribute('aria-describedby')).toBe(motivo.id);
  });

  test('procesando: ocupado con el texto del kit en el idioma activo', () => {
    renderConIdioma(<BotonImporte etiqueta="Completar venta" estado="procesando" />, { idioma: 'en' });
    const boton = screen.getByRole('button');
    expect(boton.getAttribute('aria-busy')).toBe('true');
    expect((boton as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('ViewToggle (render)', () => {
  test('el botón del celular propone la otra vista y la elige', () => {
    const onCambio = jest.fn();
    renderConIdioma(<ViewToggle valor="tarjetas" onValorChange={onCambio} />);
    const alternar = screen.getByRole('button', { name: /lista/i });
    fireEvent.click(alternar);
    expect(onCambio).toHaveBeenCalledWith('lista');
  });
});
