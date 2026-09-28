/** Debounce sin dependencias, con cancelar y ejecutar ya (Enter en el buscador). */
export interface Debounced<A extends unknown[]> {
  llamar: (...args: A) => void;
  cancelar: () => void;
  /** Ejecuta ya la llamada pendiente, si la hay. */
  ejecutarYa: () => void;
}

export function crearDebounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): Debounced<A> {
  let temporizador: ReturnType<typeof setTimeout> | null = null;
  let pendientes: A | null = null;

  const cancelar = () => {
    if (temporizador) clearTimeout(temporizador);
    temporizador = null;
    pendientes = null;
  };

  const ejecutarYa = () => {
    if (!pendientes) return;
    const args = pendientes;
    cancelar();
    fn(...args);
  };

  const llamar = (...args: A) => {
    pendientes = args;
    if (temporizador) clearTimeout(temporizador);
    temporizador = setTimeout(ejecutarYa, ms);
  };

  return { llamar, cancelar, ejecutarYa };
}
