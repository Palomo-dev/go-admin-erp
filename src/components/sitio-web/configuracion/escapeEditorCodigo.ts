/** Qué hace Escape con el foco dentro del editor de código a medida. */
export type AccionEscapeEditor = 'ignorar' | 'cerrar-panel' | 'salir';

/**
 * Escape sale del editor y no cierra el diálogo. Si el panel de búsqueda está
 * abierto, el primer Escape lo cierra CodeMirror y el foco se queda en el código.
 */
export function accionEscapeEditor(opciones: {
  tecla: string;
  activo: EventTarget | null;
  raiz: HTMLElement | null;
  panelAbierto: boolean;
}): AccionEscapeEditor {
  if (opciones.tecla !== 'Escape') return 'ignorar';
  const { activo, raiz } = opciones;
  if (!raiz || !(activo instanceof Node) || !raiz.contains(activo)) return 'ignorar';
  if (opciones.panelAbierto) return 'cerrar-panel';
  return 'salir';
}
