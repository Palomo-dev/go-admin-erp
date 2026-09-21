'use client';

/**
 * Primitivas de animación de la página de Automatizaciones (brief UX 6.2).
 * Complementan `src/components/shared/motion/primitives.tsx` sin modificarlo.
 * La rejilla de tarjetas usa `StaggerList`/`StaggerItem` compartidos
 * (`shared/motion/staggerList.tsx`, con `as="ul"`/`"li"`); aquí quedan solo
 * las fichas, el panel expandible y la entrada suave.
 *
 * Regla del brief: la animación explica (aparece, se reordena, se expande),
 * nunca decora. 150–300 ms. Con `prefers-reduced-motion` no hay
 * desplazamiento ni escalonado: solo opacidad instantánea.
 */

import { forwardRef } from 'react';
import { motion, useReducedMotion, AnimatePresence, type HTMLMotionProps } from 'motion/react';

type DivProps = HTMLMotionProps<'div'>;

/**
 * Ficha (condición o acción) que aparece al añadirse y se encoge al quitarse.
 * `min-w-0 max-w-full`: como elemento flex, sin esto su mínimo era el ancho
 * del texto sin cortar y la ficha sobresalía del contenedor en móvil.
 */
export const Chip = forwardRef<HTMLDivElement, DivProps>(({ className, ...props }, ref) => {
  const reduced = useReducedMotion();
  return (
    <motion.div
      ref={ref}
      className={['min-w-0 max-w-full', className].filter(Boolean).join(' ')}
      layout={!reduced}
      initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1, transition: { duration: reduced ? 0 : 0.18 } }}
      exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
      {...props}
    />
  );
});
Chip.displayName = 'Chip';

/** Panel que se expande en altura (editor de una ficha). Va dentro de `AnimatePresence`. */
export const Expand = forwardRef<HTMLDivElement, DivProps>(({ style, ...rest }, ref) => {
  const reduced = useReducedMotion();
  return (
    <motion.div
      ref={ref}
      initial={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
      animate={reduced ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
      exit={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
      transition={{ duration: reduced ? 0 : 0.2, ease: 'easeInOut' }}
      style={{ overflow: 'hidden', ...style }}
      {...rest}
    />
  );
});
Expand.displayName = 'Expand';

/** Entrada suave de una sección (estado vacío, paneles). Sin desplazamiento si hay reduced-motion. */
export const Appear = forwardRef<HTMLDivElement, DivProps>((props, ref) => {
  const reduced = useReducedMotion();
  return (
    <motion.div
      ref={ref}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0, transition: { duration: reduced ? 0 : 0.22, ease: 'easeOut' } }}
      {...props}
    />
  );
});
Appear.displayName = 'Appear';

export { AnimatePresence };
