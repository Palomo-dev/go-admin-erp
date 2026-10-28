/**
 * Bloque 4 (ESTILO-01/05/06/07): una sola opción por función en la pestaña «Estilo».
 *
 * Fondo, color del texto, borde y fuente se guardaban en tres sitios: Estilo (`settings.estilo`),
 * Avanzado (`content.bg_*`, `text_color`, `border_*`) y el Cascarón (`content.section_background`,
 * `section_header.title_font`), más el formato viejo `settings.bg_color` / `settings.text_color`.
 * La tienda los sigue pintando igual (nada cambia sin edición). El panel muestra UN control en
 * Estilo que LEE lo que hoy se ve (con la misma precedencia que la tienda) y, al editarlo, escribe
 * en un solo sitio y limpia los demás para que no se pisen.
 *
 * Puro: sin React ni Supabase.
 */
import { escribirEstiloSeccion, leerEstiloSeccion, type EstiloSeccion } from '@/lib/website/v2/estiloSeccion';

export const MODOS_FONDO = ['tema', 'alterno', 'oscuro', 'color', 'degradado', 'imagen'] as const;
export type ModoFondo = (typeof MODOS_FONDO)[number];
export const DIRECCIONES_DEGRADADO = ['to-r', 'to-br', 'to-b', 'to-bl', 'to-l', 'to-t', 'to-tr', 'to-tl'] as const;

export interface FondoUnico {
  modo: ModoFondo;
  color?: string;
  desde?: string;
  hasta?: string;
  direccion?: string;
  imagen?: string;
  capa?: number;
  /** Dónde está guardado hoy (para el aviso «guardado en otro sitio»). */
  origen: 'estilo' | 'avanzado' | 'cascaron' | 'anterior';
}

export interface Apariencia {
  settings: Record<string, unknown>;
  contenido: Record<string, unknown>;
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null);
const txt = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v : undefined);

const CLAVES_FONDO_AVANZADO = ['bg_type', 'bg_color', 'bg_gradient_from', 'bg_gradient_to', 'bg_gradient_dir', 'bg_image', 'bg_overlay'] as const;
const CLAVES_FONDO_CASCARON = ['color', 'gradient_1', 'gradient_2', 'gradient_angle', 'image_url', 'image_url_mobile', 'overlay_opacity'] as const;
/** Claves de Avanzado que ahora viven en Estilo (no se muestran dos veces). */
export const CLAVES_AVANZADO_EN_ESTILO: readonly string[] = [...CLAVES_FONDO_AVANZADO, 'text_color', 'border_color'];

/** Ángulo del Cascarón → dirección de Avanzado (la más cercana). */
function direccionDeAngulo(a: unknown): string {
  const n = typeof a === 'number' ? ((a % 360) + 360) % 360 : 90;
  const tabla: [number, string][] = [[0, 'to-t'], [45, 'to-tr'], [90, 'to-r'], [135, 'to-br'], [180, 'to-b'], [225, 'to-bl'], [270, 'to-l'], [315, 'to-tl'], [360, 'to-t']];
  return tabla.reduce((m, x) => (Math.abs(x[0] - n) < Math.abs(m[0] - n) ? x : m))[1];
}

/** Lo que la tienda pinta hoy, en el orden en que lo aplica (Cascarón > Avanzado > anterior > Estilo). */
export function leerFondoUnico({ settings, contenido }: Apariencia): FondoUnico {
  const sb = obj(contenido.section_background);
  if (sb) {
    if (txt(sb.image_url)) return { modo: 'imagen', imagen: sb.image_url as string, capa: typeof sb.overlay_opacity === 'number' ? sb.overlay_opacity : undefined, origen: 'cascaron' };
    if (txt(sb.gradient_1)) return { modo: 'degradado', desde: sb.gradient_1 as string, hasta: txt(sb.gradient_2) ?? (sb.gradient_1 as string), direccion: direccionDeAngulo(sb.gradient_angle), origen: 'cascaron' };
    if (txt(sb.color)) return { modo: 'color', color: sb.color as string, origen: 'cascaron' };
  }
  const tipo = contenido.bg_type;
  if (tipo === 'color' && txt(contenido.bg_color)) return { modo: 'color', color: contenido.bg_color as string, origen: 'avanzado' };
  if (tipo === 'gradient') return { modo: 'degradado', desde: txt(contenido.bg_gradient_from) ?? '#ffffff', hasta: txt(contenido.bg_gradient_to) ?? '#ffffff', direccion: txt(contenido.bg_gradient_dir) ?? 'to-r', origen: 'avanzado' };
  if (tipo === 'image' && txt(contenido.bg_image)) return { modo: 'imagen', imagen: contenido.bg_image as string, capa: typeof contenido.bg_overlay === 'number' ? contenido.bg_overlay : undefined, origen: 'avanzado' };
  if (txt(settings.bg_color)) return { modo: 'color', color: settings.bg_color as string, origen: 'anterior' };
  const e = leerEstiloSeccion(settings);
  const modo = e.fondo ?? 'tema';
  if (modo === 'imagen') return { modo, imagen: txt(contenido.bg_image), capa: typeof contenido.bg_overlay === 'number' ? contenido.bg_overlay : undefined, origen: 'estilo' };
  return { modo, origen: 'estilo' };
}

function sinClaves(o: Obj, claves: readonly string[]): Obj {
  const s = { ...o };
  for (const k of claves) delete s[k];
  return s;
}

function conEstilo(settings: Obj, parcial: Partial<EstiloSeccion>): Obj {
  const e = { ...leerEstiloSeccion(settings), ...parcial } as EstiloSeccion;
  for (const k of Object.keys(parcial) as (keyof EstiloSeccion)[]) if (parcial[k] === undefined) delete e[k];
  return escribirEstiloSeccion(settings, e);
}

