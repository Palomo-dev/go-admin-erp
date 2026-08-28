'use client';

import { useState } from 'react';
import { Check, Eye, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/utils/Utils';
import type { BaseFieldProps, ThemePalette } from './types';

interface ColorFieldProps extends BaseFieldProps {
  themePalette?: ThemePalette;
}

const SWATCHES = [
  '#FFFFFF', '#000000', '#F8FAFC', '#E2E8F0', '#94A3B8',
  '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899', '#F59E0B',
  '#10B981', '#22C55E', '#EF4444', '#F97316', '#06B6D4',
];

/** Selector de color con swatch, hex, paleta del tema y transparente. */
export default function ColorField({ value, onChange, themePalette }: ColorFieldProps) {
  const [open, setOpen] = useState(false);
  const current = (value as string) || '';
  const isTransparent = current === 'transparent';

  const themeSwatches = themePalette
    ? [
        { label: 'Primario', color: themePalette.primary },
        { label: 'Secundario', color: themePalette.secondary },
        { label: 'Acento', color: themePalette.accent },
        { label: 'Fondo', color: themePalette.background },
        { label: 'Texto', color: themePalette.text },
      ].filter((s) => s.color)
    : [];

  return (
    <div className="flex items-center gap-2">
      {/* Swatch / trigger */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              'h-8 w-8 shrink-0 rounded-md border border-gray-300 dark:border-gray-600 flex items-center justify-center overflow-hidden',
              isTransparent && 'bg-[linear-gradient(45deg,#ccc_25%,transparent_25%,transparent_75%,#ccc_75%)] bg-[length:8px_8px]',
            )}
            style={!isTransparent && current ? { backgroundColor: current } : undefined}
            title={current || 'Sin color'}
          >
            {!current && <Plus className="h-3 w-3 text-gray-400" />}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-2 space-y-2" align="start">
          {/* Heredar del tema */}
          {themeSwatches.length > 0 && (
            <div>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 mb-1">Tema</p>
              <div className="flex flex-wrap gap-1">
                {themeSwatches.map((s) => (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() => {
                      onChange(s.color);
                      setOpen(false);
                    }}
                    className="h-6 w-6 rounded border border-gray-200 dark:border-gray-600 hover:ring-2 hover:ring-blue-400"
                    style={{ backgroundColor: s.color }}
                    title={s.label}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Paleta fija */}
          <div>
            <p className="text-[10px] text-gray-500 dark:text-gray-400 mb-1">Paleta</p>
            <div className="grid grid-cols-8 gap-1">
              {SWATCHES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    onChange(c);
                    setOpen(false);
                  }}
                  className="h-5 w-5 rounded border border-gray-200 dark:border-gray-600 hover:ring-2 hover:ring-blue-400 relative"
                  style={{ backgroundColor: c }}
                >
                  {current.toLowerCase() === c.toLowerCase() && (
                    <Check className="h-3 w-3 absolute inset-0 m-auto text-white mix-blend-difference" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Transparente */}
          <button
            type="button"
            onClick={() => {
              onChange('transparent');
              setOpen(false);
            }}
            className="flex items-center gap-1.5 w-full text-[11px] text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5 rounded px-1 py-1"
          >
            <Eye className="h-3 w-3" /> Transparente
          </button>
        </PopoverContent>
      </Popover>

      {/* Hex input */}
      <Input
        value={current}
        onChange={(e) => onChange(e.target.value)}
        placeholder="#000000 o transparent"
        className="h-8 text-xs bg-white dark:bg-white/5 border-gray-300 dark:border-gray-600 text-gray-800 dark:text-white"
      />
    </div>
  );
}
