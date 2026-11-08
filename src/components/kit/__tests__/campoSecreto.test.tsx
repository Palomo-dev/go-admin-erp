/**
 * @jest-environment jsdom
 *
 * CampoSecreto: ojo «Mostrar»/«Ocultar» para verificar una llave pegada (pedido del dueño,
 * 2026-11-07, en «Conectar Wompi · Paso 3 de 5»). No se autocompleta, no pierde el foco ni el
 * cursor y nada se precarga.
 */
import { useState } from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import { CampoSecreto, FormField } from '@/components/kit';

function Prueba({ inicial = '' }: { inicial?: string }) {
  const [v, setV] = useState(inicial);
  return (
    <FormField etiqueta="Llave privada" obligatorio>
      <CampoSecreto valor={v} onValor={setV} />
    </FormField>
  );
}

test('oculto por defecto, sin autocompletar ni corrector, y enlazado a su etiqueta', () => {
  renderConIdioma(<Prueba />);
  const campo = screen.getByLabelText(/Llave privada/) as HTMLInputElement;
  expect(campo.type).toBe('password');
  expect(campo.value).toBe('');
  expect(campo.getAttribute('autocomplete')).toBe('off');
  expect(campo.getAttribute('spellcheck')).toBe('false');
  expect(campo.getAttribute('aria-required')).toBe('true');
});

test('«Mostrar» enseña lo escrito y «Ocultar» lo vuelve a tapar, con aria-pressed', () => {
  renderConIdioma(<Prueba />);
  const campo = screen.getByLabelText(/Llave privada/) as HTMLInputElement;
  fireEvent.change(campo, { target: { value: 'prv_prod_FALSO' } });
  const boton = screen.getByRole('button', { name: 'Mostrar' });
  expect(boton.getAttribute('aria-pressed')).toBe('false');
  expect(boton.getAttribute('aria-controls')).toBe(campo.id);
  fireEvent.click(boton);
  expect(campo.type).toBe('text');
  expect(campo.value).toBe('prv_prod_FALSO');
  const ocultar = screen.getByRole('button', { name: 'Ocultar' });
  expect(ocultar.getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(ocultar);
  expect(campo.type).toBe('password');
});

test('con el ratón el foco y el cursor se quedan en el campo', () => {
  renderConIdioma(<Prueba inicial="abcdef" />);
  const campo = screen.getByLabelText(/Llave privada/) as HTMLInputElement;
  campo.focus();
  campo.setSelectionRange(3, 3);
  const boton = screen.getByRole('button', { name: 'Mostrar' });
  const bajada = fireEvent.mouseDown(boton);
  expect(bajada).toBe(false); // preventDefault: el botón no roba el foco
  fireEvent.click(boton);
  expect(document.activeElement).toBe(campo);
  expect(campo.selectionStart).toBe(3);
});
