/**
 * Sistema único de motion del CRM (F15). Importar SIEMPRE desde aquí:
 * `import { FadeIn, StaggerList, Chip } from '@/components/shared/motion'`.
 *
 * - Entradas: `FadeIn`, `SlideIn`, `SlideUp`, `ScaleIn` (+ `AnimatePresence`).
 * - Listas: `StaggerList`, `StaggerItem`.
 * - Fichas: `Chip`, `Expand`.
 * - Audio: `SoundWave`, `PulseRing`, `LevelMeter`.
 * - Provider: `MotionProvider` (un solo `MotionConfig`, en el layout de /app).
 * - Tokens: duraciones, easings y muelle en `tokens.ts`.
 *
 * Todas las primitivas respetan `prefers-reduced-motion` por sí mismas.
 * `motion/react` directo solo para casos complejos (Reorder, `motion.*` con
 * valores continuos), y ahí `useReducedMotion` es obligatorio.
 */
export { FadeIn, SlideIn, SlideUp, ScaleIn, AnimatePresence, type PrimitiveProps } from './primitives';
export { StaggerList, StaggerItem, type StaggerTag } from './staggerList';
export { Chip, Expand } from './chip';
export { SoundWave, PulseRing, LevelMeter } from './audio';
export { MotionProvider } from './MotionProvider';
export { useReducedMotion } from 'motion/react';
export * from './tokens';
