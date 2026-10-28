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
import { colorCss, escribirEstiloSeccion, leerEstiloSeccion, type EstiloSeccion } from '@/lib/website/v2/estiloSeccion';

const ROLES_MARCA = ['primario', 'secundario', 'acento', 'texto', 'fondo'] as const;
/** `content.text_color` es CSS crudo: la marca va como variable y se lee de vuelta como referencia. */
const aCssCrudo = (v: string): string => colorCss(v) ?? v;
const deCssCrudo = (v: string): string => ROLES_MARCA.map((r) => `marca:${r}`).find((m) => colorCss(m) === v) ?? v;

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

/** Lo que pinta la tienda (buildSectionStyle) con un degradado sin colores ni dirección. */
export const DEGRADADO_TIENDA = { desde: '#000000', hasta: '#ffffff', direccion: 'to-br' } as const;

/** Ángulo del Cascarón → dirección de Avanzado (la más cercana). */
function direccionDeAngulo(a: unknown): string {
  const n = typeof a === 'number' ? ((a % 360) + 360) % 360 : 180; // la tienda: `gradient_angle ?? 180`
  const tabla: [number, string][] = [[0, 'to-t'], [45, 'to-tr'], [90, 'to-r'], [135, 'to-br'], [180, 'to-b'], [225, 'to-bl'], [270, 'to-l'], [315, 'to-tl'], [360, 'to-t']];
  return tabla.reduce((m, x) => (Math.abs(x[0] - n) < Math.abs(m[0] - n) ? x : m))[1];
}

