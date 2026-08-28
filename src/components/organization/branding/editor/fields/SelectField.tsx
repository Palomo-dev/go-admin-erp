'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { BaseFieldProps } from './types';

/** Control select con shadcn/ui. */
export default function SelectField({ field, value, onChange }: BaseFieldProps) {
  const options = field.options || [];
  return (
    <Select
      value={(value as string) || options[0]?.value || ''}
      onValueChange={onChange}
    >
      <SelectTrigger className="h-8 text-xs bg-white dark:bg-white/5 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-white">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
