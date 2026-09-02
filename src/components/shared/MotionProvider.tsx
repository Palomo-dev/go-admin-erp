'use client';
import { MotionConfig } from 'motion/react';
import { ReactNode } from 'react';

/**
 * MotionProvider (FASE 0 — Fundaciones).
 *
 * Envuelve la app autenticada con MotionConfig global:
 * - reducedMotion: 'user' respeta prefers-reduced-motion (accesibilidad).
 * - transition default para consistencia visual en todas las fases.
 *
 * Las primitivas (FadeIn, SlideIn, ScaleIn) están en
 * src/components/shared/motion/primitives.tsx.
 *
 * Nota: F15 puede anidar LazyMotion dentro de este MotionConfig si necesita
 * optimizar el bundle (LazyMotion + domAnimation = 4.6 KB).
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ type: 'spring', stiffness: 300, damping: 30 }}>
      {children}
    </MotionConfig>
  );
}
