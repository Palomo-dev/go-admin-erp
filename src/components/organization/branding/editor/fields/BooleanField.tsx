'use client';

import { Switch } from '@/components/ui/switch';
import type { BaseFieldProps } from './types';

/** Control booleano (switch). */
export default function BooleanField({ field, value, onChange }: BaseFieldProps) {
  return (
    <div className="flex items-center justify-end">
      <Switch
        checked={(value as boolean) ?? (field.defaultValue as boolean) ?? false}
        onCheckedChange={(checked) => onChange(checked)}
      />
    </div>
  );
}
