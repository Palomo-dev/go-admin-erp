/**
 * Navegación con flechas en grupos de opciones (SegmentedControl): patrón
 * WAI-ARIA de radiogroup con foco itinerante. Salta las opciones deshabilitadas
 * y da la vuelta en los extremos.
 */
export function indiceSiguiente(
  actual: number,
  total: number,
  tecla: string,
  deshabilitados: readonly boolean[] = [],
): number | null {
  if (total <= 0) return null;
  const habilitado = (i: number) => !deshabilitados[i];
  const buscar = (desde: number, paso: 1 | -1): number | null => {
    for (let n = 1; n <= total; n++) {
      const i = (((desde + paso * n) % total) + total) % total;
      if (habilitado(i)) return i;
    }
    return null;
  };
  switch (tecla) {
    case 'ArrowRight':
    case 'ArrowDown':
      return buscar(actual, 1);
    case 'ArrowLeft':
    case 'ArrowUp':
      return buscar(actual, -1);
    case 'Home':
      return buscar(-1, 1);
    case 'End':
      return buscar(total, -1);
    default:
      return null;
  }
}
