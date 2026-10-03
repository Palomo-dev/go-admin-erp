/** @jest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Stepper } from '../Stepper';
const pasos = [{ valor: 'one', etiqueta: 'Identidad' }, { valor: 'two', etiqueta: 'Guion' }, { valor: 'three', etiqueta: 'Voz' }];
const resumenMovil = (n: number, total: number) => `Paso ${n} de ${total}`;
afterEach(cleanup);
it('las píldoras permiten volver sólo a pasos completados y bloquean acciones en vuelo', () => {
  const select = jest.fn(), view = render(<Stepper pasos={pasos} actual="two" formato="chips" etiqueta="Editor" resumenMovil={resumenMovil} onPasoClick={select} />);
  expect(screen.getAllByRole('listitem')).toHaveLength(3);
  expect(document.querySelector('[aria-current="step"]')?.textContent).toContain('Guion');
  expect(screen.queryByRole('button', { name: 'Voz' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Identidad' })); expect(select).toHaveBeenCalledWith('one');
  view.rerender(<Stepper pasos={pasos} actual="two" formato="chips" deshabilitado etiqueta="Editor" resumenMovil={resumenMovil} onPasoClick={select} />);
  fireEvent.click(screen.getByRole('button', { name: 'Identidad' })); expect(select).toHaveBeenCalledTimes(1);
});
it('el formato por defecto conserva el resumen móvil y el avance lineal', () => {
  const view = render(<Stepper pasos={pasos} actual="one" etiqueta="Editor" resumenMovil={resumenMovil} />);
  expect(screen.getByText('Paso 1 de 3')).toBeTruthy();
  expect(view.container.querySelector('[style]')?.getAttribute('style')).toContain('33.333');
});
