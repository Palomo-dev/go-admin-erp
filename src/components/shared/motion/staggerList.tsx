'use client';
import { motion, useReducedMotion, type HTMLMotionProps, type Variants } from 'motion/react';
import { forwardRef } from 'react';

/**
 * Primitivas de animación para LISTAS (brief UX 2026-09).
 * Complementan `primitives.tsx` (no lo modifican): entradas escalonadas de
 * tarjetas. Duraciones 150–300 ms. Con
 * `prefers-reduced-motion` no hay desplazamiento ni escalonado: solo opacidad
 * instantánea, para que nada «vuele» por la pantalla.
 *
 * `as` elige la etiqueta (`div` por defecto; `ul`/`li` para una rejilla
 * semántica de tarjetas, como en Automatizaciones). Los atributos y eventos
 * son los de `div`: para `ul`/`li` son los mismos salvo el tipo del elemento.
 */

const listVariants: Variants = {
  initial: {},
  animate: { transition: { staggerChildren: 0.04, delayChildren: 0.02 } },
};

const itemVariants: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.22, ease: 'easeOut' } },
  exit: { opacity: 0, scale: 0.98, transition: { duration: 0.15 } },
};

const reducedItemVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0 } },
  exit: { opacity: 0, transition: { duration: 0 } },
};

export type StaggerTag = 'div' | 'ul' | 'ol' | 'li' | 'section' | 'article';

type DivProps = HTMLMotionProps<'div'> & { as?: StaggerTag };

/** `motion.ul`, `motion.li`… tipados como `motion.div`: mismas props salvo el tipo de elemento. */
function tag(as: StaggerTag): typeof motion.div {
  return motion[as] as unknown as typeof motion.div;
}

/** Contenedor que escalona la entrada de sus `StaggerItem`. */
export const StaggerList = forwardRef<HTMLDivElement, DivProps>(({ as = 'div', variants = listVariants, ...rest }, ref) => {
  const reduced = useReducedMotion();
  const Component = tag(as);
  return (
    <Component
      ref={ref}
      variants={reduced ? undefined : variants}
      initial="initial"
      animate="animate"
      {...rest}
    />
  );
});
StaggerList.displayName = 'StaggerList';

/** Elemento de una `StaggerList` (también sirve suelto con AnimatePresence). */
export const StaggerItem = forwardRef<HTMLDivElement, DivProps & { layout?: boolean }>(
  ({ as = 'div', layout = true, ...rest }, ref) => {
    const reduced = useReducedMotion();
    const Component = tag(as);
    return (
      <Component
        ref={ref}
        layout={reduced ? false : layout}
        variants={reduced ? reducedItemVariants : itemVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        {...rest}
      />
    );
  },
);
StaggerItem.displayName = 'StaggerItem';
