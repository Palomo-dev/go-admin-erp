'use client';
import { forwardRef } from 'react';
import { motion, useReducedMotion, type HTMLMotionProps } from 'motion/react';
import { DURATION, EASING, SCALE } from './tokens';

/**
 * Fichas y paneles expandibles (antes `crm/automatizaciones/motion.tsx`,
 * compartidos desde F15). La animación explica: aparece, se reordena, se
 * expande. Con `prefers-reduced-motion` solo opacidad instantánea.
 */

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
      initial={reduced ? { opacity: 0 } : { opacity: 0, scale: SCALE.chip }}
      animate={{ opacity: 1, scale: 1, transition: { duration: reduced ? DURATION.none : DURATION.fast } }}
      exit={
        reduced
          ? { opacity: 0, transition: { duration: DURATION.none } }
          : { opacity: 0, scale: SCALE.chip, transition: { duration: DURATION.fast } }
      }
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
      transition={{ duration: reduced ? DURATION.none : DURATION.base, ease: EASING.inOut }}
      style={{ overflow: 'hidden', ...style }}
      {...rest}
    />
  );
});
Expand.displayName = 'Expand';
