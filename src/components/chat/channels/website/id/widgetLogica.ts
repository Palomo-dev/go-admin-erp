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
