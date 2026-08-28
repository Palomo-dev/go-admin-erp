'use client';

import { useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import ImagePickerDialog from '@/components/common/ImagePickerDialog';
import type { BaseFieldProps } from './types';

/** Selector de imagen con `ImagePickerDialog` (extraído de `ImageFieldPicker`). */
export default function ImageField({ value, onChange }: BaseFieldProps) {
  const t = useTranslations('branding.editor.sidebar');
  const [showPicker, setShowPicker] = useState(false);
  const url = (value as string) || '';

  return (
    <>
      {url ? (
        <div className="relative group rounded-md overflow-hidden border border-gray-300 dark:border-gray-600">
          <img
            src={url}
            alt={t('imageAlt')}
            className="w-full h-20 object-cover cursor-pointer"
            onClick={() => setShowPicker(true)}
          />
          <button
            onClick={() => onChange('')}
            className="absolute top-1 right-1 p-0.5 rounded bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowPicker(true)}
          className="w-full h-16 flex flex-col items-center justify-center gap-1 rounded-md border border-dashed border-gray-300 dark:border-gray-600 text-gray-400 dark:text-gray-500 hover:border-blue-400 hover:text-blue-500 dark:hover:border-blue-500 dark:hover:text-blue-400 transition-colors bg-white dark:bg-white/5"
        >
          <ImagePlus className="h-4 w-4" />
          <span className="text-[10px]">{t('selectImage')}</span>
        </button>
      )}
      <ImagePickerDialog
        open={showPicker}
        onOpenChange={setShowPicker}
        onSelect={onChange}
      />
    </>
  );
}
