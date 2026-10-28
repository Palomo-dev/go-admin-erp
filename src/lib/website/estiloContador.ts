/**
 * Estilo del contador regresivo (columna `website_settings.countdown_style`, jsonb).
 *
 * Una sola configuración para todas las ubicaciones (barra del encabezado, carrito, pago, producto
 * y portada): cada ubicación solo cambia la forma (barra en una línea o tarjeta), no el estilo.
 * NULL, vacío o no-objeto = sin estilo → la tienda pinta EXACTAMENTE el contador de siempre.
 *
 * Copia idéntica en goadmin-websites (`lib/website/estiloContador.ts`, verify-copias-erp): sin
 * imports, el contraste lo pasa quien llama.
 */

export type TipoFondoContador = 'sitio' | 'solido' | 'degradado';
export type TamanoContador = 'compacto' | 'normal' | 'grande';
export type CajaDigitos = 'ninguna' | 'cuadrada' | 'redondeada' | 'pildora';
export type PosicionIcono = 'inicio' | 'fin' | 'ambos';
export type GrosorTexto = 'normal' | 'medio' | 'negrita';
export type IconoContador =
  | 'ninguno'
  | 'emoji_fuego'
  | 'fuego'
  | 'reloj'
  | 'cronometro'
  | 'rayo'
  | 'etiqueta'
  | 'regalo'
  | 'porcentaje'
  | 'chispas';

export interface EstiloContador {
  fondo: { tipo: TipoFondoContador; color: string; desde: string; hasta: string; angulo: number };
  /** `color` vacío = automático (negro o blanco, el de más contraste sobre el fondo). */
  texto: { color: string; tamano: TamanoContador; grosor: GrosorTexto; antes: string; despues: string };
  icono: { tipo: IconoContador; posicion: PosicionIcono };
  /** Colores vacíos = automáticos (caja translúcida y dígitos del color del texto). */
  temporizador: { caja: CajaDigitos; colorCaja: string; colorDigitos: string; etiquetas: boolean; separadores: boolean };
  tamano: TamanoContador;
}

/** Ícono → nombre del ícono de lucide-react (cada repo lo convierte en componente). */
export const ICONOS_CONTADOR: readonly { valor: IconoContador; etiqueta: string; lucide: string | null; emoji?: string }[] = [
  { valor: 'ninguno', etiqueta: 'Ninguno', lucide: null },
  { valor: 'emoji_fuego', etiqueta: '🔥 Emoji', lucide: null, emoji: '🔥' },
  { valor: 'fuego', etiqueta: 'Fuego', lucide: 'Flame' },
  { valor: 'reloj', etiqueta: 'Reloj', lucide: 'Clock' },
  { valor: 'cronometro', etiqueta: 'Cronómetro', lucide: 'Timer' },
  { valor: 'rayo', etiqueta: 'Rayo', lucide: 'Zap' },
  { valor: 'etiqueta', etiqueta: 'Etiqueta', lucide: 'Tag' },
  { valor: 'regalo', etiqueta: 'Regalo', lucide: 'Gift' },
  { valor: 'porcentaje', etiqueta: 'Porcentaje', lucide: 'Percent' },
  { valor: 'chispas', etiqueta: 'Chispas', lucide: 'Sparkles' },
];

/** Lo que se ve al personalizar por primera vez: parecido al contador de siempre. */
export const ESTILO_CONTADOR_INICIAL: EstiloContador = {
  fondo: { tipo: 'sitio', color: '', desde: '', hasta: '', angulo: 90 },
  texto: { color: '', tamano: 'normal', grosor: 'medio', antes: '', despues: '' },
  icono: { tipo: 'emoji_fuego', posicion: 'ambos' },
  temporizador: { caja: 'redondeada', colorCaja: '', colorDigitos: '', etiquetas: false, separadores: true },
  tamano: 'normal',
};

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
export function esHexContador(v: unknown): v is string {
  return typeof v === 'string' && HEX.test(v.trim());
}

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
function una<T extends string>(v: unknown, validos: readonly T[], porDefecto: T): T {
  return typeof v === 'string' && (validos as readonly string[]).includes(v) ? (v as T) : porDefecto;
}
function hex(v: unknown): string {
  return esHexContador(v) ? v.trim() : '';
}
function texto(v: unknown, max = 60): string {
  return typeof v === 'string' ? v.slice(0, max) : '';
}

const TAMANOS: readonly TamanoContador[] = ['compacto', 'normal', 'grande'];

/**
 * Lee la columna de forma tolerante. `null` = sin estilo (columna ausente, NULL, `{}` o basura):
 * quien llama pinta el contador de siempre. Campos sueltos inválidos toman el valor inicial.
 */
