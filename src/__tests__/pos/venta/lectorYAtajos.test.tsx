/**
 * @jest-environment jsdom
 *
 * Lector de códigos y atajos (POS-PLAN R4, D10): una ráfaga de 13 dígitos +
 * Enter es un escaneo y cero atajos; con un diálogo abierto el escaneo se
 * descarta y la pantalla puede avisarlo.
 */
import { render } from '@testing-library/react';
import { hayRafagaDelLector, useHardwareBarcodeScanner } from '@/hooks/useHardwareBarcodeScanner';
import { useAtajos } from '@/components/kit/useAtajos';

function Pantalla({ onScan, onDescartado, onAtajo }: { onScan: (c: string) => void; onDescartado?: (c: string) => void; onAtajo: (t: string) => void }) {
  useHardwareBarcodeScanner({ onScan, onDescartado });
  useAtajos(
    [
      { tecla: 'D', accion: () => onAtajo('D'), descripcion: 'descuento' },
      { tecla: '7', accion: () => onAtajo('7'), descripcion: 'siete' },
      { tecla: 'Enter', accion: () => onAtajo('Enter'), descripcion: 'enter' },
    ],
    { hayRafaga: hayRafagaDelLector },
  );
  return <div>pantalla</div>;
}

function teclear(teclas: string[]) {
  for (const key of teclas) {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  }
}

describe('lector de códigos frente a los atajos', () => {
  test('13 dígitos + Enter: un escaneo y ningún atajo después del primer dígito', () => {
    const onScan = jest.fn();
    const onAtajo = jest.fn();
    render(<Pantalla onScan={onScan} onAtajo={onAtajo} />);
    teclear([...'7701234567890'.split(''), 'Enter']);
    expect(onScan).toHaveBeenCalledWith('7701234567890');
    // El primer «7» todavía no es ráfaga (una persona pulsando 7); desde el segundo, sí.
    expect(onAtajo.mock.calls.map((c) => c[0])).toEqual(['7']);
  });

  test('una tecla suelta sí es un atajo', () => {
    const onAtajo = jest.fn();
    render(<Pantalla onScan={jest.fn()} onAtajo={onAtajo} />);
    teclear(['D']);
    expect(onAtajo).toHaveBeenCalledWith('D');
    expect(hayRafagaDelLector()).toBe(false);
  });

  test('con un diálogo abierto el escaneo no llega al carrito y se avisa', () => {
    const onScan = jest.fn();
    const onDescartado = jest.fn();
    const dialogo = document.createElement('div');
    dialogo.setAttribute('role', 'dialog');
    dialogo.setAttribute('data-state', 'open');
    document.body.appendChild(dialogo);
    render(<Pantalla onScan={onScan} onDescartado={onDescartado} onAtajo={jest.fn()} />);
    teclear([...'7701234567890'.split(''), 'Enter']);
    expect(onScan).not.toHaveBeenCalled();
    expect(onDescartado).toHaveBeenCalledWith('7701234567890');
    dialogo.remove();
  });
});
