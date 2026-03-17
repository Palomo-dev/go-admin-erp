'use client';

import { useState } from 'react';
import { Loader2, Globe, AlertCircle } from 'lucide-react';
import { cn } from '@/utils/Utils';
import type { DevicePreview } from './EditorHeader';

interface EditorPreviewProps {
  previewUrl: string | null;
  devicePreview: DevicePreview;
  refreshKey?: number;
}

const DEVICE_WIDTHS: Record<DevicePreview, string> = {
  desktop: '100%',
  tablet: '768px',
  mobile: '375px',
};

export default function EditorPreview({ previewUrl, devicePreview, refreshKey }: EditorPreviewProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const width = DEVICE_WIDTHS[devicePreview];

  if (!previewUrl) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-100 dark:bg-gray-900">
        <div className="text-center space-y-3 max-w-sm">
          <div className="mx-auto w-16 h-16 rounded-full bg-gray-200 dark:bg-gray-800 flex items-center justify-center">
            <Globe className="h-8 w-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300">
            Sin vista previa
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No se encontró un dominio configurado para esta organización.
            Configura un dominio o subdominio para ver la vista previa del sitio.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-gray-200 dark:bg-gray-800 overflow-hidden">
      {/* URL Bar */}
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-900 border-b border-gray-300 dark:border-gray-700">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-400" />
          <div className="w-3 h-3 rounded-full bg-yellow-400" />
          <div className="w-3 h-3 rounded-full bg-green-400" />
        </div>
        <div className="flex-1 flex items-center gap-2 px-3 py-1 bg-white dark:bg-gray-800 rounded-md text-xs text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
          <Globe className="h-3 w-3" />
          <span className="truncate">{previewUrl}</span>
        </div>
      </div>

      {/* Preview Container */}
      <div className="flex-1 flex items-start justify-center p-4 overflow-auto">
        <div
          className={cn(
            'bg-white shadow-2xl rounded-lg overflow-hidden transition-all duration-300 relative',
            devicePreview !== 'desktop' && 'border border-gray-300 dark:border-gray-600'
          )}
          style={{
            width,
            maxWidth: '100%',
            height: devicePreview === 'desktop' ? '100%' : '85vh',
          }}
        >
          {/* Loading Overlay */}
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white z-10">
              <div className="text-center space-y-2">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto" />
                <p className="text-sm text-gray-500">Cargando vista previa...</p>
              </div>
            </div>
          )}

          {/* Error State */}
          {hasError && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-50 z-10">
              <div className="text-center space-y-2">
                <AlertCircle className="h-8 w-8 text-orange-500 mx-auto" />
                <p className="text-sm text-gray-600">
                  No se pudo cargar la vista previa
                </p>
                <p className="text-xs text-gray-400">
                  El sitio puede no estar disponible o el dominio no está configurado
                </p>
              </div>
            </div>
          )}

          <iframe
            key={refreshKey}
            src={previewUrl}
            className="w-full h-full border-0"
            onLoad={() => {
              setIsLoading(false);
              setHasError(false);
            }}
            onError={() => {
              setIsLoading(false);
              setHasError(true);
            }}
            title="Vista previa del sitio"
            sandbox="allow-scripts allow-same-origin allow-popups"
          />
        </div>
      </div>
    </div>
  );
}
