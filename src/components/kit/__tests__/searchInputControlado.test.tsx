/**
 * @jest-environment jsdom
 *
 * Kit · `SearchInput` controlado: la pantalla guarda cada tecla (`onValueChange`)
 * en el mismo estado que pasa como `value`. Ese eco NO es un cambio externo: la
 * búsqueda con debounce (`onChange`) tiene que llegar. Antes el eco cancelaba el
 * debounce y `onChange` no llegaba nunca: en el selector de clientes del POS se
 * escribía «pepe» y seguía la lista completa («Mostrando 20 de 1.467»).
 */
import { useState } from 'react';
import { act, fireEvent, screen } from '@testing-library/react';
import { SearchInput } from '../SearchInput';
import { SelectorEntidad } from '../SelectorEntidad';
import { User } from 'lucide-react';
import { renderConIdioma } from '@/test-utils/renderConIdioma';

function Controlado({ onBuscar }: { onBuscar: (v: string) => void }) {
  const [texto, setTexto] = useState('');
  return <SearchInput value={texto} onValueChange={setTexto} onChange={onBuscar} debounceMs={300} placeholder="Buscar" />;
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('SearchInput con value controlado por onValueChange', () => {
  it('la búsqueda con debounce llega con el texto escrito', () => {
    const onBuscar = jest.fn();
    renderConIdioma(<Controlado onBuscar={onBuscar} />);
    const input = screen.getByPlaceholderText('Buscar');
    fireEvent.change(input, { target: { value: 'pe' } });
    fireEvent.change(input, { target: { value: 'pepe' } });
    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(onBuscar).toHaveBeenCalledTimes(1);
    expect(onBuscar).toHaveBeenLastCalledWith('pepe');
  });

  it('Enter busca ya con el texto escrito', () => {
    const onBuscar = jest.fn();
    renderConIdioma(<Controlado onBuscar={onBuscar} />);
    const input = screen.getByPlaceholderText('Buscar');
    fireEvent.change(input, { target: { value: 'ana' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onBuscar).toHaveBeenLastCalledWith('ana');
  });

  it('un cambio de verdad desde fuera sigue cancelando la búsqueda pendiente', () => {
    const onBuscar = jest.fn();
    function ConReinicio() {
      const [texto, setTexto] = useState('');
      return (
        <>
          <SearchInput value={texto} onValueChange={() => undefined} onChange={onBuscar} debounceMs={300} placeholder="Buscar" />
          <button type="button" onClick={() => setTexto('otro')}>reiniciar</button>
        </>
      );
    }
    renderConIdioma(<ConReinicio />);
    fireEvent.change(screen.getByPlaceholderText('Buscar'), { target: { value: 'pepe' } });
    fireEvent.click(screen.getByText('reiniciar'));
    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(onBuscar).not.toHaveBeenCalled();
    expect((screen.getByPlaceholderText('Buscar') as HTMLInputElement).value).toBe('otro');
  });
});

describe('SelectorEntidad busca con lo que se escribe', () => {
  it('llama a buscar con «pepe» después del debounce', async () => {
    const buscar = jest.fn(async () => ({ items: [] as { id: string; nombre: string }[], total: 0 }));
    renderConIdioma(
      <SelectorEntidad
        etiqueta="Cliente"
        valor={null}
        onCambiar={() => undefined}
        icono={User}
        buscar={buscar}
        aOpcion={(c: { id: string; nombre: string }) => ({ id: c.id, titulo: c.nombre })}
        abierto
        onAbiertoChange={() => undefined}
        debounceMs={300}
        textos={{ buscar: 'Buscar cliente' }}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(buscar).toHaveBeenCalledWith('', expect.anything(), expect.anything(), 0);
    fireEvent.change(screen.getByPlaceholderText('Buscar cliente'), { target: { value: 'pepe' } });
    await act(async () => {
      jest.advanceTimersByTime(300);
      await Promise.resolve();
    });
    expect(buscar).toHaveBeenLastCalledWith('pepe', expect.anything(), expect.anything(), 0);
  });
});
