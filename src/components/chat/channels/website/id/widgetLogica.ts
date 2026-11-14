/**
 * Reglas puras del detalle del chat del sitio web (sin React):
 * `__tests__/widgetLogica.test.ts`.
 */
import type { BrandConfig, WidgetBehavior, WidgetPosition, WidgetStyle } from '@/lib/services/chatChannelsService';
import { VALORES_POR_DEFECTO, normalizarConfiguracion } from '../../../../../../supabase/functions/_shared/chat-widget/reglas';

/** «https://www.Tienda.com/x» → «www.tienda.com». */
export function normalizarDominio(texto: string): string {
  return texto
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .replace(/[/?#].*$/, '')
    .replace(/:\d+$/, '');
}

export function esDominioValido(dominio: string): boolean {
  if (dominio === 'localhost') return true;
  return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(dominio);
}

export type ClavePosicion = 'abajoDerecha' | 'abajoIzquierda' | 'arribaDerecha' | 'arribaIzquierda';

export function claveDePosicion(p: Pick<WidgetPosition, 'side' | 'vertical'>): ClavePosicion {
  if (p.vertical === 'top') return p.side === 'left' ? 'arribaIzquierda' : 'arribaDerecha';
  return p.side === 'left' ? 'abajoIzquierda' : 'abajoDerecha';
}

/** Cambia esquina y conserva los márgenes que ya tenía. */
export function posicionDeClave(clave: ClavePosicion, actual: WidgetPosition): WidgetPosition {
  return {
    ...actual,
    side: clave.endsWith('Izquierda') ? 'left' : 'right',
    vertical: clave.startsWith('arriba') ? 'top' : 'bottom',
  };
}

/** % de sesiones desde celular (`device_type` mobile/tablet cuentan como celular). `null` sin sesiones. */
export function porcentajeCelular(dispositivos: Record<string, number>): number | null {
  const total = Object.values(dispositivos).reduce((a, b) => a + b, 0);
  if (!total) return null;
  const celular = Object.entries(dispositivos)
    .filter(([d]) => /mobile|movil|móvil|phone|celular|tablet/i.test(d))
    .reduce((a, [, n]) => a + n, 0);
  return Math.round((celular / total) * 100);
}

/* ── Personalización del widget ──────────────────────────────────────────────
 * Mismos límites y valores por defecto que aplica el widget público
 * (`supabase/functions/_shared/chat-widget/reglas.ts › normalizarConfiguracion`):
 * lo que se ve en la vista previa es lo que ve el visitante, y guardar un campo
 * no cambia en silencio los demás (antes, guardar la posición escribía el azul
 * de la marca GO en un widget que se veía con el azul por defecto).
 */
export const LIMITES_WIDGET = {
  margen: { min: 0, max: 200 },
  tamano: { min: 40, max: 80 },
  radio: { min: 0, max: 40 },
  borde: { min: 0, max: 6 },
} as const;

export const ESTILO_POR_DEFECTO: WidgetStyle = {
  primaryColor: VALORES_POR_DEFECTO.colorPrincipal,
  iconColor: '#FFFFFF',
  iconType: 'chat',
  iconStyle: 'outline',
  buttonSize: 56,
  borderRadius: 28,
  borderWidth: 0,
  borderColor: '#FFFFFF',
  shadowEnabled: true,
  shadowStrength: 'medium',
};

/** Colores sugeridos para el botón y la cabecera (los mismos que ofrecía la pantalla anterior). */
export const COLORES_SUGERIDOS = ['#3B82F6', '#4361EE', '#10B981', '#8B5CF6', '#EC4899', '#F97316', '#EF4444', '#06B6D4', '#1F2937'] as const;

/** Entero dentro de [min, max]; `null`/no numérico → `porDefecto`. */
export function entreLimites(valor: unknown, limite: { min: number; max: number }, porDefecto: number): number {
  const n = typeof valor === 'number' ? valor : typeof valor === 'string' && valor.trim() !== '' ? Number(valor) : NaN;
  if (!Number.isFinite(n)) return porDefecto;
  return Math.min(limite.max, Math.max(limite.min, Math.round(n)));
}

export const esColorHex = (valor: unknown): valor is string => typeof valor === 'string' && /^#[0-9a-fA-F]{6}$/.test(valor.trim());

/** '' (sin imagen) o un enlace https absoluto; el widget descarta lo demás. */
export function esUrlImagenValida(valor: string): boolean {
  const v = valor.trim();
  if (!v) return true;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' && !u.username && !u.password;
  } catch {
    return false;
  }
}

/**
 * Configuración guardada (`channel_website_settings.brand_config`, en cualquiera
 * de sus dos formas) completada con los valores por defecto del widget.
 */
export function configuracionDelWidget(brandConfig: unknown, mensajeBienvenida: string | null | undefined): BrandConfig {
  const bc = (brandConfig && typeof brandConfig === 'object' ? brandConfig : {}) as Partial<BrandConfig>;
  const estilo = (bc.style ?? {}) as Partial<WidgetStyle>;
  const comp = (bc.behavior ?? {}) as Partial<WidgetBehavior>;
  const style: WidgetStyle = {
    ...ESTILO_POR_DEFECTO,
    ...estilo,
    primaryColor: esColorHex(estilo.primaryColor) ? estilo.primaryColor : esColorHex(bc.primary_color) ? bc.primary_color : ESTILO_POR_DEFECTO.primaryColor,
    buttonSize: entreLimites(estilo.buttonSize, LIMITES_WIDGET.tamano, ESTILO_POR_DEFECTO.buttonSize),
    borderRadius: entreLimites(estilo.borderRadius, LIMITES_WIDGET.radio, ESTILO_POR_DEFECTO.borderRadius),
    borderWidth: entreLimites(estilo.borderWidth, LIMITES_WIDGET.borde, ESTILO_POR_DEFECTO.borderWidth),
  };
  const behavior: WidgetBehavior = {
    title: comp.title || VALORES_POR_DEFECTO.titulo,
    welcomeMessage: comp.welcomeMessage || mensajeBienvenida || VALORES_POR_DEFECTO.bienvenida,
    openDefaultView: comp.openDefaultView === 'form' || comp.openDefaultView === 'faq' ? comp.openDefaultView : 'chat',
    showQuickActions: comp.showQuickActions === true,
    quickActions: Array.isArray(comp.quickActions) ? comp.quickActions : [],
    offlineMessage: comp.offlineMessage || VALORES_POR_DEFECTO.fueraDeHorario,
    offlineCollectData: comp.offlineCollectData !== false,
  };
  // Esquina y márgenes con la misma regla del widget (texto antiguo 'bottom-right' u objeto; 0–200 px).
  const p = normalizarConfiguracion({ position: bc.position }, null, null).posicion;
  const position: WidgetPosition = { side: p.lado, vertical: p.vertical, offsetX: p.x, offsetY: p.y };
  const salida: BrandConfig = { ...bc, position, style, behavior };
  // La forma antigua guardaba `position: 'bottom-right'` y `primary_color`; el color queda en `style`.
  if (!esUrlImagenValida(salida.logo_url ?? '') || !salida.logo_url) delete salida.logo_url;
  return salida;
}

/** Botón rápido: si no se escribe mensaje ni enlace, envía su propio texto. */
export function botonRapido(etiqueta: string, mensaje: string): { label: string; action: string } {
  const label = etiqueta.trim();
  return { label, action: mensaje.trim() || label };
}

/** ¿El botón abre un enlace (https/http) en vez de enviar un mensaje? Misma regla que el widget. */
export function botonAbreEnlace(accion: string): boolean {
  try {
    const u = new URL(accion.trim());
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

/** Sombra del botón flotante: mismos valores que el widget público. */
export function sombraDelBoton(style: Pick<WidgetStyle, 'shadowEnabled' | 'shadowStrength'>): string {
  if (!style.shadowEnabled) return 'none';
  const sombras = { light: '0 2px 8px rgba(0,0,0,.15)', medium: '0 4px 16px rgba(0,0,0,.2)', strong: '0 8px 32px rgba(0,0,0,.3)' } as const;
  return sombras[style.shadowStrength] ?? sombras.medium;
}

/* ── Imágenes del widget (logo e «Imagen propia») ──────────────────────────
 * Se suben al bucket público `logos`, bajo un prefijo propio del widget y de la
 * organización: `<organización>/chat-widget/<canal>/<logo|icono>-<ms>-<nombre>`.
 * Solo lo que está bajo ese prefijo se borra al «Quitar» o «Cambiar»: nunca el
 * logo de la organización ni un enlace externo (decisión del dueño, 2026-11-14).
 * El formato guardado no cambia: `logo_url` y `style.iconUrl` llevan la URL.
 */
export const BUCKET_WIDGET = 'logos';
export const TIPOS_IMAGEN_WIDGET = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'] as const;
export const MAX_MB_IMAGEN_WIDGET = 2;
export type ClaseImagenWidget = 'logo' | 'icono';

export function carpetaDelWidget(organizacionId: number | string, canalId: string): string {
  return `${organizacionId}/chat-widget/${canalId}`;
}

/** Ruta en el bucket si la URL es un archivo que subió el widget de esta organización; si no, `null`. */
export function rutaPropiaDelWidget(
  url: string | null | undefined,
  organizacionId: number | string | null | undefined,
  rutaEnBucket: (url: string, bucket: string) => string | null,
): string | null {
  if (!url || organizacionId === null || organizacionId === undefined || organizacionId === '') return null;
  const ruta = rutaEnBucket(url, BUCKET_WIDGET);
  return ruta && ruta.startsWith(`${organizacionId}/chat-widget/`) ? ruta : null;
}

/** «…/logo-1731600000000-logo-tienda.png» → «logo-tienda.png». */
export function nombreDeArchivoWidget(ruta: string): string {
  const ultimo = ruta.split('/').pop() ?? ruta;
  return ultimo.replace(/^(?:logo|icono)-\d+-/, '');
}

/** «image/svg+xml» o «.svg» → «SVG». */
export function formatoDeImagen(tipoOUrl: string): string {
  const t = tipoOUrl.toLowerCase();
  if (t.startsWith('image/')) return (t.slice(6).split('+')[0] === 'jpeg' ? 'jpg' : t.slice(6).split('+')[0]).toUpperCase();
  const ext = t.split(/[?#]/)[0].split('.').pop() ?? '';
  return (ext === 'jpeg' ? 'jpg' : ext).toUpperCase();
}

/** 86016 → «84 KB»; 3565158 → «3,4 MB» (con el separador del idioma). */
export function tamanoArchivo(bytes: number, locale = 'es'): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toLocaleString(locale, { maximumFractionDigits: 1 })} MB`;
  return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString(locale)} KB`;
}

/* ── Color libre ─────────────────────────────────────────────────────────── */

export interface Hsv {
  h: number;
  s: number;
  v: number;
}

export function hexAHsv(hex: string): Hsv {
  const n = esColorHex(hex) ? hex.trim().slice(1) : '4361EE';
  const r = parseInt(n.slice(0, 2), 16) / 255;
  const g = parseInt(n.slice(2, 4), 16) / 255;
  const b = parseInt(n.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}

export function hsvAHex({ h, s, v }: Hsv): string {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const a = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
  return `#${a(r)}${a(g)}${a(b)}`.toUpperCase();
}

/** «0f766e» o «#0F766E» → «#0F766E»; `null` si no es un color de 6 cifras. */
export function normalizarHex(texto: string): string | null {
  const t = texto.trim().replace(/^#?/, '#');
  return esColorHex(t) ? t.toUpperCase() : null;
}

function luminancia(hex: string): number {
  const n = hex.trim().slice(1);
  const canal = (i: number) => {
    const c = parseInt(n.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(0) + 0.7152 * canal(2) + 0.0722 * canal(4);
}

/** Contraste WCAG entre dos colores (1 a 21), con un decimal. */
export function contraste(a: string, b: string): number {
  if (!esColorHex(a) || !esColorHex(b)) return 1;
  const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return Math.round(((l1 + 0.05) / (l2 + 0.05)) * 10) / 10;
}

/** AA para texto e íconos pequeños: 4,5:1. */
export const CONTRASTE_AA = 4.5;

/* ── Resumen del botón («Vista previa del botón») ───────────────────────── */

export type ParteResumenBoton =
  | { clave: 'tamano'; px: number }
  | { clave: 'imagenPropia' }
  | { clave: 'relleno' }
  | { clave: 'redondeo'; px: number }
  | { clave: 'sinBorde' }
  | { clave: 'borde'; px: number; color: string | null }
  | { clave: 'sinSombra' }
  | { clave: 'sombra'; fuerza: WidgetStyle['shadowStrength'] };

/**
 * «56 px · relleno · redondeo 16 · borde 4 px #99F6E4 · sombra fuerte».
 * Con imagen propia no hay relleno ni redondeo que contar (la imagen llena el
 * botón en círculo). `color: null` = blanco (se dice «blanco», no el hex).
 */
export function resumenBoton(s: WidgetStyle): ParteResumenBoton[] {
  const partes: ParteResumenBoton[] = [{ clave: 'tamano', px: s.buttonSize }];
  if (s.iconType === 'custom') partes.push({ clave: 'imagenPropia' });
  else {
    if (s.iconStyle === 'filled' && s.iconType !== 'support') partes.push({ clave: 'relleno' });
    partes.push({ clave: 'redondeo', px: s.borderRadius });
  }
  if (s.borderWidth > 0) partes.push({ clave: 'borde', px: s.borderWidth, color: (s.borderColor || '').toUpperCase() === '#FFFFFF' ? null : (s.borderColor || '').toUpperCase() });
  else partes.push({ clave: 'sinBorde' });
  partes.push(s.shadowEnabled ? { clave: 'sombra', fuerza: s.shadowStrength } : { clave: 'sinSombra' });
  return partes;
}
