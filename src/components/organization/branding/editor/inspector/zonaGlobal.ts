import type { DispositivoInspector as DevicePreview } from '@/components/sitio-web/ui/dispositivos';

/**
 * Zonas globales del editor de páginas (Figma «16 Sitio web › 05 Editor»):
 * el encabezado y el pie no son secciones de la página; los comparten todas.
 * El lienzo las identifica con `data-section-id="header"|"footer"` y avisa por
 * el mismo canal `goadmin:select` que las secciones (PreviewBridge del sitio).
 */
export type ZonaGlobal = 'header' | 'footer';

export type PestanaInspector = 'diseno' | 'contenido' | 'estilo' | 'celular';

/** `etiqueta` es la subclave de `branding.editor.zonaGlobal.pestanas`; el inspector la traduce. */
export const PESTANAS_INSPECTOR: readonly { valor: PestanaInspector; etiqueta: string }[] = [
  { valor: 'diseno', etiqueta: 'diseno' },
  { valor: 'contenido', etiqueta: 'contenido' },
  { valor: 'estilo', etiqueta: 'estilo' },
  { valor: 'celular', etiqueta: 'celular' },
];

/** ¿El id que llega del lienzo es una zona global y no una sección? */
export function esZonaGlobal(id: unknown): id is ZonaGlobal {
  return id === 'header' || id === 'footer';
}

/**
 * Pestaña con la que abre el inspector: con el lienzo bajo el ancho en que el sitio pasa al menú
 * del celular (1024, `SiteHeader`: tableta y celular), «Celular»; si no, «Diseño».
 */
export function pestanaInicialZona(dispositivo: DevicePreview): PestanaInspector {
  return dispositivo === 'mobile' || dispositivo === 'tablet' ? 'celular' : 'diseno';
}
