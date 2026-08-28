'use client';

import { cn } from '@/utils/Utils';
import type { BaseFieldProps } from './types';

const ALIGNMENTS = [
  { value: 'top-left', icon: '┏' },
  { value: 'top-center', icon: '┳' },
  { value: 'top-right', icon: '┓' },
  { value: 'middle-left', icon: '┣' },
  { value: 'middle-center', icon: '╋' },
  { value: 'middle-right', icon: '┫' },
  { value: 'bottom-left', icon: '┗' },
  { value: 'bottom-center', icon: '┻' },
  { value: 'bottom-right', icon: '┛' },
];

/** Grid 3×3 de posición para alineación de texto/contenido. */
export default function AlignmentField({ field, value, onChange }: BaseFieldProps) {
  const current = (value as string) || (field.defaultValue as string) || 'middle-center';
  return (
    <div className="grid grid-cols-3 gap-1 w-fit">
      {ALIGNMENTS.map((a) => (
        <button
          key={a.value}
          type="button"
          onClick={() => onChange(a.value)}
          className={cn(
            'h-7 w-7 rounded border text-sm flex items-center justify-center transition-colors',
            current === a.value
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400'
              : 'border-gray-300 dark:border-gray-600 text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5',
          )}
          title={a.value}
        >
          {a.icon}
        </button>
      ))}
    </div>
  );
}
