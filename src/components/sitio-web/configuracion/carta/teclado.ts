import type { KeyboardEvent } from 'react';

/** Alt + ↑/↓ mueve una fila arrastrable (la alternativa de teclado al arrastre). */
export function moverConTeclado(e: KeyboardEvent, onMover: (direccion: -1 | 1) => void): void {
  if (!e.altKey) return;
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    onMover(-1);
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    onMover(1);
  }
}
