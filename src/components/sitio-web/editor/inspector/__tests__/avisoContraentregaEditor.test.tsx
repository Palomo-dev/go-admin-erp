/**
 * @jest-environment jsdom
 *
 * Aviso de contraentrega (Figma 3071:82659 / 3071:83099 / 3073:83567): un solo dato,
 * `header_carrito.avisoContraentrega`, con dos puntos de acceso (Encabezado › Carrito y la ficha
 * del producto). Apagado por defecto; abrir no escribe; apagar lo último deja la tienda de hoy.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { GrupoAvisoContraentrega, InterruptorAvisoFicha, RUTA_CONDICIONES_CONTRAENTREGA } from '../AvisoContraentregaEditor';
import { cambioAvisoContraentrega } from '../cabeceraTiendaLogica';

jest.mock('next-intl', () => ({
  useLocale: () => 'es',
  useTranslations: () => Object.assign((key: string) => key, { has: () => false }),
}));

describe('cambioAvisoContraentrega', () => {
  test('encender guarda true; apagar quita la clave; apagar lo último deja header_carrito vacío', () => {
    expect(cambioAvisoContraentrega({}, 'carrito', true)).toEqual({ header_carrito: { avisoContraentrega: { carrito: true } } });
    const ambos = { header_carrito: { titulo: 'Mi bolsa', avisoContraentrega: { carrito: true, ficha: true } } };
    expect(cambioAvisoContraentrega(ambos, 'carrito', false)).toEqual({ header_carrito: { titulo: 'Mi bolsa', avisoContraentrega: { ficha: true } } });
    expect(cambioAvisoContraentrega({ header_carrito: { avisoContraentrega: { ficha: true } } }, 'ficha', false)).toEqual({ header_carrito: null });
  });
});

describe('Encabezado › Carrito › Aviso de contraentrega', () => {
  test('apagado por defecto, sin vista previa, y abrir no escribe', () => {
    const cambiar = jest.fn();
    render(<GrupoAvisoContraentrega ajustes={{}} cambiar={cambiar} enBorrador />);
    expect(cambiar).not.toHaveBeenCalled();
    expect(screen.getByRole('switch', { name: /carrito\.titulo/ }).getAttribute('aria-checked')).toBe('false');
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(document.querySelector('[data-vista-previa-aviso]')).toBeNull();
    expect(screen.getByRole('link', { name: /enlaceCondiciones/ }).getAttribute('href')).toBe(RUTA_CONDICIONES_CONTRAENTREGA);
  });

  test('encenderlo escribe solo el carrito y conserva la ficha', () => {
    const cambiar = jest.fn();
    render(<GrupoAvisoContraentrega ajustes={{ header_carrito: { avisoContraentrega: { ficha: true } } }} cambiar={cambiar} enBorrador />);
    expect(screen.getByRole('switch', { name: /carrito\.titulo/ }).getAttribute('aria-checked')).toBe('false');
    fireEvent.click(screen.getByRole('switch', { name: /carrito\.titulo/ }));
    expect(cambiar).toHaveBeenLastCalledWith({ header_carrito: { avisoContraentrega: { ficha: true, carrito: true } } });
  });

  test('encendido muestra solo la vista previa del carrito', () => {
    render(<GrupoAvisoContraentrega ajustes={{ header_carrito: { avisoContraentrega: { carrito: true, ficha: true } } }} cambiar={jest.fn()} enBorrador />);
    expect(screen.getByText('vistaPrevia.linea.carrito')).toBeTruthy();
    expect(screen.queryByText('vistaPrevia.linea.ficha')).toBeNull();
  });

  test('sin borrador avisa que se guarda al pasar al borrador nuevo', () => {
    render(<GrupoAvisoContraentrega ajustes={{}} cambiar={jest.fn()} enBorrador={false} />);
    expect(screen.getByText('soloBorrador')).toBeTruthy();
  });
});

describe('Ficha › Información del producto › Aviso de contraentrega', () => {
  test('encenderlo escribe la ficha y conserva el carrito', () => {
    const cambiar = jest.fn();
    const ajustes = { header_carrito: { avisoContraentrega: { carrito: true } } };
    render(<InterruptorAvisoFicha ajustes={ajustes} cambiar={cambiar} enBorrador />);
    const interruptor = screen.getByRole('switch', { name: /ficha\.titulo/ });
    expect(interruptor.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(interruptor);
    expect(cambiar).toHaveBeenLastCalledWith({ header_carrito: { avisoContraentrega: { carrito: true, ficha: true } } });
  });

  test('encendido pinta la vista previa en vivo; apagarlo quita solo la ficha', () => {
    const cambiar = jest.fn();
    render(<InterruptorAvisoFicha ajustes={{ header_carrito: { avisoContraentrega: { carrito: true, ficha: true } } }} cambiar={cambiar} enBorrador />);
    expect(screen.getByText('vistaPrevia.linea.ficha')).toBeTruthy();
    expect(screen.queryByText('vistaPrevia.linea.carrito')).toBeNull();
    fireEvent.click(screen.getByRole('switch', { name: /ficha\.titulo/ }));
    expect(cambiar).toHaveBeenLastCalledWith({ header_carrito: { avisoContraentrega: { carrito: true } } });
  });
});
