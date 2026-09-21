'use client';
import { motion, useReducedMotion, type HTMLMotionProps, type TargetAndTransition, type Variants } from 'motion/react';
import { forwardRef } from 'react';
import { DURATION, EASING, OFFSET, SCALE, STAGGER } from './tokens';

/**
 * Primitivas de animación para LISTAS (brief UX 2026-09, tokens en F15).
 * Complementan `primitives.tsx`: entradas escalonadas de tarjetas. Con
 * `prefers-reduced-motion` no hay desplazamiento ni escalonado: solo opacidad
 * instantánea, para que nada «vuele» por la pantalla.
 *
 * `as` elige la etiqueta (`div` por defecto; `ul`/`li` para una rejilla
 * semántica de tarjetas, como en Automatizaciones). Los atributos y eventos
 * son los de `div`: para `ul`/`li` son los mismos salvo el tipo del elemento.
 */

const listVariants: Variants = {
  initial: {},
  animate: { transition: { staggerChildren: STAGGER.children, delayChildren: STAGGER.delay } },
};

// `exit` va como objeto (no como etiqueta): una etiqueta en `initial`/`animate`/`exit`
// convierte al hijo en «controlador» de variantes y lo saca de la orquestación del
// padre, con lo que `staggerChildren` no le llega (tester F15, 2026-09-21).
const itemExit: TargetAndTransition = { opacity: 0, scale: SCALE.item, transition: { duration: DURATION.fast } };
const reducedItemExit: TargetAndTransition = { opacity: 0, transition: { duration: DURATION.none } };

const itemVariants: Variants = {
  initial: { opacity: 0, y: OFFSET.item },
  animate: { opacity: 1, y: 0, transition: { duration: DURATION.base, ease: EASING.out } },
};

const reducedItemVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: DURATION.none } },
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

/** Elemento de una `StaggerList`: hereda `initial`/`animate` del contenedor (así lo escalona). */
export const StaggerItem = forwardRef<HTMLDivElement, DivProps & { layout?: boolean }>(
  ({ as = 'div', layout = true, ...rest }, ref) => {
    const reduced = useReducedMotion();
    const Component = tag(as);
    return (
      <Component
        ref={ref}
        layout={reduced ? false : layout}
        variants={reduced ? reducedItemVariants : itemVariants}
        exit={reduced ? reducedItemExit : itemExit}
        {...rest}
      />
    );
  },
);
StaggerItem.displayName = 'StaggerItem';
