'use client';
import { LazyMotion, domAnimation } from 'motion/react';
import { ReactNode } from 'react';

/**
 * MotionProvider (FASE 15 - Motion/Cross-platform).
 *
 * Envuelve la app con LazyMotion + domAnimation para optimizar el bundle:
 * solo se carga el subset de animaciones DOM, no el motor completo de Motion.
 *
 * Uso en layout raíz:
 *   <MotionProvider>{children}</MotionProvider>
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <LazyMotion features={domAnimation}>{children}</LazyMotion>;
}
