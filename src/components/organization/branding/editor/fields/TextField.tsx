'use client';

import { Input } from '@/components/ui/input';
import type { BaseFieldProps } from './types';
import { INPUT_CLASS } from './types';

/** Control de texto de una línea. */
export default function TextField({ field, value, onChange }: BaseFieldProps) {
  return (
    <Input
      value={(value as string) || ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.placeholder}
      className={INPUT_CLASS}
    />
  );
}
