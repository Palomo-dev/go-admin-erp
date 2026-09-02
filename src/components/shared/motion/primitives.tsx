'use client';
import { motion, AnimatePresence, type Variants, type HTMLMotionProps } from 'motion/react';
import { forwardRef } from 'react';

/**
 * Primitivas de animación compartidas (FASE 0 — Fundaciones).
 * Usadas por F1-F15 para consistencia visual y accesibilidad.
 *
 * Performance: para listas con >100 items (ej. Kanban), usar `m` + LazyMotion
 * en vez de estos wrappers. No animar `layout` en listas grandes.
 *
 * Cada primitiva expone variants por defecto (initial/animate/exit) que el
 * consumidor puede sobrescribir vía props si necesita un comportamiento distinto.
 */

const fadeInVariants: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

const slideInVariants: Variants = {
  initial: { opacity: 0, x: 24 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 24 },
};

const scaleInVariants: Variants = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.96 },
};

type PrimitiveProps = HTMLMotionProps<'div'>;

/** Fade + translateY (entradas suaves, cards, secciones). */
export const FadeIn = forwardRef<HTMLDivElement, PrimitiveProps>(
  ({ variants = fadeInVariants, initial = 'initial', animate = 'animate', exit = 'exit', ...rest }, ref) => (
    <motion.div ref={ref} variants={variants} initial={initial} animate={animate} exit={exit} {...rest} />
  )
);
FadeIn.displayName = 'FadeIn';

/** Slide desde la derecha (drawers, paneles laterales). */
export const SlideIn = forwardRef<HTMLDivElement, PrimitiveProps>(
  ({ variants = slideInVariants, initial = 'initial', animate = 'animate', exit = 'exit', ...rest }, ref) => (
    <motion.div ref={ref} variants={variants} initial={initial} animate={animate} exit={exit} {...rest} />
  )
);
SlideIn.displayName = 'SlideIn';

/** Scale + fade (dialogs, modales, popovers). */
export const ScaleIn = forwardRef<HTMLDivElement, PrimitiveProps>(
  ({ variants = scaleInVariants, initial = 'initial', animate = 'animate', exit = 'exit', ...rest }, ref) => (
    <motion.div ref={ref} variants={variants} initial={initial} animate={animate} exit={exit} {...rest} />
  )
);
ScaleIn.displayName = 'ScaleIn';

export { AnimatePresence };
