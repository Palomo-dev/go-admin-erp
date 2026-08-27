'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Layout, Link2, Link2Off } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/utils/Utils';
import type { BaseFieldProps } from './types';

const SPACING_OPTIONS = [
  { value: 'none', label: 'Ninguno' },
  { value: 'xs', label: 'Muy poco' },
  { value: 'sm', label: 'Pequeño' },
  { value: 'md', label: 'Mediano' },
  { value: 'lg', label: 'Grande' },
  { value: 'xl', label: 'Muy grande' },
];

const FIELDS = [
  { key: 'padding_top', label: 'Padding arriba' },
  { key: 'padding_bottom', label: 'Padding abajo' },
  { key: 'padding_x', label: 'Padding horizontal' },
  { key: 'margin_top', label: 'Margen arriba' },
  { key: 'margin_bottom', label: 'Margen abajo' },
];

/**
 * Generalización de `SectionSpacingEditor`.
 * Guarda los mismos keys (`padding_top`, `padding_bottom`, etc.) para no
 * romper el JSON existente. Opción de enlazar padding vertical.
 */
export default function SpacingField({ value, onChange }: BaseFieldProps) {
  const [isOpen, setIsOpen] = useState(false);
  // `value` es el objeto content completo de la sección, porque spacing
  // escribe en múltiples keys a la vez.
  const content = (value as Record<string, any>) || {};

  const [linked, setLinked] = useState(false);

  const handleChange = (key: string, val: string) => {
    const updates: Record<string, string> = { [key]: val };
    if (linked && key === 'padding_top') updates.padding_bottom = val;
    if (linked && key === 'padding_bottom') updates.padding_top = val;
    onChange({ ...content, ...updates });
  };

  return (
    <div className="pt-2 border-t border-gray-200 dark:border-gray-700/50">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 w-full text-left"
      >
        <Layout className="h-3 w-3 text-gray-400 dark:text-gray-500" />
        <span className="text-[11px] text-gray-500 dark:text-gray-400 flex-1">Espaciado</span>
        {isOpen ? (
          <ChevronUp className="h-3 w-3 text-gray-400 dark:text-gray-500" />
        ) : (
          <ChevronDown className="h-3 w-3 text-gray-400 dark:text-gray-500" />
        )}
      </button>

      {isOpen && (
        <div className="space-y-2 mt-2">
          <button
            type="button"
            onClick={() => setLinked(!linked)}
            className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
          >
            {linked ? <Link2 className="h-3 w-3" /> : <Link2Off className="h-3 w-3" />}
            {linked ? 'Padding vertical enlazado' : 'Enlazar padding vertical'}
          </button>

          <div className="grid grid-cols-2 gap-2">
            {FIELDS.map((f) => (
              <div key={f.key} className={cn(f.key === 'padding_x' && 'col-span-2')}>
                <label className="text-[9px] text-gray-400 block mb-0.5 dark:text-gray-500">
                  {f.label}
                </label>
                <Select
                  value={content[f.key] || 'lg'}
                  onValueChange={(v) => handleChange(f.key, v)}
                >
                  <SelectTrigger className="h-6 text-[10px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SPACING_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value} className="text-[11px]">
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
