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
import { useTranslations } from 'next-intl';

const SPACING_OPTIONS = [
  { value: 'none' },
  { value: 'xs' },
  { value: 'sm' },
  { value: 'md' },
  { value: 'lg' },
  { value: 'xl' },
];

const CAMPOS_PX = {
  padding_top: 'padding_top_px',
  padding_bottom: 'padding_bottom_px',
} as const;

function pxGuardado(content: Record<string, unknown>, key: string): number | null {
  if (!(key in CAMPOS_PX)) return null
  const n = content[CAMPOS_PX[key as keyof typeof CAMPOS_PX]]
  return typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : null
}

const FIELDS = [
  { key: 'padding_top' },
  { key: 'padding_bottom' },
  { key: 'padding_x' },
  { key: 'margin_top' },
  { key: 'margin_bottom' },
];

/**
 * Generalización de `SectionSpacingEditor`.
 * Guarda los mismos keys (`padding_top`, `padding_bottom`, etc.) para no
 * romper el JSON existente. Opción de enlazar padding vertical.
 */
export default function SpacingField({ value, onChange }: BaseFieldProps) {
  const t = useTranslations('branding.editor');
  const [isOpen, setIsOpen] = useState(false);
  // `value` es el objeto content completo de la sección, porque spacing
  // escribe en múltiples keys a la vez.
  const content = (value as Record<string, any>) || {};

  const [linked, setLinked] = useState(false);

  const escribir = (siguiente: Record<string, unknown>) => onChange(siguiente);

  const handleChange = (key: string, val: string) => {
    const pxDe = (campo: string) => (campo in CAMPOS_PX ? CAMPOS_PX[campo as keyof typeof CAMPOS_PX] : null);
    const aplicar = (base: Record<string, unknown>, campo: string, valor: string) => {
      const px = pxDe(campo);
      if (valor === 'px') {
        base[campo] = typeof base[campo] === 'string' ? base[campo] : 'none';
        if (px && base[px] == null) base[px] = 0;
        return;
      }
      base[campo] = valor;
      if (px) delete base[px];
    };
    const siguiente: Record<string, unknown> = { ...content };
    aplicar(siguiente, key, val);
    if (linked && (key === 'padding_top' || key === 'padding_bottom')) {
      const otro = key === 'padding_top' ? 'padding_bottom' : 'padding_top';
      aplicar(siguiente, otro, val);
      if (val === 'px') siguiente[CAMPOS_PX[otro]] = siguiente[CAMPOS_PX[key]];
    }
    escribir(siguiente);
  };

  const handlePx = (key: keyof typeof CAMPOS_PX, raw: string) => {
    const n = raw.trim() === '' ? 0 : Math.min(480, Math.max(0, Math.round(Number(raw))));
    if (!Number.isFinite(n)) return;
    const siguiente: Record<string, unknown> = { ...content, [CAMPOS_PX[key]]: n };
    if (linked) {
      const otro = key === 'padding_top' ? 'padding_bottom' : 'padding_top';
      siguiente[CAMPOS_PX[otro]] = n;
    }
    escribir(siguiente);
  };

  return (
    <div className="pt-2 border-t border-gray-200 dark:border-gray-700/50">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 w-full text-left"
      >
        <Layout className="h-3 w-3 text-gray-400 dark:text-gray-500" />
        <span className="text-[11px] text-gray-500 dark:text-gray-400 flex-1">{t('spacingField.espaciado')}</span>
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
            {linked ? t('spacingField.paddingVerticalEnlazado') : t('spacingField.enlazarPaddingVertical')}
          </button>

          <div className="grid grid-cols-2 gap-2">
            {FIELDS.map((f) => {
              const esVertical = f.key === 'padding_top' || f.key === 'padding_bottom';
              const enPx = esVertical && pxGuardado(content, f.key) != null;
              return (
              <div key={f.key} className={cn(f.key === 'padding_x' && 'col-span-2')}>
                <label className="text-[9px] text-gray-400 block mb-0.5 dark:text-gray-500">
                  {t(`spacingField.campos.${f.key}`)}
                </label>
                <Select
                  value={enPx ? 'px' : (content[f.key] || (f.key.startsWith('margin') ? 'none' : 'lg'))}
                  onValueChange={(v) => handleChange(f.key, v)}
                >
                  <SelectTrigger className="h-6 text-[10px]" aria-label={t(`spacingField.campos.${f.key}`)}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SPACING_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value} className="text-[11px]">
                        {t(`spacingField.opciones.${o.value}`)}
                      </SelectItem>
                    ))}
                    {esVertical && (
                      <SelectItem value="px" className="text-[11px]">{t('spacingField.opciones.px')}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
                {enPx && (
                  <input
                    type="number"
                    min={0}
                    max={480}
                    aria-label={`${t(`spacingField.campos.${f.key}`)} px`}
                    className="mt-1 h-6 w-full rounded border border-gray-200 px-1 text-[10px] dark:border-gray-700 dark:bg-gray-900"
                    value={String(pxGuardado(content, f.key) ?? 0)}
                    onChange={(e) => handlePx(f.key as keyof typeof CAMPOS_PX, e.target.value)}
                  />
                )}
              </div>
            )})}
          </div>
        </div>
      )}
    </div>
  );
}
