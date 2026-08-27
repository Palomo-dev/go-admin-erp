'use client';

import { Input } from '@/components/ui/input';
import type { BaseFieldProps } from './types';
import { INPUT_CLASS } from './types';

/** Control de URL. */
export default function UrlField({ field, value, onChange }: BaseFieldProps) {
  return (
    <Input
      type="url"
      value={(value as string) || ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.placeholder || 'https://...'}
      className={INPUT_CLASS}
    />
  );
}
