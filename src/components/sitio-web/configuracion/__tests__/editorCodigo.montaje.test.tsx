/**
 * @jest-environment jsdom
 *
 * Monta el editor real (no el doble) para comprobar el nombre accesible
 * «Código» y que CodeMirror arranca en jsdom.
 */
import { fireEvent, screen } from '@testing-library/react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';
import { PLACEHOLDER_CODIGO } from '@/lib/website/validacionCodigo';
import { EditorCodigo } from '../EditorCodigo';

describe('montaje del editor de código', () => {
  it('expone el campo con aria-label Código, números de línea y el ejemplo', () => {
    const { container } = renderConIdioma(<EditorCodigo valor="" posicion="body" onChange={() => undefined} />);
    const campo = screen.getByRole('textbox', { name: 'Código' });
    expect(campo).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pantalla completa' })).toBeTruthy();
    expect(screen.getByText(PLACEHOLDER_CODIGO)).toBeTruthy();
    expect(container.querySelector('.cm-lineNumbers')).toBeTruthy();
    expect(container.querySelector('.cm-foldGutter')).toBeTruthy();

    campo.focus();
    expect(document.activeElement).toBe(campo);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(document.activeElement).not.toBe(campo);
  });
});
