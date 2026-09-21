/**
 * Tokens de motion del CRM (F15). Único sitio con números de duración,
 * easing y muelle: las primitivas y el `MotionProvider` los consumen de aquí.
 *
 * Regla del brief UX: la animación explica (aparece, se reordena, se
 * expande), nunca decora; 150–300 ms; `prefers-reduced-motion` sin excepción.
 *
 * Duraciones en segundos (unidad de `motion`).
 */

export const DURATION = {
  /** Fichas, salidas, cambios de estado: 150 ms. */
  fast: 0.15,
  /** Entradas de tarjetas y paneles: 220 ms. */
  base: 0.22,
  /** Expansiones de altura, paneles grandes: 300 ms. */
  slow: 0.3,
  /** Con `prefers-reduced-motion`: instantáneo. */
  none: 0,
} as const;

export const EASING = {
  out: 'easeOut',
  inOut: 'easeInOut',
  in: 'easeIn',
} as const;

/** Muelle por defecto de la app (`MotionProvider`). */
export const SPRING = { type: 'spring', stiffness: 300, damping: 30 } as const;

/** Escalonado de listas: 40 ms entre hijos, 20 ms de arranque. */
export const STAGGER = { children: 0.04, delay: 0.02 } as const;

/** Desplazamientos de entrada, en px. */
export const OFFSET = {
  /** `FadeIn`: sube 8 px. */
  fade: 8,
  /** `SlideIn`: entra 24 px desde la derecha. `SlideUp`: 24 px desde abajo. */
  slide: 24,
  /** `StaggerItem`: sube 10 px. */
  item: 10,
} as const;

/** Escalas de entrada/salida. */
export const SCALE = {
  /** `ScaleIn`: diálogos y popovers. */
  dialog: 0.96,
  /** `Chip`: fichas que aparecen y se encogen. */
  chip: 0.9,
  /** `StaggerItem` al salir. */
  item: 0.98,
} as const;

/** Bucles de audio (`SoundWave`, `PulseRing`): sin `prefers-reduced-motion`. */
export const AUDIO_LOOP = {
  wave: 0.9,
  pulse: 1.2,
  /** Retraso entre barras de `SoundWave`. */
  barStep: 0.12,
  /** Seguimiento del nivel del micrófono (`LevelMeter`). */
  meter: 0.1,
} as const;
