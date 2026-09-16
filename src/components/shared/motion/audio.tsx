'use client';
import { motion, useReducedMotion } from 'motion/react';

/**
 * Primitivas de animación para AUDIO (brief UX 6.1 — Voces).
 * Complementan `primitives.tsx` sin modificarlo.
 *
 * - `SoundWave`: barras que «suenan» mientras se reproduce una voz.
 * - `PulseRing`: anillo que late alrededor de un avatar activo.
 * - `LevelMeter`: medidor de nivel del micrófono (0–1), sin bucle: solo sigue el valor.
 *
 * Con `prefers-reduced-motion` no hay bucles: las barras quedan fijas a media
 * altura y el anillo se muestra estático. La información (está sonando) sigue
 * llegando por texto/aria en el componente que las usa.
 */

const BAR_DELAYS = [0, 0.12, 0.24, 0.36];

export function SoundWave({ active, className = '' }: { active: boolean; className?: string }) {
  const reduced = useReducedMotion();
  return (
    <span className={`inline-flex h-4 items-end gap-0.5 ${className}`} aria-hidden="true">
      {BAR_DELAYS.map((delay, i) => (
        <motion.span
          key={i}
          className="w-0.5 rounded-full bg-current"
          initial={{ height: '35%' }}
          animate={
            active && !reduced
              ? { height: ['35%', '100%', '45%', '85%', '35%'] }
              : { height: active ? '60%' : '35%' }
          }
          transition={
            active && !reduced
              ? { duration: 0.9, repeat: Infinity, ease: 'easeInOut', delay }
              : { duration: 0.15 }
          }
        />
      ))}
    </span>
  );
}

export function PulseRing({ active, className = '' }: { active: boolean; className?: string }) {
  const reduced = useReducedMotion();
  if (!active) return null;
  return (
    <motion.span
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 rounded-full border-2 border-blue-500 ${className}`}
      initial={{ opacity: 0.7, scale: 1 }}
      animate={reduced ? { opacity: 0.7, scale: 1.06 } : { opacity: [0.7, 0], scale: [1, 1.35] }}
      transition={reduced ? { duration: 0.15 } : { duration: 1.2, repeat: Infinity, ease: 'easeOut' }}
    />
  );
}

const METER_BARS = 12;

export function LevelMeter({ level, label = 'Nivel del micrófono' }: { level: number; label?: string }) {
  const clamped = Math.max(0, Math.min(1, level));
  const lit = Math.round(clamped * METER_BARS);
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped * 100)}
      className="flex h-6 items-end gap-1"
    >
      {Array.from({ length: METER_BARS }, (_, i) => {
        const on = i < lit;
        const tone = i >= METER_BARS - 2 ? 'bg-red-500' : i >= METER_BARS - 5 ? 'bg-amber-500' : 'bg-green-500';
        return (
          <motion.span
            key={i}
            className={`w-2 rounded-sm ${on ? tone : 'bg-gray-200 dark:bg-gray-700'}`}
            animate={{ height: `${30 + (i / METER_BARS) * 70}%` }}
            transition={{ duration: 0.1 }}
          />
        );
      })}
    </div>
  );
}
