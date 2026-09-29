/**
 * @jest-environment jsdom
 *
 * Kit · `DocumentoLineas` con productos por peso o medida
 * (PRODUCTOS-POR-PESO-BASCULA.md §9), en los cuatro idiomas: cada línea usa
 * sus decimales y su unidad («0,735 kg», precio «/ kg»), la línea recién
 * agregada de un producto por kg acepta 0,735 y las líneas por unidad siguen
 * siendo enteras.
 */
import { fireEvent, screen } from '@testing-library/react';
import { DocumentoLineas } from '../documento/DocumentoLineas';
import type { LineaDocumento } from '../documento/documentoLineasLogica';
import { renderConIdioma, type IdiomaPrueba } from '@/test-utils/renderConIdioma';

const QUESO: LineaDocumento = {
  id: 'q',
  descripcion: 'Queso campesino',
  cantidad: 0.735,
  unidad: 'kg',
  decimalesCantidad: 3,
  precioUnitario: 18900,
  total: 13891.5,
};
const GASEOSA: LineaDocumento = { id: 'g', descripcion: 'Gaseosa', cantidad: 2, precioUnitario: 3000, total: 6000 };

const IDIOMAS: Array<[IdiomaPrueba, string, RegExp, RegExp]> = [
  ['es', '0,735', /Cantidad de Queso campesino en kg/, /Precio de Queso campesino por kg/],
  ['en', '0.735', /Quantity of Queso campesino in kg/, /Price of Queso campesino per kg/],
  ['fr', '0,735', /Quantité de Queso campesino en kg/, /Prix de Queso campesino par kg/],
  ['pt', '0,735', /Quantidade de Queso campesino em kg/, /Preço de Queso campesino por kg/],
];

describe('DocumentoLineas · lectura con productos por peso', () => {
  test.each(IDIOMAS)('%s: «0,735 kg» y el precio «/ kg»; la línea por unidad sigue entera', (idioma, cantidad) => {
    const { container } = renderConIdioma(<DocumentoLineas lineas={[QUESO, GASEOSA]} modo="lectura" moneda="COP" />, { idioma });
    const texto = (container.textContent ?? '').replace(/[  ]/g, ' ');
    expect(texto).toContain(cantidad);
    expect(texto).toContain('kg');
    expect(texto).toMatch(/18[.,\s]?900(,00|\.00)? \/ kg/);
    // La línea por unidad no hereda los 3 decimales del queso.
    expect(texto).not.toMatch(/2[.,]000/);
  });
});

describe('DocumentoLineas · edición con productos por peso', () => {
  test.each(IDIOMAS)('%s: el campo dice «kg», acepta 0,735 y el precio lleva «/ kg»', (idioma, _c, etiquetaCantidad, etiquetaPrecio) => {
    const onCambiar = jest.fn();
    const recien = { ...QUESO, cantidad: 0 };
    renderConIdioma(<DocumentoLineas lineas={[recien, GASEOSA]} modo="edicion" moneda="COP" onCambiar={onCambiar} />, { idioma });
    const campo = screen.getAllByLabelText(etiquetaCantidad)[0] as HTMLInputElement;
    // Recién agregada: vacía (no «0»), con el ejemplo de los decimales y teclado decimal.
    expect(campo.value).toBe('');
    expect(campo.getAttribute('inputmode')).toBe('decimal');
    expect(campo.getAttribute('placeholder')).toBe(idioma === 'en' ? '0.000' : '0,000');
    fireEvent.focus(campo);
    fireEvent.change(campo, { target: { value: '0,735' } });
    expect(onCambiar).toHaveBeenLastCalledWith('q', { cantidad: 0.735 });
    expect(screen.getAllByLabelText(etiquetaPrecio).length).toBeGreaterThan(0);
  });

  test('la línea por unidad no acepta decimales (sigue entera)', () => {
    const onCambiar = jest.fn();
    renderConIdioma(<DocumentoLineas lineas={[QUESO, GASEOSA]} modo="edicion" moneda="COP" onCambiar={onCambiar} />);
    const campo = screen.getAllByLabelText('Cantidad de Gaseosa')[0] as HTMLInputElement;
    expect(campo.getAttribute('inputmode')).toBe('numeric');
    fireEvent.focus(campo);
    fireEvent.change(campo, { target: { value: '1,5' } });
    expect(onCambiar).not.toHaveBeenCalled();
  });
});

describe('DocumentoLineas · recepción parcial por peso', () => {
  test('pedida y pendiente con la unidad; «Recibida» acepta 0,5 de 1,250 kg', () => {
    const onCambiar = jest.fn();
    const linea: LineaDocumento = { ...QUESO, cantidad: 1.25, cantidadPendiente: 1.25, cantidadRecibida: null };
    const { container } = renderConIdioma(<DocumentoLineas lineas={[linea]} modo="recepcion" moneda="COP" onCambiar={onCambiar} />);
    expect(container.textContent).toContain('1,250 kg');
    const campo = screen.getAllByLabelText(/Cantidad recibida de Queso campesino, hasta 1,250 kg/)[0] as HTMLInputElement;
    fireEvent.focus(campo);
    fireEvent.change(campo, { target: { value: '0,5' } });
    expect(onCambiar).toHaveBeenLastCalledWith('q', { cantidadRecibida: 0.5 });
  });
});
