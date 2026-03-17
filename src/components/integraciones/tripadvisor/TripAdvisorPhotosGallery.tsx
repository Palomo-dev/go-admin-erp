'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Camera, ExternalLink, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TripAdvisorPhoto } from '@/lib/services/integrations/tripadvisor/tripadvisorTypes';

interface TripAdvisorPhotosGalleryProps {
  locationId: string;
  locationName?: string;
  className?: string;
}

/**
 * TripAdvisorPhotosGallery — Galería de fotos de TripAdvisor (hasta 5).
 * Muestra thumbnails con lightbox al hacer clic.
 */
export function TripAdvisorPhotosGallery({
  locationId,
  locationName,
  className,
}: TripAdvisorPhotosGalleryProps) {
  const [photos, setPhotos] = useState<TripAdvisorPhoto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!locationId) return;
    let cancelled = false;

    const fetchPhotos = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/integrations/tripadvisor/photos?locationId=${locationId}&language=es_CO`,
        );
        const result = await res.json();
        if (!cancelled) {
          if (res.ok && result.data) {
            setPhotos(result.data);
          } else {
            setError(result.error || 'Error cargando fotos');
          }
        }
      } catch {
        if (!cancelled) setError('Error de red al cargar fotos');
      }
      if (!cancelled) setIsLoading(false);
    };

    fetchPhotos();
    return () => { cancelled = true; };
  }, [locationId]);

  const openLightbox = (index: number) => setLightboxIndex(index);
  const closeLightbox = () => setLightboxIndex(null);

  const goNext = () => {
    if (lightboxIndex !== null && lightboxIndex < photos.length - 1) {
      setLightboxIndex(lightboxIndex + 1);
    }
  };

  const goPrev = () => {
    if (lightboxIndex !== null && lightboxIndex > 0) {
      setLightboxIndex(lightboxIndex - 1);
    }
  };

  return (
    <>
      <Card className={cn('overflow-hidden', className)}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Camera className="h-4 w-4 text-[#00AA6C]" />
              Fotos de TripAdvisor
            </CardTitle>
            {photos.length > 0 && (
              <Badge variant="outline" className="text-xs">
                {photos.length} foto{photos.length !== 1 ? 's' : ''}
              </Badge>
            )}
          </div>
          {locationName && (
            <p className="text-sm text-gray-500 dark:text-gray-400">{locationName}</p>
          )}
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
              <span className="ml-2 text-sm text-gray-500">Cargando fotos...</span>
            </div>
          ) : error ? (
            <div className="text-center py-6 text-sm text-red-500 dark:text-red-400">
              {error}
            </div>
          ) : photos.length === 0 ? (
            <div className="text-center py-6 text-sm text-gray-500">
              No hay fotos disponibles
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
              {photos.map((photo, index) => {
                const thumbUrl =
                  photo.images?.medium?.url ||
                  photo.images?.small?.url ||
                  photo.images?.thumbnail?.url;

                if (!thumbUrl) return null;

                return (
                  <button
                    key={photo.id}
                    onClick={() => openLightbox(index)}
                    className="group relative aspect-square rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 hover:ring-2 hover:ring-[#00AA6C] dark:hover:ring-[#84E9BD] transition-all focus:outline-none focus:ring-2 focus:ring-[#00AA6C]"
                  >
                    <img
                      src={thumbUrl}
                      alt={photo.caption || `Foto ${index + 1}`}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    />
                    {/* Overlay al hover */}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                    {photo.caption && (
                      <div className="absolute bottom-0 left-0 right-0 p-1.5 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                        <p className="text-[10px] text-white truncate">{photo.caption}</p>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Atribución */}
          {photos.length > 0 && (
            <div className="pt-3 mt-3 border-t border-gray-100 dark:border-gray-800 flex items-center gap-2">
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" className="shrink-0">
                <circle cx="12" cy="12" r="12" className="fill-[#00AA6C] dark:fill-[#84E9BD]" />
                <circle cx="8.5" cy="12" r="3" fill="white" />
                <circle cx="8.5" cy="12" r="1.5" className="fill-[#00AA6C] dark:fill-[#84E9BD]" />
                <circle cx="15.5" cy="12" r="3" fill="white" />
                <circle cx="15.5" cy="12" r="1.5" className="fill-[#00AA6C] dark:fill-[#84E9BD]" />
              </svg>
              <span className="text-xs text-gray-400 dark:text-gray-500">
                Fotos proporcionadas por Tripadvisor
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lightbox */}
      {lightboxIndex !== null && photos[lightboxIndex] && (
        <Lightbox
          photos={photos}
          currentIndex={lightboxIndex}
          onClose={closeLightbox}
          onNext={goNext}
          onPrev={goPrev}
        />
      )}
    </>
  );
}

/** Lightbox de fotos a pantalla completa */
function Lightbox({
  photos,
  currentIndex,
  onClose,
  onNext,
  onPrev,
}: {
  photos: TripAdvisorPhoto[];
  currentIndex: number;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
}) {
  const photo = photos[currentIndex];
  const largeUrl =
    photo.images?.large?.url ||
    photo.images?.original?.url ||
    photo.images?.medium?.url ||
    '';

  // Cerrar con Escape, navegar con flechas
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') onNext();
      if (e.key === 'ArrowLeft') onPrev();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, onNext, onPrev]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Botón cerrar */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-10"
        aria-label="Cerrar"
      >
        <X className="h-5 w-5" />
      </button>

      {/* Navegación previa */}
      {currentIndex > 0 && (
        <button
          onClick={(e) => { e.stopPropagation(); onPrev(); }}
          className="absolute left-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-10"
          aria-label="Anterior"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}

      {/* Imagen */}
      <div
        className="max-w-[90vw] max-h-[85vh] flex flex-col items-center gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={largeUrl}
          alt={photo.caption || `Foto ${currentIndex + 1}`}
          className="max-w-full max-h-[75vh] object-contain rounded-lg"
        />
        {/* Info */}
        <div className="text-center space-y-1">
          {photo.caption && (
            <p className="text-sm text-white">{photo.caption}</p>
          )}
          <p className="text-xs text-gray-400">
            {currentIndex + 1} de {photos.length}
            {photo.source?.localized_name && ` · ${photo.source.localized_name}`}
            {photo.user?.username && ` · @${photo.user.username}`}
          </p>
        </div>
      </div>

      {/* Navegación siguiente */}
      {currentIndex < photos.length - 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); onNext(); }}
          className="absolute right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-10"
          aria-label="Siguiente"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      )}
    </div>
  );
}

export default TripAdvisorPhotosGallery;
