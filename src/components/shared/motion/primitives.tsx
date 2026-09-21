'use client';
import { motion, useReducedMotion, AnimatePresence, type Variants, type HTMLMotionProps, type Transition } from 'motion/react';
import { forwardRef } from 'react';
import { DURATION, EASING, OFFSET, SCALE } from './tokens';

/**
 * Primitivas de entrada/salida compartidas (F0 → F15, sistema único).
 *
 * Todas pasan por `useReducedMotion`: con `prefers-reduced-motion` no hay
 * desplazamiento ni escala, solo opacidad instantánea (nada «vuela»). Esto no
 * depende del `MotionConfig` global, así que valen también fuera de `/app`
 * (arneses, páginas públicas).
 *
 * El consumidor puede pasar `transition` (p. ej. `delay` para escalonar a
 * mano) y `variants` propios; ambos se ignoran bajo reduced-motion. La
 * entrada va en la prop `transition` (para que el consumidor la sobrescriba);
 * la salida, dentro de la variante `exit` (siempre la corta).
 *
 * Performance: para listas con >100 items (Kanban), usar `m` + LazyMotion en
 * vez de estos wrappers. No animar `layout` en listas grandes.
 */

export type PrimitiveProps = HTMLMotionProps<'div'>;

const enterTransition: Transition = { duration: DURATION.base, ease: EASING.out };
const exitTransition: Transition = { duration: DURATION.fast, ease: EASING.in };

const reducedVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: DURATION.none } },
  exit: { opacity: 0, transition: { duration: DURATION.none } },
};

function makePrimitive(displayName: string, variants: Variants) {
  const Primitive = forwardRef<HTMLDivElement, PrimitiveProps>(
    ({ variants: custom = variants, initial = 'initial', animate = 'animate', exit = 'exit', transition, ...rest }, ref) => {
      const reduced = useReducedMotion();
      return (
        <motion.div
          ref={ref}
          variants={reduced ? reducedVariants : custom}
          initial={initial}
          animate={animate}
          exit={exit}
          transition={reduced ? { duration: DURATION.none } : transition ?? enterTransition}
          {...rest}
        />
      );
    },
  );
  Primitive.displayName = displayName;
  return Primitive;
}

/** Fade + sube 8 px (tarjetas, secciones, paneles). */
export const FadeIn = makePrimitive('FadeIn', {
  initial: { opacity: 0, y: OFFSET.fade },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -OFFSET.fade, transition: exitTransition },
});

/** Entra desde la derecha (drawers, paneles laterales). */
export const SlideIn = makePrimitive('SlideIn', {
  initial: { opacity: 0, x: OFFSET.slide },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: OFFSET.slide, transition: exitTransition },
});

/** Entra desde abajo (dock del softphone, hojas y toasts inferiores). */
export const SlideUp = makePrimitive('SlideUp', {
  initial: { opacity: 0, y: OFFSET.slide },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: OFFSET.slide, transition: exitTransition },
});

/** Scale + fade (diálogos, popovers). */
export const ScaleIn = makePrimitive('ScaleIn', {
  initial: { opacity: 0, scale: SCALE.dialog },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: SCALE.dialog, transition: exitTransition },
});

export { AnimatePresence };
