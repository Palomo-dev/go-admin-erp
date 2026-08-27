'use client';

import { Textarea } from '@/components/ui/textarea';
import type { BaseFieldProps } from './types';
import { TEXTAREA_CLASS } from './types';

/** Control de texto multilínea. */
export default function TextareaField({ field, value, onChange }: BaseFieldProps) {
  return (
    <Textarea
      value={(value as string) || ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.placeholder}
      rows={2}
      className={TEXTAREA_CLASS}
    />
  );
}
