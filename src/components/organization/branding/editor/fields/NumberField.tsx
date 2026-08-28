'use client';

import { Input } from '@/components/ui/input';
import type { BaseFieldProps } from './types';
import { INPUT_CLASS } from './types';

/** Control numérico. */
export default function NumberField({ field, value, onChange }: BaseFieldProps) {
  return (
    <Input
      type="number"
      min={field.min}
      max={field.max}
      value={(value as number) ?? ''}
      onChange={(e) =>
        onChange(e.target.value ? Number(e.target.value) : undefined)
      }
      placeholder={field.placeholder}
      className={INPUT_CLASS}
    />
  );
}
