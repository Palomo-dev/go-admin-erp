'use client';

import React, { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ImagePlus, Star, Trash2, MoreVertical, Loader2, ChevronLeft, ChevronRight, X,
  GripVertical, Image as ImageIcon,
} from 'lucide-react';
import { cn } from '@/utils/Utils';
import spaceImageService, { SpaceImage } from '@/lib/services/spaceImageService';

interface SpaceImageGalleryProps {
  images: SpaceImage[];
  isLoading: boolean;
  spaceId: string;
  organizationId: number;
  userId: string;
  onImagesChange: () => void;
}

export function SpaceImageGallery({
  images, isLoading, spaceId, organizationId, userId, onImagesChange,
}: SpaceImageGalleryProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // ─── Upload ────────────────────────────────────────────────────────────────
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    let uploadedCount = 0;

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.type.startsWith('image/')) continue;
        if (file.size > 5 * 1024 * 1024) continue; // max 5MB

        await spaceImageService.uploadImage(file, spaceId, organizationId, userId);
        uploadedCount++;
      }
    } catch (err: any) {
      console.error('Error uploading:', err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (uploadedCount > 0) onImagesChange();
    }
  }, [spaceId, organizationId, userId, onImagesChange]);

  // ─── Acciones ──────────────────────────────────────────────────────────────
  const handleSetPrimary = async (img: SpaceImage) => {
    setActionLoading(img.id);
    const ok = await spaceImageService.setPrimary(img.id, spaceId);
    setActionLoading(null);
    if (ok) onImagesChange();
  };

  const handleDelete = async (img: SpaceImage) => {
    setActionLoading(img.id);
    const ok = await spaceImageService.deleteImage(img.id);
    setActionLoading(null);
    if (ok) onImagesChange();
  };

  // ─── Lightbox ──────────────────────────────────────────────────────────────
  const openLightbox = (idx: number) => {
    setLightboxIndex(idx);
    setLightboxOpen(true);
  };

  const nextImage = () => setLightboxIndex((i) => (i + 1) % images.length);
  const prevImage = () => setLightboxIndex((i) => (i - 1 + images.length) % images.length);

  // ─── Loading state ─────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="h-5 w-24" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            Galería de Imágenes
          </h3>
          {images.length > 0 && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {images.length}
            </Badge>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="h-7 text-xs border-gray-300 dark:border-gray-600"
        >
          {uploading
            ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Subiendo...</>
            : <><ImagePlus className="h-3 w-3 mr-1" /> Subir</>
          }
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>

      {/* Empty state */}
      {images.length === 0 && (
        <div
          className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg p-6 text-center cursor-pointer hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
          onClick={() => fileInputRef.current?.click()}
        >
          <ImageIcon className="h-8 w-8 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Haz clic o arrastra imágenes aquí
          </p>
          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
            JPG, PNG, WebP · Máx 5MB · Hasta 10 imágenes
          </p>
        </div>
      )}

      {/* Grid de imágenes */}
      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {images.map((img, idx) => (
            <div
              key={img.id}
              className={cn(
                'relative group aspect-square rounded-lg overflow-hidden border',
                'border-gray-200 dark:border-gray-700',
                img.is_primary && 'ring-2 ring-blue-500 dark:ring-blue-400'
              )}
            >
              {/* Imagen */}
              <img
                src={img.image_url}
                alt={img.alt_text || 'Imagen del espacio'}
                className="w-full h-full object-cover cursor-pointer"
                onClick={() => openLightbox(idx)}
                loading="lazy"
              />

              {/* Badge principal */}
              {img.is_primary && (
                <div className="absolute top-1 left-1">
                  <Badge className="bg-blue-600 text-white text-[9px] px-1 py-0 gap-0.5">
                    <Star className="h-2.5 w-2.5" /> Portada
                  </Badge>
                </div>
              )}

              {/* Overlay con acciones */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-end justify-end p-1 opacity-0 group-hover:opacity-100">
                {actionLoading === img.id ? (
                  <Loader2 className="h-4 w-4 text-white animate-spin" />
                ) : (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-6 w-6 bg-black/40 hover:bg-black/60 text-white">
                        <MoreVertical className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="dark:bg-gray-800 dark:border-gray-700">
                      {!img.is_primary && (
                        <DropdownMenuItem onClick={() => handleSetPrimary(img)} className="gap-2 text-xs">
                          <Star className="h-3.5 w-3.5" /> Hacer portada
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => handleDelete(img)} className="gap-2 text-xs text-red-600 dark:text-red-400">
                        <Trash2 className="h-3.5 w-3.5" /> Eliminar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="max-w-4xl p-0 bg-black border-none overflow-hidden">
          {images.length > 0 && (
            <div className="relative">
              <img
                src={images[lightboxIndex]?.image_url}
                alt={images[lightboxIndex]?.alt_text || 'Imagen del espacio'}
                className="w-full max-h-[80vh] object-contain"
              />

              {/* Cerrar */}
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2 h-8 w-8 bg-black/50 hover:bg-black/70 text-white"
                onClick={() => setLightboxOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>

              {/* Navegación */}
              {images.length > 1 && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute left-2 top-1/2 -translate-y-1/2 h-10 w-10 bg-black/50 hover:bg-black/70 text-white"
                    onClick={prevImage}
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 bg-black/50 hover:bg-black/70 text-white"
                    onClick={nextImage}
                  >
                    <ChevronRight className="h-5 w-5" />
                  </Button>
                </>
              )}

              {/* Contador */}
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/60 text-white text-xs px-3 py-1 rounded-full">
                {lightboxIndex + 1} / {images.length}
                {images[lightboxIndex]?.is_primary && (
                  <span className="ml-1.5 text-blue-300">★ Portada</span>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
