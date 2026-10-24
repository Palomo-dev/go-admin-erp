/** @jest-environment jsdom */
import { fireEvent, render, screen } from '@testing-library/react';
import { Select } from '../Select';

const opciones = [
  { valor: 'legacy', etiqueta: 'Actual' },
  { valor: 'circle', etiqueta: 'Círculos' },
  { valor: 'blocked', etiqueta: 'No disponible', deshabilitada: true },
];

describe('Select del sistema v2', () => {
  it('muestra el valor inicial sin guardar cambios al montar ni al recorrer el foco', () => {
    const cambiar = jest.fn();
    render(<Select valor="legacy" onValorChange={cambiar} opciones={opciones} aria-label="Diseño" />);
    const trigger = screen.getByRole('combobox', { name: 'Diseño' });
    expect(trigger.textContent).toContain('Actual');
    fireEvent.focus(trigger);
    fireEvent.blur(trigger);
    expect(cambiar).not.toHaveBeenCalled();
  });

  it('abre con teclado, elige una opción y comunica únicamente esa edición', () => {
    const cambiar = jest.fn();
    render(<Select valor="legacy" onValorChange={cambiar} opciones={opciones} aria-label="Diseño" />);
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowDown' });
    fireEvent.click(screen.getByRole('option', { name: 'Círculos' }));
    expect(cambiar).toHaveBeenCalledTimes(1);
    expect(cambiar).toHaveBeenLastCalledWith('circle');
  });

  it('Escape cierra la lista sin editar ni propagar la tecla al editor', () => {
    const cambiar = jest.fn();
    const escapar = jest.fn();
    render(<div onKeyDown={(evento) => { if (evento.key === 'Escape') escapar(); }}><Select valor="legacy" onValorChange={cambiar} opciones={opciones} aria-label="Diseño" /></div>);
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowDown' });
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(cambiar).not.toHaveBeenCalled();
    expect(escapar).not.toHaveBeenCalled();
  });

  it('conserva etiqueta/error y tamaño compacto; deshabilitado no abre', () => {
    render(<Select valor="legacy" onValorChange={jest.fn()} opciones={opciones} id="diseno" aria-describedby="error" aria-invalid tamano="sm" disabled aria-label="Diseño" />);
    const trigger = screen.getByRole('combobox');
    expect(trigger.getAttribute('aria-describedby')).toBe('error');
    expect(trigger.getAttribute('aria-invalid')).toBe('true');
    expect(trigger.className).toContain('h-8');
    expect((trigger as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(trigger);
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});