/** Escribe el fondo en un solo sitio y limpia los demás. */
export function cambioFondoUnico({ settings, contenido }: Apariencia, f: Omit<FondoUnico, 'origen'>): Apariencia {
  let c = sinClaves(contenido, CLAVES_FONDO_AVANZADO);
  const sb = obj(contenido.section_background);
  if (sb) {
    const resto = sinClaves(sb, CLAVES_FONDO_CASCARON);
    c = Object.keys(resto).length ? { ...c, section_background: resto } : sinClaves(c, ['section_background']);
  }
  let s = sinClaves(settings, ['bg_color']);
  if (f.modo === 'tema' || f.modo === 'alterno' || f.modo === 'oscuro') {
    s = conEstilo(s, { fondo: f.modo });
  } else if (f.modo === 'color') {
    s = conEstilo(s, { fondo: undefined });
    c = { ...c, bg_type: 'color', bg_color: f.color ?? '#ffffff' };
  } else if (f.modo === 'degradado') {
    s = conEstilo(s, { fondo: undefined });
    c = { ...c, bg_type: 'gradient', bg_gradient_from: f.desde ?? '#ffffff', bg_gradient_to: f.hasta ?? '#ffffff', bg_gradient_dir: f.direccion ?? 'to-r' };
  } else {
    s = conEstilo(s, { fondo: 'imagen' });
    // La imagen va al fondo común (`section_background`), que además tiene imagen de celular,
    // ajuste, posición y parallax. Sin imagen todavía: queda el fondo del tema (como hoy).
    if (f.imagen) {
      const movil = sb && txt(sb.image_url_mobile) ? { image_url_mobile: sb.image_url_mobile } : {};
      const resto = obj(c.section_background) ?? {};
      c = { ...c, section_background: { ...resto, ...movil, image_url: f.imagen, ...(typeof f.capa === 'number' ? { overlay_opacity: f.capa } : {}) } };
    }
  }
  return { settings: s, contenido: c };
}

// ─── Color del texto (ESTILO-06) ─────────────────────────────────────────────

/** Lo que se ve: Avanzado (`text_color`) > anterior (`settings.text_color`) > Estilo. */
export function leerColorTextoUnico({ settings, contenido }: Apariencia): string | undefined {
  return txt(contenido.text_color) ?? txt(settings.text_color) ?? leerEstiloSeccion(settings).colores?.texto;
}
export function cambioColorTextoUnico({ settings, contenido }: Apariencia, valor: string): Apariencia {
  const e = leerEstiloSeccion(settings);
  const s = escribirEstiloSeccion(sinClaves(settings, ['text_color']), { ...e, colores: { ...e.colores, texto: valor } });
  return { settings: s, contenido: sinClaves(contenido, ['text_color']) };
}

// ─── Borde (ESTILO-07) ───────────────────────────────────────────────────────

/** Grosor del borde de la sección (0 = sin borde, como hoy). */
export function grosorBordeUnico({ contenido }: Apariencia): number {
  const n = contenido.border_width;
  return typeof n === 'number' && n > 0 ? Math.min(8, Math.round(n)) : 0;
}
export function cambioGrosorBordeUnico({ settings, contenido }: Apariencia, n: number): Apariencia {
  const g = Math.max(0, Math.min(8, Math.round(n)));
  return { settings, contenido: g > 0 ? { ...contenido, border_width: g } : sinClaves(contenido, ['border_width']) };
}
/** Un solo color de borde: Avanzado (`border_color`) > Estilo. */
export function leerColorBordeUnico({ settings, contenido }: Apariencia): string | undefined {
  return txt(contenido.border_color) ?? leerEstiloSeccion(settings).colores?.borde;
}
export function cambioColorBordeUnico({ settings, contenido }: Apariencia, valor: string): Apariencia {
  const e = leerEstiloSeccion(settings);
  return { settings: escribirEstiloSeccion(settings, { ...e, colores: { ...e.colores, borde: valor } }), contenido: sinClaves(contenido, ['border_color']) };
}

// ─── Fuente (ESTILO-05) ──────────────────────────────────────────────────────

/** Fuentes guardadas en el Cascarón (encabezado de la sección); `site` = la del sitio. */
export function fuentesCascaron({ contenido }: Apariencia): { titulo?: string; texto?: string } {
  const h = obj(contenido.section_header);
  const f = (v: unknown) => (txt(v) && v !== 'site' ? (v as string) : undefined);
  return { titulo: f(h?.title_font), texto: f(h?.description_font) };
}

/** Al elegir fuente en Estilo › Tipografía, la del Cascarón deja de pisarla. */
export function sinFuentesCascaron(contenido: Obj): Obj {
  const h = obj(contenido.section_header);
  if (!h || (!('title_font' in h) && !('description_font' in h))) return contenido;
  const resto = sinClaves(h, ['title_font', 'description_font']);
  return Object.keys(resto).length ? { ...contenido, section_header: resto } : sinClaves(contenido, ['section_header']);
}

/** Estilo › Tipografía leído con lo que se ve hoy: si solo el Cascarón tiene fuente, «Personalizada» con ella. */
export function estiloConFuentesCascaron(a: Apariencia): EstiloSeccion {
  const e = leerEstiloSeccion(a.settings);
  const f = fuentesCascaron(a);
  if (!f.titulo && !f.texto) return e;
  const t = e.tipografia?.modo === 'propia' ? e.tipografia : { modo: 'propia' as const };
  return {
    ...e,
    tipografia: {
      ...t,
      ...(f.titulo ? { titulo: { ...t.titulo, fuente: f.titulo } } : {}),
      ...(f.texto ? { texto: { ...t.texto, fuente: f.texto } } : {}),
    },
  };
}
