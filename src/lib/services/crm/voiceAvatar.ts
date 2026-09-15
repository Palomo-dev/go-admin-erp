/**
 * Avatar determinista para una voz (brief UX 6.1).
 *
 * La API de ElevenLabs no trae fotos de las voces; su propia biblioteca pinta
 * un orbe de color por voz. Aquí el orbe sale del `voice_id`: la misma voz
 * tiene siempre el mismo avatar en cualquier pantalla y sesión, sin guardar
 * nada en la base.
 *
 * Módulo puro (sin React ni DOM): se usa en el cliente y se prueba en Node.
 */

export interface VoiceAvatarSpec {
  /** Tono principal, 0–359. */
  hueA: number;
  /** Tono secundario, separado al menos 40° del principal. */
  hueB: number;
  /** Ángulo del gradiente, 0–359. */
  angle: number;
  /** `linear-gradient(...)` listo para `background`. */
  gradient: string;
  /**
   * Velo sutil bajo el glifo (`radial-gradient` con α = GLYPH_VEIL_ALPHA): oscuro
   * si la tinta es clara, claro si es oscura. Va como capa superior de `background`.
   */
  veil: string;
  /** Tinta de la inicial: la que más contrasta en TODA la caja del glifo, con su velo. */
  ink: 'light' | 'dark';
}

/** FNV-1a de 32 bits: rápido, estable y suficiente para repartir colores. */
export function hashVoiceId(voiceId: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < voiceId.length; i++) {
    h ^= voiceId.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

const MIN_HUE_GAP = 40;
/** Los dos extremos del gradiente: (saturación, luminosidad) en %. */
const STOP_A: [number, number] = [78, 58];
const STOP_B: [number, number] = [72, 46];

/** HSL (grados, %, %) → sRGB en 0–1. */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const sat = s / 100;
  const lig = l / 100;
  const c = (1 - Math.abs(2 * lig - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lig - c / 2;
  const sector = Math.floor((((h % 360) + 360) % 360) / 60);
  const [r, g, b] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][sector] ?? [0, 0, 0];
  return [r + m, g + m, b + m];
}

/** Luminancia relativa (WCAG) de un color sRGB en 0–1. */
function luminance([r, g, b]: [number, number, number]): number {
  const lin = (n: number) => (n <= 0.03928 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/**
 * Semiextensión de la caja del glifo como fracción del lado del orbe. La inicial
 * es `text-sm` (14 px) y el orbe más pequeño mide 36 px: la caja real ocupa
 * ±0,14; se toma 0,2 (el 40 % central) como margen.
 *
 * Para una caja cuadrada centrada, su proyección sobre la línea del gradiente
 * es ±h·S·(|sin a|+|cos a|) y la línea mide S·(|sin a|+|cos a|): la franja de
 * `t` bajo el glifo es [0,5 − h, 0,5 + h] SEA CUAL SEA el ángulo. Por eso la
 * tinta no depende del ángulo y puede decidirse con los dos tonos.
 */
export const GLYPH_HALF_EXTENT = 0.2;
/** Opacidad del velo bajo el glifo. Ronda 4: con 0,22 el peor píxel de 72 pares queda en 5,36:1. */
export const GLYPH_VEIL_ALPHA = 0.22;
const GLYPH_SAMPLES = 64;

/**
 * Luminancia del color del gradiente en la posición `t` (0 = extremo A, 1 = B),
 * opcionalmente bajo el velo. CSS interpola los extremos en sRGB (no en HSL),
 * así que es la media por canal ponderada, no la media de las luminancias
 * (ronda 3: con el promedio de luminancias, 5 de 24 orbes fallaban en el centro).
 */
export function orbLuminanceAt(hueA: number, hueB: number, t: number, veil: 'light' | 'dark' | 'none' = 'none'): number {
  const a = hslToRgb(hueA, STOP_A[0], STOP_A[1]);
  const b = hslToRgb(hueB, STOP_B[0], STOP_B[1]);
  const alpha = veil === 'none' ? 0 : GLYPH_VEIL_ALPHA;
  const veilValue = veil === 'light' ? 1 : 0;
  const c = (i: number) => (a[i] + (b[i] - a[i]) * t) * (1 - alpha) + veilValue * alpha;
  return luminance([c(0), c(1), c(2)]);
}

/** Luminancia del CENTRO del orbe (t = 0,5), sin velo. */
export function orbCenterLuminance(hueA: number, hueB: number): number {
  return orbLuminanceAt(hueA, hueB, 0.5);
}

/**
 * Contraste mínimo de una tinta en toda la caja del glifo, con el velo que le
 * corresponde (oscuro bajo tinta clara, claro bajo tinta oscura). La luminancia
 * a lo largo del gradiente es convexa en `t`, así que se muestrea la franja
 * entera: el mínimo contra negro puede caer en el interior.
 */
export function glyphZoneMinContrast(hueA: number, hueB: number, ink: 'light' | 'dark'): number {
  const inkLum = ink === 'light' ? 1 : 0;
  const veil = ink === 'light' ? 'dark' : 'light';
  let worst = Infinity;
  for (let i = 0; i <= GLYPH_SAMPLES; i++) {
    const t = 0.5 - GLYPH_HALF_EXTENT + (2 * GLYPH_HALF_EXTENT * i) / GLYPH_SAMPLES;
    const lum = orbLuminanceAt(hueA, hueB, t, veil);
    worst = Math.min(worst, (Math.max(lum, inkLum) + 0.05) / (Math.min(lum, inkLum) + 0.05));
  }
  return worst;
}

/**
 * Tinta de la inicial: la que más contrasta en TODA la caja del glifo (ronda 4:
 * decidida solo con el centro, 3 de 24 orbes bajaban a 4,03 en los bordes del
 * glifo, y en los pares amarillo→azul ninguna tinta llega a 4,5 sin velo).
 * Con negro (no gris) como tinta oscura y el velo, la mejor de las dos pasa de
 * 4,5:1 en cualquier píxel bajo la inicial.
 */
export function inkForHues(hueA: number, hueB: number): 'light' | 'dark' {
  return glyphZoneMinContrast(hueA, hueB, 'dark') > glyphZoneMinContrast(hueA, hueB, 'light') ? 'dark' : 'light';
}

/**
 * Velo bajo el glifo: disco sólido hasta el 57 % del radio (`closest-side`:
 * 100 % = radio del orbe), que cubre la diagonal de la caja del glifo
 * (0,2·√2·2 = 0,566), y se desvanece hasta el 75 %.
 */
export function glyphVeil(ink: 'light' | 'dark'): string {
  const rgb = ink === 'light' ? '0,0,0' : '255,255,255';
  return `radial-gradient(circle closest-side, rgba(${rgb},${GLYPH_VEIL_ALPHA}) 0 57%, transparent 75%)`;
}

export function voiceAvatar(voiceId: string): VoiceAvatarSpec {
  const h = hashVoiceId(voiceId || 'voz');
  const hueA = h % 360;
  // El segundo tono se aleja entre 40° y 180° del primero, según otros bits.
  const gap = MIN_HUE_GAP + ((h >>> 9) % (180 - MIN_HUE_GAP));
  const hueB = (hueA + gap) % 360;
  const angle = (h >>> 17) % 360;
  const gradient = `linear-gradient(${angle}deg, hsl(${hueA} ${STOP_A[0]}% ${STOP_A[1]}%) 0%, hsl(${hueB} ${STOP_B[0]}% ${STOP_B[1]}%) 100%)`;
  const ink = inkForHues(hueA, hueB);
  return { hueA, hueB, angle, gradient, veil: glyphVeil(ink), ink };
}
