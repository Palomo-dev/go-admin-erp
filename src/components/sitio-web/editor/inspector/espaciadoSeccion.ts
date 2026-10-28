/**
 * Espaciado y ancho de una sección: una sola opción por función (Figma v2,
 * pestaña Estilo › Espaciado y Ancho). Los campos sueltos de versiones
 * anteriores (relleno y margen por lado, «Ancho completo de pantalla», ancho del
 * contenido) ya no se pintan en Diseño; si la sección los tiene guardados, la
 * tienda los sigue aplicando y salen en «Ajustes de versiones anteriores».
 */
import type { ContentFieldDef } from '@/lib/services/websitePageBuilderService';
import type { EntradaAnterior } from './anterioresLogica';

/** Campos del catálogo que ya no se pintan: su función la cubre Estilo › Espaciado / Ancho. */
export function campoCubiertoPorEstilo(c: Pick<ContentFieldDef, 'key' | 'type'>, tipoSeccion: string): boolean {
  if (c.type === 'spacing') return true;
  if (c.key === 'full_bleed' || c.key === 'container_width') return true;
  // `categories_grid.full_width`: la tienda no lo lee (sin efecto); el ancho lo da Estilo › Ancho.
  return c.key === 'full_width' && tipoSeccion === 'categories_grid';
}

const GRUPOS: ReadonlyArray<{ id: string; claves: readonly string[]; motivo?: EntradaAnterior['motivo']; solo?: string }> = [
  { id: 'seccion_padding_top', claves: ['padding_top', 'padding_top_px'], motivo: 'mandaEspaciado' },
  { id: 'seccion_padding_bottom', claves: ['padding_bottom', 'padding_bottom_px'], motivo: 'mandaEspaciado' },
  { id: 'seccion_padding_x', claves: ['padding_x'] },
  { id: 'seccion_margin_top', claves: ['margin_top'] },
  { id: 'seccion_margin_bottom', claves: ['margin_bottom'] },
  { id: 'seccion_full_bleed', claves: ['full_bleed'], motivo: 'mandaAncho' },
  { id: 'seccion_container_width', claves: ['container_width'], motivo: 'mandaAncho' },
  { id: 'seccion_full_width', claves: ['full_width'], motivo: 'sinEfecto', solo: 'categories_grid' },
];

const presente = (v: unknown) => v !== undefined && v !== null && v !== '';

/** Entradas «Ajustes de versiones anteriores» de una sección (solo las que tienen valor guardado). */
export function entradasAnterioresSeccion(contenido: Record<string, unknown>, tipoSeccion: string): EntradaAnterior[] {
  const salida: EntradaAnterior[] = [];
  for (const g of GRUPOS) {
    if (g.solo && g.solo !== tipoSeccion) continue;
    if (!g.claves.some((k) => presente(contenido[k]))) continue;
    salida.push({ id: g.id, quitar: Object.fromEntries(g.claves.map((k) => [k, null])), ...(g.motivo ? { motivo: g.motivo } : {}) });
  }
  return salida;
}

/** Aplica un cambio de «Quitar»: `null` borra la clave del contenido. */
export function aplicarCambioContenido(contenido: Record<string, unknown>, cambio: Record<string, unknown>): Record<string, unknown> {
  const siguiente = { ...contenido };
  for (const [k, v] of Object.entries(cambio)) {
    if (v === null || v === undefined) delete siguiente[k];
    else siguiente[k] = v;
  }
  return siguiente;
}

const IMAGENES_PORTADA = ['image_url', 'image_url_mobile'];
const conImagen = (c: Record<string, unknown>) => IMAGENES_PORTADA.some((k) => typeof c[k] === 'string' && (c[k] as string).trim() !== '');

/**
 * Portada «Pantalla completa»: sin imagen la capa se ve al 100 (D4). Si quedó guardada en 100 y se
 * sube la primera imagen, baja sola a 70 (el default con imagen) para que la foto se vea.
 */
export function capaAlSubirPrimeraImagen(
  tipo: string,
  variante: string | null | undefined,
  antes: Record<string, unknown>,
  despues: Record<string, unknown>,
): Record<string, unknown> {
  if (tipo !== 'hero' || variante !== 'fullscreen') return despues;
  if (conImagen(antes) || !conImagen(despues)) return despues;
  if (Number(despues.overlay_opacity) !== 100) return despues;
  return { ...despues, overlay_opacity: 70 };
}
