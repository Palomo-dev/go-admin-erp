'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { ImagePlus, X } from 'lucide-react';
import ImagePickerDialog from '@/components/common/ImagePickerDialog';

interface PageSEOPanelProps {
  metaTitle: string;
  metaDescription: string;
  ogImageUrl: string;
  onUpdate: (updates: { meta_title?: string; meta_description?: string; og_image_url?: string }) => void;
}

export default function PageSEOPanel({
  metaTitle,
  metaDescription,
  ogImageUrl,
  onUpdate,
}: PageSEOPanelProps) {
  const titleLength = metaTitle.length;
  const descLength = metaDescription.length;
  const [showImagePicker, setShowImagePicker] = useState(false);

  return (
    <div className="space-y-4">
      {/* Meta Title */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-gray-500 dark:text-gray-400">Meta Title</Label>
          <span className={`text-[10px] ${titleLength > 60 ? 'text-red-500' : 'text-gray-400'}`}>
            {titleLength}/60
          </span>
        </div>
        <Input
          value={metaTitle}
          onChange={(e) => onUpdate({ meta_title: e.target.value })}
          placeholder="Título para buscadores"
          className="h-8 text-xs dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          maxLength={70}
        />
      </div>

      {/* Meta Description */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-gray-500 dark:text-gray-400">Meta Description</Label>
          <span className={`text-[10px] ${descLength > 160 ? 'text-red-500' : 'text-gray-400'}`}>
            {descLength}/160
          </span>
        </div>
        <Textarea
          value={metaDescription}
          onChange={(e) => onUpdate({ meta_description: e.target.value })}
          placeholder="Descripción para buscadores..."
          rows={2}
          className="text-xs resize-none dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          maxLength={200}
        />
      </div>

      {/* OG Image */}
      <div className="space-y-1.5">
        <Label className="text-xs text-gray-500 dark:text-gray-400">Imagen OG (Redes Sociales)</Label>
        {ogImageUrl ? (
          <div className="relative group">
            <img
              src={ogImageUrl}
              alt="OG Preview"
              className="w-full h-20 object-cover rounded border dark:border-gray-600 cursor-pointer"
              onClick={() => setShowImagePicker(true)}
            />
            <button
              onClick={() => onUpdate({ og_image_url: '' })}
              className="absolute top-1 right-1 p-0.5 rounded bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowImagePicker(true)}
            className="w-full h-20 border-dashed border-gray-300 dark:border-gray-600 text-gray-400 dark:text-gray-500 hover:border-blue-400 hover:text-blue-500 dark:hover:border-blue-500 dark:hover:text-blue-400 bg-transparent"
          >
            <div className="flex flex-col items-center gap-1">
              <ImagePlus className="h-5 w-5" />
              <span className="text-[10px]">Seleccionar imagen (1200x630px)</span>
            </div>
          </Button>
        )}
      </div>

      <ImagePickerDialog
        open={showImagePicker}
        onOpenChange={setShowImagePicker}
        onSelect={(url) => onUpdate({ og_image_url: url })}
      />

      {/* Mini Google Preview */}
      <div className="p-2 bg-gray-50 dark:bg-gray-700/50 rounded text-[10px] space-y-0.5">
        <p className="text-gray-400 dark:text-gray-500 mb-1">Vista previa en Google:</p>
        <p className="text-blue-600 dark:text-blue-400 truncate">
          {metaTitle || 'Título de la página'}
        </p>
        <p className="text-gray-500 dark:text-gray-400 line-clamp-2">
          {metaDescription || 'Descripción de la página...'}
        </p>
      </div>
    </div>
  );
}