/** Lo que la tienda pinta hoy, en el orden en que lo aplica (Cascarón > Avanzado > anterior > Estilo). */
export function leerFondoUnico({ settings, contenido }: Apariencia): FondoUnico {
  const sb = obj(contenido.section_background);
  if (sb) {
    if (txt(sb.image_url)) return { modo: 'imagen', imagen: sb.image_url as string, capa: typeof sb.overlay_opacity === 'number' ? sb.overlay_opacity : undefined, origen: 'cascaron' };
    // La tienda solo pinta el degradado del Cascarón con los dos colores (estilosFondo).
    if (txt(sb.gradient_1) && txt(sb.gradient_2)) return { modo: 'degradado', desde: sb.gradient_1 as string, hasta: sb.gradient_2 as string, direccion: direccionDeAngulo(sb.gradient_angle), origen: 'cascaron' };
    if (txt(sb.color)) return { modo: 'color', color: sb.color as string, origen: 'cascaron' };
  }
  const tipo = contenido.bg_type;
  if (tipo === 'color' && txt(contenido.bg_color)) return { modo: 'color', color: contenido.bg_color as string, origen: 'avanzado' };
  if (tipo === 'gradient') return { modo: 'degradado', desde: txt(contenido.bg_gradient_from) ?? DEGRADADO_TIENDA.desde, hasta: txt(contenido.bg_gradient_to) ?? DEGRADADO_TIENDA.hasta, direccion: txt(contenido.bg_gradient_dir) ?? DEGRADADO_TIENDA.direccion, origen: 'avanzado' };
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
  // Color anterior (`settings.bg_color`, orgs no v2): se queda donde está. La tienda lo pinta con
  // `dark:bg-gray-900/40`; pasarlo a Avanzado perdería ese fondo en modo oscuro.
  if (f.modo === 'color' && txt(settings.bg_color) && !obj(contenido.section_background) && contenido.bg_type == null) {
    return { settings: { ...settings, bg_color: f.color ?? (settings.bg_color as string) }, contenido };
  }
  let s = sinClaves(settings, ['bg_color']);
  if (f.modo === 'tema' || f.modo === 'alterno' || f.modo === 'oscuro') {
    s = conEstilo(s, { fondo: f.modo });
  } else if (f.modo === 'color') {
    s = conEstilo(s, { fondo: undefined });
    c = { ...c, bg_type: 'color', bg_color: f.color ?? '#ffffff' };
  } else if (f.modo === 'degradado') {
    s = conEstilo(s, { fondo: undefined });
    c = { ...c, bg_type: 'gradient', bg_gradient_from: f.desde ?? DEGRADADO_TIENDA.desde, bg_gradient_to: f.hasta ?? DEGRADADO_TIENDA.hasta, bg_gradient_dir: f.direccion ?? DEGRADADO_TIENDA.direccion };
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

/**
 * Dónde está el color y hasta dónde llega en la tienda:
 * - `envoltorio`: `content.text_color` o `settings.text_color` (buildSectionStyle → `--sec-text` en
 *   la sección). Solo lo hereda el texto SIN color propio: títulos y párrafos de la plantilla
 *   conservan el suyo. El control lo dice; no lo presenta como el color de títulos y párrafos.
 * - `todo`: Estilo (`colores.texto`), que globals.css impone a h1–h6, p y li.
 * - `oscuro`: fondo «Oscuro» sin color propio: la tienda pinta todo el texto en blanco.
 * - `tema`: nada guardado; cada plantilla usa sus colores de texto.
 */
export type AlcanceTexto = 'envoltorio' | 'todo' | 'oscuro' | 'tema';
export function textoUnico({ settings, contenido }: Apariencia): { valor?: string; alcance: AlcanceTexto } {
  const env = txt(contenido.text_color) ?? txt(settings.text_color);
  const e = leerEstiloSeccion(settings);
  if (e.colores?.texto) return { valor: e.colores.texto, alcance: 'todo' };
  if (env) return { valor: deCssCrudo(env), alcance: 'envoltorio' };
  if (e.fondo === 'oscuro' && !obj(contenido.section_background) && contenido.bg_type == null && !txt(settings.bg_color)) return { valor: '#ffffff', alcance: 'oscuro' };
  return { alcance: 'tema' };
}
export function leerColorTextoUnico(a: Apariencia): string | undefined {
  return textoUnico(a).valor;
}
/** Guarda donde la tienda lo lee hoy: si ya estaba en la sección (`content`/`settings.text_color`),
 *  en `content.text_color` (mismo alcance) y se borran las copias; si no, en Estilo. */
export function cambioColorTextoUnico({ settings, contenido }: Apariencia, valor: string): Apariencia {
  const e = leerEstiloSeccion(settings);
  const sinCopias = sinClaves(settings, ['text_color']);
  if (!e.colores?.texto && (txt(contenido.text_color) || txt(settings.text_color))) {
    return { settings: sinCopias, contenido: { ...contenido, text_color: aCssCrudo(valor) } };
  }
  const s = escribirEstiloSeccion(sinCopias, { ...e, colores: { ...e.colores, texto: valor } });
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
/** Sin color guardado la tienda pinta el borde por defecto del sitio (`border-border`, hsl(0 0% 89.8%)). */
export const BORDE_TIENDA = '#e5e5e5';
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

/**
 * Colores del encabezado de la sección (título, segundo color del degradado y descripción).
 * Antes estaban en Cascarón; ahora viven solo en Estilo › Colores. Se guardan donde siempre
 * (`content.section_header`), así la tienda los lee igual. Sin valor, el encabezado usa el color
 * del texto de la sección: eso es lo que muestra el control hasta que se edita.
 */
export const CLAVES_COLOR_ENCABEZADO = ['title_color', 'title_color_2', 'description_color'] as const;
export type ClaveColorEncabezado = (typeof CLAVES_COLOR_ENCABEZADO)[number];

const esHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v.trim());

export function leerColorEncabezado({ contenido }: Apariencia, clave: ClaveColorEncabezado): string | undefined {
  const v = obj(contenido.section_header)?.[clave];
  return esHex(v) ? v : undefined;
}

/** `null` quita el color (vuelve a «como el texto»). Quitar el título quita también el degradado. */
export function cambioColorEncabezado(a: Apariencia, clave: ClaveColorEncabezado, valor: string | null): Apariencia {
  const h = obj(a.contenido.section_header) ?? {};
  let nuevo: Obj = valor ? { ...h, [clave]: valor } : sinClaves(h, clave === 'title_color' ? ['title_color', 'title_color_2'] : [clave]);
  if (valor && clave === 'title_color_2' && !esHex(h.title_color)) nuevo = { ...nuevo, title_color: valor };
  const contenido = Object.keys(nuevo).length ? { ...a.contenido, section_header: nuevo } : sinClaves(a.contenido, ['section_header']);
  return { settings: a.settings, contenido };
}