export function leerEstiloContador(raw: unknown): EstiloContador | null {
  let v: unknown = raw;
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }
  const o = obj(v);
  if (!o || Object.keys(o).length === 0) return null;
  const I = ESTILO_CONTADOR_INICIAL;
  const f = obj(o.fondo) ?? {};
  const t = obj(o.texto) ?? {};
  const i = obj(o.icono) ?? {};
  const d = obj(o.temporizador) ?? {};
  const angulo = Number(f.angulo);
  return {
    fondo: {
      tipo: una(f.tipo, ['sitio', 'solido', 'degradado'] as const, I.fondo.tipo),
      color: hex(f.color),
      desde: hex(f.desde),
      hasta: hex(f.hasta),
      angulo: Number.isFinite(angulo) ? ((Math.round(angulo) % 360) + 360) % 360 : I.fondo.angulo,
    },
    texto: {
      color: hex(t.color),
      tamano: una(t.tamano, TAMANOS, I.texto.tamano),
      grosor: una(t.grosor, ['normal', 'medio', 'negrita'] as const, I.texto.grosor),
      antes: texto(t.antes),
      despues: texto(t.despues),
    },
    icono: {
      tipo: una(i.tipo, ICONOS_CONTADOR.map((x) => x.valor), I.icono.tipo),
      posicion: una(i.posicion, ['inicio', 'fin', 'ambos'] as const, I.icono.posicion),
    },
    temporizador: {
      caja: una(d.caja, ['ninguna', 'cuadrada', 'redondeada', 'pildora'] as const, I.temporizador.caja),
      colorCaja: hex(d.colorCaja),
      colorDigitos: hex(d.colorDigitos),
      etiquetas: typeof d.etiquetas === 'boolean' ? d.etiquetas : I.temporizador.etiquetas,
      separadores: typeof d.separadores === 'boolean' ? d.separadores : I.temporizador.separadores,
    },
    tamano: una(o.tamano, TAMANOS, I.tamano),
  };
}

/** Valores listos para pintar (CSS en línea), iguales en la vista previa del editor y en la tienda. */
export interface EstiloContadorResuelto {
  fondo: string;
  colorTexto: string;
  colorDigitos: string;
  fondoCaja: string;
  radioCaja: string;
  /** Tamaños en px: texto, dígitos, ícono, alto mínimo de la barra y relleno horizontal. */
  px: { texto: number; digitos: number; icono: number; etiqueta: number; relleno: number; separacion: number };
  peso: number;
  conCaja: boolean;
}

const ESCALA: Record<TamanoContador, number> = { compacto: 0.85, normal: 1, grande: 1.25 };
const TEXTO_PX: Record<TamanoContador, number> = { compacto: 12, normal: 14, grande: 16 };
const PESO: Record<GrosorTexto, number> = { normal: 400, medio: 500, negrita: 700 };

/**
 * @param primario color primario del sitio (fondo «sitio»).
 * @param sobre negro o blanco de más contraste sobre un hex (textoSobreAcento de cada repo).
 */
export function resolverEstiloContador(e: EstiloContador, primario: string, sobre: (hex: string) => string): EstiloContadorResuelto {
  const f = e.fondo;
  let fondo = primario;
  let base = primario;
  if (f.tipo === 'solido' && f.color) {
    fondo = f.color;
    base = f.color;
  } else if (f.tipo === 'degradado') {
    const a = f.desde || primario;
    const b = f.hasta || f.desde || primario;
    fondo = `linear-gradient(${f.angulo}deg, ${a}, ${b})`;
    base = a;
  }
  const auto = esHexContador(base) ? sobre(base) : '#ffffff';
  const colorTexto = e.texto.color || auto;
  const k = ESCALA[e.tamano];
  const caja = e.temporizador.caja;
  return {
    fondo,
    colorTexto,
    colorDigitos: e.temporizador.colorDigitos || colorTexto,
    fondoCaja: caja === 'ninguna' ? 'transparent' : e.temporizador.colorCaja || 'rgba(255,255,255,0.2)',
    radioCaja: caja === 'cuadrada' ? '2px' : caja === 'pildora' ? '9999px' : caja === 'redondeada' ? '6px' : '0',
    px: {
      texto: Math.round(TEXTO_PX[e.texto.tamano] * k),
      digitos: Math.round(16 * k),
      icono: Math.round(16 * k),
      etiqueta: Math.round(10 * k),
      relleno: Math.round(8 * k),
      separacion: Math.round(10 * k),
    },
    peso: PESO[e.texto.grosor],
    conCaja: caja !== 'ninguna',
  };
}

/** Unidades del temporizador; los días solo aparecen si faltan 24 h o más. */
export function unidadesContador(totalSegundos: number): { valor: string; etiqueta: string }[] {
  const s = Math.max(0, Math.floor(totalSegundos));
  const dias = Math.floor(s / 86400);
  const pad = (n: number) => String(n).padStart(2, '0');
  const partes = [
    { valor: pad(Math.floor((s % 86400) / 3600)), etiqueta: 'horas' },
    { valor: pad(Math.floor((s % 3600) / 60)), etiqueta: 'min' },
    { valor: pad(s % 60), etiqueta: 'seg' },
  ];
  return dias > 0 ? [{ valor: pad(dias), etiqueta: 'días' }, ...partes] : partes;
}
