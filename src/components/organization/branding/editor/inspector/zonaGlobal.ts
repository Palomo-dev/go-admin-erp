import type { DevicePreview } from '../EditorHeader';

/**
 * Zonas globales del editor de páginas (Figma «16 Sitio web › 05 Editor»):
 * el encabezado y el pie no son secciones de la página; los comparten todas.
 * El lienzo las identifica con `data-section-id="header"|"footer"` y avisa por
 * el mismo canal `goadmin:select` que las secciones (PreviewBridge del sitio).
 */
export type ZonaGlobal = 'header' | 'footer';

export type PestanaInspector = 'diseno' | 'contenido' | 'estilo' | 'celular';

export const PESTANAS_INSPECTOR: readonly { valor: PestanaInspector; etiqueta: string }[] = [
  { valor: 'diseno', etiqueta: 'Diseño' },
  { valor: 'contenido', etiqueta: 'Contenido' },
  { valor: 'estilo', etiqueta: 'Estilo' },
  { valor: 'celular', etiqueta: 'Celular' },
];

export const TITULO_ZONA: Record<ZonaGlobal, string> = {
  header: 'Encabezado',
  footer: 'Pie de página',
};

/** Fila fija de la lista de secciones. */
export const ETIQUETA_FILA_ZONA: Record<ZonaGlobal, string> = {
  header: 'Encabezado (global)',
  footer: 'Pie de página (global)',
};

/** ¿El id que llega del lienzo es una zona global y no una sección? */
export function esZonaGlobal(id: unknown): id is ZonaGlobal {
  return id === 'header' || id === 'footer';
}

/**
 * Pestaña con la que abre el inspector: con el lienzo en celular, «Celular»
 * (lo que se está mirando es el menú móvil); si no, «Diseño».
 */
export function pestanaInicialZona(dispositivo: DevicePreview): PestanaInspector {
  return dispositivo === 'mobile' ? 'celular' : 'diseno';
}
