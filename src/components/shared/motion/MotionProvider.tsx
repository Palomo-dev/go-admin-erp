'use client';
import { MotionConfig } from 'motion/react';
import { ReactNode } from 'react';
import { SPRING } from './tokens';

/**
 * Único `MotionConfig` de la app (F0 → F15). Se monta UNA vez en
 * `src/app/app/layout.tsx`; ninguna página lo repite (anidarlo hereda y no
 * aporta nada: ver `motionSystem.test.ts`).
 *
 * - `reducedMotion="user"`: con `prefers-reduced-motion`, `motion` omite
 *   transform y layout. Las primitivas compartidas además llaman a
 *   `useReducedMotion` por si se usan fuera de este provider.
 * - `transition={SPRING}`: muelle por defecto para lo que no declare el suyo.
 *
 * Para recortar bundle, F15+ puede anidar `LazyMotion features={domAnimation}`
 * aquí dentro cuando todas las primitivas usen `m.*` en vez de `motion.*`.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={SPRING}>
      {children}
    </MotionConfig>
  );
}
