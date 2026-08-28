'use client';

import { Slider } from '@/components/ui/slider';
import type { BaseFieldProps } from './types';

/** Control slider/range. */
export default function RangeField({ field, value, onChange }: BaseFieldProps) {
  const current = Number(value ?? field.defaultValue ?? 0);
  return (
    <div className="flex items-center gap-2">
      <Slider
        value={[current]}
        onValueChange={([val]) => onChange(val)}
        min={field.min ?? 0}
        max={field.max ?? 100}
        step={field.step ?? 1}
        className="flex-1"
      />
      <span className="text-xs text-gray-500 dark:text-gray-400 min-w-[40px] text-right">
        {current}
        {field.suffix || ''}
      </span>
    </div>
  );
}
