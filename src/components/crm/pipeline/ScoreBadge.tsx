'use client';

import { Flame, Snowflake, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TemperatureDot } from './TemperatureDot';

type Temperature = 'cold' | 'warm' | 'hot';

interface ScoreBadgeProps {
  score?: number | null;
  temperature?: string | null;
  className?: string;
}

const TEMPERATURE_ICONS: Record<Temperature, typeof Flame> = {
  cold: Snowflake,
  warm: Sun,
  hot: Flame,
};

const TEMPERATURE_ICON_COLORS: Record<Temperature, string> = {
  cold: 'text-blue-500',
  warm: 'text-amber-500',
  hot: 'text-red-500',
};

function getScoreColor(score: number): string {
  if (score < 40) {
    return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 border-red-200 dark:border-red-800';
  }
  if (score <= 70) {
    return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-800';
  }
  return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 border-green-200 dark:border-green-800';
}

function normalizeTemperature(temperature?: string | null): Temperature | null {
  if (!temperature) return null;
  const normalized = temperature.toLowerCase().trim();
  if (normalized in TEMPERATURE_ICONS) {
    return normalized as Temperature;
  }
  return null;
}

export function ScoreBadge({ score, temperature, className }: ScoreBadgeProps) {
  const hasScore = typeof score === 'number' && !Number.isNaN(score);
  const tempKey = normalizeTemperature(temperature);
  const TempIcon = tempKey ? TEMPERATURE_ICONS[tempKey] : null;
  const tempIconColor = tempKey ? TEMPERATURE_ICON_COLORS[tempKey] : '';

  if (!hasScore && !tempKey) {
    return null;
  }

  return (
    <div className={cn('inline-flex items-center gap-1', className)}>
      {hasScore && (
        <span
          className={cn(
            'inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] sm:text-[10px] font-semibold leading-none',
            getScoreColor(score as number)
          )}
          title={`GOC Score: ${score}`}
        >
          GOC {score}
        </span>
      )}
      {tempKey && TempIcon && (
        <span
          className={cn('inline-flex items-center', tempIconColor)}
          title={`Temperatura: ${temperature}`}
        >
          <TempIcon className="h-3 w-3" />
        </span>
      )}
      {!hasScore && tempKey && <TemperatureDot temperature={temperature} />}
    </div>
  );
}
